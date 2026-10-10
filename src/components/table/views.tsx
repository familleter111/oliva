"use client";

import { ArrowLeft, ArrowRight, BellSimple, BellSimpleRinging, CallBell, CaretRight, ChatCircleDots, Check, ChefHat, Clock, Hourglass, Info, Lock, Minus, PencilSimple, PersonSimpleWalk, Plus, Receipt, ShoppingBagOpen, SignOut, UsersThree } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/format";
import type { TableOrder } from "@/lib/table-types";
import { MOTIF_ICON } from "./dialogs";
import { CTA, Guest, GuestRow, Money, PageTitle, Picture, hour, plural, two } from "./parts";
import { tableCall, useTable } from "./provider";

const STEP_ICON = [Check, ChefHat, CallBell, Check];
const SECONDARY = "press inline-flex h-14 w-full items-center justify-center gap-3 rounded-full border border-line-strong bg-white text-[1.1rem] text-ink hover:bg-olive-tint";
const BACK = "press -ml-2 inline-flex h-10 items-center gap-2 rounded-full px-2 text-[1.05rem] text-text hover:bg-olive-soft";

/* ----------------------------------------------------------- commandes */

function StatusBadge({ order }: { order: TableOrder }) {
  const { statuts } = useTable().state;
  const at = Math.max(0, statuts.findIndex((s) => s.id === order.statut));
  const done = at === statuts.length - 1;
  return (
    <span className={cn("inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-3.5 text-[1rem] lg:h-11 lg:px-4 lg:text-[1.05rem]", done || at === 0 ? "bg-olive-soft text-olive-deep" : "bg-warn-soft text-warn")}>
      {done ? <Check size={18} weight="bold" aria-hidden /> : at === 0 ? <Clock size={18} aria-hidden /> : <ChefHat size={18} aria-hidden />}
      {statuts[at]?.nom ?? order.statut}
    </span>
  );
}

function OrderCard({ order }: { order: TableOrder }) {
  const { state } = useTable();
  const { statuts, devise, table, fuseau } = state;
  const at = Math.max(0, statuts.findIndex((s) => s.id === order.statut));
  const done = at === statuts.length - 1;
  const photos = order.lignes.filter((l) => l.image).slice(0, 3);
  return (
    <article aria-labelledby={`commande-${order.id}`} className="rounded-2xl border border-line bg-white p-4 shadow-card lg:p-6">
      <p className="eyebrow hidden lg:block">
        {table.nom} · Commande {two(order.rang)}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3 lg:mt-1.5">
        <h2 id={`commande-${order.id}`} className="text-[1.6rem] leading-tight font-medium text-ink lg:text-[1.9rem]">
          Commande {two(order.rang)}
        </h2>
        <StatusBadge order={order} />
      </div>
      <p className="mt-0.5 font-sans text-[14px] text-muted lg:font-serif lg:text-[1.05rem]">
        <span className="lg:hidden">
          {hour(order.creeLe, fuseau)} · {plural(order.articles, "article", "articles")}
        </span>
        <span className="hidden lg:inline">Envoyée à {hour(order.creeLe, fuseau)} · Articles confirmés</span>
      </p>

      <ol aria-label="Avancement de la commande" className="mt-5 hidden border-b border-line pb-5 lg:flex">
        {statuts.map((s, i) => {
          const Icon = STEP_ICON[Math.min(i, STEP_ICON.length - 1)];
          const past = i < at;
          const now = i === at;
          return (
            <li key={s.id} aria-current={now ? "step" : undefined} className="relative flex flex-1 flex-col items-center gap-2 text-center">
              {i > 0 ? <span aria-hidden className={cn("absolute top-[18px] right-1/2 h-0.5 w-full -translate-y-1/2", i <= at ? "bg-olive" : "bg-line-strong")} /> : null}
              <span className={cn("relative z-10 grid size-9 place-items-center rounded-full", past || now ? "bg-olive text-white" : "bg-olive-tint text-muted ring-1 ring-line-strong", now && "ring-4 ring-olive/25")}>
                <Icon size={18} weight={past ? "bold" : "regular"} aria-hidden />
              </span>
              <span className={cn("font-sans text-[13.5px]", past || now ? "font-medium text-ink" : "text-muted")}>{s.nom}</span>
            </li>
          );
        })}
      </ol>

      {photos.length > 0 ? (
        <div className="mt-3 grid grid-flow-col auto-cols-fr gap-2 lg:hidden">
          {photos.map((l) => (
            <Picture key={l.id} src={l.image} alt="" className="aspect-[5/3] w-full rounded-xl" />
          ))}
        </div>
      ) : null}
      <ul className="mt-3 lg:mt-0">
        {order.lignes.map((l) => (
          <li key={l.id} className="flex items-center gap-4 py-1.5 lg:gap-5 lg:border-b lg:border-line lg:py-3.5 lg:last:border-b-0">
            <Picture src={l.image} alt="" className="hidden h-[74px] w-[112px] shrink-0 rounded-lg lg:block" />
            <div className="min-w-0 flex-1">
              <p className="text-[1.08rem] text-ink lg:text-[1.15rem]">
                <span className="num text-muted">{l.quantite} ×</span> {l.nom}
              </p>
              {l.options.length > 0 || l.instructions ? <p className="font-sans text-[13.5px] text-muted">{[...l.options.map((o) => o.nom), l.instructions].filter(Boolean).join(" · ")}</p> : null}
            </div>
            <Money cents={l.totalCentimes} devise={devise} className="text-[1.05rem] text-ink lg:text-[1.1rem]" />
            <Lock size={20} aria-label="Article verrouillé" className="hidden shrink-0 text-muted lg:block" />
          </li>
        ))}
      </ul>
      <p className="mt-2 flex items-baseline justify-between border-t border-line pt-3 lg:mt-3 lg:pt-4">
        <span className="text-[1.08rem] text-ink lg:text-[1.2rem]">Total de la commande</span>
        <Money cents={order.totalCentimes} devise={devise} className="text-[1.35rem] font-medium text-ink lg:text-[1.8rem]" />
      </p>
      <Link href={`/table/${table.id}/commandes/${order.id}`} className="press mt-3 flex h-12 items-center justify-between rounded-full bg-olive-soft px-5 text-[1.08rem] text-olive-deep hover:bg-olive-soft/70">
        {done ? "Voir le détail" : "Voir le suivi"}
        <span className="sr-only">, commande {two(order.rang)}</span>
        <ArrowRight size={20} aria-hidden />
      </Link>
    </article>
  );
}

