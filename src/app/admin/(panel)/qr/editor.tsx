"use client";

import { ArrowsClockwise, Clock, Image as ImageIcon, Info, Lock, Printer, QrCode, SignOut, Users } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Confirm, SaveButton, Tabs, useAction, useApi, useDraft } from "@/components/client";
import { Badge, Button, Callout, Card, EmptyState, Field, Input, PageHeader, Radio, Select, TableWrap, Td, Th, Thumb, Wordmark, buttonClass } from "@/components/ui";
import { cn, relativeTime } from "@/lib/format";

interface Session {
  id: string;
  code: string;
  ouverteLe: string;
  participants: number;
}
interface Table {
  id: string;
  nom: string;
  zone: string;
  capacite: number;
  active: boolean;
  session: Session | null;
}
interface Regles {
  politique: string;
  validiteCode: string;
  wifi: string;
}
const POLITIQUES = [
  { id: "code_session", titre: "Code de session", texte: "Le client doit saisir le code actuel communiqué par le personnel." },
  { id: "validation_personnel", titre: "Validation par le personnel", texte: "Le personnel valide manuellement l'accès de chaque client." },
  { id: "acces_direct", titre: "Accès direct (moins restrictif)", texte: "Le client rejoint la session ouverte dès la lecture du QR code." },
];

export function QrSupport({ nom, svg, marque }: { nom: string; svg: string; marque: { nom: string; sousTitre: string; logo: string | null } }) {
  return (
    <div className="mx-auto flex w-full max-w-[250px] flex-col items-center rounded-2xl border border-line bg-white px-6 py-7 text-center shadow-card">
      {marque.logo ? <Thumb src={marque.logo} alt={marque.nom} className="h-14 w-auto max-w-36 rounded-none object-contain" /> : <Wordmark subtitle={marque.sousTitre} />}
      <span aria-hidden className="my-4 h-px w-16 bg-line-strong" />
      <p className="text-[1.5rem] leading-none font-semibold text-ink">{nom}</p>
      <div aria-label={`QR code de ${nom}`} role="img" className="mt-4 w-full [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="mt-3 text-[14px] leading-snug text-text">Scannez pour consulter notre carte</p>
    </div>
  );
}

