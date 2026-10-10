import fs from "node:fs";
import path from "node:path";

/** Prépare un stockage vierge et isolé pour un fichier de test, puis charge les modules serveur. */
export async function setup(name: string) {
  const dir = path.resolve(process.cwd(), "tests/.tmp", `${name}-${Date.now()}`);
  fs.rmSync(dir, { recursive: true, force: true });
  process.env.OLIVA_STORAGE_DIR = dir;
  process.env.OLIVA_SECRET = "secret-de-test-secret-de-test-secret-de-test-123456";
  process.env.OLIVA_TEST = "1";
  delete (globalThis as Record<string, unknown>).__olivaStorage;
  delete (globalThis as Record<string, unknown>).__olivaSnap;
  const storage = await import("@/lib/server/storage");
  return { dir, storage, workbook: path.join(dir, "data", "oliva.xlsx") };
}

/** Simule un redémarrage du processus : l'état en mémoire est perdu, seul le disque reste. */
export function restart(storage: { __releaseLock: () => void }) {
  storage.__releaseLock();
  delete (globalThis as Record<string, unknown>).__olivaStorage;
  delete (globalThis as Record<string, unknown>).__olivaSnap;
}

export const ACTOR = { id: "test", nom: "Test" };
