"use client";

import { Check, CircleNotch, Copy, DotsThree, FloppyDisk, X } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { Dialog, DropdownMenu } from "radix-ui";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { centsToInput, cn, parseMoney } from "@/lib/format";
import { Button, IconButton, Input } from "./ui";

/* ------------------------------------------------------------------- API */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly details: Record<string, string> = {},
    readonly status = 0,
  ) {
    super(message);
  }
}

const CsrfContext = createContext("");
export const ApiProvider = ({ csrf, children }: { csrf: string; children: ReactNode }) => <CsrfContext.Provider value={csrf}>{children}</CsrfContext.Provider>;

export type Call = <T = unknown>(method: "POST" | "PUT" | "PATCH" | "DELETE" | "GET", path: string, body?: unknown) => Promise<T>;

/**
 * Suivi de fraîcheur propre à l'onglet. `id` identifie cet onglet auprès du serveur ; `marque` est le
 * dernier changement connu de lui. Le flux en direct s'en sert pour signaler des données périmées.
 */
export const tab = {
  id: "",
  marque: null as string | null,
  clientId(): string {
    if (!this.id) this.id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return this.id;
  },
};

/**
 * Appel des API du personnel : jeton de protection ajouté, erreurs converties en messages lisibles.
 * `espace` choisit la base : « admin », « salle » pour l'espace serveur, « responsable » pour la salle.
 */
export function useApi(espace: "admin" | "salle" | "responsable" = "admin"): Call {
  const csrf = useContext(CsrfContext);
  return useCallback(
    async <T,>(method: string, path: string, body?: unknown): Promise<T> => {
      const headers: Record<string, string> = { "x-oliva-csrf": csrf, "x-oliva-client": tab.clientId() };
      let payload: BodyInit | undefined;
      if (body instanceof FormData) payload = body;
      else if (body !== undefined) {
        headers["content-type"] = "application/json";
        payload = JSON.stringify(body);
      }
      let res: Response;
      try {
        res = await fetch(`/api/${espace}/${path}`, { method, headers, body: payload, credentials: "same-origin" });
      } catch {
        throw new ApiError("Connexion au serveur impossible. Rien n'a été enregistré.");
      }
      if (res.status === 401) {
        window.location.assign("/admin/login");
        throw new ApiError("Votre session a expiré.", {}, 401);
      }
      const marque = res.headers.get("x-oliva-marque");
      if (marque !== null) tab.marque = marque;
      const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: T; error?: { message?: string; details?: Record<string, string> } } | null;
      if (!res.ok || !json?.ok) throw new ApiError(json?.error?.message ?? "Le serveur a renvoyé une erreur. Rien n'a été enregistré.", json?.error?.details ?? {}, res.status);
      return json.data as T;
    },
    [csrf, espace],
  );
}

/** Exécute une action : état « en cours », message de réussite uniquement après la réponse du serveur, erreurs affichées. */
export function useAction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, opts: { success?: string; refresh?: boolean } = {}): Promise<T | undefined> => {
      setPending(true);
      setErrors({});
      try {
        const out = await fn();
        if (opts.success) toast.success(opts.success);
        if (opts.refresh !== false) router.refresh();
        return out;
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError("Une erreur inattendue s'est produite.");
        setErrors(err.details);
        if (err.status !== 401) toast.error(err.message);
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [router],
  );
  return { run, pending, errors };
}

/** Avertit avant de quitter la page tant que des modifications ne sont pas enregistrées. */
export function useDirtyGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}

/** État local d'un formulaire, resynchronisé quand le serveur renvoie de nouvelles données. */
export function useDraft<T>(server: T) {
  const key = JSON.stringify(server);
  const [draft, setDraft] = useState<T>(server);
  const [seen, setSeen] = useState(key);
  if (seen !== key) {
    setSeen(key);
    setDraft(server);
  }
  const dirty = JSON.stringify(draft) !== key;
  const set = useCallback(<K extends keyof T>(k: K, v: T[K]) => setDraft((d) => ({ ...d, [k]: v })), []);
  useDirtyGuard(dirty);
  return { draft, setDraft, set, dirty, reset: () => setDraft(server) };
}

/* -------------------------------------------------------------- contrôles */

export function SaveButton({ pending, dirty = true, onClick, label = "Enregistrer", size = "md" }: { pending: boolean; dirty?: boolean; onClick?: () => void; label?: string; size?: "md" | "lg" }) {
  return (
    <div className="flex items-center gap-3">
      <span aria-live="polite" className="hidden text-[14px] text-muted sm:inline">
        {pending ? "Enregistrement en cours" : dirty ? "Modifications non enregistrées" : "Tout est enregistré"}
      </span>
      <Button size={size} onClick={onClick} type={onClick ? "button" : "submit"} disabled={pending || !dirty}>
        {pending ? <CircleNotch size={18} className="animate-spin" /> : dirty ? <FloppyDisk size={18} /> : <Check size={18} />}
        {label}
      </Button>
    </div>
  );
}

