"use client";

import { ChefHat, Eye, EyeSlash, GearSix, MagnifyingGlass, PencilSimple, PlusCircle, Prohibit, Trash } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ActionMenu, Confirm, useAction, useApi } from "@/components/client";
import { Badge, Button, Card, Checkbox, EmptyState, Field, Input, PageHeader, Select, TableWrap, Td, Th, Thumb, buttonClass } from "@/components/ui";
import { cn, formatMoney } from "@/lib/format";
import type { Named } from "@/lib/types";

interface Produit {
  id: string;
  nom: string;
  description: string;
  categorieId: string;
  prixCentimes: number;
  disponible: boolean;
  visible: boolean;
  options: number;
  thumb: string | null;
  image: string | null;
}

export function ProduitsList({ produits, categories, devise }: { produits: Produit[]; categories: Named[]; devise: string }) {
  const call = useApi();
  const { run, pending } = useAction();
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("");
  const [statut, setStatut] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [activeId, setActiveId] = useState(produits[0]?.id ?? "");
  const [target, setTarget] = useState("");
  const [deleting, setDeleting] = useState<string[] | null>(null);

  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.nom])), [categories]);
  const shown = produits.filter((p) => {
    if (cat && p.categorieId !== cat) return false;
    if (statut === "disponible" && !p.disponible) return false;
    if (statut === "indisponible" && p.disponible) return false;
    if (statut === "masque" && p.visible) return false;
    return p.nom.toLowerCase().includes(query.trim().toLowerCase());
  });
  // Le panneau de droite suit la sélection, ou à défaut le premier produit affiché par les filtres.
  const active = shown.find((p) => p.id === activeId) ?? shown[0];
  const picked = selected.filter((id) => produits.some((p) => p.id === id));
  const allShown = shown.length > 0 && shown.every((p) => picked.includes(p.id));

  const lot = async (ids: string[], action: string, extra: Record<string, string> = {}, success = "Produits mis à jour.") => {
    if (await run(() => call("POST", "produits/lot", { ids, action, ...extra }), { success })) setSelected([]);
  };
  const patch = (id: string, body: Record<string, unknown>) => run(() => call("PATCH", `produits/${id}`, body), { success: "Produit mis à jour." });

  return (
    <>
      <PageHeader eyebrow="Carte" title="Catalogue des produits" subtitle="Gérez les produits de votre carte, leurs informations et leur disponibilité." />
      <div className="flex flex-wrap gap-3">
        <label className="relative min-w-56 flex-[2]">
          <span className="sr-only">Rechercher un produit</span>
          <MagnifyingGlass size={18} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <Input type="search" placeholder="Rechercher un produit" value={query} onChange={(e) => setQuery(e.target.value)} className="h-11 pl-10" />
        </label>
        <Select aria-label="Filtrer par catégorie" value={cat} onChange={(e) => setCat(e.target.value)} className="min-w-48 flex-1 [&>select]:h-11">
          <option value="">Toutes les catégories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </Select>
        <Select aria-label="Filtrer par statut" value={statut} onChange={(e) => setStatut(e.target.value)} className="min-w-44 flex-1 [&>select]:h-11">
          <option value="">Tous les statuts</option>
          <option value="disponible">Disponibles</option>
          <option value="indisponible">Indisponibles</option>
          <option value="masque">Masqués</option>
        </Select>
        <Link href="/admin/produits/nouveau" className={buttonClass("primary", "lg", "h-11")}>
          <PlusCircle size={20} /> Ajouter un produit
        </Link>
      </div>

      <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <p className="num px-5 pt-4 pb-2 text-[16px]">
            {shown.length} produit{shown.length > 1 ? "s" : ""}
          </p>
          {shown.length === 0 ? (
            <EmptyState icon={<ChefHat size={24} />} title={produits.length === 0 ? "Votre carte est vide" : "Aucun produit ne correspond"}>
              {produits.length === 0 ? "Ajoutez un premier produit avec son prix et sa photo. Il apparaîtra sur le menu après publication." : "Modifiez la recherche ou les filtres."}
            </EmptyState>
          ) : (
            <TableWrap className="rounded-none border-0 border-t">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr>
                    <Th className="w-10">
                      <Checkbox aria-label="Tout sélectionner" checked={allShown} onChange={(e) => setSelected(e.target.checked ? shown.map((p) => p.id) : [])} />
                    </Th>
                    <Th>Produit</Th>
                    <Th>Catégorie</Th>
                    <Th>Prix</Th>
                    <Th>Disponibilité</Th>
                    <Th>Visibilité</Th>
                    <Th className="w-24">
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p) => (
                    <tr key={p.id} onClick={() => setActiveId(p.id)} className={cn("cursor-pointer transition-colors hover:bg-olive-tint", active?.id === p.id && "bg-olive-soft/60")}>
                      <Td onClick={(e) => e.stopPropagation()}>
                        <Checkbox aria-label={`Sélectionner ${p.nom}`} checked={picked.includes(p.id)} onChange={(e) => setSelected(e.target.checked ? [...picked, p.id] : picked.filter((x) => x !== p.id))} />
                      </Td>
                      <Td>
                        <span className="flex items-center gap-3">
                          <Thumb src={p.thumb} alt="" className="size-14" />
                          <span className="text-[16px] text-ink">{p.nom}</span>
                        </span>
                      </Td>
                      <Td className="text-muted">{catName.get(p.categorieId)}</Td>
                      <Td className="num whitespace-nowrap">{formatMoney(p.prixCentimes, devise)}</Td>
                      <Td>
                        <Badge tone={p.disponible ? "olive" : "danger"} dot>
                          {p.disponible ? "Disponible" : "Indisponible"}
                        </Badge>
                      </Td>
                      <Td>
                        <Badge tone={p.visible ? "olive" : "neutral"}>
                          {p.visible ? <Eye size={15} /> : <EyeSlash size={15} />}
                          {p.visible ? "Visible" : "Masqué"}
                        </Badge>
                      </Td>
                      <Td onClick={(e) => e.stopPropagation()}>
                        <span className="flex items-center justify-end gap-1">
                          <Link href={`/admin/produits/${p.id}`} aria-label={`Modifier ${p.nom}`} className="press inline-grid size-9 place-items-center rounded-[10px] hover:bg-olive-soft">
                            <PencilSimple size={19} />
                          </Link>
                          <ActionMenu
                            label={`Actions pour ${p.nom}`}
                            items={[
                              { label: p.disponible ? "Marquer indisponible" : "Marquer disponible", icon: <Prohibit size={17} />, onSelect: () => patch(p.id, { disponible: !p.disponible }) },
                              { label: p.visible ? "Masquer" : "Afficher", icon: p.visible ? <EyeSlash size={17} /> : <Eye size={17} />, onSelect: () => patch(p.id, { visible: !p.visible }) },
                              { label: "Supprimer", icon: <Trash size={17} />, danger: true, onSelect: () => setDeleting([p.id]) },
                            ]}
                          />
                        </span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
          {picked.length > 0 ? (
            <div className="flex animate-rise flex-wrap items-center gap-3 border-t border-line bg-olive-tint px-5 py-3">
              <span className="num text-[15px]">
                {picked.length} produit{picked.length > 1 ? "s" : ""} sélectionné{picked.length > 1 ? "s" : ""}
              </span>
              <Select aria-label="Nouvelle catégorie" value={target} onChange={(e) => setTarget(e.target.value)} className="min-w-44">
                <option value="">Modifier la catégorie</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </Select>
              <Button variant="secondary" disabled={!target || pending} onClick={() => lot(picked, "categorie", { categorieId: target }, "Catégorie modifiée.")}>
                Appliquer
              </Button>
              <Button variant="secondary" disabled={pending} onClick={() => lot(picked, "masquer", {}, "Produits masqués.")}>
                <EyeSlash size={18} /> Masquer
              </Button>
              <Button variant="danger" className="ml-auto" disabled={pending} onClick={() => setDeleting(picked)}>
                <Trash size={18} /> Supprimer
              </Button>
            </div>
          ) : null}
        </Card>

        {active ? (
          <Card className="h-fit overflow-hidden scroll-thin xl:sticky xl:top-[72px] xl:max-h-[calc(100dvh-88px)] xl:overflow-y-auto">
            <Thumb src={active.image} alt={active.nom} className="aspect-[16/10] w-full rounded-none" />
            <div className="flex flex-col gap-4 p-5">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-[1.4rem] leading-tight font-semibold">{active.nom}</h2>
                  <Badge tone={active.disponible ? "olive" : "danger"} dot>
                    {active.disponible ? "Disponible" : "Indisponible"}
                  </Badge>
                </div>
                <p className="text-[15px] text-muted">{catName.get(active.categorieId)}</p>
                <p className="num mt-1 text-[1.3rem] text-ink">{formatMoney(active.prixCentimes, devise)}</p>
              </div>
              {active.description ? <p className="border-t border-line pt-3 text-[15px] leading-relaxed text-muted">{active.description}</p> : null}
              <div className="grid grid-cols-2 gap-3 border-t border-line pt-3">
                <Field label="Disponibilité" htmlFor="q-dispo" help="Effet immédiat sur le menu.">
                  <Select id="q-dispo" disabled={pending} value={active.disponible ? "1" : "0"} onChange={(e) => patch(active.id, { disponible: e.target.value === "1" })}>
                    <option value="1">Disponible</option>
                    <option value="0">Indisponible</option>
                  </Select>
                </Field>
                <Field label="Visibilité" htmlFor="q-visible" help="Appliquée à la publication.">
                  <Select id="q-visible" disabled={pending} value={active.visible ? "1" : "0"} onChange={(e) => patch(active.id, { visible: e.target.value === "1" })}>
                    <option value="1">Visible</option>
                    <option value="0">Masqué</option>
                  </Select>
                </Field>
              </div>
              <div className="border-t border-line pt-3">
                <p className="text-[15px]">Options et variantes</p>
                <p className="text-[14px] text-muted">{active.options > 0 ? `${active.options} groupe(s) d'options configuré(s).` : "Aucune option configurée pour ce produit."}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link href={`/admin/produits/${active.id}`} className={buttonClass("outline", "sm")}>
                    <PencilSimple size={16} /> Modifier la fiche
                  </Link>
                  <Link href="/admin/options" className={buttonClass("secondary", "sm")}>
                    <GearSix size={16} /> Gérer les options
                  </Link>
                </div>
              </div>
            </div>
          </Card>
        ) : null}
      </div>

      <Confirm
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={deleting && deleting.length > 1 ? `Supprimer ${deleting.length} produits ?` : "Supprimer ce produit ?"}
        danger
        confirmLabel="Supprimer"
        pending={pending}
        onConfirm={async () => {
          if (deleting) await lot(deleting, "supprimer", {}, "Suppression effectuée.");
          setDeleting(null);
        }}
      >
        Les commandes déjà envoyées conservent leurs lignes. Le produit disparaîtra du menu client à la prochaine publication.
      </Confirm>
    </>
  );
}
