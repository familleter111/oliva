import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/shell";
import { requirePage } from "@/lib/server/auth/session";
import { draftSummary } from "@/lib/server/services/publication";
import { serviceCounts } from "@/lib/server/services/table";
import { readDb } from "@/lib/server/storage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "Administration", template: "%s · Administration Oliva" }, robots: { index: false, follow: false } };

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  // Premier contrôle. Chaque page revérifie ensuite sa propre permission.
  const auth = await requirePage();
  const db = await readDb();
  const resto = db.Restaurant[0];
  const logo = db.Medias.find((m) => m.id === resto?.logoMediaId);
  const securite = db.ParametresSecurite[0];
  return (
    <AdminShell
      csrf={auth.csrf}
      user={{ nom: auth.actor.nom, role: auth.role.nom }}
      perms={[...auth.permissions.keys()]}
      counts={serviceCounts(db)}
      demo={db._meta.donneesDemo}
      draft={draftSummary(db)}
      brand={{ nom: resto?.nom || "Oliva", sousTitre: resto?.sousTitre ?? "", logo: logo ? `/api/admin/medias/fichier/${logo.miniature}` : null }}
      politique={{ min: securite?.motDePasseMin ?? 10, lettreChiffre: securite?.exigerLettreChiffre ?? true, special: securite?.exigerSpecial ?? false }}
    >
      {children}
    </AdminShell>
  );
}
