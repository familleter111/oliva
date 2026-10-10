"use client";

import { CheckCircle, Eye, FileText, Key, Lock, PlusCircle, Prohibit, ShieldCheck, Trash, UserCircle, Users } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { ChipSelect } from "@/components/admin/list-editor";
import { Confirm, Modal, SaveButton, useAction, useApi, useDraft } from "@/components/client";
import { Bubble, Button, Callout, Card, CardHeader, Field, Input, PageHeader, Select, TableWrap } from "@/components/ui";
import { cn } from "@/lib/format";
import type { Named } from "@/lib/types";

interface Role {
  id: string;
  nom: string;
  systeme: boolean;
  verrouille: boolean;
  portee: string;
  zoneIds: string[];
  membres: number;
  droits: Record<string, string>;
}
interface Permission {
  code: string;
  label: string;
  aide: string;
}
const PORTEES: Record<string, string> = { toutes: "Oui", mes_tables: "Mes tables", ma_station: "Ma station", selon_autorisation: "Selon autorisation" };
const PORTEE_ROLE: Record<string, { titre: string; texte: string }> = {
  toutes: { titre: "Tout le restaurant", texte: "Ce rôle agit sur l'ensemble des tables des zones autorisées." },
  tables_affectees: { titre: "Tables affectées", texte: "Ce rôle n'a accès qu'aux tables qui lui sont affectées." },
  station: { titre: "Station de préparation", texte: "Ce rôle ne voit que les commandes de sa station." },
};

