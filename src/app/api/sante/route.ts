import { appSecret, ephemeralHost, storageRoot } from "@/lib/server/env";
import { isAppError } from "@/lib/server/errors";
import { readDb } from "@/lib/server/storage";
import { blobConfigured, blobMode } from "@/lib/server/store/bucket";
import { postgresConfigured } from "@/lib/server/store/postgres";

export const dynamic = "force-dynamic";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  });

/**
 * Présence des variables attendues, jamais leur contenu.
 * Sur un hébergement, une variable peut exister dans le tableau de bord sans atteindre le serveur :
 * mauvais environnement coché, ou déploiement plus ancien que la variable.
 */
function variables(): Record<string, string> {
  const vu = (...noms: string[]) => (noms.some((n) => (process.env[n] ?? "").trim() !== "") ? "présente" : "absente");
  const mode = blobMode();
  return {
    OLIVA_SECRET: vu("OLIVA_SECRET"),
    DATABASE_URL: vu("OLIVA_DATABASE_URL", "DATABASE_URL", "POSTGRES_URL"),
    // Le dépôt Blob s'authentifie par jeton de lecture-écriture, ou par OIDC avec l'identifiant du dépôt.
    BLOB: mode === "jeton" ? "présente (jeton)" : mode === "oidc" ? "présente (OIDC)" : "absente",
    OLIVA_PUBLIC_URL: vu("OLIVA_PUBLIC_URL"),
  };
}

/**
 * État du service, destiné à l'exploitation : sonde de l'hébergeur et diagnostic après une mise en ligne.
 * Ne renvoie aucune donnée du restaurant ni aucun secret, seulement de quoi comprendre une panne.
 */
export async function GET() {
  const details: Record<string, unknown> = {};
  const base = postgresConfigured();
  const blob = blobConfigured();
  const hote = ephemeralHost();

  if (hote) {
    // Permet de distinguer l'environnement servi : une variable cochée pour la production
    // n'existe pas dans un déploiement de préversion.
    details.environnement = process.env.VERCEL_ENV || "inconnu";
    const commit = (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7);
    if (commit) details.version = commit;
  }
  details.variables = variables();

  details.donnees = base ? "base de données" : "classeur Excel sur disque";
  details.fichiers = blob ? "dépôt Blob" : "disque";
  if (!base) {
    try {
      details.dossier = storageRoot();
    } catch {
      details.dossier = "chemin invalide";
    }
  }
  if (hote && (!base || !blob)) {
    details.avertissement = `Hébergement ${hote} : ${!base ? "les données" : "les images et les sauvegardes"} ont besoin d'un stockage qui survit aux requêtes.`;
  }

  try {
    appSecret();
  } catch (e) {
    return json({ ok: false, etat: "configuration", message: isAppError(e) ? e.message : "OLIVA_SECRET est absent.", ...details }, 503);
  }

  try {
    await readDb();
    return json({ ok: true, etat: "pret", ...details }, 200);
  } catch (e) {
    const message = isAppError(e) ? e.message : "Le stockage est inaccessible. Consultez les journaux du serveur.";
    return json({ ok: false, etat: isAppError(e) ? e.code : "stockage", message, ...details }, 503);
  }
}
