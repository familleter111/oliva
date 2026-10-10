import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";

/**
 * Tests de bout en bout sur le serveur de production (`next start`), avec un stockage temporaire.
 * Lancement : npm run build && npm run test:e2e
 */
const ROOT = process.cwd();
const DIR = path.join(ROOT, "tests/.tmp", `e2e-${Date.now()}`);
const PORT = 3211;
const PORT_B = 3212;
const BASE = `http://localhost:${PORT}`;
const ADMIN = { email: "admin@oliva.test", password: "E2e-Motdepasse-2026" };
// Les variables de stockage distant sont neutralisées : une suite de tests n'écrit jamais dans une vraie base.
const ENV = { ...process.env, NODE_ENV: "production", OLIVA_STORAGE_DIR: DIR, OLIVA_SECRET: "e2e-secret-e2e-secret-e2e-secret-e2e-secret-0123456789", OLIVA_PUBLIC_URL: "", OLIVA_ADMIN_EMAIL: ADMIN.email, OLIVA_ADMIN_PASSWORD: ADMIN.password, OLIVA_ADMIN_NAME: "Admin Test", OLIVA_DATABASE_URL: "", DATABASE_URL: "", POSTGRES_URL: "", BLOB_READ_WRITE_TOKEN: "" } as NodeJS.ProcessEnv;

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` (${detail})` : ""}`);
  console.log(`${ok ? "  ✔" : "  ✘"} ${name}${!ok && detail ? ` : ${detail}` : ""}`);
}
const section = (t: string) => console.log(`\n${t}`);

function script(file: string) {
  const r = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", file], { cwd: ROOT, env: ENV, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${file} a échoué : ${r.stdout}${r.stderr}`);
  return r.stdout;
}

async function startServer(port: number): Promise<ChildProcess> {
  const child = spawn(process.execPath, [path.join(ROOT, "node_modules/next/dist/bin/next"), "start", "-p", String(port)], { cwd: ROOT, env: ENV, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  child.stdout?.on("data", (d) => (log += d));
  child.stderr?.on("data", (d) => (log += d));
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      const res = await fetch(`http://localhost:${port}/admin/login`, { redirect: "manual" });
      if (res.status === 200) return child;
    } catch {
      /* pas encore prêt */
    }
    if (child.exitCode !== null) break;
  }
  child.kill();
  throw new Error(`Le serveur n'a pas démarré sur le port ${port}.\n${log}`);
}
const stop = (child: ChildProcess) =>
  new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    child.kill();
  });

interface Res {
  status: number;
  headers: Headers;
  text: string;
  json: { ok?: boolean; data?: Record<string, unknown>; error?: { code?: string; message?: string } } | null;
}
class Client {
  jar = new Map<string, string>();
  csrf = "";
  constructor(readonly base = BASE) {}

  get cookie(): string {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  set cookie(value: string) {
    this.jar.clear();
    for (const pair of value.split(";").map((x) => x.trim()).filter(Boolean)) this.jar.set(pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1));
  }

  async req(method: string, url: string, opts: { body?: unknown; form?: FormData; origin?: string | null; csrf?: boolean } = {}): Promise<Res> {
    const headers: Record<string, string> = {};
    if (this.cookie) headers.cookie = this.cookie;
    if (opts.origin !== null && method !== "GET") headers.origin = opts.origin ?? this.base;
    if (opts.csrf !== false && this.csrf && method !== "GET") headers["x-oliva-csrf"] = this.csrf;
    let body: BodyInit | undefined;
    if (opts.form) body = opts.form;
    else if (opts.body !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(opts.body);
    }
    const res = await fetch(`${this.base}${url}`, { method, headers, body, redirect: "manual" });
    const set = res.headers.getSetCookie();
    for (const c of set) {
      const [pair] = c.split(";");
      const name = pair.slice(0, pair.indexOf("="));
      const value = pair.slice(pair.indexOf("=") + 1);
      if (value === "" || /max-age=0/i.test(c)) this.jar.delete(name);
      else this.jar.set(name, value);
    }
    const text = await res.text();
    let json: Res["json"] = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* réponse non JSON */
    }
    return { status: res.status, headers: res.headers, text, json };
  }
  api(method: string, route: string, body?: unknown) {
    return this.req(method, `/api/admin/${route}`, { body });
  }
  async login(email: string, password: string) {
    const r = await this.req("POST", "/api/admin/auth/login", { body: { identifiant: email, motDePasse: password } });
    if (r.status === 200) {
      const page = await this.req("GET", "/admin");
      this.csrf = /csrf\\?"\s*:\s*\\?"([a-f0-9]{64})/.exec(page.text)?.[1] ?? "";
    }
    return r;
  }
}

