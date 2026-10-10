import "server-only";
import type { Db, Plage, Row, Snapshot } from "../schema";
import { readDb } from "../storage";
import { srcSet } from "./media-names";
import { buildSnapshot, publishedSnapshot } from "./publication";

export interface MenuImage {
  src: string;
  srcset: string;
  thumb: string;
  alt: string;
  w: number;
  h: number;
}
export interface MenuOptionGroup {
  id: string;
  nom: string;
  obligatoire: boolean;
  min: number;
  max: number;
  options: { id: string; nom: string; prixCentimes: number; disponible: boolean }[];
}
export interface MenuProduct {
  id: string;
  nom: string;
  description: string;
  prixCentimes: number;
  image: MenuImage | null;
  allergenes: string[];
  etiquettes: { nom: string; couleur: string; icone: string }[];
  tempsPreparationMin: number | null;
  disponible: boolean;
  groupes: MenuOptionGroup[];
}
export interface MenuCategory {
  id: string;
  nom: string;
  description: string;
  image: MenuImage | null;
  produits: MenuProduct[];
}
export interface MenuData {
  publie: boolean;
  restaurant: { nom: string; sousTitre: string; description: string; adresse: string; telephone: string; email: string; devise: string; logo: MenuImage | null };
  apparence: { fond: string; primaire: string; texte: string; bordures: string; banniere: MenuImage | null; titre: string; texte2: string };
  langue: string;
  langues: { id: string; nom: string }[];
  categories: MenuCategory[];
  horaires: { jour: number; ouvert: boolean; plages: Plage[] }[];
  fermetures: { date: string; motif: string }[];
  etat: { ouvert: boolean; libelle: string };
}

const DEFAULT_COLORS = { fond: "#F8F9F5", primaire: "#52683F", texte: "#263D30", bordures: "#E7EBE3" };

