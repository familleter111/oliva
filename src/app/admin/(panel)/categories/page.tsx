import type { Metadata } from "next";
import { requirePage } from "@/lib/server/auth/session";
import { readDb } from "@/lib/server/storage";
import { mediaList, thumbOf } from "@/lib/server/view";
import { CategoriesEditor } from "./editor";

export const metadata: Metadata = { title: "Listes & catégories" };

export default async function Page() {
  await requirePage("carte.modifier");
  const db = await readDb();
  const byOrdre = <T extends { ordre: number }>(rows: T[]) => [...rows].sort((a, b) => a.ordre - b.ordre);
  return (
    <CategoriesEditor
      categories={byOrdre(db.Categories).map((c) => ({ id: c.id, nom: c.nom, description: c.description, imageMediaId: c.imageMediaId, visible: c.visible, image: thumbOf(db, c.imageMediaId), produits: db.Produits.filter((p) => p.categorieId === c.id).length }))}
      allergenes={byOrdre(db.Allergenes).map((a) => ({ id: a.id, nom: a.nom }))}
      etiquettes={byOrdre(db.Etiquettes).map((e) => ({ id: e.id, nom: e.nom, couleur: e.couleur }))}
      motifs={byOrdre(db.MotifsDemandes).map((m) => ({ id: m.id, libelle: m.libelle, couleur: m.couleur, actif: m.actif }))}
      medias={mediaList(db)}
    />
  );
}
