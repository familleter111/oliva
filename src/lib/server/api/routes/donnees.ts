import "server-only";
import { z } from "zod";
import { formatDateTime } from "../../../format";
import { changeMarker } from "../../db-utils";
import { AppError, invalide } from "../../errors";
import type { Db, Row } from "../../schema";
import { backupWorkbookKey, createBackup, deleteBackup, previewRestore, restoreBackup } from "../../services/backups";
import { bucket } from "../../store/bucket";
import { collectGarbage } from "../../services/media";
import { cancelScheduled, publish } from "../../services/publication";
import { IMPORT_MAX_BYTES, applyImport, exportData, previewImport, toCsv } from "../../services/transfer";
import { onCommit, readDb } from "../../storage";
import { assertBodySize, choix, txt, type Ctx, type Routes } from "../core";
import { watchOthers } from "../stream";

const PERM = "donnees.gerer" as const;

async function importFile(c: Ctx): Promise<{ type: string; buffer: Buffer }> {
  assertBodySize(c.req, IMPORT_MAX_BYTES + 64 * 1024);
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    throw invalide("Envoi illisible : sélectionnez un fichier CSV ou Excel.");
  }
  const file = form.get("fichier");
  if (!(file instanceof File)) throw invalide("Aucun fichier reçu.");
  if (file.size > IMPORT_MAX_BYTES) throw invalide("Fichier trop volumineux : 2 Mo maximum.");
  return { type: String(form.get("type") ?? ""), buffer: Buffer.from(await file.arrayBuffer()) };
}

const download = (body: Buffer, filename: string, contentType: string) =>
  new Response(new Uint8Array(body), { headers: { "Content-Type": contentType, "Content-Disposition": `attachment; filename="${filename}"`, "X-Content-Type-Options": "nosniff" } });

/** Filtres partagés entre la page Historique et son export. */
export function filterHistory(db: Db, q: { periode?: string; auteur?: string; action?: string; recherche?: string }): Row<"HistoriqueActions">[] {
  const days = q.periode === "jour" ? 1 : q.periode === "mois" ? 30 : q.periode === "tout" ? 0 : 7;
  const since = days ? Date.now() - days * 24 * 3600 * 1000 : 0;
  const needle = (q.recherche ?? "").trim().toLowerCase();
  return db.HistoriqueActions.filter((e) => {
    if (since && Date.parse(e.date) < since) return false;
    if (q.auteur && e.auteurId !== q.auteur) return false;
    if (q.action && e.action !== q.action) return false;
    if (needle && !`${e.libelle} ${e.entiteNom} ${e.auteurNom}`.toLowerCase().includes(needle)) return false;
    return true;
  }).reverse();
}

export const donneesRoutes: Routes = {
  "POST import/apercu": {
    perm: PERM,
    run: async (c) => {
      const { type, buffer } = await importFile(c);
      return previewImport(await readDb(), type, buffer);
    },
  },
  "POST import/appliquer": {
    perm: PERM,
    run: async (c) => {
      const { type, buffer } = await importFile(c);
      return applyImport(c.actor, type, buffer);
    },
  },
  "GET export/:type": {
    perm: PERM,
    input: z.object({ format: choix(["xlsx", "csv"]).optional(), colonnes: z.string().max(300).optional() }),
    run: async (c, input: { format?: "xlsx" | "csv"; colonnes?: string }) => {
      const out = await exportData(await readDb(), c.params.type, input.format ?? "xlsx", (input.colonnes ?? "").split(",").filter(Boolean));
      return download(out.body, out.filename, out.contentType);
    },
  },

  "POST sauvegardes": {
    perm: PERM,
    input: z.object({ note: txt(80).optional() }),
    run: (c, input: { note?: string }) => createBackup(c.actor, input.note ?? ""),
  },
  "GET sauvegardes/:id/apercu": { perm: PERM, run: async (c) => previewRestore(c.params.id, await readDb()) },
  "GET sauvegardes/:id/fichier": {
    perm: PERM,
    run: async (c) => {
      const data = await bucket().get(backupWorkbookKey(c.params.id));
      if (!data) throw new AppError("introuvable", "Sauvegarde introuvable.");
      return download(data, `${c.params.id}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    },
  },
  "POST sauvegardes/:id/restaurer": {
    perm: PERM,
    input: z.object({ confirmation: z.string() }),
    run: async (c, input: { confirmation: string }) => {
      if (input.confirmation.trim().toUpperCase() !== "RESTAURER") throw invalide("Saisissez RESTAURER pour confirmer.");
      const out = await restoreBackup(c.actor, c.params.id);
      await collectGarbage(await readDb());
      return out;
    },
  },
  "DELETE sauvegardes/:id": { perm: PERM, run: (c) => deleteBackup(c.actor, c.params.id) },

  "GET historique/export": {
    perm: "historique.consulter",
    input: z.object({ periode: z.string().optional(), auteur: z.string().optional(), action: z.string().optional(), recherche: z.string().max(80).optional() }),
    run: async (_c, q: { periode?: string; auteur?: string; action?: string; recherche?: string }) => {
      const db = await readDb();
      const tz = db.Restaurant[0]?.fuseauHoraire || undefined;
      const rows = filterHistory(db, q).map((e) => [formatDateTime(e.date, tz), e.auteurNom, e.libelle, e.entiteNom, e.resultat, e.avant ? JSON.stringify(e.avant) : "", e.apres ? JSON.stringify(e.apres) : ""]);
      const body = Buffer.from(toCsv([["Date", "Auteur", "Action", "Élément", "Résultat", "Avant", "Après"], ...rows]), "utf8");
      return download(body, `oliva-historique-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv; charset=utf-8");
    },
  },

  "POST publication": {
    perm: "publication.publier",
    input: z.object({ mode: choix(["maintenant", "programmee"]), date: z.string().max(40).optional() }),
    run: async (c, input: { mode: "maintenant" | "programmee"; date?: string }) => {
      const out = await publish(c.actor, input.mode, input.date);
      await collectGarbage(await readDb());
      return out;
    },
  },
  "DELETE publication/programmee": { perm: "publication.publier", run: (c) => cancelScheduled(c.actor) },

  /** Flux SSE : signale chaque sauvegarde réussie au personnel connecté. Aucune donnée métier n'y transite. */
  "GET evenements": {
    perm: [],
    run: async (c) => {
      const encoder = new TextEncoder();
      const client = c.url.searchParams.get("client") ?? "";
      const marque = changeMarker(await readDb());
      let cleanup = () => {};
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const send = (event: string, data: unknown) => {
            try {
              controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
            } catch {
              cleanup();
            }
          };
          send("pret", { marque });
          // « moi » désigne l'onglet qui a enregistré, pas l'utilisateur : ses autres onglets sont prévenus eux aussi.
          const off = onCommit((e) => send("sauvegarde", { marque: e.marque, sujets: e.topics, moi: client !== "" && e.clientId === client }));
          // Écriture venue d'un autre serveur : jamais « moi », puisque cet onglet n'y est pour rien.
          const stop = watchOthers((sujets, marqueAutre) => send("sauvegarde", { marque: marqueAutre, sujets, moi: false }));
          const ping = setInterval(() => send("ping", {}), 25_000);
          cleanup = () => {
            off();
            stop();
            clearInterval(ping);
          };
          c.req.signal.addEventListener("abort", () => {
            cleanup();
            try {
              controller.close();
            } catch {
              /* déjà fermé */
            }
          });
        },
        cancel() {
          cleanup();
        },
      });
      return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
    },
  },
};
