"use client";

import { ArrowRight, ChatCircleDots, CheckCircle, Clock, Receipt } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Tabs } from "@/components/client";
import { AssignRequest } from "@/components/responsable/actions";
import { RequestBadge, RequestIcon, hour } from "@/components/salle/parts";
import { Avatar, Card, EmptyState, Select, buttonClass } from "@/components/ui";
import type { ChefRequests } from "@/lib/responsable-types";
import type { RequestStatus } from "@/lib/salle-types";

/** Demandes des tables, triées et attribuées par le responsable. */
export function ChefRequestBoard({ data, fuseau }: { data: ChefRequests; fuseau: string }) {
  const [onglet, setOnglet] = useState<RequestStatus>("en_attente");
  const [tri, setTri] = useState<"recentes" | "anciennes" | "table">("recentes");
  const n = (s: RequestStatus) => data.demandes.filter((d) => d.statut === s).length;

  const liste = useMemo(() => {
    const out = data.demandes.filter((d) => d.statut === onglet);
    if (tri === "anciennes") return [...out].sort((a, b) => a.creeLe.localeCompare(b.creeLe));
    if (tri === "table") return [...out].sort((a, b) => a.table.localeCompare(b.table, "fr", { numeric: true }));
    return out;
  }, [data.demandes, onglet, tri]);

  return (
    <>
      <div className="mb-5">
        <Tabs
          label="État des demandes"
          value={onglet}
          onChange={(id) => setOnglet(id as RequestStatus)}
          tabs={[
            { id: "en_attente", label: `À traiter (${n("en_attente")})`, icon: <ChatCircleDots size={18} aria-hidden /> },
            { id: "en_cours", label: `En cours (${n("en_cours")})`, icon: <Clock size={18} aria-hidden /> },
            { id: "traitee", label: `Traitées (${n("traitee")})`, icon: <CheckCircle size={18} aria-hidden /> },
          ]}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start">
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[1.35rem] leading-tight font-semibold text-ink">
              {onglet === "en_attente" ? "Demandes à traiter" : onglet === "en_cours" ? "Demandes en cours" : "Demandes traitées"} ({liste.length})
            </h2>
            <label className="flex items-center gap-2 text-[14.5px] text-muted">
              Trier par
              <Select value={tri} onChange={(e) => setTri(e.target.value as typeof tri)} aria-label="Trier les demandes" className="w-44">
                <option value="recentes">Plus récentes</option>
                <option value="anciennes">Plus anciennes</option>
                <option value="table">Table</option>
              </Select>
            </label>
          </div>

          {liste.length === 0 ? (
            <Card>
              <EmptyState icon={<ChatCircleDots size={24} />} title="Aucune demande à afficher.">
                {onglet === "en_attente" ? "Les appels des tables arriveront ici, en direct." : "Rien à afficher pour le moment."}
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
                        <h3 className="text-[1.3rem] leading-tight font-semibold text-ink">{d.table}</h3>
                        <RequestBadge statut={d.statut} />
                      </div>
                      <p className="mt-1 text-[1.05rem] text-text">{d.libelle}</p>
                      <p className="mt-0.5 text-[14.5px] text-muted">
                        Reçue à <span className="num">{hour(d.creeLe, fuseau)}</span>
                        {d.auteur ? ` · ${d.auteur}` : ""}
                      </p>
                      {d.message ? <p className="mt-2 text-[15px] leading-snug text-text">« {d.message} »</p> : null}
                      {d.prisePar ? (
                        <p className="mt-2 flex items-center gap-2 text-[14.5px] text-muted">
                          <Avatar name={d.prisePar} className="size-7 text-[12px]" />
                          Prise en charge par {d.parMoi ? "vous" : d.prisePar}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {d.addition ? (
                          <Link href={`/salle/additions/${d.sessionId}`} className={buttonClass("secondary", "md")}>
                            <Receipt size={18} /> Voir l'addition
                          </Link>
                        ) : null}
                        <Link href={`/salle/demandes/${d.id}`} className={buttonClass("secondary", "md")}>
                          Voir le détail <ArrowRight size={18} />
                        </Link>
                      </div>
                    </div>
                    {d.statut !== "traitee" ? <AssignRequest demandeId={d.id} serveurs={data.serveurs} defaut={data.parTable[d.tableId] ?? ""} /> : null}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Card className="bg-olive-tint p-5 text-center">
          <span className="mx-auto inline-grid size-14 place-items-center rounded-full bg-white text-olive-deep">
            <CheckCircle size={26} aria-hidden />
          </span>
          <h2 className="mt-3 text-[1.35rem] leading-tight font-semibold text-ink">Une seule prise en charge</h2>
          <p className="mt-1.5 text-[15px] leading-snug text-text">La personne désignée intervient à la table, puis confirme le traitement de la demande.</p>
          <button type="button" onClick={() => setOnglet("traitee")} className="press mt-4 inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-[15px] text-olive-deep underline underline-offset-4">
            Voir les demandes traitées <ArrowRight size={16} />
          </button>
        </Card>
      </div>
    </>
  );
}
