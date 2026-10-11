import { ArrowRight, ChefHat, Clock, CookingPot, Note, PicnicTable } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { StaffAction } from "@/components/staff/action";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import type { KitchenOrder } from "@/lib/cuisine-types";
import { requireStaffPage } from "@/lib/server/auth/session";
import { kitchenOf } from "@/lib/server/services/cuisine";
import { readDb } from "@/lib/server/storage";

export const metadata: Metadata = { title: "À préparer" };

const two = (n: number) => String(n).padStart(2, "0");

function hour(iso: string, fuseau: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: fuseau }).format(d);
}

/** Fiche d'une commande, telle qu'on la lit au passe : la table, l'heure, les plats, l'étape suivante. */
function OrderCard({ o, fuseau, plusieurs }: { o: KitchenOrder; fuseau: string; plusieurs: boolean }) {
  return (
    <Card className="p-4 sm:p-5">
      <header className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="inline-grid size-10 shrink-0 place-items-center rounded-xl bg-olive-tint text-olive-deep">
          <PicnicTable size={22} aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="text-[1.3rem] leading-tight font-semibold text-ink">{o.table}</h3>
          <p className="text-[14.5px] text-muted">Commande {two(o.rang)}</p>
        </div>
        <Badge tone={o.suivant ? "warn" : "olive"} dot>
          {o.statutNom}
        </Badge>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[14.5px] text-muted">
          <Clock size={16} aria-hidden />
          <span className="num">{hour(o.creeLe, fuseau)}</span>
        </span>
      </header>

      <ul className="grid gap-2 border-t border-line pt-3">
        {o.lignes.map((l, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="num mt-0.5 inline-grid h-7 min-w-7 shrink-0 place-items-center rounded-lg bg-olive-soft px-1.5 text-[15px] font-semibold text-olive-deep">{l.quantite}</span>
            <span className="min-w-0 flex-1">
              <span className="text-[1.05rem] text-ink">{l.nom}</span>
              {l.options.length > 0 ? <span className="text-[14.5px] text-muted"> ({l.options.map((x) => x.nom).join(", ")})</span> : null}
              {plusieurs && l.station ? <span className="ml-2 text-[13.5px] text-muted">{l.station}</span> : null}
              {l.instructions ? (
                <span className="mt-1 flex items-start gap-1.5 text-[14.5px] leading-snug text-warn">
                  <Note size={16} aria-hidden className="mt-0.5 shrink-0" />
                  {l.instructions}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      {o.partielle ? <p className="mt-3 text-[13.5px] text-muted">Cette commande comporte aussi des plats d'une autre station.</p> : null}

      {o.suivant ? (
        <StaffAction
          espace="cuisine"
          path={`commandes/${o.id}/statut`}
          body={{ statut: o.suivant.id }}
          label={`Passer à « ${o.suivant.nom} »`}
          success={`${o.table}, commande ${two(o.rang)} : ${o.suivant.nom}.`}
          icon={<ArrowRight size={18} />}
          size="lg"
          className="mt-4 h-13 w-full rounded-2xl"
        />
      ) : (
        <p className="mt-4 rounded-xl bg-olive-tint px-4 py-2.5 text-center text-[14.5px] text-muted">Au passe, en attente du service.</p>
      )}
    </Card>
  );
}

export default async function Page() {
  const auth = await requireStaffPage("preparation.changer");
  const db = await readDb();
  const vue = kitchenOf(db, auth);
  const fuseau = db.Restaurant[0]?.fuseauHoraire || "Europe/Paris";
  const plusieurs = vue.toutesStations || vue.stations.length > 1;

  return (
    <>
      <PageHeader
        eyebrow="Cuisine"
        title={`Bonjour ${vue.membre}, voici le travail.`}
        subtitle={vue.toutesStations ? "Toutes les commandes des tables ouvertes." : vue.stations.length > 0 ? `Les plats de votre station : ${vue.stations.join(", ")}.` : "Aucune station ne vous est encore attribuée."}
      />

      {!vue.toutesStations && vue.stations.length === 0 ? (
        <Card className="mb-5">
          <EmptyState icon={<CookingPot size={24} />} title="Aucune station attribuée">
            Demandez à un responsable de vous rattacher à une station de préparation, dans Réglages puis Stations.
          </EmptyState>
        </Card>
      ) : null}

      <section aria-labelledby="preparer-titre">
        <h2 id="preparer-titre" className="mb-3 text-[1.5rem] leading-tight font-semibold text-ink">
          {`À préparer (${vue.aPreparer.length})`}
        </h2>
        {vue.aPreparer.length === 0 ? (
          <Card>
            <EmptyState icon={<ChefHat size={24} />} title="Rien à préparer pour le moment.">
              Les commandes envoyées par les tables apparaissent ici aussitôt.
            </EmptyState>
          </Card>
        ) : (
          <ul className="grid gap-4 xl:grid-cols-2">
            {vue.aPreparer.map((o) => (
              <li key={o.id}>
                <OrderCard o={o} fuseau={fuseau} plusieurs={plusieurs} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {vue.pretes.length > 0 ? (
        <section aria-labelledby="pretes-titre" className="mt-7">
          <h2 id="pretes-titre" className="mb-3 text-[1.5rem] leading-tight font-semibold text-ink">
            {`Terminées, en attente du service (${vue.pretes.length})`}
          </h2>
          <ul className="grid gap-4 xl:grid-cols-2">
            {vue.pretes.map((o) => (
              <li key={o.id}>
                <OrderCard o={o} fuseau={fuseau} plusieurs={plusieurs} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
