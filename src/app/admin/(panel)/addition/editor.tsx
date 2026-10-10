"use client";

import { Check, Coins, Eye, Info, Percent, Plus, Receipt, Trash, Users } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { NumberInput, SaveButton, useAction, useApi, useDraft } from "@/components/client";
import { Badge, Bubble, Button, Callout, Card, CardHeader, EmptyState, Field, IconButton, Input, PageHeader, Radio, Select, Toggle } from "@/components/ui";
import { formatMoney } from "@/lib/format";

interface Params {
  devise: string;
  affichagePrix: string;
  arrondi: string;
  fraisServiceActif: boolean;
  fraisServiceBp: number;
  partageActif: boolean;
}
interface Taxe {
  id: string;
  nom: string;
  tauxBp: number | null;
  parDefaut: boolean;
  statut: string;
}
const pct = (bp: number | null) => (bp === null ? "" : String(bp / 100).replace(".", ","));
const toBp = (s: string): number | null | undefined => {
  if (s.trim() === "") return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) : undefined;
};

function TaxRow({ t }: { t: Taxe }) {
  const call = useApi();
  const { run, pending } = useAction();
  const { draft, set, dirty } = useDraft({ nom: t.nom, taux: pct(t.tauxBp), statut: t.statut });
  const bp = toBp(draft.taux);
  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2.5">
      <Input aria-label="Nom du profil" maxLength={40} value={draft.nom} onChange={(e) => set("nom", e.target.value)} className="min-w-36 flex-1" />
      <span className="relative w-24 shrink-0">
        <Input aria-label="Taux en pourcentage" inputMode="decimal" placeholder="Taux" aria-invalid={bp === undefined} value={draft.taux} onChange={(e) => set("taux", e.target.value)} className="num pr-7" />
        <span aria-hidden className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-muted">
          %
        </span>
      </span>
      <Select aria-label="Statut du profil" value={draft.statut} onChange={(e) => set("statut", e.target.value)} className="w-32 shrink-0">
        <option value="brouillon">Brouillon</option>
        <option value="actif">Actif</option>
      </Select>
      <Radio name="taxe-defaut" aria-label={`${t.nom} par défaut`} checked={t.parDefaut} disabled={pending} onChange={() => run(() => call("PATCH", `taxes/${t.id}`, { parDefaut: true }), { success: "Profil par défaut modifié." })}>
        <span className="text-[14px] text-muted">Par défaut</span>
      </Radio>
      <span className="ml-auto flex items-center gap-1">
        {dirty ? (
          <Button size="sm" disabled={pending || bp === undefined || !draft.nom.trim()} onClick={() => run(() => call("PATCH", `taxes/${t.id}`, { nom: draft.nom, tauxBp: bp, statut: draft.statut }), { success: "Profil enregistré." })}>
            <Check size={16} /> Enregistrer
          </Button>
        ) : null}
        <IconButton label={`Supprimer ${t.nom}`} disabled={pending} onClick={() => run(() => call("DELETE", `taxes/${t.id}`), { success: "Profil supprimé." })}>
          <Trash size={18} />
        </IconButton>
      </span>
    </li>
  );
}

