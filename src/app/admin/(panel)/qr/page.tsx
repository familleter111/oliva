import type { Metadata } from "next";
import { requirePage } from "@/lib/server/auth/session";
import { ID } from "@/lib/server/defaults";
import { must } from "@/lib/server/db-utils";
import { isLocalBase, qrSvg, siteBase, tableUrl } from "@/lib/server/services/qr";
import { readDb } from "@/lib/server/storage";
import { thumbOf } from "@/lib/server/view";
import { QrEditor } from "./editor";

export const metadata: Metadata = { title: "QR codes & sessions" };

export default async function Page({ searchParams }: { searchParams: Promise<{ table?: string }> }) {
  const auth = await requirePage("salle.configurer");
  const { table } = await searchParams;
  const db = await readDb();
  const zones = new Map(db.Zones.map((z) => [z.id, z.nom]));
  const tables = db.Tables.filter((t) => !t.archiveeLe).sort((a, b) => a.nom.localeCompare(b.nom, "fr", { numeric: true }));
  const current = tables.find((t) => t.id === table) ?? tables[0];
  const base = await siteBase();
  const regles = must(db, "ReglesAccesTable", ID.acces);
  const resto = db.Restaurant[0];

  return (
    <QrEditor
      peutGererSessions={auth.can("sessions.gerer")}
      regles={{ politique: regles.politique, validiteCode: regles.validiteCode, wifi: regles.wifi }}
      tables={tables.map((t) => {
        const s = db.SessionsTable.find((x) => x.tableId === t.id && x.statut === "ouverte");
        return { id: t.id, nom: t.nom, zone: zones.get(t.zoneId) ?? "", capacite: t.capacite, active: t.active, session: s ? { id: s.id, code: s.code, ouverteLe: s.ouverteLe, participants: db.Participants.filter((p) => p.sessionId === s.id && p.statut === "admis").length } : null };
      })}
      selection={current ? { id: current.id, nom: current.nom, url: tableUrl(base, current.id), svg: await qrSvg(tableUrl(base, current.id)) } : null}
      marque={{ nom: resto?.nom || "Oliva", sousTitre: resto?.sousTitre ?? "", logo: thumbOf(db, resto?.logoMediaId ?? "") }}
      baseLocale={isLocalBase(base)}
      base={base}
    />
  );
}
