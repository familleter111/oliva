"use client";

import { CheckCircle, CircleNotch, Printer, Receipt, Warning } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { cn, formatMoney } from "@/lib/format";
import type { SalleBill } from "@/lib/salle-types";
import { Modal, useAction, useApi } from "../client";
import { StaffAction } from "../staff/action";
import { Button, buttonClass } from "../ui";

/**
 * Actions de l'espace serveur. Chacune appelle /api/salle, qui revérifie la session,
 * la permission et la portée du rôle avant d'écrire. Le message de réussite n'apparaît
 * qu'après la réponse du serveur, et la page est redemandée pour afficher l'état enregistré.
 */

type Variante = "primary" | "secondary" | "outline";

/** Action de l'espace serveur : le bouton commun du personnel, câblé sur /api/salle. */
export function SalleAction(props: Omit<Parameters<typeof StaffAction>[0], "espace">) {
  return <StaffAction espace="salle" {...props} />;
}

/** Impression de l'addition : la page imprimable est celle qui est affichée, rien n'est envoyé ailleurs. */
export function PrintButton({ label = "Imprimer l'addition", className }: { label?: string; className?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass("secondary", "lg", cn("w-full", className))}>
      <Printer size={20} /> {label}
    </button>
  );
}

/**
 * Remise de l'addition, confirmée en deux temps. Le dialogue rappelle que cette action
 * ne vaut pas encaissement : le règlement reste traité par le restaurant.
 */
export function DeliverBill({ addition, label = "Remettre l'addition", variant = "primary", size = "md", className }: { addition: SalleBill; label?: string; variant?: Variante; size?: "sm" | "md" | "lg"; className?: string }) {
  const [open, setOpen] = useState(false);
  const call = useApi("salle");
  const { run, pending } = useAction();
  const confirm = async () => {
    const out = await run(() => call("POST", `additions/${addition.sessionId}/remettre`), { success: `Addition de la ${addition.table.toLowerCase()} marquée remise.` });
    if (out !== undefined) setOpen(false);
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass(variant, size, className)}>
        <Receipt size={size === "lg" ? 20 : 18} /> {label}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="L'addition a été remise ?"
        description={`Confirmez après avoir apporté l'addition aux clients de la ${addition.table.toLowerCase()}.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Revenir à l'addition
            </Button>
            <Button onClick={confirm} disabled={pending}>
              {pending ? <CircleNotch size={18} className="animate-spin" /> : <CheckCircle size={18} weight="fill" />}
              Confirmer la remise
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-olive-tint px-4 py-3">
          <div>
            <p className="text-[1.15rem] font-semibold text-ink">{addition.table}</p>
            <p className="text-[14.5px] text-muted">
              {addition.convives} convive{addition.convives > 1 ? "s" : ""}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[14.5px] text-muted">Total</p>
            <p className="num text-[1.35rem] font-semibold text-ink">{formatMoney(addition.totalCentimes, addition.devise)}</p>
          </div>
        </div>
        <div className="mt-4 flex gap-3 rounded-xl border border-warn/15 bg-warn-soft px-4 py-3 text-[14.5px] leading-snug text-warn">
          <Warning size={20} aria-hidden className="mt-0.5 shrink-0" />
          <p>Cette action indique uniquement la remise de l'addition. Le règlement reste à traiter selon l'organisation du restaurant.</p>
        </div>
      </Modal>
    </>
  );
}
