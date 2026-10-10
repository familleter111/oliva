"use client";

import { ArrowClockwise, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { useEffect } from "react";
import { Button, Card } from "@/components/ui";

/** `retry` relance la lecture des données puis le rendu de la page (Next.js 16.3). */
export default function PanelError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Card className="mx-auto mt-10 max-w-xl p-8 text-center">
      <WarningCircle size={40} className="mx-auto text-danger" />
      <h1 className="mt-3 text-2xl font-semibold">Cette page n'a pas pu être chargée.</h1>
      <p className="mt-2 text-muted">
        Les données n'ont pas pu être lues. Rien n'a été modifié. Si le problème persiste, vérifiez le stockage avec la commande <code className="font-sans text-[14px]">npm run storage:verifier</code> et consultez les journaux du serveur.
      </p>
      {error.digest ? <p className="num mt-2 font-sans text-[12.5px] text-muted">Référence : {error.digest}</p> : null}
      <Button className="mt-5" onClick={() => retry()}>
        <ArrowClockwise size={18} /> Réessayer
      </Button>
    </Card>
  );
}
