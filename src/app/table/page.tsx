import { ArrowLeft, PicnicTable, UsersThree } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { LanguageSwitch } from "@/components/i18n";
import { Wordmark } from "@/components/ui";
import { publicTables } from "@/lib/server/services/access";
import { readDb } from "@/lib/server/storage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Choisir ma table", robots: { index: false, follow: false } };

/**
 * Choix de la table depuis l'accueil public, pour qui n'a pas scanné le QR code.
 * Aucune donnée de service n'est exposée : seulement le nom des tables et le fait qu'elles soient occupées.
 * Choisir une table ne donne aucun droit : le personnel confirme la personne avant tout accès.
 */
export default async function Page() {
  const db = await readDb();
  const tables = publicTables(db);
  const zones = [...new Set(tables.map((t) => t.zone))];
  const restaurant = db.Restaurant[0]?.nom || "Oliva";

  return (
    <main className="min-h-[100dvh] bg-paper pb-14">
      <header className="mx-auto flex w-full max-w-[720px] items-center justify-between gap-3 px-5 pt-5">
        <a href="/" className="press -ml-1 inline-flex h-10 items-center gap-2 rounded-full px-2 text-[1.05rem] text-text">
          <ArrowLeft size={20} aria-hidden /> Carte
        </a>
        <LanguageSwitch />
      </header>

      <div className="mx-auto w-full max-w-[720px] animate-rise px-5 pt-6">
        <Wordmark subtitle="" />
        <h1 className="mt-7 text-[2.3rem] leading-[1.08] font-bold tracking-[-0.02em] text-ink sm:text-[2.8rem]">À quelle table êtes-vous installé ?</h1>
        <p className="mt-3 text-[1.15rem] text-muted">
          Choisissez votre table, indiquez votre prénom, puis notre équipe vient vous confirmer. Vous pourrez alors commander depuis votre téléphone.
        </p>

        {tables.length === 0 ? (
          <p className="mt-8 rounded-2xl border border-line bg-white px-5 py-6 text-center text-[1.05rem] text-muted">
            Aucune table n'est proposée pour le moment. Adressez-vous à notre équipe.
          </p>
        ) : (
          <div className="mt-8 flex flex-col gap-7">
            {zones.map((zone) => (
              <section key={zone || "sans-zone"}>
                {zone ? <h2 className="eyebrow mb-2.5">{zone}</h2> : null}
                <ul className="grid gap-2.5 sm:grid-cols-2">
                  {tables
                    .filter((t) => t.zone === zone)
                    .map((t) => (
                      <li key={t.id}>
                        <a
                          href={`/table/${t.id}?source=accueil`}
                          className="press flex items-center gap-3.5 rounded-2xl border border-line bg-white px-4 py-3.5 hover:bg-olive-tint"
                        >
                          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-olive-tint text-olive-deep">
                            <PicnicTable size={22} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[1.15rem] font-semibold text-ink">{t.nom}</span>
                            <span className="flex items-center gap-1.5 text-[14.5px] text-muted">
                              <UsersThree size={15} aria-hidden /> {t.capacite} place{t.capacite > 1 ? "s" : ""}
                            </span>
                          </span>
                          <span className={`shrink-0 text-[14px] ${t.occupee ? "text-olive-deep" : "text-muted"}`}>{t.occupee ? "Service en cours" : "Libre"}</span>
                        </a>
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        <p className="mt-9 text-center text-[14.5px] text-muted">{restaurant}</p>
      </div>
    </main>
  );
}
