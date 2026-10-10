import fs from "node:fs";
import path from "node:path";
import { isAppError } from "@/lib/server/errors";
import { __releaseLock, restoreWorkbookFrom } from "@/lib/server/storage";

/**
 * Remet en place un classeur choisi explicitement, application arrêtée.
 * Usage : npm run storage:restaurer -- storage/data/oliva.precedent.xlsx
 */
async function main() {
  const arg = process.argv[2];
  if (!arg) throw new Error("Indiquez le classeur à restaurer. Exemple : npm run storage:restaurer -- storage/data/oliva.precedent.xlsx");
  const file = path.resolve(process.cwd(), arg);
  if (!fs.existsSync(file)) throw new Error(`Fichier introuvable : ${file}`);
  const out = await restoreWorkbookFrom(file);
  console.log(`Classeur restauré depuis ${file} (révision ${out.revision}).`);
  if (out.ancien) console.log(`L'ancien classeur a été conservé : ${out.ancien}`);
}

main()
  .catch((e) => {
    console.error(isAppError(e) ? e.message : (e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => __releaseLock());
