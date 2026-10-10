"use client";

import { CaretRight, House } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { cn } from "@/lib/format";
import { AccountMenu, type AccountUser, type PasswordPolicy } from "../account";
import { ApiProvider, tab } from "../client";
import { BackButton } from "../back-button";
import { LanguageSwitch } from "../i18n";
import { Thumb, Wordmark } from "../ui";

/**
 * Cadre commun aux espaces du personnel hors administration : barre latérale sur ordinateur,
 * barre d'onglets en bas sur téléphone. Les pastilles sont calculées sur le serveur.
 */

export interface StaffNavEntry {
  href: string;
  label: string;
  /** Libellé court de la barre d'onglets mobile. */
  court: string;
  icon: typeof House;
  badge?: number;
  /** Préfixes d'URL qui activent aussi cette entrée. */
  aussi?: string[];
}

export interface StaffShellProps {
  csrf: string;
  user: AccountUser;
  brand: { nom: string; sousTitre: string; logo: string | null };
  politique: PasswordPolicy;
  /** Base de l'API pour le flux en direct : /api/<espace>/evenements. */
  espace: "salle" | "responsable";
  /** Intitulé affiché au-dessus de la navigation. */
  titre: string;
  racine: string;
  nav: StaffNavEntry[];
  /** Repère affiché à droite de l'en-tête, par exemple « 4 tables en service ». */
  etat?: string;
  children: ReactNode;
}

const active = (pathname: string, e: StaffNavEntry, racine: string) =>
  e.href === racine ? pathname === racine || (e.aussi ?? []).some((p) => pathname.startsWith(p)) : pathname === e.href || pathname.startsWith(`${e.href}/`);

/* ------------------------------------------------- fil d'Ariane */

const CrumbContext = createContext<(label: string) => void>(() => {});

/** Dernier niveau du fil d'Ariane, déclaré par la page de détail qui l'affiche. */
export function Crumb({ label }: { label: string }) {
  const set = useContext(CrumbContext);
  useEffect(() => {
    set(label);
    return () => set("");
  }, [label, set]);
  return null;
}

