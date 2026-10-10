import "server-only";
import { randomBytes } from "node:crypto";
import { isActiveAdmin } from "../db-utils";
import { AppError, conflit, introuvable, invalide } from "../errors";
import { SHEETS, SHEET_LABEL, type AnyRow, type Db, type SheetName } from "../schema";
import { bucket } from "../store/bucket";
import { exclusive, readDb, readWorkbookBuffer, transaction, type Actor } from "../storage";
import { encodeWorkbook } from "../workbook";
import { MEDIA_NAME, mediaKey } from "./media";

const BACKUP_ID = /^manuel-\d{8}-\d{6}-[a-f0-9]{4}$/;
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
/** Feuilles conservées lors d'une restauration : l'activité passée n'est jamais remplacée. */
const KEPT: SheetName[] = ["HistoriqueActions", "Commandes", "LignesCommande", "OperationsIdempotentes", "SessionsPersonnel"];
const SUMMARY: SheetName[] = ["Produits", "Categories", "Medias", "Utilisateurs", "Zones", "Tables"];

export interface BackupManifest {
  id: string;
  creeLe: string;
  auteur: string;
  note: string;
  revision: number;
  demo: boolean;
  tailleOctets: number;
  medias: number;
  lignes: Record<string, number>;
}

/** Prefixe d'une sauvegarde dans le depot de fichiers. */
function dirOf(id: string): string {
  if (!BACKUP_ID.test(id)) throw invalide("Identifiant de sauvegarde invalide.");
  return `backups/${id}`;
}

export const backupWorkbookKey = (id: string) => `${dirOf(id)}/oliva.xlsx`;
const manifestKey = (id: string) => `${dirOf(id)}/manifeste.json`;
const backupMediaKey = (id: string, f: string) => `${dirOf(id)}/media/${f}`;

const count = (db: Db) => Object.fromEntries(SUMMARY.map((s) => [SHEET_LABEL[s], db[s].length]));

/** Copie cohérente du classeur et des images, prise sous le verrou d'écriture. */
export async function createBackup(actor: Actor, note = ""): Promise<BackupManifest> {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const id = `manuel-${stamp}-${randomBytes(2).toString("hex")}`;
  const depot = bucket();
  try {
    const manifest = await exclusive(async (db) => {
      // Le classeur est reecrit depuis l'etat fige sous verrou : meme contenu, quel que soit le stockage.
      const buf = await encodeWorkbook(db);
      await depot.put(backupWorkbookKey(id), buf, { ecraser: true, typeMime: XLSX_MIME });
      let medias = 0;
      for (const e of await depot.list("media").catch(() => [])) {
        const f = e.cle.slice("media/".length);
        if (!MEDIA_NAME.test(f)) continue;
        await depot.copy(mediaKey(f), backupMediaKey(id, f));
        medias++;
      }
      const m: BackupManifest = { id, creeLe: new Date().toISOString(), auteur: actor.nom, note: note.slice(0, 80), revision: db._meta.revision, demo: db._meta.donneesDemo, tailleOctets: buf.length, medias, lignes: count(db) };
      await depot.put(manifestKey(id), Buffer.from(JSON.stringify(m, null, 2)), { ecraser: true, typeMime: "application/json" });
      return m;
    });
    await transaction({ actor }, (_db, tx) => {
      tx.log({ action: "sauvegarde", libelle: "Sauvegarde créée", entite: "", entiteNom: id, resultat: "Terminé" });
    });
    return manifest;
  } catch (e) {
    await removeBackupFiles(id).catch(() => undefined);
    if (e instanceof AppError) throw e;
    throw new AppError("stockage", "La sauvegarde n'a pas pu être écrite sur le disque.", { cause: e });
  }
}

export async function listBackups(): Promise<{ manuelles: BackupManifest[]; automatiques: number; derniereAuto: string }> {
  const depot = bucket();
  const manuelles: BackupManifest[] = [];
  for (const id of await backupIds()) {
    const brut = await depot.get(manifestKey(id)).catch(() => null);
    if (!brut) continue;
    try {
      manuelles.push(JSON.parse(brut.toString("utf8")) as BackupManifest);
    } catch {
      /* sauvegarde incomplete : ignoree */
    }
  }
  manuelles.sort((a, b) => b.creeLe.localeCompare(a.creeLe));
  const auto = (await depot.list("backups/auto").catch(() => [])).filter((f) => f.cle.endsWith(".xlsx")).sort((a, b) => a.cle.localeCompare(b.cle));
  const derniereAuto = auto.length ? new Date(auto[auto.length - 1].dateMs).toISOString() : "";
  return { manuelles, automatiques: auto.length, derniereAuto };
}

/** Identifiants des sauvegardes manuelles presentes dans le depot. */
async function backupIds(): Promise<string[]> {
  const noms = await sousDossiers();
  return noms.filter((n) => BACKUP_ID.test(n));
}

