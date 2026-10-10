"use client";

import { Eye, Plus, Trash, Translate } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useState } from "react";
import { MediaPicker } from "@/components/admin/media-picker";
import { Modal, SaveButton, useAction, useApi, useDraft } from "@/components/client";
import { Badge, Button, Callout, Card, Field, IconButton, Input, PageHeader, Select, Thumb, buttonClass } from "@/components/ui";
import { contrast, formatMoney } from "@/lib/format";
import type { MediaLite, Named } from "@/lib/types";

interface Apparence {
  couleurFond: string;
  couleurPrimaire: string;
  couleurTexte: string;
  couleurBordures: string;
  banniereMediaId: string;
  titreAccueil: string;
  texteBanniere: string;
}
interface Langue extends Named {
  principale: boolean;
}
interface Texte {
  cle: string;
  label: string;
  source: string;
}
interface Apercu {
  nom: string;
  sousTitre: string;
  devise: string;
  categories: string[];
  produit: { nom: string; description: string; prixCentimes: number; image: string | null } | null;
}

const COULEURS: { key: keyof Apparence; label: string }[] = [
  { key: "couleurFond", label: "Fond" },
  { key: "couleurPrimaire", label: "Primaire" },
  { key: "couleurTexte", label: "Texte" },
  { key: "couleurBordures", label: "Bordures" },
];
const isHex = (s: string) => /^#[0-9a-fA-F]{6}$/.test(s);