export function OrdersPage() {
  const { state } = useTable();
  const [filter, setFilter] = useState<"toutes" | "cours" | "servies">("toutes");
  const base = `/table/${state.table.id}`;
  const last = state.statuts.at(-1)?.id;
  const shown = [...state.commandes].reverse().filter((c) => filter === "toutes" || (filter === "servies") === (c.statut === last));
  return (
    <>
      <PageTitle title="Ça se prépare." subtitle="Toutes les commandes de la table, au même endroit." />
      <div className="mt-6 hidden flex-wrap items-center justify-between gap-4 rounded-2xl bg-olive-soft px-6 py-4 lg:flex">
        <p className="flex items-center gap-3.5 text-[1.15rem] text-text">
          <Lock size={26} aria-hidden className="shrink-0 text-olive-deep" /> Les commandes envoyées sont verrouillées.
        </p>
        <Link href={base} className="press inline-flex h-12 items-center gap-2.5 rounded-full bg-olive px-6 text-[1.1rem] text-white hover:bg-olive-deep">
          Commander autre chose <ArrowRight size={20} aria-hidden />
        </Link>
      </div>
      {state.commandes.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-line bg-white px-6 py-12 text-center shadow-card lg:mt-6">
          <ShoppingBagOpen size={44} aria-hidden className="mx-auto text-olive" />
          <p className="mt-3 text-[1.4rem] text-ink">Aucune commande envoyée pour le moment.</p>
          <p className="mt-1 text-[1.05rem] text-muted">Composez le panier de la table, puis envoyez-le en cuisine.</p>
          <Link href={base} className={cn(CTA, "mt-5 h-13 px-6 text-[1.08rem] lg:hidden")}>
            Découvrir le menu <ArrowRight size={18} aria-hidden />
          </Link>
        </div>
      ) : (
        <>
          <div role="group" aria-label="Filtrer les commandes" className="mt-4 grid grid-cols-3 rounded-full border border-line bg-white p-1 lg:mt-6 lg:max-w-[460px]">
            {(
              [
                ["toutes", "Toutes"],
                ["cours", "En cours"],
                ["servies", "Servies"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)} className={cn("press h-11 rounded-full text-[1.02rem]", filter === id ? "bg-olive text-white" : "text-text")}>
                {label}
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-line bg-white px-6 py-10 text-center text-[1.1rem] text-muted">Aucune commande dans cette vue.</p>
          ) : (
            <div className="mt-4 grid items-start gap-4 lg:mt-6 lg:gap-6 xl:grid-cols-2">
              {shown.map((c) => (
                <OrderCard key={c.id} order={c} />
              ))}
            </div>
          )}
          <p className="mt-4 flex items-center justify-between rounded-2xl bg-olive-soft px-5 py-4 lg:max-w-[460px]">
            <span className="text-[1.15rem] text-ink">Total commandé</span>
            <Money cents={state.addition.commandesCentimes} devise={state.devise} className="text-[1.7rem] font-medium text-ink" />
          </p>
        </>
      )}
    </>
  );
}

