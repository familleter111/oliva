import { Plant } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireStaffPage } from "@/lib/server/auth/session";
import { requestList } from "@/lib/server/services/salle";
import { readDb } from "@/lib/server/storage";
import { RequestBoard } from "./board";

export const metadata: Metadata = { title: "Demandes clients" };

export default async function Page() {
  const auth = await requireStaffPage("commandes.servir");
  const db = await readDb();
  return (
    <>
      <PageHeader
        eyebrow="Salle"
        title="Un coup de main, au bon moment."
        subtitle="Les demandes des clients de vos tables."
        actions={
          <div className="max-w-xs rounded-2xl border border-olive/15 bg-olive-soft px-4 py-3">
            <p className="flex items-center gap-2 text-[1.05rem] font-semibold text-ink">
              <Plant size={19} weight="fill" aria-hidden className="text-olive" />
              Le bon réflexe
            </p>
            <p className="mt-1 text-[14.5px] leading-snug text-text">Prenez en charge la demande avant de vous rendre à la table. Marquez-la traitée après votre intervention.</p>
          </div>
        }
      />
      <RequestBoard demandes={requestList(db, auth)} fuseau={db.Restaurant[0]?.fuseauHoraire || "Europe/Paris"} />
    </>
  );
}
