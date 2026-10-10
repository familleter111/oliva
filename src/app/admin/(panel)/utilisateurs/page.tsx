import type { Metadata } from "next";
import { requirePage } from "@/lib/server/auth/session";
import { fullName } from "@/lib/server/db-utils";
import { readDb } from "@/lib/server/storage";
import { UtilisateursList } from "./list";

export const metadata: Metadata = { title: "Utilisateurs" };

export default async function Page() {
  const auth = await requirePage("utilisateurs.gerer");
  const db = await readDb();
  const zones = new Map(db.Zones.map((z) => [z.id, z.nom]));
  const order = { actif: 0, invite: 1, suspendu: 2 } as Record<string, number>;
  return (
    <UtilisateursList
      moi={auth.user.id}
      roles={[...db.Roles].sort((a, b) => a.ordre - b.ordre).map((r) => ({ id: r.id, nom: r.nom }))}
      zones={[...db.Zones].sort((a, b) => a.ordre - b.ordre).map((z) => ({ id: z.id, nom: z.nom }))}
      stations={[...db.StationsPreparation].sort((a, b) => a.ordre - b.ordre).map((s) => ({ id: s.id, nom: s.nom }))}
      utilisateurs={[...db.Utilisateurs]
        .sort((a, b) => (order[a.statut] ?? 3) - (order[b.statut] ?? 3) || a.creeLe.localeCompare(b.creeLe))
        .map((u) => ({
          id: u.id,
          nomComplet: fullName(u),
          prenom: u.prenom,
          nom: u.nom,
          email: u.email,
          roleId: u.roleId,
          statut: u.statut,
          zoneIds: u.zoneIds,
          stationId: u.stationId,
          zonesTexte: u.zoneIds.length === 0 ? "Toutes les zones" : u.zoneIds.map((id) => zones.get(id)).filter(Boolean).join(", "),
          sansMotDePasse: u.statut === "actif" && !u.motDePasseHash,
        }))}
    />
  );
}
