import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { JoinScreen } from "@/components/table/join";
import { TableApp } from "@/components/table/shell";
import { LANG_COOKIE } from "@/lib/i18n/config";
import { tableToken } from "@/lib/server/api/table";
import { publicMenu } from "@/lib/server/services/menu";
import { admitted, tableGate, tableState } from "@/lib/server/services/table";
import { readDb } from "@/lib/server/storage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Parcours d'une table après lecture du QR code.
 * L'identifiant de table dans l'adresse ne donne accès à rien : sans jeton de participant valide
 * (remis contre le code de session ou la validation du personnel), seul l'écran d'accueil s'affiche.
 * Aucun panier, aucune commande ni aucun nom de convive n'est rendu avant l'admission.
 */
export default async function TableLayout({ params, children }: { params: Promise<{ tableId: string }>; children: ReactNode }) {
  const { tableId } = await params;
  if (!/^[\w-]{4,60}$/.test(tableId)) notFound();
  const db = await readDb();
  const jeton = await tableToken();
  const gate = tableGate(db, tableId, jeton);
  if (!gate) notFound();
  if (!jeton || !admitted(db, tableId, jeton)) return <JoinScreen gate={gate} />;
  const lang = (await cookies()).get(LANG_COOKIE)?.value === "en" ? "en" : "";
  return (
    <TableApp initial={tableState(db, jeton)} menu={await publicMenu(lang)}>
      {children}
    </TableApp>
  );
}
