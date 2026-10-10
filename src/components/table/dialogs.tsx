"use client";

import { ArrowClockwise, ArrowLeft, ArrowRight, BellSimple, CaretRight, ChatCircle, ChatCircleDots, Check, ChefHat, Clock, DotsThreeCircle, Drop, ForkKnife, Info, Receipt, ShoppingBagOpen, Timer, UsersThree, Warning, WarningCircle, WifiSlash, X } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { Dialog } from "radix-ui";
import { useEffect, useState, type ReactNode } from "react";
import { cn, formatMoney } from "@/lib/format";
import type { MenuProduct } from "@/lib/server/services/menu";
import type { TableCartLine } from "@/lib/table-types";
import { CTA, Money, Picture, Stepper, hour, plural, two } from "./parts";
import { tableCall, useTable } from "./provider";

const SECONDARY = "press inline-flex h-14 w-full items-center justify-center gap-3 rounded-full border border-line-strong bg-white text-[1.1rem] text-ink hover:bg-olive-tint";

/** Téléphone ou tablette : même seuil que la mise en page (`lg`). */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1023px)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return mobile;
}

/** Fenêtre centrée sur ordinateur. `full` : plein écran sur téléphone et tablette. */
function Shell({ open, onClose, children, full, locked }: { open: boolean; onClose: () => void; children: ReactNode; full?: boolean; locked?: boolean }) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && !locked && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 animate-fade bg-ink/45 backdrop-blur-[3px]" />
        <Dialog.Content
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden bg-paper shadow-pop focus:outline-none",
            full ? "max-lg:inset-0 max-lg:animate-sheet" : "max-lg:top-1/2 max-lg:left-1/2 max-lg:max-h-[92dvh] max-lg:w-[calc(100vw-1.5rem)] max-lg:max-w-[540px] max-lg:-translate-x-1/2 max-lg:-translate-y-1/2 max-lg:animate-pop max-lg:rounded-[22px]",
            "lg:top-1/2 lg:left-1/2 lg:max-h-[92dvh] lg:w-[calc(100vw-2rem)] lg:max-w-[560px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:animate-pop lg:rounded-[22px]",
          )}
        >
          {locked ? null : (
            <Dialog.Close aria-label="Fermer" className="press absolute top-4 right-4 z-10 grid size-10 place-items-center rounded-full bg-white/95 text-ink shadow-card hover:bg-white">
              <X size={18} aria-hidden />
            </Dialog.Close>
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Medal({ children, tone = "olive" }: { children: ReactNode; tone?: "olive" | "warn" }) {
  return <span className={cn("mx-auto grid size-[72px] place-items-center rounded-full", tone === "warn" ? "bg-warn-soft text-warn" : "bg-olive-soft text-olive-deep")}>{children}</span>;
}

/* ------------------------------------------------------------- produit */

function ProductBody({ p, onDone }: { p: MenuProduct; onDone: () => void }) {
  const { state, menu, act, pending } = useTable();
  const mobile = useIsMobile();
  const [step, setStep] = useState<1 | 2>(1);
  const [quantite, setQuantite] = useState(1);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [instructions, setInstructions] = useState("");
  const { reglages, devise } = state;
  const categorie = menu.categories.find((c) => c.produits.some((x) => x.id === p.id))?.nom ?? "";

  const toggle = (groupId: string, optionId: string, max: number) =>
    setPicked((current) => {
      const next = new Set(current);
      const group = p.groupes.find((g) => g.id === groupId);
      const inGroup = (group?.options ?? []).filter((o) => next.has(o.id)).map((o) => o.id);
      if (next.has(optionId)) next.delete(optionId);
      else {
        // Un seul choix possible : le nouveau remplace l'ancien. Sinon, on s'arrête au maximum.
        if (max <= 1) inGroup.forEach((id) => next.delete(id));
        else if (inGroup.length >= max) return current;
        next.add(optionId);
      }
      return next;
    });

  const missing = p.groupes.find((g) => g.options.filter((o) => picked.has(o.id)).length < g.min);
  const unit = p.prixCentimes + p.groupes.flatMap((g) => g.options).reduce((n, o) => n + (picked.has(o.id) ? o.prixCentimes : 0), 0);
  const blocked = !p.disponible || !reglages.panierOuvert;
  // Sur téléphone, la personnalisation est une seconde étape ; elle n'existe que s'il y a quelque chose à choisir.
  const custom = p.groupes.length > 0 || reglages.instructionsActives;
  const twoSteps = mobile && custom;
  const show = (n: 1 | 2) => !twoSteps || step === n;

  const add = async () => {
    const ok = await act(() => tableCall("POST", "panier/lignes", { produitId: p.id, quantite, optionIds: [...picked], instructions: instructions.trim(), cle: crypto.randomUUID?.() }), `${p.nom} ajouté au panier de la table.`);
    if (ok) onDone();
  };

  const stepper = (
    <Stepper size="lg" label="Quantité" value={quantite} onMinus={() => setQuantite((q) => Math.max(1, q - 1))} onPlus={() => setQuantite((q) => Math.min(reglages.quantiteMax, q + 1))} plusDisabled={quantite >= reglages.quantiteMax} disabled={blocked} />
  );

  return (
    <>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {twoSteps && step === 2 ? (
          <div className="flex items-center gap-2 px-4 pt-4 pr-16">
            <button type="button" onClick={() => setStep(1)} aria-label="Revenir à la fiche du plat" className="press grid size-10 shrink-0 place-items-center rounded-full text-ink hover:bg-olive-soft">
              <ArrowLeft size={22} aria-hidden />
            </button>
            <p className="text-[1.9rem] leading-tight font-semibold text-ink">À votre goût</p>
          </div>
        ) : null}

        {show(1) ? (
          <>
            {p.image ? <Picture src={p.image.src} alt={p.image.alt} className="aspect-[16/11] w-full lg:aspect-[16/9]" /> : <div className="h-14" />}
            <div className="px-5 pt-5 lg:px-7">
              {p.etiquettes.length > 0 ? (
                <ul className="mb-2 flex flex-wrap gap-1.5">
                  {p.etiquettes.map((e) => (
                    <li key={e.nom} className="rounded-lg bg-olive-soft px-2.5 py-1 font-sans text-[13px] text-olive-deep">
                      {e.nom}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="flex items-baseline justify-between gap-4">
                <Dialog.Title className="text-[2.1rem] leading-tight font-semibold tracking-[-0.01em] text-ink">{p.nom}</Dialog.Title>
                <Money cents={p.prixCentimes} devise={devise} className="text-[1.5rem] font-medium text-ink lg:hidden" />
              </div>
              <Dialog.Description className="mt-1.5 text-[16.5px] leading-relaxed text-text">{p.description || "Demandez le détail de ce plat à notre équipe."}</Dialog.Description>
              <p className="mt-3 flex flex-wrap items-center gap-2 font-sans text-[13.5px] text-text">
                {categorie ? <span className="rounded-full bg-olive-soft px-3 py-1.5 text-olive-deep">{categorie}</span> : null}
                {p.tempsPreparationMin ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-white px-3 py-1.5">
                    <Timer size={16} aria-hidden /> Préparation indicative : {p.tempsPreparationMin} min
                  </span>
                ) : null}
              </p>

              {p.allergenes.length > 0 ? (
                <div className="mt-4 flex gap-3 rounded-xl bg-warn-soft px-4 py-3">
                  <Warning size={20} weight="fill" aria-hidden className="mt-0.5 shrink-0 text-warn" />
                  <div className="text-[15px]">
                    <p className="font-semibold text-ink">Allergènes à vérifier</p>
                    <p>{p.allergenes.join(" · ")}</p>
                    <p className="mt-0.5 text-[14px] text-muted">En cas d'allergie, consultez notre équipe.</p>
                  </div>
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        {show(2) ? (
          <div className={cn("px-5 lg:px-7", twoSteps && "pt-4")}>
            {twoSteps ? (
              <div className="flex items-center gap-4 rounded-2xl border border-line bg-white p-3">
                <Picture src={p.image?.thumb ?? null} alt="" className="size-20 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <p className="text-[1.25rem] leading-tight font-medium text-ink">{p.nom}</p>
                  <p className="font-sans text-[13.5px] text-muted">
                    <Money cents={p.prixCentimes} devise={devise} /> par unité
                  </p>
                </div>
              </div>
            ) : null}
            {p.groupes.map((g) => {
              const single = g.max <= 1;
              return (
                <fieldset key={g.id} className="mt-5">
                  <legend className="flex w-full items-baseline justify-between gap-3">
                    <span className="text-[1.1rem] font-semibold text-ink">{g.nom}</span>
                    <span className="font-sans text-[13.5px] text-muted">{g.min > 0 ? (single ? "Un choix obligatoire" : `${g.min} choix minimum`) : single ? "Facultatif" : `Jusqu'à ${g.max} choix`}</span>
                  </legend>
                  <div className="mt-2 grid gap-1.5">
                    {g.options.map((o) => (
                      <label key={o.id} className={cn("flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border bg-white px-3.5 py-2.5 text-[15.5px]", picked.has(o.id) ? "border-olive" : "border-line", !o.disponible && "cursor-not-allowed text-muted")}>
                        <input type={single && g.min > 0 ? "radio" : "checkbox"} name={`groupe-${g.id}`} checked={picked.has(o.id)} disabled={!o.disponible} onChange={() => toggle(g.id, o.id, g.max)} className="size-[18px] accent-olive" />
                        <span className="flex-1">
                          {o.nom}
                          {!o.disponible ? <span className="ml-2 text-[13.5px]">indisponible</span> : null}
                        </span>
                        {o.prixCentimes > 0 ? <span className="num text-muted">+{formatMoney(o.prixCentimes, devise)}</span> : null}
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            })}

            {reglages.instructionsActives ? (
              <div className="mt-5">
                <label htmlFor="preference" className="flex items-baseline justify-between gap-3">
                  <span className="text-[1.1rem] font-semibold text-ink">Une petite préférence ?</span>
                  <span className="font-sans text-[13.5px] text-muted">Facultatif</span>
                </label>
                <textarea id="preference" value={instructions} maxLength={reglages.instructionsMax} onChange={(e) => setInstructions(e.target.value)} rows={2} placeholder="Sans oignons, sauce à part" className="mt-2 w-full resize-none rounded-xl border border-line-strong bg-white px-4 py-3 text-[16px] placeholder:text-muted/80" />
                <p className="mt-1 flex items-center gap-2 font-sans text-[13px] text-muted lg:hidden">
                  <Info size={16} aria-hidden /> Pour une allergie, échangez aussi avec notre équipe.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="h-5" />
      </div>

      <div className="border-t border-line bg-paper px-5 py-4 lg:px-7">
        {twoSteps && step === 1 ? (
          <button type="button" disabled={blocked} onClick={() => setStep(2)} className={cn(CTA, "h-14 w-full justify-between px-6 text-[1.15rem]")}>
            <span>{p.disponible ? "Personnaliser" : "Indisponible aujourd'hui"}</span>
            {p.disponible ? (
              <span className="flex items-center gap-3">
                <Money cents={p.prixCentimes} devise={devise} /> <ArrowRight size={20} aria-hidden />
              </span>
            ) : null}
          </button>
        ) : (
          <div className={cn("flex items-center gap-4", mobile && "flex-col items-stretch gap-3")}>
            <div className={cn(mobile && "flex items-center justify-between")}>
              {mobile ? <span className="text-[1.1rem] font-semibold text-ink">Quantité</span> : null}
              {stepper}
            </div>
            <button type="button" disabled={blocked || pending || !!missing} onClick={add} className={cn(CTA, "justify-between px-5 text-[1.08rem]", mobile ? "h-14 w-full shrink-0 rounded-2xl" : "h-12 flex-1 rounded-xl")}>
              <span>{!p.disponible ? "Indisponible aujourd'hui" : missing ? `Choisissez : ${missing.nom}` : mobile ? "Ajouter au panier partagé" : "Ajouter au panier"}</span>
              {p.disponible && !missing ? <Money cents={unit * quantite} devise={devise} /> : null}
            </button>
            {mobile ? (
              <p className="flex items-center justify-center gap-2 font-sans text-[13px] text-muted">
                <UsersThree size={17} aria-hidden /> Visible pour toute la table après ajout.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}

/* --------------------------------------------------------- instruction */

function InstructionBody({ ligne, onDone }: { ligne: TableCartLine; onDone: () => void }) {
  const { state, act, pending } = useTable();
  const [text, setText] = useState(ligne.instructions);
  const max = state.reglages.instructionsMax;
  const save = async () => {
    const ok = await act(() => tableCall("PATCH", `panier/lignes/${ligne.id}`, { instructions: text.trim() }), text.trim() ? "Instruction enregistrée." : "Instruction retirée.");
    if (ok) onDone();
  };
  return (
    <div className="px-5 pt-7 pb-6 text-center sm:px-7">
      <Medal>
        <ChatCircle size={34} aria-hidden />
      </Medal>
      <Dialog.Title className="mt-4 text-[2rem] leading-tight font-semibold text-ink">Une petite précision ?</Dialog.Title>
      <Dialog.Description className="mt-1 text-[16px] text-muted">{ligne.nom} · L'instruction sera visible dans le panier commun.</Dialog.Description>
      <label htmlFor="instruction" className="sr-only">
        Instruction pour {ligne.nom}
      </label>
      <textarea id="instruction" autoFocus value={text} maxLength={max} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Sans oignons, sauce à part" className="mt-5 w-full resize-none rounded-xl border border-line-strong bg-white px-4 py-3 text-left text-[16.5px] placeholder:text-muted/80" />
      <p className="num mt-1 text-right font-sans text-[13.5px] text-muted">
        {text.length} / {max}
      </p>
      <button type="button" className={cn(CTA, "mt-3 h-13 w-full text-[17px]")} disabled={pending || text.trim() === ligne.instructions} onClick={save}>
        <Check size={20} aria-hidden /> Enregistrer
      </button>
    </div>
  );
}

/* -------------------------------------------------------- confirmation */

function ConfirmBody({ cle, onDone }: { cle: string; onDone: () => void }) {
  const { state, confirm, pending } = useTable();
  const { panier, devise, table, reglages } = state;
  const invalid = panier.lignes.find((l) => !l.valide);
  return (
    <>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pt-7 text-center sm:px-7">
        <Medal>
          <ChefHat size={36} aria-hidden />
        </Medal>
        <p className="eyebrow mt-4">
          {table.nom} · {plural(panier.articles, "article", "articles")}
        </p>
        <Dialog.Title className="mt-1.5 text-[2.2rem] leading-tight font-semibold text-ink">On envoie en cuisine ?</Dialog.Title>
        <Dialog.Description className="mx-auto mt-2 max-w-[44ch] text-[16px] text-muted">Ces articles seront commandés pour toute la table.</Dialog.Description>
        <ul className="mt-5 text-left">
          {panier.lignes.map((l) => (
            <li key={l.id} className="flex items-center gap-4 border-b border-line py-3">
              <Picture src={l.image} alt="" className="size-16 shrink-0 rounded-lg" />
              <span className="num grid size-9 shrink-0 place-items-center rounded-full bg-olive-soft font-sans text-[15px] text-ink">{l.quantite}</span>
              <span className="min-w-0 flex-1 text-[17px] text-ink">
                {l.nom}
                {l.options.length > 0 || l.instructions ? <span className="block truncate text-[14.5px] text-olive-deep italic">{[...l.options.map((o) => o.nom), l.instructions].filter(Boolean).join(" · ")}</span> : null}
              </span>
              <Money cents={l.totalCentimes} devise={devise} className="text-[17px] text-ink" />
            </li>
          ))}
        </ul>
        <p className="flex items-baseline justify-between pt-4 text-left">
          <span className="text-[1.5rem] font-semibold text-ink">Total</span>
          <Money cents={panier.totalCentimes} devise={devise} className="text-[1.9rem] font-semibold text-ink" />
        </p>
        <p className="mt-3 flex items-start gap-3 rounded-xl bg-olive-soft px-4 py-3 text-left text-[15px] text-text">
          <Info size={20} aria-hidden className="mt-0.5 shrink-0 text-olive-deep" /> Après confirmation, ces articles ne pourront plus être modifiés. Vous pourrez ensuite commander d'autres plats.
        </p>
        {invalid ? <p className="mt-3 rounded-xl bg-warn-soft px-4 py-2.5 text-left text-[15px] text-warn">« {invalid.nom} » n'est plus disponible : retirez-le du panier avant d'envoyer.</p> : null}
        {!reglages.commandesOuvertes ? <p className="mt-3 rounded-xl bg-warn-soft px-4 py-2.5 text-left text-[15px] text-warn">{reglages.messageFerme}</p> : null}
        <div className="h-4" />
      </div>
      <div className="flex flex-wrap gap-3 border-t border-line bg-paper px-5 py-4 sm:px-7">
        <button type="button" onClick={onDone} className="press h-14 flex-1 rounded-2xl border border-line-strong bg-white px-4 text-[1.08rem] whitespace-nowrap text-ink hover:bg-olive-tint">
          Retour au panier
        </button>
        <button type="button" className={cn(CTA, "h-14 flex-[1.4] rounded-2xl px-4 text-[1.08rem] whitespace-nowrap")} disabled={pending || !!invalid || !reglages.commandesOuvertes || panier.lignes.length === 0} onClick={() => void confirm(cle)}>
          Confirmer la commande <ArrowRight size={20} aria-hidden />
        </button>
      </div>
    </>
  );
}

/** La commande est partie : la cuisine l'a reçue, un nouveau panier est disponible. */
function SentBody({ onDone }: { onDone: () => void }) {
  const { state } = useTable();
  const order = state.commandes.at(-1);
  const base = `/table/${state.table.id}`;
  return (
    <div className="scroll-thin overflow-y-auto px-5 pt-9 pb-6 text-center sm:px-7">
      <span className="mx-auto grid size-28 place-items-center rounded-full bg-olive-soft text-olive-deep">
        <Check size={56} weight="bold" aria-hidden />
      </span>
      <Dialog.Title className="mt-5 text-[2.6rem] leading-tight font-semibold text-ink">C'est envoyé !</Dialog.Title>
      <Dialog.Description className="mt-1 text-[1.15rem] text-muted">La cuisine a reçu la commande de votre table.</Dialog.Description>
      {order ? (
        <div className="mt-6 rounded-2xl border border-line bg-white px-5 py-4 text-left">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[1.6rem] leading-tight font-medium text-ink">Commande {two(order.rang)}</p>
            <span className="inline-flex items-center gap-2 rounded-full bg-olive-soft px-3.5 py-1.5 text-[1rem] text-olive-deep">
              <span aria-hidden className="size-2 rounded-full bg-olive" /> {state.statuts.find((s) => s.id === order.statut)?.nom ?? order.statut}
            </span>
          </div>
          <p className="mt-0.5 text-[1.05rem] text-muted">
            {plural(order.articles, "article", "articles")} · <Money cents={order.totalCentimes} devise={state.devise} />
          </p>
          <p className="mt-1 flex items-center gap-2 font-sans text-[14px] text-muted">
            <Clock size={17} aria-hidden /> {hour(order.creeLe, state.fuseau)}
          </p>
          <p className="mt-3 flex items-center gap-2 border-t border-line pt-3 font-sans text-[14px] text-muted">
            <UsersThree size={18} aria-hidden /> Visible par toute la table
          </p>
        </div>
      ) : null}
      {state.reglages.panierOuvert ? (
        <p className="mt-4 flex items-center gap-4 rounded-2xl bg-olive-soft px-5 py-4 text-left">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white text-olive-deep">
            <ShoppingBagOpen size={24} aria-hidden />
          </span>
          <span>
            <span className="block text-[1.2rem] font-medium text-ink">Votre nouveau panier est prêt.</span>
            <span className="text-[1.02rem] text-muted">Vous pouvez continuer à commander.</span>
          </span>
        </p>
      ) : null}
      <Link href={order ? `${base}/commandes/${order.id}` : `${base}/commandes`} onClick={onDone} className={cn(CTA, "mt-5 h-14 w-full text-[1.15rem]")}>
        Suivre la commande <ArrowRight size={20} aria-hidden />
      </Link>
      {state.reglages.panierOuvert ? (
        <Link href={base} onClick={onDone} className={cn(SECONDARY, "mt-3")}>
          Continuer le menu <ArrowRight size={20} aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

/** La réponse du serveur s'est perdue pendant l'envoi : on vérifie avec la même clé, sans risque de doublon. */
function VerificationBody({ cle, onDone }: { cle: string; onDone: () => void }) {
  const { state, confirm, pending, syncedAt, setDialog } = useTable();
  const first = state.panier.lignes[0];
  return (
    <div className="scroll-thin overflow-y-auto px-5 pt-9 pb-6 text-center sm:px-7">
      <Medal tone="warn">
        <WifiSlash size={36} aria-hidden />
      </Medal>
      <Dialog.Title className="mt-4 text-[2.2rem] leading-tight font-semibold text-ink">On rétablit la connexion</Dialog.Title>
      <Dialog.Description className="mx-auto mt-1 max-w-[36ch] text-[1.1rem] text-muted">La connexion a été interrompue pendant l'envoi. Le statut de votre commande reste à vérifier.</Dialog.Description>
      <div role="status" className="mt-5 flex gap-4 rounded-2xl border border-warn/25 bg-warn-soft px-5 py-4 text-left">
        <WarningCircle size={34} weight="fill" aria-hidden className="shrink-0 text-warn" />
        <div>
          <p className="text-[1.3rem] font-medium text-ink">Envoi à vérifier</p>
          <p className="mt-0.5 text-[1.02rem] text-text">Nous n'avons pas encore pu confirmer si votre commande a été reçue. Nous vérifierons son état au retour de la connexion.</p>
        </div>
      </div>
      <div className="mt-4 rounded-2xl border border-line bg-white p-4 text-left">
        <p className="font-sans text-[14px] text-muted">Dernier état reçu · {hour(syncedAt, state.fuseau)}</p>
        {first ? (
          <div className="mt-3 flex items-center gap-4">
            <Picture src={first.image} alt="" className="size-20 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline justify-between gap-3 text-[1.2rem] text-ink">
                <span>
                  {first.nom}
                  {state.panier.lignes.length > 1 ? <span className="text-muted"> et {plural(state.panier.lignes.length - 1, "autre plat", "autres plats")}</span> : null}
                </span>
                <Money cents={state.panier.totalCentimes} devise={state.devise} />
              </p>
              <p className="mt-1.5 inline-flex items-center gap-2 rounded-full bg-warn-soft px-3 py-1 font-sans text-[13.5px] text-warn">
                <WarningCircle size={16} weight="fill" aria-hidden /> Données à actualiser
              </p>
            </div>
          </div>
        ) : null}
      </div>
      <button type="button" disabled={pending} onClick={() => void confirm(cle)} className={cn(CTA, "mt-5 h-14 w-full text-[1.15rem]")}>
        <ArrowClockwise size={22} aria-hidden /> Réessayer la connexion
      </button>
      <button type="button" onClick={() => setDialog({ type: "aide" })} className={cn(SECONDARY, "mt-3")}>
        Demander de l'aide au serveur
      </button>
      <p className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-olive-soft px-4 py-3 text-[1rem] text-text">
        <Info size={18} aria-hidden className="shrink-0" /> Ne renvoyez pas la commande pendant la vérification.
      </p>
      <button type="button" onClick={onDone} className="press mt-3 rounded-lg px-3 py-1.5 font-sans text-[14px] text-muted underline underline-offset-2">
        Revenir au panier sans vérifier
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- aide */

export const MOTIF_ICON: Record<string, typeof Drop> = { drop: Drop, "fork-knife": ForkKnife, receipt: Receipt, dots: DotsThreeCircle, chat: ChatCircleDots };

function HelpBody() {
  const { state, act, pending } = useTable();
  const waiting = state.demandes.filter((d) => d.statut === "en_attente");
  return (
    <div className="scroll-thin overflow-y-auto px-5 pt-9 pb-7 text-center sm:px-9">
      <Medal>
        <BellSimple size={36} aria-hidden />
      </Medal>
      <Dialog.Title className="mt-4 text-[2.2rem] leading-tight font-semibold text-ink">Un coup de main ?</Dialog.Title>
      <Dialog.Description className="mt-1.5 text-[16.5px] text-muted">Choisissez le motif de votre demande pour la {state.table.nom.toLowerCase()}.</Dialog.Description>
      <ul className="mt-6 grid gap-3.5 text-left">
        {state.motifs.map((m) => {
          const Icon = MOTIF_ICON[m.icone] ?? ChatCircleDots;
          const sent = waiting.some((d) => d.libelle === m.libelle);
          return (
            <li key={m.id}>
              <button
                type="button"
                disabled={pending || sent}
                onClick={() => void act(() => tableCall("POST", "demandes", { motifId: m.id }), "Demande transmise à notre équipe.")}
                className="press flex h-16 w-full items-center gap-4 rounded-2xl border border-line-strong bg-white px-6 text-left text-[18px] text-ink hover:bg-olive-tint disabled:pointer-events-none disabled:bg-olive-tint"
              >
                <Icon size={28} aria-hidden className="shrink-0" />
                <span className="flex-1">{m.libelle}</span>
                {sent ? <span className="font-sans text-[13.5px] text-olive-deep">Transmise</span> : <CaretRight size={18} aria-hidden />}
              </button>
            </li>
          );
        })}
      </ul>
      {state.motifs.length === 0 ? <p className="mt-6 text-[16px] text-muted">Aucun motif n'est proposé pour le moment. Faites signe à notre équipe.</p> : null}
      <div className="mt-6 border-t border-line pt-4 text-[14.5px] text-muted">
        {waiting.length > 0 ? (
          <ul className="grid gap-1">
            {waiting.map((d) => (
              <li key={d.id}>
                « {d.libelle} » transmise à {hour(d.creeLe, state.fuseau)}, en attente de notre équipe.
              </li>
            ))}
          </ul>
        ) : (
          <p>Votre demande est transmise à l'équipe du restaurant, qui vient à votre table.</p>
        )}
      </div>
    </div>
  );
}

export function TableDialogs() {
  const { dialog, setDialog } = useTable();
  const close = () => setDialog(null);
  return (
    <>
      <Shell open={dialog?.type === "produit"} onClose={close} full>
        {dialog?.type === "produit" ? <ProductBody key={dialog.produit.id} p={dialog.produit} onDone={close} /> : null}
      </Shell>
      <Shell open={dialog?.type === "instruction"} onClose={close}>
        {dialog?.type === "instruction" ? <InstructionBody key={dialog.ligne.id} ligne={dialog.ligne} onDone={close} /> : null}
      </Shell>
      <Shell open={dialog?.type === "confirmation"} onClose={close} full>
        {dialog?.type === "confirmation" ? <ConfirmBody cle={dialog.cle} onDone={close} /> : null}
      </Shell>
      <Shell open={dialog?.type === "envoyee"} onClose={close} full>
        {dialog?.type === "envoyee" ? <SentBody onDone={close} /> : null}
      </Shell>
      <Shell open={dialog?.type === "verification"} onClose={close} full locked>
        {dialog?.type === "verification" ? <VerificationBody cle={dialog.cle} onDone={close} /> : null}
      </Shell>
      <Shell open={dialog?.type === "aide"} onClose={close}>
        {dialog?.type === "aide" ? <HelpBody /> : null}
      </Shell>
    </>
  );
}
