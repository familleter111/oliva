import type { Metadata } from "next";
import { requirePage } from "@/lib/server/auth/session";
import { PERMISSIONS, ROLE_ADMIN } from "@/lib/server/schema";
import { readDb } from "@/lib/server/storage";
import { RolesEditor } from "./editor";

export const metadata: Metadata = { title: "Rôles & droits" };

export default async function Page() {
  await requirePage("utilisateurs.gerer");
  const db = await readDb();
  return (
    <RolesEditor
      permissions={PERMISSIONS.map((p) => ({ code: p.code, label: p.label, aide: p.aide }))}
      zones={[...db.Zones].sort((a, b) => a.ordre - b.ordre).map((z) => ({ id: z.id, nom: z.nom }))}
      roles={[...db.Roles]
        .sort((a, b) => a.ordre - b.ordre)
        .map((r) => ({
          id: r.id,
          nom: r.nom,
          systeme: r.systeme,
          verrouille: r.id === ROLE_ADMIN,
          portee: r.portee,
          zoneIds: r.zoneIds,
          membres: db.Utilisateurs.filter((u) => u.roleId === r.id).length,
          droits: Object.fromEntries(db.Permissions.filter((p) => p.roleId === r.id).map((p) => [p.permission, p.portee])),
        }))}
    />
  );
}
