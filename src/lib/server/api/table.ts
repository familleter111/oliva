import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import { assertNotLocked, clearFailures, recordFailure } from "../auth/rate-limit";
import { assertSameOrigin } from "../auth/session";
import { cookieSecure } from "../env";
import { AppError, introuvable, isAppError } from "../errors";
import { addCartLine, changeCartLine, confirmCart, joinSession, removeCartLine, sessionAccess, setLineInstructions } from "../services/cart";
import { createRequest, leaveSession, tableState } from "../services/table";
import { onCommit, readDb } from "../storage";
import { watchOthers } from "./stream";
import { entier, errorResponse, readJson, ref, refs, txt, zodProblem } from "./core";

/**
 * API des convives d'une table. Aucun compte : l'accès repose sur un jeton aléatoire, remis après
 * vérification du code de session (ou validation du personnel) et gardé dans un cookie HttpOnly.
 * L'identifiant de table ne suffit jamais, et le navigateur n'envoie jamais de prix.
 */

export const TABLE_COOKIE = () => (cookieSecure() ? "__Host-oliva_table" : "oliva_table");
const COOKIE_MAX_AGE = 12 * 3600;

export async function tableToken(): Promise<string | undefined> {
  return (await cookies()).get(TABLE_COOKIE())?.value || undefined;
}

async function requireToken(): Promise<string> {
  const jeton = await tableToken();
  if (!jeton) throw new AppError("interdit", "Cette session de table n'est plus accessible.");
  return jeton;
}

interface Route {
  /** Vrai pour la seule route accessible sans jeton. */
  open?: boolean;
  input?: z.ZodType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run: (c: { req: Request; params: Record<string, string>; jeton: string }, input: any) => unknown;
}

const cle = z.string().regex(/^[\w-]{8,80}$/, "Clé d'opération invalide.");

const routes: Record<string, Route> = {
  "POST rejoindre": {
    open: true,
    input: z.object({ tableId: ref, code: txt(12).optional(), pseudo: txt(24).optional() }),
    run: async ({ req }, input: { tableId: string; code?: string; pseudo?: string }) => {
      // Le code n'a que quatre chiffres : les essais sont comptés par adresse et par table.
      const ip = ((req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "").trim() || "local").slice(0, 60);
      const limits: [string, number, number][] = [
        [`table:${input.tableId}:${ip}`, 8, 10],
        [`table:${input.tableId}`, 60, 5],
      ];
      limits.forEach(([key]) => assertNotLocked(key));
      try {
        const out = await joinSession(input.tableId, input.code ?? "", input.pseudo ?? "");
        clearFailures(limits[0][0]);
        (await cookies()).set(TABLE_COOKIE(), out.jeton, { httpOnly: true, sameSite: "lax", secure: cookieSecure(), path: "/", maxAge: COOKIE_MAX_AGE });
        return { statut: out.statut };
      } catch (e) {
        if (isAppError(e) && e.code === "interdit") limits.forEach(([key, max, lock]) => recordFailure(key, max, lock));
        throw e;
      }
    },
  },
  "POST quitter": {
    run: async ({ jeton }) => {
      await leaveSession(jeton);
      (await cookies()).set(TABLE_COOKIE(), "", { httpOnly: true, sameSite: "lax", secure: cookieSecure(), path: "/", maxAge: 0 });
      return { ok: true };
    },
  },
  "GET etat": { run: async ({ jeton }) => tableState(await readDb(), jeton) },
  "POST panier/lignes": {
    input: z.object({ produitId: ref.min(1), quantite: entier(1, 99), optionIds: refs.optional(), instructions: txt(500).optional(), cle: cle.optional() }),
    run: ({ jeton }, i: { produitId: string; quantite: number; optionIds?: string[]; instructions?: string; cle?: string }) => addCartLine(jeton, i, i.cle),
  },
  "PATCH panier/lignes/:id": {
    input: z.union([z.object({ delta: entier(-99, 99) }), z.object({ instructions: txt(500) })]),
    run: ({ jeton, params }, i: { delta?: number; instructions?: string }) => (i.delta !== undefined ? changeCartLine(jeton, params.id, i.delta) : setLineInstructions(jeton, params.id, i.instructions ?? "")),
  },
  "DELETE panier/lignes/:id": { run: ({ jeton, params }) => removeCartLine(jeton, params.id) },
  "POST panier/confirmer": {
    input: z.object({ cle }),
    run: ({ jeton }, i: { cle: string }) => confirmCart(jeton, i.cle),
  },
  "POST demandes": {
    input: z.object({ motifId: ref.min(1), message: txt(200).optional() }),
    run: ({ jeton }, i: { motifId: string; message?: string }) => createRequest(jeton, i),
  },
  /** Flux SSE : prévient les convives d'une table que son état a changé. Aucune donnée métier n'y transite. */
  "GET evenements": {
    run: async ({ req, jeton }) => {
      const { session } = sessionAccess(await readDb(), jeton);
      const topic = `session:${session.id}`;
      const encoder = new TextEncoder();
      let cleanup = () => {};
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const send = (event: string) => {
            try {
              controller.enqueue(encoder.encode(`event: ${event}\ndata: {}\n\n`));
            } catch {
              cleanup();
            }
          };
          send("pret");
          const off = onCommit((e) => {
            if (e.topics.includes(topic)) send("maj");
          });
          const stop = watchOthers((sujets) => {
            if (sujets.includes(topic)) send("maj");
          });
          const ping = setInterval(() => send("ping"), 25_000);
          cleanup = () => {
            off();
            stop();
            clearInterval(ping);
          };
          req.signal.addEventListener("abort", () => {
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

function match(method: string, segments: string[]) {
  for (const [key, route] of Object.entries(routes)) {
    const [m, pattern] = key.split(" ");
    const parts = pattern.split("/");
    if (m !== method || parts.length !== segments.length) continue;
    const params: Record<string, string> = {};
    if (parts.every((part, i) => (part.startsWith(":") ? ((params[part.slice(1)] = segments[i]), true) : part === segments[i]))) return { route, params };
  }
  return null;
}

export async function handleTable(req: Request, segments: string[]): Promise<Response> {
  try {
    const method = req.method.toUpperCase();
    const mutating = method !== "GET" && method !== "HEAD";
    if (mutating) assertSameOrigin(req);
    const found = match(method, segments);
    if (!found) throw introuvable("Cette ressource n'existe pas.");
    const jeton = found.route.open ? "" : await requireToken();
    let input: unknown;
    if (found.route.input) {
      const parsed = found.route.input.safeParse(await readJson(req));
      if (!parsed.success) throw zodProblem(parsed.error);
      input = parsed.data;
    }
    const out = await found.route.run({ req, params: found.params, jeton }, input);
    if (out instanceof Response) return out;
    return Response.json({ ok: true, data: out ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
