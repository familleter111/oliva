"use client";

import { ArrowsClockwise, Atom, ChatText, CheckSquare, Database, Eye, Lock, Receipt, ShieldCheck, ShoppingBag, Sparkle, Stack, TextAa, UserCircle } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";
import { CommandesNav } from "@/components/admin/commandes-nav";
import { NumberInput, SaveButton, useAction, useApi, useDraft } from "@/components/client";
import { Badge, Bubble, Callout, Card, CardHeader, Input, PageHeader, Select, Thumb, Toggle } from "@/components/ui";
import { formatMoney } from "@/lib/format";

interface Params {
  quantiteMax: number;
  instructionsActives: boolean;
  instructionsMax: number;
  confirmation: boolean;
  animations: boolean;
  pseudoActif: boolean;
  pseudoMode: string;
  libelleBouton: string;
  commandesSuccessives: boolean;
}

function Row({ icon, title, text, children }: { icon: ReactNode; title: string; text: string; children: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
      <span className="shrink-0 text-ink">{icon}</span>
      <div className="min-w-48 flex-1">
        <p className="text-[16.5px] text-ink">{title}</p>
        <p className="text-[14px] text-muted">{text}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">{children}</div>
    </li>
  );
}

export function PanierEditor({ initial, exemple, devise, table }: { initial: Params; exemple: { nom: string; prixCentimes: number; quantite: number; image: string | null }[]; devise: string; table: string }) {
  const call = useApi();
  const { run, pending } = useAction();
  const { draft, set, dirty } = useDraft(initial);
  const total = exemple.reduce((n, l) => n + l.prixCentimes * l.quantite, 0);

  return (
    <>
      <PageHeader eyebrow="Commandes" title="Panier partagé" subtitle="Paramétrez l'expérience de commande à plusieurs, à table." actions={<SaveButton pending={pending} dirty={dirty && draft.libelleBouton.trim() !== ""} size="lg" onClick={() => run(() => call("PUT", "parametres-commandes", draft), { success: "Réglages du panier enregistrés." })} />} />
      <CommandesNav active="panier" />
      <Callout tone="neutral" className="mb-5" title="Appliqués à la commande depuis la table">
        Ces réglages s'appliquent au panier partagé que les clients ouvrent en lisant le QR code de leur table. Suivez les commandes reçues dans Service en direct.
      </Callout>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <Card className="p-5 sm:p-6">
            <CardHeader icon={<Stack size={22} />} title="Paramètres du panier partagé" description="Ces réglages s'appliquent aux commandes passées depuis le QR code de table." />
            <ul className="mt-2 divide-y divide-line">
              <Row icon={<Stack size={24} weight="light" />} title="Quantité maximale par article" text="Limite la quantité pouvant être ajoutée pour un même produit dans le panier partagé.">
                <NumberInput aria-label="Quantité maximale par article" min={1} max={99} value={draft.quantiteMax} onChange={(v) => set("quantiteMax", v)} className="w-24" />
              </Row>
              <Row icon={<ChatText size={24} weight="light" />} title="Instructions clients" text="Permet d'ajouter une instruction libre : cuisson, allergie, préférence.">
                <Toggle label="Instructions clients" checked={draft.instructionsActives} onChange={(e) => set("instructionsActives", e.target.checked)} />
                <label className="flex items-center gap-2 text-[13.5px] text-muted">
                  Caractères maximum
                  <NumberInput aria-label="Nombre de caractères maximum" min={20} max={500} disabled={!draft.instructionsActives} value={draft.instructionsMax} onChange={(v) => set("instructionsMax", v)} className="w-24" />
                </label>
              </Row>
              <Row icon={<CheckSquare size={24} weight="light" />} title="Dialogue de confirmation" text="Affiche un récapitulatif avant l'envoi de la commande.">
                <Toggle label="Dialogue de confirmation" checked={draft.confirmation} onChange={(e) => set("confirmation", e.target.checked)} />
              </Row>
              <Row icon={<Sparkle size={24} weight="light" />} title="Animations subtiles" text="Active de légères animations lors des ajouts au panier.">
                <Toggle label="Animations subtiles" checked={draft.animations} onChange={(e) => set("animations", e.target.checked)} />
              </Row>
              <Row icon={<UserCircle size={24} weight="light" />} title="Pseudo des participants" text="Permet aux clients d'utiliser un pseudo, sans création de compte.">
                <Toggle label="Pseudo des participants" checked={draft.pseudoActif} onChange={(e) => set("pseudoActif", e.target.checked)} />
                <Select aria-label="Mode des pseudos" disabled={!draft.pseudoActif} value={draft.pseudoMode} onChange={(e) => set("pseudoMode", e.target.value)} className="w-40">
                  <option value="optionnel">Optionnel</option>
                  <option value="obligatoire">Obligatoire</option>
                </Select>
              </Row>
              <Row icon={<TextAa size={24} weight="light" />} title="Libellé du bouton d'envoi" text="Texte affiché sur le bouton de validation du panier.">
                <Input aria-label="Libellé du bouton d'envoi" maxLength={30} value={draft.libelleBouton} onChange={(e) => set("libelleBouton", e.target.value)} className="w-56" />
              </Row>
            </ul>
          </Card>
          <Card className="flex flex-wrap items-center gap-4 p-5 sm:p-6">
            <Bubble>
              <ArrowsClockwise size={22} />
            </Bubble>
            <div className="min-w-52 flex-1">
              <h2 className="text-[1.3rem] font-semibold">Commandes successives</h2>
              <p className="text-[14.5px] text-muted">Après l'envoi, seul le panier en cours est transmis. Un nouveau panier partagé reste disponible pour commander d'autres articles, par exemple les desserts.</p>
            </div>
            <Toggle label="Commandes successives" checked={draft.commandesSuccessives} onChange={(e) => set("commandesSuccessives", e.target.checked)} />
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card className="p-5 sm:p-6">
            <CardHeader icon={<Eye size={22} />} title="Aperçu client" description={`Exemple d'un panier partagé à la ${table}.`} action={<Badge>Exemple</Badge>} />
            <div className="mt-4 flex items-center justify-center gap-2">
              {["LD", "MB", "CP", "AL", "TH"].map((n, i) => (
                <span key={n} aria-hidden className={["grid size-11 place-items-center rounded-full font-sans text-[13px] font-semibold text-ink", ["bg-olive-soft", "bg-[#e9e3f3]", "bg-[#f7ecd3]", "bg-[#e2ebf5]", "bg-[#f6e3e1]"][i]].join(" ")}>
                  {n}
                </span>
              ))}
            </div>
            <div className="mx-auto mt-3 flex w-fit items-center gap-2.5 rounded-full bg-olive px-5 py-2 text-white">
              <ShoppingBag size={20} />
              <span className="text-[14.5px] leading-tight">
                1 panier partagé
                <span className="block text-[12.5px] opacity-85">{table}</span>
              </span>
            </div>
            {exemple.length === 0 ? (
              <p className="mt-4 text-center text-[14.5px] text-muted">Ajoutez des produits visibles à la carte pour illustrer cet aperçu.</p>
            ) : (
              <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
                {exemple.map((l) => (
                  <li key={l.nom} className="flex items-center gap-3 px-3 py-2">
                    <Thumb src={l.image} alt="" className="size-11 rounded-full" />
                    <span className="num grid size-7 place-items-center rounded-full bg-olive-tint text-[14px]">{l.quantite}</span>
                    <span className="flex-1 text-[15px]">{l.nom}</span>
                    <span className="num text-[15px]">{formatMoney(l.prixCentimes * l.quantite, devise)}</span>
                  </li>
                ))}
                <li className="flex items-center justify-between bg-olive-tint px-4 py-3">
                  <span className="text-[16px] font-semibold text-ink">Total du panier</span>
                  <span className="num text-[1.3rem] font-semibold text-ink">{formatMoney(total, devise)}</span>
                </li>
              </ul>
            )}
            {draft.confirmation ? <div aria-hidden className="mt-3 rounded-[10px] bg-olive py-2.5 text-center text-[16px] font-medium text-white">{draft.libelleBouton || "Commander"}</div> : null}
          </Card>

          <Card className="bg-olive-soft/50 p-5 sm:p-6">
            <CardHeader icon={<Lock size={22} />} title="Garanties obligatoires" description="Assurées par le serveur, même en cas d'usage simultané. Elles ne se désactivent pas." />
            <ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
              {[
                { icon: <Database size={22} weight="light" />, t: "Serveur seul juge", d: "Les prix, les droits et les totaux sont recalculés côté serveur." },
                { icon: <Atom size={22} weight="light" />, t: "Modifications atomiques", d: "Chaque opération est traitée l'une après l'autre, sans perte de mise à jour." },
                { icon: <ShieldCheck size={22} weight="light" />, t: "Protection contre les doublons", d: "Une seule commande est créée, même en cas de confirmations simultanées." },
                { icon: <Receipt size={22} weight="light" />, t: "Commandes envoyées en lecture seule", d: "Les prix et le contenu sont figés au moment de l'envoi." },
              ].map((g) => (
                <li key={g.t} className="flex items-center gap-3 px-4 py-3">
                  <span className="shrink-0 text-ink">{g.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15.5px] text-ink">{g.t}</span>
                    <span className="block text-[13.5px] text-muted">{g.d}</span>
                  </span>
                  <Badge tone="olive">Obligatoire</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
