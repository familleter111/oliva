"use client";

import { ArrowRight, ArrowsLeftRight, CheckCircle, CircleNotch, Lock, PicnicTable, XCircle } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { cn } from "@/lib/format";
import type { ChefMember, ChefTable } from "@/lib/responsable-types";
import { Modal, useAction, useApi } from "../client";
import { Avatar, Button, Select, Textarea, buttonClass } from "../ui";

/**
 * Actions du responsable de salle. Chacune passe par /api/responsable, qui revérifie la session,
 * la permission et la portée du rôle avant d'écrire. Aucun état n'est supposé acquis dans le navigateur.
 */

/** Confie une table à un autre serveur. Les commandes et demandes ouvertes restent sur la table. */
export function TransferTable({ table, membres, label = "Changer le serveur", variant = "secondary", className }: { table: ChefTable; membres: ChefMember[]; label?: string; variant?: "primary" | "secondary" | "outline"; className?: string }) {
  const [open, setOpen] = useState(false);
  const [serveurId, setServeurId] = useState("");
  const [note, setNote] = useState("");
  const call = useApi("responsable");
  const { run, pending } = useAction();

  const actuel = membres.find((m) => m.id === table.serveurId);
  const cible = membres.find((m) => m.id === serveurId);
  const confirmer = async () => {
    const out = await run(() => call("POST", `tables/${table.id}/affecter`, { serveurId, note }), {
      success: serveurId ? `${table.nom} confiée à ${cible?.nom ?? "un autre serveur"}.` : `${table.nom} n'est plus affectée.`,
    });
    if (out !== undefined) {
      setOpen(false);
      setNote("");
    }
  };

  return (
    <>
      <button
        type="button"
        className={buttonClass(variant, "md", className)}
        onClick={() => {
          setServeurId(table.serveurId);
          setOpen(true);
        }}
      >
        <ArrowsLeftRight size={18} /> {label}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Transférer la ${table.nom.toLowerCase()}`}
        description="Les commandes et demandes ouvertes resteront rattachées à cette table."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button onClick={confirmer} disabled={pending || serveurId === table.serveurId}>
              {pending ? <CircleNotch size={18} className="animate-spin" /> : <CheckCircle size={18} weight="fill" />}
              Confirmer le transfert
            </Button>
          </>
        }
      >
        <div className="flex items-center gap-3 rounded-xl bg-olive-tint px-4 py-3">
          <span className="inline-grid size-11 shrink-0 place-items-center rounded-xl bg-white text-olive-deep">
            <PicnicTable size={22} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[1.1rem] font-semibold text-ink">
              {table.nom} · {table.convives} convive{table.convives > 1 ? "s" : ""}
            </p>
            <p className="text-[14.5px] text-muted">Serveur actuel : {actuel?.nom || "aucun"}</p>
          </div>
        </div>

        <label htmlFor="transfert-serveur" className="mt-4 mb-1.5 block text-[15px] font-medium text-text">
          Nouveau serveur
        </label>
        <Select id="transfert-serveur" value={serveurId} onChange={(e) => setServeurId(e.target.value)}>
          <option value="">Aucun serveur affecté</option>
          {membres.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nom}
            </option>
          ))}
        </Select>

        {cible || actuel ? (
          <div className="mt-4 rounded-xl border border-line bg-paper p-3">
            <p className="eyebrow mb-2">Charge après transfert</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {[
                cible ? { m: cible, delta: cible.id === table.serveurId ? 0 : 1 } : null,
                actuel && actuel.id !== cible?.id ? { m: actuel, delta: -1 } : null,
              ]
                .filter((x): x is { m: ChefMember; delta: number } => !!x)
                .map(({ m, delta }) => (
                  <li key={m.id} className="flex items-center gap-2.5 rounded-lg bg-white px-3 py-2">
                    <Avatar name={m.nom} className="size-9" />
                    <span className="min-w-0">
                      <span className="block text-[15px] font-medium text-ink">{m.nom}</span>
                      <span className="num block text-[13.5px] text-muted">
                        {Math.max(0, m.tables.length + delta)} table{Math.max(0, m.tables.length + delta) > 1 ? "s" : ""} · {Math.max(0, m.convives + delta * table.convives)} convive
                        {Math.max(0, m.convives + delta * table.convives) > 1 ? "s" : ""}
                      </span>
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}

        <label htmlFor="transfert-note" className="mt-4 mb-1.5 block text-[15px] font-medium text-text">
          Note de passation <span className="text-muted">(facultative)</span>
        </label>
        <Textarea id="transfert-note" rows={3} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ce que le serveur doit savoir en arrivant à la table." />
        <p className="mt-1 text-[13.5px] text-muted">Elle est conservée dans l'historique des actions.</p>
      </Modal>
    </>
  );
}

/** Attribue une demande client à un membre de l'équipe. */
export function AssignRequest({ demandeId, serveurs, defaut }: { demandeId: string; serveurs: { id: string; nom: string }[]; defaut: string }) {
  const [serveurId, setServeurId] = useState(defaut || serveurs[0]?.id || "");
  const call = useApi("responsable");
  const { run, pending } = useAction();
  const nom = serveurs.find((s) => s.id === serveurId)?.nom ?? "";
  return (
    <div className="sm:w-56">
      <label htmlFor={`attrib-${demandeId}`} className="mb-1.5 block text-[14.5px] text-muted">
        Attribuer à
      </label>
      <Select id={`attrib-${demandeId}`} value={serveurId} onChange={(e) => setServeurId(e.target.value)}>
        {serveurs.length === 0 ? <option value="">Aucun serveur disponible</option> : null}
        {serveurs.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nom}
          </option>
        ))}
      </Select>
      <Button
        className="mt-2 w-full"
        disabled={pending || !serveurId}
        onClick={() => void run(() => call("POST", `demandes/${demandeId}/attribuer`, { serveurId }), { success: `Demande confiée à ${nom}.` })}
      >
        {pending ? <CircleNotch size={18} className="animate-spin" /> : null}
        Attribuer <ArrowRight size={18} />
      </Button>
    </div>
  );
}

/** Ouvre une session sur une table libre. Le code est généré par le serveur. */
export function OpenSession({ tableId, nom, className }: { tableId: string; nom: string; className?: string }) {
  const call = useApi("responsable");
  const { run, pending } = useAction();
  return (
    <button type="button" disabled={pending} className={buttonClass("primary", "md", className)} onClick={() => void run(() => call("POST", "sessions", { tableId }), { success: `Session ouverte pour la ${nom.toLowerCase()}.` })}>
      {pending ? <CircleNotch size={18} className="animate-spin" /> : null}
      Ouvrir une session
    </button>
  );
}

export function RenewCode({ sessionId, nom }: { sessionId: string; nom: string }) {
  const call = useApi("responsable");
  const { run, pending } = useAction();
  return (
    <button type="button" disabled={pending} className={buttonClass("secondary", "md")} onClick={() => void run(() => call("POST", `sessions/${sessionId}/code`), { success: `Nouveau code pour la ${nom.toLowerCase()}.` })}>
      {pending ? <CircleNotch size={18} className="animate-spin" /> : <ArrowsLeftRight size={18} />}
      Changer le code
    </button>
  );
}

/**
 * Terminer une session. La liste de contrôle reflète l'état réel : commandes servies et addition remise.
 * Le règlement se fait à la caisse, hors de l'application : rien n'est encaissé ici.
 */
export function CloseSession({ table, pretes, enPreparation, additionRemise, className }: { table: ChefTable; pretes: number; enPreparation: number; additionRemise: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const call = useApi("responsable");
  const { run, pending } = useAction();
  const reste = pretes + enPreparation;
  const confirmer = async () => {
    const out = await run(() => call("POST", `sessions/${table.sessionId}/fermer`), { success: `Session de la ${table.nom.toLowerCase()} fermée, accès révoqués.` });
    if (out !== undefined) setOpen(false);
  };
  const ligne = (ok: boolean, texte: string) => (
    <li className={cn("flex items-center gap-3 rounded-xl px-4 py-3 text-[15.5px]", ok ? "bg-olive-soft text-ink" : "bg-warn-soft text-warn")}>
      {ok ? <CheckCircle size={22} weight="fill" aria-hidden className="shrink-0 text-olive" /> : <XCircle size={22} weight="fill" aria-hidden className="shrink-0" />}
      {texte}
    </li>
  );

  return (
    <>
      <button type="button" className={buttonClass("primary", "lg", cn("w-full", className))} onClick={() => setOpen(true)}>
        <Lock size={19} /> Fermer la session
      </button>
      {reste > 0 ? <p className="mt-2 text-center text-[14px] text-warn">{reste === 1 ? "Une commande reste à servir." : `${reste} commandes restent à servir.`}</p> : null}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Terminer la session de la ${table.nom.toLowerCase()} ?`}
        description={`${table.nom} · ${table.convives} convive${table.convives > 1 ? "s" : ""}${table.serveur ? ` · Serveur : ${table.serveur}` : ""}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Garder la session ouverte
            </Button>
            <Button onClick={confirmer} disabled={pending}>
              {pending ? <CircleNotch size={18} className="animate-spin" /> : <Lock size={18} />}
              Confirmer la fermeture
            </Button>
          </>
        }
      >
        <ul className="flex flex-col gap-2">
          {ligne(reste === 0, reste === 0 ? "Toutes les commandes sont servies" : reste === 1 ? "Une commande n'est pas encore servie" : `${reste} commandes ne sont pas encore servies`)}
          {ligne(additionRemise, additionRemise ? "Addition remise à la table" : "Addition pas encore remise")}
        </ul>
        <p className="mt-4 text-[15px] leading-snug text-muted">
          Les clients ne pourront plus commander dans cette session. La prochaine ouverture démarrera un nouveau panier et un nouvel historique client.
        </p>
        <p className="mt-2 text-[14.5px] leading-snug text-muted">L'historique du service reste conservé côté restaurant. Le règlement se fait à la caisse, en dehors de l'application.</p>
        <p className="mt-4 flex items-center gap-2.5 rounded-xl bg-olive-tint px-4 py-3 text-[14.5px] text-text">
          <PicnicTable size={19} aria-hidden className="shrink-0 text-olive-deep" />
          Table prête à être libérée après confirmation.
        </p>
      </Modal>
    </>
  );
}
