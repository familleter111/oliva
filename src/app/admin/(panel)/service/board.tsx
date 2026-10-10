"use client";

import { ArrowRight, CallBell, Check, ChefHat, PicnicTable, UserPlus } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { tab, useAction, useApi } from "@/components/client";
import { Badge, Button, Callout, Card, CardHeader, EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import type { ServiceOrder, ServiceState } from "@/lib/table-types";

interface Droits {
  preparer: boolean;
  servir: boolean;
  sessions: boolean;
  salle: boolean;
}

function hour(iso: string, timeZone: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone }).format(d);
}

export function ServiceBoard({ initial, fuseau, droits }: { initial: ServiceState; fuseau: string; droits: Droits }) {
  const call = useApi();
  const { run, pending } = useAction();
  const [state, setState] = useState(initial);

  const reload = useCallback(async () => {
    try {
      setState(await call<ServiceState>("GET", "service"));
    } catch {
      /* la prochaine mise à jour réessaiera */
    }
  }, [call]);

  // Suivi en direct : chaque enregistrement qui concerne le service recharge l'écran.
  useEffect(() => {
    let source: EventSource | null = null;
    const open = () => {
      if (source || document.visibilityState !== "visible") return;
      source = new EventSource(`/api/admin/evenements?client=${encodeURIComponent(`${tab.clientId()}-service`)}`);
      source.addEventListener("pret", () => void reload());
      source.addEventListener("sauvegarde", (e) => {
        try {
          if ((JSON.parse((e as MessageEvent<string>).data) as { sujets?: string[] }).sujets?.includes("service")) void reload();
        } catch {
          /* message illisible : ignoré */
        }
      });
    };
    const close = () => {
      source?.close();
      source = null;
    };
    const onVisibility = () => (document.visibilityState === "visible" ? open() : close());
    open();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", close);
    window.addEventListener("pageshow", open);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", close);
      window.removeEventListener("pageshow", open);
      close();
    };
  }, [reload]);

  const act = async (method: "POST", path: string, body: unknown, success: string) => {
    await run(() => call(method, path, body), { success, refresh: false });
    await reload();
  };

  const last = state.statuts.at(-1)?.id;
  const nextOf = (o: ServiceOrder) => state.statuts[state.statuts.findIndex((s) => s.id === o.statut) + 1];
  const nameOf = (id: string) => state.statuts.find((s) => s.id === id)?.nom ?? id;
  const pendingGuests = state.sessions.flatMap((s) => s.enAttente.map((p) => ({ ...p, table: s.table })));

  const orderCard = (o: ServiceOrder, done = false) => {
    const next = nextOf(o);
    const allowed = next ? (next.id === last ? droits.servir : droits.preparer) : false;
    return (
      <li key={o.id} className="rounded-xl border border-line bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[1.15rem] font-semibold text-ink">
            {o.table} <span className="font-normal text-muted">· commande n° {o.numero}</span>
          </p>
          <Badge tone={done ? "neutral" : "olive"} dot>
            {nameOf(o.statut)}
          </Badge>
        </div>
        <p className="num text-[14px] text-muted">
          Reçue à {hour(o.creeLe, fuseau)} · {formatMoney(o.totalCentimes, o.devise)}
        </p>
        <ul className="mt-2.5 grid gap-1 text-[15.5px]">
          {o.lignes.map((l, i) => (
            <li key={i}>
              <span className="num font-semibold">{l.quantite} ×</span> {l.nom}
              {l.options.length > 0 ? <span className="text-muted"> ({l.options.map((x) => x.nom).join(", ")})</span> : null}
              {l.instructions ? <span className="block pl-7 text-[14.5px] text-warn">« {l.instructions} »</span> : null}
            </li>
          ))}
        </ul>
        {next && allowed ? (
          <Button className="mt-3" disabled={pending} onClick={() => void act("POST", `commandes/${o.id}/statut`, { statut: next.id }, `${o.table} : ${next.nom}.`)}>
            {next.id === last ? <Check size={18} /> : <ChefHat size={18} />} Passer à « {next.nom} »
          </Button>
        ) : null}
      </li>
    );
  };

  return (
    <>
      <PageHeader eyebrow="Équipe & salle" title="Service en direct" subtitle="Les commandes et les demandes des tables ouvertes, au fil de l'eau." />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Card className="p-6">
          <CardHeader icon={<ChefHat size={22} />} title={`Commandes en cours (${state.commandes.length})`} description="Envoyées depuis les tables. Faites-les avancer : les clients suivent chaque étape." />
          {state.commandes.length === 0 ? (
            <EmptyState icon={<ChefHat size={30} />} title="Aucune commande en cours">
              Les commandes confirmées par les tables apparaissent ici aussitôt.
            </EmptyState>
          ) : (
            <ul className="mt-4 grid gap-3">{state.commandes.map((o) => orderCard(o))}</ul>
          )}
          {state.servies.length > 0 ? (
            <details className="mt-5 border-t border-line pt-4">
              <summary className="cursor-pointer text-[1.05rem] text-text">Commandes servies ({state.servies.length})</summary>
              <ul className="mt-3 grid gap-3">{state.servies.map((o) => orderCard(o, true))}</ul>
            </details>
          ) : null}
        </Card>

        <div className="grid gap-5">
          <Card className="p-6">
            <CardHeader icon={<CallBell size={22} />} title={`Demandes des tables (${state.demandes.length})`} description="Appels envoyés par les clients depuis leur table." />
            {state.demandes.length === 0 ? (
              <p className="mt-4 text-[15.5px] text-muted">Aucune demande en attente.</p>
            ) : (
              <ul className="mt-4 grid gap-2.5">
                {state.demandes.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-[1.08rem] text-ink">
                        <span className="font-semibold">{d.table}</span> · {d.libelle}
                      </p>
                      <p className="num text-[14px] text-muted">
                        {hour(d.creeLe, fuseau)}
                        {d.auteur ? ` · ${d.auteur}` : ""}
                        {d.message ? ` · « ${d.message} »` : ""}
                      </p>
                      {d.statut === "en_cours" ? (
                        <p className="mt-1">
                          <Badge tone="info" dot>
                            Prise en charge{d.prisePar ? ` par ${d.prisePar}` : ""}
                          </Badge>
                        </p>
                      ) : null}
                    </div>
                    <Button variant="secondary" size="sm" disabled={pending} onClick={() => void act("POST", `demandes/${d.id}/traiter`, undefined, "Demande traitée.")}>
                      <Check size={16} /> Traitée
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {pendingGuests.length > 0 ? (
            <Card className="p-6">
              <CardHeader icon={<UserPlus size={22} />} title={`Arrivées à valider (${pendingGuests.length})`} description="Clients qui attendent votre accord pour rejoindre leur table." />
              <ul className="mt-4 grid gap-2.5">
                {pendingGuests.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3">
                    <p className="text-[1.05rem] text-ink">
                      <span className="font-semibold">{p.table}</span> · {p.nom} <span className="num text-[14px] text-muted">· {hour(p.rejointLe, fuseau)}</span>
                    </p>
                    {droits.sessions ? (
                      <span className="flex gap-2">
                        <Button size="sm" disabled={pending} onClick={() => void act("POST", `participants/${p.id}/admettre`, undefined, "Client admis à la table.")}>
                          Admettre
                        </Button>
                        <Button variant="secondary" size="sm" disabled={pending} onClick={() => void act("POST", `participants/${p.id}/refuser`, undefined, "Demande refusée.")}>
                          Refuser
                        </Button>
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card className="p-6">
            <CardHeader icon={<PicnicTable size={22} />} title={`Tables ouvertes (${state.sessions.length})`} description="Le code est à communiquer aux clients présents." />
            {state.sessions.length === 0 ? (
              <p className="mt-4 text-[15.5px] text-muted">Aucune session de table ouverte.</p>
            ) : (
              <ul className="mt-4 grid gap-2">
                {state.sessions.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border border-line bg-white px-4 py-3">
                    <p className="text-[1.08rem] font-semibold text-ink">{s.table}</p>
                    <p className="text-[14.5px] text-muted">
                      {s.convives} convive(s) · {s.panierArticles} article(s) au panier · depuis {hour(s.ouverteLe, fuseau)}
                    </p>
                    {s.code ? (
                      <p className="text-[14.5px] text-muted">
                        Code <span className="num rounded-md bg-olive-soft px-2 py-0.5 text-[1.05rem] font-semibold tracking-[0.2em] text-ink">{s.code}</span>
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {droits.salle ? (
              <Link href="/admin/qr" className={buttonClass("secondary", "md", "mt-4")}>
                Ouvrir ou fermer une table <ArrowRight size={17} />
              </Link>
            ) : null}
          </Card>
        </div>
      </div>

      <Callout tone="neutral" className="mt-5">
        Cet écran remplace, pour l'instant, les écrans dédiés à la cuisine et à la salle. Aucune impression ni alerte sonore n'est déclenchée : gardez-le ouvert pendant le service.
      </Callout>
    </>
  );
}
