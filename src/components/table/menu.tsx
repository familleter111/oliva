"use client";

import { ArrowRight, ChatCircleDots, Check, Clock, Heart, Info, Leaf, MagnifyingGlass, PencilSimple, Plant, Plus, ShoppingBag, ShoppingBagOpen, SlidersHorizontal, Trash, Warning, X } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { Dialog } from "radix-ui";
import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/format";
import type { MenuProduct } from "@/lib/server/services/menu";
import type { TableCartLine } from "@/lib/table-types";
import { CTA, GuestRow, Money, PageTitle, Picture, Stepper, hour, plural, two } from "./parts";
import { tableCall, useTable } from "./provider";

const ALL = "tout";
const FAVORITES = "envies";
const SECONDARY = "press inline-flex h-14 w-full items-center justify-center gap-3 rounded-full border border-line-strong bg-white text-[1.1rem] text-ink hover:bg-olive-tint";

/** Carte d'un plat : en ligne sur téléphone et tablette, en vignette sur ordinateur. */
function ProductCard({ p }: { p: MenuProduct }) {
  const { state, act, pending, favorites, toggleFavorite, setDialog } = useTable();
  const liked = favorites.has(p.id);
  const open = () => setDialog({ type: "produit", produit: p });
  // Ajout direct quand rien n'est à choisir ; sinon la fiche s'ouvre pour faire son choix.
  const direct = p.groupes.every((g) => g.min === 0);
  const add = () => (direct ? void act(() => tableCall("POST", "panier/lignes", { produitId: p.id, quantite: 1, cle: crypto.randomUUID?.() }), `${p.nom} ajouté au panier de la table.`) : open());
  return (
    <li className="group relative flex overflow-hidden rounded-2xl border border-line bg-white shadow-card transition-shadow duration-200 hover:shadow-pop lg:flex-col">
      <div className="relative w-[38%] shrink-0 overflow-hidden bg-olive-soft max-lg:min-h-[132px] lg:aspect-[5/3] lg:w-full">
        {p.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image.thumb} srcSet={p.image.srcset} sizes="(min-width: 1024px) 290px, 38vw" alt={p.image.alt} loading="lazy" decoding="async" className={cn("absolute inset-0 size-full object-cover transition-transform duration-500 ease-(--ease-out) group-hover:scale-[1.04]", !p.disponible && "opacity-55 grayscale")} />
        ) : null}
        <button type="button" onClick={() => toggleFavorite(p.id)} aria-pressed={liked} aria-label={liked ? `Retirer ${p.nom} de mes envies` : `Ajouter ${p.nom} à mes envies`} className="press absolute top-2 right-2 z-10 grid size-9 place-items-center rounded-full bg-white/95 text-ink shadow-card">
          <Heart size={19} weight={liked ? "fill" : "regular"} aria-hidden className={cn(liked && "text-[#b4483b]")} />
        </button>
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-[1.15rem] leading-tight font-medium text-ink">
            <button type="button" onClick={open} className="rounded text-left after:absolute after:inset-0 after:content-['']">
              {p.nom}
            </button>
          </h3>
          <Money cents={p.prixCentimes} devise={state.devise} className="text-[1.05rem] text-ink" />
        </div>
        <div className="mt-1 flex flex-1 items-end justify-between gap-3">
          <p className="line-clamp-3 self-start font-sans text-[13.5px] leading-snug text-muted">{p.disponible ? p.description : "Indisponible aujourd'hui"}</p>
          <button type="button" onClick={add} disabled={!p.disponible || pending || !state.reglages.panierOuvert} aria-label={direct ? `Ajouter ${p.nom} au panier` : `Choisir les options de ${p.nom}`} className="press relative z-10 grid size-10 shrink-0 place-items-center rounded-full bg-olive text-white shadow-card hover:bg-olive-deep disabled:pointer-events-none disabled:opacity-40 lg:size-9">
            <Plus size={18} weight="bold" aria-hidden />
          </button>
        </div>
      </div>
    </li>
  );
}

