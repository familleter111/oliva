"use client";

import { ArrowRight, ChatCircleDots, CheckCircle, Clock, Receipt } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useState } from "react";
import { Tabs } from "@/components/client";
import { SalleAction } from "@/components/salle/actions";
import { RequestBadge, RequestIcon, hour } from "@/components/salle/parts";
import { Card, EmptyState, buttonClass } from "@/components/ui";
import type { SalleRequest } from "@/lib/salle-types";

/** Demandes des convives, regroupées par état. Le filtrage porte sur les données déjà reçues. */
export function RequestBoard({ demandes, fuseau }: { demandes: SalleRequest[]; fuseau: string }) {
  const [onglet, setOnglet] = useState<SalleRequest["statut"]>("en_attente");
  const liste = demandes.filter((d) => d.statut === onglet);
  const n = (s: SalleRequest["statut"]) => demandes.filter((d) => d.statut === s).length;

  return (
    <>
      <div className="mb-5">
        <Tabs
          label="État des demandes"
          value={onglet}
          onChange={(id) => setOnglet(id as SalleRequest["statut"])}
          tabs={[
            { id: "en_attente", label: `À traiter${n("en_attente") > 0 ? ` (${n("en_attente")})` : ""}`, icon: <ChatCircleDots size={18} aria-hidden /> },
            { id: "en_cours", label: "En cours", icon: <Clock size={18} aria-hidden /> },
            { id: "traitee", label: "Traitées", icon: <CheckCircle size={18} aria-hidden /> },
          ]}
        />
      </div>

      {liste.length === 0 ? (
        <Card>
          <EmptyState icon={<ChatCircleDots size={24} />} title={onglet === "en_attente" ? "Aucune demande en attente." : onglet === "en_cours" ? "Aucune demande en cours." : "Aucune demande traitée."}>
            {onglet === "en_attente" ? "Les appels des tables de votre service arriveront ici, en direct." : "Rien à afficher pour le moment."}
          </EmptyState>
        </Card>
      ) : (
        <ul className="flex flex-col gap-4">
          {liste.map((d) => (
            <li key={d.id}>
              <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:p-5">
                <span className="inline-grid size-14 shrink-0 place-items-center rounded-2xl bg-olive-soft text-ink">
                  <RequestIcon icone={d.icone} size={26} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <h2 className="text-[1.3rem] leading-tight font-semibold text-ink">{d.table}</h2>
                    <RequestBadge statut={d.statut} />
                  </div>
                  <p className="mt-1 text-[1.05rem] text-text">{d.libelle}</p>
                  <p className="mt-0.5 text-[14.5px] text-muted">
                    Reçue à <span className="num">{hour(d.creeLe, fuseau)}</span>
                    {d.auteur ? ` · ${d.auteur}` : ""}
                    {d.prisePar ? ` · prise par ${d.parMoi ? "vous" : d.prisePar}` : ""}
                  </p>
                  {d.message ? <p className="mt-2 text-[15px] leading-snug text-text">« {d.message} »</p> : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {d.addition ? (
                      <Link href={`/salle/additions/${d.sessionId}`} className={buttonClass("primary", "md")}>
                        <Receipt size={18} /> Voir l'addition
                      </Link>
                    ) : d.statut === "en_attente" ? (
                      <SalleAction path={`demandes/${d.id}/prendre`} label="Prendre en charge" success="Demande prise en charge." icon={<ArrowRight size={18} />} />
                    ) : null}
                    <Link href={`/salle/demandes/${d.id}`} className={buttonClass("secondary", "md")}>
                      Voir le détail
                    </Link>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
