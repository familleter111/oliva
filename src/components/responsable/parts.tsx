import { Armchair, ChatCircleDots, CheckCircle, Clock, DoorOpen, Plant, UsersThree } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/format";
import type { ChefMember, ChefTable, ChefZone, TableEtat } from "@/lib/responsable-types";
import { Avatar, Badge, type Tone } from "../ui";

/** Briques de l'espace responsable. Tout est rendu sur le serveur, sans état local. */

/** Même repère de taille que l'éditeur de plan : les positions enregistrées sont réutilisées telles quelles. */
const CANVAS = { w: 840, h: 640 };

export const ETAT: Record<TableEtat, { label: string; tone: Tone; icon: typeof Clock }> = {
  libre: { label: "Disponible", tone: "neutral", icon: Clock },
  en_service: { label: "En service", tone: "olive", icon: UsersThree },
  a_servir: { label: "Commande prête", tone: "olive", icon: CheckCircle },
  demande: { label: "Demande en attente", tone: "warn", icon: ChatCircleDots },
};

export function StatCard({ icon, label, value, accent }: { icon: ReactNode; label: string; value: ReactNode; accent?: boolean }) {
  return (
    <div className={cn("flex items-center gap-4 rounded-2xl border px-4 py-3.5 shadow-card", accent ? "border-warn/20 bg-warn-soft" : "border-line bg-white")}>
      <span className={cn("inline-grid size-11 shrink-0 place-items-center rounded-full", accent ? "bg-white/70 text-warn" : "bg-olive-tint text-olive-deep")}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-[14.5px] leading-snug text-muted">{label}</span>
        <span className={cn("num block text-[1.7rem] leading-tight font-bold", accent ? "text-warn" : "text-ink")}>{value}</span>
      </span>
    </div>
  );
}

export function TableBadge({ etat }: { etat: TableEtat }) {
  const e = ETAT[etat];
  const Icon = e.icon;
  return (
    <Badge tone={e.tone} className="gap-1.5">
      <Icon size={16} weight="fill" aria-hidden />
      {e.label}
    </Badge>
  );
}

const SHAPE: Record<TableEtat, string> = {
  libre: "border-line-strong bg-white text-muted",
  en_service: "border-olive/50 bg-olive-soft text-ink",
  a_servir: "border-olive bg-olive-soft text-ink ring-2 ring-olive/25",
  demande: "border-warn/40 bg-warn-soft text-warn ring-2 ring-warn/20",
};

function Piece({ type, libelle }: { type: string; libelle: string }) {
  if (type === "mur") return <span className="block size-full rounded-[3px] bg-[#8d928c]" />;
  if (type === "porte")
    return (
      <span className="grid size-full place-items-center rounded-b-full border-2 border-t-0 border-dashed border-[#8d928c] text-[11.5px] text-text">{libelle || <DoorOpen size={16} aria-hidden />}</span>
    );
  if (type === "comptoir") return <span className="grid size-full place-items-center rounded-lg border border-[#cdbfae] bg-[#eee4d6] text-[12px] text-text [writing-mode:vertical-rl]">{libelle}</span>;
  return (
    <span className="grid size-full place-items-center rounded-full bg-[#dbe7d0] text-olive">
      <Plant size={16} weight="fill" aria-hidden />
    </span>
  );
}

/**
 * Plan d'une zone, dessiné dans l'administration et rendu ici en lecture seule avec l'état en direct.
 * Sans plan enregistré, les tables sont présentées en grille : rien n'est inventé.
 */