/** Suivi d'une commande : étapes, articles figés, et ce qui se passera ensuite. */
export function OrderDetailPage({ commandeId }: { commandeId: string }) {
  const { state } = useTable();
  const { statuts, devise, fuseau, table } = state;
  const base = `/table/${table.id}`;
  const order = state.commandes.find((c) => c.id === commandeId);
  if (!order) {
    return (
      <div className="mx-auto max-w-[720px] rounded-2xl border border-line bg-white px-6 py-12 text-center shadow-card">
        <p className="text-[1.4rem] text-ink">Cette commande n'existe pas dans la session de votre table.</p>
        <Link href={`${base}/commandes`} className={cn(CTA, "mt-5 h-13 px-6 text-[1.08rem]")}>
          Voir nos commandes <ArrowRight size={18} aria-hidden />
        </Link>
      </div>
    );
  }
  const at = Math.max(0, statuts.findIndex((s) => s.id === order.statut));
  const done = at === statuts.length - 1;
  const cover = order.lignes.find((l) => l.image)?.image ?? null;
  return (
    <div className="mx-auto max-w-[720px]">
      <Link href={`${base}/commandes`} className={BACK}>
        <ArrowLeft size={20} aria-hidden /> Nos commandes
      </Link>
      <h1 className="mt-1 text-[2.1rem] leading-[1.05] font-bold tracking-[-0.02em] text-ink sm:text-[2.6rem]">{done ? "Bon appétit." : "Ça se prépare."}</h1>
      <p className="mt-1 text-[1.1rem] text-muted">
        Commande {two(order.rang)} · envoyée à {hour(order.creeLe, fuseau)}
      </p>

      <section aria-label="Articles de la commande" className="mt-4 overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        {cover ? <Picture src={cover} alt="" className="aspect-[16/7] w-full" /> : null}
        <ul className="px-5 py-3">
          {order.lignes.map((l) => (
            <li key={l.id} className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 last:border-b-0">
              <span className="min-w-0 text-[1.2rem] text-ink">
                <span className="num text-muted">{l.quantite} ×</span> {l.nom}
                {l.options.length > 0 || l.instructions ? <span className="block font-sans text-[13.5px] text-muted">{[...l.options.map((o) => o.nom), l.instructions].filter(Boolean).join(" · ")}</span> : null}
              </span>
              <Money cents={l.totalCentimes} devise={devise} className="text-[1.15rem] text-ink" />
            </li>
          ))}
        </ul>
        <p className="flex items-baseline justify-between border-t border-line px-5 py-3">
          <span className="text-[1.1rem] text-ink">Total de la commande</span>
          <Money cents={order.totalCentimes} devise={devise} className="text-[1.5rem] font-medium text-ink" />
        </p>
      </section>

      <ol aria-label="Avancement de la commande" className="mt-4 rounded-2xl border border-line bg-white px-5 py-5 shadow-card">
        {statuts.map((s, i) => {
          const past = i < at || (done && i === at);
          const now = i === at && !done;
          return (
            <li key={s.id} aria-current={i === at ? "step" : undefined} className="relative flex gap-4 pb-6 last:pb-0">
              {i < statuts.length - 1 ? <span aria-hidden className={cn("absolute top-9 bottom-0 left-[17px] w-0.5", i < at ? "bg-olive" : "border-l-2 border-dashed border-line-strong")} /> : null}
              <span className={cn("relative z-10 grid size-9 shrink-0 place-items-center rounded-full", past ? "bg-olive text-white" : now ? "bg-[#f3a93c] text-white ring-4 ring-[#f3a93c]/25" : "bg-olive-tint ring-1 ring-line-strong")}>{past ? <Check size={18} weight="bold" aria-hidden /> : now ? <span className="size-2.5 rounded-full bg-white" /> : null}</span>
              <div className="min-w-0 pt-0.5">
                <p className={cn("flex flex-wrap items-center gap-2.5 text-[1.3rem] leading-tight", past || now ? "font-medium text-ink" : "text-text")}>
                  {s.nom}
                  {now ? <span className="rounded-full bg-warn-soft px-2.5 py-0.5 font-sans text-[13px] font-normal text-warn">En cours</span> : null}
                </p>
                {i === 0 ? <p className="num font-sans text-[14px] text-muted">{hour(order.creeLe, fuseau)}</p> : null}
              </div>
            </li>
          );
        })}
      </ol>

      <p className="mt-4 flex items-center gap-3 rounded-2xl bg-olive-soft px-5 py-4 text-[1.05rem] text-text">
        <BellSimple size={24} aria-hidden className="shrink-0 text-olive-deep" /> Cette page se met à jour toute seule à chaque étape.
      </p>
      <p className="mt-3 flex items-center gap-3 rounded-xl bg-olive-tint px-5 py-3 font-sans text-[14px] text-muted">
        <Info size={18} aria-hidden className="shrink-0" /> Commande envoyée · modification indisponible.
      </p>
      <Link href={`${base}/service`} className={cn(CTA, "mt-4 h-14 w-full text-[1.15rem]")}>
        <CallBell size={22} aria-hidden /> Besoin d'aide ? <ArrowRight size={20} aria-hidden />
      </Link>
    </div>
  );
}

