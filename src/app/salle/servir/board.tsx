"use client";

import { ArrowRight, CallBell, MagnifyingGlass, PicnicTable } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Tabs } from "@/components/client";
import { Dishes, Hour, Notes, OrderBadge, two } from "@/components/salle/parts";
import { Card, EmptyState, Input, buttonClass } from "@/components/ui";
import type { SalleServe } from "@/lib/salle-types";

/** Liste des commandes prêtes. Le filtrage se fait dans le navigateur sur les données déjà reçues. */
export function ServeBoard({ data, fuseau }: { data: SalleServe; fuseau: string }) {
  const [onglet, setOnglet] = useState<"a-servir" | "servies">("a-servir");
  const [q, setQ] = useState("");

  const liste = onglet === "a-servir" ? data.aServir : data.servies;
  const filtre = useMemo(() => {
    const terme = q.trim().toLowerCase();
    if (!terme) return liste;
    return liste.filter((o) => o.table.toLowerCase().includes(terme) || o.lignes.some((l) => l.nom.toLowerCase().includes(terme)));
  }, [liste, q]);

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <Tabs
            label="Commandes du service"
            value={onglet}
            onChange={(id) => setOnglet(id as "a-servir" | "servies")}
            tabs={[
              { id: "a-servir", label: `À servir${data.aServir.length > 0 ? ` (${data.aServir.length})` : ""}` },
              { id: "servies", label: "Servies" },
            ]}
          />
        </div>
        <div className="relative sm:w-72">
          <MagnifyingGlass size={18} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une table" aria-label="Rechercher une table" className="pl-10" />
        </div>
      </div>

      {filtre.length === 0 ? (
        <Card>
          <EmptyState icon={<CallBell size={24} />} title={onglet === "a-servir" ? "Rien à servir pour le moment." : "Aucune commande servie."}>
            {onglet === "a-servir"
              ? q
                ? "Aucune commande ne correspond à cette recherche."
                : "Les commandes signalées prêtes par la cuisine apparaîtront ici."
              : "Les commandes que vous apportez aux tables seront listées ici."}
          </EmptyState>
        </Card>
      ) : (
        <ul className="flex flex-col gap-4">
          {filtre.map((o) => (
            <li key={o.id}>
              <Card className="p-4 sm:p-5">
                <header className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="inline-grid size-10 shrink-0 place-items-center rounded-xl bg-olive-tint text-olive-deep">
                    <PicnicTable size={22} aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-[1.3rem] leading-tight font-semibold text-ink">{o.table}</h2>
                    <p className="text-[14.5px] text-muted">Commande {two(o.rang)}</p>
                  </div>
                  <OrderBadge order={o} />
                  <span className="text-[14.5px] text-muted">
                    {o.articles} article{o.articles > 1 ? "s" : ""}
                  </span>
                  <span className="hidden sm:block">
                    <Hour iso={o.creeLe} fuseau={fuseau} />
                  </span>
                  <Link href={`/salle/servir/${o.id}`} className={buttonClass("primary", "md", "ml-auto max-sm:w-full")}>
                    {o.servie ? "Voir le détail" : "Voir et servir"} <ArrowRight size={18} />
                  </Link>
                </header>
                <Dishes lignes={o.lignes} />
                <div className="mt-3">
                  <Notes notes={o.notes} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
