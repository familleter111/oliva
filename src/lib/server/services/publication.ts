import "server-only";
import { formatDateTime, formatMoney } from "../../format";
import { labelOf, rowsOf } from "../db-utils";
import { AppError, conflit } from "../errors";
import { COL_LABEL, PUBLISHED_SHEETS, SHEET_LABEL, type AnyRow, type ChangementResume, type Db, type PublishedSheet, type Row, type SheetName, type Snapshot } from "../schema";
import { transaction, type Actor } from "../storage";
import { allFiles } from "./media-names";

const FRAGMENT = 30000;
const KEEP_SNAPSHOTS = 5;

/** Champs suivis en direct (hors publication) ou purement techniques : ignorés par la comparaison. */
const IGNORED = new Set(["id", "majLe", "creeLe", "creePar", "archiveeLe", "miniature", "taille", "largeur", "hauteur", "format", "categorie"]);
const LIVE: Partial<Record<PublishedSheet, string[]>> = { Produits: ["disponible"], Options: ["disponible"], Medias: ["nom"] };

const IMPACT: Partial<Record<PublishedSheet, string>> = {
  Produits: "Menu client. S'applique aux prochains ajouts au panier.",
  Options: "Menu client. S'applique aux prochains ajouts au panier.",
  GroupesOptions: "Menu client. S'applique aux prochains ajouts au panier.",
  Categories: "Menu client. Organisation de la carte.",
  Medias: "Menu client. Affichage des photos.",
  Restaurant: "Menu client. Identité affichée.",
  Apparence: "Menu client. Couleurs et textes d'accueil.",
  Horaires: "Menu client. Périodes de prise de commande.",
  Exceptions: "Menu client. Périodes de prise de commande.",
  Tables: "Salle. S'applique aux prochaines sessions.",
  Zones: "Salle. S'applique aux prochaines sessions.",
  ReglesNotifications: "Personnel. Alertes de l'équipe.",
  MotifsDemandes: "Menu client. Demandes proposées aux clients.",
  ParametresCommandes: "Commandes. S'applique aux prochains paniers.",
  ParametresAddition: "Addition. S'applique aux prochaines commandes.",
  ProfilsTaxes: "Addition. S'applique aux prochaines commandes.",
  ReglesAccesTable: "Salle. S'applique aux prochaines sessions.",
};

export function buildSnapshot(db: Db): Snapshot {
  const snap = {} as Record<PublishedSheet, AnyRow[]>;
  for (const s of PUBLISHED_SHEETS) snap[s] = structuredClone(rowsOf(db, s));
  const used = new Set<string>();
  for (const s of PUBLISHED_SHEETS) {
    for (const row of snap[s]) for (const k of ["logoMediaId", "banniereMediaId", "imageMediaId"]) if (row[k]) used.add(row[k] as string);
  }
  snap.Medias = snap.Medias.filter((m) => used.has(m.id));
  return snap as unknown as Snapshot;
}

export function encodeSnapshot(snap: Snapshot): string[] {
  const b64 = Buffer.from(JSON.stringify(snap), "utf8").toString("base64");
  const out: string[] = [];
  for (let i = 0; i < b64.length; i += FRAGMENT) out.push(b64.slice(i, i + FRAGMENT));
  return out;
}

export function decodeSnapshot(fragments: string[]): Snapshot {
  const snap = JSON.parse(Buffer.from(fragments.join(""), "base64").toString("utf8")) as Snapshot;
  for (const s of PUBLISHED_SHEETS) (snap as Record<string, unknown>)[s] ??= [];
  return snap;
}

/** Version en vigueur : la plus récente publiée, ou programmée dont l'heure est passée. */
export function effectiveVersion(db: Db, now = Date.now()): Row<"VersionsConfiguration"> | null {
  const live = db.VersionsConfiguration.filter((v) => v.statut === "publiee" || (v.statut === "programmee" && Date.parse(v.programmeePour) <= now));
  return live.sort((a, b) => b.numero - a.numero)[0] ?? null;
}