function localParts(timeZone: string, at = new Date()) {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", year: "numeric", month: "2-digit", day: "2-digit", hourCycle: "h23" }).formatToParts(at);
  } catch {
    parts = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", hour: "2-digit", minute: "2-digit", year: "numeric", month: "2-digit", day: "2-digit", hourCycle: "h23" }).formatToParts(at);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const jour = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  return { jour, minutes: Number(get("hour")) * 60 + Number(get("minute")), date: `${get("year")}-${get("month")}-${get("day")}` };
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** État d'ouverture calculé dans le fuseau du restaurant. */
export function openingState(horaires: Row<"Horaires">[], exceptions: Row<"Exceptions">[], timeZone: string, at = new Date()): { ouvert: boolean; libelle: string } {
  if (!horaires.some((h) => h.ouvert && h.plages.length > 0)) return { ouvert: false, libelle: "" };
  const { jour, minutes, date } = localParts(timeZone || "Europe/Paris", at);
  const closedToday = exceptions.some((e) => e.date === date);
  const today = horaires.find((h) => h.jour === jour);
  const plages = !closedToday && today?.ouvert ? [...today.plages].sort((a, b) => toMin(a.debut) - toMin(b.debut)) : [];
  for (const p of plages) {
    const start = toMin(p.debut);
    let end = toMin(p.fin);
    if (end <= start) end += 24 * 60;
    if (minutes >= start && minutes < end) return { ouvert: true, libelle: `Ouvert jusqu'à ${p.fin}` };
  }
  const next = plages.find((p) => toMin(p.debut) > minutes);
  if (next) return { ouvert: false, libelle: `Fermé, ouvre à ${next.debut}` };
  return { ouvert: false, libelle: closedToday ? "Fermeture exceptionnelle aujourd'hui" : "Fermé actuellement" };
}

function assemble(snap: Snapshot, live: Db, mediaBase: string, lang: string, publie: boolean): MenuData {
  const resto = snap.Restaurant[0];
  const app = snap.Apparence[0];
  const langues = snap.Langues.filter((l) => l.active).sort((a, b) => a.ordre - b.ordre);
  const langue = langues.some((l) => l.id === lang) ? lang : (langues.find((l) => l.principale)?.id ?? "fr");
  const principale = langues.find((l) => l.principale)?.id ?? "fr";
  const dict = new Map(snap.Traductions.filter((t) => t.langue === langue && t.valeur.trim() !== "").map((t) => [t.cle, t.valeur]));
  const tr = (cle: string, fallback: string) => (langue === principale ? fallback : (dict.get(cle) ?? fallback));

  const medias = new Map(snap.Medias.map((m) => [m.id, m]));
  const img = (id: string, altFallback: string): MenuImage | null => {
    const m = medias.get(id);
    return m ? { src: `${mediaBase}/${m.fichier}`, srcset: srcSet(mediaBase, m.fichier, m.largeur), thumb: `${mediaBase}/${m.miniature}`, alt: m.alt || altFallback, w: m.largeur, h: m.hauteur } : null;
  };

  const allergenes = new Map(snap.Allergenes.map((a) => [a.id, a.nom]));
  const etiquettes = new Map(snap.Etiquettes.map((e) => [e.id, e]));
  const groupes = new Map(snap.GroupesOptions.map((g) => [g.id, g]));
  // La disponibilité est suivie en direct : une rupture s'affiche sans attendre une publication.
  const dispoProduit = new Map(live.Produits.map((p) => [p.id, p.disponible]));
  const dispoOption = new Map(live.Options.map((o) => [o.id, o.disponible]));

  const categories: MenuCategory[] = snap.Categories.filter((c) => c.visible)
    .sort((a, b) => a.ordre - b.ordre)
    .map((c) => ({
      id: c.id,
      nom: tr(`categorie:${c.id}.nom`, c.nom),
      description: tr(`categorie:${c.id}.description`, c.description),
      image: img(c.imageMediaId, c.nom),
      produits: snap.Produits.filter((p) => p.categorieId === c.id && p.visible)
        .sort((a, b) => a.ordre - b.ordre)
        .map((p) => ({
          id: p.id,
          nom: tr(`produit:${p.id}.nom`, p.nom),
          description: tr(`produit:${p.id}.description`, p.description),
          prixCentimes: p.prixCentimes,
          image: img(p.imageMediaId, p.nom),
          allergenes: p.allergeneIds.map((id) => allergenes.get(id)).filter((x): x is string => !!x),
          etiquettes: p.etiquetteIds.map((id) => etiquettes.get(id)).filter((x) => !!x).map((e) => ({ nom: e!.nom, couleur: e!.couleur, icone: e!.icone })),
          tempsPreparationMin: p.tempsPreparationMin,
          disponible: dispoProduit.get(p.id) ?? p.disponible,
          groupes: p.groupeOptionIds
            .map((id) => groupes.get(id))
            .filter((g) => !!g)
            .map((g) => ({
              id: g!.id,
              nom: tr(`groupe:${g!.id}.nom`, g!.nom),
              obligatoire: g!.selection === "obligatoire",
              min: g!.min,
              max: g!.max,
              options: snap.Options.filter((o) => o.groupeId === g!.id)
                .sort((a, b) => a.ordre - b.ordre)
                .map((o) => ({ id: o.id, nom: tr(`option:${o.id}.nom`, o.nom), prixCentimes: o.prixCentimes, disponible: dispoOption.get(o.id) ?? o.disponible })),
            })),
        })),
    }))
    .filter((c) => c.produits.length > 0);

  const today = new Date().toISOString().slice(0, 10);
  return {
    publie,
    restaurant: {
      nom: resto?.nom || "Oliva",
      sousTitre: tr("restaurant.sousTitre", resto?.sousTitre ?? ""),
      description: tr("restaurant.description", resto?.description ?? ""),
      adresse: resto?.adresse ?? "",
      telephone: resto?.telephone ?? "",
      email: resto?.email ?? "",
      devise: resto?.devise || "EUR",
      logo: img(resto?.logoMediaId ?? "", resto?.nom ?? "Logo"),
    },
    apparence: {
      fond: app?.couleurFond || DEFAULT_COLORS.fond,
      primaire: app?.couleurPrimaire || DEFAULT_COLORS.primaire,
      texte: app?.couleurTexte || DEFAULT_COLORS.texte,
      bordures: app?.couleurBordures || DEFAULT_COLORS.bordures,
      banniere: img(app?.banniereMediaId ?? "", resto?.nom ?? ""),
      titre: tr("apparence.titreAccueil", app?.titreAccueil ?? ""),
      texte2: tr("apparence.texteBanniere", app?.texteBanniere ?? ""),
    },
    langue,
    langues: langues.map((l) => ({ id: l.id, nom: l.nom })),
    categories,
    horaires: [...snap.Horaires].sort((a, b) => a.jour - b.jour).map((h) => ({ jour: h.jour, ouvert: h.ouvert, plages: h.plages ?? [] })),
    fermetures: snap.Exceptions.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5).map((e) => ({ date: e.date, motif: e.motif })),
    etat: openingState(snap.Horaires, snap.Exceptions, resto?.fuseauHoraire ?? "Europe/Paris"),
  };
}

/** Carte servie au public : uniquement la dernière version publiée. */
export async function publicMenu(lang = ""): Promise<MenuData> {
  const db = await readDb();
  const published = publishedSnapshot(db);
  if (!published) {
    const empty = buildSnapshot(db);
    return assemble({ ...empty, Categories: [], Produits: [], Medias: [], Horaires: [], Exceptions: [] }, db, "/media", lang, false);
  }
  return assemble(published.snap, db, "/media", lang, true);
}

/** Aperçu du brouillon, réservé à l'administration (images servies par la route protégée). */
export async function draftMenu(lang = ""): Promise<MenuData> {
  const db = await readDb();
  return assemble(buildSnapshot(db), db, "/api/admin/medias/fichier", lang, true);
}

/** Vrai si le fichier appartient à la version publiée. */
export async function isPublishedFile(name: string): Promise<boolean> {
  const db = await readDb();
  return publishedSnapshot(db)?.files.has(name) ?? false;
}
