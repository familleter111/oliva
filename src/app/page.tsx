import type { Metadata } from "next";
import { MenuView } from "@/components/menu/menu-view";
import { cookies } from "next/headers";
import { LANG_COOKIE } from "@/lib/i18n/config";
import { publicMenu } from "@/lib/server/services/menu";

// Les données changent à chaque publication : la page n'est jamais figée au moment du build.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const menu = await publicMenu();
  const r = menu.restaurant;
  return {
    title: { absolute: r.sousTitre ? `${r.nom} · ${r.sousTitre}` : r.nom },
    description: r.description || `La carte de ${r.nom}.`,
  };
}

/** Accueil public : la carte publiée, sans compte ni outil interne. */
export default async function HomePage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang } = await searchParams;
  return <MenuView data={await publicMenu(lang ?? ((await cookies()).get(LANG_COOKIE)?.value === "en" ? "en" : ""))} />;
}