/* -------------------------------------------------------------- service */

/** Page Service : appeler l'équipe, suivre ses demandes, demander l'addition. */
export function ServicePage() {
  const { state, act, pending } = useTable();
  const [details, setDetails] = useState(false);
  const [message, setMessage] = useState("");
  const base = `/table/${state.table.id}`;
  const waiting = state.demandes.filter((d) => d.statut !== "traitee");
  const send = (motifId: string) => void act(() => tableCall("POST", "demandes", { motifId, message: message.trim() }), "Demande transmise à notre équipe.").then((ok) => ok && setMessage(""));
  return (
    <div className="mx-auto max-w-[720px]">
      <PageTitle title="Un coup de main ?" subtitle="Notre équipe est là pour vous." aside={<GuestRow convives={state.convives} />} />

      {state.motifs.length === 0 ? (
        <p className="mt-5 rounded-2xl border border-line bg-white px-6 py-8 text-center text-[1.1rem] text-muted">Aucun motif n'est proposé pour le moment. Faites signe à notre équipe.</p>
      ) : (
        <ul className="mt-5 grid grid-cols-2 gap-3">
          {state.motifs.map((m) => {
            const Icon = MOTIF_ICON[m.icone] ?? ChatCircleDots;
            const sent = waiting.some((d) => d.libelle === m.libelle);
            return (
              <li key={m.id} className={cn("flex flex-col rounded-2xl border bg-white p-4 shadow-card", sent ? "border-olive/50 bg-olive-tint" : "border-line")}>
                <span className="grid size-14 place-items-center rounded-full bg-olive-tint text-ink">
                  <Icon size={28} aria-hidden />
                </span>
                <p className="mt-3 flex-1 text-[1.2rem] leading-tight text-ink">{m.libelle}</p>
                <button type="button" disabled={pending || sent} onClick={() => send(m.id)} className={cn("press mt-3 inline-flex h-12 items-center justify-center gap-2 rounded-full px-4 text-[1.05rem] disabled:pointer-events-none", sent ? "bg-olive/60 text-white" : "bg-olive text-white hover:bg-olive-deep")}>
                  {sent ? <Check size={18} weight="bold" aria-hidden /> : null}
                  {sent ? "Demande envoyée" : "Demander"}
                  <span className="sr-only"> : {m.libelle}</span>
                  {sent ? null : <ArrowRight size={18} aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {waiting.length > 0 ? (
        <ul aria-label="Demandes en attente" aria-live="polite" className="mt-4 grid gap-3">
          {waiting.map((d) => (
            <li key={d.id} className="flex items-center gap-4 rounded-2xl bg-olive-soft px-5 py-4">
              <span className="grid size-14 shrink-0 place-items-center rounded-full bg-olive-tint text-olive-deep">
                <BellSimpleRinging size={26} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-[1.2rem] leading-tight font-medium text-ink">« {d.libelle} » a été transmise.</p>
                <p className="mt-0.5 flex items-center gap-1.5 font-sans text-[14px] text-muted">
                  <Clock size={16} aria-hidden /> {hour(d.creeLe, state.fuseau)}
                </p>
                {d.statut === "en_cours" ? (
                  <p className="mt-1.5 inline-flex items-center gap-2 rounded-full bg-olive-tint px-3 py-1 font-sans text-[13.5px] text-olive-deep">
                    <PersonSimpleWalk size={15} aria-hidden /> Prise en charge : notre équipe arrive
                  </p>
                ) : (
                  <p className="mt-1.5 inline-flex items-center gap-2 rounded-full bg-warn-soft px-3 py-1 font-sans text-[13.5px] text-warn">
                    <Hourglass size={15} aria-hidden /> En attente de prise en charge
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <Link href={`${base}/addition`} className="press mt-4 flex items-center gap-4 rounded-2xl border border-line bg-white p-4 shadow-card">
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-olive-tint text-ink">
          <Receipt size={28} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[1.3rem] leading-tight font-medium text-ink">Demander l'addition</span>
          <span className="text-[1.02rem] text-muted">Consultez le total de la table, puis prévenez notre équipe.</span>
        </span>
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-olive text-white">
          <ArrowRight size={20} aria-hidden />
        </span>
      </Link>

      <div className="mt-4 rounded-2xl border border-line bg-white">
        <button type="button" aria-expanded={details} aria-controls="precision" onClick={() => setDetails((v) => !v)} className="press flex h-14 w-full items-center gap-3 px-5 text-left text-[1.1rem] text-ink">
          <PencilSimple size={22} aria-hidden />
          <span className="flex-1">
            Préciser ma demande <span className="text-muted">(facultatif)</span>
          </span>
          <CaretRight size={16} aria-hidden className={cn("transition-transform", details && "rotate-90")} />
        </button>
        <div id="precision" hidden={!details} className="px-5 pb-5">
          <label htmlFor="message" className="font-sans text-[13.5px] text-muted">
            Ce message accompagnera votre prochaine demande.
          </label>
          <textarea id="message" value={message} maxLength={200} onChange={(e) => setMessage(e.target.value)} rows={2} placeholder="Une chaise haute, s'il vous plaît" className="mt-1.5 w-full resize-none rounded-xl border border-line-strong bg-white px-4 py-3 text-[16px] placeholder:text-muted/80" />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ addition */

export function BillPage() {
  const { state, act, pending } = useTable();
  const { addition, commandes, devise, table, fuseau, convives, demandes } = state;
  const [parts, setParts] = useState(0);
  const people = parts || Math.max(1, convives.length);
  const share = Math.ceil(addition.totalCentimes / people);
  const asked = demandes.some((d) => d.statut !== "traitee" && d.libelle === "L'addition");
  return (
    <>
      <Link href={`/table/${table.id}/service`} className={cn(BACK, "lg:hidden")}>
        <ArrowLeft size={20} aria-hidden /> Service
      </Link>
      <PageTitle title="On fait les comptes ?" subtitle="Les commandes confirmées de votre table, au même endroit." />
      <div className={cn("mt-5 grid items-start gap-4 lg:mt-7 lg:gap-5", addition.partageActif && "xl:grid-cols-[minmax(0,1fr)_minmax(0,0.75fr)]")}>
        <section aria-labelledby="titre-addition" className="rounded-2xl border border-line bg-white p-4 shadow-card lg:p-7">
          <div className="flex items-center gap-4 border-b border-line pb-4 lg:gap-6 lg:pb-6">
            <span className="grid size-14 shrink-0 place-items-center rounded-full bg-olive-tint text-olive-deep lg:size-20">
              <Receipt aria-hidden className="size-7 lg:size-[38px]" />
            </span>
            <div>
              <h2 id="titre-addition" className="text-[1.5rem] leading-tight font-medium text-ink lg:text-[2.2rem]">
                L'addition de la {table.nom.toLowerCase()}
              </h2>
              <p className="font-sans text-[13.5px] text-muted lg:hidden">Seules les commandes envoyées sont incluses.</p>
            </div>
          </div>
          {commandes.length === 0 ? (
            <p className="border-b border-line py-8 text-center text-[1.15rem] text-muted">Aucune commande confirmée pour le moment.</p>
          ) : (
            <ul>
              {commandes.map((c) => (
                <li key={c.id} className="border-b border-line">
                  <details className="group">
                    <summary className="press flex cursor-pointer list-none items-center gap-4 py-4 lg:gap-5 lg:py-5 [&::-webkit-details-marker]:hidden">
                      <Picture src={c.lignes[0]?.image ?? null} alt="" className="h-[58px] w-[80px] shrink-0 rounded-lg lg:h-[70px] lg:w-[96px]" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[1.25rem] leading-tight text-ink lg:text-[1.45rem]">Commande {two(c.rang)}</span>
                        <span className="block text-[1rem] text-muted lg:text-[1.1rem]">
                          {plural(c.articles, "article", "articles")} · {hour(c.creeLe, fuseau)}
                        </span>
                      </span>
                      <Money cents={c.totalCentimes} devise={devise} className="text-[1.25rem] text-ink lg:text-[1.5rem]" />
                      <CaretRight size={16} aria-hidden className="shrink-0 text-muted transition-transform group-open:rotate-90" />
                    </summary>
                    <ul className="pb-3">
                      {c.lignes.map((l) => (
                        <li key={l.id} className="flex items-baseline justify-between gap-4 py-1.5 pl-2 text-[1.02rem]">
                          <span className="min-w-0 text-text">
                            <span className="num text-muted">{l.quantite} ×</span> {l.nom}
                            {l.options.length > 0 || l.instructions ? <span className="block font-sans text-[13px] text-muted">{[...l.options.map((o) => o.nom), l.instructions].filter(Boolean).join(" · ")}</span> : null}
                          </span>
                          <Money cents={l.totalCentimes} devise={devise} className="text-ink" />
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              ))}
            </ul>
          )}
          <p className="flex items-center gap-4 border-b border-line py-4 text-[1.15rem] text-ink lg:gap-5 lg:py-5 lg:text-[1.35rem]">
            <CallBell aria-hidden className="size-7 shrink-0 lg:size-[34px]" />
            <span className="flex-1">Service{addition.service.actif ? ` (${String(addition.service.pourcentage).replace(".", ",")} %)` : ""}</span>
            {addition.service.actif ? <Money cents={addition.service.montantCentimes} devise={devise} /> : <span>Inclus</span>}
          </p>
          <p className="flex items-baseline justify-between py-4 lg:py-6">
            <span className="text-[1.5rem] font-medium text-ink lg:text-[2rem]">Total confirmé</span>
            <Money cents={addition.totalCentimes} devise={devise} className="text-[1.9rem] font-medium text-ink lg:text-[2.4rem]" />
          </p>
          <button type="button" className={cn(CTA, "h-16 w-full text-[1.2rem] lg:h-[72px] lg:text-[1.4rem]")} disabled={pending || asked || commandes.length === 0} onClick={() => void act(() => tableCall("POST", "demandes", { motifId: "addition" }), "Demande transmise : notre équipe apporte l'addition.")}>
            {asked ? <BellSimpleRinging size={26} aria-hidden /> : <BellSimple size={26} aria-hidden />}
            {asked ? "Addition demandée" : "Demander l'addition"}
            {asked ? null : <ArrowRight size={22} aria-hidden />}
          </button>
          <p className="mt-3 text-center text-[1rem] text-muted lg:hidden">{asked ? "En attente de prise en charge : notre équipe vient dès que possible." : "Cette demande prévient notre équipe. Elle ne clôture pas la table."}</p>
          <p className="mt-4 flex items-center justify-center gap-2.5 text-[1rem] text-muted lg:mt-5 lg:text-[1.05rem]">
            <Info size={22} aria-hidden className="shrink-0" /> Le règlement se fait auprès du personnel du restaurant.
          </p>
        </section>

        {addition.partageActif ? (
          <section aria-labelledby="titre-partage" className="rounded-2xl border border-olive/15 bg-olive-soft px-5 py-7 text-center lg:px-7 lg:py-12">
            <span className="mx-auto hidden size-28 place-items-center rounded-full bg-olive-tint text-ink lg:grid">
              <UsersThree size={52} aria-hidden />
            </span>
            <h2 id="titre-partage" className="text-[1.9rem] leading-tight font-medium text-ink lg:mt-6 lg:text-[2.6rem]">
              Chacun sa part.
            </h2>
            <p className="mx-auto mt-1.5 max-w-[26ch] text-[1.1rem] leading-snug text-text lg:mt-2 lg:max-w-[22ch] lg:text-[1.4rem]">Une estimation à parts égales, pour simplifier le moment.</p>
            <div role="group" aria-label="Nombre de convives pour le partage" className="mx-auto mt-5 flex h-14 w-fit items-center rounded-2xl border border-line-strong bg-white lg:mt-8 lg:h-16">
              <button type="button" onClick={() => setParts(Math.max(1, people - 1))} disabled={people <= 1} aria-label="Un convive de moins" className="press grid h-full w-14 place-items-center rounded-l-2xl text-ink hover:bg-olive-tint disabled:opacity-40 lg:w-16">
                <Minus size={22} aria-hidden />
              </button>
              <span aria-live="polite" className="min-w-36 border-x border-line px-4 text-[1.2rem] text-ink lg:min-w-44 lg:text-[1.35rem]">
                {plural(people, "convive", "convives")}
              </span>
              <button type="button" onClick={() => setParts(Math.min(30, people + 1))} disabled={people >= 30} aria-label="Un convive de plus" className="press grid h-full w-14 place-items-center rounded-r-2xl text-ink hover:bg-olive-tint disabled:opacity-40 lg:w-16">
                <Plus size={22} aria-hidden />
              </button>
            </div>
            <p className="mt-6 lg:mt-9">
              <Money cents={share} devise={devise} className="text-[3.2rem] leading-none font-semibold tracking-[-0.02em] text-ink lg:text-[4.6rem]" />
            </p>
            <p className="mt-2 text-[1.15rem] text-text lg:mt-3 lg:text-[1.35rem]">environ par personne</p>
            {people === convives.length ? (
              <ul className="mt-5 rounded-2xl bg-white px-4 text-left lg:hidden">
                {convives.map((c, i) => (
                  <li key={c.id} className="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0">
                    <Guest name={c.nom} index={i} />
                    <span className="min-w-0 flex-1 truncate text-[1.08rem] text-ink">{c.moi ? "Vous" : c.nom}</span>
                    <Money cents={share} devise={devise} className="text-[1.08rem] text-ink" />
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-5 flex items-start gap-2.5 border-t border-olive/20 pt-4 text-left text-[1rem] text-muted lg:mt-8 lg:justify-center lg:pt-6 lg:text-center lg:text-[1.02rem]">
              <Info size={20} aria-hidden className="mt-0.5 shrink-0 lg:hidden" /> Le partage ne constitue pas un paiement. Les arrondis sont ajustés par le restaurant.
            </p>
          </section>
        ) : null}
      </div>
    </>
  );
}

/* ----------------------------------------------------- table en direct */

export function LivePage() {
  const { state } = useTable();
  const { convives, panier, activite, devise, fuseau, table } = state;
  const index = new Map(convives.map((c, i) => [c.nom, i]));
  const leave = async () => {
    try {
      await tableCall("POST", "quitter");
    } finally {
      window.location.assign(`/table/${table.id}`);
    }
  };
  return (
    <>
      <PageTitle title="Les envies se rencontrent." subtitle={`${plural(convives.length, "convive", "convives")}. Un seul panier.`} />
      <div className="mt-5 grid items-start gap-4 lg:mt-7 lg:gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-labelledby="titre-direct" className="rounded-2xl border border-line bg-white p-4 shadow-card lg:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="titre-direct" className="text-[1.5rem] leading-tight font-medium text-ink lg:text-[1.9rem]">
              Le panier en ce moment
            </h2>
            <p className="flex items-center gap-2 rounded-full bg-olive-soft px-4 py-1.5 font-sans text-[13.5px] text-olive-deep lg:text-[14px]">
              <span aria-hidden className="size-2 shrink-0 rounded-full bg-olive" /> Mis à jour en direct sur tous les appareils de la table
            </p>
          </div>
          {panier.lignes.length === 0 ? (
            <p className="mt-5 rounded-xl bg-olive-tint px-6 py-10 text-center text-[1.1rem] text-muted lg:mt-6 lg:text-[1.15rem]">Le panier est vide. Le premier plat ajouté apparaîtra ici pour toute la table.</p>
          ) : (
            <ul className="mt-3 lg:mt-4">
              {panier.lignes.map((l) => (
                <li key={l.id} className="flex items-center gap-4 border-b border-line py-3.5 last:border-b-0 lg:gap-5 lg:py-4">
                  <Picture src={l.image} alt="" className="h-[62px] w-[84px] shrink-0 rounded-lg lg:h-[74px] lg:w-[104px]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[1.12rem] leading-tight text-ink lg:text-[1.25rem]">
                      <span className="num text-muted">{l.quantite} ×</span> {l.nom}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 font-sans text-[13.5px] text-muted">
                      {l.ajoutePar ? (
                        <>
                          <Guest name={l.ajoutePar} index={index.get(l.ajoutePar) ?? 0} className="size-6 text-[11px]" /> Ajouté par {l.ajoutePar}
                        </>
                      ) : null}
                      {l.instructions ? <span>· « {l.instructions} »</span> : null}
                    </p>
                  </div>
                  <Money cents={l.totalCentimes} devise={devise} className="text-[1.1rem] text-ink lg:text-[1.2rem]" />
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 flex items-baseline justify-between border-t border-line pt-4 lg:pt-5">
            <span className="text-[1.15rem] text-ink lg:text-[1.3rem]">Total de la table</span>
            <Money cents={panier.totalCentimes} devise={devise} className="text-[1.6rem] font-medium text-ink lg:text-[2rem]" />
          </p>
          <Link href={`/table/${table.id}`} className={cn(CTA, "mt-4 h-14 w-full text-[1.15rem] lg:mt-5")}>
            Voir le menu <ArrowRight size={20} aria-hidden />
          </Link>
        </section>

        <aside className="rounded-2xl border border-line bg-white p-4 shadow-card lg:p-6">
          <h2 className="text-[1.4rem] leading-tight font-medium text-ink lg:text-[1.6rem]">Autour de la table</h2>
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-3 border-b border-line pb-5">
            {convives.map((c, i) => (
              <li key={c.id} className="flex w-14 flex-col items-center gap-1.5">
                <Guest name={c.nom} index={i} className="size-12 text-[17px]" />
                <span className="w-full truncate text-center text-[14.5px] text-ink">{c.moi ? "Vous" : c.nom}</span>
              </li>
            ))}
          </ul>
          <h2 className="mt-5 text-[1.4rem] leading-tight font-medium text-ink lg:text-[1.6rem]">Les dernières envies</h2>
          {activite.length === 0 ? (
            <p className="mt-3 text-[1.02rem] text-muted">Rien pour le moment.</p>
          ) : (
            <ol className="mt-4 grid gap-5">
              {activite.map((a) => (
                <li key={a.id} className="flex gap-3">
                  <Guest name={a.auteur || "?"} index={index.get(a.auteur) ?? 0} className="size-9" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-baseline justify-between gap-3 text-[1.02rem] text-ink">
                      <span>{a.type === "arrivee" ? `${a.auteur} a rejoint la table` : a.type === "commande" ? `${a.auteur || "La table"} a envoyé la commande ${two(Number(a.objet))}` : `${a.auteur} a ajouté ${a.objet}`}</span>
                      <time dateTime={a.date} className="num shrink-0 font-sans text-[13px] text-muted">
                        {hour(a.date, fuseau)}
                      </time>
                    </p>
                    {a.type !== "arrivee" ? (
                      <p className="mt-1.5 flex items-center gap-3 font-sans text-[13.5px] text-muted">
                        <Picture src={a.image} alt="" className="size-11 shrink-0 rounded-md" />
                        <span>
                          {a.type === "commande" ? plural(a.quantite, "article", "articles") : `${a.quantite} ×`} <Money cents={a.montantCentimes} devise={devise} />
                        </span>
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white px-5 py-4 lg:hidden">
        <p className="text-[1.02rem] text-muted">Vous partez ? Votre place à la table sera libérée sur cet appareil.</p>
        <button type="button" onClick={leave} className="press inline-flex h-11 items-center gap-2 rounded-full border border-line-strong px-4 text-[1.02rem] text-ink">
          <SignOut size={18} aria-hidden /> Quitter la table
        </button>
      </div>
    </>
  );
}
