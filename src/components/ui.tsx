import { CaretDown, Info, Plant, Warning, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/format";

/* Primitives partagées par l'administration. Aucune n'a d'état : elles restent utilisables côté serveur. */

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-olive text-white hover:bg-olive-deep shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_1px_2px_rgb(38_61_48/0.3)]",
  secondary: "bg-white text-text border border-line-strong hover:bg-olive-tint",
  outline: "bg-white text-olive-deep border border-olive/70 hover:bg-olive-tint",
  ghost: "text-text hover:bg-olive-soft",
  danger: "bg-danger-soft text-danger border border-danger/25 hover:bg-danger/10",
};
const SIZES = { sm: "h-9 px-3 text-[14px] gap-1.5", md: "h-10 px-4 text-[15px] gap-2", lg: "h-12 px-5 text-[17px] gap-2.5" };

export function buttonClass(variant: Variant = "primary", size: keyof typeof SIZES = "md", extra?: string) {
  return cn(
    "press inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-[10px] font-medium disabled:pointer-events-none disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

export function Button({ variant, size, className, type = "button", ...props }: ComponentProps<"button"> & { variant?: Variant; size?: keyof typeof SIZES }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function IconButton({ label, className, type = "button", ...props }: ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn("press inline-grid size-9 shrink-0 place-items-center rounded-[10px] text-text hover:bg-olive-soft disabled:pointer-events-none disabled:opacity-40", className)}
      {...props}
    />
  );
}

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-2xl border border-line bg-white shadow-card", className)} {...props} />;
}

export function Bubble({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("inline-grid size-12 shrink-0 place-items-center rounded-full bg-olive-soft text-ink", className)}>{children}</span>;
}

export function CardHeader({ icon, title, description, action, className }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <header className={cn("flex flex-wrap items-start gap-4", className)}>
      {icon ? <Bubble>{icon}</Bubble> : null}
      <div className="min-w-44 flex-1">
        <h2 className="text-[1.35rem] leading-tight font-semibold">{title}</h2>
        {description ? <p className="mt-0.5 text-[15px] text-muted">{description}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function PageHeader({ eyebrow, title, subtitle, actions, photo }: { eyebrow: string; title: string; subtitle: string; actions?: ReactNode; photo?: boolean }) {
  return (
    <div className="relative mb-6 overflow-hidden">
      {photo ? (
        <div
          aria-hidden
          className="pointer-events-none absolute -top-8 right-0 hidden h-56 w-[46%] bg-cover bg-center opacity-90 [mask-image:linear-gradient(to_left,black_35%,transparent)] lg:block"
          style={{ backgroundImage: "url(/brand/table.webp)" }}
        />
      ) : null}
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 animate-rise">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-1.5 text-[2.25rem] leading-[1.04] font-bold tracking-[-0.025em] text-balance sm:text-[2.9rem] xl:text-[3.3rem]">{title}</h1>
          <p className="mt-2 max-w-[58ch] text-[1.15rem] leading-snug text-muted sm:text-[1.3rem]">{subtitle}</p>
        </div>
        {actions ? <div className={cn("flex flex-wrap items-center gap-2", photo && "rounded-2xl bg-paper/90 p-1.5 backdrop-blur-sm")}>{actions}</div> : null}
      </div>
    </div>
  );
}

const TONES = {
  neutral: "bg-olive-tint text-text border-line",
  olive: "bg-olive-soft text-olive-deep border-olive/15",
  danger: "bg-danger-soft text-danger border-danger/15",
  warn: "bg-warn-soft text-warn border-warn/15",
  info: "bg-info-soft text-info border-info/15",
};
export type Tone = keyof typeof TONES;

export function Badge({ tone = "neutral", dot, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[13.5px] whitespace-nowrap", TONES[tone], className)}>
      {dot ? <span aria-hidden className="size-2 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

const CALLOUT_ICON = { info: Info, warn: Warning, danger: WarningCircle, olive: Info, neutral: Info };
export function Callout({ tone = "info", title, children, className }: { tone?: Tone; title?: string; children?: ReactNode; className?: string }) {
  const Icon = CALLOUT_ICON[tone];
  return (
    <div role={tone === "danger" ? "alert" : "note"} className={cn("flex gap-3 rounded-xl border px-4 py-3 text-[14.5px] leading-snug", TONES[tone], className)}>
      <Icon size={20} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && "mt-0.5", "opacity-90")}>{children}</div> : null}
      </div>
    </div>
  );
}

export function Field({ label, help, error, required, optional, children, className, htmlFor }: { label: ReactNode; help?: ReactNode; error?: string; required?: boolean; optional?: boolean; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[15px] text-text">
        {label}
        {required ? <span className="ml-1 text-danger" aria-hidden>*</span> : null}
        {optional ? <span className="ml-1 text-muted">(facultatif)</span> : null}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-[13.5px] text-danger">
          {error}
        </p>
      ) : help ? (
        <p className="text-[13.5px] text-muted">{help}</p>
      ) : null}
    </div>
  );
}

