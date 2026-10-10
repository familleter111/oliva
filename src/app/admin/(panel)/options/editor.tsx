"use client";

import { ArrowDown, ArrowUp, CaretRight, Eye, Plus, PlusCircle, SlidersHorizontal, Trash } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { ChipSelect } from "@/components/admin/list-editor";
import { Confirm, MoneyInput, NumberInput, SaveButton, moveId, useAction, useApi, useDraft } from "@/components/client";
import { Bubble, Button, Callout, Card, EmptyState, Field, IconButton, Input, PageHeader, Select, Thumb, Toggle } from "@/components/ui";
import { cn, formatMoney } from "@/lib/format";

interface Option {
  id: string;
  nom: string;
  prixCentimes: number;
  disponible: boolean;
}
interface Groupe {
  id: string;
  nom: string;
  selection: string;
  min: number;
  max: number;
  produitIds: string[];
  options: Option[];
}
interface Produit {
  id: string;
  nom: string;
  description: string;
  image: string | null;
}

function OptionRow({ option, ids, devise }: { option: Option; ids: string[]; devise: string }) {
  const call = useApi();
  const { run, pending } = useAction();
  const { draft, set, dirty } = useDraft({ nom: option.nom, prixCentimes: option.prixCentimes });
  const i = ids.indexOf(option.id);
  const save = () => dirty && draft.nom.trim() !== "" && run(() => call("PATCH", `options/${option.id}`, draft), { success: "Option enregistrée." });
  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:flex-nowrap">
      <span className="flex shrink-0">
        <IconButton label={`Monter ${option.nom}`} className="size-8" disabled={i === 0 || pending} onClick={() => run(() => call("POST", "options/ordre-groupe", { ids: moveId(ids, option.id, -1) }))}>
          <ArrowUp size={16} />
        </IconButton>
        <IconButton label={`Descendre ${option.nom}`} className="size-8" disabled={i === ids.length - 1 || pending} onClick={() => run(() => call("POST", "options/ordre-groupe", { ids: moveId(ids, option.id, 1) }))}>
          <ArrowDown size={16} />
        </IconButton>
      </span>
      <Input aria-label="Nom de l'option" value={draft.nom} maxLength={60} onChange={(e) => set("nom", e.target.value)} onBlur={save} className="min-w-36 flex-1" />
      <span className="w-28 shrink-0" onBlur={save}>
        <MoneyInput label={`Prix supplémentaire de ${option.nom}`} cents={draft.prixCentimes} devise={devise} onChange={(v) => v !== null && set("prixCentimes", v)} />
      </span>
      <Toggle label={`${option.nom} disponible`} checked={option.disponible} disabled={pending} onChange={(e) => run(() => call("PATCH", `options/${option.id}`, { disponible: e.target.checked }))} />
      <IconButton label={`Supprimer ${option.nom}`} disabled={pending} onClick={() => run(() => call("DELETE", `options/${option.id}`), { success: "Option supprimée." })}>
        <Trash size={18} />
      </IconButton>
    </li>
  );
}

