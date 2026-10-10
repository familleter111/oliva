import "server-only";
import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { appSecret } from "../env";

const N = 32768;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 128 * 1024 * 1024;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, KEYLEN, { N: n, r, p, maxmem: MAXMEM }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** Empreinte scrypt salée. Le mot de passe en clair n'est jamais stocké. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [n, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  const expected = Buffer.from(parts[5], "base64");
  const key = await derive(password, Buffer.from(parts[4], "base64"), n, r, p);
  return key.length === expected.length && timingSafeEqual(key, expected);
}

let dummy: Promise<string> | null = null;
/** Empreinte factice : égalise le temps de réponse quand le compte n'existe pas. */
export const dummyHash = () => (dummy ??= hashPassword(randomBytes(24).toString("hex")));

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

/** Empreinte HMAC d'un jeton : seul ce résultat est écrit dans le classeur. */
export const tokenHash = (token: string) => createHmac("sha256", appSecret()).update(token).digest("hex");

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export interface PasswordPolicy {
  motDePasseMin: number;
  exigerLettreChiffre: boolean;
  exigerSpecial: boolean;
}

/** Retourne un message d'erreur, ou null si le mot de passe respecte les règles. */
export function passwordProblem(password: string, policy: PasswordPolicy): string | null {
  if (password.length < policy.motDePasseMin) return `Le mot de passe doit contenir au moins ${policy.motDePasseMin} caractères.`;
  if (password.length > 200) return "Le mot de passe est trop long (200 caractères maximum).";
  if (policy.exigerLettreChiffre && !(/\p{L}/u.test(password) && /\d/.test(password))) return "Le mot de passe doit contenir au moins une lettre et un chiffre.";
  if (policy.exigerSpecial && !/[^\p{L}\d\s]/u.test(password)) return "Le mot de passe doit contenir au moins un caractère spécial.";
  return null;
}
