"use client";

import { ArrowDown, ArrowUp, BookOpen, CaretRight, MagnifyingGlass, PencilSimple, PlusCircle, Trash, X } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { ListEditor } from "@/components/admin/list-editor";
import { MediaPicker } from "@/components/admin/media-picker";
import { Confirm, SaveButton, Tabs, moveId, useAction, useApi } from "@/components/client";
import { Badge, Button, Callout, Card, EmptyState, Field, IconButton, Input, PageHeader, TableWrap, Td, Textarea, Th, Thumb, Toggle } from "@/components/ui";
import { cn } from "@/lib/format";
import type { MediaLite, Named } from "@/lib/types";

interface Categorie {
  id: string;
  nom: string;
  description: string;
  imageMediaId: string;
  visible: boolean;
  image: string | null;
  produits: number;
}
const VIDE = { id: "", nom: "", description: "", imageMediaId: "", visible: true };

export function CategoriesEditor({ categories, allergenes, etiquettes, motifs, medias }: { categories: Categorie[]; allergenes: Named[]; etiquettes: (Named & { couleur: string })[]; motifs: { id: string; libelle: string; couleur: string; actif: boolean }[]; medias: MediaLite[] }) {
  const call = useApi();
  const { run, pending, errors } = useAction();
  const [tab, setTab] = useState("categories");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<typeof VIDE | null>(null);
  const [deleting, setDeleting] = useState(false);

  const ids = categories.map((c) => c.id);
  const shown = categories.filter((c) => c.nom.toLowerCase().includes(query.trim().toLowerCase()));
  const editing = form?.id ? categories.find((c) => c.id === form.id) : undefined;
  const preview = medias.find((m) => m.id === form?.imageMediaId);

  const save = async () => {
    if (!form) return;
    const body = { nom: form.nom, description: form.description, imageMediaId: form.imageMediaId, visible: form.visible };
    const out = await run(() => (form.id ? call("PATCH", `categories/${form.id}`, body) : call<{ id: string }>("POST", "categories", body)), { success: form.id ? "Catégorie enregistrée." : "Catégorie ajoutée." });
    if (out) setForm(null);
  };

  return (
    <>
      <PageHeader eyebrow="Carte" title="Listes & catégories" subtitle="Organisez votre carte avec des catégories claires et attractives." />
      <Tabs
        label="Listes"
        value={tab}
        onChange={(t) => {
          setTab(t);
          setForm(null);
        }}
        tabs={[
          { id: "categories", label: "Catégories" },
          { id: "allergenes", label: "Allergènes" },
          { id: "etiquettes", label: "Étiquettes" },
          { id: "motifs", label: "Motifs de demande" },
        ]}
      />

      {tab === "categories" ? (
        <div className={cn("mt-5 grid gap-5", form && "xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]")}>
          <div>
            <div className="flex flex-wrap gap-3">
              <label className="relative min-w-56 flex-1">
                <span className="sr-only">Rechercher une catégorie</span>
                <MagnifyingGlass size={18} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
                <Input type="search" placeholder="Rechercher une catégorie" value={query} onChange={(e) => setQuery(e.target.value)} className="h-11 pl-10" />
              </label>
              <Button size="lg" className="h-11" onClick={() => setForm({ ...VIDE })}>
                <PlusCircle size={20} /> Ajouter une catégorie
              </Button>
            </div>
            <Card className="mt-4 overflow-hidden">
              {shown.length === 0 ? (
                <EmptyState icon={<BookOpen size={24} />} title={categories.length === 0 ? "Aucune catégorie pour le moment" : "Aucun résultat"}>
                  {categories.length === 0 ? "Créez une première catégorie, par exemple Entrées ou Pizzas, puis ajoutez-y vos produits." : "Aucune catégorie ne correspond à cette recherche."}
                </EmptyState>
              ) : (
                <TableWrap className="rounded-none border-0">
                  <table className="w-full min-w-[560px]">
                    <thead>
                      <tr>
                        <Th className="w-20">Ordre</Th>
                        <Th>Catégorie</Th>
                        <Th>Produits</Th>
                        <Th>Statut</Th>
                        <Th className="w-14">
                          <span className="sr-only">Actions</span>
                        </Th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((c) => {
                        const i = ids.indexOf(c.id);
                        return (
                          <tr key={c.id} className={cn("transition-colors", form?.id === c.id && "bg-olive-soft/50")}>
                            <Td>
                              <span className="flex">
                                <IconButton label={`Monter ${c.nom}`} className="size-8" disabled={i === 0 || pending || query !== ""} onClick={() => run(() => call("POST", "categories/ordre", { ids: moveId(ids, c.id, -1) }))}>
                                  <ArrowUp size={16} />
                                </IconButton>
                                <IconButton label={`Descendre ${c.nom}`} className="size-8" disabled={i === ids.length - 1 || pending || query !== ""} onClick={() => run(() => call("POST", "categories/ordre", { ids: moveId(ids, c.id, 1) }))}>
                                  <ArrowDown size={16} />
                                </IconButton>
                              </span>
                            </Td>
                            <Td>
                              <span className="flex items-center gap-3">
                                <Thumb src={c.image} alt="" className="size-12" />
                                <span className="text-[16px] text-ink">{c.nom}</span>
                              </span>
                            </Td>
                            <Td className="num text-muted">{c.produits} produit{c.produits > 1 ? "s" : ""}</Td>
                            <Td>
                              <Badge tone={c.visible ? "olive" : "neutral"} dot>
                                {c.visible ? "Visible" : "Masquée"}
                              </Badge>
                            </Td>
                            <Td>
                              <IconButton label={`Modifier ${c.nom}`} onClick={() => setForm({ id: c.id, nom: c.nom, description: c.description, imageMediaId: c.imageMediaId, visible: c.visible })}>
                                <PencilSimple size={19} />
                              </IconButton>
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TableWrap>
              )}
            </Card>
          </div>

          {form ? (
            <Card className="h-fit animate-rise p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <h2 className="flex-1 text-[1.3rem] font-semibold">{form.id ? "Modifier la catégorie" : "Nouvelle catégorie"}</h2>
                <IconButton label="Fermer" onClick={() => setForm(null)}>
                  <X size={18} />
                </IconButton>
              </div>
              <form
                className="mt-4 flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
              >
                <Field label="Nom de la catégorie" required htmlFor="cat-nom" error={errors.nom}>
                  <Input id="cat-nom" value={form.nom} maxLength={60} required autoFocus onChange={(e) => setForm({ ...form, nom: e.target.value })} />
                </Field>
                <Field label="Description" optional htmlFor="cat-desc" error={errors.description}>
                  <Textarea id="cat-desc" value={form.description} maxLength={300} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </Field>
                <Field label="Image" optional>
                  <MediaPicker medias={medias} value={form.imageMediaId} onChange={(id) => setForm({ ...form, imageMediaId: id })} label="Changer l'image" />
                </Field>
                <div className="flex items-start gap-3">
                  <Toggle label="Catégorie visible" checked={form.visible} onChange={(e) => setForm({ ...form, visible: e.target.checked })} />
                  <div>
                    <p className="text-[15px]">Catégorie visible</p>
                    <p className="text-[13.5px] text-muted">{form.visible ? "La catégorie sera affichée sur la carte client après publication." : "La catégorie et ses produits seront masqués après publication."}</p>
                  </div>
                </div>
                <div>
                  <p className="text-[15px]">Aperçu sur la carte client</p>
                  <div className="mt-1.5 flex items-center gap-3 rounded-xl border border-line bg-olive-tint px-4 py-3">
                    <Thumb src={preview?.thumb ?? null} alt="" className="size-14 rounded-full" />
                    <span className="flex-1 text-[1.15rem] font-medium text-ink">{form.nom || "Nom de la catégorie"}</span>
                    <CaretRight size={18} aria-hidden className="text-muted" />
                  </div>
                </div>
                {editing && editing.produits > 0 ? (
                  <Callout tone="warn">La suppression d'une catégorie nécessite de réaffecter d'abord tous ses produits à une autre catégorie.</Callout>
                ) : null}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {form.id ? (
                    <Button variant="danger" disabled={pending || (editing?.produits ?? 0) > 0} onClick={() => setDeleting(true)}>
                      <Trash size={18} /> Supprimer
                    </Button>
                  ) : (
                    <span />
                  )}
                  <SaveButton pending={pending} dirty={form.nom.trim() !== ""} />
                </div>
              </form>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === "allergenes" ? (
        <Card className="mt-5 p-5 sm:p-6">
          <h2 className="text-[1.3rem] font-semibold">Allergènes</h2>
          <p className="mb-4 text-[15px] text-muted">Liste proposée dans la fiche de chaque produit. Les informations d'allergènes restent à confirmer selon vos recettes.</p>
          <ListEditor path="allergenes" items={allergenes} noun="cet allergène" ordered empty="Aucun allergène." addLabel="Ajouter" blank={{ nom: "" }} fields={[{ key: "nom", label: "Nom de l'allergène", type: "text", max: 40 }]} />
        </Card>
      ) : null}

      {tab === "etiquettes" ? (
        <Card className="mt-5 p-5 sm:p-6">
          <h2 className="text-[1.3rem] font-semibold">Étiquettes</h2>
          <p className="mb-4 text-[15px] text-muted">Mettez en avant certaines caractéristiques de vos plats : végétarien, épicé, fait maison.</p>
          <ListEditor
            path="etiquettes"
            items={etiquettes}
            noun="cette étiquette"
            ordered
            empty="Aucune étiquette."
            addLabel="Ajouter"
            blank={{ nom: "", couleur: "#52683F" }}
            fields={[
              { key: "nom", label: "Nom de l'étiquette", type: "text", max: 40 },
              { key: "couleur", label: "Couleur", type: "color" },
            ]}
          />
        </Card>
      ) : null}

      {tab === "motifs" ? (
        <Card className="mt-5 p-5 sm:p-6">
          <h2 className="text-[1.3rem] font-semibold">Motifs de demande</h2>
          <p className="mb-4 text-[15px] text-muted">Motifs qui seront proposés aux clients lorsqu'ils appellent l'équipe depuis leur table.</p>
          <ListEditor
            path="motifs"
            items={motifs}
            noun="ce motif"
            ordered
            empty="Aucun motif."
            addLabel="Ajouter"
            blank={{ libelle: "", couleur: "#52683F", actif: true }}
            fields={[
              { key: "libelle", label: "Libellé du motif", type: "text", max: 40 },
              { key: "couleur", label: "Couleur", type: "color" },
              { key: "actif", label: "Motif actif", type: "bool" },
            ]}
          />
        </Card>
      ) : null}

      <Confirm
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Supprimer cette catégorie ?"
        danger
        confirmLabel="Supprimer"
        pending={pending}
        onConfirm={async () => {
          const ok = await run(() => call("DELETE", `categories/${form?.id}`), { success: "Catégorie supprimée." });
          setDeleting(false);
          if (ok) setForm(null);
        }}
      >
        « {form?.nom} » sera retirée de la carte. Cette action est enregistrée dans l'historique.
      </Confirm>
    </>
  );
}