function GroupPanel({ groupe, produits, devise, onDeleted }: { groupe: Groupe; produits: Produit[]; devise: string; onDeleted: () => void }) {
  const call = useApi();
  const { run, pending, errors } = useAction();
  const { draft, set, dirty } = useDraft({ nom: groupe.nom, selection: groupe.selection, min: groupe.min, max: groupe.max, produitIds: groupe.produitIds });
  const [fresh, setFresh] = useState({ nom: "", prixCentimes: 0 });
  const [deleting, setDeleting] = useState(false);
  const symbol = formatMoney(0, devise).replace(/[\d\s.,]/g, "") || devise;
  const sample = produits.find((p) => draft.produitIds.includes(p.id));
  const single = draft.max === 1;

  const save = () =>
    run(
      async () => {
        await call("PATCH", `groupes-options/${groupe.id}`, { nom: draft.nom, selection: draft.selection, min: draft.min, max: draft.max });
        await call("PUT", `groupes-options/${groupe.id}/produits`, { produitIds: draft.produitIds });
      },
      { success: "Groupe d'options enregistré." },
    );
  const addOption = async () => {
    if (await run(() => call("POST", "options", { groupeId: groupe.id, nom: fresh.nom, prixCentimes: fresh.prixCentimes }), { success: "Option ajoutée." })) setFresh({ nom: "", prixCentimes: 0 });
  };

  return (
    <>
      <Card className="p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <Bubble>
            <SlidersHorizontal size={22} />
          </Bubble>
          <h2 className="flex-1 text-[1.6rem] leading-tight font-semibold">{groupe.nom}</h2>
        </div>
        <div className="mt-5 flex flex-col gap-4">
          <Field label="Nom du groupe d'options" htmlFor="g-nom" error={errors.nom}>
            <Input id="g-nom" maxLength={60} value={draft.nom} onChange={(e) => set("nom", e.target.value)} />
          </Field>
          <Field label="S'applique à">
            <ChipSelect label="Produits concernés" options={produits} value={draft.produitIds} onChange={(v) => set("produitIds", v)} empty="Aucun produit dans la carte." />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Sélection" htmlFor="g-sel">
              <Select id="g-sel" value={draft.selection} onChange={(e) => set("selection", e.target.value)}>
                <option value="facultative">Facultative</option>
                <option value="obligatoire">Obligatoire</option>
              </Select>
            </Field>
            <Field label="Minimum" htmlFor="g-min" error={errors.min}>
              <NumberInput id="g-min" min={draft.selection === "obligatoire" ? 1 : 0} max={20} disabled={draft.selection === "facultative"} value={draft.selection === "facultative" ? 0 : Math.max(1, draft.min)} onChange={(v) => set("min", v)} />
            </Field>
            <Field label="Maximum" htmlFor="g-max" error={errors.max}>
              <NumberInput id="g-max" min={1} max={20} value={draft.max} onChange={(v) => set("max", v)} />
            </Field>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="danger" disabled={pending} onClick={() => setDeleting(true)}>
              <Trash size={18} /> Supprimer le groupe
            </Button>
            <SaveButton pending={pending} dirty={dirty && draft.nom.trim() !== ""} onClick={save} />
          </div>
        </div>

        <div className="mt-6 border-t border-line pt-5">
          <h3 className="text-[1.15rem] font-semibold">Options du groupe</h3>
          <p className="text-[14px] text-muted">Le nom et le prix s'enregistrent quand vous quittez le champ.</p>
          {groupe.options.length === 0 ? (
            <EmptyState title="Aucune option dans ce groupe">Ajoutez une première option ci-dessous.</EmptyState>
          ) : (
            <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
              {groupe.options.map((o) => (
                <OptionRow key={o.id} option={o} ids={groupe.options.map((x) => x.id)} devise={symbol} />
              ))}
            </ul>
          )}
          <form
            className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-line-strong bg-olive-tint/60 px-3 py-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (fresh.nom.trim()) void addOption();
            }}
          >
            <Input aria-label="Nom de la nouvelle option" placeholder="Nom de l'option" maxLength={60} value={fresh.nom} onChange={(e) => setFresh({ ...fresh, nom: e.target.value })} className="min-w-36 flex-1" />
            <span className="w-28 shrink-0">
              <MoneyInput label="Prix supplémentaire de la nouvelle option" cents={fresh.prixCentimes} devise={symbol} onChange={(v) => v !== null && setFresh((f) => ({ ...f, prixCentimes: v }))} />
            </span>
            <Button type="submit" variant="outline" disabled={!fresh.nom.trim() || pending}>
              <Plus size={18} /> Ajouter une option
            </Button>
          </form>
        </div>
      </Card>

      <Card className="h-fit bg-olive-soft/50 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <Bubble className="bg-white">
            <Eye size={22} />
          </Bubble>
          <h2 className="text-[1.3rem] font-semibold">Aperçu client</h2>
        </div>
        <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-white">
          {sample ? <Thumb src={sample.image} alt="" className="aspect-[16/10] w-full rounded-none" /> : null}
          <div className="p-4">
            <p className="text-[1.2rem] font-semibold text-ink">{sample?.nom ?? "Produit d'exemple"}</p>
            <p className="text-[14px] text-muted">{sample?.description ?? "Associez ce groupe à un produit pour voir le rendu."}</p>
            <div className="mt-3 border-t border-line pt-3">
              <p className="text-[15.5px] font-semibold text-ink">
                {draft.nom} <span className="font-normal text-muted">({draft.selection === "obligatoire" ? "obligatoire" : "facultatif"})</span>
              </p>
              <p className="text-[13.5px] text-muted">{single ? "Choisissez une option." : `Choisissez jusqu'à ${draft.max} options.`}</p>
              <ul className="mt-2 divide-y divide-line">
                {groupe.options.map((o) => (
                  <li key={o.id} className={cn("flex items-center gap-3 py-2 text-[15px]", !o.disponible && "opacity-45")}>
                    <span aria-hidden className={cn("size-[18px] shrink-0 border border-line-strong", single ? "rounded-full" : "rounded-[5px]")} />
                    <span className="flex-1">{o.nom}</span>
                    <span className="num text-muted">{o.prixCentimes > 0 ? `+${formatMoney(o.prixCentimes, devise)}` : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Card>

      <Confirm
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Supprimer ce groupe d'options ?"
        danger
        confirmLabel="Supprimer"
        pending={pending}
        onConfirm={async () => {
          const ok = await run(() => call("DELETE", `groupes-options/${groupe.id}`), { success: "Groupe supprimé." });
          setDeleting(false);
          if (ok) onDeleted();
        }}
      >
        « {groupe.nom} » et ses {groupe.options.length} option(s) seront retirés de tous les produits.
      </Confirm>
    </>
  );
}

export function OptionsEditor({ groupes, produits, devise }: { groupes: Groupe[]; produits: Produit[]; devise: string }) {
  const call = useApi();
  const { run, pending } = useAction();
  const [activeId, setActiveId] = useState(groupes[0]?.id ?? "");
  const [name, setName] = useState("");
  const active = groupes.find((g) => g.id === activeId) ?? groupes[0];
  const ids = groupes.map((g) => g.id);

  const add = async () => {
    const out = await run(() => call<{ id: string }>("POST", "groupes-options", { nom: name }), { success: "Groupe d'options ajouté." });
    if (out) {
      setActiveId(out.id);
      setName("");
    }
  };

  return (
    <>
      <PageHeader eyebrow="Options & variantes" title="Options & suppléments" subtitle="Configurez les groupes d'options et les variantes proposées sur vos produits." photo />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,1.85fr)_minmax(0,1.05fr)]">
        <Card className="h-fit p-3">
          {groupes.length === 0 ? (
            <EmptyState icon={<SlidersHorizontal size={24} />} title="Aucun groupe d'options">
              Créez par exemple « Suppléments pizza » ou « Cuisson ».
            </EmptyState>
          ) : (
            <ul className="flex flex-col gap-1">
              {groupes.map((g, i) => (
                <li key={g.id} className={cn("flex items-center gap-1 rounded-xl pr-2 transition-colors", active?.id === g.id ? "bg-olive-soft" : "hover:bg-olive-tint")}>
                  <span className="flex shrink-0 flex-col">
                    <IconButton label={`Monter ${g.nom}`} className="size-7" disabled={i === 0 || pending} onClick={() => run(() => call("POST", "groupes-options/ordre", { ids: moveId(ids, g.id, -1) }))}>
                      <ArrowUp size={14} />
                    </IconButton>
                    <IconButton label={`Descendre ${g.nom}`} className="size-7" disabled={i === ids.length - 1 || pending} onClick={() => run(() => call("POST", "groupes-options/ordre", { ids: moveId(ids, g.id, 1) }))}>
                      <ArrowDown size={14} />
                    </IconButton>
                  </span>
                  <button type="button" aria-current={active?.id === g.id} onClick={() => setActiveId(g.id)} className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[16px] font-medium text-ink">{g.nom}</span>
                      <span className="num block text-[14px] text-muted">{g.options.length} option{g.options.length > 1 ? "s" : ""}</span>
                    </span>
                    <CaretRight size={16} aria-hidden className="text-muted" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="mt-3 flex gap-2 border-t border-line pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) void add();
            }}
          >
            <Input aria-label="Nom du nouveau groupe" placeholder="Nouveau groupe" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
            <Button type="submit" variant="outline" disabled={!name.trim() || pending}>
              <PlusCircle size={18} /> Ajouter
            </Button>
          </form>
        </Card>

        {active ? <GroupPanel key={active.id} groupe={active} produits={produits} devise={devise} onDeleted={() => setActiveId("")} /> : null}
      </div>
      <Callout tone="olive" className="mt-5">
        Les modifications apportées aux options et variantes s'appliqueront aux prochains ajouts de produits. Les commandes déjà envoyées ne sont pas affectées et restent en lecture seule.
      </Callout>
    </>
  );
}
