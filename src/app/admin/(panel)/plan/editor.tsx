"use client";

import { ArrowClockwise, ArrowCounterClockwise, ArrowUUpLeft, ArrowUUpRight, Database, DoorOpen, GridFour, MagnifyingGlassMinus, MagnifyingGlassPlus, Plant, Trash } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { NumberInput, SaveButton, useAction, useApi, useDirtyGuard } from "@/components/client";
import { Callout, Card, EmptyState, Field, IconButton, Input, PageHeader, Select, Toggle } from "@/components/ui";
import { cn } from "@/lib/format";
import type { Named } from "@/lib/types";

interface Objet {
  key: string;
  type: string;
  tableId: string;
  libelle: string;
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
  rotation: number;
}
interface TableLite extends Named {
  capacite: number;
}

const CANVAS = { w: 840, h: 640 };
const GRID = 10;
const PALETTE: { type: string; label: string; w: number; h: number }[] = [
  { type: "table_ronde", label: "Table ronde", w: 90, h: 90 },
  { type: "table_carree", label: "Table carrée", w: 80, h: 80 },
  { type: "table_rect", label: "Table rectangulaire", w: 140, h: 80 },
  { type: "mur", label: "Mur", w: 200, h: 12 },
  { type: "porte", label: "Porte", w: 80, h: 36 },
  { type: "comptoir", label: "Comptoir", w: 70, h: 220 },
  { type: "plante", label: "Plante", w: 50, h: 50 },
];
const isTable = (t: string) => t.startsWith("table");
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(v)));

function Shape({ o, label, sub }: { o: Objet; label: string; sub: string }) {
  if (isTable(o.type)) {
    return (
      <span className={cn("grid size-full place-items-center border-2 border-[#b89a78] bg-[#e7cfb1] text-center leading-tight shadow-[0_2px_4px_rgb(38_61_48/0.18)]", o.type === "table_ronde" ? "rounded-full" : "rounded-xl")}>
        <span>
          <span className="block text-[13px] font-medium text-ink">{label}</span>
          <span className="num block text-[11.5px] text-text/80">{sub}</span>
        </span>
      </span>
    );
  }
  if (o.type === "mur") return <span className="block size-full rounded-[3px] bg-[#8d928c]" />;
  if (o.type === "porte") return <span className="grid size-full place-items-center rounded-b-full border-2 border-t-0 border-dashed border-[#8d928c] text-[11.5px] text-text">{o.libelle || <DoorOpen size={16} />}</span>;
  if (o.type === "comptoir") return <span className="grid size-full place-items-center rounded-lg border border-[#cdbfae] bg-[#eee4d6] text-[12px] text-text [writing-mode:vertical-rl]">{o.libelle}</span>;
  return (
    <span className="grid size-full place-items-center rounded-full bg-[#dbe7d0] text-olive">
      <Plant size={Math.min(o.largeur, o.hauteur) * 0.6} weight="fill" />
    </span>
  );
}

function NumberField({ label, value, onChange, min, max, id, suffix }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; id: string; suffix?: ReactNode }) {
  return (
    <Field label={label} htmlFor={id}>
      <span className="relative block">
        <NumberInput id={id} min={min} max={max} value={value} onChange={onChange} />
        {suffix ? <span className="pointer-events-none absolute top-1/2 right-9 -translate-y-1/2 text-muted">{suffix}</span> : null}
      </span>
    </Field>
  );
}

