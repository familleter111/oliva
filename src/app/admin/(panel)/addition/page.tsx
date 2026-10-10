import type { Metadata } from "next";
import { requirePage } from "@/lib/server/auth/session";
import { DEVISES } from "@/lib/server/api/routes/reglages";
import { ID } from "@/lib/server/defaults";
import { must } from "@/lib/server/db-utils";
import { readDb } from "@/lib/server/storage";
import { AdditionEditor } from "./editor";

export const metadata: Metadata = { title: "Addition & règlement" };

export default async function Page() {
  await requirePage("restaurant.configurer");
  const db = await readDb();
  const a = must(db, "ParametresAddition", ID.addition);
  return (
    <AdditionEditor
      initial={{ devise: a.devise, affichagePrix: a.affichagePrix, arrondi: a.arrondi, fraisServiceActif: a.fraisServiceActif, fraisServiceBp: a.fraisServiceBp, partageActif: a.partageActif }}
      devises={[...DEVISES]}
      taxes={db.ProfilsTaxes.map((t) => ({ id: t.id, nom: t.nom, tauxBp: t.tauxBp, parDefaut: t.parDefaut, statut: t.statut }))}
      table={db.Tables.find((t) => !t.archiveeLe)?.nom ?? "Table 01"}
    />
  );
}
