"use client";

import { ArrowDown, Clock, CookingPot, EnvelopeSimple, ForkKnife, Leaf, MapPin, Pepper, Phone, PicnicTable, Plant, QrCode, Tag, Timer, X } from "@phosphor-icons/react/dist/ssr";
import { Dialog } from "radix-ui";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { BackButton } from "@/components/back-button";
import { LanguageSwitch } from "@/components/i18n";
import { JOURS, cn, formatDate, formatMoney } from "@/lib/format";
import type { MenuCategory, MenuData, MenuImage, MenuProduct } from "@/lib/server/services/menu";

const TAG_ICON: Record<string, typeof Leaf> = { leaf: Leaf, plant: Plant, pepper: Pepper, "cooking-pot": CookingPot, tag: Tag };

function Photo({ image, className, priority, sizes }: { image: MenuImage; className?: string; priority?: boolean; sizes: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image.thumb}
      srcSet={image.srcset}
      sizes={sizes}
      alt={image.alt}
      width={image.w}
      height={image.h}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      className={cn("object-cover", className)}
    />
  );
}

function Brand({ data }: { data: MenuData }) {
  if (data.restaurant.logo) return <Photo image={data.restaurant.logo} sizes="140px" priority className="h-11 w-auto max-w-36 object-contain" />;
  return (
    <span className="relative text-[1.9rem] leading-none font-medium tracking-[-0.03em]">
      {data.restaurant.nom.toLowerCase()}.
      <Plant weight="fill" aria-hidden className="absolute -top-1 -right-3.5 size-4 text-(--m-primary)" />
    </span>
  );
}

/** Regroupe les jours consécutifs aux horaires identiques : « Mardi au samedi ». */
function groupHours(horaires: MenuData["horaires"]) {
  const out: { label: string; text: string }[] = [];
  let start = 0;
  const sig = (h: MenuData["horaires"][number]) => (h.ouvert ? h.plages.map((p) => `${p.debut} à ${p.fin}`).join(", ") : "Fermé");
  for (let i = 1; i <= horaires.length; i++) {
    if (i < horaires.length && sig(horaires[i]) === sig(horaires[start])) continue;
    const a = JOURS[horaires[start].jour - 1];
    const b = JOURS[horaires[i - 1].jour - 1];
    out.push({ label: i - 1 === start ? a : `${a} au ${b.toLowerCase()}`, text: sig(horaires[start]) });
    start = i;
  }
  return out;
}

function Price({ cents, devise, className }: { cents: number; devise: string; className?: string }) {
  return <span className={cn("num whitespace-nowrap", className)}>{formatMoney(cents, devise)}</span>;
}

function Tags({ p }: { p: MenuProduct }) {
  if (p.etiquettes.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13.5px]">
      {p.etiquettes.map((e) => {
        const Icon = TAG_ICON[e.icone] ?? Tag;
        return (
          <li key={e.nom} className="inline-flex items-center gap-1" style={{ color: e.couleur }}>
            <Icon size={15} weight="fill" aria-hidden /> {e.nom}
          </li>
        );
      })}
    </ul>
  );
}

function ProductCard({ p, devise, onOpen, variant }: { p: MenuProduct; devise: string; onOpen: () => void; variant: "tile" | "row" | "feature" }) {
  const wide = variant !== "tile";
  return (
    <li className={cn(variant === "feature" && "lg:col-span-2")}>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "group flex h-full w-full flex-row overflow-hidden rounded-2xl border border-(--m-line) bg-white text-left transition-[transform,box-shadow] duration-200 ease-(--ease-out) active:scale-[0.985] [@media(hover:hover)]:hover:shadow-[0_14px_34px_-18px_rgb(38_61_48/0.35)]",
          !wide && "sm:flex-col",
        )}
      >
        {p.image ? (
          <span className={cn("relative block w-[34%] shrink-0 overflow-hidden bg-(--m-line)", wide ? "sm:w-[42%]" : "sm:aspect-[4/3] sm:w-full")}>
            <Photo
              image={p.image}
              sizes={wide ? "(min-width: 640px) 320px, 34vw" : "(min-width: 640px) 360px, 34vw"}
              className={cn("absolute inset-0 size-full transition-transform duration-500 ease-(--ease-out) [@media(hover:hover)]:group-hover:scale-[1.04]", !p.disponible && "opacity-55 grayscale")}
            />
          </span>
        ) : null}
        <span className={cn("flex min-h-28 min-w-0 flex-1 flex-col p-4", wide && "sm:min-h-44 sm:justify-center sm:p-6")}>
          <span className="flex items-baseline justify-between gap-3">
            <span className={cn("text-[1.12rem] leading-tight font-semibold", wide && "sm:text-[1.35rem]")}>{p.nom}</span>
            <Price cents={p.prixCentimes} devise={devise} className={cn("text-[1.02rem]", wide && "sm:text-[1.15rem]")} />
          </span>
          {p.description ? <span className={cn("mt-1 line-clamp-2 text-[14.5px] leading-snug opacity-75", wide && "sm:line-clamp-3 sm:text-[15.5px]")}>{p.description}</span> : null}
          <Tags p={p} />
          {!p.disponible ? <span className="mt-2 w-fit rounded-full bg-black/6 px-2.5 py-0.5 text-[13px]">Indisponible aujourd'hui</span> : null}
          <span className="sr-only">. Voir le détail</span>
        </span>
      </button>
    </li>
  );
}

