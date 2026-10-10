"use client";

import { ArrowRight, CallBell, MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Tabs } from "@/components/client";
import { Dishes, Hour, Notes, OrderBadge, two } from "@/components/salle/parts";
import { Avatar, Card, EmptyState, Input, Select, buttonClass } from "@/components/ui";
import type { ChefService } from "@/lib/responsable-types";

type Filtre = "toutes" | "a-servir" | "preparation" | "servies";

/** Suivi des commandes de toute la salle. Le filtrage porte sur les données déjà reçues du serveur. */
export function ServiceBoard({ data, fuseau }: { data: ChefService; fuseau: string }) {
  const [onglet, setOnglet] = useState<Filtre>("a-servir");
  const [serveur, setServeur] = useState("");
  const [q, setQ] = useState("");

  const compte = useMemo(
    () => ({
      toutes: data.commandes.length,
      "a-servir": data.commandes.filter((o) => o.prete).length,
      preparation: data.commandes.filter((o) => !o.prete && !o.servie).length,
      servies: data.commandes.filter((o) => o.servie).length,
    }),
    [data.commandes],
  );

  const liste = useMemo(() => {
    const terme = q.trim().toLowerCase();
    return data.commandes.filter((o) => {
      if (onglet === "a-servir" && !o.prete) return false;
      if (onglet === "preparation" && (o.prete || o.servie)) return false;
      if (onglet === "servies" && !o.servie) return false;
      if (serveur && o.serveurId !== serveur) return false;
      if (terme && !o.table.toLowerCase().includes(terme) && !o.lignes.some((l) => l.nom.toLowerCase().includes(terme))) return false;
      return true;
    });
  }, [data.commandes, onglet, serveur, q]);

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="min-w-0 flex-1">
          <Tabs
            label="État des commandes"
            value={onglet}
            onChange={(id) => setOnglet(id as Filtre)}
            tabs={[
              { id: "toutes", label: `Toutes (${compte.toutes})` },
              { id: "a-servir", label: `À servir (${compte["a-servir"]})` },
              { id: "preparation", label: `En préparation (${compte.preparation})` },
              { id: "servies", label: `Servies (${compte.servies})` },
            ]}
          />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Select value={serveur} onChange={(e) => setServeur(e.target.value)} aria-label="Filtrer par serveur" className="sm:w-52">
            <option value="">Tous les serveurs</option>
            {data.serveurs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom}
              </option>
            ))}
          </Select>
          <div className="relative sm:w-60">
            <MagnifyingGlass size={18} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une table" aria-label="Rechercher une table" className="pl-10" />
          </div>
        </div>
      </div>

      {liste.length === 0 ? (
        <Card>
          <EmptyState icon={<CallBell size={24} />} title="Aucune commande à afficher.">
            {q || serveur ? "Aucune commande ne correspond à ces filtres." : "Les commandes envoyées par les tables apparaîtront ici, en direct."}
          </EmptyState>
        </Card>
      ) : (
        <ul className="flex flex-col gap-4">
          {liste.map((o) => (
            <li key={o.id}>
              <Card className="p-4 sm:p-5">
                <header className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <h2 className="text-[1.3rem] leading-tight font-semibold text-ink">
                    {o.table} <span className="font-normal text-muted">· Commande {two(o.rang)}</span>
                  </h2>
                  <OrderBadge order={o} />
                  <span className="flex items-center gap-2 text-[14.5px] text-muted">
                    <Avatar name={o.serveur || "?"} className="size-8 text-[13px]" />
                    {o.serveur || "Aucun serveur affecté"}
                  </span>
                  <span className="hidden sm:block">
                    <Hour iso={o.creeLe} fuseau={fuseau} />
                  </span>
                  <Link href={`/salle/servir/${o.id}`} className={buttonClass("primary", "md", "ml-auto max-sm:w-full")}>
                    Voir le détail <ArrowRight size={18} />
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
