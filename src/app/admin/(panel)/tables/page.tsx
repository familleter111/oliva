import type { Metadata } from "next";
import { requirePage } from "@/lib/server/auth/session";
import { fullName } from "@/lib/server/db-utils";
import { readDb } from "@/lib/server/storage";
import { TablesEditor } from "./editor";

export const metadata: Metadata = { title: "Zones & tables" };

export default async function Page() {
  await requirePage("salle.configurer");
  const db = await readDb();
  const open = new Set(db.SessionsTable.filter((s) => s.statut === "ouverte").map((s) => s.tableId));
  return (
    <TablesEditor
      zones={[...db.Zones].sort((a, b) => a.ordre - b.ordre).map((z) => ({ id: z.id, nom: z.nom, active: z.active, icone: z.icone }))}
      tables={db.Tables.filter((t) => !t.archiveeLe)
        .sort((a, b) => a.nom.localeCompare(b.nom, "fr", { numeric: true }))
        .map((t) => ({ id: t.id, nom: t.nom, zoneId: t.zoneId, capacite: t.capacite, active: t.active, serveurId: t.serveurId, couleur: t.couleur, session: open.has(t.id) }))}
      personnel={db.Utilisateurs.filter((u) => u.statut !== "suspendu").map((u) => ({ id: u.id, nom: fullName(u) }))}
    />
  );
}
