"use client";

import { useState } from "react";
import { MediaPicker } from "@/components/admin/media-picker";
import { SaveButton, Tabs, useAction, useApi, useDraft } from "@/components/client";
import { Button, Card, Field, Input, PageHeader, Select, Textarea, Wordmark } from "@/components/ui";
import type { MediaLite, Named } from "@/lib/types";

interface Restaurant {
  nom: string;
  sousTitre: string;
  description: string;
  adresse: string;
  telephone: string;
  email: string;
  devise: string;
  fuseauHoraire: string;
  languePrincipale: string;
  logoMediaId: string;
}

const ZONES = ["Europe/Paris", "Europe/Brussels", "Europe/Zurich", "Europe/Luxembourg", "Europe/London", "Europe/Madrid", "Europe/Rome", "Africa/Casablanca", "Africa/Tunis", "Africa/Algiers", "Africa/Dakar", "America/Montreal", "America/Martinique", "Indian/Reunion", "UTC"];
const DEVISE_LABEL: Record<string, string> = { EUR: "EUR - Euro", USD: "USD - Dollar américain", GBP: "GBP - Livre sterling", CHF: "CHF - Franc suisse", CAD: "CAD - Dollar canadien", MAD: "MAD - Dirham marocain", TND: "TND - Dinar tunisien", DZD: "DZD - Dinar algérien", XOF: "XOF - Franc CFA" };

export function EtablissementEditor({ restaurant, medias, devises, langues }: { restaurant: Restaurant; medias: MediaLite[]; devises: string[]; langues: Named[] }) {
  const call = useApi();
  const { run, pending, errors } = useAction();
  const { draft, set, dirty, reset } = useDraft(restaurant);
  const [tab, setTab] = useState("identite");
  const zones = ZONES.includes(draft.fuseauHoraire) ? ZONES : [draft.fuseauHoraire, ...ZONES];

  const save = () => run(() => call("PUT", "restaurant", draft), { success: "Informations du restaurant enregistrées." });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <PageHeader eyebrow="Restaurant" title="Les informations du restaurant." subtitle="Personnalisez l'identité et les paramètres généraux." photo />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <Card className="p-6">
          <Tabs label="Rubriques" value={tab} onChange={setTab} tabs={[{ id: "identite", label: "Identité" }, { id: "coordonnees", label: "Coordonnées" }]} />
          {tab === "identite" ? (
            <div className="mt-5 flex flex-col gap-4">
              <div>
                <h2 className="text-[1.35rem] font-semibold">Identité publique</h2>
                <p className="text-[15px] text-muted">Ces informations sont visibles par vos clients sur le menu.</p>
              </div>
              <Field label="Nom du restaurant" required htmlFor="nom" error={errors.nom}>
                <Input id="nom" value={draft.nom} maxLength={60} required onChange={(e) => set("nom", e.target.value)} aria-invalid={!!errors.nom} />
              </Field>
              <Field label="Sous-titre" htmlFor="sousTitre" error={errors.sousTitre}>
                <Input id="sousTitre" value={draft.sousTitre} maxLength={80} placeholder="Cuisine de saison" onChange={(e) => set("sousTitre", e.target.value)} />
              </Field>
              <Field label="Description courte" htmlFor="description" error={errors.description} help={<span className="num">{draft.description.length} / 160</span>}>
                <Textarea id="description" value={draft.description} maxLength={160} onChange={(e) => set("description", e.target.value)} />
              </Field>
            </div>
          ) : (
            <div className="mt-5 flex flex-col gap-4">
              <div>
                <h2 className="text-[1.35rem] font-semibold">Coordonnées</h2>
                <p className="text-[15px] text-muted">Affichées en bas du menu pour que vos clients vous trouvent.</p>
              </div>
              <Field label="Adresse" htmlFor="adresse" error={errors.adresse}>
                <Input id="adresse" value={draft.adresse} maxLength={200} placeholder="À renseigner" autoComplete="street-address" onChange={(e) => set("adresse", e.target.value)} />
              </Field>
              <Field label="Téléphone" htmlFor="telephone" error={errors.telephone}>
                <Input id="telephone" type="tel" value={draft.telephone} maxLength={30} placeholder="À renseigner" onChange={(e) => set("telephone", e.target.value)} aria-invalid={!!errors.telephone} />
              </Field>
              <Field label="E-mail de contact" htmlFor="email" error={errors.email}>
                <Input id="email" type="email" value={draft.email} maxLength={120} placeholder="contact@example.com" onChange={(e) => set("email", e.target.value)} aria-invalid={!!errors.email} />
              </Field>
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-5">
          <Card className="p-6">
            <h2 className="text-[1.35rem] font-semibold">Logo du restaurant</h2>
            <p className="text-[15px] text-muted">Utilisé sur le menu et les supports de table.</p>
            <div className="mt-4">
              {draft.logoMediaId ? null : (
                <div className="mb-3 grid place-items-center rounded-xl border border-line bg-olive-tint py-8">
                  <Wordmark subtitle={draft.sousTitre || undefined} />
                </div>
              )}
              <div className={draft.logoMediaId ? "mx-auto max-w-56" : ""}>
                <MediaPicker
                  medias={medias}
                  value={draft.logoMediaId}
                  onChange={(id) => set("logoMediaId", id)}
                  label={draft.logoMediaId ? "Changer le logo" : "Choisir un logo"}
                  categorie="logo"
                  aspect={draft.logoMediaId ? "aspect-square" : "hidden"}
                />
              </div>
              <p className="mt-2 text-center text-[13.5px] text-muted">JPG, PNG ou WebP. Taille recommandée : 512 × 512 px.</p>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-[1.35rem] font-semibold">Préférences</h2>
            <p className="text-[15px] text-muted">Paramètres généraux du restaurant.</p>
            <div className="mt-4 flex flex-col gap-4">
              <Field label="Devise" htmlFor="devise">
                <Select id="devise" value={draft.devise} onChange={(e) => set("devise", e.target.value)}>
                  {devises.map((d) => (
                    <option key={d} value={d}>
                      {DEVISE_LABEL[d] ?? d}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Fuseau horaire" htmlFor="fuseau" error={errors.fuseauHoraire} help="Sert à calculer les heures d'ouverture affichées.">
                <Select id="fuseau" value={draft.fuseauHoraire} onChange={(e) => set("fuseauHoraire", e.target.value)}>
                  {zones.map((z) => (
                    <option key={z} value={z}>
                      {z.replace("_", " ")}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Langue principale" htmlFor="langue">
                <Select id="langue" value={draft.languePrincipale} disabled onChange={() => undefined}>
                  {langues.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nom}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Card>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" disabled={!dirty || pending} onClick={reset}>
              Annuler
            </Button>
            <SaveButton pending={pending} dirty={dirty} size="lg" />
          </div>
        </div>
      </div>
    </form>
  );
}
