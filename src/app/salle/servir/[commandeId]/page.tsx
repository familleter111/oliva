import { ArrowLeft, CheckCircle, Info } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SalleAction } from "@/components/salle/actions";
import { Hour, Lines, Money, Notes, OrderBadge, two } from "@/components/salle/parts";
import { Crumb } from "@/components/salle/shell";
import { Callout, Card, buttonClass } from "@/components/ui";
import { requireStaffPage } from "@/lib/server/auth/session";
import { orderDetail } from "@/lib/server/services/salle";
import { readDb } from "@/lib/server/storage";

export const metadata: Metadata = { title: "Commande à servir" };

export default async function Page({ params }: { params: Promise<{ commandeId: string }> }) {
  const auth = await requireStaffPage("commandes.servir");
  const { commandeId } = await params;
  const db = await readDb();
  let vue;
  try {
    vue = orderDetail(db, auth, commandeId);
  } catch {
    notFound();
  }
  const o = vue.commande;
  const fuseau = db.Restaurant[0]?.fuseauHoraire || "Europe/Paris";
  const enCours = vue.autres.filter((a) => !a.servie);

  return (
    <>
      <Crumb label={`${o.table} · commande ${two(o.rang)}`} />
      <Link href="/salle/servir" className="press mb-3 inline-flex items-center gap-2 rounded-lg text-[15.5px] text-muted hover:text-text">
        <ArrowLeft size={18} /> À servir
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[2.4rem] leading-[1.05] font-bold tracking-[-0.025em] text-ink sm:text-[2.9rem]">{o.table}</h1>
          <p className="mt-1 text-[1.15rem] text-muted">
            Commande {two(o.rang)} · {o.articles} article{o.articles > 1 ? "s" : ""} · <Hour iso={o.creeLe} fuseau={fuseau} />
          </p>
        </div>
        <OrderBadge order={o} />
      </header>

      <Card className="mt-5 p-4 sm:p-5">
        <Lines lignes={o.lignes} devise={o.devise} />
        <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[1.05rem]">
          <span className="text-muted">Total de la commande</span>
          <Money cents={o.totalCentimes} devise={o.devise} className="font-semibold text-ink" />
        </div>
      </Card>

      <div className="mt-4">
        <Notes notes={o.notes} />
      </div>

      {o.servie ? (
        <Callout tone="olive" className="mt-4">
          Cette commande est déjà marquée servie.
        </Callout>
      ) : (
        <>
          <Callout tone="olive" className="mt-4">
            Confirmez le service après avoir apporté tous les articles de cette commande à la table.
          </Callout>
          <SalleAction
            path={`commandes/${o.id}/servir`}
            label="Marquer la commande servie"
            success={`Commande ${two(o.rang)} de la ${o.table.toLowerCase()} marquée servie.`}
            icon={<CheckCircle size={21} weight="fill" />}
            size="lg"
            className="mt-4 h-14 w-full rounded-2xl text-[1.05rem]"
          />
        </>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <Link href="/salle/servir" className={buttonClass("ghost", "md")}>
          <ArrowLeft size={18} /> Retour aux commandes
        </Link>
        <Link href={`/salle/tables/${o.tableId}`} className={buttonClass("ghost", "md")}>
          Voir la table
        </Link>
      </div>

      {enCours.length > 0 ? (
        <p className="mt-5 flex items-start gap-2.5 rounded-xl border border-info/15 bg-info-soft px-4 py-3 text-[14.5px] leading-snug text-info">
          <Info size={19} aria-hidden className="mt-0.5 shrink-0" />
          <span>
            {enCours.length === 1
              ? `La commande ${two(enCours[0].rang)} est encore ${enCours[0].statutNom.toLowerCase()} et n'est pas incluse dans cette confirmation.`
              : `${enCours.length} autres commandes de cette table ne sont pas incluses dans cette confirmation.`}
          </span>
        </p>
      ) : null}
    </>
  );
}
