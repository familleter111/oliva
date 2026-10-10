import type { Metadata } from "next";
import { requirePage } from "@/lib/server/auth/session";
import { LANGUES } from "@/lib/server/api/routes/reglages";
import { readDb } from "@/lib/server/storage";
import { mediaList, thumbOf } from "@/lib/server/view";
import { ApparenceEditor } from "./editor";

export const metadata: Metadata = { title: "Apparence" };

export default async function Page() {
  await requirePage("restaurant.configurer");
  const db = await readDb();
  const a = db.Apparence[0];
  const r = db.Restaurant[0];

  // Textes traduisibles du menu client, dans la langue principale.
  const textes = [
    { cle: "restaurant.sousTitre", label: "Sous-titre du restaurant", source: r.sousTitre },
    { cle: "restaurant.description", label: "Description du restaurant", source: r.description },
    { cle: "apparence.titreAccueil", label: "Titre d'accueil", source: a.titreAccueil },
    { cle: "apparence.texteBanniere", label: "Texte de la bannière", source: a.texteBanniere },
    ...db.Categories.flatMap((c) => [
      { cle: `categorie:${c.id}.nom`, label: `Catégorie : ${c.nom}`, source: c.nom },
      { cle: `categorie:${c.id}.description`, label: `Catégorie : ${c.nom} (description)`, source: c.description },
    ]),
    ...db.Produits.flatMap((p) => [
      { cle: `produit:${p.id}.nom`, label: `Produit : ${p.nom}`, source: p.nom },
      { cle: `produit:${p.id}.description`, label: `Produit : ${p.nom} (description)`, source: p.description },
    ]),
    ...db.GroupesOptions.map((g) => ({ cle: `groupe:${g.id}.nom`, label: `Groupe d'options : ${g.nom}`, source: g.nom })),
    ...db.Options.map((o) => ({ cle: `option:${o.id}.nom`, label: `Option : ${o.nom}`, source: o.nom })),
  ].filter((t) => t.source.trim() !== "");

  const first = [...db.Produits].sort((x, y) => x.ordre - y.ordre).find((p) => p.visible && p.imageMediaId);
  return (
    <ApparenceEditor
      apparence={{ couleurFond: a.couleurFond, couleurPrimaire: a.couleurPrimaire, couleurTexte: a.couleurTexte, couleurBordures: a.couleurBordures, banniereMediaId: a.banniereMediaId, titreAccueil: a.titreAccueil, texteBanniere: a.texteBanniere }}
      medias={mediaList(db)}
      langues={[...db.Langues].sort((x, y) => x.ordre - y.ordre)}
      disponibles={Object.entries(LANGUES).map(([id, nom]) => ({ id, nom }))}
      textes={textes}
      traductions={db.Traductions.map((t) => ({ langue: t.langue, cle: t.cle, valeur: t.valeur }))}
      apercu={{
        nom: r.nom,
        sousTitre: r.sousTitre,
        devise: r.devise,
        categories: [...db.Categories].sort((x, y) => x.ordre - y.ordre).filter((c) => c.visible).slice(0, 4).map((c) => c.nom),
        produit: first ? { nom: first.nom, description: first.description, prixCentimes: first.prixCentimes, image: thumbOf(db, first.imageMediaId) } : null,
      }}
    />
  );
}
