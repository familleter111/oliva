import { ArrowRight, CallBell, ChatCircleDots, PicnicTable, UsersThree } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { TransferTable } from "@/components/responsable/actions";
import { StatCard, TableBadge } from "@/components/responsable/parts";
import { hour, two } from "@/components/salle/parts";
import { Avatar, Badge, Card, EmptyState, PageHeader, TableWrap, Td, Th, buttonClass } from "@/components/ui";
import { requireStaffPage } from "@/lib/server/auth/session";
import { team } from "@/lib/server/services/responsable";
import { readDb } from "@/lib/server/storage";

export const metadata: Metadata = { title: "Équipe & affectations" };

export default async function Page() {
  const auth = await requireStaffPage("tables.affecter");
  const db = await readDb();
  const vue = team(db, auth);
  const fuseau = db.Restaurant[0]?.fuseauHoraire || "Europe/Paris";
  const occupees = vue.tables.filter((t) => t.sessionId);

  return (
    <>
      <PageHeader eyebrow="Équipe & affectations" title="Une équipe, un service fluide." subtitle="Répartissez les tables selon la charge actuelle de chacun." />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard icon={<UsersThree size={22} />} label="Serveurs en service" value={vue.stats.serveurs} />
        <StatCard icon={<PicnicTable size={22} />} label="Convives installés" value={vue.stats.convives} />
        <StatCard icon={<PicnicTable size={22} />} label="Tables occupées" value={`${vue.stats.tablesOccupees} / ${vue.stats.tablesTotal}`} />
      </div>

      {vue.membres.length === 0 ? (
        <Card className="mt-5">
          <EmptyState icon={<UsersThree size={24} />} title="Aucun membre ne peut servir les tables.">
            Accordez le droit « Marquer servi » à un rôle dans Rôles &amp; droits, puis affectez des tables.
          </EmptyState>
        </Card>
      ) : (
        <ul className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {vue.membres.map((m) => (
            <li key={m.id}>
              <Card className="flex h-full flex-col gap-4 p-5">
                <div className="flex items-center gap-4">
                  <Avatar name={m.nom} className="size-14 text-[1.3rem]" />
                  <div className="min-w-0">
                    <p className="text-[1.3rem] leading-tight font-semibold text-ink">{m.nom}</p>
                    <Badge tone={m.etat === "en_service" ? "olive" : "neutral"} dot className="mt-1">
                      {m.etat === "en_service" ? "En service" : "Disponible"}
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <p className="rounded-xl bg-olive-tint px-3 py-2.5">
                    <span className="num block text-[1.3rem] leading-tight font-bold text-ink">{m.tables.length}</span>
                    <span className="text-[14px] text-muted">table{m.tables.length > 1 ? "s" : ""}</span>
                  </p>
                  <p className="rounded-xl bg-olive-tint px-3 py-2.5">
                    <span className="num block text-[1.3rem] leading-tight font-bold text-ink">{m.convives}</span>
                    <span className="text-[14px] text-muted">convive{m.convives > 1 ? "s" : ""}</span>
                  </p>
                </div>
                {m.tables.length > 0 ? (
                  <ul className="flex flex-wrap gap-2">
                    {m.tables.map((t) => (
                      <li key={t.id}>
                        <Link href={`/responsable/plan?table=${t.id}`} className="press inline-flex rounded-full bg-olive-soft px-3 py-1 text-[14.5px] text-ink hover:bg-olive/15">
                          {t.nom}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[15px] text-muted">Aucune table en cours.</p>
                )}
                {m.tables.length > 0 ? (
                  <Link href={`/responsable/plan?table=${m.tables[0].id}`} className={buttonClass("primary", "md", "mt-auto w-full")}>
                    Voir ses tables <ArrowRight size={18} />
                  </Link>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card className="mt-5 p-5">
        <h2 className="mb-4 text-[1.5rem] leading-tight font-semibold text-ink">Répartition des tables</h2>
        {occupees.length === 0 ? (
          <p className="rounded-xl bg-olive-tint px-4 py-5 text-center text-[15px] text-muted">Aucune table n'est occupée pour le moment.</p>
        ) : (
          <TableWrap>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>Table</Th>
                  <Th>Convives</Th>
                  <Th>Serveur</Th>
                  <Th>Situation</Th>
                  <Th className="text-right">Action</Th>
                </tr>
              </thead>
              <tbody>
                {occupees.map((t) => (
                  <tr key={t.id}>
                    <Td className="font-medium text-ink">{t.nom}</Td>
                    <Td className="num">{t.convives}</Td>
                    <Td>
                      {t.serveur ? (
                        <span className="flex items-center gap-2">
                          <Avatar name={t.serveur} className="size-8 text-[13px]" />
                          {t.serveur}
                        </span>
                      ) : (
                        <span className="text-muted">Aucun</span>
                      )}
                    </Td>
                    <Td>
                      <TableBadge etat={t.etat} />
                    </Td>
                    <Td className="text-right">
                      <TransferTable table={t} membres={vue.membres} label="Modifier" />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 text-[1.35rem] leading-tight font-semibold text-ink">
            <ChatCircleDots size={21} aria-hidden /> Demandes clients en cours
          </h2>
          {vue.demandes.length === 0 ? (
            <p className="rounded-xl bg-olive-tint px-4 py-4 text-center text-[15px] text-muted">Aucune demande en attente.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {vue.demandes.map((d) => (
                <li key={d.id}>
                  <Link href="/responsable/demandes" className="press flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 hover:bg-olive-tint">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[1.02rem] font-semibold text-ink">{d.table}</span>
                      <span className="block truncate text-[14.5px] text-muted">{d.libelle}</span>
                    </span>
                    <span className="num shrink-0 text-[13.5px] text-muted">{hour(d.creeLe, fuseau)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 text-[1.35rem] leading-tight font-semibold text-ink">
            <CallBell size={21} aria-hidden /> Commandes prêtes à servir
          </h2>
          {vue.pretes.length === 0 ? (
            <p className="rounded-xl bg-olive-tint px-4 py-4 text-center text-[15px] text-muted">Aucune commande en attente de service.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {vue.pretes.map((o) => (
                <li key={o.id}>
                  <Link href={`/salle/servir/${o.id}`} className="press flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 hover:bg-olive-tint">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[1.02rem] font-semibold text-ink">{o.table}</span>
                      <span className="block truncate text-[14.5px] text-muted">
                        Commande {two(o.rang)} · {o.articles} article{o.articles > 1 ? "s" : ""}
                      </span>
                    </span>
                    <span className="num shrink-0 text-[13.5px] text-muted">{hour(o.creeLe, fuseau)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
