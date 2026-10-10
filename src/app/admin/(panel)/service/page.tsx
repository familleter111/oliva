import type { Metadata } from "next";
import { requirePage } from "@/lib/server/auth/session";
import { serviceState } from "@/lib/server/services/table";
import { readDb } from "@/lib/server/storage";
import { ServiceBoard } from "./board";

export const metadata: Metadata = { title: "Service en direct" };

export default async function Page() {
  const auth = await requirePage("commandes.voir");
  const db = await readDb();
  return (
    <ServiceBoard
      initial={serviceState(db)}
      fuseau={db.Restaurant[0]?.fuseauHoraire || "Europe/Paris"}
      droits={{ preparer: auth.can("preparation.changer"), servir: auth.can("commandes.servir"), sessions: auth.can("sessions.gerer"), salle: auth.can("salle.configurer") }}
    />
  );
}