export function RolesEditor({ roles, permissions, zones }: { roles: Role[]; permissions: Permission[]; zones: Named[] }) {
  const call = useApi();
  const { run, pending } = useAction();
  const matrix = Object.fromEntries(roles.map((r) => [r.id, r.droits]));
  const { draft, setDraft, dirty } = useDraft(matrix);
  const [activeId, setActiveId] = useState(roles.find((r) => !r.verrouille)?.id ?? roles[0]?.id ?? "");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const active = roles.find((r) => r.id === activeId) ?? roles[0];

  const setCell = (roleId: string, code: string, value: string) =>
    setDraft((d) => {
      const next = { ...d[roleId] };
      if (value) next[code] = value;
      else delete next[code];
      return { ...d, [roleId]: next };
    });

  const saveMatrix = () =>
    run(
      async () => {
        for (const r of roles) {
          if (r.verrouille || JSON.stringify(draft[r.id]) === JSON.stringify(r.droits)) continue;
          await call("PUT", `roles/${r.id}/permissions`, { permissions: Object.fromEntries(permissions.map((p) => [p.code, draft[r.id]?.[p.code] ?? null])) });
        }
      },
      { success: "Permissions enregistrées." },
    );

  return (
    <>
      <PageHeader
        eyebrow="Équipe & salle"
        title="Rôles & droits"
        subtitle="Définissez les rôles de votre équipe et les permissions associées."
        actions={
          <Button size="lg" className="rounded-full" onClick={() => setCreating(true)}>
            <PlusCircle size={20} /> Créer un rôle
          </Button>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,2.3fr)_minmax(0,1fr)]">
        <Card className="p-5 sm:p-6">
          <CardHeader icon={<Key size={22} />} title="Matrice des permissions" description="Comparez les droits par rôle. Chaque droit est vérifié côté serveur à chaque action." action={<SaveButton pending={pending} dirty={dirty} onClick={saveMatrix} />} />
          <TableWrap className="mt-4">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr>
                  <th scope="col" className="bg-olive-tint px-4 py-3 text-left text-[15px] font-medium">
                    Permission
                  </th>
                  {roles.map((r) => (
                    <th key={r.id} scope="col" className={cn("border-l border-line px-2 py-2 text-center text-[14.5px] font-medium", r.id === active?.id ? "bg-olive-soft" : "bg-olive-tint")}>
                      <button type="button" onClick={() => setActiveId(r.id)} aria-pressed={r.id === active?.id} className="mx-auto flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 hover:bg-white/70">
                        {r.verrouille ? <ShieldCheck size={19} /> : <UserCircle size={19} />}
                        <span className="max-w-28 leading-tight">{r.nom}</span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {permissions.map((p) => (
                  <tr key={p.code}>
                    <th scope="row" className="border-t border-line px-4 py-2.5 text-left font-normal">
                      <span className="block text-[15.5px] text-ink">{p.label}</span>
                      <span className="block text-[13px] text-muted">{p.aide}</span>
                    </th>
                    {roles.map((r) => {
                      const v = draft[r.id]?.[p.code] ?? "";
                      return (
                        <td key={r.id} className={cn("border-t border-l border-line px-2 py-2 text-center", r.id === active?.id && "bg-olive-soft/50")}>
                          {r.verrouille ? (
                            <CheckCircle size={22} weight="fill" aria-label="Accordé" className="mx-auto text-olive" />
                          ) : (
                            <select
                              aria-label={`${p.label} pour ${r.nom}`}
                              value={v}
                              onChange={(e) => setCell(r.id, p.code, e.target.value)}
                              className={cn("h-9 w-full max-w-40 rounded-lg border bg-white px-2 text-[14px]", v ? "border-olive/50 text-olive-deep" : "border-line text-muted")}
                            >
                              <option value="">Non</option>
                              {Object.entries(PORTEES).map(([k, label]) => (
                                <option key={k} value={k}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>

        {active ? <RoleDetail key={active.id} role={active} roles={roles} zones={zones} onSelect={setActiveId} onDelete={() => setDeleting(true)} /> : null}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <CardHeader icon={<Users size={22} />} title="Clients sans compte" description="Les clients consultent la carte sans compte. Depuis une session de table, leurs droits seront limités à :" />
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              { icon: <FileText size={20} />, t: "Panier de la table actuelle", d: "Créer et modifier un panier, uniquement pour leur table." },
              { icon: <Eye size={20} />, t: "Commandes de la session", d: "Consulter en lecture seule les commandes de leur session." },
              { icon: <Prohibit size={20} />, t: "Aucun accès du personnel", d: "Ni paramètres, ni équipe, ni autres tables." },
            ].map((x) => (
              <li key={x.t} className="rounded-xl border border-line p-3">
                <Bubble className="size-9">{x.icon}</Bubble>
                <p className="mt-2 text-[15px] font-medium text-ink">{x.t}</p>
                <p className="text-[13.5px] text-muted">{x.d}</p>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-5 sm:p-6">
          <CardHeader icon={<ShieldCheck size={22} />} title="Règles de sécurité" description="Certaines règles sont fixes pour garantir la sécurité et l'intégrité des données." />
          <div className="mt-4 flex gap-3 rounded-xl border border-line p-4">
            <Lock size={22} className="mt-0.5 shrink-0 text-olive-deep" />
            <ul className="list-disc space-y-1 pl-4 text-[14.5px] text-muted marker:text-olive">
              <li>Le rôle Administrateur garde tous les droits et ne peut pas être modifié.</li>
              <li>Le dernier administrateur actif ne peut être ni suspendu, ni supprimé, ni changé de rôle.</li>
              <li>Chaque page et chaque action revérifie la session et les droits côté serveur.</li>
              <li>Les clients sans compte restent isolés de toute fonction d'administration.</li>
            </ul>
          </div>
        </Card>
      </div>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Créer un rôle"
        description="Le rôle est créé sans aucun droit. Accordez-les ensuite dans la matrice."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Annuler
            </Button>
            <Button
              disabled={!name.trim() || pending}
              onClick={async () => {
                const out = await run(() => call<{ id: string }>("POST", "roles", { nom: name }), { success: "Rôle créé." });
                if (out) {
                  setCreating(false);
                  setName("");
                  setActiveId(out.id);
                }
              }}
            >
              Créer le rôle
            </Button>
          </>
        }
      >
        <Field label="Nom du rôle" required htmlFor="role-nom">
          <Input id="role-nom" maxLength={40} value={name} placeholder="Ex. Chef de rang" onChange={(e) => setName(e.target.value)} />
        </Field>
      </Modal>

      <Confirm
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Supprimer ce rôle ?"
        danger
        confirmLabel="Supprimer"
        pending={pending}
        onConfirm={async () => {
          const ok = await run(() => call("DELETE", `roles/${active?.id}`), { success: "Rôle supprimé." });
          setDeleting(false);
          if (ok) setActiveId("");
        }}
      >
        Le rôle « {active?.nom} » et ses permissions seront supprimés. Un rôle encore attribué à des membres ne peut pas être supprimé.
      </Confirm>
    </>
  );
}

function RoleDetail({ role, roles, zones, onSelect, onDelete }: { role: Role; roles: Role[]; zones: Named[]; onSelect: (id: string) => void; onDelete: () => void }) {
  const call = useApi();
  const { run, pending } = useAction();
  const { draft, set, dirty } = useDraft({ nom: role.nom, portee: role.portee, zoneIds: role.zoneIds });
  const info = PORTEE_ROLE[draft.portee] ?? PORTEE_ROLE.toutes;
  return (
    <Card className="h-fit p-5 sm:p-6">
      <CardHeader icon={<UserCircle size={22} />} title="Détails du rôle" description="Consultez et ajustez la portée de ce rôle." />
      <div className="mt-4 flex flex-col gap-4">
        <Field label="Rôle" htmlFor="r-select">
          <Select id="r-select" value={role.id} onChange={(e) => onSelect(e.target.value)}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nom} ({r.membres} membre{r.membres > 1 ? "s" : ""})
              </option>
            ))}
          </Select>
        </Field>
        {role.verrouille ? (
          <Callout tone="olive" title="Rôle verrouillé">
            L'administrateur dispose de tous les droits sur tout le restaurant. Ce rôle ne peut pas être modifié ni supprimé.
          </Callout>
        ) : (
          <>
            <Field label="Nom du rôle" htmlFor="r-nom">
              <Input id="r-nom" maxLength={40} value={draft.nom} onChange={(e) => set("nom", e.target.value)} />
            </Field>
            <Field label="Portée des permissions" htmlFor="r-portee">
              <Select id="r-portee" value={draft.portee} onChange={(e) => set("portee", e.target.value)}>
                {Object.entries(PORTEE_ROLE).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.titre}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="rounded-xl bg-olive-tint p-4">
              <p className="text-[16px] font-medium text-ink">{info.titre}</p>
              <p className="text-[14.5px] text-muted">{info.texte}</p>
            </div>
            <Field label="Zones autorisées" help="Aucune sélection : toutes les zones.">
              <ChipSelect label="Zones autorisées" options={zones} value={draft.zoneIds} onChange={(v) => set("zoneIds", v)} empty="Aucune zone créée." />
            </Field>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button variant="danger" disabled={pending || role.systeme || role.membres > 0} onClick={onDelete}>
                <Trash size={18} /> Supprimer
              </Button>
              <SaveButton pending={pending} dirty={dirty && draft.nom.trim() !== ""} onClick={() => run(() => call("PATCH", `roles/${role.id}`, draft), { success: "Rôle enregistré." })} />
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
