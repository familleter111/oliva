import "server-only";
import type { MediaLite } from "../types";
import type { Db, Row } from "./schema";

export const adminFile = (name: string) => `/api/admin/medias/fichier/${name}`;

export const toMediaLite = (m: Row<"Medias">): MediaLite => ({
  id: m.id,
  nom: m.nom,
  alt: m.alt,
  thumb: adminFile(m.miniature),
  src: adminFile(m.fichier),
  largeur: m.largeur,
  hauteur: m.hauteur,
  taille: m.taille,
  format: m.format,
  categorie: m.categorie,
});

export const mediaList = (db: Db): MediaLite[] => [...db.Medias].sort((a, b) => b.creeLe.localeCompare(a.creeLe)).map(toMediaLite);

export const thumbOf = (db: Db, mediaId: string): string | null => {
  const m = db.Medias.find((x) => x.id === mediaId);
  return m ? adminFile(m.miniature) : null;
};
