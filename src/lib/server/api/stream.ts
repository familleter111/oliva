import "server-only";
import { onCommit } from "../storage";

/**
 * Flux SSE partagé par les espaces du personnel : signale qu'un écran du service a changé.
 * Aucune donnée métier n'y transite, seulement un signal de rafraîchissement.
 */
export function serviceStream(req: Request, topic = "service"): Response {
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
      const ping = setInterval(() => send("ping"), 25_000);
      cleanup = () => {
        off();
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
}
