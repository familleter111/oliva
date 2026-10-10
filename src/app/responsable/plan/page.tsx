import { ArrowRight, CallBell, ChatCircleDots, ClockCounterClockwise, PicnicTable, UsersThree } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { TransferTable } from "@/components/responsable/actions";
import { FloorPlan, PlanLegend, TableBadge } from "@/components/responsable/parts";
import { Crumb } from "@/components/responsable/shell";
import { RenewQr } from "@/components/staff/seats";
import { hour } from "@/components/salle/parts";
import { Card, EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { cn, formatMoney } from "@/lib/format";
import { requireStaffPage } from "@/lib/server/auth/session";
import { chefTableDetail, chefTables, floorZones, overview } from "@/lib/server/services/responsable";
import { readDb } from "@/lib/server/storage";

export const metadata: Metadata = { title: "Plan de salle" };

export default async function Page({ searchParams }: { searchParams: Promise<{ zone?: string; table?: string }> }) {
  const auth = await requireStaffPage("tables.affecter");
  const { zone, table } = await searchParams;
  const db = await readDb();
  const tables = chefTables(db, auth);
  const zones = floorZones(db).filter((z) => tables.some((t) => t.zoneId === z.id));
  const vues = zone && zones.some((z) => z.id === zone) ? zones.filter((z) => z.id === zone) : zones;
  const selectedId = table && tables.some((t) => t.id === table) ? table : (tables.find((t) => t.etat === "a_servir") ?? tables.find((t) => t.sessionId) ?? tables[0])?.id;
  const detail = selectedId ? chefTableDetail(db, auth, selectedId) : null;
  const membres = overview(db, auth).equipe;
  const fuseau = db.Restaurant[0]?.fuseauHoraire || "Europe/Paris";
  const lien = (z: string) => `/responsable/plan?${new URLSearchParams({ ...(z ? { zone: z } : {}), ...(selectedId ? { table: selectedId } : {}) }).toString()}`;

  return (
    <>
      {detail ? <Crumb label={detail.table.nom} /> : null}
      <PageHeader eyebrow="Service en cours" title="Chaque table, à la bonne place." subtitle="Une vue de toute la salle et du serveur affecté à chaque table." />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Zones" className="flex flex-wrap gap-2">
          <Link href={lien("")} aria-current={!zone ? "page" : undefined} className={buttonClass(!zone ? "primary" : "secondary", "sm")}>
            Toutes les zones
          </Link>
          {zones.map((z) => (
            <Link key={z.id} href={lien(z.id)} aria-current={zone === z.id ? "page" : undefined} className={buttonClass(zone === z.id ? "primary" : "secondary", "sm")}>
              {z.nom}
            </Link>
          ))}
        </nav>
        <PlanLegend />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] xl:items-start">
        <Card className="p-5">
          {vues.length === 0 ? (
            <EmptyState icon={<PicnicTable size={24} />} title="Aucune table configurée.">
              Les zones et les tables se créent dans l'administration, puis apparaissent ici.
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-6">
              {vues.map((z) => (
                <section key={z.id}>
                  <h2 className="eyebrow mb-2">{z.nom}</h2>
                  <FloorPlan zone={z} tables={tables.filter((t) => t.zoneId === z.id)} selected={selectedId ?? ""} hrefOf={(id) => `/responsable/plan?${new URLSearchParams({ ...(zone ? { zone } : {}), table: id }).toString()}`} />
                </section>
              ))}
            </div>
          )}
        </Card>

        {detail ? (
          <Card className="p-5 xl:sticky xl:top-[72px]">
            <header className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[1.9rem] leading-tight font-bold text-ink">{detail.table.nom}</h2>
              <TableBadge etat={detail.table.etat} />
            </header>
            <ul className="mt-2 flex flex-col gap-1.5 text-[15px] text-muted">
              <li className="flex items-center gap-2">
                <UsersThree size={18} aria-hidden /> {detail.table.convives} convive{detail.table.convives > 1 ? "s" : ""} · {detail.table.capacite} place{detail.table.capacite > 1 ? "s" : ""}
              </li>
              <li className="flex items-center gap-2">
                <PicnicTable size={18} aria-hidden /> Serveur : {detail.table.serveur || "aucun"}
              </li>
              {detail.table.sessionId ? (
                <li className="flex items-center gap-2">
                  <CallBell size={18} aria-hidden /> Addition en cours : <span className="num text-text">{formatMoney(detail.additionCentimes, detail.devise)}</span>
                </li>
              ) : null}
            </ul>

            {detail.table.pretes > 0 ? (
              <p className="mt-4 flex items-center gap-2.5 rounded-xl bg-olive-soft px-4 py-3 text-[15px] text-ink">
                <CallBell size={20} aria-hidden className="shrink-0 text-olive-deep" />
                {detail.table.pretes === 1 ? "Une commande est prête à servir." : `${detail.table.pretes} commandes sont prêtes à servir.`}
              </p>
            ) : null}

            <div className="mt-4 flex flex-col gap-2">
              <Link href={`/salle/tables/${detail.table.id}`} className={buttonClass("primary", "md", "w-full")}>
                Voir la table <ArrowRight size={18} />
              </Link>
              <TransferTable table={detail.table} membres={membres} className="w-full" />
              <RenewQr tableId={detail.table.id} espace="responsable" className="w-full" />
            </div>

            <section className="mt-5 border-t border-line pt-4">
              <h3 className="text-[1.1rem] font-semibold text-ink">Demandes en cours</h3>
              {detail.demandes.length === 0 ? (
                <p className="mt-1.5 text-[15px] text-muted">Aucune demande pour cette table.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {detail.demandes.map((d) => (
                    <li key={d.id}>
                      <Link href={`/salle/demandes/${d.id}`} className="press flex items-center gap-2.5 rounded-xl bg-warn-soft px-3 py-2.5 text-[15px] text-warn">
                        <ChatCircleDots size={18} aria-hidden className="shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{d.libelle}</span>
                        <span className="num shrink-0 text-[13.5px]">{hour(d.creeLe, fuseau)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-5 border-t border-line pt-4">
              <h3 className="flex items-center gap-2 text-[1.1rem] font-semibold text-ink">
                <ClockCounterClockwise size={19} aria-hidden /> Dernières actions
              </h3>
              {detail.actions.length === 0 ? (
                <p className="mt-1.5 text-[15px] text-muted">Aucune action enregistrée pour cette table.</p>
              ) : (
                <ol className="mt-2 flex flex-col gap-2.5">
                  {detail.actions.map((a, i) => (
                    <li key={`${a.date}-${i}`} className="flex gap-3">
                      <span aria-hidden className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", i === 0 ? "bg-olive" : "bg-line-strong")} />
                      <span className="min-w-0">
                        <span className="num block text-[13.5px] text-muted">{hour(a.date, fuseau)}</span>
                        <span className="block text-[15px] text-text">{a.libelle}</span>
                        {a.detail ? <span className="block text-[13.5px] text-muted">{a.detail}</span> : null}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </Card>
        ) : null}
      </div>
    </>
  );
}