function Crumbs({ detail, nav, racine }: { detail: string; nav: StaffNavEntry[]; racine: string }) {
  const pathname = usePathname();
  const courant = nav.find((e) => active(pathname, e, racine));
  const parts = [courant?.label ?? nav[0]?.label ?? "", ...(detail ? [detail] : [])].filter(Boolean);
  return (
    <ol className="flex min-w-0 items-center gap-2 text-[15px] text-muted">
      <li className="hidden sm:block">Oliva</li>
      {parts.map((p, i) => (
        <li key={`${p}-${i}`} className={cn("min-w-0 items-center gap-2", i < parts.length - 1 ? "hidden md:flex" : "flex")}>
          <CaretRight size={12} aria-hidden className="hidden shrink-0 sm:block" />
          <span className={cn("truncate", i === parts.length - 1 && "text-text")}>{p}</span>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------- navigation */

function Badge({ n, mobile }: { n: number; mobile?: boolean }) {
  if (n <= 0) return null;
  return (
    <span className={cn("num inline-grid place-items-center rounded-full bg-danger font-medium text-white", mobile ? "absolute top-0.5 right-2 min-w-[18px] px-1 text-[11px]" : "min-w-[22px] px-1.5 py-0.5 text-[12.5px]")}>
      {n}
      <span className="sr-only"> à traiter</span>
    </span>
  );
}

function Sidebar({ nav, racine, titre, brand }: { nav: StaffNavEntry[]; racine: string; titre: string; brand: StaffShellProps["brand"] }) {
  const pathname = usePathname();
  return (
    <div className="no-print fixed inset-y-0 left-0 z-30 hidden w-[256px] border-r border-line bg-white lg:block">
      <div className="scroll-thin h-full overflow-y-auto px-3 pt-6 pb-8">
        <Link href={racine} className="mx-auto mb-6 block w-fit rounded-xl px-2 py-1">
          {brand.logo ? <Thumb src={brand.logo} alt={brand.nom} className="h-16 w-auto max-w-40 rounded-none object-contain" /> : <Wordmark subtitle={brand.sousTitre || "Cuisine de saison"} />}
          <span className="sr-only">, {nav[0]?.label.toLowerCase()}</span>
        </Link>
        <p className="eyebrow mb-2 px-3">{titre}</p>
        <nav aria-label={titre} className="flex flex-col gap-0.5">
          {nav.map((e) => {
            const on = active(pathname, e, racine);
            const Icon = e.icon;
            return (
              <Link
                key={e.href}
                href={e.href}
                aria-current={on ? "page" : undefined}
                className={cn("flex items-center gap-3.5 rounded-[10px] px-3 py-[9px] text-[16px] transition-colors duration-150", on ? "bg-olive-soft font-medium text-ink" : "text-text hover:bg-olive-tint")}
              >
                <Icon size={21} weight={on ? "fill" : "regular"} />
                <span className="flex-1">{e.label}</span>
                <Badge n={e.badge ?? 0} />
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

function TabBar({ nav, racine, titre }: { nav: StaffNavEntry[]; racine: string; titre: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={titre} className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm lg:hidden">
      <ul className="scroll-thin mx-auto flex max-w-3xl overflow-x-auto">
        {nav.map((e) => {
          const on = active(pathname, e, racine);
          const Icon = e.icon;
          return (
            <li key={e.href} className="min-w-[72px] flex-1">
              <Link
                href={e.href}
                aria-current={on ? "page" : undefined}
                className={cn("relative mx-1 my-1.5 flex flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[12px] leading-tight", on ? "bg-olive-soft font-medium text-ink" : "text-muted")}
              >
                <Icon size={23} weight={on ? "fill" : "regular"} />
                <span className="w-full truncate text-center">{e.court}</span>
                <Badge n={e.badge ?? 0} mobile />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Suivi en direct : chaque enregistrement qui concerne le service redemande la page au serveur.
 * Le flux n'est ouvert que lorsque l'onglet est visible, et refermé dès qu'il est quitté.
 */
function LiveUpdates({ espace }: { espace: StaffShellProps["espace"] }) {
  const router = useRouter();
  useEffect(() => {
    let source: EventSource | null = null;
    const open = () => {
      if (source || document.visibilityState !== "visible") return;
      source = new EventSource(`/api/${espace}/evenements?client=${encodeURIComponent(`${tab.clientId()}-${espace}`)}`);
      source.addEventListener("maj", () => router.refresh());
    };
    const close = () => {
      source?.close();
      source = null;
    };
    const onVisibility = () => (document.visibilityState === "visible" ? open() : close());
    open();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", close);
    window.addEventListener("pageshow", open);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", close);
      window.removeEventListener("pageshow", open);
      close();
    };
  }, [router, espace]);
  return null;
}

export function StaffShell({ csrf, user, brand, politique, espace, titre, racine, nav, etat, children }: StaffShellProps) {
  const [detail, setDetail] = useState("");
  return (
    <ApiProvider csrf={csrf}>
      <CrumbContext.Provider value={setDetail}>
        <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-pop">
          Aller au contenu
        </a>
        <Sidebar nav={nav} racine={racine} titre={titre} brand={brand} />

        <div className="lg:pl-[256px]">
          <header className="no-print sticky top-0 z-20 flex h-[56px] items-center gap-2 border-b border-line bg-paper/90 px-3 backdrop-blur-sm sm:gap-3 sm:px-6">
            <Link href={racine} className="shrink-0 rounded-lg px-1 lg:hidden">
              {brand.logo ? <Thumb src={brand.logo} alt={brand.nom} className="h-8 w-auto max-w-24 rounded-none object-contain" /> : <span className="font-serif text-[1.35rem] leading-none font-bold text-ink">oliva.</span>}
            </Link>
            <BackButton fallback={racine} className="-ml-1" />
            <nav aria-label="Fil d'Ariane" className="min-w-0 flex-1">
              <Crumbs detail={detail} nav={nav} racine={racine} />
            </nav>
            {etat ? (
              <span className="hidden items-center gap-2 text-[14.5px] text-muted lg:inline-flex">
                <span aria-hidden className="size-2 rounded-full bg-olive" />
                {etat}
              </span>
            ) : null}
            <span className="hidden items-center gap-2 text-[14.5px] text-muted md:inline-flex">Vous · {user.role}</span>
            <LanguageSwitch />
            <AccountMenu user={user} politique={politique} />
          </header>
          <main id="contenu" className="mx-auto w-full max-w-[1420px] px-4 pt-6 pb-28 sm:px-6 lg:px-7 lg:pb-16">
            {children}
          </main>
        </div>

        <TabBar nav={nav} racine={racine} titre={titre} />
        <LiveUpdates espace={espace} />
        <Toaster position="top-center" offset={4} mobileOffset={60} toastOptions={{ style: { fontFamily: "var(--font-serif)", fontSize: "15px", borderRadius: "12px", border: "1px solid var(--color-line)", color: "var(--color-text)" } }} />
      </CrumbContext.Provider>
    </ApiProvider>
  );
}
