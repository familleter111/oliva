import type { Metadata } from "next";
import { requirePage } from "@/lib/server/auth/session";
import { DEVISES } from "@/lib/server/api/routes/reglages";
import { readDb } from "@/lib/server/storage";
import { mediaList } from "@/lib/server/view";
import { EtablissementEditor } from "./editor";

export const metadata: Metadata = { title: "Établissement" };

export default async function Page() {
  await requirePage("restaurant.configurer");
  const db = await readDb();
  const r = db.Restaurant[0];
  return (
    <EtablissementEditor
      restaurant={{ nom: r.nom, sousTitre: r.sousTitre, description: r.description, adresse: r.adresse, telephone: r.telephone, email: r.email, devise: r.devise, fuseauHoraire: r.fuseauHoraire, languePrincipale: r.languePrincipale, logoMediaId: r.logoMediaId }}
      medias={mediaList(db)}
      devises={[...DEVISES]}
      langues={db.Langues.map((l) => ({ id: l.id, nom: l.nom }))}
    />
  );
}
