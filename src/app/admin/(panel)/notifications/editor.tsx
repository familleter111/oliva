"use client";

import { Bell, ChatCircle, GearSix, PencilSimple, Play, Plus, Trash } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { ListEditor } from "@/components/admin/list-editor";
import { Confirm, SaveButton, useAction, useApi } from "@/components/client";
import { Button, Card, CardHeader, Checkbox, EmptyState, Field, IconButton, Input, PageHeader, Select, TableWrap, Td, Th, Toggle } from "@/components/ui";
import { cn } from "@/lib/format";

interface Regle {
  id: string;
  evenement: string;
  destinataires: string;
  ecran: boolean;
  son: boolean;
  delaiMin: number;
  accuse: boolean;
  sonnerie: string;
  actif: boolean;
}
const DESTINATAIRES = ["Station de préparation", "Serveur affecté", "Responsable de salle", "Personnel affecté", "Administrateur"];
const SONS: Record<string, { label: string; notes: number[] }> = { discret: { label: "Discret", notes: [660] }, clochette: { label: "Clochette", notes: [880, 1175] }, alerte: { label: "Alerte", notes: [740, 740, 988] } };
const VIDE: Regle = { id: "", evenement: "", destinataires: "Serveur affecté", ecran: true, son: false, delaiMin: 0, accuse: false, sonnerie: "discret", actif: true };

/** Joue un court aperçu de la sonnerie, généré dans le navigateur. */
function preview(kind: string) {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  (SONS[kind]?.notes ?? [660]).forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime + i * 0.18;
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.17);
  });
  setTimeout(() => void ctx.close(), 900);
}

const canal = (r: Regle) => (r.ecran && r.son ? "Écran + son" : r.son ? "Son" : "Écran");

