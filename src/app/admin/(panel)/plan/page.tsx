import type { Metadata } from "next";
import { requirePage } from "@/lib/server/auth/session";
import { readDb } from "@/lib/server/storage";
import { PlanEditor } from "./editor";

export const metadata: Metadata = { title: "Plan de salle" };

export default async function Page({ searchParams }: { searchParams: Promise<{ zone?: string }> }) {
  await requirePage("salle.configurer");
  const { zone } = await searchParams;
  const db = await readDb();
  const zones = [...db.Zones].sort((a, b) => a.ordre - b.ordre);
  const active = zones.find((z) => z.id === zone) ?? zones[0];
  return (
    <PlanEditor
      key={active?.id ?? "aucune"}
      zones={zones.map((z) => ({ id: z.id, nom: z.nom }))}
      zoneId={active?.id ?? ""}
      tables={db.Tables.filter((t) => !t.archiveeLe && t.zoneId === active?.id)
        .sort((a, b) => a.nom.localeCompare(b.nom, "fr", { numeric: true }))
        .map((t) => ({ id: t.id, nom: t.nom, capacite: t.capacite }))}
      objets={db.ObjetsPlan.filter((o) => o.zoneId === active?.id)
        .sort((a, b) => a.ordre - b.ordre)
        .map((o) => ({ key: o.id, type: o.type, tableId: o.tableId, libelle: o.libelle, x: o.x, y: o.y, largeur: o.largeur, hauteur: o.hauteur, rotation: o.rotation }))}
      total={db.Tables.filter((t) => !t.archiveeLe).length}
    />
  );
}
