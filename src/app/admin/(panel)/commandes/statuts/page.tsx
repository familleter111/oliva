import type { Metadata } from "next";
import { requirePage } from "@/lib/server/auth/session";
import { ID } from "@/lib/server/defaults";
import { fullName, must } from "@/lib/server/db-utils";
import { readDb } from "@/lib/server/storage";
import { StatutsEditor } from "./editor";

export const metadata: Metadata = { title: "Statuts & préparation" };

export default async function Page() {
  await requirePage("restaurant.configurer");
  const db = await readDb();
  const p = must(db, "ParametresCommandes", ID.commandes);
  const byOrdre = <T extends { ordre: number }>(rows: T[]) => [...rows].sort((a, b) => a.ordre - b.ordre);
  return (
    <StatutsEditor
      statuts={byOrdre(db.StatutsCommande).map((s) => ({ id: s.id, nom: s.nom, couleur: s.couleur, visibleClient: s.visibleClient, acteur: s.acteur, creation: s.creation, systeme: s.systeme }))}
      stations={byOrdre(db.StationsPreparation).map((s) => ({ id: s.id, nom: s.nom, notifierServeur: s.notifierServeur, equipe: db.Utilisateurs.filter((u) => u.stationId === s.id).map(fullName) }))}
      categories={byOrdre(db.Categories).map((c) => ({ id: c.id, nom: c.nom, stationId: c.stationId }))}
      annulation={{ annulationRole: p.annulationRole, annulationMotif: p.annulationMotif, annulationHistorique: p.annulationHistorique }}
    />
  );
}
