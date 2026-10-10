"use client";

import { ArrowClockwise, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { useEffect } from "react";
import { Wordmark } from "@/components/ui";

/**
 * Dernier filet avant une page blanche : le visiteur voit une phrase claire, jamais une trace technique.
 * Le détail de la cause reste dans les journaux du serveur, repérable par la référence affichée.
 */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-[100dvh] place-items-center px-6 text-center">
      <div>
        <Wordmark subtitle="" />
        <WarningCircle size={40} aria-hidden className="mx-auto mt-8 text-danger" />
        <h1 className="mt-3 text-[2rem] leading-tight font-bold">Le site est momentanément indisponible.</h1>
        <p className="mt-2 text-muted">Rien n'a été modifié. Merci de réessayer dans un instant.</p>
        {error.digest ? <p className="num mt-2 text-[12.5px] text-muted">Référence : {error.digest}</p> : null}
        <button type="button" onClick={() => retry()} className="press mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-olive px-6 text-[16px] font-medium text-white hover:bg-olive-deep">
          <ArrowClockwise size={18} aria-hidden /> Réessayer
        </button>
        <p className="mt-6 text-[14px] text-muted">
          Responsable du site : la cause exacte est écrite en clair dans les journaux du serveur, et sur <code className="font-sans">/api/sante</code>.
        </p>
      </div>
    </main>
  );
}