export function ApparenceEditor({ apparence, medias, langues, disponibles, textes, traductions, apercu }: { apparence: Apparence; medias: MediaLite[]; langues: Langue[]; disponibles: Named[]; textes: Texte[]; traductions: { langue: string; cle: string; valeur: string }[]; apercu: Apercu }) {
  const call = useApi();
  const { run, pending, errors } = useAction();
  const { draft, set, dirty } = useDraft(apparence);
  const [adding, setAdding] = useState("");
  const [translating, setTranslating] = useState<Langue | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  const valid = COULEURS.every((c) => isHex(draft[c.key]));
  const lowText = valid && contrast(draft.couleurTexte, draft.couleurFond) < 4.5;
  const lowPrimary = valid && contrast("#FFFFFF", draft.couleurPrimaire) < 4.5;
  const banner = medias.find((m) => m.id === draft.banniereMediaId);
  const remaining = disponibles.filter((d) => !langues.some((l) => l.id === d.id));

  const openTranslations = (l: Langue) => {
    setValues(Object.fromEntries(traductions.filter((t) => t.langue === l.id).map((t) => [t.cle, t.valeur])));
    setTranslating(l);
  };
  const saveTranslations = async () => {
    if (!translating) return;
    const payload = Object.fromEntries(textes.map((t) => [t.cle, values[t.cle] ?? ""]));
    const ok = await run(() => call("PUT", `traductions/${translating.id}`, { textes: payload }), { success: "Traductions enregistrées." });
    if (ok) setTranslating(null);
  };

  return (
    <>
      <PageHeader
        eyebrow="Apparence"
        title="Une expérience qui vous ressemble."
        subtitle="Personnalisez l'apparence du menu et l'expérience de vos clients."
        actions={
          <>
            <Link href="/admin/apercu" className={buttonClass("outline", "lg")}>
              <Eye size={20} /> Prévisualiser
            </Link>
            <SaveButton pending={pending} dirty={dirty && valid} size="lg" onClick={() => run(() => call("PUT", "apparence", draft), { success: "Apparence enregistrée." })} />
          </>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <Card className="p-6">
            <h2 className="text-[1.3rem] font-semibold">Thème</h2>
            <p className="text-[15px] text-muted">Un seul thème, clair, pour toute l'application.</p>
            <div className="mt-3 flex items-center gap-5 rounded-xl border border-olive/60 p-4">
              <div aria-hidden className="grid h-20 w-40 shrink-0 grid-cols-[1fr_2fr] gap-2 rounded-lg p-2" style={{ background: draft.couleurFond, border: `1px solid ${draft.couleurBordures}` }}>
                <span className="rounded bg-white" />
                <span className="flex flex-col gap-1.5">
                  <span className="h-3 rounded" style={{ background: draft.couleurPrimaire }} />
                  <span className="h-2 w-3/4 rounded bg-white" />
                  <span className="h-2 w-1/2 rounded bg-white" />
                </span>
              </div>
              <div>
                <p className="text-[1.15rem] font-semibold text-ink">Oliva · Clair</p>
                <p className="text-[15px] text-muted">Une interface lumineuse, élégante et naturelle.</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-[1.3rem] font-semibold">Couleurs</h2>
            <p className="text-[15px] text-muted">Personnalisez les couleurs de votre menu.</p>
            <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
              {COULEURS.map((c) => (
                <Field key={c.key} label={c.label} htmlFor={c.key} error={errors[c.key] ?? (!isHex(draft[c.key]) ? "Format #RRGGBB attendu." : undefined)}>
                  <label className="block h-14 cursor-pointer overflow-hidden rounded-lg border border-line" style={{ background: isHex(draft[c.key]) ? draft[c.key] : "#fff" }}>
                    <input type="color" aria-label={`${c.label}, sélecteur`} value={isHex(draft[c.key]) ? draft[c.key] : "#ffffff"} onChange={(e) => set(c.key, e.target.value.toUpperCase())} className="size-full cursor-pointer opacity-0" />
                  </label>
                  <Input id={c.key} value={draft[c.key]} maxLength={7} spellCheck={false} onChange={(e) => set(c.key, e.target.value.toUpperCase())} className="font-sans text-[14px] uppercase" />
                </Field>
              ))}
            </div>
            {lowText ? (
              <Callout tone="warn" className="mt-4">
                Le texte est peu lisible sur ce fond. Choisissez des couleurs plus contrastées pour vos clients.
              </Callout>
            ) : null}
            {lowPrimary ? (
              <Callout tone="warn" className="mt-4">
                La couleur primaire est trop claire pour porter un texte blanc sur les boutons.
              </Callout>
            ) : null}
          </Card>

          <Card className="p-6">
            <h2 className="text-[1.3rem] font-semibold">Visuels du menu</h2>
            <p className="text-[15px] text-muted">Choisissez l'image de bannière et le message d'accueil.</p>
            <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <MediaPicker medias={medias} value={draft.banniereMediaId} onChange={(id) => set("banniereMediaId", id)} categorie="restaurant" aspect="aspect-[16/9]" />
              <div className="flex flex-col gap-4">
                <Field label="Titre d'accueil" htmlFor="titre" help={<span className="num">{draft.titreAccueil.length} / 80</span>}>
                  <Input id="titre" maxLength={80} value={draft.titreAccueil} onChange={(e) => set("titreAccueil", e.target.value)} />
                </Field>
                <Field label="Texte de la bannière" htmlFor="texte" help={<span className="num">{draft.texteBanniere.length} / 120</span>}>
                  <Input id="texte" maxLength={120} value={draft.texteBanniere} onChange={(e) => set("texteBanniere", e.target.value)} />
                </Field>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-[1.3rem] font-semibold">Langues du menu</h2>
            <p className="text-[15px] text-muted">Vos clients choisissent leur langue en haut du menu.</p>
            <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
              {langues.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="eyebrow w-8 text-ink">{l.id}</span>
                  <span className="flex-1 text-[16px]">{l.nom}</span>
                  {l.principale ? (
                    <Badge tone="olive">Langue principale</Badge>
                  ) : (
                    <>
                      <Button variant="secondary" size="sm" onClick={() => openTranslations(l)}>
                        <Translate size={17} /> Textes à traduire
                      </Button>
                      <IconButton label={`Retirer ${l.nom}`} disabled={pending} onClick={() => run(() => call("DELETE", `langues/${l.id}`), { success: "Langue retirée." })}>
                        <Trash size={18} />
                      </IconButton>
                    </>
                  )}
                </li>
              ))}
            </ul>
            {remaining.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <Field label="Ajouter une langue" htmlFor="langue" className="min-w-52 flex-1">
                  <Select id="langue" value={adding} onChange={(e) => setAdding(e.target.value)}>
                    <option value="">Choisir</option>
                    {remaining.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nom}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button
                  variant="secondary"
                  disabled={!adding || pending}
                  onClick={async () => {
                    if (await run(() => call("POST", "langues", { code: adding }), { success: "Langue ajoutée." })) setAdding("");
                  }}
                >
                  <Plus size={18} /> Ajouter
                </Button>
              </div>
            ) : null}
          </Card>
        </div>

        <Card className="h-fit p-6 scroll-thin xl:sticky xl:top-[72px] xl:max-h-[calc(100dvh-88px)] xl:overflow-y-auto">
          <h2 className="text-[1.3rem] font-semibold">Aperçu du menu client</h2>
          <p className="text-[15px] text-muted">Rendu avec vos réglages en cours, avant enregistrement.</p>
          <div className="mx-auto mt-5 w-[min(100%,300px)] rounded-[2.4rem] border-[9px] border-ink bg-ink shadow-pop">
            <div className="overflow-hidden rounded-[1.8rem]" style={{ background: draft.couleurFond, color: draft.couleurTexte }}>
              <div className="flex items-center justify-between px-4 pt-4 pb-3">
                <span className="text-[1.5rem] leading-none font-medium tracking-tight">{apercu.nom.toLowerCase()}.</span>
                <span className="text-[12px] opacity-70">{apercu.sousTitre}</span>
              </div>
              <div className="relative grid h-36 items-end bg-cover bg-center" style={{ backgroundImage: banner ? `url(${banner.thumb})` : undefined, backgroundColor: draft.couleurPrimaire }}>
                <div className="bg-gradient-to-t from-black/70 to-transparent px-4 pt-8 pb-3 text-white">
                  <p className="text-[1.3rem] leading-tight font-semibold">{draft.titreAccueil || apercu.nom}</p>
                  <p className="text-[12.5px] opacity-90">{draft.texteBanniere}</p>
                </div>
              </div>
              <div className="flex gap-1.5 overflow-hidden px-4 py-3">
                {apercu.categories.map((c, i) => (
                  <span key={c} className="shrink-0 rounded-full px-3 py-1 text-[12.5px]" style={i === 0 ? { background: draft.couleurPrimaire, color: "#fff" } : { border: `1px solid ${draft.couleurBordures}`, background: "#fff" }}>
                    {c}
                  </span>
                ))}
              </div>
              {apercu.produit ? (
                <div className="mx-4 mb-5 overflow-hidden rounded-xl bg-white" style={{ border: `1px solid ${draft.couleurBordures}` }}>
                  <Thumb src={apercu.produit.image} alt="" className="h-28 w-full rounded-none" />
                  <div className="p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[15px] font-semibold">{apercu.produit.nom}</span>
                      <span className="num text-[14px]">{formatMoney(apercu.produit.prixCentimes, apercu.devise)}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[12.5px] opacity-75">{apercu.produit.description}</p>
                  </div>
                </div>
              ) : (
                <p className="px-4 pb-6 text-[13px] opacity-70">Ajoutez un produit avec photo pour compléter cet aperçu.</p>
              )}
            </div>
          </div>
        </Card>
      </div>

      <Modal
        open={!!translating}
        onClose={() => setTranslating(null)}
        title={`Textes à traduire : ${translating?.nom ?? ""}`}
        description="Un texte laissé vide s'affiche dans la langue principale."
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setTranslating(null)}>
              Annuler
            </Button>
            <Button disabled={pending} onClick={saveTranslations}>
              Enregistrer les traductions
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {textes.map((t) => (
            <Field key={t.cle} label={t.label} htmlFor={t.cle} help={t.source}>
              <Input id={t.cle} maxLength={500} value={values[t.cle] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [t.cle]: e.target.value }))} />
            </Field>
          ))}
        </div>
      </Modal>
    </>
  );
}
