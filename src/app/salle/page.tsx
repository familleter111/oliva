import { ArrowRight, CallBell, ChatCircleDots, CheckCircle, Clock, PicnicTable, Plant, Receipt } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { Guests, TableTile } from "@/components/salle/parts";
import { Badge, Card, EmptyState, PageHeader, Thumb, buttonClass } from "@/components/ui";
import { requireStaffPage } from "@/lib/server/auth/session";
import { homeOf } from "@/lib/server/services/salle";
import { readDb } from "@/lib/server/storage";

export const metadata: Metadata = { title: "Mes tables" };

const ETAT = {
  libre: { tone: "neutral" as const, label: "Table libre", icon: Clock },
  en_cours: { tone: "info" as const, label: "Session en cours", icon: Clock },
  prete: { tone: "olive" as const, label: "Commande prête", icon: CheckCircle },
  addition: { tone: "warn" as const, label: "Addition demandée", icon: Receipt },
};

const PRIORITE = { servir: CallBell, demande: ChatCircleDots, addition: Receipt };

export default async function Page() {
  const auth = await requireStaffPage("commandes.servir");
  const home = homeOf(await readDb(), auth);
  const stats = [
    { icon: <PicnicTable size={19} aria-hidden />, texte: `${home.stats.tables} table${home.stats.tables > 1 ? "s" : ""} ${home.toutesLesTables ? "au total" : "attribuée" + (home.stats.tables > 1 ? "s" : "")}` },
    { icon: <CallBell size={19} aria-hidden />, texte: `${home.stats.pretes} commande${home.stats.pretes > 1 ? "s" : ""} prête${home.stats.pretes > 1 ? "s" : ""}` },
    { icon: <ChatCircleDots size={19} aria-hidden />, texte: `${home.stats.demandes} demande${home.stats.demandes > 1 ? "s" : ""} à traiter` },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Votre service"
        title="Vos tables, en un coup d'œil."
        subtitle={home.toutesLesTables ? "Toutes les tables du restaurant, pour accompagner chaque session." : "Les priorités de votre zone, pour accompagner chaque table."}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div>
          <ul className="mb-5 flex flex-wrap gap-2.5">
            {stats.map((s) => (
              <li key={s.texte} className="inline-flex items-center gap-2.5 rounded-full border border-line bg-white px-4 py-2 text-[15px] text-text shadow-card">
                <span className="text-olive-deep">{s.icon}</span>
                {s.texte}
              </li>
            ))}
          </ul>

          {home.tables.length === 0 ? (
            <Card>
              <EmptyState icon={<PicnicTable size={24} />} title="Aucune table ne vous est affectée.">
                Un responsable attribue les tables depuis Zones &amp; tables. Vous verrez ici celles dont vous avez la charge.
              </EmptyState>
            </Card>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {home.tables.map((t) => {
                const etat = ETAT[t.etat];
                const Icon = etat.icon;
                return (
                  <li key={t.id}>
                    <Card className="flex h-full flex-col gap-4 p-4 sm:p-5">
                      <div className="flex items-start gap-4">
                        <TableTile couleur={t.couleur} capacite={t.capacite} className="size-[74px]" />
                        <div className="min-w-0 flex-1">
                          <h2 className="text-[1.5rem] leading-tight font-bold text-ink">{t.nom}</h2>
                          <p className="mt-0.5 text-[14.5px] text-muted">{t.zone}</p>
                          {t.convives > 0 ? (
                            <div className="mt-1">
                              <Guests n={t.convives} />
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={etat.tone} className="gap-1.5">
                          <Icon size={16} weight="fill" aria-hidden />
                          {etat.label}
                        </Badge>
                        {t.demandes > 0 ? (
                          <Badge tone="warn" dot>
                            {t.demandes} demande{t.demandes > 1 ? "s" : ""}
                          </Badge>
                        ) : null}
                      </div>
                      <Link href={`/salle/tables/${t.id}`} className={buttonClass("primary", "md", "mt-auto w-full")}>
                        Voir la table <ArrowRight size={18} />
                      </Link>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <Card className="p-5 lg:sticky lg:top-[72px]">
          <h2 className="text-[1.35rem] leading-tight font-semibold text-ink">À faire maintenant</h2>
          <p className="mt-0.5 text-[15px] text-muted">Vos prochaines actions.</p>
          {home.priorites.length === 0 ? (
            <p className="mt-5 rounded-xl bg-olive-tint px-4 py-5 text-center text-[15px] text-muted">Rien en attente. Le service est à jour.</p>
          ) : (
            <ol className="mt-4 flex flex-col gap-2">
              {home.priorites.map((p, i) => {
                const Icon = PRIORITE[p.type];
                return (
                  <li key={p.id}>
                    <Link href={p.href} className="press flex items-center gap-3 rounded-xl border border-line bg-white p-2.5 hover:bg-olive-tint">
                      <span className="num inline-grid size-7 shrink-0 place-items-center rounded-full bg-olive-soft text-[14px] font-semibold text-ink">{i + 1}</span>
                      {p.image ? <Thumb src={p.image} alt="" className="size-12" /> : <span className="inline-grid size-12 shrink-0 place-items-center rounded-lg bg-olive-tint text-olive-deep"><Icon size={22} aria-hidden /></span>}
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15.5px] font-semibold text-ink">{p.table}</span>
                        <span className="block truncate text-[14.5px] text-muted">{p.texte}</span>
                      </span>
                      <ArrowRight size={17} aria-hidden className="shrink-0 text-muted" />
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
          <p className="mt-5 flex items-center gap-2 border-t border-line pt-4 text-[14px] text-muted">
            <Plant size={17} weight="fill" aria-hidden className="text-olive" />
            Mise à jour en direct pendant le service.
          </p>
        </Card>
      </div>
    </>
  );
}
