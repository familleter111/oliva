import { hashPassword, passwordProblem } from "@/lib/server/auth/crypto";
import { ID } from "@/lib/server/defaults";
import { must } from "@/lib/server/db-utils";
import { appSecret } from "@/lib/server/env";
import { isAppError } from "@/lib/server/errors";
import { ROLE_ADMIN } from "@/lib/server/schema";
import { __releaseLock, readDb, transaction } from "@/lib/server/storage";

/**
 * Crée le premier administrateur à partir des variables d'environnement.
 * Ne modifie jamais un compte existant et ne fait rien si un administrateur existe déjà.
 */
async function main() {
  appSecret();
  const email = (process.env.OLIVA_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.OLIVA_ADMIN_PASSWORD ?? "";
  const name = (process.env.OLIVA_ADMIN_NAME ?? "").trim();

  const db = await readDb();
  if (db.Utilisateurs.some((u) => u.roleId === ROLE_ADMIN)) {
    console.log("Un administrateur existe déjà : aucun compte n'a été créé ni modifié.");
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error("OLIVA_ADMIN_EMAIL est absent ou invalide.");
  const problem = passwordProblem(password, must(db, "ParametresSecurite", ID.securite));
  if (problem) throw new Error(`OLIVA_ADMIN_PASSWORD : ${problem}`);

  const [prenom, ...rest] = (name || "Administrateur").split(/\s+/);
  const motDePasseHash = await hashPassword(password);
  await transaction({ actor: null }, (draft, tx) => {
    if (draft.Utilisateurs.some((u) => u.roleId === ROLE_ADMIN)) throw new Error("Un administrateur existe déjà.");
    const id = tx.id("usr");
    draft.Utilisateurs.push({
      id, prenom, nom: rest.join(" "), email, identifiant: "", motDePasseHash, roleId: ROLE_ADMIN, statut: "actif", zoneIds: [], stationId: "",
      jetonHash: "", jetonType: "", jetonExpireLe: "", derniereConnexionLe: "", creeLe: tx.now, majLe: tx.now,
    });
    tx.log({ action: "utilisateur", libelle: "Premier administrateur créé", entite: "Utilisateurs", entiteId: id, entiteNom: `${prenom} ${rest.join(" ")}`.trim() });
  });
  console.log(`Administrateur créé : ${email}`);
  console.log("Retirez maintenant OLIVA_ADMIN_PASSWORD de votre fichier d'environnement.");
}

main()
  .catch((e) => {
    console.error(isAppError(e) ? e.message : (e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => __releaseLock());
