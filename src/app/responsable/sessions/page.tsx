import { CallBell, CaretRight, ChatCircleDots, PicnicTable, UsersThree } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { CloseSession, OpenSession, RenewCode, TransferTable } from "@/components/responsable/actions";
import { StatCard, TableBadge } from "@/components/responsable/parts";
import { Crumb } from "@/components/responsable/shell";
import { Money } from "@/components/salle/parts";
import { Avatar, Badge, Callout, Card, EmptyState, PageHeader, TableWrap, Td, Th, buttonClass } from "@/components/ui";
import { cn, relativeTime } from "@/lib/format";
import { requireStaffPage } from "@/lib/server/auth/session";
import { chefTableDetail, overview, sessionsBoard } from "@/lib/server/services/responsable";
import { readDb } from "@/lib/server/storage";

export const metadata: Metadata = { title: "Sessions de table" };

export default async function Page({ searchParams }: { searchParams: Promise<{ vue?: string; table?: string }> }) {
  const auth = await requireStaffPage("tables.affecter");
  const { vue: ongletParam, table } = await searchParams;
  const db = await readDb();
  const board = sessionsBoard(db, auth);
  const onglet = ongletParam === "disponibles" ? "disponibles" : "actives";
  const liste = onglet === "disponibles" ? board.disponibles : board.actives;
  const selectedId = table && [...board.actives, ...board.disponibles].some((t) => t.id === table) ? table : liste[0]?.id;
  const detail = selectedId ? chefTableDetail(db, auth, selectedId) : null;
  const membres = overview(db, auth).equipe;
  const lien = (v: string, t?: string) => `/responsable/sessions?${new URLSearchParams({ vue: v, ...(t ? { table: t } : {}) }).toString()}`;

  return (
    <>
      {detail ? <Crumb label={detail.table.nom} /> : null}
      <PageHeader eyebrow="Votre service" title="Une table, une session bien définie." subtitle="Ouvrez l'accès aux nouveaux clients et terminez les sessions après le service." photo />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<PicnicTable size={22} />} label="Tables occupées" value={`${board.stats.tablesOccupees} / ${board.stats.tablesTotal}`} />
        <StatCard icon={<UsersThree size={22} />} label="Convives en salle" value={board.stats.convives} />
        <StatCard icon={<CallBell size={22} />} label="Commandes à servir" value={board.stats.aServir} accent={board.stats.aServir > 0} />
        <StatCard icon={<ChatCircleDots size={22} />} label="Demandes en attente" value={board.stats.demandes} accent={board.stats.demandes > 0} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-start">
        <Card className="p-5">
          <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[1.5rem] leading-tight font-semibold text-ink">Sessions de table</h2>
            <nav aria-label="Filtrer les tables" className="flex gap-2">
              <Link href={lien("actives")} aria-current={onglet === "actives" ? "page" : undefined} className={buttonClass(onglet === "actives" ? "primary" : "secondary", "sm")}>
                Tables actives ({board.actives.length})
              </Link>
              <Link href={lien("disponibles")} aria-current={onglet === "disponibles" ? "page" : undefined} className={buttonClass(onglet === "disponibles" ? "primary" : "secondary", "sm")}>
                Tables disponibles ({board.disponibles.length})
              </Link>
            </nav>
          </header>

          {liste.length === 0 ? (
            <EmptyState icon={<PicnicTable size={24} />} title={onglet === "actives" ? "Aucune session ouverte." : "Toutes les tables sont occupées."}>
              {onglet === "actives" ? "Ouvrez une session depuis l'onglet « Tables disponibles » à l'arrivée des clients." : "Fermez une session après le départ des clients pour libérer la table."}
            </EmptyState>
          ) : (
            <TableWrap>
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>Table</Th>
                    <Th>Convives</Th>
                    <Th>Serveur</Th>
                    <Th>Statut</Th>
                    <Th>{onglet === "actives" ? "Dernière activité" : "Zone"}</Th>
                    <Th><span className="sr-only">Ouvrir</span></Th>
                  </tr>
                </thead>
                <tbody>
                  {liste.map((t) => (
                    <tr key={t.id} className={cn(t.id === selectedId && "bg-olive-tint")}>
                      <Td className="font-medium text-ink">{t.nom}</Td>
                      <Td className="num">{t.sessionId ? t.convives : "—"}</Td>
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
                        <Badge tone={t.sessionId ? "olive" : "neutral"} dot>
                          {t.sessionId ? "Ouverte" : "Disponible"}
                        </Badge>
                      </Td>
                      <Td className="text-muted">{onglet === "actives" ? relativeTime(t.derniereActiviteLe || t.ouverteLe) : t.zone}</Td>
                      <Td className="text-right">
                        <Link href={lien(onglet, t.id)} aria-label={`Voir la ${t.nom.toLowerCase()}`} className="press inline-grid size-9 place-items-center rounded-lg text-muted hover:bg-olive-soft hover:text-ink">
                          <CaretRight size={17} aria-hidden />
                        </Link>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>

        {detail ? (
          <Card className="p-5 xl:sticky xl:top-[72px]">
            <header className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[1.8rem] leading-tight font-bold text-ink">{detail.table.nom}</h2>
              <TableBadge etat={detail.table.etat} />
            </header>

            {detail.table.sessionId ? (
              <>
                <p className="mt-2 flex items-center gap-2 text-[15px] text-muted">
                  <UsersThree size={18} aria-hidden /> {detail.table.convives} convive{detail.table.convives > 1 ? "s" : ""}
                  {detail.table.serveur ? ` · Serveur : ${detail.table.serveur}` : " · Aucun serveur affecté"}
                </p>

                <h3 className="mt-5 text-[1.1rem] font-semibold text-ink">Code de la session</h3>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <p className="flex gap-2" data-code={detail.code}>
                    {/* Les chiffres sont séparés pour l'oeil ; la lecture vocale passe par le texte caché. */}
                    <span className="sr-only">{`Code de session : ${detail.code.split("").join(" ")}`}</span>
                    {detail.code.split("").map((c, i) => (
                      <span key={i} aria-hidden className="num inline-grid size-12 place-items-center rounded-xl border border-line bg-paper text-[1.5rem] font-semibold text-ink">
                        {c}
                      </span>
                    ))}
                  </p>
                  <RenewCode sessionId={detail.table.sessionId} nom={detail.table.nom} />
                </div>
                <p className="mt-1.5 text-[14px] text-muted">Les convives le saisissent une fois, à leur arrivée.</p>

                <ul className="mt-5 flex flex-col gap-2">
                  <li className="flex items-center justify-between gap-3 rounded-xl bg-olive-tint px-4 py-3">
                    <span className="flex items-center gap-2 text-[15px] text-text">
                      <CallBell size={19} aria-hidden /> Commandes
                    </span>
                    <span className="text-[15px] font-medium text-ink">
                      {detail.table.pretes + detail.table.enPreparation > 0 ? `${detail.table.pretes + detail.table.enPreparation} en cours` : detail.commandes.length > 0 ? "toutes servies" : "aucune"}
                    </span>
                  </li>
                  <li className="flex items-center justify-between gap-3 rounded-xl bg-olive-tint px-4 py-3">
                    <span className="flex items-center gap-2 text-[15px] text-text">
                      <PicnicTable size={19} aria-hidden /> Addition
                    </span>
                    <span className="text-[15px] font-medium text-ink">
                      <Money cents={detail.additionCentimes} devise={detail.devise} /> · {detail.additionRemise ? "remise" : "pas encore remise"}
                    </span>
                  </li>
                </ul>

                <div className="mt-5 flex flex-col gap-2">
                  <Link href={`/salle/tables/${detail.table.id}`} className={buttonClass("secondary", "md", "w-full")}>
                    Voir la table
                  </Link>
                  <TransferTable table={detail.table} membres={membres} className="w-full" />
                  <CloseSession table={detail.table} pretes={detail.table.pretes} enPreparation={detail.table.enPreparation} additionRemise={detail.additionRemise} />
                </div>
              </>
            ) : (
              <>
                <p className="mt-2 text-[15px] text-muted">
                  {detail.table.zone} · {detail.table.capacite} place{detail.table.capacite > 1 ? "s" : ""}
                  {detail.table.serveur ? ` · Serveur : ${detail.table.serveur}` : ""}
                </p>
                <p className="mt-4 rounded-xl bg-olive-tint px-4 py-4 text-[15px] text-muted">Aucune session en cours. Ouvrez-en une à l'arrivée des clients pour leur donner le code.</p>
                <div className="mt-4 flex flex-col gap-2">
                  <OpenSession tableId={detail.table.id} nom={detail.table.nom} className="w-full" />
                  <TransferTable table={detail.table} membres={membres} label="Affecter un serveur" className="w-full" />
                </div>
              </>
            )}
          </Card>
        ) : null}
      </div>

      <Callout tone="info" className="mt-5">Une nouvelle session dispose de son propre panier et de son propre historique client.</Callout>
    </>
  );
}
