import type { Metadata } from "next";
import { ChefShell } from "@/components/responsable/shell";
import { requireStaffPage } from "@/lib/server/auth/session";
import { ID } from "@/lib/server/defaults";
import { publishedSnapshot } from "@/lib/server/services/publication";
import { chefTables } from "@/lib/server/services/responsable";
import { readDb } from "@/lib/server/storage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "Espace responsable", template: "%s · Espace responsable Oliva" }, robots: { index: false, follow: false } };

/**
 * Espace responsable de salle. Premier contrôle ici, puis chaque page revérifie sa permission :
 * `tables.affecter` distingue le responsable du serveur, qui reste dans /salle.
 */
export default async function ChefLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireStaffPage("tables.affecter");
  const db = await readDb();
  const resto = db.Restaurant[0];
  const snap = publishedSnapshot(db)?.snap;
  const logo = snap?.Medias.find((m) => m.id === snap.Restaurant[0]?.logoMediaId);
  const securite = db.ParametresSecurite.find((p) => p.id === ID.securite);
  const tables = chefTables(db, auth);
  const ouvertes = tables.filter((t) => t.sessionId).length;
  return (
    <ChefShell
      csrf={auth.csrf}
      user={{ nom: auth.actor.nom, role: auth.role.nom }}
      brand={{ nom: resto?.nom || "Oliva", sousTitre: resto?.sousTitre ?? "", logo: logo ? `/media/${logo.miniature}` : null }}
      politique={{ min: securite?.motDePasseMin ?? 10, lettreChiffre: securite?.exigerLettreChiffre ?? true, special: securite?.exigerSpecial ?? false }}
      counts={{ demandes: tables.reduce((n, t) => n + t.demandes, 0), aServir: tables.reduce((n, t) => n + t.pretes, 0) }}
      etat={ouvertes === 0 ? "Aucune table en service" : `${ouvertes} table${ouvertes > 1 ? "s" : ""} en service`}
    >
      {children}
    </ChefShell>
  );
}