export interface TabItem {
  id: string;
  label: string;
  icon?: ReactNode;
}
export function Tabs({ tabs, value, onChange, label }: { tabs: TabItem[]; value: string; onChange: (id: string) => void; label: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = (i + d + tabs.length) % tabs.length;
    refs.current[next]?.focus();
    onChange(tabs[next].id);
  };
  return (
    <div role="tablist" aria-label={label} className="scroll-thin flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t, i) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => void (refs.current[i] = el)}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "relative -mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-[16px] whitespace-nowrap transition-colors duration-150",
              active ? "border-olive font-medium text-ink" : "border-transparent text-muted hover:text-text",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function Modal({ open, onClose, title, description, children, footer, wide }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 animate-fade bg-ink/35 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            "fixed z-50 flex max-h-[92dvh] flex-col bg-white shadow-pop focus:outline-none",
            "inset-x-0 bottom-0 animate-sheet rounded-t-3xl sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-[calc(100vw-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:animate-pop sm:rounded-2xl",
            wide ? "sm:max-w-3xl" : "sm:max-w-lg",
          )}
        >
          <div className="flex items-start gap-4 border-b border-line px-6 py-4">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-[1.3rem] leading-tight font-semibold text-ink">{title}</Dialog.Title>
              {description ? <Dialog.Description className="mt-1 text-[15px] text-muted">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
            </div>
            <Dialog.Close asChild>
              <IconButton label="Fermer">
                <X size={18} />
              </IconButton>
            </Dialog.Close>
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Confirm({ open, onClose, onConfirm, title, children, confirmLabel = "Confirmer", danger, pending }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; children: ReactNode; confirmLabel?: string; danger?: boolean; pending?: boolean }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={pending}>
            {pending ? <CircleNotch size={18} className="animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-[15.5px] leading-relaxed text-text">{children}</div>
    </Modal>
  );
}

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}
export function ActionMenu({ items, label = "Actions" }: { items: MenuItem[]; label?: string }) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <IconButton label={label} className="border border-line bg-white">
          <DotsThree size={20} weight="bold" />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-48 origin-(--radix-dropdown-menu-content-transform-origin) animate-pop rounded-xl border border-line bg-white p-1.5 shadow-pop"
        >
          {items.map((it) => (
            <DropdownMenu.Item
              key={it.label}
              disabled={it.disabled}
              onSelect={it.onSelect}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-[15px] outline-none select-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45 data-[highlighted]:bg-olive-soft",
                it.danger ? "text-danger data-[highlighted]:bg-danger-soft" : "text-text",
              )}
            >
              {it.icon}
              {it.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Montant saisi en unités, conservé en centimes. `onChange(null)` signale une saisie invalide. */
export function MoneyInput({ cents, onChange, id, invalid, devise = "€", label }: { cents: number; onChange: (cents: number | null) => void; id?: string; invalid?: boolean; devise?: string; label?: string }) {
  const [text, setText] = useState(centsToInput(cents));
  const [last, setLast] = useState(cents);
  if (last !== cents) {
    setLast(cents);
    if (parseMoney(text) !== cents) setText(centsToInput(cents));
  }
  return (
    <span className="relative block">
      <Input
        id={id}
        aria-label={label}
        inputMode="decimal"
        value={text}
        aria-invalid={invalid || parseMoney(text) === null}
        className="num pr-9"
        onChange={(e) => {
          setText(e.target.value);
          const v = parseMoney(e.target.value);
          if (v !== null) setLast(v);
          onChange(v);
        }}
        onBlur={() => {
          const v = parseMoney(text);
          if (v !== null) setText(centsToInput(v));
        }}
      />
      <span aria-hidden className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted">
        {devise}
      </span>
    </span>
  );
}

/**
 * Nombre entier borné. La saisie reste libre pendant la frappe (on peut vider le champ) :
 * la valeur n'est transmise que lorsqu'elle est valide, puis ramenée dans les bornes en quittant le champ.
 */
export function NumberInput({ value, onChange, min, max, className, ...rest }: { value: number; onChange: (n: number) => void; min: number; max: number; className?: string; id?: string; disabled?: boolean; "aria-label"?: string }) {
  const [text, setText] = useState(String(value));
  const [last, setLast] = useState(value);
  if (last !== value) {
    setLast(value);
    if (Number(text) !== value) setText(String(value));
  }
  const n = text.trim() === "" ? NaN : Number(text);
  const valid = Number.isInteger(n) && n >= min && n <= max;
  return (
    <Input
      {...rest}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      step={1}
      value={text}
      aria-invalid={!valid}
      title={valid ? undefined : `Entre ${min} et ${max}`}
      className={cn("num", className)}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        const v = t.trim() === "" ? NaN : Number(t);
        if (Number.isInteger(v) && v >= min && v <= max) {
          setLast(v);
          onChange(v);
        }
      }}
      onBlur={() => {
        const v = Math.max(min, Math.min(max, Math.round(Number(text)) || min));
        setText(String(v));
        if (v !== value) {
          setLast(v);
          onChange(v);
        }
      }}
    />
  );
}

export function CopyField({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  const id = useId();
  return (
    <div className="flex gap-2">
      <Input id={id} aria-label={label} readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="font-sans text-[13.5px]" />
      <Button
        variant="secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setDone(true);
            setTimeout(() => setDone(false), 1800);
          } catch {
            toast.error("Copie impossible : sélectionnez le lien et copiez-le manuellement.");
          }
        }}
      >
        {done ? <Check size={18} /> : <Copy size={18} />}
        {done ? "Copié" : "Copier"}
      </Button>
    </div>
  );
}

/** Déplace un élément d'une liste d'identifiants (réordonnancement au clavier ou à la souris). */
export function moveId(ids: string[], id: string, delta: number): string[] {
  const i = ids.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const out = [...ids];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}
