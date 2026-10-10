"use client";

import { ArrowDown, ArrowUp, Check, Plus, Trash } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { cn } from "@/lib/format";
import { Confirm, moveId, useAction, useApi } from "../client";
import { Button, EmptyState, IconButton, Input, Select, Toggle } from "../ui";

export interface ListField {
  key: string;
  label: string;
  type: "text" | "color" | "bool" | "select" | "number";
  options?: { value: string; label: string }[];
  max?: number;
  min?: number;
  placeholder?: string;
  className?: string;
}
type Item = { id: string } & Record<string, unknown>;

function Control({ field, value, onChange, id }: { field: ListField; value: unknown; onChange: (v: unknown) => void; id: string }) {
  if (field.type === "bool") return <Toggle label={field.label} checked={!!value} onChange={(e) => onChange(e.target.checked)} />;
  if (field.type === "color") {
    return (
      <label className="block size-10 shrink-0 cursor-pointer overflow-hidden rounded-[10px] border border-line-strong" style={{ background: String(value || "#ffffff") }}>
        <input type="color" aria-label={field.label} value={String(value || "#ffffff")} onChange={(e) => onChange(e.target.value.toUpperCase())} className="size-full cursor-pointer opacity-0" />
      </label>
    );
  }
  if (field.type === "select") {
    return (
      <Select id={id} aria-label={field.label} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
        {field.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    );
  }
  if (field.type === "number") {
    return <Input id={id} aria-label={field.label} type="number" min={field.min} max={field.max} value={value === null || value === undefined ? "" : String(value)} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} className="num" />;
  }
  return <Input id={id} aria-label={field.label} value={String(value ?? "")} maxLength={field.max} placeholder={field.placeholder ?? field.label} onChange={(e) => onChange(e.target.value)} />;
}

function Row({ item, fields, path, ordered, first, last, onMove, locked, noun }: { item: Item; fields: ListField[]; path: string; ordered?: boolean; first: boolean; last: boolean; onMove: (d: number) => void; locked?: boolean; noun: string }) {
  const call = useApi();
  const { run, pending } = useAction();
  const key = JSON.stringify(item);
  const [draft, setDraft] = useState(item);
  const [seen, setSeen] = useState(key);
  const [confirming, setConfirming] = useState(false);
  if (seen !== key) {
    setSeen(key);
    setDraft(item);
  }
  const dirty = JSON.stringify(draft) !== key;
  const name = String(item[fields[0].key] ?? "");

  const patch = (body: Record<string, unknown>) => run(() => call("PATCH", `${path}/${item.id}`, body), { success: "Enregistré." });
  const change = (f: ListField, v: unknown) => {
    setDraft((d) => ({ ...d, [f.key]: v }));
    // Les interrupteurs s'enregistrent tout de suite ; les autres champs attendent une validation.
    if (f.type === "bool") void patch({ [f.key]: v });
  };

  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:flex-nowrap">
      {ordered ? (
        <span className="flex shrink-0">
          <IconButton label={`Monter ${name}`} disabled={first || pending} onClick={() => onMove(-1)} className="size-8">
            <ArrowUp size={16} />
          </IconButton>
          <IconButton label={`Descendre ${name}`} disabled={last || pending} onClick={() => onMove(1)} className="size-8">
            <ArrowDown size={16} />
          </IconButton>
        </span>
      ) : null}
      {fields.map((f) => (
        <div key={f.key} className={cn(f.type === "text" ? "min-w-40 flex-1" : "shrink-0", f.className)}>
          <Control field={f} id={`${item.id}-${f.key}`} value={draft[f.key]} onChange={(v) => change(f, v)} />
        </div>
      ))}
      <span className="ml-auto flex shrink-0 items-center gap-1">
        {dirty ? (
          <Button size="sm" disabled={pending} onClick={() => patch(Object.fromEntries(fields.filter((f) => f.type !== "bool").map((f) => [f.key, draft[f.key]])))}>
            <Check size={16} /> Enregistrer
          </Button>
        ) : null}
        <IconButton label={`Supprimer ${name}`} disabled={pending || locked} onClick={() => setConfirming(true)}>
          <Trash size={18} />
        </IconButton>
      </span>
      <Confirm
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Supprimer ${noun} ?`}
        danger
        confirmLabel="Supprimer"
        pending={pending}
        onConfirm={async () => {
          await run(() => call("DELETE", `${path}/${item.id}`), { success: "Supprimé." });
          setConfirming(false);
        }}
      >
        « {name} » sera retiré. Cette action est enregistrée dans l'historique.
      </Confirm>
    </li>
  );
}

/** Éditeur de liste générique : ajout, modification en ligne, suppression et ordre. Chaque action est enregistrée côté serveur. */
export function ListEditor({ path, items: rows, fields, blank, addLabel, ordered, empty, noun, lockedIds = [] }: { path: string; items: { id: string }[]; fields: ListField[]; blank: Record<string, unknown>; addLabel: string; ordered?: boolean; empty: string; noun: string; lockedIds?: string[] }) {
  const items = rows as Item[];
  const call = useApi();
  const { run, pending } = useAction();
  const [fresh, setFresh] = useState(blank);
  const ids = items.map((i) => i.id);
  const first = fields[0];
  const canAdd = String(fresh[first.key] ?? "").trim() !== "";

  const add = async () => {
    if (await run(() => call("POST", path, fresh), { success: "Ajouté." })) setFresh(blank);
  };

  return (
    <div>
      {items.length === 0 ? (
        <EmptyState title={empty} />
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {items.map((item, i) => (
            <Row
              key={item.id}
              item={item}
              fields={fields}
              path={path}
              ordered={ordered}
              first={i === 0}
              last={i === items.length - 1}
              locked={lockedIds.includes(item.id)}
              noun={noun}
              onMove={(d) => run(() => call("POST", `${path}/ordre`, { ids: moveId(ids, item.id, d) }))}
            />
          ))}
        </ul>
      )}
      <form
        className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-line-strong bg-olive-tint/60 px-3 py-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (canAdd) void add();
        }}
      >
        {fields.map((f) => (
          <div key={f.key} className={cn(f.type === "text" ? "min-w-40 flex-1" : "shrink-0", f.className)}>
            <Control field={f} id={`new-${path}-${f.key}`} value={fresh[f.key]} onChange={(v) => setFresh((d) => ({ ...d, [f.key]: v }))} />
          </div>
        ))}
        <Button type="submit" variant="outline" disabled={!canAdd || pending}>
          <Plus size={18} /> {addLabel}
        </Button>
      </form>
    </div>
  );
}

/** Sélection multiple par pastilles (boutons à bascule accessibles). */
export function ChipSelect({ options, value, onChange, label, empty = "Aucun élément disponible." }: { options: { id: string; nom: string }[]; value: string[]; onChange: (ids: string[]) => void; label: string; empty?: string }) {
  if (options.length === 0) return <p className="text-[14.5px] text-muted">{empty}</p>;
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== o.id) : [...value, o.id])}
            className={cn("press rounded-full border px-3 py-1 text-[14.5px]", on ? "border-olive bg-olive text-white" : "border-line-strong bg-white text-text hover:bg-olive-tint")}
          >
            {o.nom}
          </button>
        );
      })}
    </div>
  );
}
