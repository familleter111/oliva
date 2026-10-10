"use client";

import { CalendarBlank, CopySimple, Plus, PlusCircle, Trash } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { Modal, SaveButton, useAction, useApi, useDraft } from "@/components/client";
import { Button, Card, EmptyState, Field, IconButton, Input, Select, TableWrap, Td, Textarea, Th, Toggle, PageHeader } from "@/components/ui";
import { JOURS, formatDate } from "@/lib/format";

interface Plage {
  libelle: string;
  debut: string;
  fin: string;
}
interface Etat {
  jours: { jour: number; ouvert: boolean; plages: Plage[] }[];
  arretAvantFermetureMin: number;
  messageHorsHoraires: string;
}
interface Exception {
  id: string;
  date: string;
  motif: string;
  service: string;
}
const SERVICE: Record<string, string> = { journee: "Toute la journée", dejeuner: "Déjeuner", diner: "Dîner" };
const DEFAUTS: Plage[] = [
  { libelle: "Déjeuner", debut: "12:00", fin: "15:00" },
  { libelle: "Dîner", debut: "19:00", fin: "23:00" },
];

export function HorairesEditor({ initial, exceptions }: { initial: Etat; exceptions: Exception[] }) {
  const call = useApi();
  const { run, pending } = useAction();
  const { draft, setDraft, set, dirty } = useDraft(initial);
  const [adding, setAdding] = useState(false);
  const [exc, setExc] = useState({ date: "", motif: "", service: "journee" });

  const updateDay = (jour: number, patch: Partial<Etat["jours"][number]>) => setDraft((d) => ({ ...d, jours: d.jours.map((j) => (j.jour === jour ? { ...j, ...patch } : j)) }));
  const updatePlage = (jour: number, i: number, patch: Partial<Plage>) =>
    setDraft((d) => ({ ...d, jours: d.jours.map((j) => (j.jour === jour ? { ...j, plages: j.plages.map((p, k) => (k === i ? { ...p, ...patch } : p)) } : j)) }));
  const copyFirstOpen = () => {
    const source = draft.jours.find((j) => j.ouvert && j.plages.length > 0);
    if (!source) return;
    setDraft((d) => ({ ...d, jours: d.jours.map((j) => (j.ouvert ? { ...j, plages: source.plages.map((p) => ({ ...p })) } : j)) }));
  };

  const save = () => run(() => call("PUT", "horaires", draft), { success: "Horaires enregistrés." });
  const addException = async () => {
    const ok = await run(() => call("POST", "exceptions", exc), { success: "Fermeture ajoutée." });
    if (ok) {
      setAdding(false);
      setExc({ date: "", motif: "", service: "journee" });
    }
  };

  return (
    <>
      <PageHeader eyebrow="Horaires" title="Le bon menu, au bon moment." subtitle="Définissez les périodes pendant lesquelles les clients peuvent commander." />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)]">
        <Card className="p-5 sm:p-6">
          <h2 className="text-[1.4rem] font-semibold">Horaires d'ouverture</h2>
          <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
            {draft.jours.map((j) => (
              <li key={j.jour} className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center">
                <div className="flex w-full items-center gap-4 md:w-56">
                  <span className="w-24 text-[16px]">{JOURS[j.jour - 1]}</span>
                  <Toggle
                    label={`${JOURS[j.jour - 1]} ouvert`}
                    checked={j.ouvert}
                    onChange={(e) => updateDay(j.jour, { ouvert: e.target.checked, plages: e.target.checked && j.plages.length === 0 ? DEFAUTS.map((p) => ({ ...p })) : j.plages })}
                  />
                  <span className="text-[15px] text-muted">{j.ouvert ? "Ouvert" : "Fermé"}</span>
                </div>
                {j.ouvert ? (
                  <div className="flex flex-1 flex-wrap items-center gap-x-5 gap-y-2">
                    {j.plages.map((p, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <Input aria-label={`${JOURS[j.jour - 1]}, plage ${i + 1}, début`} type="time" value={p.debut} onChange={(e) => updatePlage(j.jour, i, { debut: e.target.value })} className="num w-[104px]" />
                        <span aria-hidden className="text-muted">
                          à
                        </span>
                        <Input aria-label={`${JOURS[j.jour - 1]}, plage ${i + 1}, fin`} type="time" value={p.fin} onChange={(e) => updatePlage(j.jour, i, { fin: e.target.value })} className="num w-[104px]" />
                        <IconButton label="Retirer cette plage" onClick={() => updateDay(j.jour, { plages: j.plages.filter((_, k) => k !== i) })}>
                          <Trash size={17} />
                        </IconButton>
                      </div>
                    ))}
                    {j.plages.length < 4 ? (
                      <Button variant="ghost" size="sm" onClick={() => updateDay(j.jour, { plages: [...j.plages, { libelle: "Service", debut: "15:00", fin: "18:00" }] })}>
                        <Plus size={16} /> Plage
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={copyFirstOpen}>
              <CopySimple size={18} /> Copier aux autres jours ouverts
            </Button>
          </div>
        </Card>

        <Card className="flex flex-col gap-4 bg-olive-soft/50 p-5 sm:p-6">
          <h2 className="text-[1.4rem] font-semibold">Prise de commande</h2>
          <Field label="Arrêter les commandes avant la fermeture" htmlFor="arret">
            <Select id="arret" value={String(draft.arretAvantFermetureMin)} onChange={(e) => set("arretAvantFermetureMin", Number(e.target.value))}>
              {[0, 10, 15, 20, 30, 45, 60].map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? "Jusqu'à la fermeture" : `${m} minutes`}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Message hors horaires" htmlFor="message" help={<span className="num">{draft.messageHorsHoraires.length} / 160</span>}>
            <Textarea id="message" maxLength={160} value={draft.messageHorsHoraires} onChange={(e) => set("messageHorsHoraires", e.target.value)} />
          </Field>
          <div className="mt-auto flex justify-end">
            <SaveButton pending={pending} dirty={dirty} onClick={save} />
          </div>
        </Card>
      </div>

      <Card className="mt-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[1.4rem] font-semibold">Fermetures exceptionnelles</h2>
          <Button variant="secondary" onClick={() => setAdding(true)}>
            <PlusCircle size={18} /> Ajouter une date
          </Button>
        </div>
        {exceptions.length === 0 ? (
          <EmptyState icon={<CalendarBlank size={24} />} title="Aucune fermeture exceptionnelle">
            Ajoutez les jours fériés ou les congés pour prévenir vos clients.
          </EmptyState>
        ) : (
          <TableWrap className="mt-4">
            <table className="w-full min-w-[520px]">
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Motif</Th>
                  <Th>Service concerné</Th>
                  <Th className="w-14">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {exceptions.map((e) => (
                  <tr key={e.id}>
                    <Td>{formatDate(e.date)}</Td>
                    <Td className="text-muted">{e.motif || "Non précisé"}</Td>
                    <Td>{SERVICE[e.service] ?? e.service}</Td>
                    <Td>
                      <IconButton label={`Supprimer la fermeture du ${formatDate(e.date)}`} disabled={pending} onClick={() => run(() => call("DELETE", `exceptions/${e.id}`), { success: "Fermeture supprimée." })}>
                        <Trash size={18} />
                      </IconButton>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Ajouter une fermeture"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Annuler
            </Button>
            <Button disabled={pending || !exc.date} onClick={addException}>
              Ajouter
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Date" required htmlFor="exc-date">
            <Input id="exc-date" type="date" value={exc.date} onChange={(e) => setExc({ ...exc, date: e.target.value })} />
          </Field>
          <Field label="Motif" optional htmlFor="exc-motif">
            <Input id="exc-motif" maxLength={80} value={exc.motif} placeholder="Jour férié, congés annuels" onChange={(e) => setExc({ ...exc, motif: e.target.value })} />
          </Field>
          <Field label="Service concerné" htmlFor="exc-service">
            <Select id="exc-service" value={exc.service} onChange={(e) => setExc({ ...exc, service: e.target.value })}>
              {Object.entries(SERVICE).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>
    </>
  );
}
