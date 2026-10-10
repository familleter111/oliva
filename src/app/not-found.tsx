import { connection } from "next/server";
import { BackButton } from "@/components/back-button";
import { LanguageSwitch } from "@/components/i18n";
import { Wordmark } from "@/components/ui";

export default async function NotFound() {
  // Rendu à la demande : la politique de sécurité du contenu attribue un nonce propre à chaque requête.
  await connection();
  return (
    <main className="grid min-h-[100dvh] place-items-center px-6 text-center">
      <BackButton floating fallback="/" />
      <LanguageSwitch floating />
      <div>
        <Wordmark subtitle="" />
        <h1 className="mt-8 text-[2rem] leading-tight font-bold">Cette page n'existe pas.</h1>
        <p className="mt-2 text-muted">L'adresse est peut-être incomplète ou la page a été retirée.</p>
        <a href="/" className="press mt-6 inline-flex h-11 items-center rounded-full bg-olive px-6 text-[16px] font-medium text-white hover:bg-olive-deep">
          Voir la carte
        </a>
      </div>
    </main>
  );
}
