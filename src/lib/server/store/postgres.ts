import "server-only";
import type { Pool, PoolClient } from "pg";
import { AppError } from "../errors";
import type { Db } from "../schema";
import { decodeJsonDb, encodeJsonDb, fingerprint } from "../workbook";

/**
 * Stockage de l'état dans une base PostgreSQL, pour les hébergements sans disque persistant.
 *
 * L'état complet tient dans une seule ligne : c'est exactement le modèle du classeur, écrit d'un bloc.
 * La concurrence est réglée par comparaison de révision (« écris seulement si personne n'a écrit entre-temps »),
 * ce qui remplace le verrou de fichier et reste correct entre plusieurs serveurs.
 */

const TABLE = "oliva_etat";

export function databaseUrl(): string {
  return (process.env.OLIVA_DATABASE_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || "").trim();
}

export function postgresConfigured(): boolean {
  return databaseUrl() !== "";
}

interface PgState {
  pool: Pool;
  url: string;
  pret: Promise<void> | null;
}
const holder = globalThis as unknown as { __olivaPg?: PgState };

async function pool(): Promise<Pool> {
  const url = databaseUrl();
  if (!url) throw new AppError("configuration", "Aucune base de données configurée : renseignez DATABASE_URL.");
  if (holder.__olivaPg && holder.__olivaPg.url !== url) {
    const ancien = holder.__olivaPg;
    holder.__olivaPg = undefined;
    await ancien.pool.end().catch(() => undefined);
  }
  if (!holder.__olivaPg) {
    const { Pool: PgPool } = await import("pg");
    const p = new PgPool({
      connectionString: url,
      // Plusieurs instances sans serveur ouvrent chacune peu de connexions : le reste passe par le pooler.
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      ssl: /sslmode=disable/.test(url) ? undefined : { rejectUnauthorized: true },
    });
    p.on("error", (e) => console.error("[oliva:postgres] connexion inactive perdue", e.message));
    holder.__olivaPg = { pool: p, url, pret: null };
  }
  return holder.__olivaPg.pool;
}

/** Crée la table au premier usage. Ne touche jamais à des données existantes. */
async function ready(): Promise<Pool> {
  const p = await pool();
  const st = holder.__olivaPg!;
  st.pret ??= (async () => {
    await p.query(`create table if not exists ${TABLE} (
      id integer primary key check (id = 1),
      revision bigint not null,
      maj_le text not null,
      cree_le text not null,
      donnees text not null,
      precedent text
    )`);
    // Ajoutees apres coup : une base creee par une version precedente se met a niveau sans rien perdre.
    await p.query(`alter table ${TABLE} add column if not exists sujets text not null default ''`);
    await p.query(`alter table ${TABLE} add column if not exists marque text not null default ''`);
  })().catch((e) => {
    st.pret = null;
    throw erreur("La base de données n'a pas pu être préparée.", e);
  });
  await st.pret;
  return p;
}

function erreur(message: string, cause: unknown): AppError {
  const code = (cause as { code?: string }).code ?? "";
  const detail =
    code === "ECONNREFUSED" || code === "ENOTFOUND"
      ? " La base est injoignable : vérifiez DATABASE_URL."
      : code === "28P01"
        ? " Identifiants refusés par la base."
        : "";
  return new AppError("stockage", `${message}${detail}`, { cause });
}

/** Révision enregistrée, sans rapatrier les données. `null` si le stockage est vide. */
export async function pgRevision(): Promise<number | null> {
  return (await pgSignal())?.revision ?? null;
}

export interface Signal {
  revision: number;
  /** Sujets diffusés par la dernière écriture, pour réveiller les écrans concernés. */
  sujets: string[];
  /** Repère du dernier changement utile, identique à celui du bus en mémoire. */
  marque: string;
}

/**
 * Lecture très légère de l'état d'avancement : sert au rafraîchissement en direct,
 * quand plusieurs serveurs se partagent les requêtes et ne voient pas les écritures des autres.
 */
export async function pgSignal(): Promise<Signal | null> {
  try {
    const p = await ready();
    const r = await p.query<{ revision: string; sujets: string; marque: string }>(
      `select revision, sujets, marque from ${TABLE} where id = 1`,
    );
    if (!r.rows.length) return null;
    const { revision, sujets, marque } = r.rows[0];
    return { revision: Number(revision), sujets: sujets ? sujets.split(" ").filter(Boolean) : [], marque: marque ?? "" };
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw erreur("La base de données est injoignable.", e);
  }
}

/** Dernier état enregistré. `null` si rien n'a encore été écrit. */
export async function pgLire(): Promise<Db | null> {
  try {
    const p = await ready();
    const r = await p.query<{ donnees: string }>(`select donnees from ${TABLE} where id = 1`);
    if (!r.rows.length) return null;
    return decodeJsonDb(r.rows[0].donnees);
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw erreur("L'état enregistré est illisible.", e);
  }
}

