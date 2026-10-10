import { ArrowLeft, Check, CheckCircle, Clock, Info, PicnicTable, Receipt } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SalleAction } from "@/components/salle/actions";
import { RequestBadge, RequestIcon, hour } from "@/components/salle/parts";
import { Crumb } from "@/components/salle/shell";
import { Card, buttonClass } from "@/components/ui";
import { cn } from "@/lib/format";
import { requireStaffPage } from "@/lib/server/auth/session";
import { requestDetail } from "@/lib/server/services/salle";
import { readDb } from "@/lib/server/storage";

export const metadata: Metadata = { title: "Demande client" };

export default async function Page({ params }: { params: Promise<{ demandeId: string }> }) {
  const auth = await requireStaffPage("commandes.servir");
  const { demandeId } = await params;
  const db = await readDb();
  let d;
  try {
    d = requestDetail(db, auth, demandeId);
  } catch {
    notFound();
  }
  const fuseau = db.Restaurant[0]?.fuseauHoraire || "Europe/Paris";
  const etapes = [
    { id: "recue", titre: "Reçue", detail: hour(d.creeLe, fuseau), faite: true },
    { id: "prise", titre: "Prise en charge", detail: d.prisePar ? (d.parMoi ? "Par vous" : d.prisePar) : "En attente", faite: d.statut !== "en_attente" },
    { id: "traitee", titre: "Traitée", detail: d.traiteeLe ? hour(d.traiteeLe, fuseau) : "", faite: d.statut === "traitee" },
  ];
  const courante = etapes.findIndex((e) => !e.faite);

  return (
    <>
      <Crumb label={d.table} />
      <Link href="/salle/demandes" className="press mb-3 inline-flex items-center gap-2 rounded-lg text-[15.5px] text-muted hover:text-text">
        <ArrowLeft size={18} /> Demandes clients
      </Link>

      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-[2.1rem] leading-[1.08] font-bold tracking-[-0.025em] text-balance text-ink sm:text-[2.6rem]">
          {d.libelle} à la {d.table.toLowerCase()}.
        </h1>
        <RequestBadge statut={d.statut} />
      </header>
      <p className="mt-1 text-[1.15rem] text-muted">
        {d.statut === "en_attente" ? "Personne ne l'a encore prise en charge." : d.statut === "en_cours" ? `Prise en charge par ${d.parMoi ? "vous" : d.prisePar || "un membre de l'équipe"}.` : "Demande traitée."}
      </p>

      <Card className="mt-5 p-4 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <span className="inline-grid size-16 shrink-0 place-items-center rounded-2xl bg-olive-soft text-ink">
            <RequestIcon icone={d.icone} size={30} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[1.5rem] leading-tight font-semibold text-ink">{d.libelle}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[15px] text-muted">
              <span className="inline-flex items-center gap-1.5">
                <PicnicTable size={18} aria-hidden /> {d.table}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock size={17} aria-hidden /> Reçue à <span className="num">{hour(d.creeLe, fuseau)}</span>
              </span>
              {d.auteur ? <span>Par {d.auteur}</span> : null}
            </div>
            {d.message ? <p className="mt-3 text-[1.05rem] leading-snug text-text">« {d.message} »</p> : null}
            <p className="mt-4 flex items-start gap-2.5 rounded-xl bg-olive-tint px-4 py-3 text-[14.5px] leading-snug text-text">
              <Info size={19} aria-hidden className="mt-0.5 shrink-0 text-olive-deep" />
              <span>
                Rendez-vous à la table pour préciser la demande.
                <br />
                Pour une question d'allergènes, vérifiez les informations auprès de la cuisine.
              </span>
            </p>
          </div>
        </div>

        <ol className="mt-6 flex items-start gap-1 border-t border-line pt-6">
          {etapes.map((e, i) => (
            <li key={e.id} className={cn("flex min-w-0 flex-1 flex-col items-center gap-2 text-center", i === 0 && "items-start text-left", i === etapes.length - 1 && "items-end text-right")}>
              <div className="flex w-full items-center">
                {i > 0 ? <span aria-hidden className={cn("h-0.5 flex-1", etapes[i - 1].faite && e.faite ? "bg-olive" : "bg-line")} /> : null}
                <span
                  className={cn(
                    "inline-grid size-7 shrink-0 place-items-center rounded-full border-2",
                    e.faite ? "border-olive bg-olive text-white" : i === courante ? "border-olive bg-white text-olive" : "border-line bg-white text-line-strong",
                  )}
                >
                  {e.faite ? <Check size={15} weight="bold" aria-hidden /> : <span aria-hidden className={cn("size-2.5 rounded-full", i === courante ? "bg-olive" : "bg-transparent")} />}
                </span>
                {i < etapes.length - 1 ? <span aria-hidden className={cn("h-0.5 flex-1", etapes[i + 1].faite ? "bg-olive" : "bg-line")} /> : null}
              </div>
              <span className="text-[15px] font-medium text-ink">{e.titre}</span>
              {e.detail ? <span className="num text-[13.5px] text-muted">{e.detail}</span> : null}
            </li>
          ))}
        </ol>
      </Card>

      <div className="mt-5 flex flex-wrap gap-3">
        {d.statut === "en_attente" ? <SalleAction path={`demandes/${d.id}/prendre`} label="Prendre en charge" success="Demande prise en charge." icon={<Clock size={19} />} size="lg" className="max-sm:w-full" /> : null}
        {d.statut !== "traitee" ? (
          <SalleAction path={`demandes/${d.id}/traiter`} label="Marquer la demande traitée" success="Demande marquée traitée." icon={<CheckCircle size={20} weight="fill" />} size="lg" className="max-sm:w-full" />
        ) : null}
        {d.addition ? (
          <Link href={`/salle/additions/${d.sessionId}`} className={buttonClass("secondary", "lg", "max-sm:w-full")}>
            <Receipt size={19} /> Voir l'addition
          </Link>
        ) : null}
        <Link href="/salle/demandes" className={buttonClass("secondary", "lg", "max-sm:w-full")}>
          <ArrowLeft size={19} /> Retour aux demandes
        </Link>
      </div>
    </>
  );
}
