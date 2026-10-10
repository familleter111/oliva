import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/server/auth/session";
import { readDb } from "@/lib/server/storage";
import { mediaList } from "@/lib/server/view";
import { ProduitForm } from "./form";

export const metadata: Metadata = { title: "Fiche produit" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requirePage("carte.modifier");
  const { id } = await params;
  const db = await readDb();
  const p = id === "nouveau" ? null : db.Produits.find((x) => x.id === id);
  if (id !== "nouveau" && !p) notFound();
  const byOrdre = <T extends { ordre: number }>(rows: T[]) => [...rows].sort((a, b) => a.ordre - b.ordre);
  const cats = byOrdre(db.Categories);
  return (
    <ProduitForm
      id={p?.id ?? ""}
      initial={{
        nom: p?.nom ?? "",
        description: p?.description ?? "",
        categorieId: p?.categorieId ?? cats[0]?.id ?? "",
        prixCentimes: p?.prixCentimes ?? 0,
        imageMediaId: p?.imageMediaId ?? "",
        allergeneIds: p?.allergeneIds ?? [],
        etiquetteIds: p?.etiquetteIds ?? [],
        groupeOptionIds: p?.groupeOptionIds ?? [],
        tempsPreparationMin: p?.tempsPreparationMin ?? null,
        disponible: p?.disponible ?? true,
        visible: p?.visible ?? true,
      }}
      devise={db.Restaurant[0]?.devise || "EUR"}
      categories={cats.map((c) => ({ id: c.id, nom: c.nom }))}
      allergenes={byOrdre(db.Allergenes).map((a) => ({ id: a.id, nom: a.nom }))}
      etiquettes={byOrdre(db.Etiquettes).map((e) => ({ id: e.id, nom: e.nom }))}
      groupes={byOrdre(db.GroupesOptions).map((g) => ({ id: g.id, nom: g.nom }))}
      medias={mediaList(db)}
    />
  );
}
