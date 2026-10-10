"use client";

import { Armchair, Clock, EnvelopeSimple, Lock, Prohibit, QrCode, ShieldCheck, SignOut, Users } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useState } from "react";
import { Confirm, NumberInput, SaveButton, useAction, useApi, useDraft } from "@/components/client";
import { Avatar, Badge, Button, Callout, Card, CardHeader, Checkbox, EmptyState, Field, IconButton, PageHeader, SectionLabel, Select, Toggle, buttonClass } from "@/components/ui";
import { cn, relativeTime } from "@/lib/format";

interface Params {
  motDePasseMin: number;
  exigerLettreChiffre: boolean;
  exigerSpecial: boolean;
  inactiviteMin: number;
  dureeMaxHeures: number;
  tentativesMax: number;
  verrouillageMin: number;
}
interface Session {
  id: string;
  nom: string;
  appareil: string;
  ip: string;
  vueLe: string;
  courante: boolean;
}

export function SecuriteEditor({ initial, sessions }: { initial: Params; sessions: Session[] }) {
  const call = useApi();
  const { run, pending } = useAction();
  const { draft, set, dirty } = useDraft(initial);
  const [revokeAll, setRevokeAll] = useState(false);
  const others = sessions.filter((s) => !s.courante).length;

  return (
    <>
      <PageHeader eyebrow="Sécurité" title="Sécurité & accès" subtitle="Gérez les comptes du personnel, l'accès client et les sessions." actions={<SaveButton pending={pending} dirty={dirty} size="lg" onClick={() => run(() => call("PUT", "securite", draft), { success: "Règles de sécurité enregistrées." })} />} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Card className="p-5 sm:p-6">
          <CardHeader icon={<Users size={22} />} title="Authentification du personnel" description="Paramètres de connexion et de sécurité pour l'équipe et les administrateurs." />

          <SectionLabel className="mt-6">Politiques de connexion</SectionLabel>
          <div className="mt-3 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <Toggle label="Comptes sur invitation uniquement" checked disabled readOnly />
              <div>
                <p className="flex flex-wrap items-center gap-2 text-[16px]">
                  Inviter uniquement les membres du personnel <Badge tone="olive">Toujours actif</Badge>
                </p>
                <p className="text-[14px] text-muted">Aucune inscription libre n'existe : seuls les membres invités par un administrateur peuvent se connecter.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Toggle label="Double authentification" checked={false} disabled readOnly />
              <div>
                <p className="flex flex-wrap items-center gap-2 text-[16px]">
                  Double authentification des administrateurs <Badge>Non disponible</Badge>
                </p>
                <p className="text-[14px] text-muted">Cette étape de vérification supplémentaire n'est pas incluse dans cette version.</p>
              </div>
            </div>
          </div>

          <SectionLabel className="mt-6 border-t border-line pt-5">Exigences du mot de passe</SectionLabel>
          <div className="mt-3 flex flex-col gap-3">
            <label className="flex items-center gap-3 text-[15.5px]">
              Longueur minimale
              <NumberInput aria-label="Longueur minimale du mot de passe" min={8} max={64} value={draft.motDePasseMin} onChange={(v) => set("motDePasseMin", v)} className="w-20" />
              caractères
            </label>
            <Checkbox checked={draft.exigerLettreChiffre} onChange={(e) => set("exigerLettreChiffre", e.target.checked)}>
              Inclure au moins une lettre et un chiffre
            </Checkbox>
            <Checkbox checked={draft.exigerSpecial} onChange={(e) => set("exigerSpecial", e.target.checked)}>
              Inclure un caractère spécial
            </Checkbox>
            <p className="text-[13.5px] text-muted">Ces règles s'appliquent aux prochains mots de passe choisis. Seules leurs empreintes sont enregistrées.</p>
          </div>

          <SectionLabel className="mt-6 border-t border-line pt-5">Session du personnel</SectionLabel>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="Délai d'inactivité avant déconnexion" htmlFor="s-inact" help="Déconnexion automatique en cas d'inactivité.">
              <Select id="s-inact" value={String(draft.inactiviteMin)} onChange={(e) => set("inactiviteMin", Number(e.target.value))}>
                {[10, 15, 30, 60, 120, 240].map((m) => (
                  <option key={m} value={m}>
                    {m < 60 ? `${m} minutes` : `${m / 60} heure${m > 60 ? "s" : ""}`}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Durée maximale d'une session" htmlFor="s-max" help="Une nouvelle connexion est requise après cette durée.">
              <Select id="s-max" value={String(draft.dureeMaxHeures)} onChange={(e) => set("dureeMaxHeures", Number(e.target.value))}>
                {[2, 4, 8, 12, 24].map((h) => (
                  <option key={h} value={h}>
                    {h} heures
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tentatives avant verrouillage" htmlFor="s-tent" help="Échecs de connexion tolérés par identifiant.">
              <Select id="s-tent" value={String(draft.tentativesMax)} onChange={(e) => set("tentativesMax", Number(e.target.value))}>
                {[3, 5, 8, 10].map((n) => (
                  <option key={n} value={n}>
                    {n} tentatives
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Durée du verrouillage" htmlFor="s-verr" help="Temps d'attente après trop d'échecs.">
              <Select id="s-verr" value={String(draft.verrouillageMin)} onChange={(e) => set("verrouillageMin", Number(e.target.value))}>
                {[5, 15, 30, 60].map((n) => (
                  <option key={n} value={n}>
                    {n} minutes
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <SectionLabel className="mt-6 border-t border-line pt-5">Récupération de compte</SectionLabel>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <EnvelopeSimple size={26} weight="light" className="shrink-0" />
            <div className="min-w-48 flex-1">
              <p className="text-[16px]">Réinitialisation du mot de passe</p>
              <p className="text-[14px] text-muted">Sans envoi d'e-mail configuré, un administrateur génère un lien à usage unique et le transmet au membre.</p>
            </div>
            <Link href="/admin/utilisateurs" className={buttonClass("outline", "sm")}>
              Ouvrir les utilisateurs
            </Link>
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          <Card className="p-5 sm:p-6">
            <CardHeader icon={<Clock size={22} />} title="Sessions actives du personnel" description="Appareils actuellement connectés à l'administration." />
            {sessions.length === 0 ? (
              <EmptyState title="Aucune session active" />
            ) : (
              <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
                {sessions.map((s) => (
                  <li key={s.id} className={cn("flex items-center gap-3 px-4 py-3", s.courante && "bg-olive-tint")}>
                    <Avatar name={s.nom} />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-[16px] text-ink">
                        {s.nom} {s.courante ? <Badge tone="olive">Cette session</Badge> : null}
                      </p>
                      <p className="truncate text-[14px] text-muted">
                        {s.appareil}, {s.ip}
                      </p>
                    </div>
                    <span className="num text-[13.5px] whitespace-nowrap text-muted">{relativeTime(s.vueLe)}</span>
                    <IconButton label={`Révoquer la session de ${s.nom}`} disabled={pending || s.courante} onClick={() => run(() => call("POST", `sessions-personnel/${s.id}/revoquer`), { success: "Session révoquée." })}>
                      <SignOut size={18} />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-olive-tint p-4">
              <ShieldCheck size={24} weight="light" className="shrink-0" />
              <div className="min-w-40 flex-1">
                <p className="text-[15.5px] text-ink">Révoquer les autres sessions</p>
                <p className="text-[13.5px] text-muted">Déconnecte tous les appareils sauf celui en cours.</p>
              </div>
              <Button variant="outline" size="sm" disabled={pending || others === 0} onClick={() => setRevokeAll(true)}>
                Révoquer ({others})
              </Button>
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <CardHeader icon={<Lock size={22} />} title="Clients sans compte" description="Accès par QR code et session de table en cours." />
            <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
              {[
                { icon: <QrCode size={22} weight="light" />, t: "QR code et session en cours", d: "Accès selon la règle choisie : code de session ou validation du personnel." },
                { icon: <Armchair size={22} weight="light" />, t: "Isolation par table (obligatoire)", d: "Chaque client accède uniquement à la session autorisée de sa table." },
                { icon: <Clock size={22} weight="light" />, t: "Expiration à la fermeture de la table", d: "L'accès client est révoqué dès la fermeture de sa session de table." },
                { icon: <Prohibit size={22} weight="light" />, t: "Historique limité à la session", d: "Les commandes des occupants précédents sont inaccessibles." },
              ].map((x) => (
                <li key={x.t} className="flex items-start gap-3 px-4 py-3">
                  <span className="mt-0.5 shrink-0">{x.icon}</span>
                  <span>
                    <span className="block text-[15.5px] text-ink">{x.t}</span>
                    <span className="block text-[13.5px] text-muted">{x.d}</span>
                  </span>
                </li>
              ))}
            </ul>
            <Link href="/admin/qr" className="mt-4 inline-flex items-center gap-2 text-[16px] text-olive-deep underline-offset-4 hover:underline">
              Configurer le QR code et les paramètres d'accès client
            </Link>
          </Card>
          <Callout tone="neutral">Les cookies de session sont protégés (HttpOnly, SameSite, Secure en production) et chaque requête d'écriture porte un jeton de protection contre les requêtes intersites.</Callout>
        </div>
      </div>

      <Confirm
        open={revokeAll}
        onClose={() => setRevokeAll(false)}
        title="Révoquer les autres sessions ?"
        danger
        confirmLabel="Révoquer"
        pending={pending}
        onConfirm={async () => {
          await run(() => call("POST", "sessions-personnel/revoquer-autres"), { success: "Autres sessions révoquées." });
          setRevokeAll(false);
        }}
      >
        {others} appareil(s) seront déconnectés immédiatement. Votre session en cours reste ouverte.
      </Confirm>
    </>
  );
}