export const scheduledVersion = (db: Db, now = Date.now()) =>
  db.VersionsConfiguration.find((v) => v.statut === "programmee" && Date.parse(v.programmeePour) > now) ?? null;

const holder = globalThis as unknown as { __olivaSnap?: { key: string; snap: Snapshot; files: Set<string> } };

function loadSnapshot(db: Db, versionId: string): Snapshot {
  const fragments = db.InstantanesVersion.filter((f) => f.versionId === versionId).sort((a, b) => a.ordre - b.ordre).map((f) => f.fragment);
  if (fragments.length === 0) throw new AppError("stockage", "L'instantané de la version publiée est introuvable dans le classeur.");
  return decodeSnapshot(fragments);
}

/** Instantané servi au public, ou null si rien n'a encore été publié. */
export function publishedSnapshot(db: Db): { version: Row<"VersionsConfiguration">; snap: Snapshot; files: Set<string> } | null {
  const version = effectiveVersion(db);
  if (!version) return null;
  const key = `${version.id}`;
  if (holder.__olivaSnap?.key !== key) {
    const snap = loadSnapshot(db, version.id);
    const files = new Set<string>();
    for (const m of snap.Medias) for (const f of allFiles(m.fichier)) files.add(f);
    holder.__olivaSnap = { key, snap, files };
  }
  return { version, snap: holder.__olivaSnap.snap, files: holder.__olivaSnap.files };
}

/* ------------------------------------------------------------ comparaison */

function fmt(db: Db, snap: Snapshot | null, col: string, v: unknown, devise: string): string {
  const lookup = (sheet: SheetName, id: string) => {
    const row = rowsOf(db, sheet).find((r) => r.id === id) ?? ((snap as unknown as Record<string, AnyRow[]> | null)?.[sheet] ?? []).find((r) => r.id === id);
    return row ? labelOf(row) : "Élément supprimé";
  };
  if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) return "Aucun";
  if (col === "prixCentimes") return formatMoney(v as number, devise);
  if (col === "tauxBp" || col === "fraisServiceBp") return `${((v as number) / 100).toString().replace(".", ",")} %`;
  if (col === "capacite") return `${v} places`;
  if (col === "delaiMin" || col === "tempsPreparationMin" || col === "arretAvantFermetureMin") return `${v} minutes`;
  if (col === "visible") return v ? "Visible" : "Masqué";
  if (col === "active" || col === "actif" || col === "ouvert") return v ? "Activé" : "Désactivé";
  if (typeof v === "boolean") return v ? "Oui" : "Non";
  if (col === "categorieId") return lookup("Categories", v as string);
  if (col === "zoneId") return lookup("Zones", v as string);
  if (col === "stationId") return lookup("StationsPreparation", v as string);
  if (col === "groupeId") return lookup("GroupesOptions", v as string);
  if (col === "serveurId") return lookup("Utilisateurs", v as string);
  if (col.endsWith("MediaId")) return lookup("Medias", v as string);
  if (col === "allergeneIds") return (v as string[]).map((id) => lookup("Allergenes", id)).join(", ");
  if (col === "etiquetteIds") return (v as string[]).map((id) => lookup("Etiquettes", id)).join(", ");
  if (col === "groupeOptionIds") return (v as string[]).map((id) => lookup("GroupesOptions", id)).join(", ");
  if (col === "utilisateurIds" || col === "zoneIds") return `${(v as string[]).length} élément(s)`;
  if (col === "plages") return (v as { debut: string; fin: string }[]).map((p) => `${p.debut}-${p.fin}`).join(", ");
  if (col === "fichier") return "Fichier image";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 80 ? `${s.slice(0, 77)}...` : s;
}

