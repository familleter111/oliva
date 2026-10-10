"use client";

import { Printer } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui";

export function PrintButton() {
  return (
    <Button onClick={() => window.print()}>
      <Printer size={18} /> Imprimer
    </Button>
  );
}
