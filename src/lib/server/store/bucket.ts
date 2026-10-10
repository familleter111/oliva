import "server-only";
import fsp from "node:fs/promises";
import path from "node:path";
import { ensureDir, storageRoot } from "../env";
import { AppError, invalide } from "../errors";

/**
 * Dépôt de fichiers binaires : images, sauvegardes, archives d'historique.
 * Deux implémentations, choisies par la configuration : le disque local, ou le stockage Blob
 * quand l'application tourne sur un hébergement sans disque. Les clés sont des chemins
 * relatifs en minuscules, séparés par des barres obliques, sans `..`.
 */
export interface BucketEntry {
  cle: string;
  taille: number;
  dateMs: number;
}

export interface Bucket {
  readonly nom: "disque" | "blob";
  put(cle: string, data: Buffer, opts?: { ecraser?: boolean; typeMime?: string }): Promise<void>;
  get(cle: string): Promise<Buffer | null>;
  remove(cle: string): Promise<void>;
  /** Entrées directement sous ce préfixe, sans descendre dans les sous-dossiers. */
  list(prefixe: string): Promise<BucketEntry[]>;
  /** Efface tout ce qui se trouve sous ce préfixe, sous-dossiers compris. */
  removeAll(prefixe: string): Promise<void>;
  copy(de: string, vers: string): Promise<void>;
}

const CLE = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

/** Une clé ne désigne jamais autre chose qu'un fichier du dépôt : pas de chemin absolu, pas de remontée. */
export function checkKey(cle: string): string {
  if (!CLE.test(cle) || cle.includes("..")) throw invalide("Nom de fichier refusé.");
  return cle;
}

const prefixeDe = (cle: string) => cle.slice(0, cle.lastIndexOf("/") + 1);

/* ------------------------------------------------------------------- disque */

function fichiers(): Bucket {
  const plein = (cle: string) => path.join(storageRoot(), ...checkKey(cle).split("/"));
  return {
    nom: "disque",
    async put(cle, data, opts) {
      const cible = plein(cle);
      await ensureDir(path.dirname(cible));
      await fsp.writeFile(cible, data, opts?.ecraser ? undefined : { flag: "wx" });
    },
    async get(cle) {
      try {
        return await fsp.readFile(plein(cle));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw e;
      }
    },
    async remove(cle) {
      await fsp.rm(plein(cle), { force: true }).catch(() => undefined);
    },
    async list(prefixe) {
      const dir = path.join(storageRoot(), ...(prefixe ? checkKey(prefixe).split("/") : []));
      let noms: string[];
      try {
        noms = await fsp.readdir(dir);
      } catch {
        return [];
      }
      const out: BucketEntry[] = [];
      for (const nom of noms) {
        const st = await fsp.stat(path.join(dir, nom)).catch(() => null);
        if (st?.isFile()) out.push({ cle: `${prefixe ? `${prefixe}/` : ""}${nom}`, taille: st.size, dateMs: st.mtimeMs });
      }
      return out;
    },
    async removeAll(prefixe) {
      await fsp.rm(plein(prefixe), { recursive: true, force: true }).catch(() => undefined);
    },
    async copy(de, vers) {
      const cible = plein(vers);
      await ensureDir(path.dirname(cible));
      await fsp.copyFile(plein(de), cible);
    },
  };
}

/* --------------------------------------------------------------------- blob */

/** Le jeton est fourni par l'hébergeur. Sans lui, le dépôt Blob n'est pas configuré. */
export function blobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN?.trim();
}

function blob(): Bucket {
  // Chargement différé : le paquet n'est utile que sur un hébergement sans disque.
  const sdk = () => import("@vercel/blob");
  const absent = (e: unknown) => (e as { name?: string }).name === "BlobNotFoundError";

  return {
    nom: "blob",
    async put(cle, data, opts) {
      const { put } = await sdk();
      try {
        await put(checkKey(cle), data, {
          access: "private",
          addRandomSuffix: false,
          allowOverwrite: opts?.ecraser ?? false,
          contentType: opts?.typeMime ?? "application/octet-stream",
        });
      } catch (e) {
        throw new AppError("stockage", "Le fichier n'a pas pu être enregistré dans le stockage Blob. Rien n'a été modifié.", { cause: e });
      }
    },
    async get(cle) {
      const { get } = await sdk();
      try {
        const res = await get(checkKey(cle), { access: "private", useCache: false });
        if (!res) return null;
        const morceaux: Uint8Array[] = [];
        // @ts-expect-error le flux renvoyé par le SDK est bien itérable côté Node.
        for await (const m of res.stream) morceaux.push(m as Uint8Array);
        return Buffer.concat(morceaux);
      } catch (e) {
        if (absent(e)) return null;
        throw new AppError("stockage", "Le fichier est illisible dans le stockage Blob.", { cause: e });
      }
    },
    async remove(cle) {
      const { del } = await sdk();
      await del(checkKey(cle)).catch(() => undefined);
    },
    async list(prefixe) {
      const { list } = await sdk();
      const debut = prefixe ? `${checkKey(prefixe)}/` : "";
      const out: BucketEntry[] = [];
      let curseur: string | undefined;
      do {
        const page = await list({ prefix: debut, cursor: curseur, limit: 1000 });
        for (const b of page.blobs) {
          // Pas de descente dans les sous-dossiers : même règle que `readdir` sur le disque.
          if (b.pathname.slice(debut.length).includes("/")) continue;
          out.push({ cle: b.pathname, taille: b.size, dateMs: b.uploadedAt.getTime() });
        }
        curseur = page.hasMore ? page.cursor : undefined;
      } while (curseur);
      return out;
    },
    async removeAll(prefixe) {
      const { del, list } = await sdk();
      const debut = `${checkKey(prefixe)}/`;
      let curseur: string | undefined;
      do {
        const page = await list({ prefix: debut, cursor: curseur, limit: 1000 });
        const cles = page.blobs.map((b) => b.pathname);
        if (cles.length) await del(cles).catch(() => undefined);
        curseur = page.hasMore ? page.cursor : undefined;
      } while (curseur);
    },
    async copy(de, vers) {
      const { copy } = await sdk();
      await copy(checkKey(de), checkKey(vers), { access: "private", addRandomSuffix: false });
    },
  };
}

/* ------------------------------------------------------------------- choix */

const holder = globalThis as unknown as { __olivaBucket?: Bucket };

/** Dépôt actif. Blob dès qu'un jeton est configuré, disque sinon. */
export function bucket(): Bucket {
  const voulu = blobConfigured() ? "blob" : "disque";
  if (holder.__olivaBucket?.nom !== voulu) holder.__olivaBucket = voulu === "blob" ? blob() : fichiers();
  return holder.__olivaBucket;
}

export { prefixeDe };