/**
 * Écrit `db` si la révision enregistrée vaut toujours `revisionAttendue`.
 * Retourne `false` quand une autre écriture est passée avant : l'appelant recommence sur l'état frais.
 */
export async function pgEcrire(db: Db, revisionAttendue: number | null, signal: { sujets: string[]; marque: string }): Promise<boolean> {
  const texte = encodeJsonDb(db);
  const sujets = signal.sujets.join(" ");
  const p = await ready();
  const client = await p.connect().catch((e) => {
    throw erreur("La base de données est injoignable.", e);
  });
  try {
    await client.query("begin");
    await client.query("set local lock_timeout = '10s'");
    const ecrit =
      revisionAttendue === null
        ? await insere(client, db, texte, sujets, signal.marque)
        : await metAJour(client, db, texte, revisionAttendue, sujets, signal.marque);
    if (!ecrit) {
      await client.query("rollback");
      return false;
    }
    // Relecture de contrôle, comme pour le fichier : ce qui est en base doit redonner exactement l'état attendu.
    const relu = await client.query<{ donnees: string }>(`select donnees from ${TABLE} where id = 1`);
    if (fingerprint(decodeJsonDb(relu.rows[0].donnees)) !== fingerprint(db)) {
      await client.query("rollback");
      throw new AppError("stockage", "L'enregistrement a échoué : la relecture ne correspond pas aux données. Rien n'a été modifié.");
    }
    await client.query("commit");
    return true;
  } catch (e) {
    await client.query("rollback").catch(() => undefined);
    if (e instanceof AppError) throw e;
    console.error("[oliva:postgres] échec d'écriture", e);
    throw erreur("L'enregistrement a échoué : rien n'a été modifié. Réessayez.", e);
  } finally {
    client.release();
  }
}

async function insere(client: PoolClient, db: Db, texte: string, sujets: string, marque: string): Promise<boolean> {
  const r = await client.query(
    `insert into ${TABLE} (id, revision, maj_le, cree_le, donnees, precedent, sujets, marque)
     values (1, $1, $2, $3, $4, null, $5, $6) on conflict (id) do nothing`,
    [db._meta.revision, db._meta.majLe, db._meta.creeLe, texte, sujets, marque],
  );
  return r.rowCount === 1;
}

async function metAJour(client: PoolClient, db: Db, texte: string, attendue: number, sujets: string, marque: string): Promise<boolean> {
  // `precedent` garde la version d'avant, comme `oliva.precedent.xlsx` sur le disque.
  const r = await client.query(
    `update ${TABLE} set revision = $1, maj_le = $2, precedent = donnees, donnees = $3, sujets = $5, marque = $6
     where id = 1 and revision = $4`,
    [db._meta.revision, db._meta.majLe, texte, attendue, sujets, marque],
  );
  return r.rowCount === 1;
}

/** Remplace l'état sans condition de révision (restauration explicite). */
export async function pgRemplacer(db: Db): Promise<void> {
  const texte = encodeJsonDb(db);
  const p = await ready();
  try {
    await p.query(
      `insert into ${TABLE} (id, revision, maj_le, cree_le, donnees, precedent)
       values (1, $1, $2, $3, $4, null)
       on conflict (id) do update set revision = excluded.revision, maj_le = excluded.maj_le,
         precedent = ${TABLE}.donnees, donnees = excluded.donnees`,
      [db._meta.revision, db._meta.majLe, db._meta.creeLe, texte],
    );
  } catch (e) {
    throw erreur("La restauration n'a pas pu être écrite.", e);
  }
}

/** Version précédente conservée en base, pour récupérer après une mauvaise manipulation. */
export async function pgPrecedent(): Promise<Db | null> {
  const p = await ready();
  const r = await p.query<{ precedent: string | null }>(`select precedent from ${TABLE} where id = 1`);
  const texte = r.rows[0]?.precedent;
  return texte ? decodeJsonDb(texte) : null;
}

export async function pgInfo(): Promise<{ tailleOctets: number }> {
  const p = await ready();
  const r = await p.query<{ taille: string }>(`select coalesce(octet_length(donnees), 0)::text as taille from ${TABLE} where id = 1`);
  return { tailleOctets: Number(r.rows[0]?.taille ?? 0) };
}

/** Ferme le pool : utile aux scripts en ligne de commande, qui doivent rendre la main. */
export async function pgFermer(): Promise<void> {
  const st = holder.__olivaPg;
  if (!st) return;
  holder.__olivaPg = undefined;
  await st.pool.end().catch(() => undefined);
}
