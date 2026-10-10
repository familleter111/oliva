import fs from "node:fs";
import { paths } from "@/lib/server/env";
import { isAppError } from "@/lib/server/errors";
import { SHEETS } from "@/lib/server/schema";
import { __releaseLock, readDb, readWorkbookFile } from "@/lib/server/storage";
import { postgresConfigured } from "@/lib/server/store/postgres";

/** Vérifie l'état enregistré sans rien écrire : lecture, schéma, identifiants, relations. */
async function main() {
  const file = process.argv[2] ?? (postgresConfigured() ? "" : paths.workbook);
  if (!file) {
    // Base configurée et aucun fichier demandé : on contrôle ce que lit l'application.
    const db = await readDb();
    console.log("État valide, lu dans la base de données.");
    console.log(`Schéma ${db._meta.schemaVersion}, révision ${db._meta.revision}, dernière écriture ${db._meta.majLe}`);
    for (const s of SHEETS) if (db[s].length > 0) console.log(`  ${s.padEnd(24)} ${db[s].length} ligne(s)`);
    return;
  }
  if (!fs.existsSync(file)) throw new Error(`Classeur introuvable : ${file}`);
  const db = await readWorkbookFile(file);
  console.log(`Classeur valide : ${file}`);
  console.log(`Schéma ${db._meta.schemaVersion}, révision ${db._meta.revision}, dernière écriture ${db._meta.majLe}`);
  for (const s of SHEETS) if (db[s].length > 0) console.log(`  ${s.padEnd(24)} ${db[s].length} ligne(s)`);
}

main()
  .catch((e) => {
    console.error(isAppError(e) ? e.message : (e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => __releaseLock());
