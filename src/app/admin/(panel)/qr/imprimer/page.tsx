import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { Callout, buttonClass } from "@/components/ui";
import { requirePage } from "@/lib/server/auth/session";
import { isLocalBase, qrSvg, siteBase, tableUrl } from "@/lib/server/services/qr";
import { readDb } from "@/lib/server/storage";
import { thumbOf } from "@/lib/server/view";
import { QrSupport } from "../editor";
import { PrintButton } from "./print";

export const metadata: Metadata = { title: "Supports à imprimer" };

export default async function Page({ searchParams }: { searchParams: Promise<{ table?: string }> }) {
  await requirePage("salle.configurer");
  const { table } = await searchParams;
  const db = await readDb();
  const all = db.Tables.filter((t) => !t.archiveeLe && t.active).sort((a, b) => a.nom.localeCompare(b.nom, "fr", { numeric: true }));
  const tables = table && table !== "toutes" ? all.filter((t) => t.id === table) : all;
  const base = await siteBase();
  const resto = db.Restaurant[0];
  const marque = { nom: resto?.nom || "Oliva", sousTitre: resto?.sousTitre ?? "", logo: thumbOf(db, resto?.logoMediaId ?? "") };
  const supports = await Promise.all(tables.map(async (t) => ({ id: t.id, nom: t.nom, svg: await qrSvg(tableUrl(base, t.id)) })));

  return (
    <>
      <div className="no-print mb-6 flex flex-wrap items-center gap-3">
        <Link href="/admin/qr" className={buttonClass("secondary")}>
          <ArrowLeft size={18} /> Retour
        </Link>
        <PrintButton />
        <p className="text-[15px] text-muted">
          {supports.length} support{supports.length > 1 ? "s" : ""}. Dans la fenêtre d'impression, choisissez « Enregistrer au format PDF » pour obtenir un fichier.
        </p>
      </div>
      {isLocalBase(base) ? (
        <Callout tone="warn" className="no-print mb-6" title="Adresse locale détectée">
          Ces QR codes pointent vers {base}. Renseignez OLIVA_PUBLIC_URL avant d'imprimer pour vos tables.
        </Callout>
      ) : null}
      <ul className="grid grid-cols-2 gap-6 md:grid-cols-3 print:grid-cols-2 print:gap-10">
        {supports.map((s) => (
          <li key={s.id} className="break-inside-avoid">
            <QrSupport nom={s.nom} svg={s.svg} marque={marque} />
          </li>
        ))}
      </ul>
    </>
  );
}