/** Liste des écarts entre le brouillon (données de travail) et la version publiée. */
export function draftChanges(db: Db): ChangementResume[] {
  const published = publishedSnapshot(db);
  const snap = published?.snap ?? null;
  const devise = db.Restaurant[0]?.devise || "EUR";
  const out: ChangementResume[] = [];

  for (const sheet of PUBLISHED_SHEETS) {
    const now = rowsOf(db, sheet);
    const was = ((snap as unknown as Record<string, AnyRow[]> | null)?.[sheet] ?? []) as AnyRow[];
    const entite = SHEET_LABEL[sheet];
    const impact = IMPACT[sheet] ?? "Configuration.";
    const before = new Map(was.map((r) => [r.id, r]));
    const live = new Set(LIVE[sheet] ?? []);

    if (sheet === "Medias") {
      for (const row of now) {
        const old = before.get(row.id);
        if (old && old.fichier !== row.fichier) out.push({ entite, nom: labelOf(row), champ: "Fichier", avant: "Ancienne image", apres: "Nouvelle image", impact });
        if (old && old.alt !== row.alt) out.push({ entite, nom: labelOf(row), champ: COL_LABEL.alt, avant: fmt(db, snap, "alt", old.alt, devise), apres: fmt(db, snap, "alt", row.alt, devise), impact });
      }
      continue;
    }

    for (const row of now) {
      const old = before.get(row.id);
      const name = labelOf(row) || entite;
      if (!old) {
        if (snap) out.push({ entite, nom: name, champ: "Ajout", avant: "Aucun", apres: "Nouvel élément", impact });
        continue;
      }
      for (const k of Object.keys(row)) {
        if (IGNORED.has(k) || live.has(k)) continue;
        if (JSON.stringify(old[k] ?? null) === JSON.stringify(row[k] ?? null)) continue;
        out.push({ entite, nom: name, champ: COL_LABEL[k] ?? k, avant: fmt(db, snap, k, old[k], devise), apres: fmt(db, snap, k, row[k], devise), impact });
      }
    }
    const current = new Set(now.map((r) => r.id));
    for (const old of was) {
      if (!current.has(old.id)) out.push({ entite, nom: labelOf(old) || entite, champ: "Suppression", avant: "Présent", apres: "Retiré", impact });
    }
  }
  return out;
}

/** Nombre d'écarts, mis en cache par révision (affiché dans l'en-tête d'administration). */
const countHolder = globalThis as unknown as { __olivaDraftCount?: { key: string; n: number; first: boolean } };
export function draftSummary(db: Db): { count: number; neverPublished: boolean } {
  const v = effectiveVersion(db);
  const key = `${db._meta.revision}:${v?.id ?? "-"}`;
  if (countHolder.__olivaDraftCount?.key !== key) {
    countHolder.__olivaDraftCount = { key, n: v ? draftChanges(db).length : 0, first: !v };
  }
  return { count: countHolder.__olivaDraftCount.n, neverPublished: countHolder.__olivaDraftCount.first };
}

/* ------------------------------------------------------------ publication */

/** Contrôles bloquants avant publication. */
export function publicationProblems(db: Db): { bloquant: boolean; message: string }[] {
  const problems: { bloquant: boolean; message: string }[] = [];
  if (!db.Restaurant[0]?.nom.trim()) problems.push({ bloquant: true, message: "Le nom du restaurant est vide." });
  const visibles = db.Produits.filter((p) => p.visible);
  if (visibles.length === 0) problems.push({ bloquant: true, message: "Aucun produit visible : la carte publiée serait vide." });
  const cats = new Map(db.Categories.map((c) => [c.id, c]));
  const hidden = visibles.filter((p) => !cats.get(p.categorieId)?.visible);
  if (hidden.length > 0) problems.push({ bloquant: false, message: `${hidden.length} produit(s) visible(s) appartiennent à une catégorie masquée et ne seront pas affichés.` });
  const sansPhoto = visibles.filter((p) => !p.imageMediaId).length;
  if (sansPhoto > 0) problems.push({ bloquant: false, message: `${sansPhoto} produit(s) visible(s) n'ont pas de photo.` });
  if (!db.Horaires.some((h) => h.ouvert)) problems.push({ bloquant: false, message: "Aucun jour d'ouverture n'est renseigné dans les horaires." });
  return problems;
}

