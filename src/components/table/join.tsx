"use client";

import { ArrowLeft, ArrowRight, Hourglass, Lock, PicnicTable, Plant, UsersThree, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from "react";
import { cn } from "@/lib/format";
import type { TableGate } from "@/lib/table-types";
import { BackButton } from "../back-button";
import { LanguageSwitch } from "../i18n";
import { Button } from "../ui";
import { CTA } from "./parts";
import { TableError, tableCall } from "./provider";

const DIGITS = 4;
const SECONDARY = "press inline-flex h-14 w-full items-center justify-center gap-3 rounded-full border border-line-strong bg-white text-[1.15rem] text-ink hover:bg-olive-tint";

function Logo({ name, className }: { name: string; className?: string }) {
  return (
    <span translate="no" className={cn("relative inline-block leading-none font-medium tracking-[-0.03em] text-ink", className)}>
      {name.toLowerCase()}.
      <Plant weight="fill" aria-hidden className="absolute -top-0.5 -right-[0.45em] size-[0.42em] text-olive" />
    </span>
  );
}

/** En-tête des écrans d'accueil sur téléphone et tablette. */
function MobileHeader({ gate, ended }: { gate: TableGate; ended?: boolean }) {
  return (
    <header className="flex items-center justify-between gap-3 px-5 pt-5 lg:hidden">
      <a href="/" className="press -ml-1 inline-flex h-10 items-center gap-2 rounded-full px-2 text-[1.05rem] text-text">
        <ArrowLeft size={20} aria-hidden /> Carte
      </a>
      <Logo name={gate.restaurant} className="text-[2rem]" />
      <p className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-white px-3.5 text-[1rem] text-ink">
        {ended ? <Lock size={16} weight="fill" aria-hidden className="text-muted" /> : <span aria-hidden className={cn("size-2.5 rounded-full", gate.sessionOuverte ? "bg-olive" : "bg-muted/50")} />}
        {gate.table.nom}
      </p>
    </header>
  );
}

/** Session clôturée par le personnel : plus aucun accès au panier ni aux commandes de cette session. */
function Ended({ gate, onRejoin }: { gate: TableGate; onRejoin: () => void }) {
  return (
    <main className="min-h-[100dvh] bg-paper pb-10">
      <div className="hidden lg:block">
        <BackButton floating fallback="/" />
      </div>
      <MobileHeader gate={gate} ended />
      <div className="mx-auto w-full max-w-[640px] animate-rise px-5 pt-5 text-center lg:pt-12">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={gate.banniere ?? "/brand/table.webp"} alt="" className="aspect-[16/10] w-full rounded-[26px] object-cover" />
        <h1 className="mt-7 text-[2.5rem] leading-[1.05] font-bold tracking-[-0.02em] text-ink sm:text-[3rem]">Merci pour ce moment.</h1>
        <Plant aria-hidden size={24} className="mx-auto mt-3 text-olive" />
        <p className="mt-3 text-[1.2rem] text-muted">Le personnel a clôturé la session de votre table.</p>
        <p className="mt-6 flex items-center gap-4 rounded-2xl border border-line bg-olive-tint px-5 py-4 text-left text-[1.1rem] text-ink">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-olive-soft text-olive-deep">
            <Lock size={22} aria-hidden />
          </span>
          L'accès à son panier et à ses commandes est terminé.
        </p>
        <a href="/" className={cn(CTA, "mt-6 h-16 w-full text-[1.25rem]")}>
          Retour à la carte <ArrowRight size={22} aria-hidden />
        </a>
        <button type="button" onClick={onRejoin} className={cn(SECONDARY, "mt-3")}>
          Rejoindre une nouvelle session
        </button>
        <p className="mx-auto mt-7 max-w-[34ch] text-[1.02rem] text-muted">Pour une nouvelle commande, rejoignez la session ouverte par le personnel.</p>
        <div className="mt-6 flex justify-center">
          <LanguageSwitch />
        </div>
      </div>
    </main>
  );
}

/** Accueil d'une table après lecture du QR code. Le code de session est saisi par le convive, jamais prérempli. */
export function JoinScreen({ gate }: { gate: TableGate }) {
  const router = useRouter();
  const [code, setCode] = useState<string[]>(() => Array<string>(DIGITS).fill(""));
  const [pseudo, setPseudo] = useState("");
  const [error, setError] = useState<{ message: string; code: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const [rejoin, setRejoin] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const needCode = gate.politique === "code_session";

  // En attente de validation par le personnel : la page se met à jour d'elle-même.
  useEffect(() => {
    if (!gate.enAttente) return;
    const timer = window.setInterval(() => router.refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [gate.enAttente, router]);

  /**
   * Saisie du code. Chaque chiffre tapé est appliqué depuis la touche, pas depuis la valeur du champ :
   * la case visée est toujours celle qui a le focus, même si la frappe devance le rendu, et un chiffre
   * tapé dans une case déjà remplie la remplace. Le champ ne sert plus qu'au collage et à l'effacement.
   */
  const fill = (depart: number, digits: string) => {
    setError(null);
    setCode((current) => {
      const next = [...current];
      digits
        .slice(0, DIGITS - depart)
        .split("")
        .forEach((d, k) => (next[depart + k] = d));
      return next;
    });
    inputs.current[Math.min(DIGITS - 1, depart + digits.length)]?.focus();
  };

  const setDigit = (i: number, value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length > 1) return fill(i, digits);
    setError(null);
    setCode((current) => {
      const next = [...current];
      next[i] = digits;
      return next;
    });
  };

  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (/^[0-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      return fill(i, e.key);
    }
    if (e.key === "Backspace" && !code[i] && i > 0) inputs.current[i - 1]?.focus();
    if (e.key === "ArrowLeft" && i > 0) inputs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < DIGITS - 1) inputs.current[i + 1]?.focus();
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    fill(0, e.clipboardData.getData("text").replace(/\D/g, ""));
  };

  const complete = !needCode || code.every((d) => d !== "");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!complete || pending) return;
    if (gate.pseudo === "obligatoire" && !pseudo.trim()) return setError({ message: "Indiquez votre prénom pour rejoindre la table.", code: false });
    setPending(true);
    setError(null);
    try {
      await tableCall("POST", "rejoindre", { tableId: gate.table.id, code: code.join(""), pseudo: pseudo.trim() });
      window.location.reload();
    } catch (err) {
      const refused = err instanceof TableError && err.status === 403 && needCode;
      setError({ message: refused ? "Ce code n'est pas valide pour la session actuelle." : err instanceof TableError ? err.message : "Connexion au serveur impossible. Vérifiez votre réseau.", code: refused });
      setPending(false);
      // Le code refusé reste affiché : il suffit de le corriger.
      if (refused) inputs.current[0]?.select();
    }
  };

  if (gate.termine && !rejoin && !gate.enAttente) return <Ended gate={gate} onRejoin={() => setRejoin(true)} />;

  return (
    <main className="min-h-[100dvh] bg-paper">
      <div className="hidden lg:block">
        <BackButton floating fallback="/" />
        <LanguageSwitch floating />
      </div>
      <MobileHeader gate={gate} />
      <div className="mx-auto w-full max-w-[640px] animate-rise">
        <div className="relative hidden overflow-hidden rounded-b-[28px] bg-olive-deep px-10 pt-10 pb-12 text-white lg:block" style={{ backgroundImage: `linear-gradient(100deg, rgb(38 61 48 / 0.96) 22%, rgb(38 61 48 / 0.35) 78%), url(${gate.banniere ?? "/brand/table.webp"})`, backgroundSize: "cover", backgroundPosition: "center" }}>
          <p translate="no" className="relative inline-block text-[3.4rem] leading-none font-medium tracking-[-0.03em]">
            {gate.restaurant.toLowerCase()}.
            <Plant weight="fill" aria-hidden className="absolute -top-1 -right-6 size-7" />
          </p>
          <p className="mt-8 text-[2rem] leading-[1.15] font-medium">
            Une table.
            <br />
            Des envies.
            <br />
            De beaux moments.
          </p>
        </div>

        <form onSubmit={submit} className="px-5 pt-7 pb-10 text-center sm:px-14 lg:pt-9 lg:pb-12">
          <Plant aria-hidden size={26} className="mx-auto hidden text-olive lg:block" />
          <p className="eyebrow mt-2 hidden lg:block">Bienvenue chez {gate.restaurant}</p>
          <h1 className="text-[2.3rem] leading-[1.05] font-bold tracking-[-0.02em] text-ink sm:text-[2.8rem] lg:mt-2 lg:text-[3rem]">
            <span className="lg:hidden">Bienvenue à la {gate.table.nom}</span>
            <span className="hidden lg:inline">Prenez place.</span>
          </h1>
          <Plant aria-hidden size={22} className="mx-auto mt-2 text-olive lg:hidden" />
          <p className="mx-auto mt-2 max-w-[34ch] text-[1.2rem] text-text lg:mt-3">
            <span className="lg:hidden">Rejoignez le panier partagé de votre table.</span>
            <span className="hidden lg:inline">Vous avez scanné le QR de la {gate.table.nom.toLowerCase()}. Rejoignez votre table, sans compte à créer.</span>
          </p>

          <div className="mt-7 hidden items-center gap-6 rounded-2xl border border-olive/20 bg-olive-soft px-7 py-5 text-left lg:flex">
            <PicnicTable size={46} aria-hidden className="shrink-0 text-olive-deep" />
            <span className="h-12 w-px bg-olive/25" aria-hidden />
            <div>
              <p className="text-[1.6rem] leading-tight font-semibold text-ink">{gate.table.nom}</p>
              <p className="mt-0.5 flex items-center gap-2 text-[1.05rem] text-text">
                <span aria-hidden className={cn("size-2.5 rounded-full", gate.sessionOuverte ? "bg-olive" : "bg-muted/50")} />
                {gate.sessionOuverte ? "Une session est ouverte" : "Aucune session ouverte pour le moment"}
              </p>
            </div>
          </div>

          <div className="mt-6 max-lg:rounded-[24px] max-lg:border max-lg:border-line max-lg:bg-white max-lg:px-5 max-lg:py-7 max-lg:shadow-card lg:mt-8">
            {gate.enAttente ? (
              <div role="status" className="lg:rounded-2xl lg:border lg:border-line lg:bg-white lg:px-6 lg:py-7">
                <Hourglass size={34} aria-hidden className="mx-auto text-olive" />
                <p className="mt-3 text-[1.4rem] font-semibold text-ink">Demande envoyée.</p>
                <p className="mt-1 text-[1.05rem] text-muted">Notre équipe valide votre arrivée à la table. Cette page s'ouvrira d'elle-même.</p>
              </div>
            ) : !gate.sessionOuverte ? (
              <div className="lg:rounded-2xl lg:border lg:border-line lg:bg-white lg:px-6 lg:py-7">
                <p className="text-[1.3rem] font-semibold text-ink">Votre table n'est pas encore ouverte.</p>
                <p className="mt-1 text-[1.05rem] text-muted">Faites signe à notre équipe : elle ouvre la table et vous donne le code.</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <Button variant="secondary" size="lg" onClick={() => router.refresh()}>
                    Réessayer
                  </Button>
                  <a href="/" className="press inline-flex h-12 items-center rounded-[10px] bg-olive px-5 text-[17px] font-medium text-white hover:bg-olive-deep">
                    Voir la carte
                  </a>
                </div>
              </div>
            ) : (
              <>
                {needCode ? (
                  <fieldset>
                    <legend className="mx-auto text-[1.5rem] font-medium text-ink lg:text-[1.2rem] lg:font-normal lg:text-text">
                      <span className="lg:hidden">Code de votre table</span>
                      <span className="hidden lg:inline">Code communiqué par le personnel</span>
                    </legend>
                    <div className="mt-3 flex justify-center gap-2.5 sm:gap-3">
                      {code.map((d, i) => (
                        <input
                          key={i}
                          ref={(el) => {
                            inputs.current[i] = el;
                          }}
                          value={d}
                          onChange={(e) => setDigit(i, e.target.value)}
                          onFocus={(e) => e.target.select()}
                          // Un clic de souris replace le curseur après la sélection du focus :
                          // on resélectionne pour que le chiffre tapé remplace celui qui est affiché.
                          onClick={(e) => e.currentTarget.select()}
                          onKeyDown={(e) => onKey(i, e)}
                          onPaste={onPaste}
                          inputMode="numeric"
                          autoComplete={i === 0 ? "one-time-code" : "off"}
                          maxLength={DIGITS}
                          aria-label={`Chiffre ${i + 1} du code`}
                          aria-invalid={!!error?.code}
                          className={cn("num h-[72px] w-[64px] rounded-2xl border bg-white text-center font-sans text-[2.2rem] font-medium text-ink sm:h-[76px] sm:w-[72px]", error?.code ? "border-warn/70 bg-warn-soft" : "border-line-strong")}
                        />
                      ))}
                    </div>
                    {!error ? <p className="mt-3 text-[1.02rem] text-muted lg:hidden">Demandez le code de la session au serveur.</p> : null}
                  </fieldset>
                ) : (
                  <p className="text-[1.1rem] text-muted">{gate.politique === "validation_personnel" ? "Notre équipe validera votre arrivée à la table." : "Vous pouvez rejoindre la table directement."}</p>
                )}

                {gate.pseudo !== "aucun" ? (
                  <div className="mx-auto mt-5 max-w-[330px] text-left">
                    <label htmlFor="pseudo" className="text-[1.05rem] text-text">
                      Votre prénom {gate.pseudo === "optionnel" ? <span className="text-muted">(facultatif)</span> : null}
                    </label>
                    <input id="pseudo" value={pseudo} maxLength={24} autoComplete="given-name" onChange={(e) => setPseudo(e.target.value)} placeholder="Pour vous reconnaître dans le panier" className="mt-1.5 h-12 w-full rounded-xl border border-line-strong bg-white px-4 text-[17px] placeholder:text-muted/80" />
                  </div>
                ) : null}

                <div role="alert" className="mt-4 min-h-6">
                  {error ? (
                    <>
                      <p className={cn("flex items-center justify-center gap-2.5 rounded-xl px-4 py-3 text-[1.02rem]", error.code ? "bg-warn-soft text-warn" : "bg-danger-soft text-danger")}>
                        <WarningCircle size={22} aria-hidden className="shrink-0" /> {error.message}
                      </p>
                      {error.code ? <p className="mt-2.5 text-[1.02rem] text-muted">Vérifiez le code avec votre serveur, puis réessayez.</p> : null}
                    </>
                  ) : null}
                </div>
                <button type="submit" disabled={!complete || pending} className={cn(CTA, "mt-3 h-16 w-full text-[1.3rem] lg:h-[68px] lg:text-[1.4rem]")}>
                  {error?.code ? "Réessayer" : "Rejoindre la table"} <ArrowRight size={24} aria-hidden />
                </button>
                {error?.code ? (
                  <a href="/" className={cn(SECONDARY, "mt-3 lg:hidden")}>
                    <ArrowLeft size={20} aria-hidden /> Retour à la carte
                  </a>
                ) : null}
              </>
            )}
          </div>

          <ul className="mt-6 grid gap-3 text-left text-[1.05rem] lg:hidden">
            <li className="flex items-center gap-4 text-ink">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-olive-soft text-olive-deep">
                <Plant size={20} aria-hidden />
              </span>
              Aucun compte à créer.
            </li>
            <li className="flex items-center gap-4 text-muted">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-olive-soft text-olive-deep">
                <Lock size={20} aria-hidden />
              </span>
              Vous accéderez uniquement aux commandes de cette session.
            </li>
          </ul>
          <p className="mt-6 hidden items-center justify-center gap-4 text-[1.05rem] text-text lg:flex">
            <UsersThree size={28} aria-hidden className="text-olive-deep" />
            <span className="h-8 w-px bg-line-strong" aria-hidden />
            Un seul panier. Chacun ajoute ses envies.
          </p>
          <p className="mt-7 border-t border-line pt-5 text-[1.05rem] text-muted">Besoin d'un coup de main ? Faites signe à notre équipe.</p>
          <div className="mt-5 flex justify-center lg:hidden">
            <LanguageSwitch />
          </div>
        </form>
      </div>
    </main>
  );
}