export function QrEditor({ tables, selection, regles, marque, baseLocale, base, peutGererSessions }: { tables: Table[]; selection: { id: string; nom: string; url: string; svg: string } | null; regles: Regles; marque: { nom: string; sousTitre: string; logo: string | null }; baseLocale: boolean; base: string; peutGererSessions: boolean }) {
  const call = useApi();
  const router = useRouter();
  const { run, pending } = useAction();
  const { draft, set, dirty } = useDraft(regles);
  const [tab, setTab] = useState("acces");
  const [closing, setClosing] = useState<Table | null>(null);
  const current = tables.find((t) => t.id === selection?.id);

  if (tables.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Administration" title="QR codes & sessions" subtitle="Configurez l'accès des clients par table et gérez les sessions." />
        <Card>
          <EmptyState icon={<QrCode size={24} />} title="Aucune table à équiper" action={<Link href="/admin/tables" className={buttonClass("primary")}>Ouvrir Zones et tables</Link>}>
            Créez vos tables pour générer leurs QR codes.
          </EmptyState>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader eyebrow="Administration" title="QR codes & sessions" subtitle="Configurez l'accès des clients par table et gérez les sessions." actions={<SaveButton pending={pending} dirty={dirty} size="lg" onClick={() => run(() => call("PUT", "acces-table", draft), { success: "Règles d'accès enregistrées." })} />} />

      <Card className="flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-3.5">
        <Field label="Table sélectionnée" htmlFor="qr-table" className="min-w-52 flex-1 sm:max-w-xs">
          <Select id="qr-table" value={selection?.id ?? ""} onChange={(e) => router.push(`/admin/qr?table=${e.target.value}`)}>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nom}
              </option>
            ))}
          </Select>
        </Field>
        {current ? (
          <dl className="flex flex-wrap gap-x-10 gap-y-2 text-[15px]">
            {[
              ["Zone", current.zone],
              ["Places", String(current.capacite)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-muted">{k}</dt>
                <dd className="num text-ink">{v}</dd>
              </div>
            ))}
            <div>
              <dt className="text-muted">Statut</dt>
              <dd>
                <Badge tone={current.active ? "olive" : "neutral"} dot>
                  {current.active ? (current.session ? "Session ouverte" : "Active") : "Désactivée"}
                </Badge>
              </dd>
            </div>
          </dl>
        ) : null}
      </Card>

      <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
        <Card className="p-5 sm:p-6">
          <Tabs
            label="Rubriques"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "acces", label: "Accès client", icon: <Users size={19} /> },
              { id: "sessions", label: "Sessions", icon: <Clock size={19} /> },
              { id: "supports", label: "Supports QR", icon: <ImageIcon size={19} /> },
            ]}
          />

          {tab === "acces" ? (
            <div className="mt-5 flex flex-col gap-5">
              <div>
                <h2 className="text-[1.25rem] font-semibold">Configuration de l'accès client</h2>
                <p className="text-[15px] text-muted">Définissez comment les clients rejoindront une table via le QR code.</p>
              </div>
              <Field label="Type de QR code" help="Le QR code imprimé identifie la table de façon permanente. Il ne donne aucun droit à lui seul.">
                <div className="flex h-10 items-center justify-between rounded-[10px] border border-line bg-olive-tint px-3 text-[15px] text-muted">
                  QR permanent (identifie la table) <Lock size={17} aria-hidden />
                </div>
              </Field>
              <fieldset>
                <legend className="mb-2 text-[15px]">Politique d'accès</legend>
                <div className="flex flex-col gap-2">
                  {POLITIQUES.map((p) => (
                    <Radio key={p.id} name="politique" checked={draft.politique === p.id} onChange={() => set("politique", p.id)} className={cn("rounded-xl border px-4 py-3", draft.politique === p.id ? "border-olive bg-olive-tint" : "border-line")}>
                      <span className="block text-[16px] text-ink">{p.titre}</span>
                      <span className="block text-[14px] text-muted">{p.texte}</span>
                    </Radio>
                  ))}
                </div>
              </fieldset>
              <Callout tone="info">
                Un QR code copié ne suffit pas pour accéder à une table quand un code de session est requis. Aucune solution ne peut toutefois empêcher la copie d'un QR code.
              </Callout>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Ouverture et fermeture des sessions" help="Le personnel ouvre et ferme les sessions.">
                  <div className="flex h-10 items-center justify-between rounded-[10px] border border-line bg-olive-tint px-3 text-[15px] text-muted">
                    Par le personnel uniquement <Lock size={17} aria-hidden />
                  </div>
                </Field>
                <Field label="Accès des sessions fermées" help="Après fermeture, l'ancien code ne donne plus accès à la table.">
                  <div className="flex h-10 items-center justify-between rounded-[10px] border border-line bg-olive-tint px-3 text-[15px] text-muted">
                    Inaccessible aux prochains occupants <Lock size={17} aria-hidden />
                  </div>
                </Field>
                <Field label="Validité du code" htmlFor="validite" help="Un nouveau code est généré à chaque ouverture de session.">
                  <Select id="validite" value={draft.validiteCode} onChange={(e) => set("validiteCode", e.target.value)}>
                    <option value="session">Toute la durée de la session</option>
                    <option value="60">60 minutes</option>
                    <option value="120">120 minutes</option>
                  </Select>
                </Field>
                <Field label="Réseau Wi-Fi du restaurant" optional htmlFor="wifi" help="Nom du réseau à indiquer sur les supports.">
                  <Input id="wifi" maxLength={60} value={draft.wifi} placeholder="Non configuré" onChange={(e) => set("wifi", e.target.value)} />
                </Field>
              </div>
            </div>
          ) : null}

          {tab === "sessions" ? (
            <div className="mt-5">
              <h2 className="text-[1.25rem] font-semibold">Sessions de table</h2>
              <p className="text-[15px] text-muted">Ouvrez une session à l'arrivée des clients, fermez-la à leur départ. La fermeture révoque tous les accès.</p>
              <Callout tone="neutral" className="mt-3" title="Commande depuis la table">
                Une fois la session ouverte, les clients lisent le QR code, saisissent le code et commandent ensemble. Les commandes et les demandes arrivent dans Service en direct.
              </Callout>
              <TableWrap className="mt-4">
                <table className="w-full min-w-[560px]">
                  <thead>
                    <tr>
                      <Th>Table</Th>
                      <Th>Session</Th>
                      <Th>Code actuel</Th>
                      <Th className="text-right">Actions</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {tables.map((t) => (
                      <tr key={t.id}>
                        <Td>
                          <span className="font-medium text-ink">{t.nom}</span>
                          <span className="block text-[13.5px] text-muted">{t.zone}</span>
                        </Td>
                        <Td>
                          {t.session ? (
                            <>
                              <Badge tone="olive" dot>
                                Ouverte
                              </Badge>
                              <span className="num mt-1 block text-[13.5px] text-muted">
                                {relativeTime(t.session.ouverteLe)}, {t.session.participants} participant{t.session.participants > 1 ? "s" : ""}
                              </span>
                            </>
                          ) : (
                            <span className="text-muted">Aucune session</span>
                          )}
                        </Td>
                        <Td>{t.session ? <span className="num rounded-lg bg-olive-soft px-2.5 py-1 font-sans text-[18px] font-semibold tracking-[0.2em] text-ink">{t.session.code}</span> : <span className="text-muted">Aucun</span>}</Td>
                        <Td>
                          <span className="flex flex-wrap justify-end gap-1.5">
                            {t.session ? (
                              <>
                                <Button variant="secondary" size="sm" disabled={pending || !peutGererSessions} onClick={() => run(() => call("POST", `sessions-table/${t.session!.id}/code`), { success: "Nouveau code généré." })}>
                                  <ArrowsClockwise size={16} /> Nouveau code
                                </Button>
                                <Button variant="danger" size="sm" disabled={pending || !peutGererSessions} onClick={() => setClosing(t)}>
                                  <SignOut size={16} /> Fermer
                                </Button>
                              </>
                            ) : (
                              <Button variant="outline" size="sm" disabled={pending || !t.active || !peutGererSessions} onClick={() => run(() => call("POST", "sessions-table", { tableId: t.id }), { success: `Session ouverte pour ${t.nom}.` })}>
                                Ouvrir une session
                              </Button>
                            )}
                          </span>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </div>
          ) : null}

          {tab === "supports" ? (
            <div className="mt-5 flex flex-col gap-4">
              <div>
                <h2 className="text-[1.25rem] font-semibold">Supports à imprimer</h2>
                <p className="text-[15px] text-muted">Chaque support porte le QR code permanent de sa table. L'impression se fait depuis votre navigateur, avec l'option « Enregistrer au format PDF » si besoin.</p>
              </div>
              {baseLocale ? (
                <Callout tone="warn" title="Adresse locale détectée">
                  Les QR codes pointent vers {base}, inaccessible depuis le téléphone d'un client. Renseignez OLIVA_PUBLIC_URL avec l'adresse publique du site avant d'imprimer.
                </Callout>
              ) : (
                <Callout tone="info">Les QR codes pointent vers {base}.</Callout>
              )}
              <div className="flex flex-wrap gap-2">
                <Link href={`/admin/qr/imprimer?table=${selection?.id ?? ""}`} className={buttonClass("primary")}>
                  <Printer size={18} /> Imprimer {selection?.nom}
                </Link>
                <Link href="/admin/qr/imprimer?table=toutes" className={buttonClass("outline")}>
                  <Printer size={18} /> Imprimer toutes les tables
                </Link>
              </div>
            </div>
          ) : null}
        </Card>

        <div className="flex flex-col gap-5">
          <Card className="p-5 sm:p-6">
            <h2 className="text-[1.25rem] font-semibold">Aperçu du support de table</h2>
            <p className="text-[15px] text-muted">Chevalet à imprimer pour cette table.</p>
            <div className="mt-4 rounded-2xl bg-olive-soft/60 p-5">{selection ? <QrSupport nom={selection.nom} svg={selection.svg} marque={marque} /> : null}</div>
            <p className="mt-2 text-center font-sans text-[12.5px] break-all text-muted">{selection?.url}</p>
            <Link href={`/admin/qr/imprimer?table=${selection?.id ?? ""}`} className={buttonClass("secondary", "md", "mt-3 w-full")}>
              <Printer size={18} /> Imprimer ce support
            </Link>
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-[1.25rem] font-semibold">
              <Info size={20} /> Utilisation par le personnel
            </h2>
            <ol className="mt-3 flex flex-col gap-3">
              {[
                ["Ouvrir la table", "Démarrez une nouvelle session à l'arrivée des clients."],
                ["Partager le code actuel", "Communiquez le code de session aux clients présents."],
                ["Fermer la session", "Au départ des clients, fermez la session pour invalider le code."],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-3">
                  <span className="num grid size-9 shrink-0 place-items-center rounded-full bg-olive-soft text-[16px] font-semibold text-ink">{i + 1}</span>
                  <span>
                    <span className="block text-[16px] text-ink">{t}</span>
                    <span className="block text-[14px] text-muted">{d}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      <Confirm
        open={!!closing}
        onClose={() => setClosing(null)}
        title={`Fermer la session de ${closing?.nom ?? ""} ?`}
        danger
        confirmLabel="Fermer la session"
        pending={pending}
        onConfirm={async () => {
          if (closing?.session) await run(() => call("POST", `sessions-table/${closing.session!.id}/fermer`), { success: "Session fermée, accès révoqués." });
          setClosing(null);
        }}
      >
        Les clients connectés perdent immédiatement l'accès et le panier en cours est abandonné. Les commandes déjà envoyées sont conservées. Les prochains occupants ne verront jamais ces commandes.
      </Confirm>
    </>
  );
}
