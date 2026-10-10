import { blobConfigured, bucket } from "@/lib/server/store/bucket";
import { isAppError } from "@/lib/server/errors";
import { SHEETS } from "@/lib/server/schema";
import { databaseUrl, pgFermer, pgInfo, pgLire, pgSignal, postgresConfigured } from "@/lib/server/store/postgres";

/**
 * Contrôle la configuration de stockage en ligne, sans rien écrire dans les données.
 * Usage : npm run base:verifier
 */
function masque(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.username ? "***:***@" : ""}${u.host}${u.pathname}`;
  } catch {
    return "adresse illisible";
  }
}

async function main() {
  if (!postgresConfigured()) {
    console.log("Aucune base configurée : l'application utilise les fichiers du dossier de stockage.");
    console.log("Pour passer en base, renseignez DATABASE_URL (ou POSTGRES_URL) dans l'environnement.");
    return;
  }

  console.log(`Base          : ${masque(databaseUrl())}`);
  const signal = await pgSignal();
  if (!signal) {
    console.log("État          : table prête, aucune donnée enregistrée pour l'instant.");
    console.log("Au premier démarrage, l'application y créera la carte de départ.");
  } else {
    const db = await pgLire();
    const { tailleOctets } = await pgInfo();
    console.log(`État          : révision ${signal.revision}, ${(tailleOctets / 1024).toFixed(0)} Ko enregistrés.`);
    if (db) {
      console.log(`Schéma        : ${db._meta.schemaVersion}, dernière écriture ${db._meta.majLe}`);
      for (const s of SHEETS) if (db[s].length > 0) console.log(`  ${s.padEnd(24)} ${db[s].length} ligne(s)`);
    }
  }

  const depot = bucket();
  if (blobConfigured()) {
    const images = await depot.list("media");
    console.log(`Images        : dépôt Blob, ${images.length} fichier(s).`);
  } else {
    console.log("Images        : aucun dépôt Blob configuré (BLOB_READ_WRITE_TOKEN absent).");
    console.log("                Sur un hébergement sans disque, les images importées seraient perdues.");
  }
  console.log("Aucune donnée n'a été modifiée.");
}

main()
  .catch((e) => {
    console.error(isAppError(e) ? e.message : (e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => pgFermer());
