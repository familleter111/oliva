import "server-only";
import { randomBytes } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import { isActiveAdmin } from "../db-utils";
import { ensureDir, paths } from "../env";
import { AppError, conflit, introuvable, invalide } from "../errors";
import { SHEETS, SHEET_LABEL, type AnyRow, type Db, type SheetName } from "../schema";
import { exclusive, readDb, readWorkbookFile, transaction, type Actor } from "../storage";
import { MEDIA_NAME } from "./media";

const BACKUP_ID = /^manuel-\d{8}-\d{6}-[a-f0-9]{4}$/;
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

function dirOf(id: string): string {
  if (!BACKUP_ID.test(id)) throw invalide("Identifiant de sauvegarde invalide.");
  return path.join(paths.backups, id);
}

const count = (db: Db) => Object.fromEntries(SUMMARY.map((s) => [SHEET_LABEL[s], db[s].length]));

/** Copie cohérente du classeur et des images, prise sous le verrou d'écriture. */
export async function createBackup(actor: Actor, note = ""): Promise<BackupManifest> {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const id = `manuel-${stamp}-${randomBytes(2).toString("hex")}`;
  const dir = dirOf(id);
  try {
    const manifest = await exclusive(async (db) => {
      await ensureDir(path.join(dir, "media"));
      await fsp.copyFile(paths.workbook, path.join(dir, "oliva.xlsx"));
      let medias = 0;
      const files = await fsp.readdir(paths.media).catch(() => [] as string[]);
      for (const f of files) {
        if (!MEDIA_NAME.test(f)) continue;
        await fsp.copyFile(path.join(paths.media, f), path.join(dir, "media", f));
        medias++;
      }
      const st = await fsp.stat(path.join(dir, "oliva.xlsx"));
      const m: BackupManifest = { id, creeLe: new Date().toISOString(), auteur: actor.nom, note: note.slice(0, 80), revision: db._meta.revision, demo: db._meta.donneesDemo, tailleOctets: st.size, medias, lignes: count(db) };
      await fsp.writeFile(path.join(dir, "manifeste.json"), JSON.stringify(m, null, 2));
      return m;
    });
    await transaction({ actor }, (_db, tx) => {
      tx.log({ action: "sauvegarde", libelle: "Sauvegarde créée", entite: "", entiteNom: id, resultat: "Terminé" });
    });
    return manifest;
  } catch (e) {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    if (e instanceof AppError) throw e;
    throw new AppError("stockage", "La sauvegarde n'a pas pu être écrite sur le disque.", { cause: e });
  }
}

export async function listBackups(): Promise<{ manuelles: BackupManifest[]; automatiques: number; derniereAuto: string }> {
  const manuelles: BackupManifest[] = [];
  const names = await fsp.readdir(paths.backups).catch(() => [] as string[]);
  for (const name of names) {
    if (!BACKUP_ID.test(name)) continue;
    try {
      manuelles.push(JSON.parse(await fsp.readFile(path.join(paths.backups, name, "manifeste.json"), "utf8")) as BackupManifest);
    } catch {
      /* dossier incomplet : ignoré */
    }
  }
  manuelles.sort((a, b) => b.creeLe.localeCompare(a.creeLe));
  const auto = (await fsp.readdir(paths.autoBackups).catch(() => [] as string[])).filter((f) => f.endsWith(".xlsx")).sort();
  let derniereAuto = "";
  if (auto.length > 0) derniereAuto = (await fsp.stat(path.join(paths.autoBackups, auto[auto.length - 1]))).mtime.toISOString();
  return { manuelles, automatiques: auto.length, derniereAuto };
}

export function backupWorkbookPath(id: string): string {
  return path.join(dirOf(id), "oliva.xlsx");
}

async function load(id: string) {
  const file = backupWorkbookPath(id);
  try {
    await fsp.access(file);
  } catch {
    throw introuvable("Sauvegarde introuvable.");
  }
  const db = await readWorkbookFile(file);
  const available = new Set(await fsp.readdir(path.join(dirOf(id), "media")).catch(() => [] as string[]));
  const missing = db.Medias.filter((m) => !available.has(m.fichier)).length;
  return { db, missing };
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

  await ensureDir(paths.media);
  for (const f of await fsp.readdir(path.join(dirOf(id), "media")).catch(() => [] as string[])) {
    if (!MEDIA_NAME.test(f)) continue;
    await fsp.copyFile(path.join(dirOf(id), "media", f), path.join(paths.media, f), fsp.constants.COPYFILE_EXCL).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== "EEXIST") throw new AppError("stockage", "Une image de la sauvegarde n'a pas pu être recopiée.", { cause: e });
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
  const dir = dirOf(id);
  try {
    await fsp.access(dir);
  } catch {
    throw introuvable("Sauvegarde introuvable.");
  }
  await fsp.rm(dir, { recursive: true, force: true });
  await transaction({ actor }, (_db, tx) => {
    tx.log({ action: "sauvegarde", libelle: "Sauvegarde supprimée", entite: "", entiteNom: id });
  });
  return { id };
}
