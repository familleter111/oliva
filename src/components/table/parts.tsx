"use client";

import { Minus, Plus } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";
import { cn, formatMoney } from "@/lib/format";

/** Teintes des pastilles de convives : fond clair, texte foncé lisible. */
const TINTS = ["bg-olive-soft text-olive-deep", "bg-[#e2e8f6] text-[#2f4a80]", "bg-[#dfeee6] text-[#2c5f44]", "bg-[#f8e2df] text-[#8c3327]", "bg-[#f6ecd2] text-[#74540c]", "bg-[#ece3f4] text-[#5b3a82]"];

export function Guest({ name, index, className }: { name: string; index: number; className?: string }) {
  return (
    <span aria-hidden translate="no" className={cn("inline-grid size-9 shrink-0 place-items-center rounded-full font-sans text-[14px] font-semibold", TINTS[index % TINTS.length], className)}>
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

export function Money({ cents, devise, className }: { cents: number; devise: string; className?: string }) {
  return <span className={cn("num whitespace-nowrap", className)}>{formatMoney(cents, devise)}</span>;
}

/** Heure dans le fuseau du restaurant : identique côté serveur et côté navigateur. */
export function hour(iso: string, timeZone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone }).format(d);
  } catch {
    return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(d);
  }
}

/** Grand bouton d'action du parcours client. */
export const CTA = "press inline-flex items-center justify-center gap-3 rounded-full bg-olive font-medium text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_1px_2px_rgb(38_61_48/0.3)] hover:bg-olive-deep disabled:pointer-events-none disabled:opacity-50";

export const two = (n: number) => String(n).padStart(2, "0");
export const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

export function Stepper({ value, onMinus, onPlus, disabled, plusDisabled, label, size = "md" }: { value: number; onMinus: () => void; onPlus: () => void; disabled?: boolean; plusDisabled?: boolean; label: string; size?: "md" | "lg" }) {
  const button = cn("press grid place-items-center rounded-full text-text hover:bg-olive-soft disabled:pointer-events-none disabled:opacity-40", size === "lg" ? "size-11" : "size-8");
  return (
    <span role="group" aria-label={label} className={cn("inline-flex items-center rounded-full border border-line-strong bg-white", size === "lg" ? "h-12 gap-2 px-0.5" : "h-9 gap-1 px-0.5")}>
      <button type="button" onClick={onMinus} disabled={disabled} aria-label="Retirer un" className={button}>
        <Minus size={size === "lg" ? 18 : 14} aria-hidden />
      </button>
      <span aria-live="polite" className={cn("num min-w-6 text-center font-sans font-medium", size === "lg" ? "text-[17px]" : "text-[15px]")}>
        {value}
      </span>
      <button type="button" onClick={onPlus} disabled={disabled || plusDisabled} aria-label="Ajouter un" className={button}>
        <Plus size={size === "lg" ? 18 : 14} aria-hidden />
      </button>
    </span>
  );
}

export function Picture({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  if (!src) return <span aria-hidden className={cn("block bg-olive-soft", className)} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" decoding="async" className={cn("object-cover", className)} />;
}

export function PageTitle({ title, subtitle, aside }: { title: string; subtitle: string; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[2.1rem] leading-[1.05] font-bold tracking-[-0.02em] text-ink sm:text-[2.6rem] lg:text-[3.2rem]">{title}</h1>
        <p className="mt-1 text-[1.05rem] text-muted lg:mt-1.5 lg:text-[1.2rem]">{subtitle}</p>
      </div>
      {aside}
    </div>
  );
}

/** Pastilles des convives de la table, « Vous » en tête de liste mis en avant. */
export function GuestRow({ convives, className }: { convives: { id: string; nom: string; moi: boolean }[]; className?: string }) {
  return (
    <ul aria-label="Convives" className={cn("flex flex-wrap gap-x-3 gap-y-2", className)}>
      {convives.map((c, i) => (
        <li key={c.id} className="flex w-11 flex-col items-center gap-1">
          <Guest name={c.nom} index={i} className={cn(c.moi && "ring-2 ring-olive/40 ring-offset-2")} />
          <span className={cn("w-full truncate text-center font-sans text-[11.5px]", c.moi ? "font-semibold text-ink" : "text-muted")}>{c.moi ? "Vous" : c.nom}</span>
        </li>
      ))}
    </ul>
  );
}
