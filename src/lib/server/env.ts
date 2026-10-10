import "server-only";
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
