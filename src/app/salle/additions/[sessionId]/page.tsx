import { ArrowLeft, ArrowRight, Info, Receipt } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeliverBill, PrintButton } from "@/components/salle/actions";
import { BillBadge, Hour, Lines, Money, two } from "@/components/salle/parts";
import { Crumb } from "@/components/salle/shell";
import { Card, buttonClass } from "@/components/ui";
import { requireStaffPage } from "@/lib/server/auth/session";
import { billDetail } from "@/lib/server/services/salle";
import { readDb } from "@/lib/server/storage";

export const metadata: Metadata = { title: "Addition" };

export default async function Page({ params }: { params: Promise<{ sessionId: string }> }) {
  const auth = await requireStaffPage("commandes.servir");
  const { sessionId } = await params;
  const db = await readDb();
  let vue;
  try {
    vue = billDetail(db, auth, sessionId);
  } catch {
    notFound();
  }
  const { addition: a, commandes, demande } = vue;
  const fuseau = db.Restaurant[0]?.fuseauHoraire || "Europe/Paris";

  return (
    <>
      <Crumb label={a.table} />
      <Link href="/salle/additions" className="press no-print mb-3 inline-flex items-center gap-2 rounded-lg text-[15.5px] text-muted hover:text-text">
        <ArrowLeft size={18} /> Additions
      </Link>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div>
          <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h1 className="text-[2.1rem] leading-[1.05] font-bold tracking-[-0.025em] text-ink sm:text-[2.7rem]">L'addition de la {a.table.toLowerCase()}.</h1>
            <BillBadge statut={a.statut} />
          </header>
          <p className="mt-1 text-[1.15rem] text-muted">
            {a.convives} convive{a.convives > 1 ? "s" : ""} · {a.nbCommandes} commande{a.nbCommandes > 1 ? "s" : ""} confirmée{a.nbCommandes > 1 ? "s" : ""}
          </p>

          <Card className="mt-5 p-4 sm:p-6">
            {commandes.map((o) => (
              <section key={o.id} className="border-t border-line pt-5 first:border-t-0 first:pt-0">
                <header className="mb-3 flex items-center justify-between gap-4">
                  <h2 className="text-[1.25rem] leading-tight font-semibold text-ink">Commande {two(o.rang)}</h2>
                  <Hour iso={o.creeLe} fuseau={fuseau} />
                </header>
                <Lines lignes={o.lignes} devise={o.devise} />
                <p className="mt-3 flex items-center justify-between border-t border-line pt-3 text-[15.5px]">
                  <span className="text-muted">Sous-total commande {two(o.rang)}</span>
                  <Money cents={o.totalCentimes} devise={o.devise} className="font-semibold text-ink" />
                </p>
              </section>
            ))}

            <div className="mt-5 border-t border-line pt-4">
              <p className="flex items-center justify-between text-[15.5px]">
                <span className="text-muted">
                  {a.servicePourcentage > 0 ? `Service (${a.servicePourcentage.toString().replace(".", ",")} %)` : "Service inclus"}
                </span>
                <Money cents={a.serviceCentimes} devise={a.devise} className="text-ink" />
              </p>
              <p className="mt-3 flex items-center justify-between rounded-xl bg-olive-soft px-4 py-3">
                <span className="text-[1.15rem] font-semibold text-ink">Total de l'addition</span>
                <Money cents={a.totalCentimes} devise={a.devise} className="text-[1.6rem] font-bold text-ink" />
              </p>
            </div>
          </Card>
        </div>

        <Card className="no-print bg-olive-tint p-5 text-center lg:sticky lg:top-[72px]">
          <span className="mx-auto inline-grid size-14 place-items-center rounded-full bg-olive-soft text-ink">
            <Receipt size={26} aria-hidden />
          </span>
          <h2 className="mt-3 text-[1.4rem] leading-tight font-semibold text-ink">
            {a.statut === "cloturee" ? "Addition clôturée" : a.statut === "remise" ? "Addition remise" : demande ? "Addition demandée" : "Addition en cours"}
          </h2>
          <p className="mt-1 text-[15px] text-muted">
            {a.statut === "cloturee"
              ? "La session de cette table est terminée. Les montants ne bougent plus."
              : a.statut === "remise"
                ? `Remise${a.remisePar ? ` par ${a.remisePar}` : ""} à ${new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: fuseau }).format(new Date(a.remiseLe))}.`
                : demande
                  ? "Préparez l'addition et apportez-la à la table."
                  : "La table n'a pas encore demandé son addition."}
          </p>

          <div className="mt-5 flex flex-col gap-2.5">
            <PrintButton />
            {a.statut === "a_remettre" ? <DeliverBill addition={a} label="Marquer l'addition remise" size="lg" className="w-full" /> : null}
            <Link href={`/salle/tables/${a.tableId}`} className={buttonClass("ghost", "md", "w-full")}>
              Voir la table <ArrowRight size={18} />
            </Link>
          </div>

          <p className="mt-5 flex items-start gap-2 border-t border-line pt-4 text-left text-[14px] leading-snug text-muted">
            <Info size={17} aria-hidden className="mt-0.5 shrink-0" />
            La remise de l'addition ne confirme pas un paiement. Le règlement reste traité selon l'organisation du restaurant.
          </p>
        </Card>
      </div>
    </>
  );
}