export function FloorPlan({ zone, tables, selected, hrefOf }: { zone: ChefZone; tables: ChefTable[]; selected: string; hrefOf: (tableId: string) => string }) {
  const byId = new Map(tables.map((t) => [t.id, t]));
  const posees = zone.objets.filter((o) => o.type.startsWith("table") && o.tableId && byId.has(o.tableId));
  const restantes = tables.filter((t) => t.zoneId === zone.id && !posees.some((o) => o.tableId === t.id));

  return (
    <div>
      {zone.objets.length > 0 ? (
        <div className="relative w-full overflow-hidden rounded-2xl border border-line bg-[#f6f2ea]" style={{ aspectRatio: `${CANVAS.w} / ${CANVAS.h}` }}>
          {zone.objets.map((o) => {
            const style = { left: `${(o.x / CANVAS.w) * 100}%`, top: `${(o.y / CANVAS.h) * 100}%`, width: `${(o.largeur / CANVAS.w) * 100}%`, height: `${(o.hauteur / CANVAS.h) * 100}%`, transform: o.rotation ? `rotate(${o.rotation}deg)` : undefined };
            const t = o.tableId ? byId.get(o.tableId) : undefined;
            if (!t) {
              return (
                <span key={o.id} aria-hidden className="absolute" style={style}>
                  <Piece type={o.type} libelle={o.libelle} />
                </span>
              );
            }
            const Icon = ETAT[t.etat].icon;
            return (
              <Link
                key={o.id}
                href={hrefOf(t.id)}
                aria-current={selected === t.id ? "true" : undefined}
                className={cn(
                  "press absolute grid place-items-center border-2 text-center leading-tight shadow-[0_2px_4px_rgb(38_61_48/0.18)]",
                  o.type === "table_ronde" ? "rounded-full" : "rounded-xl",
                  SHAPE[t.etat],
                  selected === t.id && "outline-2 outline-offset-2 outline-olive",
                )}
                style={style}
              >
                <span>
                  <span className="num block text-[13px] font-semibold">{t.nom.replace(/^Table\s*/i, "")}</span>
                  {t.convives > 0 ? <span className="num block text-[11px]">{t.convives} conv.</span> : null}
                </span>
                {t.etat !== "libre" && t.etat !== "en_service" ? (
                  <span aria-hidden className="absolute -top-1.5 -right-1.5 inline-grid size-5 place-items-center rounded-full bg-white shadow-card">
                    <Icon size={13} weight="fill" className={t.etat === "demande" ? "text-warn" : "text-olive"} />
                  </span>
                ) : null}
                <span className="sr-only">
                  {t.nom}, {ETAT[t.etat].label}
                  {t.serveur ? `, servie par ${t.serveur}` : ""}
                </span>
              </Link>
            );
          })}
        </div>
      ) : null}

      {restantes.length > 0 ? (
        <ul className={cn("grid gap-3", zone.objets.length > 0 ? "mt-4" : "", "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4")}>
          {restantes.map((t) => (
            <li key={t.id}>
              <Link href={hrefOf(t.id)} className={cn("press flex flex-col items-center gap-1.5 rounded-2xl border-2 px-3 py-4 text-center", SHAPE[t.etat], selected === t.id && "outline-2 outline-offset-2 outline-olive")}>
                <Armchair size={26} weight="duotone" aria-hidden />
                <span className="text-[1.05rem] font-semibold">{t.nom}</span>
                <span className="text-[13.5px]">{t.convives > 0 ? `${t.convives} convive${t.convives > 1 ? "s" : ""}` : "Disponible"}</span>
                {t.serveur ? <span className="text-[13px] opacity-80">{t.serveur}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function PlanLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[14px] text-muted">
      {(["libre", "en_service", "a_servir", "demande"] as TableEtat[]).map((e) => (
        <li key={e} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={cn("size-3 rounded-full border-2", SHAPE[e])} />
          {ETAT[e].label}
        </li>
      ))}
    </ul>
  );
}

export function MemberLine({ membre, action }: { membre: ChefMember; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar name={membre.nom} className="size-10" />
      <div className="min-w-0 flex-1">
        <p className="text-[1.05rem] leading-tight font-semibold text-ink">{membre.nom}</p>
        <p className="num text-[14px] text-muted">
          {membre.tables.length} table{membre.tables.length > 1 ? "s" : ""} · {membre.convives} convive{membre.convives > 1 ? "s" : ""}
        </p>
      </div>
      {action ?? (
        <Badge tone={membre.etat === "en_service" ? "olive" : "neutral"} dot>
          {membre.etat === "en_service" ? "En service" : "Disponible"}
        </Badge>
      )}
    </div>
  );
}