function ProductSheet({ p, devise, onClose, theme }: { p: MenuProduct | null; devise: string; onClose: () => void; theme: CSSProperties }) {
  return (
    <Dialog.Root open={!!p} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 animate-fade bg-black/45" />
        <Dialog.Content style={theme} className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] animate-sheet flex-col overflow-hidden rounded-t-3xl bg-white text-(--m-text) shadow-pop focus:outline-none sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-[min(560px,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:animate-pop sm:rounded-3xl">
          {p ? (
            <>
              <Dialog.Close aria-label="Fermer" className="press absolute top-3 right-3 z-10 grid size-10 place-items-center rounded-full bg-white/95 shadow-card">
                <X size={18} />
              </Dialog.Close>
              <div className="scroll-thin overflow-y-auto">
                {p.image ? <Photo image={p.image} sizes="(min-width: 640px) 560px, 100vw" className="aspect-[4/3] w-full" /> : null}
                <div className="p-5 sm:p-7">
                  <div className="flex items-baseline justify-between gap-4">
                    <Dialog.Title className="text-[1.6rem] leading-tight font-semibold">{p.nom}</Dialog.Title>
                    <Price cents={p.prixCentimes} devise={devise} className="text-[1.3rem]" />
                  </div>
                  <Dialog.Description className="mt-2 text-[16.5px] leading-relaxed opacity-80">{p.description || "Demandez le détail de ce plat à notre équipe."}</Dialog.Description>
                  <Tags p={p} />
                  {!p.disponible ? <p className="mt-3 rounded-xl bg-black/5 px-4 py-2.5 text-[15px]">Ce plat n'est pas disponible aujourd'hui.</p> : null}

                  {p.groupes.map((g) => (
                    <section key={g.id} className="mt-5 border-t border-(--m-line) pt-4">
                      <h3 className="text-[1.05rem] font-semibold">
                        {g.nom} <span className="font-normal opacity-75">({g.obligatoire ? "au choix" : "en supplément"})</span>
                      </h3>
                      <ul className="mt-1.5">
                        {g.options.map((o) => (
                          <li key={o.id} className="flex justify-between gap-3 py-1 text-[15.5px]">
                            <span>
                              <span className={cn(!o.disponible && "line-through")}>{o.nom}</span>
                              {!o.disponible ? <span className="ml-2 text-[13.5px] opacity-75">indisponible</span> : null}
                            </span>
                            {o.prixCentimes > 0 ? <span className="num opacity-75">+{formatMoney(o.prixCentimes, devise)}</span> : null}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}

                  {p.allergenes.length > 0 || p.tempsPreparationMin ? (
                    <dl className="mt-5 flex flex-col gap-2 border-t border-(--m-line) pt-4 text-[15px]">
                      {p.allergenes.length > 0 ? (
                        <div>
                          <dt className="font-semibold">Allergènes à vérifier</dt>
                          <dd className="opacity-80">{p.allergenes.join(", ")}</dd>
                        </div>
                      ) : null}
                      {p.tempsPreparationMin ? (
                        <div className="flex items-center gap-2 opacity-80">
                          <Timer size={18} aria-hidden />
                          <dt className="sr-only">Temps indicatif</dt>
                          <dd>Environ {p.tempsPreparationMin} minutes de préparation</dd>
                        </div>
                      ) : null}
                    </dl>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Grille sans case vide : le nombre de colonnes et les plats mis en avant dépendent du nombre de plats.
 * 1 plat : une grande carte. 2 ou 4 : deux colonnes de cartes larges. Sinon trois colonnes.
 */
function layout(n: number): { cols: string; variant: (i: number) => "tile" | "row" | "feature" } {
  if (n === 1) return { cols: "lg:max-w-2xl", variant: () => "row" };
  if (n === 2 || n === 4) return { cols: "lg:grid-cols-2", variant: () => "row" };
  const featured = n % 3 === 2 ? [0] : n % 3 === 1 ? [0, 2] : [];
  return { cols: "sm:grid-cols-2 lg:grid-cols-3", variant: (i) => (featured.includes(i) ? "feature" : "tile") };
}

function CategorySection({ c, devise, onOpen }: { c: MenuCategory; devise: string; onOpen: (p: MenuProduct) => void }) {
  const grid = layout(c.produits.length);
  return (
    <section id={`cat-${c.id}`} data-cat={c.id} aria-labelledby={`titre-${c.id}`} className="scroll-mt-32 pt-10 first:pt-8 sm:pt-14 sm:first:pt-10">
      <h2 id={`titre-${c.id}`} className="text-[1.9rem] leading-tight font-bold tracking-[-0.02em] text-(--m-text) sm:text-[2.4rem]">
        {c.nom}
      </h2>
      {c.description ? <p className="mt-1 max-w-[60ch] text-[16.5px] opacity-75">{c.description}</p> : null}
      <ul className={cn("mt-5 grid grid-cols-1 gap-3 sm:gap-5", grid.cols)}>
        {c.produits.map((p, i) => (
          <ProductCard key={p.id} p={p} devise={devise} onOpen={() => onOpen(p)} variant={grid.variant(i)} />
        ))}
      </ul>
    </section>
  );
}

export function MenuView({ data, preview }: { data: MenuData; preview?: boolean }) {
  const [open, setOpen] = useState<MenuProduct | null>(null);
  const [scan, setScan] = useState(false);
  const [active, setActive] = useState(data.categories[0]?.id ?? "");
  const pills = useRef<HTMLDivElement>(null);
  const a = data.apparence;
  const theme = { "--m-bg": a.fond, "--m-primary": a.primaire, "--m-text": a.texte, "--m-line": a.bordures } as CSSProperties;
  const style = { ...theme, background: a.fond, color: a.texte } as CSSProperties;
  const hours = groupHours(data.horaires);
  const title = a.titre || data.restaurant.nom;
  const lead = a.texte2 || data.restaurant.description;

  // Catégorie visible : suivie par IntersectionObserver, sans écouteur de défilement.
  useEffect(() => {
    const sections = [...document.querySelectorAll<HTMLElement>("[data-cat]")];
    if (sections.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((x, y) => x.boundingClientRect.top - y.boundingClientRect.top)[0];
        if (visible) setActive((visible.target as HTMLElement).dataset.cat ?? "");
      },
      { rootMargin: "-25% 0px -60% 0px" },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [data.categories]);

  // La pastille active est recentrée dans sa barre. Seule la barre défile : jamais la page.
  useEffect(() => {
    const bar = pills.current;
    const pill = bar?.querySelector<HTMLElement>(`[data-pill="${active}"]`);
    if (!bar || !pill || bar.scrollWidth <= bar.clientWidth) return;
    bar.scrollTo({ left: pill.offsetLeft - (bar.clientWidth - pill.offsetWidth) / 2, behavior: "smooth" });
  }, [active]);

  return (
    <div style={style} className="min-h-[100dvh]">
      <header className="sticky top-0 z-30 border-b border-(--m-line) bg-(--m-bg)/92 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <BackButton hideWithoutHistory className="-ml-2" />
            <a href="#haut" className="rounded-lg">
              <Brand data={data} />
              <span className="sr-only">, haut de page</span>
            </a>
          </div>
          <div className="flex items-center gap-3 text-[14.5px]">
            {data.etat.libelle ? (
              <span className="hidden items-center gap-2 sm:inline-flex">
                <span aria-hidden className={cn("size-2 rounded-full", data.etat.ouvert ? "bg-(--m-primary)" : "bg-black/30")} />
                {data.etat.libelle}
              </span>
            ) : null}
            <LanguageSwitch content={{ current: data.langue, langs: data.langues.map((l) => l.id) }} />
          </div>
        </div>
      </header>

      <main id="haut">
        <section className="mx-auto grid max-w-6xl items-center gap-6 px-4 pt-6 pb-8 sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:gap-12 md:pt-12 md:pb-14">
          <div className="order-2 animate-rise md:order-1">
            {data.restaurant.sousTitre ? <p className="eyebrow text-(--m-text) opacity-70">{data.restaurant.sousTitre}</p> : null}
            <h1 className="mt-3 text-[2.5rem] leading-[1.06] font-bold tracking-[-0.03em] text-balance text-(--m-text) sm:text-[3.4rem] lg:text-[4rem]">{title}</h1>
            {lead ? <p className="mt-3 max-w-[38ch] text-[1.15rem] leading-snug opacity-80 sm:text-[1.3rem]">{lead}</p> : null}
            {data.categories.length > 0 ? (
              <div className="mt-6 flex flex-wrap gap-3">
                <a href="#carte" className="press inline-flex h-12 items-center gap-2 rounded-full bg-(--m-primary) px-6 text-[17px] font-medium text-white">
                  Voir la carte <ArrowDown size={18} aria-hidden />
                </a>
                <a href="#infos" className="press inline-flex h-12 items-center rounded-full border border-(--m-line) bg-white px-6 text-[17px]">
                  Horaires et accès
                </a>
              </div>
            ) : null}
            {preview ? null : (
              <div className="mt-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <a href="/table" className="press inline-flex h-12 items-center justify-center gap-3 rounded-full border border-(--m-line) bg-white px-6 text-[17px]">
                    <PicnicTable size={22} aria-hidden /> Choisir ma table
                  </a>
                  <button type="button" onClick={() => setScan(true)} className="press inline-flex h-12 items-center justify-center gap-3 rounded-full border border-(--m-line) bg-white px-6 text-[17px] lg:hidden">
                    <QrCode size={22} aria-hidden /> Scanner le QR de ma table
                  </button>
                </div>
                <p className="mt-3 flex items-center gap-3 text-[15px]">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-(--m-primary)">
                    <Plant size={18} aria-hidden />
                  </span>
                  <span>
                    <span className="block font-medium">Sans inscription</span>
                    <span className="opacity-75">Simple, rapide et pour tous à la table.</span>
                  </span>
                </p>
              </div>
            )}
          </div>
          {a.banniere ? (
            <div className="order-1 md:order-2">
              <Photo image={a.banniere} priority sizes="(min-width: 1152px) 600px, (min-width: 768px) 52vw, calc(100vw - 32px)" className="aspect-[16/10] w-full rounded-3xl md:aspect-[5/4]" />
            </div>
          ) : null}
        </section>


        {data.categories.length === 0 ? (
          <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
            <ForkKnife size={40} weight="light" aria-hidden className="mx-auto text-(--m-primary)" />
            <h2 className="mt-3 text-[1.8rem] font-bold text-(--m-text)">La carte arrive bientôt.</h2>
            <p className="mt-1 opacity-75">{preview ? "Aucun produit visible dans le brouillon." : "Notre équipe prépare le menu. Revenez dans quelques instants."}</p>
          </section>
        ) : (
          <>
            <div id="carte" className="sticky top-16 z-20 scroll-mt-16 border-y border-(--m-line) bg-(--m-bg)/95 backdrop-blur-sm">
              <div ref={pills} role="navigation" aria-label="Catégories de la carte" className="relative mx-auto flex max-w-6xl snap-x gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden">
                {data.categories.map((c) => (
                  <a
                    key={c.id}
                    href={`#cat-${c.id}`}
                    data-pill={c.id}
                    aria-current={active === c.id ? "true" : undefined}
                    className={cn("press shrink-0 snap-start rounded-full border px-4 py-1.5 text-[15.5px] transition-colors duration-200", active === c.id ? "border-transparent bg-(--m-primary) text-white" : "border-(--m-line) bg-white")}
                  >
                    {c.nom}
                  </a>
                ))}
              </div>
            </div>
            <div className="mx-auto max-w-6xl px-4 pb-6 sm:px-6">
              {data.categories.map((c) => (
                <CategorySection key={c.id} c={c} devise={data.restaurant.devise} onOpen={setOpen} />
              ))}
            </div>
          </>
        )}

        <section id="infos" aria-labelledby="titre-infos" className="mt-10 scroll-mt-20 border-t border-(--m-line) bg-white">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:gap-16">
            <div>
              <h2 id="titre-infos" className="flex items-center gap-2.5 text-[1.7rem] font-bold text-(--m-text)">
                <Clock size={26} weight="light" aria-hidden /> Horaires
              </h2>
              {data.etat.libelle ? (
                <p className="mt-2 inline-flex items-center gap-2 rounded-full border border-(--m-line) bg-(--m-bg) px-3 py-1 text-[15px]">
                  <span aria-hidden className={cn("size-2 rounded-full", data.etat.ouvert ? "bg-(--m-primary)" : "bg-black/30")} />
                  {data.etat.libelle}
                </p>
              ) : null}
              {hours.length === 0 ? (
                <p className="mt-3 opacity-75">Les horaires seront bientôt indiqués.</p>
              ) : (
                <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-[16.5px]">
                  {hours.map((h) => (
                    <div key={h.label} className="contents">
                      <dt className="font-medium">{h.label}</dt>
                      <dd className={cn("num", h.text === "Fermé" && "opacity-75")}>{h.text}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {data.fermetures.length > 0 ? (
                <p className="mt-4 rounded-xl bg-(--m-bg) px-4 py-3 text-[15px]">
                  Fermeture exceptionnelle : {data.fermetures.map((f) => `${formatDate(f.date)}${f.motif ? ` (${f.motif})` : ""}`).join(", ")}.
                </p>
              ) : null}
            </div>
            <div>
              <h2 className="text-[1.7rem] font-bold text-(--m-text)">Nous trouver</h2>
              <ul className="mt-4 flex flex-col gap-3 text-[16.5px]">
                {data.restaurant.adresse ? (
                  <li className="flex items-start gap-3">
                    <MapPin size={22} weight="light" aria-hidden className="mt-0.5 shrink-0" /> {data.restaurant.adresse}
                  </li>
                ) : null}
                {data.restaurant.telephone ? (
                  <li>
                    <a href={`tel:${data.restaurant.telephone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-3 underline-offset-4 hover:underline">
                      <Phone size={22} weight="light" aria-hidden /> {data.restaurant.telephone}
                    </a>
                  </li>
                ) : null}
                {data.restaurant.email ? (
                  <li>
                    <a href={`mailto:${data.restaurant.email}`} className="flex items-center gap-3 underline-offset-4 hover:underline">
                      <EnvelopeSimple size={22} weight="light" aria-hidden /> {data.restaurant.email}
                    </a>
                  </li>
                ) : null}
                {!data.restaurant.adresse && !data.restaurant.telephone && !data.restaurant.email ? <li className="opacity-75">Les coordonnées seront bientôt indiquées.</li> : null}
              </ul>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-(--m-line) px-4 py-8 text-center text-[14.5px] opacity-75 sm:px-6">
        <p className="mx-auto max-w-[62ch]">Les allergènes indiqués sont à confirmer auprès de notre équipe, qui vous renseigne volontiers sur la composition de chaque plat.</p>
        <p className="mt-2">{data.restaurant.nom}</p>
      </footer>

      <Dialog.Root open={scan} onOpenChange={setScan}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 animate-fade bg-black/45" />
          <Dialog.Content style={theme} className="fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 animate-pop rounded-3xl bg-white p-7 text-(--m-text) shadow-pop focus:outline-none">
            <Dialog.Close aria-label="Fermer" className="press absolute top-3 right-3 grid size-10 place-items-center rounded-full">
              <X size={18} />
            </Dialog.Close>
            <QrCode size={40} aria-hidden className="text-(--m-primary)" />
            <Dialog.Title className="mt-3 text-[1.6rem] leading-tight font-semibold">Commander depuis votre table</Dialog.Title>
            <Dialog.Description className="mt-1 text-[16px] opacity-80">Le QR code posé sur votre table ouvre le panier partagé. Sans QR code sous la main, choisissez votre table depuis cette page.</Dialog.Description>
            <ol className="mt-4 grid gap-3 text-[16px]">
              {["Ouvrez l'appareil photo de votre téléphone.", "Visez le QR code de votre table, puis touchez le lien qui s'affiche.", "Indiquez votre prénom : notre équipe vient vous confirmer, puis la carte s'ouvre."].map((step, i) => (
                <li key={step} className="flex items-start gap-3">
                  <span className="num grid size-7 shrink-0 place-items-center rounded-full bg-(--m-primary) font-sans text-[13px] font-semibold text-white">{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <ProductSheet p={open} devise={data.restaurant.devise} onClose={() => setOpen(null)} theme={theme} />
    </div>
  );
}
