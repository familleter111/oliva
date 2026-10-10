"use client";

import { ArrowCounterClockwise, ChefHat, ClockCountdown, Info, Key, MagnifyingGlass, PaperPlaneTilt, PencilSimple, Prohibit, ShieldCheck, Trash, User, UserPlus, Users, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ChipSelect } from "@/components/admin/list-editor";
import { ActionMenu, Confirm, CopyField, Modal, useAction, useApi, type MenuItem } from "@/components/client";
import { Avatar, Badge, Bubble, Button, Callout, Card, EmptyState, Field, Input, PageHeader, Select, TableWrap, Td, Th, buttonClass } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import type { Named } from "@/lib/types";

interface Utilisateur {
  id: string;
  nomComplet: string;
  prenom: string;
  nom: string;
  email: string;
  roleId: string;
  statut: string;
  zoneIds: string[];
  stationId: string;
  zonesTexte: string;
  sansMotDePasse: boolean;
}
const STATUT: Record<string, { label: string; tone: "olive" | "warn" | "danger" }> = { actif: { label: "Actif", tone: "olive" }, invite: { label: "Invité", tone: "warn" }, suspendu: { label: "Suspendu", tone: "danger" } };
const roleIcon = (id: string) => (id === "role_admin" ? <ShieldCheck size={17} /> : id === "role_cuisine" ? <ChefHat size={17} /> : id === "role_responsable" ? <Users size={17} /> : <User size={17} />);

function Stat({ icon, value, label, tone }: { icon: ReactNode; value: number; label: string; tone: string }) {
  return (
    <Card className="flex items-center gap-4 px-5 py-3.5">
      <Bubble className={tone}>{icon}</Bubble>
      <div>
        <p className="num text-[1.7rem] leading-none font-bold text-ink">{value}</p>
        <p className="text-[15px] text-muted">{label}</p>
      </div>
    </Card>
  );
}

