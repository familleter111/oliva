import { appSecret, ephemeralHost, storageRoot } from "@/lib/server/env";
import { isAppError } from "@/lib/server/errors";
import { readDb } from "@/lib/server/storage";

export const dynamic = "force-dynamic";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  });

/**
 * État du service, destiné à l'exploitation : sonde de l'hébergeur et diagnostic après une mise en ligne.
 * Ne renvoie aucune donnée du restaurant ni aucun secret, seulement la cause d'une panne de stockage.
 */
export async function GET() {
  const details: Record<string, string> = {};
  const hote = ephemeralHost();
  if (hote) details.hebergement = `${hote} (système de fichiers éphémère, incompatible)`;
  try {
    details.stockage = storageRoot();
  } catch {
    details.stockage = "chemin invalide";
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
