"use client";

import { useEffect } from "react";
import "./globals.css";

/** Panne survenue dans la mise en page racine : cette page remplace tout le document. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="fr">
      <body>
        <main className="grid min-h-[100dvh] place-items-center px-6 text-center">
          <div>
            <p className="text-[2rem] font-bold text-olive-deep">Oliva</p>
            <h1 className="mt-6 text-[1.6rem] leading-tight font-bold">Le site est momentanément indisponible.</h1>
            <p className="mt-2 text-muted">Rien n'a été modifié. Merci de réessayer dans un instant.</p>
            {error.digest ? <p className="num mt-2 text-[12.5px] text-muted">Référence : {error.digest}</p> : null}
            <button type="button" onClick={() => retry()} className="press mt-6 inline-flex h-11 items-center rounded-full bg-olive px-6 text-[16px] font-medium text-white hover:bg-olive-deep">
              Réessayer
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
