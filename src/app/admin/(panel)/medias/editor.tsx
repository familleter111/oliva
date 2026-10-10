"use client";

import { CheckCircle, CircleNotch, CloudArrowUp, Crop, ForkKnife, Image as ImageIcon, MagnifyingGlass, Swap, Trash, X } from "@phosphor-icons/react/dist/ssr";
import { useRef, useState, type DragEvent } from "react";
import { useUpload } from "@/components/admin/media-picker";
import { Confirm, Modal, SaveButton, useAction, useApi, useDraft } from "@/components/client";
import { Badge, Button, Callout, Card, EmptyState, Field, IconButton, Input, PageHeader, Select, Thumb } from "@/components/ui";
import { cn, formatBytes } from "@/lib/format";
import type { MediaLite } from "@/lib/types";

interface Usage {
  type: string;
  nom: string;
  champ: string;
}
const CATS: Record<string, string> = { produits: "Produits", restaurant: "Restaurant", logo: "Logo" };
const RATIOS = [
  { id: "1", label: "Carré 1:1", r: 1 },
  { id: "4/3", label: "Paysage 4:3", r: 4 / 3 },
  { id: "16/9", label: "Bannière 16:9", r: 16 / 9 },
  { id: "3/4", label: "Portrait 3:4", r: 3 / 4 },
];

