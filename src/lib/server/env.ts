import "server-only";
import fsp from "node:fs/promises";
import path from "node:path";
import { AppError } from "./errors";

/** Racine du stockage privé. Jamais sous `public/`. */
export function storageRoot(): string {
  const raw = process.env.OLIVA_STORAGE_DIR?.trim() || "./storage";
  const abs = path.resolve(/* turbopackIgnore: true */ process.cwd(), raw);
  const pub = path.resolve(/* turbopackIgnore: true */ process.cwd(), "public");
  if (abs === pub || abs.startsWith(pub + path.sep)) {
    throw new AppError("configuration", "OLIVA_STORAGE_DIR ne doit pas se trouver dans le dossier public.");
  }
  return abs;
}

export const paths = {
  get root() {
    return storageRoot();
  },
  get data() {
    return path.join(storageRoot(), "data");
  },
  get workbook() {
    return path.join(storageRoot(), "data", "oliva.xlsx");
  },
  get previous() {
    return path.join(storageRoot(), "data", "oliva.precedent.xlsx");
  },
  get marker() {
    return path.join(storageRoot(), "data", ".initialise");
  },
  get lock() {
    return path.join(storageRoot(), "data", "oliva.lock");
  },
  get media() {
    return path.join(storageRoot(), "media");
  },
  get backups() {
    return path.join(storageRoot(), "backups");
  },
  get autoBackups() {
    return path.join(storageRoot(), "backups", "auto");
  },
  get archives() {
    return path.join(storageRoot(), "data", "archives");
  },
  get tmp() {
    return path.join(storageRoot(), "tmp");
  },
};

/** Secret technique, fourni uniquement par l'environnement. */
export function appSecret(): string {
  const s = process.env.OLIVA_SECRET?.trim() ?? "";
  if (s.length < 32) {
    throw new AppError(
      "configuration",
      "OLIVA_SECRET est absent ou trop court (32 caractères minimum). Lancez `npm run setup` ou renseignez .env.local.",
    );
  }
  return s;
}

export const isProduction = () => process.env.NODE_ENV === "production";

export function cookieSecure(): boolean {
  if (process.env.OLIVA_COOKIE_SECURE === "false") return false;
  return isProduction();
}

/** URL publique configurée, sans barre finale. Vide si non renseignée. */
export function publicUrl(): string {
  return (process.env.OLIVA_PUBLIC_URL ?? "").trim().replace(/\/+$/, "");
}

/**
 * Plateforme à système de fichiers éphémère, si elle est reconnue.
 * Oliva garde ses données dans des fichiers : il lui faut un disque qui survit aux requêtes.
 */
export function ephemeralHost(): string {
  if (process.env.VERCEL) return "Vercel";
  if (process.env.NETLIFY) return "Netlify";
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) return "AWS Lambda";
  if (process.env.FUNCTIONS_WORKER_RUNTIME) return "Azure Functions";
  return "";
}

/** Codes renvoyés par un hébergement qui n'autorise pas l'écriture, par opposition à un incident de disque. */
const REFUS_HEBERGEMENT = new Set(["EROFS", "EACCES", "EPERM", "ENOENT"]);

/** Crée un dossier du stockage. En cas de refus du disque, explique la cause plutôt que de laisser passer un code système. */
export async function ensureDir(dir: string): Promise<void> {
  try {
    await fsp.mkdir(dir, { recursive: true });
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code ?? "inconnu";
    if (!REFUS_HEBERGEMENT.has(code)) {
      throw new AppError("stockage", `Le dossier de stockage « ${dir} » n'a pas pu être créé (${code}). Vérifiez l'état du disque. Aucune donnée n'a été modifiée.`, { cause: e });
    }
    const hote = ephemeralHost();
    if (hote) {
      throw new AppError(
        "configuration",
        `Oliva ne peut pas fonctionner sur ${hote} : le dossier de stockage « ${dir} » n'est pas inscriptible et le système de fichiers y est recréé à chaque requête. Déployez l'application sur un serveur Node avec un disque persistant (conteneur avec volume, serveur privé virtuel), puis pointez OLIVA_STORAGE_DIR sur ce disque.`,
        { cause: e },
      );
    }
    throw new AppError(
      "configuration",
      `Le dossier de stockage « ${dir} » n'a pas pu être créé (${code}). Vérifiez que le chemin est inscriptible par l'utilisateur du serveur et la valeur de OLIVA_STORAGE_DIR.`,
      { cause: e },
    );
  }
}
