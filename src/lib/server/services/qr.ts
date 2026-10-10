import "server-only";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { publicUrl } from "../env";

/** Adresse publique du site : valeur configurée, sinon celle de la requête en cours. */
export async function siteBase(): Promise<string> {
  const configured = publicUrl();
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Adresse encodée dans le QR code d'une table.
 * Le jeton `k` dit de quelle affichette vient la personne : quand le personnel remplace le QR code,
 * les anciennes affichettes sont reconnues comme périmées. Il n'autorise rien par lui-même.
 */
export const tableUrl = (base: string, table: { id: string; qrJeton: string }) =>
  `${base}/table/${table.id}${table.qrJeton ? `?k=${encodeURIComponent(table.qrJeton)}` : ""}`;

/** QR code réel (SVG) vers l'adresse de la table. Le QR identifie la table : il ne donne aucun droit à lui seul. */
export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#1b2a20", light: "#ffffff" } });
}

export const isLocalBase = (base: string) => /\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(base);
