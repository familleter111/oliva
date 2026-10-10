import type { Metadata } from "next";
import { requirePage } from "@/lib/server/auth/session";
import { readDb } from "@/lib/server/storage";
import { adminFile } from "@/lib/server/view";
import { ProduitsList } from "./list";

export const metadata: Metadata = { title: "Produits" };

export default async function Page() {
  await requirePage("carte.modifier");
  const db = await readDb();
  const medias = new Map(db.Medias.map((m) => [m.id, m]));
  const cats = [...db.Categories].sort((a, b) => a.ordre - b.ordre);
  const rank = new Map(cats.map((c, i) => [c.id, i]));
  return (
    <ProduitsList
      devise={db.Restaurant[0]?.devise || "EUR"}
      categories={cats.map((c) => ({ id: c.id, nom: c.nom }))}
      produits={[...db.Produits]
        .sort((a, b) => (rank.get(a.categorieId) ?? 0) - (rank.get(b.categorieId) ?? 0) || a.ordre - b.ordre)
        .map((p) => {
          const m = medias.get(p.imageMediaId);
          return { id: p.id, nom: p.nom, description: p.description, categorieId: p.categorieId, prixCentimes: p.prixCentimes, disponible: p.disponible, visible: p.visible, options: p.groupeOptionIds.length, thumb: m ? adminFile(m.miniature) : null, image: m ? adminFile(m.fichier) : null };
        })}
    />
  );
}