export function UtilisateursList({ utilisateurs, roles, zones, stations, moi }: { utilisateurs: Utilisateur[]; roles: Named[]; zones: Named[]; stations: Named[]; moi: string }) {
  const call = useApi();
  const { run, pending, errors } = useAction();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [statut, setStatut] = useState("");
  const [editing, setEditing] = useState<Utilisateur | null>(null);
  const [confirm, setConfirm] = useState<{ user: Utilisateur; action: "suspendre" | "supprimer" } | null>(null);
  const [link, setLink] = useState<{ lien: string; type: string; expireLe: string; nom: string } | null>(null);

  const roleName = new Map(roles.map((r) => [r.id, r.nom]));
  const shown = utilisateurs.filter((u) => (!role || u.roleId === role) && (!statut || u.statut === statut) && `${u.nomComplet} ${u.email} ${roleName.get(u.roleId)} ${u.zonesTexte}`.toLowerCase().includes(query.trim().toLowerCase()));
  const count = (s: string) => utilisateurs.filter((u) => u.statut === s).length;

  const makeLink = async (u: Utilisateur) => {
    const out = await run(() => call<{ lien: string; type: string; expireLe: string }>("POST", `utilisateurs/${u.id}/lien`), { refresh: false });
    if (out) setLink({ ...out, nom: u.nomComplet });
  };
  const items = (u: Utilisateur): MenuItem[] => [
    { label: "Modifier", icon: <PencilSimple size={17} />, onSelect: () => setEditing(u) },
    ...(u.statut === "invite" ? [{ label: "Nouveau lien d'invitation", icon: <PaperPlaneTilt size={17} />, onSelect: () => makeLink(u) }] : []),
    ...(u.statut === "actif" ? [{ label: "Lien de réinitialisation", icon: <Key size={17} />, onSelect: () => makeLink(u) }] : []),
    ...(u.statut === "suspendu"
      ? [{ label: "Réactiver", icon: <ArrowCounterClockwise size={17} />, onSelect: () => void run(() => call("POST", `utilisateurs/${u.id}/reactiver`), { success: "Compte réactivé." }) }]
      : [{ label: "Suspendre", icon: <Prohibit size={17} />, danger: true, disabled: u.id === moi, onSelect: () => setConfirm({ user: u, action: "suspendre" as const }) }]),
    { label: "Supprimer", icon: <Trash size={17} />, danger: true, disabled: u.id === moi, onSelect: () => setConfirm({ user: u, action: "supprimer" as const }) },
  ];

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
        <PageHeader eyebrow="Équipe & salle" title="Utilisateurs" subtitle="Gérez les comptes du personnel et leurs accès." />
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat icon={<User size={24} />} value={count("actif")} label={count("actif") > 1 ? "actifs" : "actif"} tone="" />
          <Stat icon={<ClockCountdown size={24} />} value={count("invite")} label={count("invite") > 1 ? "invitations" : "invitation"} tone="bg-warn-soft text-warn" />
          <Stat icon={<WarningCircle size={24} />} value={count("suspendu")} label={count("suspendu") > 1 ? "suspendus" : "suspendu"} tone="bg-danger-soft text-danger" />
        </div>
      </div>

      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap gap-3">
          <label className="relative min-w-56 flex-[2]">
            <span className="sr-only">Rechercher un utilisateur</span>
            <MagnifyingGlass size={18} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <Input type="search" placeholder="Rechercher un utilisateur, un rôle ou une zone" value={query} onChange={(e) => setQuery(e.target.value)} className="h-11 pl-10" />
          </label>
          <Select aria-label="Filtrer par rôle" value={role} onChange={(e) => setRole(e.target.value)} className="min-w-44 flex-1 [&>select]:h-11">
            <option value="">Tous les rôles</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nom}
              </option>
            ))}
          </Select>
          <Select aria-label="Filtrer par statut" value={statut} onChange={(e) => setStatut(e.target.value)} className="min-w-44 flex-1 [&>select]:h-11">
            <option value="">Tous les statuts</option>
            <option value="actif">Actifs</option>
            <option value="invite">Invités</option>
            <option value="suspendu">Suspendus</option>
          </Select>
          <Link href="/admin/utilisateurs/inviter" className={buttonClass("primary", "lg", "h-11")}>
            <UserPlus size={20} /> Inviter un membre
          </Link>
        </div>

        {shown.length === 0 ? (
          <EmptyState icon={<Users size={24} />} title="Aucun compte ne correspond">
            Modifiez la recherche ou les filtres.
          </EmptyState>
        ) : (
          <TableWrap className="mt-4">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr>
                  <Th>Nom</Th>
                  <Th>Rôle</Th>
                  <Th>Zones</Th>
                  <Th>Statut</Th>
                  <Th className="w-16 text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {shown.map((u) => (
                  <tr key={u.id}>
                    <Td>
                      <span className="flex items-center gap-4">
                        <Avatar name={u.nomComplet} className="size-12 text-[18px]" />
                        <span className="min-w-0">
                          <span className="block text-[17px] font-medium text-ink">
                            {u.nomComplet} {u.id === moi ? <span className="font-normal text-muted">(vous)</span> : null}
                          </span>
                          <span className="block truncate text-[14.5px] text-muted">{u.email}</span>
                        </span>
                      </span>
                    </Td>
                    <Td>
                      <Badge>
                        {roleIcon(u.roleId)} {roleName.get(u.roleId)}
                      </Badge>
                    </Td>
                    <Td className="text-muted">{u.zonesTexte}</Td>
                    <Td>
                      <Badge tone={STATUT[u.statut]?.tone ?? "olive"} dot>
                        {STATUT[u.statut]?.label ?? u.statut}
                      </Badge>
                      {u.sansMotDePasse ? <span className="mt-1 block text-[13px] text-muted">Aucun mot de passe défini</span> : null}
                    </Td>
                    <Td className="text-right">
                      <ActionMenu label={`Actions pour ${u.nomComplet}`} items={items(u)} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-line bg-olive-soft/60 px-5 py-4">
        <Info size={24} className="mt-0.5 shrink-0 text-olive-deep" />
        <div>
          <p className="text-[16px] text-ink">Les clients accèdent au menu sans compte.</p>
          <p className="text-[14.5px] text-muted">Seul le personnel du restaurant dispose d'un compte pour accéder à l'administration et aux fonctionnalités métier.</p>
        </div>
      </div>

      {editing ? <EditUser key={editing.id} user={editing} roles={roles} zones={zones} stations={stations} onClose={() => setEditing(null)} /> : null}

      <Confirm
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.action === "suspendre" ? "Suspendre ce compte ?" : "Supprimer ce compte ?"}
        danger
        confirmLabel={confirm?.action === "suspendre" ? "Suspendre" : "Supprimer"}
        pending={pending}
        onConfirm={async () => {
          if (!confirm) return;
          if (confirm.action === "suspendre") await run(() => call("POST", `utilisateurs/${confirm.user.id}/suspendre`), { success: "Compte suspendu, sessions révoquées." });
          else await run(() => call("DELETE", `utilisateurs/${confirm.user.id}`), { success: "Compte supprimé." });
          setConfirm(null);
        }}
      >
        {confirm?.action === "suspendre"
          ? `${confirm.user.nomComplet} sera déconnecté immédiatement de tous ses appareils et ne pourra plus se connecter tant que le compte n'est pas réactivé.`
          : `Le compte de ${confirm?.user.nomComplet} sera supprimé définitivement. Ses actions passées restent dans l'historique.`}
        {errors._ ? <Callout tone="danger" className="mt-3">{errors._}</Callout> : null}
      </Confirm>

      <Modal open={!!link} onClose={() => setLink(null)} title={link?.type === "invitation" ? "Lien d'invitation" : "Lien de réinitialisation"} description={`Pour ${link?.nom ?? ""}. Valable jusqu'au ${link ? formatDateTime(link.expireLe) : ""}.`}>
        <Callout tone="warn" title="Envoi d'e-mails non configuré">
          Aucun message n'a été envoyé. Copiez ce lien et transmettez-le vous-même à la personne concernée. Il ne sera plus affiché ensuite.
        </Callout>
        <div className="mt-4">{link ? <CopyField value={link.lien} label="Lien à transmettre" /> : null}</div>
      </Modal>
    </>
  );
}

