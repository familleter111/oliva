import type { Metadata } from "next";
import { requirePage } from "@/lib/server/auth/session";
import { readDb } from "@/lib/server/storage";
import { NotificationsEditor } from "./editor";

export const metadata: Metadata = { title: "Notifications & demandes" };

export default async function Page() {
  await requirePage("restaurant.configurer");
  const db = await readDb();
  const byOrdre = <T extends { ordre: number }>(rows: T[]) => [...rows].sort((a, b) => a.ordre - b.ordre);
  return (
    <NotificationsEditor
      regles={byOrdre(db.ReglesNotifications).map((r) => ({ id: r.id, evenement: r.evenement, destinataires: r.destinataires, ecran: r.ecran, son: r.son, delaiMin: r.delaiMin, accuse: r.accuse, sonnerie: r.sonnerie, actif: r.actif }))}
      motifs={byOrdre(db.MotifsDemandes).map((m) => ({ id: m.id, libelle: m.libelle, couleur: m.couleur, actif: m.actif }))}
    />
  );
}
