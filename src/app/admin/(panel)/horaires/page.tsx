import type { Metadata } from "next";
import { requirePage } from "@/lib/server/auth/session";
import { ID } from "@/lib/server/defaults";
import { must } from "@/lib/server/db-utils";
import { orderingState } from "@/lib/server/services/menu";
import { readDb } from "@/lib/server/storage";
import { HorairesEditor } from "./editor";

export const metadata: Metadata = { title: "Horaires" };

export default async function Page() {
  await requirePage("restaurant.configurer");
  const db = await readDb();
  const p = must(db, "ParametresCommandes", ID.commandes);
  // État réel au moment de l'affichage : c'est ce que voit un client attablé.
  const prise = orderingState(db.Horaires, db.Exceptions, db.Restaurant[0]?.fuseauHoraire ?? "Europe/Paris", p.arretAvantFermetureMin);
  return (
    <HorairesEditor
      initial={{
        jours: [...db.Horaires].sort((a, b) => a.jour - b.jour).map((h) => ({ jour: h.jour, ouvert: h.ouvert, plages: h.plages ?? [] })),
        arretAvantFermetureMin: p.arretAvantFermetureMin,
        messageHorsHoraires: p.messageHorsHoraires,
      }}
      exceptions={[...db.Exceptions].sort((a, b) => a.date.localeCompare(b.date))}
      prise={prise}
    />
  );
}