export function AdditionEditor({ initial, devises, taxes, table }: { initial: Params; devises: string[]; taxes: Taxe[]; table: string }) {
  const call = useApi();
  const { run, pending } = useAction();
  const { draft, set, dirty } = useDraft(initial);
  const [name, setName] = useState("");
  const [people, setPeople] = useState(5);
  const [fee, setFee] = useState(pct(initial.fraisServiceBp));

  // Exemple fictif, sans calcul fiscal : deux commandes d'une même table.
  const commandes = [6050, 850];
  const sousTotal = commandes.reduce((a, b) => a + b, 0);
  const frais = draft.fraisServiceActif ? Math.round((sousTotal * draft.fraisServiceBp) / 10000) : 0;
  const step = Math.round(Number(draft.arrondi) * 100) || 1;
  const total = Math.round((sousTotal + frais) / step) * step;
  const part = Math.ceil(total / people / step) * step;

  return (
    <>
      <PageHeader eyebrow="Réglages" title="Addition & règlement" subtitle="Définissez les paramètres de facturation, de partage et de règlement." photo actions={<SaveButton pending={pending} dirty={dirty} size="lg" onClick={() => run(() => call("PUT", "addition", draft), { success: "Réglages de l'addition enregistrés." })} />} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <Card className="p-5 sm:p-6">
            <CardHeader icon={<Coins size={22} />} title="Devise et affichage des prix" />
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label="Devise de l'addition" htmlFor="a-devise">
                <Select id="a-devise" value={draft.devise} onChange={(e) => set("devise", e.target.value)}>
                  {devises.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Affichage des prix" htmlFor="a-affichage">
                <Select id="a-affichage" value={draft.affichagePrix} onChange={(e) => set("affichagePrix", e.target.value)}>
                  <option value="ttc">Prix affichés TTC</option>
                  <option value="ht">Prix affichés HT</option>
                </Select>
              </Field>
              <Field label="Arrondi des montants" htmlFor="a-arrondi">
                <Select id="a-arrondi" value={draft.arrondi} onChange={(e) => set("arrondi", e.target.value)}>
                  <option value="0.01">2 décimales (0,01)</option>
                  <option value="0.05">Au plus proche de 0,05</option>
                  <option value="0.10">Au plus proche de 0,10</option>
                </Select>
              </Field>
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <CardHeader icon={<Receipt size={22} />} title="Profils de taxes" description="Profils à renseigner avec votre comptabilité. Aucun taux n'est proposé par défaut." />
            {taxes.length === 0 ? (
              <EmptyState title="Aucun profil de taxe">Les taux dépendent de votre activité et de votre pays : ils sont à définir par vos soins.</EmptyState>
            ) : (
              <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
                {taxes.map((t) => (
                  <TaxRow key={t.id} t={t} />
                ))}
              </ul>
            )}
            <form
              className="mt-3 flex flex-wrap gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (name.trim() && (await run(() => call("POST", "taxes", { nom: name, parDefaut: taxes.length === 0 }), { success: "Profil ajouté en brouillon." }))) setName("");
              }}
            >
              <Input aria-label="Nom du nouveau profil" placeholder="Nom du profil, par exemple Restauration sur place" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} className="min-w-52 flex-1" />
              <Button type="submit" variant="outline" disabled={!name.trim() || pending}>
                <Plus size={18} /> Ajouter un profil
              </Button>
            </form>
            <Callout tone="warn" className="mt-4">
              À valider avec votre comptabilité avant activation. L'application n'effectue aucun calcul fiscal tant qu'aucun profil n'est actif.
            </Callout>
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-4">
              <Bubble>
                <Percent size={22} />
              </Bubble>
              <div className="min-w-48 flex-1">
                <h2 className="text-[1.3rem] font-semibold">Frais de service</h2>
                <p className="text-[14.5px] text-muted">Ajoute un pourcentage aux additions. S'appliquera aux nouvelles commandes.</p>
              </div>
              <span className="relative w-24">
                <Input
                  aria-label="Taux des frais de service"
                  inputMode="decimal"
                  disabled={!draft.fraisServiceActif}
                  value={fee}
                  aria-invalid={toBp(fee) === undefined}
                  onChange={(e) => {
                    setFee(e.target.value);
                    const bp = toBp(e.target.value);
                    if (typeof bp === "number" && bp <= 3000) set("fraisServiceBp", bp);
                  }}
                  className="num pr-7"
                />
                <span aria-hidden className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-muted">
                  %
                </span>
              </span>
              <Toggle label="Frais de service" checked={draft.fraisServiceActif} onChange={(e) => set("fraisServiceActif", e.target.checked)} />
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-line pt-5">
              <Bubble>
                <Users size={22} />
              </Bubble>
              <div className="min-w-48 flex-1">
                <h2 className="text-[1.3rem] font-semibold">Partage de l'addition</h2>
                <p className="text-[14.5px] text-muted">Permet de répartir le total entre les convives à parts égales.</p>
              </div>
              <Toggle label="Partage de l'addition" checked={draft.partageActif} onChange={(e) => set("partageActif", e.target.checked)} />
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-line pt-5">
              <Bubble>
                <Receipt size={22} />
              </Bubble>
              <div className="min-w-48 flex-1">
                <h2 className="text-[1.3rem] font-semibold">Règlement</h2>
                <p className="text-[14.5px] text-muted">Les clients demandent l'addition, le personnel encaisse à la caisse.</p>
              </div>
              <Badge>Paiement en ligne : non configuré</Badge>
            </div>
          </Card>
        </div>

        <Card className="h-fit p-5 sm:p-6 scroll-thin xl:sticky xl:top-[72px] xl:max-h-[calc(100dvh-88px)] xl:overflow-y-auto">
          <CardHeader icon={<Eye size={22} />} title="Aperçu" description="Exemple fictif, sans calcul fiscal." />
          <div className="mt-4 rounded-xl border border-line px-4 py-2.5 text-[16px]">{table}</div>
          <dl className="num mt-3 rounded-xl bg-olive-tint px-4 py-3 text-[15.5px]">
            {commandes.map((c, i) => (
              <div key={i} className="flex justify-between py-1">
                <dt>Commande {String(i + 1).padStart(2, "0")}</dt>
                <dd>{formatMoney(c, draft.devise)}</dd>
              </div>
            ))}
            {frais > 0 ? (
              <div className="flex justify-between py-1 text-muted">
                <dt>Frais de service ({pct(draft.fraisServiceBp)} %)</dt>
                <dd>{formatMoney(frais, draft.devise)}</dd>
              </div>
            ) : null}
            <div className="mt-1 flex justify-between border-t border-line-strong pt-2 text-[1.15rem] font-semibold text-ink">
              <dt>Total de la table</dt>
              <dd>{formatMoney(total, draft.devise)}</dd>
            </div>
          </dl>
          {draft.partageActif ? (
            <div className="mt-3 rounded-xl bg-olive-soft/70 px-4 py-3">
              <label className="flex flex-wrap items-center gap-3 text-[16px] whitespace-nowrap text-ink">
                <Users size={22} aria-hidden className="shrink-0" />
                Partage à
                <NumberInput aria-label="Nombre de personnes" min={2} max={20} value={people} onChange={setPeople} className="w-20" />
                personnes
              </label>
              <p className="num mt-2 flex items-baseline justify-between border-t border-line-strong pt-2">
                <span className="text-[16px] text-ink">Montant par personne</span>
                <span className="text-[1.5rem] font-semibold text-ink">{formatMoney(part, draft.devise)}</span>
              </p>
            </div>
          ) : null}
          <Callout tone="info" className="mt-3">
            {taxes.some((t) => t.statut === "actif") ? "Le détail des taxes apparaîtra sur l'addition du personnel." : "Aucun détail de taxes affiché. Configurez et activez un profil pour visualiser sa répartition."}
          </Callout>
          <p className="mt-3 flex gap-2 text-[14px] leading-snug text-muted">
            <Info size={18} className="mt-0.5 shrink-0" />
            Les montants des commandes sont figés au moment de l'envoi. Les clients demandent l'addition et le personnel gère le règlement.
          </p>
        </Card>
      </div>
    </>
  );
}
