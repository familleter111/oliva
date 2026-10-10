import { ArrowLeft, ArrowRight, CallBell, ChatCircleDots, MapPin, Receipt } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeliverBill, SalleAction } from "@/components/salle/actions";
import { Dishes, Guests, Hour, Money, Notes, OrderBadge, RequestBadge, RequestIcon, two } from "@/components/salle/parts";
import { Crumb } from "@/components/salle/shell";
import { RenewQr, SeatRequests } from "@/components/staff/seats";
import { Badge, Card, EmptyState, buttonClass } from "@/components/ui";
import { requireStaffPage } from "@/lib/server/auth/session";
import { pendingSeats } from "@/lib/server/services/access";
import { tableDetail } from "@/lib/server/services/salle";
import { readDb } from "@/lib/server/storage";

export const metadata: Metadata = { title: "Table" };

export default async function Page({ params }: { params: Promise<{ tableId: string }> }) {
  const auth = await requireStaffPage("commandes.servir");
  const { tableId } = await params;
  const db = await readDb();
  let vue;
  try {
    vue = tableDetail(db, auth, tableId);
  } catch {
    // Table inconnue ou hors du service du membre : même réponse dans les deux cas.
    notFound();
  }
  const fuseau = db.Restaurant[0]?.fuseauHoraire || "Europe/Paris";
  const { addition } = vue;
  const arrivees = pendingSeats(db, new Set([tableId]));

  return (
    <>
      <Crumb label={vue.table.nom} />
      <Link href="/salle" className="press mb-3 inline-flex items-center gap-2 rounded-lg text-[15.5px] text-muted hover:text-text">
        <ArrowLeft size={18} /> Mes tables
      </Link>
      <h1 className="text-[2.4rem] leading-[1.05] font-bold tracking-[-0.025em] text-ink sm:text-[2.9rem]">{vue.table.nom}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-line bg-white px-4 py-2.5 shadow-card">
        <Guests n={vue.convives} />
        <span className="inline-flex items-center gap-1.5 text-[14.5px] text-muted">
          <MapPin size={17} aria-hidden />
          {vue.table.zone || "Sans zone"}
        </span>
        <Badge tone={vue.sessionOuverte ? "olive" : "neutral"} dot>
          {vue.sessionOuverte ? "Session en cours" : "Aucune session ouverte"}
        </Badge>
        <span className="ml-auto">
          <RenewQr tableId={tableId} espace="salle" />
        </span>
      </div>

      {arrivees.length > 0 ? (
        <div className="mt-5">
          <SeatRequests demandes={arrivees} espace="salle" fuseau={fuseau} titre="Arrivées à cette table" />
        </div>
      ) : null}

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <section aria-labelledby="cmd-titre">
          <h2 id="cmd-titre" className="mb-3 text-[1.5rem] leading-tight font-semibold text-ink">
            Commandes de la table
          </h2>
          {vue.commandes.length === 0 ? (
            <Card>
              <EmptyState icon={<CallBell size={24} />} title="Aucune commande envoyée.">
                {vue.sessionOuverte ? "Les convives n'ont encore rien envoyé en cuisine." : "Ouvrez une session de table pour que les convives puissent commander."}
              </EmptyState>
            </Card>
          ) : (
            <ul className="flex flex-col gap-4">
              {vue.commandes.map((o) => (
                <li key={o.id}>
                  <Card className="p-4 sm:p-5">
                    <header className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                      <h3 className="text-[1.25rem] leading-tight font-semibold text-ink">Commande {two(o.rang)}</h3>
                      <OrderBadge order={o} />
                      <span className="ml-auto">
                        <Hour iso={o.creeLe} fuseau={fuseau} />
                      </span>
                    </header>
                    <Dishes lignes={o.lignes} />
                    <div className="mt-3">
                      <Notes notes={o.notes} />
                    </div>
                    {o.prete ? (
                      <Link href={`/salle/servir/${o.id}`} className={buttonClass("primary", "md", "mt-4 w-full")}>
                        Voir la commande à servir <ArrowRight size={18} />
                      </Link>
                    ) : (
                      <p className="mt-4 rounded-xl bg-olive-tint px-4 py-2.5 text-center text-[14.5px] text-muted">
                        {o.servie ? "Commande servie." : `${o.statutNom} en cuisine.`}
                      </p>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-col gap-5">
          <Card className="p-5">
            <h2 className="text-[1.35rem] leading-tight font-semibold text-ink">Demandes de la table</h2>
            {vue.demandes.length === 0 ? (
              <p className="mt-3 rounded-xl bg-olive-tint px-4 py-4 text-center text-[15px] text-muted">Aucune demande en attente.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-3">
                {vue.demandes.map((d) => (
                  <li key={d.id} className="rounded-xl border border-line p-3.5">
                    <div className="flex items-start gap-3">
                      <span className="inline-grid size-10 shrink-0 place-items-center rounded-full bg-olive-soft text-ink">
                        <RequestIcon icone={d.icone} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[1.02rem] font-semibold text-ink">{d.libelle}</p>
                          <RequestBadge statut={d.statut} />
                        </div>
                        <p className="mt-0.5 text-[14px] text-muted">
                          <span className="num">{new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: fuseau }).format(new Date(d.creeLe))}</span>
                          {d.auteur ? ` · ${d.auteur}` : ""}
                        </p>
                        {d.message ? <p className="mt-1.5 text-[14.5px] leading-snug text-text">« {d.message} »</p> : null}
                      </div>
                    </div>
                    {d.addition && addition ? (
                      <Link href={`/salle/additions/${addition.sessionId}`} className={buttonClass("primary", "md", "mt-3 w-full")}>
                        <Receipt size={18} /> Voir l'addition
                      </Link>
                    ) : d.statut === "en_attente" ? (
                      <SalleAction path={`demandes/${d.id}/prendre`} label="Prendre en charge" success="Demande prise en charge." icon={<ArrowRight size={18} />} className="mt-3 w-full" />
                    ) : (
                      <Link href={`/salle/demandes/${d.id}`} className={buttonClass("secondary", "md", "mt-3 w-full")}>
                        Voir le détail <ArrowRight size={18} />
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-[1.35rem] leading-tight font-semibold text-ink">Addition de la table</h2>
            {!addition ? (
              <p className="mt-3 rounded-xl bg-olive-tint px-4 py-4 text-center text-[15px] text-muted">Aucune commande : il n'y a pas encore d'addition.</p>
            ) : (
              <div className="mt-3 text-center">
                <span className="mx-auto inline-grid size-14 place-items-center rounded-full bg-olive-soft text-ink">
                  <Receipt size={26} aria-hidden />
                </span>
                <p className="mt-2 text-[15px] text-muted">
                  {addition.statut === "remise" ? "Addition remise" : addition.statut === "cloturee" ? "Addition clôturée" : "Addition en cours"}
                </p>
                <Money cents={addition.totalCentimes} devise={addition.devise} className="mt-0.5 block text-[2rem] leading-tight font-bold text-ink" />
                <Link href={`/salle/additions/${addition.sessionId}`} className={buttonClass("secondary", "md", "mt-4 w-full")}>
                  Voir l'addition <ArrowRight size={18} />
                </Link>
                {addition.statut === "a_remettre" ? <DeliverBill addition={addition} className="mt-2 w-full" /> : null}
              </div>
            )}
          </Card>

          <p className="flex items-start gap-2 px-1 text-[14px] leading-snug text-muted">
            <ChatCircleDots size={17} aria-hidden className="mt-0.5 shrink-0" />
            Les convives voient aussitôt qu'une demande est prise en charge.
          </p>
        </div>
      </div>
    </>
  );
}