function EditUser({ user, roles, zones, stations, onClose }: { user: Utilisateur; roles: Named[]; zones: Named[]; stations: Named[]; onClose: () => void }) {
  const call = useApi();
  const { run, pending, errors } = useAction();
  const [draft, setDraft] = useState({ prenom: user.prenom, nom: user.nom, email: user.email, roleId: user.roleId, zoneIds: user.zoneIds, stationId: user.stationId });
  const save = async () => {
    if (await run(() => call("PATCH", `utilisateurs/${user.id}`, draft), { success: "Compte enregistré." })) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Modifier ${user.nomComplet}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button disabled={pending || !draft.prenom.trim() || !draft.email.trim()} onClick={save}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prénom" required htmlFor="u-prenom" error={errors.prenom}>
            <Input id="u-prenom" maxLength={40} value={draft.prenom} onChange={(e) => setDraft({ ...draft, prenom: e.target.value })} />
          </Field>
          <Field label="Nom" htmlFor="u-nom" error={errors.nom}>
            <Input id="u-nom" maxLength={40} value={draft.nom} onChange={(e) => setDraft({ ...draft, nom: e.target.value })} />
          </Field>
        </div>
        <Field label="Adresse e-mail" required htmlFor="u-email" error={errors.email}>
          <Input id="u-email" type="email" maxLength={120} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
        </Field>
        <Field label="Rôle" htmlFor="u-role" error={errors.roleId}>
          <Select id="u-role" value={draft.roleId} onChange={(e) => setDraft({ ...draft, roleId: e.target.value })}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nom}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Zones autorisées" help="Aucune sélection : toutes les zones.">
          <ChipSelect label="Zones autorisées" options={zones} value={draft.zoneIds} onChange={(v) => setDraft({ ...draft, zoneIds: v })} empty="Aucune zone créée." />
        </Field>
        <Field label="Station de cuisine" htmlFor="u-station">
          <Select id="u-station" value={draft.stationId} onChange={(e) => setDraft({ ...draft, stationId: e.target.value })}>
            <option value="">Aucune</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