export function NotificationsEditor({ regles, motifs }: { regles: Regle[]; motifs: { id: string; libelle: string; couleur: string; actif: boolean }[] }) {
  const call = useApi();
  const { run, pending, errors } = useAction();
  const [form, setForm] = useState<Regle | null>(regles[0] ?? null);
  const [deleting, setDeleting] = useState(false);
  const original = regles.find((r) => r.id === form?.id);
  const dirty = !!form && form.evenement.trim() !== "" && JSON.stringify(form) !== JSON.stringify(original);

  const save = async () => {
    if (!form) return;
    const { id, ...body } = form;
    const out = await run(() => (id ? call<Regle>("PATCH", `notifications/${id}`, body) : call<Regle>("POST", "notifications", body)), { success: id ? "Règle enregistrée." : "Règle ajoutée." });
    if (out) setForm({ ...form, id: out.id });
  };

  return (
    <>
      <PageHeader eyebrow="Réglages" title="Notifications & demandes" subtitle="Configurez les alertes internes et les demandes clients pour votre équipe." />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <Card className="p-5 sm:p-6">
            <CardHeader
              icon={<GearSix size={22} />}
              title="Règles de notification"
              description="Définissez les alertes internes selon les événements de l'application."
              action={
                <Button onClick={() => setForm({ ...VIDE })}>
                  <Plus size={18} /> Ajouter une règle
                </Button>
              }
            />
            {regles.length === 0 ? (
              <EmptyState icon={<Bell size={24} />} title="Aucune règle">
                Ajoutez une première règle pour alerter votre équipe.
              </EmptyState>
            ) : (
              <TableWrap className="mt-4">
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr>
                      <Th>Événement</Th>
                      <Th>Destinataires</Th>
                      <Th>Canal</Th>
                      <Th>Escalade</Th>
                      <Th>Actif</Th>
                      <Th className="w-14">
                        <span className="sr-only">Actions</span>
                      </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {regles.map((r) => (
                      <tr key={r.id} className={cn("transition-colors", form?.id === r.id && "bg-olive-soft/60")}>
                        <Td className="text-ink">{r.evenement}</Td>
                        <Td className="text-muted">{r.destinataires}</Td>
                        <Td className="text-muted">{canal(r)}</Td>
                        <Td className="num text-muted">{r.delaiMin > 0 ? `${r.delaiMin} min` : "Immédiat"}</Td>
                        <Td>
                          <Toggle label={`${r.evenement} actif`} checked={r.actif} disabled={pending} onChange={(e) => run(() => call("PATCH", `notifications/${r.id}`, { actif: e.target.checked }))} />
                        </Td>
                        <Td>
                          <IconButton label={`Modifier ${r.evenement}`} onClick={() => setForm({ ...r })}>
                            <PencilSimple size={19} />
                          </IconButton>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </Card>

          <Card className="p-5 sm:p-6">
            <CardHeader icon={<ChatCircle size={22} />} title="Motifs de demande client" description="Motifs qui seront proposés aux clients lorsqu'ils font une demande depuis leur table." />
            <div className="mt-4">
              <ListEditor
                path="motifs"
                items={motifs}
                noun="ce motif"
                ordered
                empty="Aucun motif."
                addLabel="Ajouter un motif"
                blank={{ libelle: "", couleur: "#52683F", actif: true }}
                fields={[
                  { key: "libelle", label: "Libellé du motif", type: "text", max: 40 },
                  { key: "couleur", label: "Couleur", type: "color" },
                  { key: "actif", label: "Motif actif", type: "bool" },
                ]}
              />
            </div>
          </Card>
        </div>

        {form ? (
          <Card className="h-fit p-5 sm:p-6 scroll-thin xl:sticky xl:top-[72px] xl:max-h-[calc(100dvh-88px)] xl:overflow-y-auto">
            <CardHeader icon={<PencilSimple size={22} />} title={form.id ? "Détails de la règle" : "Nouvelle règle"} description="Personnalisez le comportement de cette notification." />
            <form
              className="mt-4 flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <Field label="Événement" required htmlFor="n-evt" error={errors.evenement}>
                <Input id="n-evt" maxLength={60} value={form.evenement} placeholder="Ex. Appel client" onChange={(e) => setForm({ ...form, evenement: e.target.value })} />
              </Field>
              <Field label="Destinataires" htmlFor="n-dest">
                <Select id="n-dest" value={form.destinataires} onChange={(e) => setForm({ ...form, destinataires: e.target.value })}>
                  {DESTINATAIRES.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </Select>
              </Field>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-[15px]">Canal</legend>
                <Checkbox checked={form.ecran} onChange={(e) => setForm({ ...form, ecran: e.target.checked })}>
                  Afficher sur l'écran
                </Checkbox>
                <Checkbox checked={form.son} onChange={(e) => setForm({ ...form, son: e.target.checked })}>
                  Jouer un son
                </Checkbox>
                {!form.ecran && !form.son ? <p className="text-[13.5px] text-danger">Choisissez au moins un canal.</p> : null}
              </fieldset>
              <Field label="Délai d'escalade" htmlFor="n-delai" help="Si la demande n'est pas prise en charge dans ce délai, un niveau supérieur est alerté.">
                <Select id="n-delai" value={String(form.delaiMin)} onChange={(e) => setForm({ ...form, delaiMin: Number(e.target.value) })}>
                  {[0, 1, 2, 3, 5, 10, 15].map((m) => (
                    <option key={m} value={m}>
                      {m === 0 ? "Aucune escalade" : `${m} min`}
                    </option>
                  ))}
                </Select>
              </Field>
              <Checkbox checked={form.accuse} onChange={(e) => setForm({ ...form, accuse: e.target.checked })}>
                <span className="block">Accusé de prise en compte requis</span>
                <span className="block text-[13.5px] text-muted">La notification reste active jusqu'à sa prise en compte par un membre de l'équipe.</span>
              </Checkbox>
              <Field label="Son" htmlFor="n-son">
                <div className="flex gap-2">
                  <Select id="n-son" className="flex-1" disabled={!form.son} value={form.sonnerie} onChange={(e) => setForm({ ...form, sonnerie: e.target.value })}>
                    {Object.entries(SONS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </Select>
                  <Button variant="secondary" disabled={!form.son} onClick={() => preview(form.sonnerie)}>
                    <Play size={17} weight="fill" /> Écouter
                  </Button>
                </div>
              </Field>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
                {form.id ? (
                  <Button variant="danger" disabled={pending} onClick={() => setDeleting(true)}>
                    <Trash size={18} /> Supprimer
                  </Button>
                ) : (
                  <span />
                )}
                <SaveButton pending={pending} dirty={dirty && (form.ecran || form.son)} />
              </div>
            </form>
          </Card>
        ) : null}
      </div>

      <Confirm
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Supprimer cette règle ?"
        danger
        confirmLabel="Supprimer"
        pending={pending}
        onConfirm={async () => {
          const ok = await run(() => call("DELETE", `notifications/${form?.id}`), { success: "Règle supprimée." });
          setDeleting(false);
          if (ok) setForm(null);
        }}
      >
        La règle « {form?.evenement} » ne déclenchera plus aucune alerte.
      </Confirm>
    </>
  );
}
