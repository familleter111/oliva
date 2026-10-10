import type { Metadata } from "next";
import { requirePage } from "@/lib/server/auth/session";
import { draftChanges, effectiveVersion, publicationProblems, scheduledVersion } from "@/lib/server/services/publication";
import { readDb } from "@/lib/server/storage";
import { PublicationEditor } from "./editor";

export const metadata: Metadata = { title: "Vérifier & publier" };

export default async function Page() {
  await requirePage("publication.publier");
  const db = await readDb();
  const current = effectiveVersion(db);
  const scheduled = scheduledVersion(db);
  return (
    <PublicationEditor
      fuseau={db.Restaurant[0]?.fuseauHoraire || ""}
      changements={current ? draftChanges(db) : []}
      premiere={!current}
      resume={{ produits: db.Produits.filter((p) => p.visible).length, categories: db.Categories.filter((c) => c.visible).length }}
      problemes={publicationProblems(db)}
      sessionsOuvertes={db.SessionsTable.filter((s) => s.statut === "ouverte").length}
      enLigne={current ? { numero: current.numero, date: current.publieeLe || current.programmeePour, auteur: current.auteurNom } : null}
      programmee={scheduled ? { numero: scheduled.numero, date: scheduled.programmeePour, auteur: scheduled.auteurNom, changements: scheduled.nbChangements } : null}
      versions={[...db.VersionsConfiguration].sort((a, b) => b.numero - a.numero).slice(0, 8).map((v) => ({ id: v.id, numero: v.numero, statut: v.statut, date: v.publieeLe || v.programmeePour, auteur: v.auteurNom, changements: v.nbChangements }))}
    />
  );
}
