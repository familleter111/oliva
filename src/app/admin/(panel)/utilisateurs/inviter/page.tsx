import type { Metadata } from "next";
import { requirePage } from "@/lib/server/auth/session";
import { PERMISSIONS } from "@/lib/server/schema";
import { readDb } from "@/lib/server/storage";
import { InviteForm } from "./form";

export const metadata: Metadata = { title: "Inviter un membre" };

export default async function Page() {
  const auth = await requirePage("utilisateurs.gerer");
  const db = await readDb();
  const labels = new Map<string, string>(PERMISSIONS.map((p) => [p.code, p.label]));
  return (
    <InviteForm
      restaurant={db.Restaurant[0]?.nom || "Oliva"}
      auteur={auth.actor.nom}
      roles={[...db.Roles]
        .sort((a, b) => a.ordre - b.ordre)
        .map((r) => ({ id: r.id, nom: r.nom, droits: db.Permissions.filter((p) => p.roleId === r.id).map((p) => labels.get(p.permission) ?? p.permission), admin: db.Permissions.some((p) => p.roleId === r.id && p.permission === "admin.acces") }))}
      zones={[...db.Zones].sort((a, b) => a.ordre - b.ordre).map((z) => ({ id: z.id, nom: z.nom }))}
      stations={[...db.StationsPreparation].sort((a, b) => a.ordre - b.ordre).map((s) => ({ id: s.id, nom: s.nom }))}
    />
  );
}
