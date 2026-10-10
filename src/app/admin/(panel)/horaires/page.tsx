import type { Metadata } from "next";
import { requirePage } from "@/lib/server/auth/session";
import { ID } from "@/lib/server/defaults";
import { must } from "@/lib/server/db-utils";
import { readDb } from "@/lib/server/storage";
import { HorairesEditor } from "./editor";

export const metadata: Metadata = { title: "Horaires" };

export default async function Page() {
  await requirePage("restaurant.configurer");
  const db = await readDb();
  const p = must(db, "ParametresCommandes", ID.commandes);
  return (
    <HorairesEditor
      initial={{
        jours: [...db.Horaires].sort((a, b) => a.jour - b.jour).map((h) => ({ jour: h.jour, ouvert: h.ouvert, plages: h.plages ?? [] })),
        arretAvantFermetureMin: p.arretAvantFermetureMin,
        messageHorsHoraires: p.messageHorsHoraires,
      }}
      exceptions={[...db.Exceptions].sort((a, b) => a.date.localeCompare(b.date))}
    />
  );
}
