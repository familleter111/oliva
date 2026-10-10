import { CallBell, ChatCircleDots, CheckCircle, Clock } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { StatCard } from "@/components/responsable/parts";
import { Callout, PageHeader } from "@/components/ui";
import { requireStaffPage } from "@/lib/server/auth/session";
import { serviceFollow } from "@/lib/server/services/responsable";
import { readDb } from "@/lib/server/storage";
import { ServiceBoard } from "./board";

export const metadata: Metadata = { title: "Suivi du service" };

export default async function Page() {
  const auth = await requireStaffPage("tables.affecter");
  const db = await readDb();
  const vue = serviceFollow(db, auth);
  return (
    <>
      <PageHeader eyebrow="Votre service" title="Le bon plat, au bon moment." subtitle="Suivez les commandes de la salle et le serveur chargé de les apporter." />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<CallBell size={22} />} label="Commandes à servir" value={vue.stats.aServir} accent={vue.stats.aServir > 0} />
        <StatCard icon={<Clock size={22} />} label="En préparation" value={vue.stats.enPreparation} />
        <StatCard icon={<CheckCircle size={22} />} label="Commandes servies" value={vue.stats.servies} />
        <StatCard icon={<ChatCircleDots size={22} />} label="Demandes en attente" value={vue.stats.demandes} accent={vue.stats.demandes > 0} />
      </div>

      <ServiceBoard data={vue} fuseau={db.Restaurant[0]?.fuseauHoraire || "Europe/Paris"} />

      <Callout tone="olive" className="mt-5">
        La cuisine met à jour la préparation. Le serveur confirme le service à table.
      </Callout>
    </>
  );
}