async function main() {
  if (!fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"))) {
    console.log("Build de production absent : lancement de `next build`.");
    const b = spawnSync(process.execPath, [path.join(ROOT, "node_modules/next/dist/bin/next"), "build"], { cwd: ROOT, env: ENV, stdio: "inherit" });
    if (b.status !== 0) throw new Error("Le build a échoué.");
  }
  fs.mkdirSync(DIR, { recursive: true });
  console.log(script("scripts/admin-init.ts").trim());
  console.log(script("scripts/demo-seed.ts").trim());

  let server = await startServer(PORT);
  const anon = new Client();
  const admin = new Client();
  try {
    section("Accès public sans connexion");
    const home = await anon.req("GET", "/");
    check("la page d'accueil répond 200 sans compte", home.status === 200, String(home.status));
    check("elle affiche les produits publiés", home.text.includes("Pizza della casa") && home.text.includes("18,50"));
    check("elle ne contient aucun lien ni outil d'administration", !/\/admin|Administration|Se connecter|csrf/i.test(home.text));
    const published = /\/media\/[a-f0-9]{32}(?:-s)?\.webp/.exec(home.text)?.[0] ?? "";
    const img = await anon.req("GET", published || "/media/x");
    check("une image publiée est servie", img.status === 200 && img.headers.get("content-type") === "image/webp", `${published} ${img.status}`);
    check("une table inconnue ne révèle rien (404)", (await anon.req("GET", "/table/tbl_0000000000000000")).status === 404);

    section("Refus des pages et API d'administration sans autorisation");
    const noCookie = await anon.req("GET", "/admin");
    check("page admin sans session : redirection vers la connexion", noCookie.status >= 300 && noCookie.status < 400 && (noCookie.headers.get("location") ?? "").includes("/admin/login"), `${noCookie.status} ${noCookie.headers.get("location")}`);
    const forged = new Client();
    forged.cookie = "__Host-oliva_session=jeton-invente-jeton-invente-jeton-invente";
    const forgedPage = await forged.req("GET", "/admin/produits");
    check("cookie inventé : refus côté serveur, pas seulement par le filtre", forgedPage.status >= 300 && forgedPage.status < 400 && (forgedPage.headers.get("location") ?? "").includes("/admin/login") && !forgedPage.text.includes("Pizza della casa"), String(forgedPage.status));
    check("API en lecture sans session : 401", (await anon.req("GET", "/api/admin/export/produits")).status === 401);
    check("API en écriture sans session : 401", (await anon.api("POST", "categories", { nom: "Intrus" })).status === 401);
    check("API avec cookie inventé : 401", (await forged.api("POST", "categories", { nom: "Intrus" })).status === 401);
    check("flux d'événements sans session : 401", (await anon.req("GET", "/api/admin/evenements")).status === 401);
    check("fichier média interne sans session : 401", (await anon.req("GET", `/api/admin/medias/fichier/${published.split("/").pop()}`)).status === 401);

    section("Le classeur Excel n'est jamais accessible par URL");
    for (const url of ["/storage/data/oliva.xlsx", "/data/oliva.xlsx", "/oliva.xlsx", "/media/oliva.xlsx", "/media/..%2Fdata%2Foliva.xlsx", "/media/%2e%2e/data/oliva.xlsx", "/_next/../storage/data/oliva.xlsx", "/api/admin/medias/fichier/..%2F..%2Fdata%2Foliva.xlsx"]) {
      const r = await anon.req("GET", url);
      check(`${url} : inaccessible`, r.status !== 200 && !r.text.startsWith("PK"), String(r.status));
    }

    section("Connexion et session");
    const bad = await admin.login(ADMIN.email, "mauvais-mot-de-passe");
    check("mauvais mot de passe : 401 avec message générique", bad.status === 401 && bad.json?.error?.message === "Identifiant ou mot de passe incorrect.");
    const crossSite = await admin.req("POST", "/api/admin/auth/login", { body: { identifiant: ADMIN.email, motDePasse: ADMIN.password }, origin: "https://site-malveillant.example" });
    check("connexion depuis une autre origine : refusée", crossSite.status === 403, String(crossSite.status));
    const raw = await fetch(`${BASE}/api/admin/auth/login`, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ identifiant: ADMIN.email, motDePasse: ADMIN.password }) });
    const setCookie = raw.headers.getSetCookie().join("; ");
    check("cookie de session HttpOnly, SameSite et Secure en production", /__Host-oliva_session=/.test(setCookie) && /HttpOnly/i.test(setCookie) && /SameSite=lax/i.test(setCookie) && /Secure/i.test(setCookie), setCookie);
    const ok = await admin.login(ADMIN.email, ADMIN.password);
    check("connexion de l'administrateur", ok.status === 200 && admin.cookie !== "" && admin.csrf.length === 64, `${ok.status} csrf=${admin.csrf.length}`);
    check("page admin accessible une fois connecté", (await admin.req("GET", "/admin/produits")).status === 200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(DIR, "data", "oliva.xlsx"));
    const cells: string[] = [];
    wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((c) => cells.push(String(c.value)))));
    check("le classeur ne contient que l'empreinte du mot de passe, jamais le mot de passe", cells.some((c) => c.startsWith("scrypt$")) && !cells.some((c) => c.includes(ADMIN.password)));

    section("Protection contre les requêtes intersites");
    check("écriture sans jeton de protection : 403", (await admin.req("POST", "/api/admin/categories", { body: { nom: "Sans jeton" }, csrf: false })).status === 403);
    check("écriture sans en-tête d'origine : 403", (await admin.req("POST", "/api/admin/categories", { body: { nom: "Sans origine" }, origin: null })).status === 403);
    check("écriture depuis une autre origine : 403", (await admin.req("POST", "/api/admin/categories", { body: { nom: "Autre origine" }, origin: "https://site-malveillant.example" })).status === 403);

    section("Création et modification réellement persistantes");
    const created = await admin.api("POST", "categories", { nom: "Catégorie E2E", description: "Créée par le test" });
    const catId = String(created.json?.data?.id ?? "");
    check("création d'une catégorie", created.status === 200 && catId.startsWith("cat_"), created.text.slice(0, 120));
    check("validation serveur : nom vide refusé (422)", (await admin.api("POST", "categories", { nom: "   " })).status === 422);
    check("validation serveur : doublon refusé (409)", (await admin.api("POST", "categories", { nom: "catégorie e2e" })).status === 409);
    const products = await admin.req("GET", "/api/admin/export/produits?format=csv");
    check("export CSV réservé au personnel autorisé", products.status === 200 && products.text.includes("Pizza della casa"));
    const adminPage = await admin.req("GET", "/admin/produits");
    const pizzaId = /prd_[a-f0-9]{16}/.exec(adminPage.text.slice(adminPage.text.indexOf("Pizza della casa") - 400))?.[0] ?? "";
    const allIds = [...new Set(adminPage.text.match(/prd_[a-f0-9]{16}/g) ?? [])];
    let target = "";
    for (const id of allIds) {
      const r = await admin.api("PATCH", `produits/${id}`, {});
      if (r.json?.data?.nom === "Pizza della casa") target = id;
    }
    check("identifiant du produit retrouvé", target !== "", `${pizzaId} parmi ${allIds.length}`);
    const patched = await admin.api("PATCH", `produits/${target}`, { prixCentimes: 1990 });
    check("modification du prix enregistrée", patched.status === 200 && patched.json?.data?.prixCentimes === 1990);
    check("prix négatif refusé", (await admin.api("PATCH", `produits/${target}`, { prixCentimes: -5 })).status === 422);
    check("le public voit encore l'ancien prix tant que rien n'est publié", (await anon.req("GET", "/")).text.includes("18,50"));
    const pub = await admin.api("POST", "publication", { mode: "maintenant" });
    check("publication appliquée", pub.status === 200, pub.text.slice(0, 160));
    const after = await anon.req("GET", "/");
    check("le public voit le nouveau prix après publication", after.text.includes("19,90") && !after.text.includes("18,50"));
    check("suppression d'une catégorie utilisée refusée (409)", await (async () => {
      const cats = await admin.req("GET", "/admin/categories");
      const used = [...new Set(cats.text.match(/cat_[a-f0-9]{16}/g) ?? [])].filter((id) => id !== catId)[0];
      return (await admin.api("DELETE", `categories/${used}`)).status === 409;
    })());

    section("Images");
    const fake = new FormData();
    fake.set("fichier", new Blob(["ceci n'est pas une image"], { type: "image/jpeg" }), "faux.jpg");
    check("faux fichier image refusé d'après son contenu réel (422)", (await admin.req("POST", "/api/admin/medias", { form: fake })).status === 422);
    const real = new FormData();
    real.set("fichier", new Blob([fs.readFileSync(path.join(ROOT, "demo/media/risotto.jpg"))], { type: "image/jpeg" }), "../../evasion.jpg");
    const up = await admin.req("POST", "/api/admin/medias", { form: real });
    const fichier = String(up.json?.data?.fichier ?? "");
    check("image valide importée sous un nom de fichier généré", up.status === 200 && /^[a-f0-9]{32}\.webp$/.test(fichier) && up.json?.data?.nom === "evasion.jpg", up.text.slice(0, 160));
    check("le fichier est bien dans le stockage privé", fs.existsSync(path.join(DIR, "media", fichier)));
    check("image non publiée : invisible du public (404)", (await anon.req("GET", `/media/${fichier}`)).status === 404);
    check("image non publiée : visible du personnel connecté", (await admin.req("GET", `/api/admin/medias/fichier/${fichier}`)).status === 200);
    const usedMedia = await admin.req("GET", "/admin/medias");
    const medIds = [...new Set(usedMedia.text.match(/med_[a-f0-9]{16}/g) ?? [])];
    let blocked = false;
    for (const id of medIds.slice(0, 6)) if ((await admin.api("PATCH", `medias/${id}`, {})).status === 200 && id !== up.json?.data?.id) blocked ||= (await admin.api("DELETE", `medias/${id}`)).status === 409;
    check("suppression d'une image encore utilisée refusée (409)", blocked);

    section("Import invalide sans écrasement");
    const before = (await admin.req("GET", "/api/admin/export/produits?format=csv")).text;
    const csv = new FormData();
    csv.set("type", "produits");
    csv.set("fichier", new Blob(["Nom;Catégorie;Prix TTC\nPlat correct;Pizzas;12,00\nPlat sans prix;Pizzas;\nPlat inconnu;Rayon absent;9,00\n"], { type: "text/csv" }), "import.csv");
    const preview = await admin.req("POST", "/api/admin/import/apercu", { form: csv });
    check("aperçu : lignes en erreur détectées", preview.status === 200 && preview.json?.data?.aCorriger === 2 && preview.json?.data?.valides === 1, preview.text.slice(0, 160));
    const csv2 = new FormData();
    csv2.set("type", "produits");
    csv2.set("fichier", new Blob(["Nom;Catégorie;Prix TTC\nPlat correct;Pizzas;12,00\nPlat sans prix;Pizzas;\n"], { type: "text/csv" }), "import.csv");
    const applied = await admin.req("POST", "/api/admin/import/appliquer", { form: csv2 });
    check("import refusé d'un bloc (409)", applied.status === 409 && /Aucune donnée n'a été modifiée/.test(applied.json?.error?.message ?? ""), applied.text.slice(0, 160));
    check("aucune donnée écrasée ni ajoutée", (await admin.req("GET", "/api/admin/export/produits?format=csv")).text === before);

    section("Échec disque sans faux message de réussite");
    fs.renameSync(path.join(DIR, "tmp"), path.join(DIR, "tmp-ecarte"));
    fs.writeFileSync(path.join(DIR, "tmp"), "obstacle");
    const failed = await admin.api("PUT", "restaurant", { sousTitre: "Ne doit pas passer" });
    check("l'écriture impossible renvoie une erreur 503, jamais un succès", failed.status === 503 && failed.json?.ok === false && failed.json?.error?.code === "stockage", failed.text.slice(0, 200));
    fs.rmSync(path.join(DIR, "tmp"));
    fs.renameSync(path.join(DIR, "tmp-ecarte"), path.join(DIR, "tmp"));
    check("la valeur n'a pas changé", !(await admin.req("GET", "/admin/etablissement")).text.includes("Ne doit pas passer"));
    check("l'écriture suivante réussit", (await admin.api("PUT", "restaurant", { sousTitre: "Après la panne" })).status === 200);

    section("Droits : compte sans permission d'administration");
    const zoneLess = await admin.api("POST", "utilisateurs/inviter", { prenom: "Nina", nom: "Serveuse", email: "nina@oliva.test", roleId: "role_serveur", zoneIds: [], stationId: "", validiteHeures: 48 });
    const lien = String(zoneLess.json?.data?.lien ?? "");
    const jeton = lien.split("/").pop() ?? "";
    check("invitation créée, lien remis à l'administrateur (aucun e-mail simulé)", zoneLess.status === 200 && lien.includes("/admin/invitation/"), zoneLess.text.slice(0, 160));
    check("page d'invitation publique", (await anon.req("GET", `/admin/invitation/${jeton}`)).text.includes("Accepter l"));
    check("mot de passe trop faible refusé", (await anon.req("POST", "/api/admin/auth/jeton", { body: { jeton, motDePasse: "court" } })).status === 422);
    check("invitation acceptée", (await anon.req("POST", "/api/admin/auth/jeton", { body: { jeton, motDePasse: "Serveuse-Motdepasse-26" } })).status === 200);
    check("le lien ne sert qu'une fois", (await anon.req("POST", "/api/admin/auth/jeton", { body: { jeton, motDePasse: "Serveuse-Motdepasse-27" } })).status === 403);
    const staff = new Client();
    check("connexion du membre sans droit d'administration", (await staff.login("nina@oliva.test", "Serveuse-Motdepasse-26")).status === 200);
    const denied = await staff.req("GET", "/admin");
    check("page admin refusée à ce compte", denied.status >= 300 && denied.status < 400 && (denied.headers.get("location") ?? "").includes("/admin/acces-refuse"), `${denied.status} ${denied.headers.get("location")}`);
    const deniedPage = await staff.req("GET", "/admin/produits");
    check("page protégée refusée, sans fuite de contenu", deniedPage.status >= 300 && deniedPage.status < 400 && !deniedPage.text.includes("Pizza della casa"));
    staff.csrf = /"csrf":"([a-f0-9]{64})"/.exec((await staff.req("GET", "/admin/acces-refuse")).text.replace(/\\"/g, '"'))?.[1] ?? "";
    check("API refusée à ce compte : 403", (await staff.req("GET", "/api/admin/export/produits")).status === 403 && (await staff.api("POST", "categories", { nom: "Sans droit" })).status === 403);

    section("Suspension avec révocation des accès");
    const users = await admin.req("GET", "/admin/utilisateurs");
    const ids = [...new Set(users.text.match(/usr_[a-f0-9]{16}/g) ?? [])];
    let ninaId = "";
    let selfId = "";
    for (const id of ids) {
      const r = await admin.api("PATCH", `utilisateurs/${id}`, {});
      if (r.json?.data?.email === "nina@oliva.test") ninaId = id;
      if (r.json?.data?.email === ADMIN.email) selfId = id;
    }
    check("le mot de passe haché n'est jamais renvoyé par l'API", !JSON.stringify((await admin.api("PATCH", `utilisateurs/${ninaId}`, {})).json).includes("scrypt"));
    const suspended = await admin.api("POST", `utilisateurs/${ninaId}/suspendre`);
    check("suspension du compte", suspended.status === 200 && Number(suspended.json?.data?.sessionsRevoquees) >= 1, suspended.text.slice(0, 160));
    check("sa session est révoquée immédiatement (API 401)", (await staff.req("GET", "/api/admin/export/produits")).status === 401);
    const kicked = await staff.req("GET", "/admin/acces-refuse");
    check("ses pages renvoient vers la connexion", kicked.status >= 300 && kicked.status < 400 && (kicked.headers.get("location") ?? "").includes("/admin/login"));
    check("il ne peut plus se reconnecter", (await new Client().login("nina@oliva.test", "Serveuse-Motdepasse-26")).status === 401);
    check("dernier administrateur : suspension de soi refusée", (await admin.api("POST", `utilisateurs/${selfId}/suspendre`)).status === 409);
    check("dernier administrateur : suppression refusée", (await admin.api("DELETE", `utilisateurs/${selfId}`)).status === 409);
    check("dernier administrateur : changement de rôle refusé", (await admin.api("PATCH", `utilisateurs/${selfId}`, { roleId: "role_serveur" })).status === 409);
    check("rôle Administrateur verrouillé", (await admin.api("PUT", "roles/role_admin/permissions", { permissions: { "admin.acces": null } })).status === 409);

    section("Parcours client par table");
    const jours = [1, 2, 3, 4, 5, 6, 7].map((jour) => ({ jour, ouvert: true, plages: [{ libelle: "Toute la journée", debut: "00:00", fin: "23:59" }] }));
    check("ouverture du restaurant toute la journée", (await admin.api("PUT", "horaires", { jours, arretAvantFermetureMin: 0, messageHorsHoraires: "Fermé." })).status === 200);
    check("publication des horaires", (await admin.api("POST", "publication", { mode: "maintenant" })).status === 200);
    const service0 = await admin.api("GET", "service");
    check("écran de service lisible par le personnel", service0.status === 200 && Array.isArray(service0.json?.data?.sessions));
    check("écran de service refusé sans session", (await anon.req("GET", "/api/admin/service")).status === 401);
    const tableId = /\/table\/(tbl_[a-f0-9]+)/.exec((await admin.req("GET", "/admin/qr")).text)?.[1] ?? "";
    const closedPage = await anon.req("GET", `/table/${tableId}`);
    check("table sans session ouverte : accueil seul, aucun panier", closedPage.status === 200 && closedPage.text.includes("Prenez place") && !closedPage.text.includes("Le panier de la table"), `${tableId} ${closedPage.status}`);
    const opened = await admin.api("POST", "sessions-table", { tableId });
    const sessionCode = String(opened.json?.data?.code ?? "");
    check("le personnel ouvre la session de table", opened.status === 200 && /^\d{4}$/.test(sessionCode), String(opened.status));
    const gatePage = await anon.req("GET", `/table/${tableId}`);
    check("l'adresse de la table ne révèle ni le code ni le panier", gatePage.status === 200 && !gatePage.text.includes(sessionCode) && !gatePage.text.includes("Le panier de la table"));
    check("API de table sans jeton : 403", (await anon.req("GET", "/api/table/etat")).status === 403);
    const forgedGuest = new Client();
    forgedGuest.jar.set("__Host-oliva_table", "jeton-invente-jeton-invente-jeton-invente");
    check("jeton de table inventé : 403", (await forgedGuest.req("GET", "/api/table/etat")).status === 403);
    const wrongCode = sessionCode === "0000" ? "1111" : "0000";
    const guest = new Client();
    check("mauvais code : 403", (await guest.req("POST", "/api/table/rejoindre", { body: { tableId, code: wrongCode, pseudo: "Vera" } })).status === 403);
    check("origine étrangère refusée", (await guest.req("POST", "/api/table/rejoindre", { body: { tableId, code: sessionCode }, origin: "https://exemple.invalid" })).status === 403);
    const joined = await guest.req("POST", "/api/table/rejoindre", { body: { tableId, code: sessionCode, pseudo: "Vera" } });
    const tableCookie = joined.headers.getSetCookie().find((c) => c.includes("oliva_table")) ?? "";
    check("bon code : admission et cookie HttpOnly, SameSite, Secure", joined.status === 200 && /HttpOnly/i.test(tableCookie) && /SameSite=Lax/i.test(tableCookie) && /Secure/i.test(tableCookie), `${joined.status} ${tableCookie.slice(0, 60)}`);
    const app = await guest.req("GET", `/table/${tableId}`);
    check("après admission, la page de la table affiche le panier partagé", app.status === 200 && app.text.includes("Le panier de la table"));
    const state0 = await guest.req("GET", "/api/table/etat");
    check("l'état ne contient ni code ni empreinte de jeton", state0.status === 200 && !state0.text.includes("jetonHash") && !state0.text.includes(`"${sessionCode}"`));
    const pizza = /"id":"(prd_[a-f0-9]+)","nom":"Pizza della casa"/.exec(app.text.replace(/\\"/g, '"'))?.[1] ?? "";
    const added = await guest.req("POST", "/api/table/panier/lignes", { body: { produitId: pizza, quantite: 2, instructions: "Sans oignons", prixCentimes: 1 } });
    check("ajout au panier", added.status === 200, `${pizza} ${added.status} ${added.text.slice(0, 120)}`);
    const cartState = (await guest.req("GET", "/api/table/etat")).json?.data as { panier?: { totalCentimes?: number } } | undefined;
    const cartTotal = cartState?.panier?.totalCentimes ?? 0;
    check("le prix vient du serveur, pas du navigateur", cartTotal >= 2000 && cartTotal % 2 === 0, String(cartTotal));
    check("quantité invalide refusée", (await guest.req("POST", "/api/table/panier/lignes", { body: { produitId: pizza, quantite: 0 } })).status === 422);
    check("produit inconnu refusé", (await guest.req("POST", "/api/table/panier/lignes", { body: { produitId: "prd_0000000000000000", quantite: 1 } })).status === 422);
    const key = "e2e-commande-0001";
    const [c1, c2] = await Promise.all([guest.req("POST", "/api/table/panier/confirmer", { body: { cle: key } }), guest.req("POST", "/api/table/panier/confirmer", { body: { cle: key } })]);
    const serviceAfter = (await admin.api("GET", "service")).json?.data as { commandes?: { id: string }[] } | undefined;
    check("double confirmation simultanée : une seule commande", c1.status === 200 && c2.status === 200 && serviceAfter?.commandes?.length === 1, `${c1.status} ${c2.status} ${serviceAfter?.commandes?.length}`);
    const orderId = serviceAfter?.commandes?.[0]?.id ?? "";
    check("un convive ne peut pas changer le statut d'une commande", (await guest.req("POST", `/api/admin/commandes/${orderId}/statut`, { body: { statut: "servie" } })).status === 401);
    check("le personnel fait avancer la commande", (await admin.api("POST", `commandes/${orderId}/statut`, { statut: "preparation" })).status === 200);
    const followed = (await guest.req("GET", "/api/table/etat")).json?.data as { commandes?: { statut: string }[]; addition?: { totalCentimes: number } } | undefined;
    check("le convive voit le nouveau statut et l'addition", followed?.commandes?.[0]?.statut === "preparation" && followed?.addition?.totalCentimes === cartTotal);
    check("demande d'addition enregistrée", (await guest.req("POST", "/api/table/demandes", { body: { motifId: "addition" } })).status === 200);
    check("la même demande n'est pas enregistrée deux fois", (await guest.req("POST", "/api/table/demandes", { body: { motifId: "addition" } })).status === 409);
    const sessionId = String(opened.json?.data?.id ?? "");
    check("le personnel ferme la session", (await admin.api("POST", `sessions-table/${sessionId}/fermer`)).status === 200);
    check("après fermeture, le jeton du convive ne donne plus accès", (await guest.req("GET", "/api/table/etat")).status === 403);
    const reopened = await admin.api("POST", "sessions-table", { tableId });
    const nextGuest = new Client();
    await nextGuest.req("POST", "/api/table/rejoindre", { body: { tableId, code: String(reopened.json?.data?.code ?? "") } });
    const fresh = (await nextGuest.req("GET", "/api/table/etat")).json?.data as { commandes?: unknown[] } | undefined;
    check("nouvelle session : l'ancien jeton reste refusé, aucune commande héritée", (await guest.req("GET", "/api/table/etat")).status === 403 && Array.isArray(fresh?.commandes) && fresh.commandes.length === 0);
    const brute = new Client();
    let locked = 0;
    for (let i = 0; i < 10; i++) locked = (await brute.req("POST", "/api/table/rejoindre", { body: { tableId, code: "abcd" } })).status;
    check("essais de code répétés : verrouillage temporaire (429)", locked === 429, String(locked));
    await admin.api("POST", `sessions-table/${String(reopened.json?.data?.id ?? "")}/fermer`);

    section("Seconde instance sur le même stockage");
    const serverB = await startServer(PORT_B);
    const b = new Client(`http://localhost:${PORT_B}`);
    check("la seconde instance sert encore le menu public en lecture", (await b.req("GET", "/")).status === 200);
    const refused = await b.req("POST", "/api/admin/auth/login", { body: { identifiant: ADMIN.email, motDePasse: ADMIN.password } });
    check("toute écriture y est refusée clairement (503, verrou)", refused.status === 503 && refused.json?.error?.code === "verrou" && /autre instance/i.test(refused.json?.error?.message ?? ""), refused.text.slice(0, 200));
    await stop(serverB);
    check("la première instance continue d'écrire", (await admin.api("PUT", "restaurant", { sousTitre: "Instance unique" })).status === 200);

    section("Conservation des données après redémarrage");
    await stop(server);
    server = await startServer(PORT);
    check("le menu public garde le prix publié", (await anon.req("GET", "/")).text.includes("19,90"));
    const afterRestart = await admin.req("GET", "/admin/categories");
    check("la session du personnel survit au redémarrage", afterRestart.status === 200);
    check("la catégorie créée est toujours là", afterRestart.text.includes("Catégorie E2E"));
    check("le serveur reprend le verrou laissé par le processus arrêté et écrit", (await admin.api("PATCH", `categories/${catId}`, { description: "Modifiée après redémarrage" })).status === 200);
    const history = await admin.req("GET", "/api/admin/historique/export?periode=tout");
    check("l'historique garde la trace des actions", history.status === 200 && history.text.includes("Compte suspendu") && history.text.includes("Publication"));

    section("Limitation des tentatives et déconnexion");
    let last = 0;
    for (let i = 0; i < 6; i++) last = (await new Client().login("inconnu@oliva.test", `essai-${i}`)).status;
    check("verrouillage après trop d'échecs (429)", last === 429, String(last));
    check("un appareil déjà connecté reçoit un cookie d'appareil signé", [...admin.jar.keys()].some((k) => k.endsWith("oliva_appareil")));
    for (let i = 0; i < 6; i++) last = (await new Client().login(ADMIN.email, `attaque-${i}`)).status;
    check("un tiers qui multiplie les essais sur l'e-mail de l'administrateur finit verrouillé (429)", last === 429, String(last));
    check("même le bon mot de passe est refusé depuis un appareil inconnu pendant le verrouillage", (await new Client().login(ADMIN.email, ADMIN.password)).status === 429);
    const usual = new Client();
    for (const [k, v] of admin.jar) if (k.endsWith("oliva_appareil")) usual.jar.set(k, v);
    check("l'administrateur se connecte quand même depuis son appareil habituel", (await usual.login(ADMIN.email, ADMIN.password)).status === 200);
    const forgedDevice = new Client();
    forgedDevice.jar.set("__Host-oliva_appareil", "usr_0000000000000000.abc.def");
    check("un cookie d'appareil falsifié ne contourne pas le verrouillage", (await forgedDevice.login(ADMIN.email, ADMIN.password)).status === 429);
    const oldCookie = admin.cookie;
    check("déconnexion", (await admin.api("POST", "auth/logout")).status === 200);
    admin.cookie = oldCookie;
    const gone = await admin.req("GET", "/api/admin/export/produits");
    check("après déconnexion, l'ancien cookie ne donne plus accès", gone.status === 401, String(gone.status));
  } finally {
    await stop(server).catch(() => undefined);
  }

  console.log(`\n${passed} vérification(s) réussie(s), ${failures.length} échec(s).`);
  if (failures.length > 0) {
    console.log("Échecs :");
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exitCode = 1;
  } else {
    fs.rmSync(DIR, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
