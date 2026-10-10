"use client";

import { Armchair, Bell, CallBell, BookOpen, Compass, CaretRight, ChefHat, Clock, ClockCounterClockwise, Database, House, Image as ImageIcon, LinkSimple, List, Lock, PaintBrush,
  PicnicTable, QrCode, Receipt, RocketLaunch, ShieldCheck, ShoppingBag, SlidersHorizontal, SquaresFour, Storefront, Users, X
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster, toast } from "sonner";
import { EXTRA_CRUMBS, NAV } from "@/lib/admin-nav";
import { cn } from "@/lib/format";
import { BackButton } from "../back-button";
import { LanguageSwitch } from "../i18n";
import { ApiProvider, tab } from "../client";
import { Badge, IconButton, Thumb, Wordmark } from "../ui";
import { AccountMenu } from "../account";

const ICONS: Record<string, typeof House> = {
  storefront: Storefront, clock: Clock, paint: PaintBrush, book: BookOpen, chef: ChefHat, sliders: SlidersHorizontal, image: ImageIcon, users: Users,
  shield: ShieldCheck, grid: SquaresFour, armchair: Armchair, qr: QrCode, bag: ShoppingBag, bell: Bell, receipt: Receipt, link: LinkSimple, lock: Lock,
  history: ClockCounterClockwise, database: Database, service: CallBell, picnic: PicnicTable, compass: Compass,
};

export interface ShellProps {
  csrf: string;
  user: { nom: string; role: string };
  perms: string[];
  demo: boolean;
  draft: { count: number; neverPublished: boolean };
  brand: { nom: string; sousTitre: string; logo: string | null };
  politique: { min: number; lettreChiffre: boolean; special: boolean };
  children: ReactNode;
}

