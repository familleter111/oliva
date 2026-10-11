import type { Metadata } from "next";
import { Callout, PageHeader } from "@/components/ui";
import { requireStaffPage } from "@/lib/server/auth/session";
import { serveList } from "@/lib/server/services/salle";
import { readDb } from "@/lib/server/storage";
import { ServeBoard } from "./board";

export const metadata: Metadata = { title: "À servir" };

export default async function Page() {
  const auth = await requireStaffPage("commandes.servir");
  const db = await readDb();
  return (
    <>
      <PageHeader
        eyebrow="Service"
        title="C'est prêt, à vous de servir."
        subtitle="Les commandes de vos tables : prêtes, encore en cuisine, ou déjà servies."
        actions={
          <Callout tone="olive" className="max-w-xs">Signalez une commande servie après l'avoir apportée à la table.</Callout>
        }
      />
      <ServeBoard data={serveList(db, auth)} fuseau={db.Restaurant[0]?.fuseauHoraire || "Europe/Paris"} />
    </>
  );
}