const CONTROL =
  "rounded-[10px] border border-line-strong bg-white px-3 text-[15px] text-text placeholder:text-muted transition-[border-color,box-shadow] duration-150 focus:border-olive focus:ring-2 focus:ring-olive/20 focus:outline-none disabled:bg-olive-tint disabled:text-muted aria-[invalid=true]:border-danger";

/** Pleine largeur par défaut, sauf si l'appelant impose une largeur. */
const width = (className?: string) => (/(^|\s)!?w-/.test(className ?? "") ? "" : "w-full");

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(CONTROL, width(className), "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(CONTROL, width(className), "min-h-24 resize-y py-2.5 leading-snug", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <span className={cn("relative block", className)}>
      <select className={cn(CONTROL, "h-10 w-full appearance-none pr-9")} {...props}>
        {children}
      </select>
      <CaretDown size={16} aria-hidden className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted" />
    </span>
  );
}

/** Interrupteur accessible : une vraie case à cocher avec role="switch". */
export function Toggle({ label, className, ...props }: Omit<ComponentProps<"input">, "type"> & { label: string }) {
  return (
    <label className={cn("relative inline-flex h-6 w-11 shrink-0 items-center", props.disabled && "cursor-not-allowed opacity-60", className)}>
      <input type="checkbox" role="switch" aria-label={label} className="peer sr-only" {...props} />
      <span aria-hidden className="absolute inset-0 rounded-full bg-line-strong transition-colors duration-200 peer-checked:bg-olive peer-focus-visible:ring-2 peer-focus-visible:ring-olive/40 peer-focus-visible:ring-offset-2" />
      <span aria-hidden className="absolute left-0.5 size-5 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.25)] transition-transform duration-200 ease-(--ease-out) peer-checked:translate-x-5" />
    </label>
  );
}

export function Checkbox({ children, className, ...props }: Omit<ComponentProps<"input">, "type"> & { children?: ReactNode }) {
  return (
    <label className={cn("flex items-start gap-2.5 text-[15px]", props.disabled && "cursor-not-allowed opacity-70", className)}>
      <input type="checkbox" className="mt-[3px] size-[18px] shrink-0 rounded-[5px] accent-(--color-olive)" {...props} />
      {children ? <span className="min-w-0">{children}</span> : null}
    </label>
  );
}

export function Radio({ children, className, ...props }: Omit<ComponentProps<"input">, "type"> & { children?: ReactNode }) {
  return (
    <label className={cn("flex items-start gap-3 text-[15px]", className)}>
      <input type="radio" className="mt-[3px] size-[18px] shrink-0 accent-(--color-olive)" {...props} />
      {children ? <span className="min-w-0">{children}</span> : null}
    </label>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      {icon ? <Bubble className="mb-1 text-muted">{icon}</Bubble> : null}
      <p className="text-[1.1rem] font-semibold text-ink">{title}</p>
      {children ? <p className="max-w-[46ch] text-[15px] text-muted">{children}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** Tableau : défile horizontalement sur petit écran plutôt que de casser la page. */
export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("scroll-thin overflow-x-auto rounded-xl border border-line", className)}>{children}</div>;
}
export const Th = ({ className, ...p }: ComponentProps<"th">) => <th scope="col" className={cn("bg-olive-tint px-4 py-3 text-left text-[14.5px] font-medium whitespace-nowrap text-text", className)} {...p} />;
export const Td = ({ className, ...p }: ComponentProps<"td">) => <td className={cn("border-t border-line px-4 py-3 align-middle text-[15px]", className)} {...p} />;

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("eyebrow", className)}>{children}</p>;
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const hue = [...name].reduce((n, ch) => n + ch.charCodeAt(0), 0) % 5;
  const tint = ["bg-olive-soft", "bg-[#e9e3f3]", "bg-[#e2ebf5]", "bg-[#f6e3e1]", "bg-[#f7ecd3]"][hue];
  return <span aria-hidden className={cn("inline-grid size-10 shrink-0 place-items-center rounded-full text-[15px] font-semibold text-ink", tint, className)}>{(name.trim()[0] ?? "?").toUpperCase()}</span>;
}

/** Marque typographique Oliva. Le logo importé par le restaurant la remplace quand il existe. */
export function Wordmark({ subtitle = "Cuisine de saison", size = "md" }: { subtitle?: string; size?: "md" | "lg" }) {
  return (
    <span className="inline-flex flex-col items-center leading-none text-ink">
      <span className={cn("relative font-serif font-medium tracking-[-0.03em]", size === "lg" ? "text-[3.4rem]" : "text-[2.6rem]")}>
        oliva.
        <Plant weight="fill" aria-hidden className={cn("absolute text-olive", size === "lg" ? "-top-1 -right-4 size-7" : "-top-0.5 -right-3 size-5")} />
      </span>
      {subtitle ? <span className="eyebrow mt-1.5 text-[0.62rem] tracking-[0.3em] text-ink">{subtitle}</span> : null}
    </span>
  );
}

export function Thumb({ src, alt, className }: { src?: string | null; alt: string; className?: string }) {
  if (!src) return <span aria-hidden className={cn("inline-block shrink-0 rounded-lg bg-olive-soft", className)} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" decoding="async" className={cn("shrink-0 rounded-lg object-cover", className)} />;
}