export function publish(actor: Actor, mode: "maintenant" | "programmee", when?: string) {
  return transaction({ actor }, (db, tx) => {
    if (mode === "programmee") {
      if (!when || Number.isNaN(Date.parse(when)) || Date.parse(when) <= Date.now() + 30_000) {
        throw new AppError("invalide", "Choisissez une heure de publication dans le futur.");
      }
    }
    const blocking = publicationProblems(db).filter((p) => p.bloquant);
    if (blocking.length > 0) throw conflit(`Publication impossible : ${blocking.map((p) => p.message).join(" ")}`);

    const changes = draftChanges(db);
    const first = effectiveVersion(db) === null;
    if (!first && changes.length === 0) throw conflit("Aucune modification à publier : le brouillon est identique à la version publiée.");

    // Une seule publication programmée à la fois : la précédente est remplacée.
    for (const old of db.VersionsConfiguration.filter((v) => v.statut === "programmee" && Date.parse(v.programmeePour) > Date.now())) {
      db.InstantanesVersion = db.InstantanesVersion.filter((f) => f.versionId !== old.id);
      db.VersionsConfiguration = db.VersionsConfiguration.filter((v) => v.id !== old.id);
    }
    for (const v of db.VersionsConfiguration) {
      if (v.statut === "programmee") {
        v.statut = "publiee";
        v.publieeLe = v.programmeePour;
      }
    }

    const numero = db.VersionsConfiguration.reduce((m, v) => Math.max(m, v.numero), 0) + 1;
    const id = tx.id("ver");
    db.VersionsConfiguration.push({
      id,
      numero,
      statut: mode === "maintenant" ? "publiee" : "programmee",
      creeLe: tx.now,
      publieeLe: mode === "maintenant" ? tx.now : "",
      programmeePour: mode === "programmee" ? new Date(when!).toISOString() : "",
      auteurId: actor.id,
      auteurNom: actor.nom,
      nbChangements: changes.length,
      resume: changes.slice(0, 40),
    });
    encodeSnapshot(buildSnapshot(db)).forEach((fragment, ordre) => db.InstantanesVersion.push({ id: `${id}:${ordre}`, versionId: id, ordre, fragment }));

    const keep = new Set([...db.VersionsConfiguration].sort((a, b) => b.numero - a.numero).slice(0, KEEP_SNAPSHOTS).map((v) => v.id));
    db.InstantanesVersion = db.InstantanesVersion.filter((f) => keep.has(f.versionId));

    const fr = db.Restaurant[0]?.fuseauHoraire || undefined;
    tx.log({
      action: "publication",
      libelle: mode === "maintenant" ? "Publication" : "Publication programmée",
      entite: "VersionsConfiguration",
      entiteId: id,
      entiteNom: `Version ${numero}`,
      resultat: mode === "maintenant" ? "Appliqué" : `Programmé (${formatDateTime(new Date(when!).toISOString(), fr)})`,
      apres: { modifications: changes.length },
    });
    tx.publish("publication");
    return { id, numero, changements: changes.length };
  });
}

export function cancelScheduled(actor: Actor) {
  return transaction({ actor }, (db, tx) => {
    const v = scheduledVersion(db);
    if (!v) throw conflit("Aucune publication programmée à annuler.");
    db.InstantanesVersion = db.InstantanesVersion.filter((f) => f.versionId !== v.id);
    db.VersionsConfiguration = db.VersionsConfiguration.filter((x) => x.id !== v.id);
    tx.log({ action: "publication", libelle: "Publication programmée annulée", entite: "VersionsConfiguration", entiteId: v.id, entiteNom: `Version ${v.numero}`, resultat: "Annulé" });
    return { id: v.id };
  });
}
