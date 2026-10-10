import type { Metadata } from "next";
import { SalleShell } from "@/components/salle/shell";
import { requireStaffPage } from "@/lib/server/auth/session";
import { ID } from "@/lib/server/defaults";
import { publishedSnapshot } from "@/lib/server/services/publication";
import { countsOf } from "@/lib/server/services/salle";
import { readDb } from "@/lib/server/storage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "Espace serveur", template: "%s · Espace serveur Oliva" }, robots: { index: false, follow: false } };

/**
 * Espace serveur. Premier contrôle ici, puis chaque page revérifie sa permission :
 * un rôle sans `commandes.servir` n'entre pas, et la portée du rôle limite les tables visibles.
 */
export default async function SalleLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireStaffPage("commandes.servir");
  const db = await readDb();
  const resto = db.Restaurant[0];
  // Le logo vient de la version publiée : l'espace serveur n'ouvre pas les images de brouillon.
  const snap = publishedSnapshot(db)?.snap;
  const logo = snap?.Medias.find((m) => m.id === snap.Restaurant[0]?.logoMediaId);
  const securite = db.ParametresSecurite.find((p) => p.id === ID.securite);
  return (
    <SalleShell
      csrf={auth.csrf}
      user={{ nom: auth.actor.nom, role: auth.role.nom }}
      brand={{ nom: resto?.nom || "Oliva", sousTitre: resto?.sousTitre ?? "", logo: logo ? `/media/${logo.miniature}` : null }}
      counts={countsOf(db, auth)}
      politique={{ min: securite?.motDePasseMin ?? 10, lettreChiffre: securite?.exigerLettreChiffre ?? true, special: securite?.exigerSpecial ?? false }}
    >
      {children}
    </SalleShell>
  );
}
