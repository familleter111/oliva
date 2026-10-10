import type { Metadata } from "next";
import { requirePage } from "@/lib/server/auth/session";
import { ID } from "@/lib/server/defaults";
import { must } from "@/lib/server/db-utils";
import { readDb } from "@/lib/server/storage";
import { thumbOf } from "@/lib/server/view";
import { PanierEditor } from "./editor";

export const metadata: Metadata = { title: "Panier partagé" };

export default async function Page() {
  await requirePage("restaurant.configurer");
  const db = await readDb();
  const p = must(db, "ParametresCommandes", ID.commandes);
  const exemple = [...db.Produits].sort((a, b) => a.ordre - b.ordre).filter((x) => x.visible).slice(0, 3);
  return (
    <PanierEditor
      devise={db.Restaurant[0]?.devise || "EUR"}
      table={db.Tables.find((t) => !t.archiveeLe)?.nom ?? "Table 01"}
      exemple={exemple.map((x, i) => ({ nom: x.nom, prixCentimes: x.prixCentimes, quantite: i === 2 ? 1 : 2, image: thumbOf(db, x.imageMediaId) }))}
      initial={{ quantiteMax: p.quantiteMax, instructionsActives: p.instructionsActives, instructionsMax: p.instructionsMax, confirmation: p.confirmation, animations: p.animations, pseudoActif: p.pseudoActif, pseudoMode: p.pseudoMode, libelleBouton: p.libelleBouton, commandesSuccessives: p.commandesSuccessives }}
    />
  );
}
