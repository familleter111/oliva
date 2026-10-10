import { ArrowLeft, Eye, RocketLaunch } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { MenuView } from "@/components/menu/menu-view";
import { buttonClass } from "@/components/ui";
import { requirePage } from "@/lib/server/auth/session";
import { draftMenu } from "@/lib/server/services/menu";

export const metadata: Metadata = { title: "Aperçu client" };

/** Aperçu du brouillon, réservé au personnel autorisé. Le public ne voit que la version publiée. */
export default async function Page({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const auth = await requirePage();
  const { lang } = await searchParams;
  const data = await draftMenu(lang ?? "");
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-warn/20 bg-warn-soft px-4 py-3 text-warn">
        <Eye size={22} className="shrink-0" />
        <p className="min-w-48 flex-1 text-[15.5px]">
          <strong className="font-semibold">Aperçu du brouillon.</strong> Vos clients voient uniquement la dernière version publiée.
        </p>
        <Link href="/admin" className={buttonClass("secondary", "sm")}>
          <ArrowLeft size={16} /> Retour
        </Link>
        {auth.can("publication.publier") ? (
          <Link href="/admin/publication" className={buttonClass("primary", "sm")}>
            <RocketLaunch size={16} /> Vérifier et publier
          </Link>
        ) : null}
      </div>
      <div className="overflow-hidden rounded-3xl border border-line shadow-card [&_header]:!static [&_#carte]:!static">
        <MenuView data={data} preview />
      </div>
    </>
  );
}
