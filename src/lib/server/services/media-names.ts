import "server-only";

/**
 * Convention de nommage des images stockées. Chaque image importée produit un fichier principal
 * `<32 hexa>.webp` et trois variantes plus légères, servies selon la largeur d'affichage.
 */
export const MEDIA_NAME = /^[a-f0-9]{32}(-(xs|s|m))?\.webp$/;

/**
 * Suffixe, largeur en pixels, qualité WebP. Les largeurs couvrent une vignette de carte sur téléphone (360),
 * une bannière sur téléphone ou une carte sur écran dense (720) et une grande image sur ordinateur (1200).
 */
export const VARIANTS = [
  ["xs", 360, 66],
  ["s", 720, 72],
  ["m", 1200, 78],
] as const;
export type Variant = (typeof VARIANTS)[number][0];

/** Plus grand côté du fichier principal. */
export const FULL_MAX = 2000;

export const variantName = (fichier: string, v: Variant) => fichier.replace(/\.webp$/, `-${v}.webp`);

/** Tous les fichiers d'une image : le principal et ses variantes. */
export const allFiles = (fichier: string): string[] => [fichier, ...VARIANTS.map(([v]) => variantName(fichier, v))];

/** Attribut `srcset` : le navigateur choisit la plus petite variante suffisante pour l'écran. Une image n'est jamais agrandie. */
export function srcSet(base: string, fichier: string, largeur: number): string {
  const seen = new Set<number>();
  const out: string[] = [];
  for (const [v, width] of VARIANTS) {
    const w = Math.min(width, largeur);
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(`${base}/${variantName(fichier, v)} ${w}w`);
  }
  if (!seen.has(largeur)) out.push(`${base}/${fichier} ${largeur}w`);
  return out.join(", ");
}
