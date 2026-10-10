"use client";

import { Archive, Armchair, CaretRight, House, MagnifyingGlass, PencilSimple, Plus, QrCode, Sun, X } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useState } from "react";
import { ListEditor } from "@/components/admin/list-editor";
import { Confirm, NumberInput, SaveButton, Tabs, useAction, useApi } from "@/components/client";
import { Badge, Bubble, Button, Card, EmptyState, Field, IconButton, Input, PageHeader, Select, TableWrap, Td, Th, Toggle } from "@/components/ui";
import { cn } from "@/lib/format";
import type { Named } from "@/lib/types";

interface Zone extends Named {
  active: boolean;
  icone: string;
}
interface Table {
  id: string;
  nom: string;
  zoneId: string;
  capacite: number;
  active: boolean;
  serveurId: string;
  couleur: string;
  session: boolean;
}
const COULEURS = ["#8FA382", "#D9CFC4", "#A9BED6", "#F0C9C5", "#EFD99A", "#C3ACDD", "#CFCFCF"];
type Form = Omit<Table, "session">;

export function TablesEditor({ zones, tables, personnel }: { zones: Zone[]; tables: Table[]; personnel: Named[] }) {
  const call = useApi();
  const { run, pending, errors } = useAction();
  const [tab, setTab] = useState("tables");
  const [query, setQuery] = useState("");
  const [zoneFilter, setZoneFilter] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [archiving, setArchiving] = useState(false);

  const zoneName = new Map(zones.map((z) => [z.id, z.nom]));
  const shown = tables.filter((t) => (!zoneFilter || t.zoneId === zoneFilter) && t.nom.toLowerCase().includes(query.trim().toLowerCase()));
  const current = form?.id ? tables.find((t) => t.id === form.id) : undefined;

  const blank = (): Form => ({ id: "", nom: `Table ${String(tables.length + 1).padStart(2, "0")}`, zoneId: zoneFilter || zones[0]?.id || "", capacite: 4, active: true, serveurId: "", couleur: COULEURS[0] });
  const save = async () => {
    if (!form) return;
    const { id, ...body } = form;
    const out = await run(() => (id ? call("PATCH", `tables/${id}`, body) : call("POST", "tables", body)), { success: id ? "Table enregistrée." : "Table ajoutée." });
    if (out) setForm(null);
  };

  return (
    <>
      <PageHeader eyebrow="Équipe & salle" title="Zones & tables" subtitle="Organisez vos espaces et configurez vos tables." photo />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {zones.map((z) => {
          const n = tables.filter((t) => t.zoneId === z.id).length;
          return (
            <button
              key={z.id}
              type="button"
              aria-pressed={zoneFilter === z.id}
              onClick={() => {
                setZoneFilter(zoneFilter === z.id ? "" : z.id);
                setTab("tables");
              }}
              className={cn("press flex items-center gap-4 rounded-2xl border bg-white p-4 text-left shadow-card", zoneFilter === z.id ? "border-olive" : "border-line hover:border-line-strong")}
            >
              <Bubble className="size-14">{z.icone === "sun" ? <Sun size={26} weight="light" /> : <House size={26} weight="light" />}</Bubble>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[1.3rem] font-semibold text-ink">{z.nom}</span>
                <span className="num block text-[15px] text-muted">
                  {n} table{n > 1 ? "s" : ""}
                </span>
              </span>
              <CaretRight size={18} aria-hidden className="text-muted" />
            </button>
          );
        })}
        <div className="flex items-center gap-4 rounded-2xl border border-line bg-olive-soft/50 p-4">
          <Bubble className="size-14 bg-white">
            <Armchair size={26} weight="light" />
          </Bubble>
          <span>
            <span className="block text-[15px] text-muted">Total</span>
            <span className="num block text-[1.5rem] leading-tight font-bold text-ink">
              {tables.length} table{tables.length > 1 ? "s" : ""}
            </span>
          </span>
        </div>
      </div>

      <div className={cn("mt-5 grid gap-5", form && tab === "tables" && "xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]")}>
        <Card className="p-4 sm:p-5">
          <Tabs label="Zones et tables" value={tab} onChange={setTab} tabs={[{ id: "tables", label: "Tables" }, { id: "zones", label: "Zones" }]} />
          {tab === "tables" ? (
            <>
              <div className="mt-4 flex flex-wrap gap-2">
                <label className="relative min-w-52 flex-1">
                  <span className="sr-only">Rechercher une table</span>
                  <MagnifyingGlass size={18} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
                  <Input type="search" placeholder="Rechercher une table" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-10" />
                </label>
                <Button disabled={zones.length === 0} onClick={() => setForm(blank())}>
                  <Plus size={18} /> Ajouter une table
                </Button>
                <Link href="/admin/plan" className="press inline-flex h-10 items-center gap-2 rounded-[10px] border border-line-strong bg-white px-4 text-[15px] hover:bg-olive-tint">
                  Ouvrir le plan de salle
                </Link>
              </div>
              {shown.length === 0 ? (
                <EmptyState icon={<Armchair size={24} />} title={zones.length === 0 ? "Créez d'abord une zone" : tables.length === 0 ? "Aucune table pour le moment" : "Aucune table ne correspond"}>
                  {zones.length === 0 ? "Une table appartient toujours à une zone, par exemple Salle principale ou Terrasse. Ouvrez l'onglet Zones." : "Ajoutez vos tables pour générer leurs QR codes et préparer le plan de salle."}
                </EmptyState>
              ) : (
                <TableWrap className="mt-4">
                  <table className="w-full min-w-[620px]">
                    <thead>
                      <tr>
                        <Th>Nom</Th>
                        <Th>Zone</Th>
                        <Th>Capacité</Th>
                        <Th>Statut</Th>
                        <Th>QR</Th>
                        <Th className="w-14">
                          <span className="sr-only">Actions</span>
                        </Th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((t) => (
                        <tr key={t.id} className={cn("transition-colors", form?.id === t.id && "bg-olive-soft/60")}>
                          <Td>
                            <span className="flex items-center gap-3">
                              <span aria-hidden className="size-3 rounded-full" style={{ background: t.couleur }} />
                              <span className="font-medium text-ink">{t.nom}</span>
                            </span>
                          </Td>
                          <Td className="text-muted">{zoneName.get(t.zoneId)}</Td>
                          <Td className="num text-muted">{t.capacite} places</Td>
                          <Td>
                            <Badge tone={t.active ? "olive" : "neutral"} dot>
                              {t.active ? (t.session ? "Session ouverte" : "Active") : "Désactivée"}
                            </Badge>
                          </Td>
                          <Td>
                            <Link href={`/admin/qr?table=${t.id}`} aria-label={`QR code de ${t.nom}`} className="press inline-grid size-9 place-items-center rounded-[10px] hover:bg-olive-soft">
                              <QrCode size={20} />
                            </Link>
                          </Td>
                          <Td>
                            <IconButton label={`Modifier ${t.nom}`} onClick={() => setForm({ id: t.id, nom: t.nom, zoneId: t.zoneId, capacite: t.capacite, active: t.active, serveurId: t.serveurId, couleur: t.couleur })}>
                              <PencilSimple size={19} />
                            </IconButton>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              )}
            </>
          ) : (
            <div className="mt-4">
              <p className="mb-3 text-[15px] text-muted">Une zone qui contient encore des tables ne peut pas être supprimée.</p>
              <ListEditor
                path="zones"
                items={zones}
                noun="cette zone"
                ordered
                empty="Aucune zone."
                addLabel="Ajouter une zone"
                blank={{ nom: "", active: true }}
                fields={[
                  { key: "nom", label: "Nom de la zone", type: "text", max: 40 },
                  { key: "active", label: "Zone active", type: "bool" },
                ]}
              />
            </div>
          )}
        </Card>

        {form && tab === "tables" ? (
          <Card className="h-fit animate-rise p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <Bubble className="size-10">
                <Armchair size={20} />
              </Bubble>
              <h2 className="flex-1 text-[1.4rem] font-semibold">{form.id ? (current?.nom ?? form.nom) : "Nouvelle table"}</h2>
              <IconButton label="Fermer" onClick={() => setForm(null)}>
                <X size={18} />
              </IconButton>
            </div>
            <form
              className="mt-4 flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <Field label="Nom de la table" required htmlFor="t-nom" error={errors.nom}>
                <Input id="t-nom" maxLength={30} required value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
              </Field>
              <Field label="Zone" required htmlFor="t-zone" error={errors.zoneId}>
                <Select id="t-zone" value={form.zoneId} onChange={(e) => setForm({ ...form, zoneId: e.target.value })}>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.nom}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Capacité (places)" htmlFor="t-cap" error={errors.capacite}>
                <NumberInput id="t-cap" min={1} max={50} value={form.capacite} onChange={(v) => setForm((f) => (f ? { ...f, capacite: v } : f))} className="w-28" />
              </Field>
              <div className="flex items-center gap-3">
                <Toggle label="Table active" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                <span className="text-[15px]">Table active</span>
              </div>
              <Field label="Attribution par défaut" optional htmlFor="t-serveur" help="L'attribution peut être modifiée à tout moment pendant le service.">
                <Select id="t-serveur" value={form.serveurId} onChange={(e) => setForm({ ...form, serveurId: e.target.value })}>
                  <option value="">Aucune</option>
                  {personnel.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nom}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Couleur d'affichage">
                <div role="radiogroup" aria-label="Couleur d'affichage" className="flex flex-wrap gap-2">
                  {COULEURS.map((c) => (
                    <button key={c} type="button" role="radio" aria-checked={form.couleur === c} aria-label={`Couleur ${c}`} onClick={() => setForm({ ...form, couleur: c })} className={cn("press size-8 rounded-full border-2", form.couleur === c ? "border-ink" : "border-white ring-1 ring-line")} style={{ background: c }} />
                  ))}
                </div>
              </Field>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
                {form.id ? (
                  <Button variant="danger" disabled={pending || current?.session} onClick={() => setArchiving(true)}>
                    <Archive size={18} /> Archiver la table
                  </Button>
                ) : (
                  <span />
                )}
                <SaveButton pending={pending} dirty={form.nom.trim() !== "" && !!form.zoneId} />
              </div>
              {form.id ? <p className="text-[13.5px] text-muted">L'archivage nécessite qu'aucune session ne soit active.</p> : null}
            </form>
          </Card>
        ) : null}
      </div>

      <Confirm
        open={archiving}
        onClose={() => setArchiving(false)}
        title="Archiver cette table ?"
        danger
        confirmLabel="Archiver"
        pending={pending}
        onConfirm={async () => {
          const ok = await run(() => call("POST", `tables/${form?.id}/archiver`), { success: "Table archivée." });
          setArchiving(false);
          if (ok) setForm(null);
        }}
      >
        « {form?.nom} » sera retirée de la liste et du plan de salle. Son QR code ne donnera plus accès à aucune session. L'historique de ses commandes est conservé.
      </Confirm>
    </>
  );
}
