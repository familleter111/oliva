"use client";

import { Check, CircleNotch, PicnicTable, QrCode, UserPlus, X } from "@phosphor-icons/react/dist/ssr";
import { useApi, useAction } from "@/components/client";
import { hour } from "@/components/salle/parts";
import { Card, EmptyState, buttonClass } from "@/components/ui";
import type { SeatRequest } from "@/lib/server/services/access";

/**
 * Arrivées à confirmer : une personne a choisi sa table, depuis le QR code ou l'accueil du site.
 * Le personnel la reconnaît de vive voix avant de l'admettre. Accepter ouvre la session si besoin.
 */
export function SeatRequests({ demandes, espace, fuseau, titre = "Arrivées à confirmer" }: { demandes: SeatRequest[]; espace: "salle" | "responsable"; fuseau: string; titre?: string }) {
  const call = useApi(espace);
  const { run, pending } = useAction();

  if (demandes.length === 0) {
    return (
      <Card>
        <EmptyState icon={<UserPlus size={24} />} title="Aucune arrivée à confirmer.">
          Quand un client choisit votre table, depuis le QR code ou depuis la carte en ligne, il apparaît ici.
        </EmptyState>
      </Card>
    );
  }

  return (
    <section>
      <h2 className="mb-2.5 text-[1.2rem] font-semibold text-ink">
        {titre} <span className="num text-muted">({demandes.length})</span>
      </h2>
      <ul className="flex flex-col gap-3">
        {demandes.map((d) => (
          <li key={d.id}>
            <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
              <span aria-hidden className="inline-grid size-14 shrink-0 place-items-center rounded-2xl bg-olive-soft text-olive-deep">
                {d.origine === "qr" ? <QrCode size={26} /> : <PicnicTable size={26} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[1.25rem] leading-tight font-semibold text-ink">{d.pseudo || "Convive sans prénom"}</p>
                <p className="mt-0.5 text-[15px] text-muted">
                  {d.table}
                  {d.zone ? ` · ${d.zone}` : ""} · {d.origine === "qr" ? "QR code de la table" : "choisie depuis la carte"} · <span className="num">{hour(d.creeLe, fuseau)}</span>
                </p>
              </div>
              <div className="flex shrink-0 gap-2 max-sm:w-full">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void run(() => call("POST", `acces/${d.id}/accepter`), { success: `${d.pseudo || "Le convive"} peut commander.` })}
                  className={buttonClass("primary", "md", "max-sm:flex-1")}
                >
                  {pending ? <CircleNotch size={18} className="animate-spin" /> : <Check size={18} />} Installer
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void run(() => call("POST", `acces/${d.id}/refuser`), { success: "Demande refusée." })}
                  className={buttonClass("secondary", "md", "max-sm:flex-1")}
                >
                  <X size={18} /> Refuser
                </button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Remplace le QR code d'une table : les affichettes imprimées avant ne mènent plus à cette table. */
export function RenewQr({ tableId, espace, className }: { tableId: string; espace: "salle" | "responsable"; className?: string }) {
  const call = useApi(espace);
  const { run, pending } = useAction();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => void run(() => call("POST", `tables/${tableId}/qr`), { success: "QR code remplacé. Imprimez le nouveau depuis l'administration." })}
      className={buttonClass("secondary", "md", className)}
    >
      {pending ? <CircleNotch size={18} className="animate-spin" /> : <QrCode size={18} />} Remplacer le QR code
    </button>
  );
}
