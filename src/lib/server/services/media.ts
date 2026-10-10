import "server-only";
import { randomBytes } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import sharp, { type Metadata } from "sharp";
import { paths } from "../env";
import { AppError, invalide } from "../errors";
import type { Db } from "../schema";
import { FULL_MAX, MEDIA_NAME, VARIANTS, allFiles, variantName } from "./media-names";
import { decodeSnapshot } from "./publication";

export { MEDIA_NAME };

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_PIXELS = 60_000_000;
const MIN_SIDE = 64;
const ALLOWED: Record<string, string> = { jpeg: "JPG", png: "PNG", webp: "WebP" };
export const MEDIA_CATEGORIES = ["produits", "restaurant", "logo"] as const;

export interface StoredImage {
  fichier: string;
  miniature: string;
  format: string;
  largeur: number;
  hauteur: number;
  taille: number;
}

/** Chemin d'un fichier média, uniquement pour un nom généré par l'application. */
export function mediaPath(name: string): string {
  if (!MEDIA_NAME.test(name)) throw invalide("Nom de fichier refusé.");
  return path.join(paths.media, name);
}

/**
 * Vérifie le contenu réel (pas l'extension), puis réencode en WebP : orientation corrigée,
 * métadonnées retirées, taille bornée. Le nom stocké est aléatoire.
 */
export async function storeImage(input: Buffer, crop?: { left: number; top: number; width: number; height: number }): Promise<StoredImage> {
  if (input.length === 0) throw invalide("Le fichier est vide.");
  if (input.length > MAX_UPLOAD_BYTES) throw invalide("Image trop lourde : 10 Mo maximum par fichier.");

  let meta: Metadata;
  try {
    meta = await sharp(input, { failOn: "error", limitInputPixels: MAX_PIXELS }).metadata();
  } catch {
    throw invalide("Ce fichier n'est pas une image lisible (JPG, PNG ou WebP attendus).");
  }
  const format = meta.format ? ALLOWED[meta.format] : undefined;
  if (!format) throw invalide("Format non accepté : utilisez une image JPG, PNG ou WebP.");
  if (!meta.width || !meta.height || meta.width < MIN_SIDE || meta.height < MIN_SIDE) {
    throw invalide(`Image trop petite : ${MIN_SIDE} pixels minimum par côté.`);
  }

  try {
    let base = sharp(input, { failOn: "error", limitInputPixels: MAX_PIXELS }).rotate();
    if (crop) base = sharp(await base.toBuffer()).extract(crop);
    const main = await base.clone().resize({ width: FULL_MAX, height: FULL_MAX, fit: "inside", withoutEnlargement: true }).webp({ quality: 84 }).toBuffer({ resolveWithObject: true });

    const id = randomBytes(16).toString("hex");
    const fichier = `${id}.webp`;
    const stored: StoredImage = { fichier, miniature: variantName(fichier, "s"), format, largeur: main.info.width, hauteur: main.info.height, taille: main.data.length };
    await fsp.mkdir(paths.media, { recursive: true });
    try {
      await fsp.writeFile(mediaPath(fichier), main.data, { flag: "wx" });
      // Variantes plus légères : le navigateur ne télécharge que la taille utile à l'écran.
      for (const [v, width, quality] of VARIANTS) {
        const data = await base.clone().resize({ width, withoutEnlargement: true }).webp({ quality }).toBuffer();
        await fsp.writeFile(mediaPath(variantName(fichier, v)), data, { flag: "wx" });
      }
    } catch (e) {
      await removeStored(stored);
      throw e;
    }
    return stored;
  } catch (e) {
    if (e instanceof AppError) throw e;
    console.error("[oliva:media]", e);
    throw new AppError("stockage", "L'image n'a pas pu être enregistrée sur le disque. Rien n'a été modifié.", { cause: e });
  }
}

export async function removeStored(img: { fichier: string } | null): Promise<void> {
  if (!img) return;
  for (const f of allFiles(img.fichier)) {
    if (MEDIA_NAME.test(f)) await fsp.rm(path.join(paths.media, f), { force: true }).catch(() => undefined);
  }
}

/** Recadre une image existante selon des fractions (0 à 1) et enregistre un nouveau fichier. */
export async function cropStored(fichier: string, zone: { x: number; y: number; w: number; h: number }): Promise<StoredImage> {
  const buf = await fsp.readFile(mediaPath(fichier));
  const meta = await sharp(buf).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  const left = Math.round(zone.x * W);
  const top = Math.round(zone.y * H);
  const width = Math.min(W - left, Math.round(zone.w * W));
  const height = Math.min(H - top, Math.round(zone.h * H));
  if (width < MIN_SIDE || height < MIN_SIDE) throw invalide(`Recadrage trop petit : ${MIN_SIDE} pixels minimum par côté.`);
  return storeImage(buf, { left, top, width, height });
}

/** Fichiers encore référencés par le brouillon ou par un instantané conservé. */
export function referencedFiles(db: Db): Set<string> {
  const keep = new Set<string>();
  for (const m of db.Medias) for (const f of allFiles(m.fichier)) keep.add(f);
  const byVersion = new Map<string, string[]>();
  for (const f of [...db.InstantanesVersion].sort((a, b) => a.ordre - b.ordre)) {
    (byVersion.get(f.versionId) ?? byVersion.set(f.versionId, []).get(f.versionId)!).push(f.fragment);
  }
  for (const fragments of byVersion.values()) {
    try {
      for (const m of decodeSnapshot(fragments).Medias) for (const f of allFiles(m.fichier)) keep.add(f);
    } catch {
      /* instantané illisible : aucun fichier supprimé à cause de lui */
      return new Set(["*"]);
    }
  }
  return keep;
}

/** Supprime les fichiers qui ne sont plus référencés nulle part (et vieux de plus d'une heure). */
export async function collectGarbage(db: Db): Promise<number> {
  const keep = referencedFiles(db);
  if (keep.has("*")) return 0;
  let removed = 0;
  let files: string[] = [];
  try {
    files = await fsp.readdir(paths.media);
  } catch {
    return 0;
  }
  for (const f of files) {
    if (!MEDIA_NAME.test(f) || keep.has(f)) continue;
    const full = path.join(paths.media, f);
    const st = await fsp.stat(full).catch(() => null);
    if (st && Date.now() - st.mtimeMs > 3600 * 1000) {
      await fsp.rm(full, { force: true }).catch(() => undefined);
      removed++;
    }
  }
  return removed;
}
