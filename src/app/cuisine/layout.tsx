import type { Metadata } from "next";
import { CuisineShell } from "@/components/cuisine/shell";
import { requireStaffPage } from "@/lib/server/auth/session";
import { ID } from "@/lib/server/defaults";
import { kitchenOf } from "@/lib/server/services/cuisine";
import { publishedSnapshot } from "@/lib/server/services/publication";
import { readDb } from "@/lib/server/storage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "Cuisine", template: "%s · Cuisine Oliva" }, robots: { index: false, follow: false } };

/**
 * Écran de cuisine. Premier contrôle ici, puis chaque page revérifie sa permission :
 * un rôle sans `preparation.changer` n'entre pas, et la station du membre limite ce qu'il voit.
 */
export default async function CuisineLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireStaffPage("preparation.changer");
  const db = await readDb();
  const resto = db.Restaurant[0];
  // Le logo vient de la version publiée : l'écran de cuisine n'ouvre pas les images de brouillon.
  const snap = publishedSnapshot(db)?.snap;
  const logo = snap?.Medias.find((m) => m.id === snap.Restaurant[0]?.logoMediaId);
  const securite = db.ParametresSecurite.find((p) => p.id === ID.securite);
  return (
    <CuisineShell
      csrf={auth.csrf}
      user={{ nom: auth.actor.nom, role: auth.role.nom }}
      brand={{ nom: resto?.nom || "Oliva", sousTitre: resto?.sousTitre ?? "", logo: logo ? `/media/${logo.miniature}` : null }}
      politique={{ min: securite?.motDePasseMin ?? 10, lettreChiffre: securite?.exigerLettreChiffre ?? true, special: securite?.exigerSpecial ?? false }}
      aPreparer={kitchenOf(db, auth).aPreparer.length}
    >
      {children}
    </CuisineShell>
  );
}
