import { Armchair, ChatCircleDots, Clock, ForkKnife, Note, Receipt, UsersThree } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";
import { cn, formatMoney } from "@/lib/format";
import type { SalleBill, SalleLine, SalleOrder, SalleRequest } from "@/lib/salle-types";
import { Badge, Thumb, type Tone } from "../ui";

/** Briques communes aux écrans de l'espace serveur. Tout est rendu sur le serveur, sans état local. */

/** Heure affichée dans le fuseau du restaurant, identique sur le serveur et dans le navigateur. */
export function hour(iso: string, fuseau: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: fuseau }).format(d);
}

export const two = (n: number) => String(n).padStart(2, "0");

export function Money({ cents, devise, className }: { cents: number; devise: string; className?: string }) {
  return <span className={cn("num", className)}>{formatMoney(cents, devise)}</span>;
}

export function Meta({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[14.5px] text-muted">
      {icon}
      {children}
    </span>
  );
}

export function Hour({ iso, fuseau }: { iso: string; fuseau: string }) {
  return (
    <Meta icon={<Clock size={16} aria-hidden />}>
      <span className="num">{hour(iso, fuseau)}</span>
    </Meta>
  );
}

export function Guests({ n }: { n: number }) {
  return (
    <Meta icon={<UsersThree size={17} aria-hidden />}>
      {n} convive{n > 1 ? "s" : ""}
    </Meta>
  );
}

/** Pastille d'état d'une commande, avec la couleur du statut configuré. */
export function OrderBadge({ order }: { order: SalleOrder }) {
  const tone: Tone = order.servie ? "olive" : order.prete ? "olive" : "warn";
  return (
    <Badge tone={tone} className="gap-2">
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: order.couleur }} />
      {order.prete ? "Prête à servir" : order.statutNom}
    </Badge>
  );
}

const REQUEST_TONE: Record<SalleRequest["statut"], Tone> = { en_attente: "warn", en_cours: "info", traitee: "olive" };
const REQUEST_LABEL: Record<SalleRequest["statut"], string> = { en_attente: "À traiter", en_cours: "En cours", traitee: "Traitée" };

export function RequestBadge({ statut }: { statut: SalleRequest["statut"] }) {
  return (
    <Badge tone={REQUEST_TONE[statut]} dot>
      {REQUEST_LABEL[statut]}
    </Badge>
  );
}

const BILL_TONE: Record<SalleBill["statut"], Tone> = { a_remettre: "warn", remise: "olive", cloturee: "neutral" };
const BILL_LABEL: Record<SalleBill["statut"], string> = { a_remettre: "À remettre", remise: "Remise", cloturee: "Clôturée" };

export function BillBadge({ statut }: { statut: SalleBill["statut"] }) {
  return (
    <Badge tone={BILL_TONE[statut]} dot>
      {BILL_LABEL[statut]}
    </Badge>
  );
}

/** Bandeau des instructions laissées par les convives. Le texte est affiché tel quel, jamais interprété. */
export function Notes({ notes }: { notes: SalleOrder["notes"] }) {
  if (notes.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1.5 rounded-xl border border-warn/15 bg-warn-soft px-4 py-3">
      {notes.map((n, i) => (
        <li key={`${n.nom}-${i}`} className="flex gap-2.5 text-[14.5px] text-warn">
          <Note size={19} aria-hidden className="mt-0.5 shrink-0" />
          <span className="min-w-0">
            <span className="font-semibold">{n.nom}</span> : {n.texte}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Lignes d'une commande, avec photo, quantité et options figées à l'envoi. */
export function Lines({ lignes, devise, prix = true }: { lignes: SalleLine[]; devise: string; prix?: boolean }) {
  return (
    <ul className="flex flex-col">
      {lignes.map((l) => (
        <li key={l.id} className="flex items-start gap-3.5 border-t border-line py-3 first:border-t-0 first:pt-0 sm:gap-4">
          <span className="num inline-grid size-9 shrink-0 place-items-center rounded-full bg-olive-soft text-[15px] font-semibold text-ink">{l.quantite}</span>
          <Thumb src={l.image} alt="" className="size-14 sm:size-16" />
          <div className="min-w-0 flex-1">
            <p className="text-[1.02rem] leading-snug font-semibold text-ink">{l.nom}</p>
            {l.description ? <p className="mt-0.5 line-clamp-2 text-[14.5px] leading-snug text-muted">{l.description}</p> : null}
            {l.options.length > 0 ? <p className="mt-0.5 text-[14px] text-muted">{l.options.map((o) => o.nom).join(" · ")}</p> : null}
            {l.instructions ? <p className="mt-1 text-[14px] text-warn">« {l.instructions} »</p> : null}
          </div>
          {prix ? <Money cents={l.totalCentimes} devise={devise} className="shrink-0 pt-1 text-[1.02rem] font-semibold text-ink" /> : null}
        </li>
      ))}
    </ul>
  );
}

/** Aperçu horizontal des plats d'une commande, comme sur les cartes de la liste « À servir ». */
export function Dishes({ lignes }: { lignes: SalleLine[] }) {
  return (
    <ul className="scroll-thin -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
      {lignes.map((l) => (
        <li key={l.id} className="w-[148px] shrink-0 sm:w-[168px]">
          <div className="relative">
            <Thumb src={l.image} alt="" className="h-[100px] w-full rounded-xl sm:h-[110px]" />
            <span className="num absolute bottom-1.5 left-1.5 inline-grid min-w-7 place-items-center rounded-full bg-white/95 px-1.5 py-0.5 text-[13px] font-semibold text-ink shadow-card">{l.quantite}×</span>
          </div>
          <p className="mt-1.5 truncate text-[14.5px] text-text">{l.nom}</p>
        </li>
      ))}
    </ul>
  );
}

/**
 * Visuel d'une table. Le restaurant n'enregistre pas de photo par table : cette vignette est un repère
 * graphique, construit avec la couleur choisie pour la table dans le plan de salle.
 */
export function TableTile({ couleur, capacite, className }: { couleur: string; capacite: number; className?: string }) {
  return (
    <span aria-hidden className={cn("relative grid shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-olive-tint", className)}>
      <span className="absolute inset-0 opacity-25" style={{ background: `radial-gradient(circle at 50% 45%, ${couleur}, transparent 68%)` }} />
      <Armchair size={30} weight="duotone" className="relative text-olive-deep" />
      <span className="num absolute right-1.5 bottom-1 text-[12px] text-muted">{capacite} pl.</span>
    </span>
  );
}

export const MOTIF_ICON: Record<string, typeof ChatCircleDots> = {
  chat: ChatCircleDots,
  bell: ChatCircleDots,
  fork: ForkKnife,
  receipt: Receipt,
  clock: Clock,
};

export function RequestIcon({ icone, size = 22 }: { icone: string; size?: number }) {
  const Icon = MOTIF_ICON[icone] ?? ChatCircleDots;
  return <Icon size={size} aria-hidden />;
}