function Nav({ perms, onNavigate }: { perms: string[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const link = (href: string, label: string, icon: ReactNode) => {
    const active = href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
    return (
      <Link
        key={href}
        href={href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-3.5 rounded-[10px] px-3 py-[7px] text-[16px] transition-colors duration-150",
          active ? "bg-olive-soft font-medium text-ink" : "text-text hover:bg-olive-tint",
        )}
      >
        {icon}
        {label}
      </Link>
    );
  };
  return (
    <nav aria-label="Administration" className="flex flex-col gap-0.5">
      {link("/admin", "Vue d'ensemble", <House size={21} />)}
      {NAV.map((g) => {
        const items = g.items.filter((i) => perms.includes(i.perm));
        if (items.length === 0) return null;
        return (
          <div key={g.title} className="mt-4">
            <p className="eyebrow mb-1.5 px-3">{g.title}</p>
            {items.map((i) => {
              const Icon = ICONS[i.icon] ?? House;
              return link(i.href, i.label, <Icon size={21} />);
            })}
          </div>
        );
      })}
    </nav>
  );
}

function Brand({ brand }: { brand: ShellProps["brand"] }) {
  return (
    <Link href="/admin" className="mx-auto mb-6 block w-fit rounded-xl px-2 py-1">
      {brand.logo ? <Thumb src={brand.logo} alt={brand.nom} className="h-16 w-auto max-w-40 rounded-none object-contain" /> : <Wordmark subtitle={brand.sousTitre || "Administration"} />}
      <span className="sr-only">, vue d'ensemble</span>
    </Link>
  );
}

function Crumbs() {
  const pathname = usePathname();
  const parts: string[] = [];
  for (const g of NAV) {
    const item = g.items.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
    if (item) {
      parts.push(g.title, item.label);
      break;
    }
  }
  const extra = Object.entries(EXTRA_CRUMBS).find(([href]) => pathname === href || pathname.startsWith(`${href}/`));
  if (extra) parts.push(extra[1]);
  if (parts.length === 0) parts.push("Vue d'ensemble");
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

/**
 * Signale les enregistrements faits ailleurs (autre membre ou autre onglet), sans écraser une saisie en cours.
 * Le flux SSE n'est ouvert que lorsque l'onglet est visible et il est fermé dès que la page est quittée :
 * un navigateur n'accorde que six connexions HTTP/1.1 par site, il ne faut pas en laisser traîner.
 */
function LiveUpdates() {
  const router = useRouter();
  useEffect(() => {
    let source: EventSource | null = null;
    const notify = () =>
      toast("Des données ont été modifiées ailleurs.", { id: "maj-externe", duration: 12000, action: { label: "Actualiser", onClick: () => router.refresh() } });
    const read = (e: MessageEvent): { marque?: string; moi?: boolean } => {
      try {
        return JSON.parse(e.data) as { marque?: string; moi?: boolean };
      } catch {
        return {};
      }
    };
    // À la (re)connexion : si le dernier changement connu du serveur n'est plus le nôtre, nos données ont vieilli.
    const onReady = (e: MessageEvent) => {
      const { marque } = read(e);
      if (marque === undefined) return;
      if (tab.marque !== null && tab.marque !== marque) notify();
      tab.marque = marque;
    };
    const onSave = (e: MessageEvent) => {
      const { marque, moi } = read(e);
      if (marque === undefined || marque === tab.marque) return;
      tab.marque = marque;
      if (!moi) notify();
    };
    const open = () => {
      if (source || document.visibilityState !== "visible") return;
      source = new EventSource(`/api/admin/evenements?client=${encodeURIComponent(tab.clientId())}`);
      source.addEventListener("pret", onReady);
      source.addEventListener("sauvegarde", onSave);
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
  }, [router]);
  return null;
}

export function AdminShell({ csrf, user, perms, demo, draft, brand, politique, children }: ShellProps) {
  const [open, setOpen] = useState(false);
  const canPublish = perms.includes("publication.publier");
  return (
    <ApiProvider csrf={csrf}>
      <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-pop">
        Aller au contenu
      </a>
      <div className="no-print fixed inset-y-0 left-0 z-30 hidden w-[248px] border-r border-line bg-white lg:block">
        <div className="scroll-thin h-full overflow-y-auto px-3 pt-6 pb-8">
          <Brand brand={brand} />
          <Nav perms={perms} />
        </div>
      </div>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 animate-fade bg-ink/35 lg:hidden" />
          <Dialog.Content className="scroll-thin fixed inset-y-0 left-0 z-50 w-[min(86vw,300px)] overflow-y-auto bg-white px-3 pt-5 pb-8 shadow-pop focus:outline-none animate-drawer lg:hidden">
            <Dialog.Title className="sr-only">Menu d'administration</Dialog.Title>
            <Dialog.Description className="sr-only">Navigation entre les rubriques</Dialog.Description>
            <div className="flex justify-end">
              <Dialog.Close asChild>
                <IconButton label="Fermer le menu">
                  <X size={20} />
                </IconButton>
              </Dialog.Close>
            </div>
            <Brand brand={brand} />
            <Nav perms={perms} onNavigate={() => setOpen(false)} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <div className="lg:pl-[248px]">
        <header className="no-print sticky top-0 z-20 flex h-[52px] items-center gap-3 border-b border-line bg-paper/90 px-4 backdrop-blur-sm sm:px-6">
          <IconButton label="Ouvrir le menu" className="lg:hidden" onClick={() => setOpen(true)}>
            <List size={22} />
          </IconButton>
          <BackButton fallback="/admin" className="-ml-1" />
          <nav aria-label="Fil d'Ariane" className="min-w-0 flex-1">
            <Crumbs />
          </nav>
          {demo ? (
            <span className="hidden md:block lg:hidden xl:block">
              <Badge tone="olive" dot>
                Configuration de démonstration
              </Badge>
            </span>
          ) : null}
          <LanguageSwitch />
          {canPublish ? (
            <Link
              href="/admin/publication"
              className={cn(
                "press inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-[14.5px]",
                draft.count > 0 || draft.neverPublished ? "border-warn/25 bg-warn-soft text-warn" : "border-line bg-white text-muted hover:bg-olive-tint",
              )}
            >
              <RocketLaunch size={17} />
              <span className="hidden sm:inline">{draft.neverPublished ? "Jamais publié" : draft.count > 0 ? `Brouillon : ${draft.count} modification${draft.count > 1 ? "s" : ""}` : "À jour"}</span>
              <span className="num sm:hidden">{draft.neverPublished ? "!" : draft.count}</span>
            </Link>
          ) : null}
          <AccountMenu user={user} politique={politique} />
        </header>
        <main id="contenu" className="mx-auto w-full max-w-[1360px] px-4 pt-7 pb-16 sm:px-6 lg:px-7">
          {children}
        </main>
      </div>
      <LiveUpdates />
      <Toaster position="top-center" offset={4} mobileOffset={60} toastOptions={{ style: { fontFamily: "var(--font-serif)", fontSize: "15px", borderRadius: "12px", border: "1px solid var(--color-line)", color: "var(--color-text)" } }} />
    </ApiProvider>
  );
}
