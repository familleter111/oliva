"use client";

import { CheckCircle, CircleNotch, Eye, LinkSimple, Lock, Prohibit, UserCircle } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useState } from "react";
import { CopyField, useAction, useApi } from "@/components/client";
import { Badge, Bubble, Button, Callout, Card, CardHeader, Checkbox, Field, Input, PageHeader, Select, Wordmark, buttonClass } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import type { Named } from "@/lib/types";

interface Role extends Named {
  droits: string[];
  admin: boolean;
}

export function InviteForm({ roles, zones, stations, restaurant, auteur }: { roles: Role[]; zones: Named[]; stations: Named[]; restaurant: string; auteur: string }) {
  const call = useApi();
  const { run, pending, errors } = useAction();
  const [f, setF] = useState({ prenom: "", nom: "", email: "", roleId: roles.find((r) => !r.admin)?.id ?? roles[0]?.id ?? "", zoneIds: [] as string[], stationId: "", validiteHeures: 48 });
  const [result, setResult] = useState<{ lien: string; expireLe: string } | null>(null);
  const role = roles.find((r) => r.id === f.roleId);
  const cuisine = f.roleId === "role_cuisine" || !!f.stationId;
  const ready = f.prenom.trim() && f.nom.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim()) && f.roleId;

  const submit = async () => {
    const out = await run(() => call<{ lien: string; expireLe: string }>("POST", "utilisateurs/inviter", f), { success: "Invitation créée." });
    if (out) setResult(out);
  };

  if (result) {
    return (
      <>
        <PageHeader eyebrow="Utilisateurs" title="Invitation créée" subtitle={`Transmettez le lien ci-dessous à ${f.prenom} pour activer son compte.`} />
        <Card className="max-w-2xl p-6">
          <CardHeader icon={<LinkSimple size={22} />} title="Lien d'invitation" description={`Valable jusqu'au ${formatDateTime(result.expireLe)}.`} />
          <Callout tone="warn" title="Envoi d'e-mails non configuré" className="mt-4">
            Aucun e-mail n'a été envoyé. Copiez ce lien et transmettez-le vous-même : il ne sera plus affiché ensuite. Vous pourrez en générer un nouveau depuis la liste des utilisateurs.
          </Callout>
          <div className="mt-4">
            <CopyField value={result.lien} label="Lien d'invitation" />
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/admin/utilisateurs" className={buttonClass("primary")}>
              Retour aux utilisateurs
            </Link>
            <Button
              variant="secondary"
              onClick={() => {
                setResult(null);
                setF({ ...f, prenom: "", nom: "", email: "" });
              }}
            >
              Inviter un autre membre
            </Button>
          </div>
        </Card>
      </>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) void submit();
      }}
    >
      <PageHeader eyebrow="Utilisateurs" title="Inviter un membre" subtitle="Créez une invitation pour rejoindre l'équipe de votre restaurant." />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card className="p-5 sm:p-7">
          <CardHeader icon={<UserCircle size={24} />} title="Informations du membre" description="Renseignez son identité et ses accès. Un lien d'invitation à transmettre sera généré." />
          <div className="mt-5 flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Prénom" required htmlFor="prenom" error={errors.prenom}>
                <Input id="prenom" autoComplete="off" maxLength={40} value={f.prenom} onChange={(e) => setF({ ...f, prenom: e.target.value })} />
              </Field>
              <Field label="Nom" required htmlFor="nom" error={errors.nom}>
                <Input id="nom" autoComplete="off" maxLength={40} value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} />
              </Field>
            </div>
            <Field label="Adresse e-mail" required htmlFor="email" error={errors.email} help="Elle servira d'identifiant de connexion.">
              <Input id="email" type="email" autoComplete="off" maxLength={120} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            </Field>
            <Field label="Rôle" required htmlFor="role" error={errors.roleId} help="Définit les accès et les fonctionnalités disponibles." className="sm:max-w-sm">
              <Select id="role" value={f.roleId} onChange={(e) => setF({ ...f, roleId: e.target.value })}>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nom}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Zones autorisées" help="Aucune case cochée : toutes les zones.">
                {zones.length === 0 ? (
                  <p className="text-[14.5px] text-muted">Aucune zone créée.</p>
                ) : (
                  <div className="flex flex-col gap-2 rounded-xl border border-line p-3">
                    {zones.map((z) => (
                      <Checkbox key={z.id} checked={f.zoneIds.includes(z.id)} onChange={(e) => setF({ ...f, zoneIds: e.target.checked ? [...f.zoneIds, z.id] : f.zoneIds.filter((x) => x !== z.id) })}>
                        {z.nom}
                      </Checkbox>
                    ))}
                  </div>
                )}
              </Field>
              <Field label="Station de cuisine" htmlFor="station" help="Station principale de ce membre, pour un rôle en cuisine.">
                <Select id="station" value={f.stationId} onChange={(e) => setF({ ...f, stationId: e.target.value })}>
                  <option value="">Aucune</option>
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nom}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Durée de validité de l'invitation" required htmlFor="validite" help="Le lien expire automatiquement après cette durée." className="sm:max-w-sm">
              <Select id="validite" value={String(f.validiteHeures)} onChange={(e) => setF({ ...f, validiteHeures: Number(e.target.value) })}>
                <option value="24">24 heures</option>
                <option value="48">48 heures</option>
                <option value="72">72 heures</option>
                <option value="168">7 jours</option>
              </Select>
            </Field>
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          <Card className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Bubble className="size-10">
                <Eye size={20} />
              </Bubble>
              <h2 className="min-w-0 flex-1 text-[1.3rem] font-semibold">Aperçu de l'invitation</h2>
              <Badge tone="olive">Aperçu, aucun envoi</Badge>
            </div>
            <div className="mt-4 rounded-2xl border border-line bg-olive-tint p-6">
              <Wordmark subtitle="" />
              <p className="mt-5 text-[1.5rem] leading-tight font-semibold text-ink">{restaurant} vous invite à rejoindre son équipe.</p>
              <p className="mt-2 text-[15px] text-muted">
                {auteur} invite {f.prenom || "ce membre"} en tant que <strong className="font-semibold text-ink">{role?.nom}</strong>.
              </p>
              <div className="mt-4 rounded-xl border border-line bg-white px-4 py-3 text-[15px]">
                <p>
                  <span className="text-muted">Rôle</span> <span className="ml-3 font-medium text-ink">{role?.nom}</span>
                </p>
                {cuisine && f.stationId ? (
                  <p className="mt-1 border-t border-line pt-1">
                    <span className="text-muted">Station</span> <span className="ml-3 font-medium text-ink">{stations.find((s) => s.id === f.stationId)?.nom}</span>
                  </p>
                ) : null}
              </div>
              <div aria-hidden className="mt-4 rounded-[10px] bg-olive py-2.5 text-center text-[16px] font-medium text-white">
                Accepter l'invitation
              </div>
              <p className="mt-2 text-center text-[13.5px] text-muted">Cette invitation est valable pendant {f.validiteHeures >= 48 && f.validiteHeures % 24 === 0 && f.validiteHeures > 72 ? `${f.validiteHeures / 24} jours` : `${f.validiteHeures} heures`}.</p>
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-[1.15rem] font-semibold">
              <Lock size={19} /> Résumé des accès
            </h2>
            <ul className="mt-3 flex flex-col gap-2 text-[15px]">
              {(role?.droits ?? []).slice(0, 6).map((d) => (
                <li key={d} className="flex items-center gap-2.5">
                  <CheckCircle size={19} weight="fill" className="shrink-0 text-olive" /> {d}
                </li>
              ))}
              {role && !role.admin ? (
                <li className="flex items-start gap-2.5 text-muted">
                  <Prohibit size={19} className="mt-0.5 shrink-0 text-danger" /> Aucun accès à l'administration du restaurant.
                </li>
              ) : null}
            </ul>
          </Card>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <Link href="/admin/utilisateurs" className={buttonClass("secondary", "lg")}>
          Annuler
        </Link>
        <Button type="submit" size="lg" disabled={!ready || pending}>
          {pending ? <CircleNotch size={20} className="animate-spin" /> : <LinkSimple size={20} />} Créer l'invitation
        </Button>
      </div>
    </form>
  );
}