/** Sous-dossiers de `backups` : le depot ne liste que des fichiers, pas des dossiers. */
async function sousDossiers(): Promise<string[]> {
  if (bucket().nom === "disque") {
    const fsp = await import("node:fs/promises");
    const path = await import("node:path");
    const { storageRoot } = await import("../env");
    const entrees = await fsp.readdir(path.join(storageRoot(), "backups"), { withFileTypes: true }).catch(() => []);
    return entrees.filter((e) => e.isDirectory()).map((e) => e.name);
  }
  const { list } = await import("@vercel/blob");
  const page = await list({ prefix: "backups/", mode: "folded", limit: 1000 });
  return (page.folders ?? []).map((f) => f.slice("backups/".length).replace(/\/$/, ""));
}

async function load(id: string) {
  const depot = bucket();
  const buf = await depot.get(backupWorkbookKey(id));
  if (!buf) throw introuvable("Sauvegarde introuvable.");
  const db = await readWorkbookBuffer(buf);
  const available = new Set((await depot.list(`${dirOf(id)}/media`).catch(() => [])).map((e) => e.cle.split("/").pop()!));
  const missing = db.Medias.filter((m) => !available.has(m.fichier)).length;
  return { db, missing };
}

/** Efface tous les fichiers d'une sauvegarde. */
async function removeBackupFiles(id: string): Promise<void> {
  await bucket().removeAll(dirOf(id));
}

/** Vérifie une sauvegarde et décrit ce que sa restauration changerait. N'écrit rien. */
export async function previewRestore(id: string, current: Db) {
  const { db, missing } = await load(id);
  const admins = db.Utilisateurs.filter(isActiveAdmin).length;
  const blocages: string[] = [];
  if (admins === 0) blocages.push("Cette sauvegarde ne contient aucun administrateur actif.");
  if (missing > 0) blocages.push(`${missing} image(s) référencée(s) manquent dans la sauvegarde.`);
  if (current.SessionsTable.some((s) => s.statut === "ouverte")) blocages.push("Des sessions de table sont ouvertes : fermez-les avant de restaurer.");
  return {
    id,
    revision: db._meta.revision,
    comparaison: SUMMARY.map((s) => ({ element: SHEET_LABEL[s], actuel: current[s].length, sauvegarde: db[s].length })),
    conserve: ["Historique des actions", "Commandes déjà enregistrées", "Sessions du personnel encore valides"],
    blocages,
  };
}

/** Restaure la configuration d'une sauvegarde. Une sauvegarde de sécurité de l'état actuel est créée avant. */
export async function restoreBackup(actor: Actor, id: string) {
  const { db: source, missing } = await load(id);
  if (missing > 0) throw conflit("Restauration refusée : des images manquent dans cette sauvegarde.");
  if (!source.Utilisateurs.some(isActiveAdmin)) throw conflit("Restauration refusée : cette sauvegarde ne contient aucun administrateur actif.");
  // Tous les refus sont prononcés avant de toucher au disque : pas de sauvegarde de sécurité inutile.
  if ((await readDb()).SessionsTable.some((x) => x.statut === "ouverte")) throw conflit("Des sessions de table sont ouvertes : fermez-les avant de restaurer.");

  const safety = await createBackup(actor, "Avant restauration");

  const depot = bucket();
  const deja = new Set((await depot.list("media").catch(() => [])).map((e) => e.cle.slice("media/".length)));
  for (const e of await depot.list(`${dirOf(id)}/media`).catch(() => [])) {
    const f = e.cle.split("/").pop()!;
    if (!MEDIA_NAME.test(f) || deja.has(f)) continue;
    await depot.copy(e.cle, mediaKey(f)).catch((cause) => {
      throw new AppError("stockage", "Une image de la sauvegarde n'a pas pu être recopiée.", { cause });
    });
  }

  await transaction({ actor }, (db, tx) => {
    if (db.SessionsTable.some((s) => s.statut === "ouverte")) throw conflit("Des sessions de table sont ouvertes : fermez-les avant de restaurer.");
    const target = db as unknown as Record<SheetName, AnyRow[]>;
    const from = source as unknown as Record<SheetName, AnyRow[]>;
    for (const s of SHEETS) if (!KEPT.includes(s)) target[s] = structuredClone(from[s]);
    const users = new Set(db.Utilisateurs.filter((u) => u.statut === "actif").map((u) => u.id));
    db.SessionsPersonnel = db.SessionsPersonnel.filter((s) => users.has(s.utilisateurId));
    // Les sessions de table et paniers de la sauvegarde ne sont pas rouverts.
    db.SessionsTable = [];
    db.Participants = [];
    db.Paniers = [];
    db.LignesPanier = [];
    db._meta.donneesDemo = source._meta.donneesDemo;
    tx.log({ action: "restauration", libelle: "Sauvegarde restaurée", entite: "", entiteNom: id, apres: { sauvegardeDeSecurite: safety.id } });
    tx.publish("publication");
  });
  return { id, securite: safety.id };
}

export async function deleteBackup(actor: Actor, id: string) {
  if (!(await bucket().get(manifestKey(id)))) throw introuvable("Sauvegarde introuvable.");
  await removeBackupFiles(id);
  await transaction({ actor }, (_db, tx) => {
    tx.log({ action: "sauvegarde", libelle: "Sauvegarde supprimée", entite: "", entiteNom: id });
  });
  return { id };
}
