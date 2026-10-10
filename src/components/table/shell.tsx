"use client";

import { ArrowClockwise, ArrowRight, BellSimple, CallBell, CaretDown, CaretRight, FileText, ForkKnife, PicnicTable, Plant, Receipt, ShoppingBag, SignOut, UsersThree, WifiSlash } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DropdownMenu } from "radix-ui";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { cn } from "@/lib/format";
import type { MenuData } from "@/lib/server/services/menu";
import type { TableState } from "@/lib/table-types";
import { BackButton } from "../back-button";
import { LanguageSwitch } from "../i18n";
import { TableDialogs } from "./dialogs";
import { Guest, Money, hour, plural } from "./parts";
import { TableProvider, tableCall, useTable } from "./provider";

/** Rubriques de la barre latérale, sur ordinateur. */
const NAV = [
  { path: "", label: "Découvrir le menu", icon: ForkKnife },
  { path: "/commandes", label: "Nos commandes", icon: Receipt },
  { path: "/addition", label: "Notre addition", icon: FileText },
  { path: "/direct", label: "La table en direct", icon: UsersThree },
] as const;

/** Onglets de la barre du bas, sur téléphone et tablette. */
const TABS = [
  { path: "", label: "Menu", icon: ForkKnife },
  { path: "/panier", label: "Panier", icon: ShoppingBag },
  { path: "/commandes", label: "Commandes", icon: Receipt },
  { path: "/service", label: "Service", icon: CallBell },
] as const;

const CRUMBS: [string, string][] = [
  ["/panier", "Notre panier"],
  ["/commandes", "Nos commandes"],
  ["/addition", "Notre addition"],
  ["/service", "Un coup de main"],
  ["/direct", "La table en direct"],
];