/** Lignes du panier partagé. `large` : cartes avec grande photo, pour la page Panier. */
function CartLines({ large }: { large?: boolean }) {
  const { state, act, pending, setDialog } = useTable();
  const { panier, devise, reglages } = state;
  const item = (l: TableCartLine) => (
    <>
      <Picture src={l.image} alt="" className={cn("shrink-0", large ? "h-auto min-h-[120px] w-[34%] rounded-xl" : "size-[62px] rounded-lg")} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={cn("leading-tight text-ink", large ? "text-[1.3rem] font-medium" : "text-[1.05rem]")}>{l.nom}</p>
          <button type="button" disabled={pending} onClick={() => void act(() => tableCall("DELETE", `panier/lignes/${l.id}`))} aria-label={`Retirer ${l.nom} du panier`} className="press -mt-1 -mr-1.5 grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-danger-soft hover:text-danger">
            {large ? <X size={18} aria-hidden /> : <Trash size={17} aria-hidden />}
          </button>
        </div>
        <p className="font-sans text-[13.5px] text-muted">
          <Money cents={l.prixUnitaireCentimes} devise={devise} />
          {l.ajoutePar ? ` · ${l.ajoutePar}` : ""}
        </p>
        {l.options.length > 0 ? <p className="font-sans text-[13.5px] text-muted">{l.options.map((o) => o.nom).join(", ")}</p> : null}
        {!l.valide ? (
          <p className="mt-1 flex items-center gap-1.5 font-sans text-[13.5px] text-warn">
            <Warning size={15} weight="fill" aria-hidden /> Plus disponible : à retirer
          </p>
        ) : null}
        <div className="mt-2 flex items-center justify-between gap-2">
          <Stepper
            label={`Quantité de ${l.nom}`}
            value={l.quantite}
            disabled={pending}
            plusDisabled={l.quantite >= reglages.quantiteMax}
            onMinus={() => void act(() => tableCall("PATCH", `panier/lignes/${l.id}`, { delta: -1 }))}
            onPlus={() => void act(() => tableCall("PATCH", `panier/lignes/${l.id}`, { delta: 1 }))}
          />
          <Money cents={l.totalCentimes} devise={devise} className={cn("text-ink", large ? "text-[1.3rem]" : "text-[1.05rem]")} />
        </div>
        {reglages.instructionsActives ? (
          <button type="button" onClick={() => setDialog({ type: "instruction", ligne: l })} className="press mt-2 inline-flex min-h-8 items-center gap-1.5 rounded text-left font-sans text-[13.5px] text-olive-deep underline decoration-olive/40 underline-offset-2">
            {l.instructions ? <PencilSimple size={15} aria-hidden /> : <ChatCircleDots size={15} aria-hidden />}
            {l.instructions ? `« ${l.instructions} »` : "Ajouter une instruction"}
            <span className="sr-only">, {l.nom}</span>
          </button>
        ) : l.instructions ? (
          <p className="mt-2 font-sans text-[13.5px] text-muted">« {l.instructions} »</p>
        ) : null}
      </div>
    </>
  );
  if (large) {
    return (
      <ul className="grid gap-3">
        {panier.lignes.map((l) => (
          <li key={l.id} className="flex gap-4 rounded-2xl border border-line bg-white p-3 shadow-card">
            {item(l)}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5">
      {panier.lignes.map((l) => (
        <li key={l.id} className="flex gap-3.5 border-b border-line py-4 last:border-b-0">
          {item(l)}
        </li>
      ))}
    </ul>
  );
}

/** Panneau du panier, à droite du menu sur ordinateur. */
export function CartPanel() {
  const { state, pending, order } = useTable();
  const { panier, devise, reglages, convives, table } = state;
  const blocked = panier.lignes.some((l) => !l.valide);
  return (
    <section aria-labelledby="titre-panier" className="hidden max-h-[calc(100dvh-88px)] min-h-[420px] flex-col rounded-2xl border border-line bg-white shadow-card lg:flex xl:sticky xl:top-[70px]">
      <div className="px-5 pt-5">
        <h2 id="titre-panier" className="text-[1.6rem] leading-tight font-medium text-ink">
          Le panier de la table
        </h2>
        <p className="mt-0.5 font-sans text-[14.5px] text-muted">Panier partagé · {table.nom}</p>
        <GuestRow convives={convives} className="mt-4 border-b border-line pb-4" />
      </div>

      {panier.lignes.length === 0 ? (
        <div className="grid flex-1 place-items-center px-6 py-10 text-center">
          <div>
            <ShoppingBagOpen size={40} aria-hidden className="mx-auto text-olive" />
            <p className="mt-3 text-[1.15rem] text-ink">{reglages.panierOuvert ? "Le panier attend vos envies." : "La commande de la table est envoyée."}</p>
            <p className="mt-1 font-sans text-[14px] text-muted">{reglages.panierOuvert ? "Ajoutez un plat : toute la table le verra aussitôt." : "Suivez sa préparation dans Nos commandes."}</p>
          </div>
        </div>
      ) : (
        <CartLines />
      )}

      <div className="border-t border-line px-5 pt-4 pb-5">
        <p className="flex items-baseline justify-between">
          <span className="text-[1.2rem] text-ink">Total de la table</span>
          <Money cents={panier.totalCentimes} devise={devise} className="text-[1.7rem] font-medium text-ink" />
        </p>
        {!reglages.commandesOuvertes ? <p className="mt-2 rounded-lg bg-warn-soft px-3 py-2 font-sans text-[13.5px] text-warn">{reglages.messageFerme}</p> : null}
        <button type="button" className={cn(CTA, "mt-3 h-[52px] w-full text-[1.1rem]")} disabled={panier.lignes.length === 0 || pending || blocked || !reglages.commandesOuvertes} onClick={order}>
          {reglages.libelleBouton} <ArrowRight size={20} aria-hidden />
        </button>
      </div>
    </section>
  );
}

/** Page Panier : l'onglet « Panier » sur téléphone et tablette. */
export function CartPage() {
  const { state, menu, pending, order, setDialog } = useTable();
  const { panier, devise, reglages, convives, commandes, addition, table, fuseau, statuts } = state;
  const [tab, setTab] = useState<"panier" | "envoyees">("panier");
  const base = `/table/${table.id}`;
  const blocked = panier.lignes.some((l) => !l.valide);
  const last = commandes.at(-1);
  const after = addition.commandesCentimes + panier.totalCentimes;
  const suggestion = useMemo(() => menu.categories.flatMap((c) => c.produits).find((p) => p.disponible && p.image), [menu]);
  const statusName = (id: string) => statuts.find((s) => s.id === id)?.nom ?? id;

  return (
    <div className="mx-auto max-w-[720px]">
      <PageTitle title={commandes.length > 0 && panier.lignes.length > 0 ? "Une autre envie ?" : "Notre panier"} subtitle={commandes.length > 0 && panier.lignes.length > 0 ? "Un nouveau panier, partagé avec la table." : "Partagé avec toute la table."} aside={<GuestRow convives={convives} />} />

      {last ? (
        <Link href={`${base}/commandes/${last.id}`} className="press mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-olive-soft px-4 py-3 text-[1.05rem] text-ink">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-olive text-white">
            <Check size={16} weight="bold" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            Déjà envoyé · Commande {two(last.rang)} · <Money cents={last.totalCentimes} devise={devise} />
          </span>
          <span className="rounded-full bg-white/80 px-3 py-1 font-sans text-[13.5px] text-olive-deep">{statusName(last.statut)}</span>
          <span className="inline-flex items-center gap-1 text-olive-deep">
            Voir <ArrowRight size={16} aria-hidden />
          </span>
        </Link>
      ) : null}

      <div role="tablist" aria-label="Panier et commandes envoyées" className="mt-4 grid grid-cols-2 rounded-full border border-line bg-white p-1">
        {(
          [
            ["panier", `À commander (${panier.articles})`, <ShoppingBag key="i" size={20} aria-hidden />],
            ["envoyees", `Déjà envoyées (${commandes.length})`, <Clock key="i" size={20} aria-hidden />],
          ] as const
        ).map(([id, label, icon]) => (
          <button key={id} type="button" role="tab" id={`onglet-${id}`} aria-selected={tab === id} aria-controls={`volet-${id}`} onClick={() => setTab(id)} className={cn("press inline-flex h-12 items-center justify-center gap-2 rounded-full text-[1.02rem] whitespace-nowrap", tab === id ? "bg-olive text-white" : "text-text")}>
            {icon}
            {label}
          </button>
        ))}
      </div>

      {tab === "envoyees" ? (
        <div role="tabpanel" id="volet-envoyees" aria-labelledby="onglet-envoyees" className="mt-4">
          {commandes.length === 0 ? (
            <p className="rounded-2xl border border-line bg-white px-6 py-10 text-center text-[1.1rem] text-muted">Aucune commande envoyée pour le moment.</p>
          ) : (
            <ul className="grid gap-3">
              {[...commandes].reverse().map((c) => (
                <li key={c.id}>
                  <Link href={`${base}/commandes/${c.id}`} className="press flex items-center gap-4 rounded-2xl border border-line bg-white p-3 shadow-card">
                    <Picture src={c.lignes[0]?.image ?? null} alt="" className="size-[72px] shrink-0 rounded-xl" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[1.25rem] leading-tight text-ink">Commande {two(c.rang)}</span>
                      <span className="block font-sans text-[13.5px] text-muted">
                        {hour(c.creeLe, fuseau)} · {plural(c.articles, "article", "articles")} · {statusName(c.statut)}
                      </span>
                    </span>
                    <Money cents={c.totalCentimes} devise={devise} className="text-[1.15rem] text-ink" />
                    <ArrowRight size={18} aria-hidden className="shrink-0 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div role="tabpanel" id="volet-panier" aria-labelledby="onglet-panier" className="mt-4">
          {panier.lignes.length === 0 ? (
            <>
              <div className="px-4 pt-6 pb-2 text-center">
                <span className="mx-auto grid size-32 place-items-center rounded-full bg-olive-soft text-olive-deep">
                  <ShoppingBagOpen size={64} aria-hidden />
                </span>
                <p className="mt-6 text-[1.9rem] leading-tight font-medium text-ink">{reglages.panierOuvert ? "Tout commence par une envie." : "La commande de la table est envoyée."}</p>
                <p className="mx-auto mt-1.5 max-w-[30ch] text-[1.1rem] text-muted">{reglages.panierOuvert ? "Ajoutez un plat au menu : il apparaîtra dans le panier de toute la table." : "Suivez sa préparation dans Nos commandes."}</p>
              </div>
              <p className="mt-4 flex items-center gap-4 rounded-2xl border border-line bg-white px-4 py-4">
                <span className="grid size-14 shrink-0 place-items-center rounded-full bg-olive-soft text-olive-deep">
                  <ShoppingBag size={26} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[1.15rem] text-ink">Aucun article à commander</span>
                  <span className="font-sans text-[14px] text-muted">Total</span>
                </span>
                <Money cents={0} devise={devise} className="text-[1.6rem] font-medium text-ink" />
              </p>
              <Link href={base} className={cn(CTA, "mt-3 h-14 w-full text-[1.15rem]")}>
                Découvrir le menu <ArrowRight size={20} aria-hidden />
              </Link>
              {suggestion && reglages.panierOuvert ? (
                <div className="mt-4 flex overflow-hidden rounded-2xl border border-line bg-white shadow-card">
                  <Picture src={suggestion.image?.thumb ?? null} alt="" className="w-[40%] shrink-0" />
                  <div className="min-w-0 flex-1 p-4">
                    <p className="flex items-baseline justify-between gap-3 text-[1.25rem] leading-tight text-ink">
                      {suggestion.nom} <Money cents={suggestion.prixCentimes} devise={devise} className="text-[1.1rem]" />
                    </p>
                    <p className="mt-1 line-clamp-2 font-sans text-[13.5px] text-muted">{suggestion.description}</p>
                    <button type="button" onClick={() => setDialog({ type: "produit", produit: suggestion })} className="press mt-3 inline-flex h-10 items-center gap-2 rounded-full bg-olive-soft px-4 text-[1rem] text-olive-deep">
                      Découvrir <span className="sr-only">{suggestion.nom}</span> <ArrowRight size={16} aria-hidden />
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <CartLines large />
              <div className="mt-3 flex items-center gap-4 rounded-2xl bg-olive-soft px-4 py-4">
                <ShoppingBag size={34} aria-hidden className="shrink-0 text-ink" />
                <p className="min-w-0 flex-1">
                  <span className="block text-[1.15rem] text-ink">{plural(panier.articles, "article", "articles")}</span>
                  <span className="font-sans text-[13.5px] text-muted">Mis à jour pour toute la table</span>
                </p>
                <p className="text-right">
                  <span className="block font-sans text-[13.5px] text-muted">Total</span>
                  <Money cents={panier.totalCentimes} devise={devise} className="text-[1.7rem] font-medium text-ink" />
                </p>
              </div>
              {commandes.length > 0 ? (
                <div className="mt-3 rounded-2xl border border-line bg-white px-5 py-4 text-[1.05rem]">
                  <p className="flex justify-between text-muted">
                    <span>Déjà commandé</span> <Money cents={addition.commandesCentimes} devise={devise} />
                  </p>
                  <p className="mt-2 flex justify-between border-t border-line pt-2 font-medium text-ink">
                    <span>
                      Après confirmation <span className="font-normal text-muted">(total table)</span>
                    </span>
                    <Money cents={after} devise={devise} />
                  </p>
                  <p className="mt-2 flex items-center gap-2 rounded-lg bg-olive-tint px-3 py-2 font-sans text-[13.5px] text-muted">
                    <Info size={16} aria-hidden /> La commande précédente reste inchangée.
                  </p>
                </div>
              ) : null}
              {!reglages.commandesOuvertes ? <p className="mt-3 rounded-xl bg-warn-soft px-4 py-3 text-[15px] text-warn">{reglages.messageFerme}</p> : null}
              <button type="button" className={cn(CTA, "mt-4 h-14 w-full text-[1.15rem]")} disabled={pending || blocked || !reglages.commandesOuvertes} onClick={order}>
                {reglages.libelleBouton} · <Money cents={panier.totalCentimes} devise={devise} /> <ArrowRight size={20} aria-hidden />
              </button>
              <Link href={base} className={cn(SECONDARY, "mt-3")}>
                Continuer le menu
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function MenuPage() {
  const { state, menu, favorites } = useTable();
  const [filter, setFilter] = useState(ALL);
  const [tags, setTags] = useState<Set<string>>(() => new Set());
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [query, setQuery] = useState("");
  const products = useMemo(() => menu.categories.flatMap((c) => c.produits.map((p) => ({ p, categorie: c.id }))), [menu]);
  const allTags = useMemo(() => [...new Set(products.flatMap(({ p }) => p.etiquettes.map((e) => e.nom)))], [products]);

  const q = query.trim().toLocaleLowerCase("fr");
  const shown = products.filter(({ p, categorie }) => {
    if (q && !`${p.nom} ${p.description}`.toLocaleLowerCase("fr").includes(q)) return false;
    if (onlyAvailable && !p.disponible) return false;
    if (tags.size > 0 && !p.etiquettes.some((e) => tags.has(e.nom))) return false;
    if (filter === ALL) return true;
    if (filter === FAVORITES) return favorites.has(p.id);
    return categorie === filter;
  });
  const extra = tags.size + (onlyAvailable ? 1 : 0);
  const reset = () => {
    setFilter(ALL);
    setTags(new Set());
    setOnlyAvailable(false);
  };
  const toggleTag = (t: string) =>
    setTags((current) => {
      const next = new Set(current);
      if (!next.delete(t)) next.add(t);
      return next;
    });

  const chip = (id: string, label: string, icon?: ReactNode) => (
    <li key={id}>
      <button type="button" onClick={() => setFilter(id)} aria-pressed={filter === id} className={cn("press inline-flex h-11 items-center gap-2 rounded-full border px-4 font-sans text-[14.5px] whitespace-nowrap lg:h-10", filter === id ? "border-olive bg-olive text-white" : "border-line-strong bg-white text-text hover:bg-olive-tint")}>
        {icon}
        {label}
      </button>
    </li>
  );
  const search = (className: string) => (
    <label className={cn("relative block", className)}>
      <span className="sr-only">Rechercher un plat</span>
      <MagnifyingGlass size={20} aria-hidden className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" />
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Une envie particulière ?" className="h-12 w-full rounded-full border border-line-strong bg-white pr-4 pl-12 text-[16px] placeholder:text-muted lg:h-11" />
    </label>
  );

  return (
    <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_330px]">
      <div className="min-w-0">
        <PageTitle
          title={menu.apparence.titre || "À table, ensemble."}
          subtitle={menu.restaurant.description || "Les bons moments commencent par de bons plats."}
          aside={<GuestRow convives={state.convives} className="lg:hidden" />}
        />
        {search("mt-4 lg:hidden")}

        <div className="relative mt-4 overflow-hidden rounded-2xl bg-olive-deep text-white lg:mt-5">
          {menu.apparence.banniere ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={menu.apparence.banniere.src} srcSet={menu.apparence.banniere.srcset} sizes="(min-width: 1280px) 900px, 100vw" alt="" fetchPriority="high" className="absolute inset-0 size-full object-cover" />
          ) : null}
          <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-[#263d30] from-25% via-[#263d30]/80 via-45% to-transparent" />
          <div className="relative max-w-[30rem] px-6 py-7 sm:px-12 sm:py-10 lg:py-12">
            <p className="text-[1.6rem] leading-[1.15] font-medium sm:text-[2.1rem]">{menu.apparence.texte2 || "Un peu d'Italie. Beaucoup de plaisir."}</p>
            <Plant aria-hidden size={24} className="mt-2 opacity-80" />
            <a href="#carte" className="press mt-4 inline-flex h-11 items-center gap-2.5 rounded-full bg-white px-5 text-[1.05rem] text-ink hover:bg-olive-tint">
              Découvrir la carte <ArrowRight size={18} aria-hidden />
            </a>
          </div>
        </div>

        {!menu.publie || products.length === 0 ? (
          <p className="mt-10 rounded-2xl border border-line bg-white px-6 py-10 text-center text-[1.15rem] text-muted">La carte arrive bientôt. Notre équipe prend votre commande en attendant.</p>
        ) : (
          <section id="carte" aria-labelledby="titre-carte" className="@container scroll-mt-20 pt-5 lg:pt-7">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 id="titre-carte" className="text-[1.7rem] leading-tight font-medium tracking-[-0.01em] text-ink lg:text-[2.2rem]">
                Faites-vous plaisir
              </h2>
              {search("hidden w-[340px] lg:block")}
            </div>
            <div className="mt-3 flex items-center gap-2 lg:mt-4">
              <ul aria-label="Filtrer la carte" className="scroll-thin flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
                {chip(ALL, "Tout le menu")}
                {menu.categories.map((c) => chip(c.id, c.nom))}
                {chip(FAVORITES, "Mes envies", <Heart size={16} aria-hidden />)}
              </ul>
              <button type="button" onClick={() => setSheet(true)} className={cn("press mb-1 inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 font-sans text-[14.5px] lg:h-10", extra > 0 ? "border-olive bg-olive-soft text-olive-deep" : "border-line-strong bg-white text-text")}>
                <SlidersHorizontal size={18} aria-hidden /> Filtres{extra > 0 ? ` (${extra})` : ""}
              </button>
            </div>
            <p aria-live="polite" className="mt-2 font-sans text-[13.5px] text-muted">
              {plural(shown.length, "résultat", "résultats")}
            </p>
            {shown.length === 0 ? (
              <p className="mt-4 rounded-2xl border border-line bg-white px-6 py-10 text-center text-[1.1rem] text-muted">{filter === FAVORITES && !q && extra === 0 ? "Touchez le cœur d'un plat pour le garder dans vos envies." : "Aucun plat ne correspond. Essayez un autre mot ou un autre filtre."}</p>
            ) : (
              <ul className="mt-3 grid gap-3 lg:gap-5 lg:@xl:grid-cols-2 lg:@3xl:grid-cols-3">
                {shown.map(({ p }) => (
                  <ProductCard key={p.id} p={p} />
                ))}
              </ul>
            )}
            <p className="mt-6 font-sans text-[13.5px] text-muted">Les allergènes indiqués sont à confirmer auprès de notre équipe.</p>
          </section>
        )}
      </div>
      <CartPanel />

      <Dialog.Root open={sheet} onOpenChange={setSheet}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 animate-fade bg-ink/45" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88dvh] w-full max-w-[760px] animate-sheet flex-col rounded-t-[26px] bg-paper shadow-pop focus:outline-none lg:top-1/2 lg:bottom-auto lg:max-w-[520px] lg:-translate-y-1/2 lg:animate-pop lg:rounded-[22px]">
            <div className="flex items-center justify-between px-6 pt-6">
              <Dialog.Title className="text-[1.7rem] leading-tight font-medium text-ink">Affiner votre recherche</Dialog.Title>
              <Dialog.Close aria-label="Fermer" className="press grid size-10 place-items-center rounded-full text-ink hover:bg-olive-soft">
                <X size={20} aria-hidden />
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">Catégorie, régimes alimentaires et disponibilité.</Dialog.Description>
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-6 pt-4 pb-2">
              <p className="text-[1.1rem] font-semibold text-ink">Catégorie</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {chip(ALL, "Tous")}
                {menu.categories.map((c) => chip(c.id, c.nom))}
              </ul>
              {allTags.length > 0 ? (
                <>
                  <p className="mt-5 text-[1.1rem] font-semibold text-ink">Régimes alimentaires</p>
                  <div className="mt-2 grid gap-1.5">
                    {allTags.map((t) => (
                      <label key={t} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl bg-olive-tint px-4 text-[1.02rem] text-ink">
                        <input type="checkbox" checked={tags.has(t)} onChange={() => toggleTag(t)} className="size-[18px] accent-olive" />
                        <Leaf size={18} aria-hidden className="text-olive-deep" /> {t}
                      </label>
                    ))}
                  </div>
                </>
              ) : null}
              <p className="mt-5 text-[1.1rem] font-semibold text-ink">Allergènes</p>
              <p className="mt-2 rounded-xl border border-line bg-white px-4 py-3 text-[1rem] text-text">Consultez les allergènes sur la fiche de chaque plat, et confirmez-les auprès de notre équipe.</p>
              <label className="mt-4 flex min-h-12 cursor-pointer items-center gap-3 text-[1.02rem] text-ink">
                <input type="checkbox" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} className="size-[18px] accent-olive" />
                Masquer les plats indisponibles
              </label>
            </div>
            <div className="flex items-center gap-4 border-t border-line px-6 py-4">
              <button type="button" onClick={reset} className="press rounded px-1 text-[1.02rem] text-olive-deep underline underline-offset-2">
                Réinitialiser
              </button>
              <button type="button" onClick={() => setSheet(false)} className={cn(CTA, "h-13 flex-1 text-[1.1rem]")}>
                Afficher {plural(shown.length, "résultat", "résultats")} <ArrowRight size={20} aria-hidden />
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
