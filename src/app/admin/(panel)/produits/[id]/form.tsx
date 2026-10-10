"use client";

import { Eye, FileText, GearSix, Image as ImageIcon, SlidersHorizontal, Tag, Trash } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChipSelect } from "@/components/admin/list-editor";
import { MediaPicker } from "@/components/admin/media-picker";
import { Confirm, MoneyInput, SaveButton, useAction, useApi, useDraft } from "@/components/client";
import { Badge, Button, Callout, Card, CardHeader, Field, Input, PageHeader, Select, Textarea, Thumb, buttonClass } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import type { MediaLite, Named } from "@/lib/types";

interface Produit {
  nom: string;
  description: string;
  categorieId: string;
  prixCentimes: number;
  imageMediaId: string;
  allergeneIds: string[];
  etiquetteIds: string[];
  groupeOptionIds: string[];
  tempsPreparationMin: number | null;
  disponible: boolean;
  visible: boolean;
}

export function ProduitForm({ id, initial, devise, categories, allergenes, etiquettes, groupes, medias }: { id: string; initial: Produit; devise: string; categories: Named[]; allergenes: Named[]; etiquettes: Named[]; groupes: Named[]; medias: MediaLite[] }) {
  const call = useApi();
  const router = useRouter();
  const { run, pending, errors } = useAction();
  const { draft, set, dirty } = useDraft(initial);
  const [priceOk, setPriceOk] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const image = medias.find((m) => m.id === draft.imageMediaId);
  const symbol = formatMoney(0, devise).replace(/[\d\s.,]/g, "") || devise;

  const save = async () => {
    const out = await run(() => (id ? call("PATCH", `produits/${id}`, draft) : call<{ id: string }>("POST", "produits", draft)), { success: id ? "Produit enregistré." : "Produit ajouté.", refresh: !!id });
    if (out && !id) {
      router.push(`/admin/produits/${(out as { id: string }).id}`);
      // Le bandeau (compteur de modifications à publier) appartient au layout : il est rechargé lui aussi.
      router.refresh();
    }
  };

  if (categories.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Produit" title="Nouveau produit" subtitle="Un produit appartient toujours à une catégorie." />
        <Callout tone="warn" title="Créez d'abord une catégorie">
          <Link href="/admin/categories" className="underline underline-offset-4">
            Ouvrir les listes et catégories
          </Link>
        </Callout>
      </>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <PageHeader eyebrow="Produit" title={id ? initial.nom : "Nouveau produit"} subtitle="Modifiez les informations, le prix, la photo et la configuration de ce produit." />
      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card className="flex flex-col gap-4 p-5 sm:p-6">
          <CardHeader icon={<FileText size={22} />} title="Identité du produit" />
          <Field label="Nom du produit" required htmlFor="nom" error={errors.nom}>
            <Input id="nom" required maxLength={80} value={draft.nom} onChange={(e) => set("nom", e.target.value)} aria-invalid={!!errors.nom} />
          </Field>
          <Field label="Description" htmlFor="description" error={errors.description} help={<span className="num">{draft.description.length} / 500</span>}>
            <Textarea id="description" maxLength={500} value={draft.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <Field label="Catégorie" required htmlFor="categorie" error={errors.categorieId}>
            <Select id="categorie" value={draft.categorieId} onChange={(e) => set("categorieId", e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </Select>
          </Field>
        </Card>

        <Card className="flex flex-col gap-4 p-5 sm:p-6">
          <CardHeader icon={<ImageIcon size={22} />} title="Photo du produit" />
          <MediaPicker medias={medias} value={draft.imageMediaId} onChange={(v) => set("imageMediaId", v)} label={draft.imageMediaId ? "Remplacer" : "Choisir une photo"} aspect="aspect-[16/10]" />
          <p className="text-[14px] text-muted">
            {image ? `Texte alternatif : ${image.alt || "non renseigné"}. ` : ""}
            Le recadrage et le texte alternatif se règlent dans la{" "}
            <Link href="/admin/medias" className="text-olive-deep underline underline-offset-4">
              médiathèque
            </Link>
            .
          </p>
        </Card>

        <Card className="h-fit bg-olive-soft/50 p-5 sm:p-6 lg:col-span-2 xl:col-span-1">
          <CardHeader icon={<Eye size={22} />} title="Aperçu client" />
          <div className="mt-4 overflow-hidden rounded-xl border border-line bg-white">
            <Thumb src={image?.src ?? null} alt="" className="aspect-[4/3] w-full rounded-none" />
            <div className="p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[1.25rem] font-semibold text-ink">{draft.nom || "Nom du produit"}</p>
                <p className="num text-[1.15rem] whitespace-nowrap text-ink">{formatMoney(draft.prixCentimes, devise)}</p>
              </div>
              <p className="mt-1 text-[15px] text-muted">{draft.description}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge>{categories.find((c) => c.id === draft.categorieId)?.nom}</Badge>
                {!draft.disponible ? <Badge tone="danger">Indisponible</Badge> : null}
                {!draft.visible ? <Badge tone="warn">Masqué</Badge> : null}
              </div>
            </div>
          </div>
        </Card>

        <Card className="flex flex-col gap-4 p-5 sm:p-6">
          <CardHeader icon={<Tag size={22} />} title="Prix" />
          <Field label="Prix de vente" required htmlFor="prix" error={!priceOk ? "Montant invalide. Exemple : 18,50" : errors.prixCentimes} help={`Devise du restaurant : ${devise}`}>
            <MoneyInput
              id="prix"
              cents={draft.prixCentimes}
              devise={symbol}
              invalid={!priceOk}
              onChange={(v) => {
                setPriceOk(v !== null);
                if (v !== null) set("prixCentimes", v);
              }}
            />
          </Field>
          <Callout tone="neutral">Les prix des commandes déjà passées restent fixes et ne sont pas modifiés par cette mise à jour.</Callout>
        </Card>

        <Card className="flex flex-col gap-4 p-5 sm:p-6">
          <CardHeader icon={<GearSix size={22} />} title="Configuration" />
          <Field label="Allergènes à vérifier" help="À confirmer selon votre recette.">
            <ChipSelect label="Allergènes" options={allergenes} value={draft.allergeneIds} onChange={(v) => set("allergeneIds", v)} />
          </Field>
          <Field label="Étiquettes">
            <ChipSelect label="Étiquettes" options={etiquettes} value={draft.etiquetteIds} onChange={(v) => set("etiquetteIds", v)} empty="Aucune étiquette. Créez-en dans Listes et catégories." />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Temps indicatif" htmlFor="temps" help="En minutes">
              <Input id="temps" type="number" min={0} max={240} value={draft.tempsPreparationMin ?? ""} onChange={(e) => set("tempsPreparationMin", e.target.value === "" ? null : Math.max(0, Math.min(240, Math.round(Number(e.target.value)))))} className="num" />
            </Field>
            <Field label="Disponibilité" htmlFor="dispo">
              <Select id="dispo" value={draft.disponible ? "1" : "0"} onChange={(e) => set("disponible", e.target.value === "1")}>
                <option value="1">Disponible</option>
                <option value="0">Indisponible</option>
              </Select>
            </Field>
            <Field label="Visibilité" htmlFor="visible">
              <Select id="visible" value={draft.visible ? "1" : "0"} onChange={(e) => set("visible", e.target.value === "1")}>
                <option value="1">Visible</option>
                <option value="0">Masqué</option>
              </Select>
            </Field>
          </div>
        </Card>

        <Card className="flex flex-col gap-4 p-5 sm:p-6 lg:col-span-2 xl:col-span-1">
          <CardHeader icon={<SlidersHorizontal size={22} />} title="Options & variantes" />
          <Field label="Groupes d'options" help="Suppléments ou choix proposés avec ce produit.">
            <ChipSelect label="Groupes d'options" options={groupes} value={draft.groupeOptionIds} onChange={(v) => set("groupeOptionIds", v)} empty="Aucun groupe d'options créé." />
          </Field>
          <Link href="/admin/options" className={buttonClass("secondary", "sm", "w-fit")}>
            Gérer les groupes d'options
          </Link>
        </Card>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Link href="/admin/produits" className={buttonClass("secondary", "lg")}>
          Annuler
        </Link>
        <SaveButton pending={pending} dirty={dirty && priceOk && draft.nom.trim() !== ""} size="lg" />
        {id ? (
          <Button variant="danger" size="lg" className="ml-auto" disabled={pending} onClick={() => setDeleting(true)}>
            <Trash size={19} /> Supprimer
          </Button>
        ) : null}
      </div>

      <Confirm
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Supprimer ce produit ?"
        danger
        confirmLabel="Supprimer"
        pending={pending}
        onConfirm={async () => {
          const ok = await run(() => call("DELETE", `produits/${id}`), { success: "Produit supprimé.", refresh: false });
          setDeleting(false);
          if (ok) {
            router.push("/admin/produits");
            router.refresh();
          }
        }}
      >
        « {initial.nom} » disparaîtra du menu client à la prochaine publication. Les commandes déjà envoyées ne changent pas.
      </Confirm>
    </form>
  );
}