function Frame({ children }: { children: ReactNode }) {
  const { state, menu, setDialog, online, syncedAt, refresh, pending } = useTable();
  const pathname = usePathname();
  const base = `/table/${state.table.id}`;
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : "";
  const crumb = CRUMBS.find(([p]) => rest.startsWith(p))?.[1] ?? "Notre menu";
  const me = state.convives.find((c) => c.moi);
  const meIndex = Math.max(0, state.convives.findIndex((c) => c.moi));
  const waiting = state.demandes.filter((d) => d.statut === "en_attente").length;
  const { panier } = state;
  // L'addition fait partie de l'onglet Service sur téléphone, la table en direct de l'onglet Menu.
  const tabOf = rest.startsWith("/panier") ? "/panier" : rest.startsWith("/commandes") ? "/commandes" : rest.startsWith("/service") || rest.startsWith("/addition") ? "/service" : "";

  const leave = async () => {
    try {
      await tableCall("POST", "quitter");
    } finally {
      window.location.assign(base);
    }
  };

  const logo = (className: string, leaf: string) => (
    <span translate="no" className={cn("relative inline-block leading-none font-medium tracking-[-0.03em] text-ink", className)}>
      {menu.restaurant.nom.toLowerCase()}.
      <Plant weight="fill" aria-hidden className={cn("absolute text-olive", leaf)} />
    </span>
  );

  return (
    <div data-table-app className="min-h-[100dvh] bg-paper">
      <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:shadow-pop">
        Aller au contenu
      </a>
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[246px] flex-col border-r border-line bg-white/60 px-3 py-6 lg:flex">
        <Link href={base} className="mx-auto block rounded-lg px-2 text-center text-ink">
          {logo("text-[3rem]", "-top-0.5 -right-4 size-6")}
          {menu.restaurant.sousTitre ? <span className="eyebrow mt-1.5 block text-[0.62rem] tracking-[0.3em] text-ink">{menu.restaurant.sousTitre}</span> : null}
          <span className="sr-only">, découvrir le menu</span>
        </Link>
        <Link href={`${base}/direct`} className="press mt-7 flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3.5 shadow-card hover:bg-olive-tint">
          <PicnicTable size={34} aria-hidden className="shrink-0 text-olive-deep" />
          <span className="min-w-0 flex-1">
            <span className="block text-[1.05rem] leading-tight text-ink">{state.table.nom}</span>
            <span className="block font-sans text-[12.5px] text-muted">{plural(state.convives.length, "convive", "convives")}</span>
          </span>
          <CaretRight size={14} aria-hidden className="text-muted" />
        </Link>
        <p className="eyebrow mt-7 px-3">Votre table</p>
        <nav aria-label="Votre table" className="mt-2">
          <ul className="grid gap-1">
            {NAV.map((n) => {
              const active = n.path === "" ? rest === "" || rest.startsWith("/panier") : rest.startsWith(n.path);
              return (
                <li key={n.path}>
                  <Link href={`${base}${n.path}`} aria-current={active ? "page" : undefined} className={cn("press flex h-11 items-center gap-3.5 rounded-xl px-3.5 text-[1.02rem]", active ? "bg-olive-soft text-ink" : "text-text hover:bg-olive-tint")}>
                    <n.icon size={24} aria-hidden className="shrink-0" />
                    {n.label}
                    {n.path === "/commandes" && state.commandes.length > 0 ? <span className="num ml-auto rounded-full bg-olive-soft px-2 font-sans text-[12.5px] font-medium text-olive-deep">{state.commandes.length}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <div className="lg:pl-[246px]">
        <header className="sticky top-0 z-20 flex h-[60px] items-center gap-2.5 border-b border-line bg-paper/92 px-3 backdrop-blur-sm sm:px-6 lg:h-[52px] lg:gap-3">
          <BackButton fallback={base} className="-ml-1" />
          <Link href={base} className="rounded-lg lg:hidden">
            {logo("text-[1.9rem]", "-top-0.5 -right-2.5 size-3.5")}
            <span className="sr-only">, découvrir le menu</span>
          </Link>
          <ol aria-label="Fil d'Ariane" className="hidden min-w-0 flex-1 items-center gap-2 text-[15px] text-muted lg:flex">
            <li translate="no">{menu.restaurant.nom}</li>
            <li className="flex min-w-0 items-center gap-2">
              <CaretRight size={12} aria-hidden className="shrink-0" />
              <span className="truncate text-text">{crumb}</span>
            </li>
          </ol>
          <span className="flex-1 lg:hidden" />
          <p className="hidden items-center gap-2 text-[15px] text-text lg:flex">
            <span aria-hidden className={cn("size-2.5 rounded-full", online ? "bg-olive" : "bg-[#d9902b]")} />
            {state.table.nom} {online ? "connectée" : "hors ligne"}
          </p>
          <LanguageSwitch />
          <Link href={`${base}/direct`} className={cn("press inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-3 text-[1rem] text-ink lg:hidden", online ? "border-line bg-white" : "border-warn/30 bg-warn-soft")}>
            <span aria-hidden className={cn("size-2.5 rounded-full", online ? "bg-olive" : "bg-[#d9902b]")} />
            {state.table.nom}
            <span className="sr-only">, {online ? "connectée" : "hors ligne"}, voir la table</span>
            <CaretRight size={13} aria-hidden className="text-muted" />
          </Link>
          <button type="button" onClick={() => setDialog({ type: "aide" })} aria-label={waiting > 0 ? `Demander de l'aide, ${waiting} demande(s) en attente` : "Demander de l'aide"} className="press relative hidden size-10 shrink-0 place-items-center rounded-full text-ink hover:bg-olive-soft lg:grid">
            <BellSimple size={24} aria-hidden />
            {waiting > 0 ? <span aria-hidden className="num absolute top-0.5 right-0.5 grid size-[18px] place-items-center rounded-full bg-olive font-sans text-[11px] font-semibold text-white">{waiting}</span> : null}
          </button>
          <DropdownMenu.Root modal={false}>
            <DropdownMenu.Trigger aria-label={`${me?.nom ?? "Convive"}, votre place à la table`} className="press hidden shrink-0 items-center gap-1 rounded-full hover:bg-olive-tint lg:flex">
              <Guest name={me?.nom ?? "?"} index={meIndex} />
              <CaretDown size={12} aria-hidden className="mr-1 text-muted" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={8} className="z-50 min-w-56 origin-(--radix-dropdown-menu-content-transform-origin) animate-pop rounded-xl border border-line bg-white p-1.5 shadow-pop">
                <div className="px-3 py-2">
                  <p className="text-[15px] font-medium text-ink">{me?.nom}</p>
                  <p className="text-[13.5px] text-muted">{state.table.nom}</p>
                </div>
                <DropdownMenu.Item onSelect={leave} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-[15px] outline-none data-[highlighted]:bg-olive-soft">
                  <SignOut size={18} aria-hidden /> Quitter la table
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </header>

        {online ? null : (
          <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-warn/25 bg-warn-soft px-4 py-3 text-[15px] text-warn sm:px-6">
            <WifiSlash size={22} aria-hidden className="shrink-0" />
            <p className="min-w-0 flex-1">Connexion interrompue. Dernier état reçu à {hour(syncedAt, state.fuseau)}.</p>
            <button type="button" disabled={pending} onClick={() => void refresh()} className="press inline-flex h-9 items-center gap-2 rounded-full border border-warn/30 bg-white px-3.5 text-[14.5px] text-ink">
              <ArrowClockwise size={16} aria-hidden /> Réessayer
            </button>
          </div>
        )}

        <main id="contenu" className="mx-auto w-full max-w-[760px] px-4 pt-5 pb-44 sm:px-6 lg:max-w-[1340px] lg:px-7 lg:pt-7 lg:pb-16">
          {children}
        </main>
      </div>

      {/* Téléphone et tablette : rappel du panier sur le menu, puis barre d'onglets. */}
      <div className="fixed inset-x-0 bottom-0 z-30 lg:hidden">
        {rest === "" && panier.articles > 0 ? (
          <div className="mx-auto flex max-w-[760px] items-center gap-3 border-t border-line bg-white/95 px-4 py-2.5 backdrop-blur-sm">
            <ShoppingBag size={26} aria-hidden className="shrink-0 text-ink" />
            <p className="min-w-0 flex-1 truncate text-[1.05rem] text-ink">
              {plural(panier.articles, "article", "articles")} · <Money cents={panier.totalCentimes} devise={state.devise} className="font-medium" />
            </p>
            <Link href={`${base}/panier`} className="press inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-olive px-5 text-[1.05rem] text-white">
              Voir le panier <ArrowRight size={18} aria-hidden />
            </Link>
          </div>
        ) : null}
        <nav aria-label="Rubriques de la table" className="border-t border-line bg-white pb-[env(safe-area-inset-bottom)]">
          <ul className="mx-auto grid max-w-[760px] grid-cols-4">
            {TABS.map((t) => {
              const active = t.path === tabOf;
              const badge = t.path === "/panier" ? panier.articles : t.path === "/service" ? waiting : 0;
              return (
                <li key={t.path}>
                  <Link href={`${base}${t.path}`} aria-current={active ? "page" : undefined} className={cn("relative flex h-[62px] flex-col items-center justify-center gap-0.5 font-sans text-[13px]", active ? "font-semibold text-olive-deep" : "text-muted")}>
                    <span className="relative">
                      <t.icon size={26} aria-hidden weight={active ? "fill" : "regular"} />
                      {badge > 0 ? <span className="num absolute -top-1.5 -right-2.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#b4483b] px-1 text-[11px] font-semibold text-white">{badge}</span> : null}
                    </span>
                    {t.label}
                    {badge > 0 ? <span className="sr-only">, {badge}</span> : null}
                    {active ? <span aria-hidden className="absolute inset-x-5 bottom-0 h-[3px] rounded-full bg-olive" /> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}

export function TableApp({ initial, menu, children }: { initial: TableState; menu: MenuData; children: ReactNode }) {
  return (
    <TableProvider initial={initial} menu={menu}>
      <Frame>{children}</Frame>
      <TableDialogs />
      <Toaster position="top-center" offset={4} mobileOffset={64} toastOptions={{ style: { fontFamily: "var(--font-serif)", fontSize: "15px", borderRadius: "12px", border: "1px solid var(--color-line)", color: "var(--color-text)" } }} />
    </TableProvider>
  );
}
