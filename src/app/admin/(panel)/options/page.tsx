import type { Metadata } from "next";
import { requirePage } from "@/lib/server/auth/session";
import { readDb } from "@/lib/server/storage";
import { thumbOf } from "@/lib/server/view";
import { OptionsEditor } from "./editor";

export const metadata: Metadata = { title: "Options & variantes" };

export default async function Page() {
  await requirePage("carte.modifier");
  const db = await readDb();
  const groupes = [...db.GroupesOptions].sort((a, b) => a.ordre - b.ordre);
  return (
    <OptionsEditor
      devise={db.Restaurant[0]?.devise || "EUR"}
      groupes={groupes.map((g) => ({
        id: g.id,
        nom: g.nom,
        selection: g.selection,
        min: g.min,
        max: g.max,
        produitIds: db.Produits.filter((p) => p.groupeOptionIds.includes(g.id)).map((p) => p.id),
        options: db.Options.filter((o) => o.groupeId === g.id).sort((a, b) => a.ordre - b.ordre).map((o) => ({ id: o.id, nom: o.nom, prixCentimes: o.prixCentimes, disponible: o.disponible })),
      }))}
      produits={[...db.Produits].sort((a, b) => a.ordre - b.ordre).map((p) => ({ id: p.id, nom: p.nom, description: p.description, image: thumbOf(db, p.imageMediaId) }))}
    />
  );
}
