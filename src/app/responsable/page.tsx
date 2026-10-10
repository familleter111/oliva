import { ArrowRight, CallBell, CaretRight, ChatCircleDots, PicnicTable, UsersThree } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { FloorPlan, MemberLine, PlanLegend, StatCard } from "@/components/responsable/parts";
import { Badge, Card, EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { requireStaffPage } from "@/lib/server/auth/session";
import { overview } from "@/lib/server/services/responsable";
import { readDb } from "@/lib/server/storage";

export const metadata: Metadata = { title: "Vue d'ensemble" };

export default async function Page() {
  const auth = await requireStaffPage("tables.affecter");
  const vue = overview(await readDb(), auth);
  const { stats } = vue;
  const zonesActives = vue.zones.filter((z) => vue.tables.some((t) => t.zoneId === z.id));

  return (
    <>
      <PageHeader eyebrow="Votre service" title="Le service, sous votre regard." subtitle="Coordonnez la salle et accompagnez votre équipe." photo />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<PicnicTable size={22} />} label="Tables occupées" value={`${stats.tablesOccupees} / ${stats.tablesTotal}`} />
        <StatCard icon={<UsersThree size={22} />} label="Convives en salle" value={stats.convives} />
        <StatCard icon={<CallBell size={22} />} label="Commandes à servir" value={stats.aServir} accent={stats.aServir > 0} />
        <StatCard icon={<ChatCircleDots size={22} />} label="Demandes en attente" value={stats.demandes} accent={stats.demandes > 0} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] xl:items-start">
        <Card className="p-5">
          <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[1.5rem] leading-tight font-semibold text-ink">Plan de salle</h2>
            <PlanLegend />
          </header>
          {zonesActives.length === 0 ? (
            <EmptyState icon={<PicnicTable size={24} />} title="Aucune table configurée.">
              Les zones et les tables se créent dans l'administration, puis apparaissent ici.
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-5">
              {zonesActives.map((z) => (
                <section key={z.id}>
                  <h3 className="eyebrow mb-2">{z.nom}</h3>
                  <FloorPlan zone={z} tables={vue.tables.filter((t) => t.zoneId === z.id)} selected="" hrefOf={(id) => `/responsable/plan?table=${id}`} />
                </section>
              ))}
            </div>
          )}
          <Link href="/responsable/plan" className={buttonClass("secondary", "md", "mt-4 w-full")}>
            Ouvrir le plan de salle <ArrowRight size={18} />
          </Link>
        </Card>

        <div className="flex flex-col gap-5">
          <Card className="p-5">
            <header className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-[1.35rem] leading-tight font-semibold text-ink">Priorités du service</h2>
              <Link href="/responsable/service" className="press inline-flex items-center gap-1 rounded-lg text-[14.5px] text-muted hover:text-text">
                Tout voir <ArrowRight size={15} />
              </Link>
            </header>
            {vue.priorites.length === 0 ? (
              <p className="rounded-xl bg-olive-tint px-4 py-5 text-center text-[15px] text-muted">Rien en attente. Le service est à jour.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {vue.priorites.map((p) => {
                  const tone = p.type === "demande" || p.type === "addition" ? "warn" : "olive";
                  return (
                    <li key={p.id}>
                      <Link href={p.href} className="press flex items-center gap-3 rounded-xl border border-line bg-white p-3 hover:bg-olive-tint">
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-[1.05rem] font-semibold text-ink">{p.table}</span>
                            <Badge tone={tone} dot>
                              {p.libelle}
                            </Badge>
                          </span>
                          <span className="block text-[14px] text-muted">{p.serveur || "Aucun serveur affecté"}</span>
                        </span>
                        <CaretRight size={16} aria-hidden className="shrink-0 text-muted" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <header className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-[1.35rem] leading-tight font-semibold text-ink">Équipe en service</h2>
              <Link href="/responsable/equipe" className="press inline-flex items-center gap-1 rounded-lg text-[14.5px] text-muted hover:text-text">
                Tout voir <ArrowRight size={15} />
              </Link>
            </header>
            {vue.equipe.length === 0 ? (
              <p className="rounded-xl bg-olive-tint px-4 py-5 text-center text-[15px] text-muted">Aucun membre ne peut encore servir les tables.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {vue.equipe.map((m) => (
                  <li key={m.id}>
                    <MemberLine membre={m} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Card className="mt-5 flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
        <p className="flex items-center gap-3 text-[1.05rem] text-text">
          <span className={`inline-grid size-10 shrink-0 place-items-center rounded-full ${vue.alerte ? "bg-warn-soft text-warn" : "bg-olive-tint text-olive-deep"}`}>
            <ChatCircleDots size={21} aria-hidden />
          </span>
          {vue.alerte || "Aucune demande en attente. Le service se déroule normalement."}
        </p>
        <Link href="/responsable/demandes" className={buttonClass("primary", "md", "max-sm:w-full")}>
          Voir les demandes <ArrowRight size={18} />
        </Link>
      </Card>
    </>
  );
}
