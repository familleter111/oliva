"use client";

import { CaretRight, CheckCircle, Clock, MagnifyingGlass, Receipt } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Tabs } from "@/components/client";
import { DeliverBill } from "@/components/salle/actions";
import { BillBadge, Money } from "@/components/salle/parts";
import { Card, EmptyState, Input, Thumb } from "@/components/ui";
import type { BillStatus, SalleBill } from "@/lib/salle-types";

/** Additions des tables du service, par état. Les montants viennent du serveur, jamais du navigateur. */
export function BillBoard({ additions }: { additions: SalleBill[] }) {
  const [onglet, setOnglet] = useState<BillStatus>("a_remettre");
  const [q, setQ] = useState("");
  const n = (s: BillStatus) => additions.filter((a) => a.statut === s).length;

  const liste = useMemo(() => {
    const terme = q.trim().toLowerCase();
    return additions.filter((a) => a.statut === onglet && (!terme || a.table.toLowerCase().includes(terme)));
  }, [additions, onglet, q]);

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <Tabs
            label="État des additions"
            value={onglet}
            onChange={(id) => setOnglet(id as BillStatus)}
            tabs={[
              { id: "a_remettre", label: `À remettre${n("a_remettre") > 0 ? ` (${n("a_remettre")})` : ""}`, icon: <Clock size={18} aria-hidden /> },
              { id: "remise", label: `Remises${n("remise") > 0 ? ` (${n("remise")})` : ""}`, icon: <CheckCircle size={18} aria-hidden /> },
              { id: "cloturee", label: `Clôturées${n("cloturee") > 0 ? ` (${n("cloturee")})` : ""}`, icon: <Receipt size={18} aria-hidden /> },
            ]}
          />
        </div>
        <div className="relative sm:w-72">
          <MagnifyingGlass size={18} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une table" aria-label="Rechercher une table" className="pl-10" />
        </div>
      </div>

      {liste.length === 0 ? (
        <Card>
          <EmptyState icon={<Receipt size={24} />} title={onglet === "a_remettre" ? "Aucune addition à remettre." : onglet === "remise" ? "Aucune addition remise." : "Aucune addition clôturée."}>
            {q ? "Aucune table ne correspond à cette recherche." : "Les additions de vos tables apparaîtront ici dès la première commande envoyée."}
          </EmptyState>
        </Card>
      ) : (
        <ul className="flex flex-col gap-4">
          {liste.map((a) => (
            <li key={a.sessionId}>
              <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
                <Thumb src={a.image} alt="" className="h-28 w-full rounded-xl sm:size-28" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <h2 className="text-[1.45rem] leading-tight font-bold text-ink">{a.table}</h2>
                    <BillBadge statut={a.statut} />
                  </div>
                  <p className="mt-0.5 text-[14.5px] text-muted">
                    {a.convives} convive{a.convives > 1 ? "s" : ""} · {a.nbCommandes} commande{a.nbCommandes > 1 ? "s" : ""}
                  </p>
                  <ul className="mt-2 text-[14.5px] text-text">
                    {a.apercu.map((l, i) => (
                      <li key={`${l.nom}-${i}`} className="truncate">
                        <span className="num">{l.quantite} ×</span> {l.nom}
                      </li>
                    ))}
                    {a.autres > 0 ? <li className="text-muted">et {a.autres} autre{a.autres > 1 ? "s" : ""} article{a.autres > 1 ? "s" : ""}</li> : null}
                  </ul>
                </div>
                <div className="flex shrink-0 flex-col items-stretch gap-2.5 sm:w-56 sm:items-end">
                  <div className="sm:text-right">
                    <p className="text-[14.5px] text-muted">Total</p>
                    <Money cents={a.totalCentimes} devise={a.devise} className="text-[1.6rem] leading-tight font-bold text-ink" />
                  </div>
                  {a.statut === "a_remettre" ? <DeliverBill addition={a} className="w-full" /> : null}
                  <Link href={`/salle/additions/${a.sessionId}`} className="press inline-flex items-center justify-center gap-1.5 rounded-[10px] px-2 py-1.5 text-[15px] text-muted hover:bg-olive-tint hover:text-text">
                    Voir l'addition de la {a.table.toLowerCase()}
                    <CaretRight size={16} aria-hidden />
                  </Link>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
