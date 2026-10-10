"use client";

import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { Fragment } from "react";
import { CommandesNav } from "@/components/admin/commandes-nav";
import { ListEditor } from "@/components/admin/list-editor";
import { SaveButton, useAction, useApi, useDraft } from "@/components/client";
import { Callout, Card, Checkbox, EmptyState, Field, PageHeader, Select } from "@/components/ui";
import type { Named } from "@/lib/types";

interface Statut extends Named {
  couleur: string;
  visibleClient: boolean;
  acteur: string;
  creation: string;
  systeme: boolean;
}
const ACTEURS = ["Système", "Cuisine", "Serveur", "Responsable de salle"].map((a) => ({ value: a, label: a }));

export function StatutsEditor({ statuts, stations, categories, annulation }: { statuts: Statut[]; stations: (Named & { notifierServeur: boolean; equipe: string[] })[]; categories: (Named & { stationId: string })[]; annulation: { annulationRole: string; annulationMotif: boolean; annulationHistorique: boolean } }) {
  const call = useApi();
  const { run, pending } = useAction();
  const routes = Object.fromEntries(categories.map((c) => [c.id, c.stationId]));
  const routing = useDraft(routes);
  const cancel = useDraft(annulation);

  return (
    <>
      <PageHeader
        eyebrow="Commandes"
        title="Statuts & préparation"
        subtitle="Configurez le cycle des commandes et leur acheminement en cuisine."
        actions={
          <ol aria-label="Cycle des commandes" className="flex flex-wrap items-center gap-2">
            {statuts.map((s, i) => (
              <Fragment key={s.id}>
                {i > 0 ? <ArrowRight size={14} aria-hidden className="text-muted" /> : null}
                <li className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3.5 py-1.5 text-[15px]">
                  <span aria-hidden className="size-3.5 rounded-full" style={{ background: s.couleur }} />
                  {s.nom}
                </li>
              </Fragment>
            ))}
          </ol>
        }
      />
      <CommandesNav active="statuts" />

      <Card className="p-5 sm:p-6">
        <h2 className="text-[1.35rem] font-semibold">États des commandes</h2>
        <p className="mb-4 text-[15px] text-muted">Statuts du cycle de commande, utilisés en salle, en cuisine et pour les notifications. Les quatre statuts de base ne peuvent pas être supprimés.</p>
        <ListEditor
          path="statuts"
          items={statuts}
          noun="ce statut"
          ordered
          empty="Aucun statut."
          addLabel="Ajouter un statut"
          lockedIds={statuts.filter((s) => s.systeme).map((s) => s.id)}
          blank={{ nom: "", couleur: "#5B6B7A", visibleClient: true, acteur: "Cuisine" }}
          fields={[
            { key: "nom", label: "Nom du statut", type: "text", max: 30 },
            { key: "couleur", label: "Couleur", type: "color" },
            { key: "acteur", label: "Acteur autorisé", type: "select", options: ACTEURS, className: "w-48" },
            { key: "visibleClient", label: "Visible client", type: "bool" },
          ]}
        />
        <p className="mt-2 text-[13.5px] text-muted">L'interrupteur indique si le client voit ce statut sur sa commande.</p>
      </Card>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,0.9fr)]">
        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[1.35rem] font-semibold">Acheminement par catégorie</h2>
              <p className="text-[15px] text-muted">Associez chaque catégorie à une station de préparation.</p>
            </div>
            <SaveButton pending={pending} dirty={routing.dirty} onClick={() => run(() => call("PUT", "acheminement", { routes: routing.draft }), { success: "Acheminement enregistré." })} />
          </div>
          {categories.length === 0 ? (
            <EmptyState title="Aucune catégorie">Créez vos catégories dans la rubrique Carte.</EmptyState>
          ) : (
            <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
              {categories.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                  <label htmlFor={`route-${c.id}`} className="flex-1 text-[16px]">
                    {c.nom}
                  </label>
                  <Select id={`route-${c.id}`} value={routing.draft[c.id] ?? ""} onChange={(e) => routing.set(c.id, e.target.value)} className="w-44">
                    <option value="">Aucune station</option>
                    {stations.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nom}
                      </option>
                    ))}
                  </Select>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="text-[1.35rem] font-semibold">Stations de préparation</h2>
          <p className="mb-4 text-[15px] text-muted">L'interrupteur prévient le serveur quand les produits de la station sont prêts.</p>
          <ListEditor
            path="stations"
            items={stations.map((s) => ({ id: s.id, nom: s.nom, notifierServeur: s.notifierServeur }))}
            noun="cette station"
            ordered
            empty="Aucune station."
            addLabel="Ajouter"
            blank={{ nom: "", notifierServeur: true }}
            fields={[
              { key: "nom", label: "Nom de la station", type: "text", max: 40 },
              { key: "notifierServeur", label: "Prévenir le serveur quand prêt", type: "bool" },
            ]}
          />
          {stations.some((s) => s.equipe.length > 0) ? (
            <ul className="mt-3 flex flex-col gap-1 text-[14.5px] text-muted">
              {stations.filter((s) => s.equipe.length > 0).map((s) => (
                <li key={s.id}>
                  <span className="text-ink">{s.nom}</span> : {s.equipe.join(", ")}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[14px] text-muted">L'équipe d'une station se définit dans la fiche de chaque membre.</p>
          )}
        </Card>

        <Card className="flex flex-col gap-4 p-5 sm:p-6">
          <div>
            <h2 className="text-[1.35rem] font-semibold">Annulation des commandes</h2>
            <p className="text-[15px] text-muted">Règles d'annulation et historique.</p>
          </div>
          <Field label="Autorisée pour" htmlFor="ann-role">
            <Select id="ann-role" value={cancel.draft.annulationRole} onChange={(e) => cancel.set("annulationRole", e.target.value)}>
              <option value="responsable">Responsable et administrateur</option>
              <option value="administrateur">Administrateur uniquement</option>
            </Select>
          </Field>
          <Checkbox checked={cancel.draft.annulationMotif} onChange={(e) => cancel.set("annulationMotif", e.target.checked)}>
            Demander un motif d'annulation
          </Checkbox>
          <Checkbox checked={cancel.draft.annulationHistorique} onChange={(e) => cancel.set("annulationHistorique", e.target.checked)}>
            Conserver l'enregistrement des annulations
          </Checkbox>
          <Callout tone="neutral">Les commandes validées ne peuvent pas être modifiées par les clients. Seules les annulations sont autorisées, dans le respect de ces règles.</Callout>
          <div className="mt-auto flex justify-end">
            <SaveButton pending={pending} dirty={cancel.dirty} onClick={() => run(() => call("PUT", "parametres-commandes", cancel.draft), { success: "Règles d'annulation enregistrées." })} />
          </div>
        </Card>
      </div>
    </>
  );
}