function Detail({ media, usages, onClose }: { media: MediaLite; usages: Usage[]; onClose: () => void }) {
  const call = useApi();
  const { run, pending } = useAction();
  const { upload, uploading } = useUpload();
  const { draft, set, dirty } = useDraft({ nom: media.nom, alt: media.alt, categorie: media.categorie });
  const [cropping, setCropping] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [ratio, setRatio] = useState(RATIOS[1]);
  const [pos, setPos] = useState({ x: 50, y: 50 });
  const replaceInput = useRef<HTMLInputElement>(null);

  const crop = async () => {
    const source = media.largeur / media.hauteur;
    const w = source > ratio.r ? ratio.r / source : 1;
    const h = source > ratio.r ? 1 : source / ratio.r;
    const zone = { x: (1 - w) * (pos.x / 100), y: (1 - h) * (pos.y / 100), w, h };
    if (await run(() => call("POST", `medias/${media.id}/recadrer`, zone), { success: "Image recadrée." })) setCropping(false);
  };

  return (
    <Card className="h-fit animate-rise overflow-hidden scroll-thin xl:sticky xl:top-[72px] xl:max-h-[calc(100dvh-88px)] xl:overflow-y-auto">
      <div className="flex items-center gap-2 px-5 pt-4">
        <h2 className="min-w-0 flex-1 truncate text-[1.2rem] font-semibold">{media.nom}</h2>
        <IconButton label="Fermer le détail" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>
      <div className="px-5 pt-3">
        <Thumb src={media.src} alt={media.alt || media.nom} className="max-h-72 w-full rounded-xl bg-olive-tint object-contain" />
        <dl className="num mt-3 grid grid-cols-3 gap-2 text-[14px]">
          {[
            ["Format d'origine", media.format],
            ["Dimensions", `${media.largeur} × ${media.hauteur}`],
            ["Taille", formatBytes(media.taille)],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-muted">{k}</dt>
              <dd className="text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <form
        className="flex flex-col gap-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => call("PATCH", `medias/${media.id}`, draft), { success: "Image enregistrée." });
        }}
      >
        <Field label="Nom du fichier" htmlFor="m-nom">
          <Input id="m-nom" maxLength={80} value={draft.nom} onChange={(e) => set("nom", e.target.value)} />
        </Field>
        <Field label="Texte alternatif" htmlFor="m-alt" help={<span className="num">{draft.alt.length} / 125. Décrit l'image pour les lecteurs d'écran.</span>}>
          <Input id="m-alt" maxLength={125} value={draft.alt} onChange={(e) => set("alt", e.target.value)} />
        </Field>
        <Field label="Classement" htmlFor="m-cat">
          <Select id="m-cat" value={draft.categorie} onChange={(e) => set("categorie", e.target.value)}>
            {Object.entries(CATS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>

        <div>
          <p className="text-[15px]">Utilisée dans</p>
          {usages.length === 0 ? (
            <p className="text-[14px] text-muted">Cette image n'est utilisée nulle part.</p>
          ) : (
            <ul className="mt-1 flex flex-col gap-1 text-[14.5px]">
              {usages.map((u, i) => (
                <li key={i} className="flex items-center gap-2">
                  <ForkKnife size={15} aria-hidden className="text-muted" />
                  <span>{u.nom}</span>
                  <span className="text-muted">
                    {u.type}, {u.champ.toLowerCase()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <input
            ref={replaceInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Remplacer l'image"
            tabIndex={-1}
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f && (await upload(f, {}, `medias/${media.id}/remplacer`))) await run(async () => undefined, { success: "Image remplacée." });
              e.target.value = "";
            }}
          />
          <Button variant="secondary" onClick={() => setCropping(true)}>
            <Crop size={18} /> Recadrer
          </Button>
          <Button variant="secondary" disabled={uploading} onClick={() => replaceInput.current?.click()}>
            {uploading ? <CircleNotch size={18} className="animate-spin" /> : <Swap size={18} />} Remplacer
          </Button>
        </div>
        <div className="flex items-center justify-between gap-2">
          <Button variant="danger" disabled={pending || usages.length > 0} onClick={() => setDeleting(true)}>
            <Trash size={18} /> Supprimer
          </Button>
          <SaveButton pending={pending} dirty={dirty && draft.nom.trim() !== ""} />
        </div>
        {usages.length > 0 ? (
          <Callout tone="warn" title="La suppression n'est pas disponible">
            Cette image est actuellement utilisée. Remplacez-la ou détachez-la d'abord pour pouvoir la supprimer.
          </Callout>
        ) : null}
      </form>

      <Modal
        open={cropping}
        onClose={() => setCropping(false)}
        title="Recadrer l'image"
        description="Le recadrage crée un nouveau fichier. Il sera visible des clients après publication."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCropping(false)}>
              Annuler
            </Button>
            <Button disabled={pending} onClick={crop}>
              {pending ? <CircleNotch size={18} className="animate-spin" /> : <Crop size={18} />} Appliquer le recadrage
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div role="group" aria-label="Format" className="flex flex-wrap gap-1.5">
            {RATIOS.map((r) => (
              <button key={r.id} type="button" aria-pressed={ratio.id === r.id} onClick={() => setRatio(r)} className={cn("press rounded-full border px-3 py-1 text-[14.5px]", ratio.id === r.id ? "border-olive bg-olive text-white" : "border-line-strong bg-white hover:bg-olive-tint")}>
                {r.label}
              </button>
            ))}
          </div>
          <div className="mx-auto w-full max-w-sm overflow-hidden rounded-xl border border-line bg-olive-tint" style={{ aspectRatio: ratio.id }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={media.src} alt="" className="size-full object-cover" style={{ objectPosition: `${pos.x}% ${pos.y}%` }} />
          </div>
          <Field label="Position horizontale" htmlFor="crop-x">
            <input id="crop-x" type="range" min={0} max={100} value={pos.x} onChange={(e) => setPos({ ...pos, x: Number(e.target.value) })} className="accent-(--color-olive)" />
          </Field>
          <Field label="Position verticale" htmlFor="crop-y">
            <input id="crop-y" type="range" min={0} max={100} value={pos.y} onChange={(e) => setPos({ ...pos, y: Number(e.target.value) })} className="accent-(--color-olive)" />
          </Field>
        </div>
      </Modal>

      <Confirm
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Supprimer cette image ?"
        danger
        confirmLabel="Supprimer"
        pending={pending}
        onConfirm={async () => {
          const ok = await run(() => call("DELETE", `medias/${media.id}`), { success: "Image supprimée." });
          setDeleting(false);
          if (ok) onClose();
        }}
      >
        « {media.nom} » sera retirée de la médiathèque.
      </Confirm>
    </Card>
  );
}

export function MediasEditor({ medias, usages }: { medias: MediaLite[]; usages: Record<string, Usage[]> }) {
  const { run } = useAction();
  const { upload, uploading } = useUpload();
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("");
  const [sort, setSort] = useState("recent");
  const [activeId, setActiveId] = useState("");
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const shown = medias
    .filter((m) => (!cat || m.categorie === cat) && `${m.nom} ${m.alt}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => (sort === "nom" ? a.nom.localeCompare(b.nom) : sort === "taille" ? b.taille - a.taille : 0));
  const active = medias.find((m) => m.id === activeId);
  const count = (c: string) => medias.filter((m) => !c || m.categorie === c).length;

  const importFiles = async (files: FileList | File[]) => {
    let ok = 0;
    for (const f of [...files].slice(0, 20)) if (await upload(f, { categorie: cat || "produits" })) ok++;
    if (ok > 0) await run(async () => undefined, { success: `${ok} image${ok > 1 ? "s importées" : " importée"}.` });
    if (input.current) input.current.value = "";
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (e.dataTransfer.files.length > 0) void importFiles(e.dataTransfer.files);
  };

  return (
    <>
      <PageHeader
        eyebrow="Médiathèque"
        title="Médiathèque"
        subtitle="Gérez vos images et visuels pour le restaurant."
        actions={
          <>
            <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp" aria-label="Importer des images" tabIndex={-1} className="hidden" onChange={(e) => e.target.files && importFiles(e.target.files)} />
            <Button size="lg" disabled={uploading} onClick={() => input.current?.click()}>
              {uploading ? <CircleNotch size={22} className="animate-spin" /> : <CloudArrowUp size={22} />} Importer des images
            </Button>
          </>
        }
      />
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn("mb-4 flex items-center gap-4 rounded-2xl border border-dashed px-5 py-4 transition-colors", over ? "border-olive bg-olive-soft" : "border-line-strong bg-white")}
      >
        <ImageIcon size={30} weight="light" className="shrink-0 text-muted" />
        <div>
          <p className="text-[16px] text-ink">Glissez-déposez des images ici</p>
          <p className="text-[14px] text-muted">JPG, PNG ou WebP. 10 Mo maximum par fichier. Le contenu de chaque fichier est vérifié.</p>
        </div>
      </div>

      <Card className="flex flex-wrap items-center gap-2 p-3">
        <label className="relative min-w-52 flex-1">
          <span className="sr-only">Rechercher un fichier</span>
          <MagnifyingGlass size={18} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <Input type="search" placeholder="Rechercher un fichier ou un texte alternatif" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-10" />
        </label>
        <div role="group" aria-label="Filtrer par classement" className="flex flex-wrap gap-1.5">
          {[["", "Tous les fichiers"], ...Object.entries(CATS)].map(([k, v]) => (
            <button key={k} type="button" aria-pressed={cat === k} onClick={() => setCat(k)} className={cn("press num rounded-full border px-3.5 py-1.5 text-[14.5px]", cat === k ? "border-olive bg-olive text-white" : "border-line bg-olive-tint hover:bg-olive-soft")}>
              {v} ({count(k)})
            </button>
          ))}
        </div>
        <Select aria-label="Trier" value={sort} onChange={(e) => setSort(e.target.value)} className="min-w-40">
          <option value="recent">Plus récents</option>
          <option value="nom">Nom</option>
          <option value="taille">Taille</option>
        </Select>
      </Card>

      <div className={cn("mt-4 grid gap-5", active && "xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]")}>
        {shown.length === 0 ? (
          <Card>
            <EmptyState icon={<ImageIcon size={24} />} title={medias.length === 0 ? "Aucune image pour le moment" : "Aucune image ne correspond"}>
              {medias.length === 0 ? "Importez les photos de vos plats : elles pourront ensuite être associées aux produits et aux catégories." : "Modifiez la recherche ou le filtre."}
            </EmptyState>
          </Card>
        ) : (
          <ul className={cn("grid h-fit grid-cols-2 gap-3 sm:grid-cols-3", active ? "lg:grid-cols-3" : "lg:grid-cols-4")}>
            {shown.map((m) => {
              const n = usages[m.id]?.length ?? 0;
              return (
                <li key={m.id}>
                  <button type="button" aria-pressed={m.id === activeId} onClick={() => setActiveId(m.id)} className={cn("press relative block w-full rounded-2xl border-2 bg-white p-1.5 text-left shadow-card", m.id === activeId ? "border-olive" : "border-transparent hover:border-line-strong")}>
                    <Thumb src={m.thumb} alt={m.alt || m.nom} className="aspect-[4/3] w-full rounded-xl" />
                    {m.id === activeId ? <CheckCircle size={26} weight="fill" className="absolute top-3 right-3 rounded-full bg-white text-olive" /> : null}
                    <span className="block px-2 pt-2 pb-1.5">
                      <span className="block truncate text-[15.5px] text-ink">{m.nom}</span>
                      <span className="num mt-0.5 flex items-center justify-between gap-2 text-[13.5px] text-muted">
                        {n} utilisation{n > 1 ? "s" : ""}
                        <Badge>{CATS[m.categorie] ?? m.categorie}</Badge>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {active ? <Detail key={active.id} media={active} usages={usages[active.id] ?? []} onClose={() => setActiveId("")} /> : null}
      </div>
    </>
  );
}
