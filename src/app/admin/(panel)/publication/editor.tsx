"use client";

import { ArrowRight, CalendarBlank, CheckCircle, CircleNotch, Eye, ListChecks, Lock, RocketLaunch, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useState } from "react";
import { useAction, useApi } from "@/components/client";
import { Badge, Button, Callout, Card, CardHeader, EmptyState, Field, Input, PageHeader, Radio, TableWrap, Td, Th, buttonClass } from "@/components/ui";
import { cn, formatDateTime } from "@/lib/format";

interface Changement {
  entite: string;
  nom: string;
  champ: string;
  avant: string;
  apres: string;
  impact: string;
}
interface Props {
  fuseau: string;
  changements: Changement[];
  premiere: boolean;
  resume: { produits: number; categories: number };
  problemes: { bloquant: boolean; message: string }[];
  sessionsOuvertes: number;
  enLigne: { numero: number; date: string; auteur: string } | null;
  programmee: { numero: number; date: string; auteur: string; changements: number } | null;
  versions: { id: string; numero: number; statut: string; date: string; auteur: string; changements: number }[];
}

/** Valeur par défaut du champ date : ce soir à 23:30, ou demain si l'heure est passée. */
function defaultSchedule(): string {
  const d = new Date();
  d.setHours(23, 30, 0, 0);
  if (d.getTime() < Date.now() + 5 * 60 * 1000) d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PublicationEditor({ fuseau, changements, premiere, resume, problemes, sessionsOuvertes, enLigne, programmee, versions }: Props) {
  const call = useApi();
  const { run, pending } = useAction();
  const [mode, setMode] = useState<"maintenant" | "programmee">("maintenant");
  const [when, setWhen] = useState(defaultSchedule);
  const tz = fuseau || undefined;
  const blocked = problemes.some((p) => p.bloquant);
  const nothing = !premiere && changements.length === 0;
  const next = (enLigne?.numero ?? 0) + 1;

  const publish = () => run(() => call("POST", "publication", mode === "maintenant" ? { mode } : { mode, date: new Date(when).toISOString() }), { success: mode === "maintenant" ? "Publication appliquée. Le menu client est à jour." : "Publication programmée." });

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
        <PageHeader eyebrow="Administration" title="Vérifier & publier" subtitle="Relisez les modifications, choisissez le moment de publication et validez pour les appliquer." />
        <div className="mb-6 rounded-2xl border border-line bg-white px-5 py-3">
          <Badge tone={nothing ? "olive" : "warn"} dot>
            {premiere ? "Jamais publié" : nothing ? "À jour" : "Brouillon"}
          </Badge>
          <p className="num mt-1 text-[14.5px] text-muted">
            {enLigne ? `Version ${enLigne.numero} en ligne depuis le ${formatDateTime(enLigne.date, tz)}` : "Aucune version en ligne"}
            {changements.length > 0 ? `, ${changements.length} modification${changements.length > 1 ? "s" : ""} en attente` : ""}
          </p>
        </div>
      </div>

      {programmee ? (
        <Callout tone="warn" className="mb-5" title={`Version ${programmee.numero} programmée pour le ${formatDateTime(programmee.date, tz)}`}>
          <span className="flex flex-wrap items-center gap-3">
            Préparée par {programmee.auteur} avec {programmee.changements} modification(s). Une nouvelle publication la remplacera.
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => call("DELETE", "publication/programmee"), { success: "Publication programmée annulée." })}>
              Annuler cette programmation
            </Button>
          </span>
        </Callout>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <Card className="p-5 sm:p-6">
            <CardHeader icon={<ListChecks size={22} />} title={premiere ? "Première publication" : `Modifications à publier (${changements.length})`} description={premiere ? "Tout le contenu actuel sera mis en ligne." : "Récapitulatif des changements depuis la dernière version publiée."} />
            {premiere ? (
              <p className="num mt-4 rounded-xl bg-olive-tint px-4 py-3 text-[16px]">
                {resume.produits} produit(s) visible(s) dans {resume.categories} catégorie(s), avec l'identité, les horaires et l'apparence du restaurant.
              </p>
            ) : changements.length === 0 ? (
              <EmptyState icon={<CheckCircle size={24} />} title="Aucune modification en attente">
                Le menu client correspond à votre configuration actuelle.
              </EmptyState>
            ) : (
              <TableWrap className="mt-4">
                <table className="w-full min-w-[680px]">
                  <thead>
                    <tr>
                      <Th>Réglage</Th>
                      <Th>Avant</Th>
                      <Th className="w-8">
                        <span className="sr-only">devient</span>
                      </Th>
                      <Th>Après</Th>
                      <Th>Impact</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {changements.map((c, i) => (
                      <tr key={i}>
                        <Td>
                          <span className="block text-ink">{c.nom}</span>
                          <span className="block text-[13.5px] text-muted">
                            {c.entite} · {c.champ}
                          </span>
                        </Td>
                        <Td className="num max-w-44 break-words text-muted">{c.avant}</Td>
                        <Td>
                          <ArrowRight size={16} aria-hidden className="text-muted" />
                        </Td>
                        <Td className="num max-w-44 break-words text-ink">{c.apres}</Td>
                        <Td className="max-w-56 text-[14px] text-muted">{c.impact}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </Card>

          <div className="grid gap-5 md:grid-cols-2">
            <Card className="bg-olive-soft/50 p-5 sm:p-6">
              <CardHeader icon={<Lock size={22} />} title="Commandes déjà envoyées" />
              <p className="mt-3 text-[15px] leading-relaxed text-muted">Les commandes déjà envoyées restent inchangées : leurs libellés et leurs prix sont figés au moment de l'envoi. La disponibilité d'un produit, elle, s'applique tout de suite, sans publication.</p>
            </Card>
            <Card className="p-5 sm:p-6">
              <h2 className="text-[1.25rem] font-semibold">Dernières versions</h2>
              {versions.length === 0 ? (
                <p className="mt-2 text-[15px] text-muted">Aucune version publiée pour le moment.</p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2 text-[15px]">
                  {versions.map((v) => (
                    <li key={v.id} className="num flex items-baseline justify-between gap-3">
                      <span className="text-ink">
                        Version {v.numero} {v.statut === "programmee" ? <Badge tone="warn">Programmée</Badge> : null}
                      </span>
                      <span className="text-right text-[13.5px] text-muted">
                        {formatDateTime(v.date, tz)}, {v.auteur}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>

        <Card className="h-fit p-5 sm:p-6 scroll-thin xl:sticky xl:top-[72px] xl:max-h-[calc(100dvh-88px)] xl:overflow-y-auto">
          <CardHeader icon={<CalendarBlank size={22} />} title="Publication" description="Choisissez quand appliquer ces modifications." />
          <fieldset className="mt-4 flex flex-col gap-2">
            <legend className="sr-only">Moment de publication</legend>
            <Radio name="mode" checked={mode === "maintenant"} onChange={() => setMode("maintenant")} className={cn("rounded-xl border px-4 py-3", mode === "maintenant" ? "border-olive bg-olive-tint" : "border-line")}>
              <span className="block text-[16px] text-ink">Maintenant</span>
              <span className="block text-[14px] text-muted">Appliquer les modifications immédiatement.</span>
            </Radio>
            <Radio name="mode" checked={mode === "programmee"} onChange={() => setMode("programmee")} className={cn("rounded-xl border px-4 py-3", mode === "programmee" ? "border-olive bg-olive-tint" : "border-line")}>
              <span className="block text-[16px] text-ink">Après le service</span>
              <span className="block text-[14px] text-muted">Programmer l'application à une heure choisie. La configuration est figée telle qu'elle est maintenant.</span>
            </Radio>
          </fieldset>
          {mode === "programmee" ? (
            <Field label="Date et heure de publication" htmlFor="pub-date" className="mt-3" help="Heure de votre appareil.">
              <Input id="pub-date" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="num" />
            </Field>
          ) : null}

          <div className="mt-5 border-t border-line pt-4">
            <h3 className="flex items-center gap-2 text-[1.05rem] font-semibold">
              <WarningCircle size={20} /> Vérifications avant publication
            </h3>
            <ul className="mt-2 flex flex-col gap-2 text-[14.5px]">
              {problemes.length === 0 ? (
                <li className="flex items-start gap-2 text-olive-deep">
                  <CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0" /> Aucun point bloquant détecté.
                </li>
              ) : null}
              {problemes.map((p) => (
                <li key={p.message} className={cn("flex items-start gap-2", p.bloquant ? "text-danger" : "text-warn")}>
                  <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0" /> {p.message}
                </li>
              ))}
              {sessionsOuvertes > 0 ? (
                <li className="flex items-start gap-2 text-muted">
                  <WarningCircle size={18} className="mt-0.5 shrink-0" /> {sessionsOuvertes} session(s) de table ouverte(s) : les changements de tables s'appliqueront aux prochaines sessions.
                </li>
              ) : null}
            </ul>
          </div>

          <Link href="/admin/apercu" className={buttonClass("outline", "lg", "mt-5 w-full justify-between")}>
            <span className="inline-flex items-center gap-2">
              <Eye size={20} /> Aperçu client avant publication
            </span>
            <ArrowRight size={18} />
          </Link>
          <Button size="lg" className="mt-2 w-full" disabled={pending || blocked || nothing} onClick={publish}>
            {pending ? <CircleNotch size={20} className="animate-spin" /> : mode === "maintenant" ? <RocketLaunch size={20} /> : <CalendarBlank size={20} />}
            {mode === "maintenant" ? `Publier la version ${next}` : "Programmer la publication"}
          </Button>
          {nothing ? <p className="mt-2 text-center text-[13.5px] text-muted">Rien à publier pour le moment.</p> : null}
        </Card>
      </div>
    </>
  );
}
