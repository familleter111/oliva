import "server-only";
import { onCommit } from "../storage";
import { pgSignal, postgresConfigured } from "../store/postgres";

/** Intervalle d'interrogation de la base quand plusieurs serveurs se partagent les requêtes. */
const SONDAGE_MS = 4000;

/**
 * Surveille les écritures faites par les autres serveurs.
 *
 * En mémoire, le bus suffit : un seul processus écrit. Avec une base partagée, chaque serveur
 * ignore les écritures des autres, alors on relit la révision à intervalle court. La requête
 * ne ramène que trois colonnes, jamais les données.
 */
export function watchOthers(onMaj: (sujets: string[], marque: string) => void): () => void {
  if (!postgresConfigured()) return () => {};
  let vue = -1;
  let arrete = false;
  let minuteur: NodeJS.Timeout | null = null;

  const tour = async () => {
    try {
      const signal = await pgSignal();
      if (signal) {
        // Le premier passage ne fait qu'établir le point de départ.
        if (vue >= 0 && signal.revision > vue) onMaj(signal.sujets, signal.marque);
        vue = Math.max(vue, signal.revision);
      }
    } catch {
      /* base momentanément injoignable : le tour suivant réessaie */
    }
    if (!arrete) minuteur = setTimeout(tour, SONDAGE_MS);
  };
  minuteur = setTimeout(tour, SONDAGE_MS);

  return () => {
    arrete = true;
    if (minuteur) clearTimeout(minuteur);
  };
}

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
}