export function PlanEditor({ zones, zoneId, tables, objets, total }: { zones: Named[]; zoneId: string; tables: TableLite[]; objets: Objet[]; total: number }) {
  const call = useApi();
  const router = useRouter();
  const { run, pending } = useAction();
  const [items, setItems] = useState<Objet[]>(objets);
  const [saved, setSaved] = useState(JSON.stringify(objets));
  const [selected, setSelected] = useState("");
  const [zoom, setZoom] = useState(0.9);
  const [snap, setSnap] = useState(true);
  const [past, setPast] = useState<Objet[][]>([]);
  const [future, setFuture] = useState<Objet[][]>([]);
  const drag = useRef<{ key: string; dx: number; dy: number; before: Objet[]; moved: boolean } | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const counter = useRef(0);

  // Les données du serveur remplacent le brouillon local après un enregistrement réussi.
  const serverKey = JSON.stringify(objets);
  useEffect(() => {
    setItems(objets);
    setSaved(serverKey);
    setPast([]);
    setFuture([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey]);

  const dirty = JSON.stringify(items) !== saved;
  useDirtyGuard(dirty);
  const current = items.find((o) => o.key === selected);
  const tableOf = (id: string) => tables.find((t) => t.id === id);
  const freeTables = tables.filter((t) => !items.some((o) => o.tableId === t.id && o.key !== selected));

  const commit = useCallback((next: Objet[], before: Objet[]) => {
    setPast((p) => [...p.slice(-40), before]);
    setFuture([]);
    setItems(next);
  }, []);
  const update = (key: string, patch: Partial<Objet>) => commit(items.map((o) => (o.key === key ? { ...o, ...patch } : o)), items);
  const undo = () => {
    const prev = past[past.length - 1];
    if (!prev) return;
    setPast(past.slice(0, -1));
    setFuture([items, ...future]);
    setItems(prev);
  };
  const redo = () => {
    const next = future[0];
    if (!next) return;
    setFuture(future.slice(1));
    setPast([...past, items]);
    setItems(next);
  };
  const add = (p: (typeof PALETTE)[number]) => {
    const key = `nouveau-${++counter.current}`;
    const firstFree = isTable(p.type) ? (tables.find((t) => !items.some((o) => o.tableId === t.id))?.id ?? "") : "";
    commit([...items, { key, type: p.type, tableId: firstFree, libelle: p.type === "porte" ? "Entrée" : p.type === "comptoir" ? "Comptoir" : "", x: 360, y: 260, largeur: p.w, hauteur: p.h, rotation: 0 }], items);
    setSelected(key);
  };
  const remove = () => {
    commit(items.filter((o) => o.key !== selected), items);
    setSelected("");
  };

  const pointerPos = (e: PointerEvent) => {
    const rect = canvas.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
  };
  const onDown = (e: PointerEvent, o: Objet) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setSelected(o.key);
    const p = pointerPos(e);
    drag.current = { key: o.key, dx: p.x - o.x, dy: p.y - o.y, before: items, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = pointerPos(e);
    const step = snap ? GRID : 1;
    setItems((list) =>
      list.map((o) => {
        if (o.key !== d.key) return o;
        const x = clamp(Math.round((p.x - d.dx) / step) * step, 0, CANVAS.w - o.largeur);
        const y = clamp(Math.round((p.y - d.dy) / step) * step, 0, CANVAS.h - o.hauteur);
        if (x !== o.x || y !== o.y) d.moved = true;
        return { ...o, x, y };
      }),
    );
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) {
      setPast((p) => [...p.slice(-40), d.before]);
      setFuture([]);
    }
  };
  const onKey = (e: KeyboardEvent, o: Objet) => {
    const step = e.shiftKey ? 1 : GRID;
    const move: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (move[e.key]) {
      e.preventDefault();
      update(o.key, { x: clamp(o.x + move[e.key][0], 0, CANVAS.w - o.largeur), y: clamp(o.y + move[e.key][1], 0, CANVAS.h - o.hauteur) });
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      remove();
    }
  };

  const save = async () => {
    const ok = await run(() => call("PUT", `plan/${zoneId}`, { objets: items.map(({ key: _k, ...o }) => o) }), { success: "Plan de salle enregistré." });
    if (ok) setSaved(JSON.stringify(items));
  };

  if (zones.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Administration" title="Plan de salle" subtitle="Configurez vos salles, disposez les tables et personnalisez l'aménagement." />
        <Card>
          <EmptyState icon={<GridFour size={24} />} title="Créez d'abord une zone">
            Le plan se dessine zone par zone. Ajoutez une zone dans Zones et tables.
          </EmptyState>
        </Card>
      </>
    );
  }

  const placed = items.filter((o) => o.tableId).length;
  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Plan de salle"
        subtitle="Configurez vos salles, disposez les tables et personnalisez l'aménagement."
        actions={
          <div role="group" aria-label="Zone" className="flex overflow-hidden rounded-xl border border-line-strong bg-white">
            {zones.map((z) => (
              <button
                key={z.id}
                type="button"
                aria-pressed={z.id === zoneId}
                onClick={() => {
                  if (dirty && !window.confirm("Des modifications du plan ne sont pas enregistrées. Changer de zone les annulera.")) return;
                  router.push(`/admin/plan?zone=${z.id}`);
                }}
                className={cn("press px-5 py-2.5 text-[16px]", z.id === zoneId ? "bg-olive font-medium text-white" : "hover:bg-olive-tint")}
              >
                {z.nom}
              </button>
            ))}
          </div>
        }
      />

      <Card className="flex flex-wrap items-center gap-2 p-3">
        <IconButton label="Annuler" disabled={past.length === 0} onClick={undo}>
          <ArrowUUpLeft size={20} />
        </IconButton>
        <IconButton label="Rétablir" disabled={future.length === 0} onClick={redo}>
          <ArrowUUpRight size={20} />
        </IconButton>
        <span aria-hidden className="mx-1 h-6 w-px bg-line" />
        <IconButton label="Rotation à gauche" disabled={!current} onClick={() => current && update(current.key, { rotation: (current.rotation + 345) % 360 })}>
          <ArrowCounterClockwise size={20} />
        </IconButton>
        <IconButton label="Rotation à droite" disabled={!current} onClick={() => current && update(current.key, { rotation: (current.rotation + 15) % 360 })}>
          <ArrowClockwise size={20} />
        </IconButton>
        <span aria-hidden className="mx-1 h-6 w-px bg-line" />
        <IconButton label="Réduire" disabled={zoom <= 0.5} onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))}>
          <MagnifyingGlassMinus size={20} />
        </IconButton>
        <span className="num w-12 text-center text-[15px]">{Math.round(zoom * 100)} %</span>
        <IconButton label="Agrandir" disabled={zoom >= 1.5} onClick={() => setZoom((z) => Math.min(1.5, Math.round((z + 0.1) * 10) / 10))}>
          <MagnifyingGlassPlus size={20} />
        </IconButton>
        <span aria-hidden className="mx-1 h-6 w-px bg-line" />
        <span className="flex items-center gap-2 text-[15px]">
          <GridFour size={19} aria-hidden /> Aligner sur la grille
          <Toggle label="Aligner sur la grille" checked={snap} onChange={(e) => setSnap(e.target.checked)} />
        </span>
        <span className="ml-auto">
          <SaveButton pending={pending} dirty={dirty} onClick={save} />
        </span>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-[150px_minmax(0,1fr)_260px]">
        <Card className="h-fit p-3">
          <h2 className="px-1 text-[1.1rem] font-semibold">Éléments</h2>
          <ul className="mt-2 grid grid-cols-3 gap-2 lg:grid-cols-1">
            {PALETTE.map((p) => (
              <li key={p.type}>
                <button type="button" onClick={() => add(p)} className="press flex w-full items-center gap-2 rounded-xl border border-line bg-white px-2.5 py-2 text-left text-[13.5px] leading-tight hover:border-olive/50 hover:bg-olive-tint">
                  <span aria-hidden className={cn("size-6 shrink-0 border", isTable(p.type) ? "border-[#b89a78] bg-[#e7cfb1]" : p.type === "mur" ? "h-2 border-0 bg-[#8d928c]" : p.type === "plante" ? "border-0 bg-[#dbe7d0]" : "border-[#cdbfae] bg-[#eee4d6]", p.type === "table_ronde" || p.type === "plante" ? "rounded-full" : "rounded-[5px]")} />
                  {p.label}
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <div className="scroll-thin overflow-auto rounded-2xl border border-line bg-white p-3 shadow-card">
          <div style={{ width: CANVAS.w * zoom, height: CANVAS.h * zoom }}>
            <div
              ref={canvas}
              role="application"
              aria-label="Plan de salle. Sélectionnez un élément puis utilisez les flèches pour le déplacer."
              onPointerDown={() => setSelected("")}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              className="relative touch-none rounded-xl bg-[#fbfbf8] bg-[radial-gradient(circle,#d9ddd4_1px,transparent_1px)] [background-size:20px_20px]"
              style={{ width: CANVAS.w, height: CANVAS.h, transform: `scale(${zoom})`, transformOrigin: "top left" }}
            >
              {items.map((o) => {
                const t = tableOf(o.tableId);
                const name = isTable(o.type) ? (t?.nom ?? "Table libre") : (PALETTE.find((p) => p.type === o.type)?.label ?? o.type);
                return (
                  <button
                    key={o.key}
                    type="button"
                    aria-label={`${name}${o.key === selected ? ", sélectionné" : ""}`}
                    aria-pressed={o.key === selected}
                    onPointerDown={(e) => onDown(e, o)}
                    onKeyDown={(e) => onKey(e, o)}
                    onFocus={() => setSelected(o.key)}
                    className={cn("absolute cursor-grab p-0 active:cursor-grabbing", o.key === selected && "z-10 outline-2 outline-offset-4 outline-olive")}
                    style={{ left: o.x, top: o.y, width: o.largeur, height: o.hauteur, transform: `rotate(${o.rotation}deg)` }}
                  >
                    <Shape o={o} label={t?.nom ?? "Libre"} sub={t ? `${t.capacite} pers.` : "à associer"} />
                  </button>
                );
              })}
              {items.length === 0 ? <p className="absolute inset-0 grid place-items-center text-[16px] text-muted">Ajoutez un premier élément depuis la liste.</p> : null}
            </div>
          </div>
        </div>

        <Card className="h-fit p-4">
          {current ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <h2 className="flex-1 text-[1.2rem] font-semibold">{isTable(current.type) ? (tableOf(current.tableId)?.nom ?? "Table libre") : PALETTE.find((p) => p.type === current.type)?.label}</h2>
                <IconButton label="Supprimer l'élément" className="border border-danger/25 bg-danger-soft text-danger" onClick={remove}>
                  <Trash size={18} />
                </IconButton>
              </div>
              {isTable(current.type) ? (
                <Field label="Associer à une table existante" htmlFor="p-table">
                  <Select id="p-table" value={current.tableId} onChange={(e) => update(current.key, { tableId: e.target.value })}>
                    <option value="">Aucune table associée</option>
                    {freeTables.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nom} ({t.capacite} places)
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : current.type !== "mur" && current.type !== "plante" ? (
                <Field label="Libellé" htmlFor="p-libelle">
                  <Input id="p-libelle" maxLength={40} value={current.libelle} onChange={(e) => update(current.key, { libelle: e.target.value })} />
                </Field>
              ) : null}
              <p className="eyebrow mt-1">Dimensions</p>
              <div className="grid grid-cols-2 gap-2">
                <NumberField id="p-w" label="Largeur" min={10} max={CANVAS.w} value={current.largeur} onChange={(v) => update(current.key, { largeur: v })} />
                <NumberField id="p-h" label="Hauteur" min={10} max={CANVAS.h} value={current.hauteur} onChange={(v) => update(current.key, { hauteur: v })} />
              </div>
              <p className="eyebrow mt-1">Position</p>
              <div className="grid grid-cols-2 gap-2">
                <NumberField id="p-x" label="X" min={0} max={CANVAS.w - current.largeur} value={current.x} onChange={(v) => update(current.key, { x: v })} />
                <NumberField id="p-y" label="Y" min={0} max={CANVAS.h - current.hauteur} value={current.y} onChange={(v) => update(current.key, { y: v })} />
              </div>
              <NumberField id="p-r" label="Rotation (degrés)" min={0} max={359} value={current.rotation} onChange={(v) => update(current.key, { rotation: v })} />
            </div>
          ) : (
            <p className="py-6 text-center text-[15px] text-muted">Sélectionnez un élément du plan pour modifier sa taille, sa position ou sa rotation.</p>
          )}
        </Card>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[15px] text-muted">
        <Database size={20} aria-hidden />
        <span className="num">
          {placed} table{placed > 1 ? "s" : ""} placée{placed > 1 ? "s" : ""} sur {tables.length} dans cette zone, {total} table{total > 1 ? "s" : ""} au total.
        </span>
      </div>
      {tables.length === 0 ? (
        <Callout tone="info" className="mt-3">
          Cette zone ne contient encore aucune table. Créez-les dans Zones et tables pour pouvoir les associer aux éléments du plan.
        </Callout>
      ) : null}
    </>
  );
}
