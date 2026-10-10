import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Browser, type BrowserContext, type ElementHandle, type Page } from "puppeteer-core";

/**
 * Contrôles dans un vrai navigateur (Chrome sans tête), sur le serveur de production et un stockage temporaire :
 *  1. parcours complet de l'administration et du menu public ;
 *  2. parcours client d'une table, avec deux convives et l'écran de service du personnel ;
 *     puis le même parcours sur téléphone, coupure du réseau comprise ;
 *  3. parcours de l'espace serveur : servir, demandes clients, additions, portée du rôle ;
 *  4. parcours de l'espace responsable : plan de salle, affectations, attribution, clôture ;
 *  5. audit d'accessibilité (axe-core, règles WCAG 2.1 A et AA) des pages et des états ouverts ;
 *  3. traduction de l'interface en anglais sur tous les écrans ;
 *  4. recherche de débordements horizontaux à plusieurs largeurs d'écran.
 * Lancement : npm run build && npm run test:ui    (Chrome requis, chemin personnalisable avec CHROME_PATH)
 */
const ROOT = process.cwd();
const DIR = path.join(ROOT, "tests/.tmp", `ui-${Date.now()}`);
const PORT = 3311;
const BASE = `http://localhost:${PORT}`;
const ADMIN = { email: "admin@oliva.test", name: "Vous Admin" };
let password = "Ui-Motdepasse-2026";
// Les variables de stockage distant sont neutralisées : une suite de tests n'écrit jamais dans une vraie base.
const ENV = { ...process.env, NODE_ENV: "production", OLIVA_STORAGE_DIR: DIR, OLIVA_SECRET: "ui-secret-ui-secret-ui-secret-ui-secret-ui-secret-0123", OLIVA_PUBLIC_URL: BASE, OLIVA_ADMIN_EMAIL: ADMIN.email, OLIVA_ADMIN_PASSWORD: password, OLIVA_ADMIN_NAME: ADMIN.name, OLIVA_DATABASE_URL: "", DATABASE_URL: "", POSTGRES_URL: "", BLOB_READ_WRITE_TOKEN: "" } as NodeJS.ProcessEnv;
const T = 15000;
const DIALOG = '[role="dialog"]';

const PAGES = ["", "admin", "admin/etablissement", "admin/horaires", "admin/apparence", "admin/categories", "admin/produits", "admin/produits/nouveau", "admin/options", "admin/medias", "admin/utilisateurs", "admin/utilisateurs/inviter", "admin/roles", "admin/service", "admin/tables", "admin/plan", "admin/qr", "admin/commandes", "admin/commandes/statuts", "admin/notifications", "admin/addition", "admin/connexions", "admin/securite", "admin/historique", "admin/donnees", "admin/publication", "admin/apercu", "salle", "salle/servir", "salle/demandes", "salle/additions", "responsable", "responsable/plan", "responsable/equipe", "responsable/service", "responsable/demandes", "responsable/sessions"];

function findChrome(): string | null {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  return candidates.find((c): c is string => !!c && fs.existsSync(c)) ?? null;
}

function script(file: string): string {
  const r = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", file], { cwd: ROOT, env: ENV, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${file} a échoué : ${r.stdout}${r.stderr}`);
  return r.stdout.trim();
}

async function startServer(): Promise<ChildProcess> {
  const child = spawn(process.execPath, [path.join(ROOT, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT)], { cwd: ROOT, env: ENV, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  child.stdout?.on("data", (d) => (log += d));
  child.stderr?.on("data", (d) => (log += d));
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      if ((await fetch(`${BASE}/admin/login`, { redirect: "manual" })).status === 200) return child;
    } catch {
      /* pas encore prêt */
    }
    if (child.exitCode !== null) break;
  }
  child.kill();
  throw new Error(`Le serveur n'a pas démarré.\n${log}`);
}

/* ------------------------------------------------------------- outils */

let passed = 0;
const failures: string[] = [];
const noise = new Set<string>();
const section = (t: string) => console.log(`\n${t}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const assert = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(msg);
};

async function newPage(context: BrowserContext, label: string, mobile = false): Promise<Page> {
  const page = await context.newPage();
  await page.setViewport(mobile ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 950 });
  page.setDefaultTimeout(T);
  page.setDefaultNavigationTimeout(60000);
  // tsx (esbuild) enveloppe les fonctions nommées dans un appel à `__name`, absent du navigateur.
  await page.evaluateOnNewDocument("globalThis.__name = (f) => f");
  page.on("pageerror", (e) => noise.add(`[${label}] erreur de page : ${(e as Error).message}`));
  page.on("console", (m) => {
    // Les réponses 4xx provoquées exprès par le parcours ne sont pas des anomalies.
    if (m.type() === "error" && !/status of 4\d\d|ERR_INTERNET_DISCONNECTED/.test(m.text())) noise.add(`[${label}] console : ${m.text().slice(0, 240)}`);
  });
  page.on("dialog", (d) => void d.accept().catch(() => undefined));
  return page;
}

async function step(page: Page, name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  ✔ ${name}`);
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).split("\n")[0];
    failures.push(`${name} : ${msg}`);
    console.log(`  ✘ ${name} : ${msg}`);
    await page.screenshot({ path: path.join(DIR, `echec-${failures.length}.png`) as `${string}.png` }).catch(() => undefined);
  }
}

const go = (page: Page, url: string) => page.goto(`${BASE}${url}`, { waitUntil: "networkidle2" });

/** Élément visible et actif, trouvé par balise et texte. */
async function find(page: Page, tag: string, text: string, opts: { exact?: boolean; root?: string } = {}): Promise<ElementHandle<Element>> {
  const handle = await page.waitForFunction(
    (tag: string, text: string, exact: boolean, root: string) => {
      const scope = document.querySelector(root);
      if (!scope) return null;
      const norm = (s: string) => s.replace(/\s+/g, " ").trim();
      return (
        [...scope.querySelectorAll(tag)].find((e) => {
          const t = norm(e.textContent ?? "");
          return e.getClientRects().length > 0 && !(e as HTMLButtonElement).disabled && (exact ? t === text : t.includes(text));
        }) ?? null
      );
    },
    { timeout: T },
    tag,
    text,
    opts.exact ?? false,
    opts.root ?? "body",
  );
  const el = handle.asElement();
  if (!el) throw new Error(`élément introuvable : ${tag} « ${text} »`);
  return el as ElementHandle<Element>;
}
/**
 * Clic sur un élément trouvé par texte. Les feuilles et dialogues s'ouvrent avec une animation :
 * tant qu'elle n'est pas finie, la cible peut être hors écran. On réessaie plutôt que d'échouer.
 */
async function click(page: Page, tag: string, text: string, opts?: { exact?: boolean; root?: string }): Promise<void> {
  for (let essai = 0; ; essai++) {
    const el = await find(page, tag, text, opts);
    try {
      await el.evaluate((e) => e.scrollIntoView({ block: "center" }));
      await el.click();
      return;
    } catch (e) {
      if (essai >= 3) throw e;
      await sleep(250);
    }
  }
}

async function fill(page: Page, selector: string, value: string): Promise<void> {
  const el = await page.waitForSelector(selector, { visible: true });
  if (!el) throw new Error(`champ introuvable : ${selector}`);
  await el.focus();
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyA");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  if (value) await el.type(value, { delay: 5 });
}
/** Champs date : valeur posée par le setter natif pour que React la voie. */
async function setValue(page: Page, selector: string, value: string): Promise<void> {
  await page.waitForSelector(selector, { visible: true });
  await page.evaluate(
    (sel: string, v: string) => {
      const el = document.querySelector(sel) as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    selector,
    value,
  );
}
const toast = (page: Page, text: string) => page.waitForFunction((t: string) => [...document.querySelectorAll("[data-sonner-toast]")].some((e) => (e.textContent ?? "").includes(t)), { timeout: T }, text);
const hasText = (page: Page, text: string) => page.waitForFunction((t: string) => document.body.innerText.includes(t), { timeout: T }, text);
const value = (page: Page, selector: string) => page.$eval(selector, (e) => (e as HTMLInputElement).value);
const checked = (page: Page, selector: string) => page.$eval(selector, (e) => (e as HTMLInputElement).checked);
const upload = async (page: Page, selector: string, file: string) => {
  const input = (await page.$(selector)) as ElementHandle<HTMLInputElement> | null;
  if (!input) throw new Error(`champ fichier introuvable : ${selector}`);
  await input.uploadFile(file);
};

async function login(page: Page, email: string, pass: string): Promise<void> {
  await go(page, "/admin/login");
  await fill(page, "#identifiant", email);
  await fill(page, "#motDePasse", pass);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }), page.click("button[type=submit]")]);
}

/** Clique si le bouton existe et n'est pas désactivé. Retourne faux quand il n'y a rien à faire. */
async function clickIfEnabled(page: Page, tag: string, text: string): Promise<boolean> {
  const found = await page.$$eval(
    tag,
    (els, t: string) => {
      const el = els.find((e) => (e.textContent ?? "").replace(/\s+/g, " ").includes(t) && e.getClientRects().length > 0 && !(e as HTMLButtonElement).disabled);
      if (el) (el as HTMLElement).click();
      return !!el;
    },
    text,
  );
  return found;
}

/**
 * Ouvre le restaurant toute la journée et publie, pour que la prise de commande soit possible.
 * Tolérante : relancée alors que tout est déjà en place, elle ne fait rien.
 */
async function openAllDay(admin: Page): Promise<void> {
  await go(admin, "/admin/horaires");
  for (const jour of ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]) {
    if (!(await checked(admin, `input[aria-label="${jour} ouvert"]`))) await admin.$eval(`input[aria-label="${jour} ouvert"]`, (e) => (e as HTMLInputElement).click());
  }
  await admin.evaluate(() => {
    const all = [...document.querySelectorAll<HTMLInputElement>('input[type="time"]')];
    const labels = all.map((i) => i.getAttribute("aria-label") ?? "");
    all.forEach((input, k) => {
      const [jour, plage, bout] = labels[k].split(", ");
      const two = labels.includes(`${jour}, plage 2, fin`);
      const v = plage === "plage 1" ? (bout === "début" ? "00:00" : two ? "12:00" : "23:59") : bout === "début" ? "12:00" : "23:59";
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, v);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });
  if (await clickIfEnabled(admin, "button", "Enregistrer")) await toast(admin, "Horaires enregistrés.");
  await go(admin, "/admin/publication");
  if (await clickIfEnabled(admin, "button", "Publier la version")) await toast(admin, "Publication appliquée.");
}

/* -------------------------------------------------------- 1. parcours */

async function walkthrough(admin: Page, staff: Page, visitor: Page, context: BrowserContext): Promise<void> {
  const stamp = String(Date.now()).slice(-5);
  const catName = `Antipasti ${stamp}`;
  const prodName = `Focaccia ${stamp}`;
  const member = `nina.${stamp}@example.test`;
  let inviteLink = "";
  const tmp = (name: string, content: string) => {
    const file = path.join(DIR, name);
    fs.writeFileSync(file, content);
    return file;
  };

  section("Connexion et réglages du restaurant");
  await step(admin, "connexion par le formulaire", async () => {
    await login(admin, ADMIN.email, password);
    assert(admin.url().endsWith("/admin"), `URL inattendue ${admin.url()}`);
    await hasText(admin, "Votre restaurant, à votre image.");
  });
  await step(admin, "établissement : enregistrement puis persistance après rechargement", async () => {
    await go(admin, "/admin/etablissement");
    await fill(admin, "#sousTitre", `Cuisine de saison ${stamp}`);
    await click(admin, "button", "Enregistrer");
    await toast(admin, "Informations du restaurant enregistrées.");
    await admin.reload({ waitUntil: "networkidle2" });
    assert((await value(admin, "#sousTitre")) === `Cuisine de saison ${stamp}`, "valeur non persistée");
  });
  await step(admin, "établissement : erreur serveur lisible (téléphone invalide)", async () => {
    await click(admin, "button", "Coordonnées");
    await fill(admin, "#telephone", "pas un numéro");
    await click(admin, "button", "Enregistrer");
    await toast(admin, "Numéro de téléphone invalide.");
    await hasText(admin, "Numéro de téléphone invalide.");
    await fill(admin, "#telephone", "");
  });
  await step(admin, "horaires : ouverture du lundi et fermeture exceptionnelle", async () => {
    await go(admin, "/admin/horaires");
    const before = await checked(admin, 'input[aria-label="Lundi ouvert"]');
    await admin.$eval('input[aria-label="Lundi ouvert"]', (e) => (e as HTMLInputElement).click());
    await click(admin, "button", "Enregistrer");
    await toast(admin, "Horaires enregistrés.");
    await admin.reload({ waitUntil: "networkidle2" });
    assert((await checked(admin, 'input[aria-label="Lundi ouvert"]')) === !before, "bascule non persistée");
    await click(admin, "button", "Ajouter une date");
    await setValue(admin, "#exc-date", `2027-01-${String(1 + (Number(stamp) % 27)).padStart(2, "0")}`);
    await fill(admin, "#exc-motif", "Congés du test");
    await click(admin, "button", "Ajouter", { exact: true, root: DIALOG });
    await toast(admin, "Fermeture ajoutée.");
    await hasText(admin, "Congés du test");
  });
  await step(admin, "apparence : texte, langue et traduction", async () => {
    await go(admin, "/admin/apparence");
    await fill(admin, "#texte", `Un peu d'Italie. Beaucoup de plaisir. ${stamp}`);
    await click(admin, "button", "Enregistrer");
    await toast(admin, "Apparence enregistrée.");
    await admin.select("#langue", "en");
    await click(admin, "button", "Ajouter", { exact: true });
    await toast(admin, "Langue ajoutée.");
    await click(admin, "button", "Textes à traduire");
    await fill(admin, '[id="apparence.titreAccueil"]', `Together at the table ${stamp}`);
    await click(admin, "button", "Enregistrer les traductions");
    await toast(admin, "Traductions enregistrées.");
  });

  section("Carte et images");
  await step(admin, "catégorie créée depuis le panneau latéral", async () => {
    await go(admin, "/admin/categories");
    await click(admin, "button", "Ajouter une catégorie");
    await fill(admin, "#cat-nom", catName);
    await fill(admin, "#cat-desc", "Créée par le parcours automatisé.");
    await click(admin, "button", "Enregistrer");
    await toast(admin, "Catégorie ajoutée.");
    await hasText(admin, catName);
  });
  await step(admin, "allergène ajouté puis supprimé avec confirmation", async () => {
    await click(admin, "button", "Allergènes");
    await fill(admin, "#new-allergenes-nom", `Allergène ${stamp}`);
    await click(admin, "button", "Ajouter", { exact: true });
    await toast(admin, "Ajouté.");
    await admin.waitForSelector(`button[aria-label="Supprimer Allergène ${stamp}"]`);
    await admin.click(`button[aria-label="Supprimer Allergène ${stamp}"]`);
    await click(admin, "button", "Supprimer", { exact: true, root: DIALOG });
    await toast(admin, "Supprimé.");
  });
  await step(admin, "produit créé depuis la fiche, avec prix saisi à la virgule", async () => {
    await go(admin, "/admin/produits/nouveau");
    await fill(admin, "#nom", prodName);
    await fill(admin, "#description", "Huile d'olive, romarin et fleur de sel.");
    const cat = await admin.$$eval("#categorie option", (os, name) => (os as HTMLOptionElement[]).find((o) => o.textContent === name)?.value, catName);
    assert(cat, "catégorie absente de la liste");
    await admin.select("#categorie", cat as string);
    await fill(admin, "#prix", "6,50");
    await click(admin, "button", "Gluten");
    await Promise.all([admin.waitForFunction(() => /\/admin\/produits\/prd_/.test(location.pathname), { timeout: 30000 }), click(admin, "button", "Enregistrer")]);
    await hasText(admin, prodName);
    await admin.waitForFunction(() => (document.querySelector("#prix") as HTMLInputElement | null)?.value === "6,50", { timeout: T });
  });
  await step(admin, "catalogue : recherche, bascule de disponibilité et action groupée", async () => {
    await go(admin, "/admin/produits");
    await fill(admin, 'input[type="search"]', prodName);
    await admin.waitForFunction(() => document.querySelectorAll("tbody tr").length === 1);
    await admin.select("#q-dispo", "0");
    await toast(admin, "Produit mis à jour.");
    await admin.waitForFunction(() => (document.querySelector("#q-dispo") as HTMLSelectElement | null)?.value === "0");
    await admin.click(`input[aria-label="Sélectionner ${prodName}"]`);
    await hasText(admin, "1 produit sélectionné");
    await click(admin, "button", "Masquer");
    await toast(admin, "Produits masqués.");
    await admin.select("#q-visible", "1");
    await admin.waitForFunction(() => (document.querySelector("#q-visible") as HTMLSelectElement | null)?.value === "1");
    await admin.select("#q-dispo", "1");
    await admin.waitForFunction(() => (document.querySelector("#q-dispo") as HTMLSelectElement | null)?.value === "1");
  });
  await step(admin, "options : groupe et option créés", async () => {
    await go(admin, "/admin/options");
    await fill(admin, 'input[aria-label="Nom du nouveau groupe"]', `Sauces ${stamp}`);
    await click(admin, "button", "Ajouter", { exact: true });
    await toast(admin, "Groupe d'options ajouté.");
    await hasText(admin, `Sauces ${stamp}`);
    await fill(admin, 'input[aria-label="Nom de la nouvelle option"]', "Pesto maison");
    await click(admin, "button", "Ajouter une option");
    await toast(admin, "Option ajoutée.");
    await admin.waitForSelector('input[aria-label="Nom de l\'option"]');
  });
  await step(admin, "médiathèque : import, texte alternatif et recadrage", async () => {
    await go(admin, "/admin/medias");
    const before = await admin.$$eval("ul button[aria-pressed]", (b) => b.length);
    await upload(admin, 'input[type="file"][multiple]', path.join(ROOT, "demo/media/tiramisu.jpg"));
    await toast(admin, "1 image importée.");
    await admin.waitForFunction((b: number) => document.querySelectorAll("ul button[aria-pressed]").length === b + 1, { timeout: T }, before);
    await admin.click("ul li:first-child button[aria-pressed]");
    await fill(admin, "#m-alt", "Tiramisu servi à l'assiette");
    await click(admin, "button", "Enregistrer");
    await toast(admin, "Image enregistrée.");
    const dims = await admin.$eval("dl", (d) => d.textContent);
    await click(admin, "button", "Recadrer");
    await click(admin, "button", "Carré 1:1", { root: DIALOG });
    await click(admin, "button", "Appliquer le recadrage", { root: DIALOG });
    await toast(admin, "Image recadrée.");
    await admin.waitForFunction((d: string | null) => document.querySelector("dl")?.textContent !== d, { timeout: T }, dims);
  });
  await step(admin, "médiathèque : faux fichier image refusé avec message", async () => {
    await upload(admin, 'input[type="file"][multiple]', tmp("faux.jpg", "ceci n'est pas une image"));
    await toast(admin, "n'est pas une image lisible");
  });

  section("Équipe, droits et diffusion en direct");
  await step(admin, "invitation d'un membre : lien généré, aucun envoi simulé", async () => {
    await go(admin, "/admin/utilisateurs/inviter");
    await fill(admin, "#prenom", "Nina");
    await fill(admin, "#nom", "Rossi");
    await fill(admin, "#email", member);
    await admin.select("#role", "role_serveur");
    await click(admin, "button", "Créer l'invitation");
    await toast(admin, "Invitation créée.");
    await hasText(admin, "Envoi d'e-mails non configuré");
    inviteLink = await value(admin, 'input[aria-label="Lien d\'invitation"]');
    assert(inviteLink.includes("/admin/invitation/"), "lien absent");
  });
  await step(staff, "le membre active son compte, arrive dans son espace et reste hors de l'administration", async () => {
    await staff.goto(inviteLink, { waitUntil: "networkidle2" });
    await fill(staff, "#mdp", "Nina-Motdepasse-2026");
    await fill(staff, "#mdp2", "Nina-Motdepasse-2026");
    await click(staff, "button", "Accepter l'invitation");
    await hasText(staff, "Votre compte est activé.");
    await login(staff, member, "Nina-Motdepasse-2026");
    assert(staff.url().endsWith("/salle"), `URL inattendue ${staff.url()}`);
    await hasText(staff, "Vos tables, en un coup d'œil.");
    await go(staff, "/admin");
    await hasText(staff, "Accès refusé");
    assert(staff.url().endsWith("/admin/acces-refuse"), `URL inattendue ${staff.url()}`);
  });
  await step(admin, "rôles : droits accordés au rôle Serveur depuis la matrice", async () => {
    await go(admin, "/admin/roles");
    await admin.select('select[aria-label="Accéder à l\'administration pour Serveur"]', "toutes");
    await admin.select('select[aria-label="Modifier la carte pour Serveur"]', "toutes");
    await click(admin, "button", "Enregistrer");
    await toast(admin, "Permissions enregistrées.");
  });
  await step(staff, "le membre accède à la carte, mais toujours pas aux utilisateurs", async () => {
    await go(staff, "/admin");
    await hasText(staff, "Votre restaurant, à votre image.");
    const nav = await staff.$$eval('nav[aria-label="Administration"] a', (as) => as.map((a) => (a.textContent ?? "").trim()));
    assert(nav.includes("Produits") && !nav.includes("Utilisateurs") && !nav.includes("Sécurité"), `navigation inattendue : ${nav.join(", ")}`);
    await go(staff, "/admin/utilisateurs");
    assert(staff.url().endsWith("/admin/acces-refuse"), `URL inattendue ${staff.url()}`);
    await go(staff, "/admin/produits");
    await hasText(staff, "Catalogue des produits");
  });
  await step(admin, "diffusion en direct : l'autre session est prévenue d'un enregistrement", async () => {
    await sleep(1500);
    await go(admin, "/admin/etablissement");
    await fill(admin, "#description", `Une cuisine fraîche, simple et généreuse. ${stamp}`);
    await click(admin, "button", "Enregistrer");
    await toast(admin, "Informations du restaurant enregistrées.");
    await toast(staff, "Des données ont été modifiées ailleurs.");
  });
  await step(admin, "suspension depuis le menu d'actions : le membre est déconnecté", async () => {
    await go(admin, "/admin/utilisateurs");
    await admin.click('button[aria-label="Actions pour Nina Rossi"]');
    await click(admin, '[role="menuitem"]', "Suspendre");
    await click(admin, "button", "Suspendre", { exact: true, root: DIALOG });
    await toast(admin, "Compte suspendu, sessions révoquées.");
    await go(staff, "/admin/produits");
    assert(staff.url().endsWith("/admin/login"), `URL inattendue ${staff.url()}`);
  });

  section("Salle");
  await step(admin, "table ajoutée", async () => {
    await go(admin, "/admin/tables");
    await click(admin, "button", "Ajouter une table");
    await fill(admin, "#t-nom", `Table T${stamp}`);
    await click(admin, "button", "Enregistrer");
    await toast(admin, "Table ajoutée.");
    await hasText(admin, `Table T${stamp}`);
  });
  await step(admin, "plan de salle : ajout, glisser-déposer, clavier et enregistrement", async () => {
    await go(admin, "/admin/plan");
    const count = () => admin.$$eval('[role="application"] > button', (b) => b.length);
    const before = await count();
    await click(admin, "button", "Plante", { exact: true });
    assert((await count()) === before + 1, "élément non ajouté");
    const el = await admin.$('[role="application"] > button[aria-pressed="true"]');
    const box = await el?.boundingBox();
    if (!el || !box) throw new Error("élément ajouté introuvable");
    const x0 = Number(await value(admin, "#p-x"));
    await admin.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await admin.mouse.down();
    await admin.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 45, { steps: 6 });
    await admin.mouse.up();
    const x1 = Number(await value(admin, "#p-x"));
    assert(x1 > x0, `le glisser-déposer n'a pas déplacé l'élément (${x0} -> ${x1})`);
    await el.focus();
    await admin.keyboard.press("ArrowRight");
    assert(Number(await value(admin, "#p-x")) === x1 + 10, "la flèche du clavier n'a pas déplacé l'élément");
    await click(admin, "button", "Enregistrer");
    await toast(admin, "Plan de salle enregistré.");
    await admin.reload({ waitUntil: "networkidle2" });
    assert((await count()) === before + 1, "plan non persisté");
  });
  await step(admin, "sessions de table : ouverture, code, fermeture avec confirmation", async () => {
    await go(admin, "/admin/qr");
    assert((await admin.$eval('[role="img"] svg', (s) => s.querySelectorAll("path").length)) > 0, "QR code absent");
    await click(admin, "button", "Sessions");
    await click(admin, "button", "Ouvrir une session");
    await toast(admin, "Session ouverte pour");
    await admin.waitForFunction(() => [...document.querySelectorAll("td span")].some((s) => /^\d{4}$/.test((s.textContent ?? "").trim())));
    await click(admin, "button", "Fermer", { exact: true });
    await click(admin, "button", "Fermer la session", { root: DIALOG });
    await toast(admin, "Session fermée, accès révoqués.");
  });

  section("Réglages");
  await step(admin, "panier partagé", async () => {
    await go(admin, "/admin/commandes");
    const field = 'input[aria-label="Quantité maximale par article"]';
    const next = (await value(admin, field)) === "15" ? "18" : "15";
    await fill(admin, field, next);
    await click(admin, "button", "Enregistrer");
    await toast(admin, "Réglages du panier enregistrés.");
    await admin.reload({ waitUntil: "networkidle2" });
    assert((await value(admin, field)) === next, "valeur non persistée");
  });
  await step(admin, "statuts : acheminement d'une catégorie", async () => {
    await go(admin, "/admin/commandes/statuts");
    const id = await admin.$eval('select[id^="route-"]', (s) => s.id);
    const next = await admin.$eval(`#${id}`, (s) => [...(s as HTMLSelectElement).options].find((o) => o.value !== (s as HTMLSelectElement).value)?.value ?? "");
    await admin.select(`#${id}`, next);
    await click(admin, "button", "Enregistrer");
    await toast(admin, "Acheminement enregistré.");
  });
  await step(admin, "notifications : règle modifiée", async () => {
    await go(admin, "/admin/notifications");
    await click(admin, "label", "Accusé de prise en compte requis");
    await click(admin, "button", "Enregistrer");
    await toast(admin, "Règle enregistrée.");
  });
  await step(admin, "addition : profil de taxe créé puis renseigné", async () => {
    await go(admin, "/admin/addition");
    await fill(admin, 'input[aria-label="Nom du nouveau profil"]', `Taxe ${stamp}`);
    await click(admin, "button", "Ajouter un profil");
    await toast(admin, "Profil ajouté en brouillon.");
    await admin.waitForFunction((name: string) => [...document.querySelectorAll('input[aria-label="Nom du profil"]')].some((i) => (i as HTMLInputElement).value === name), { timeout: T }, `Taxe ${stamp}`);
    const rows = await admin.$$('input[aria-label="Taux en pourcentage"]');
    await rows[rows.length - 1].type("10");
    await click(admin, "button", "Enregistrer", { exact: true, root: "ul" });
    await toast(admin, "Profil enregistré.");
  });
  await step(admin, "sécurité : durée d'inactivité", async () => {
    await go(admin, "/admin/securite");
    await admin.select("#s-inact", (await value(admin, "#s-inact")) === "60" ? "120" : "60");
    await click(admin, "button", "Enregistrer");
    await toast(admin, "Règles de sécurité enregistrées.");
  });
  await step(admin, "historique : filtre et détail d'une action", async () => {
    await go(admin, `/admin/historique?periode=jour&recherche=${encodeURIComponent(prodName)}`);
    await hasText(admin, prodName);
    await hasText(admin, "Détail de l'action");
    assert((await admin.$$eval("tbody tr", (r) => r.length)) >= 1, "aucune ligne");
  });

  section("Données, sauvegardes et publication");
  await step(admin, "export Excel téléchargeable par le personnel autorisé", async () => {
    await go(admin, "/admin/donnees");
    const out = await admin.evaluate(async () => {
      const r = await fetch("/api/admin/export/produits?format=xlsx");
      const b = new Uint8Array(await r.arrayBuffer());
      return { status: r.status, name: r.headers.get("content-disposition") ?? "", zip: b[0] === 0x50 && b[1] === 0x4b, size: b.length };
    });
    assert(out.status === 200 && out.name.includes(".xlsx") && out.zip && out.size > 2000, JSON.stringify(out));
  });
  await step(admin, "import : fichier en erreur bloqué, fichier valide appliqué", async () => {
    await upload(admin, "#imp-file", tmp("import-ko.csv", `Nom;Catégorie;Prix TTC\nPlat valide;${catName};9,00\nPlat sans prix;${catName};\n`));
    await hasText(admin, "1 ligne(s) valide(s), 1 à corriger");
    await hasText(admin, "Prix manquant");
    const disabled = await admin.$$eval("button", (bs) => (bs as HTMLButtonElement[]).find((b) => (b.textContent ?? "").includes("Corriger avant d'importer"))?.disabled);
    assert(disabled === true, "le bouton d'import devrait être désactivé");
    await upload(admin, "#imp-file", tmp("import-ok.csv", `Nom;Catégorie;Prix TTC;Description\nGressins ${stamp};${catName};4,50;Croustillants, au sésame.\n`));
    await click(admin, "button", "Importer 1 ligne(s)");
    await toast(admin, "Import terminé.");
    await hasText(admin, "Import enregistré");
  });
  await step(admin, "sauvegarde créée puis restaurée après vérification et confirmation", async () => {
    await click(admin, "button", "Sauvegardes");
    await fill(admin, 'input[aria-label="Note de la sauvegarde"]', `Sauvegarde ${stamp}`);
    await click(admin, "button", "Créer une sauvegarde");
    await toast(admin, "Sauvegarde créée.");
    await hasText(admin, `Sauvegarde ${stamp}`);
    await click(admin, "button", "Préparer une restauration");
    await hasText(admin, "Restaurer cette sauvegarde");
    await fill(admin, "#rest-word", "RESTAURER");
    await click(admin, "button", "Restaurer", { exact: true, root: DIALOG });
    await toast(admin, "Sauvegarde restaurée.");
  });
  await step(admin, "publication : liste des changements puis mise en ligne", async () => {
    await go(admin, "/admin/publication");
    const title = (await admin.$eval("h2", (h) => h.textContent)) ?? "";
    assert(/Modifications à publier \(\d+\)/.test(title) && !title.includes("(0)"), `titre inattendu : ${title}`);
    await hasText(admin, prodName);
    await click(admin, "button", "Publier la version");
    await toast(admin, "Publication appliquée.");
    await hasText(admin, "Aucune modification en attente");
  });

  section("Menu public");
  await step(visitor, "le menu public affiche ce qui vient d'être publié, sans lien d'administration", async () => {
    await go(visitor, "/");
    await hasText(visitor, prodName);
    await hasText(visitor, `Gressins ${stamp}`);
    assert(!/href="\/admin/.test(await visitor.content()), "lien d'administration présent sur la page publique");
  });
  await step(visitor, "fiche produit : ouverture, contenu, fermeture au clavier", async () => {
    await click(visitor, "li button", "Pizza della casa");
    await visitor.waitForSelector(DIALOG, { visible: true });
    const text = await visitor.$eval(DIALOG, (d) => (d as HTMLElement).innerText);
    assert(text.includes("Allergènes à vérifier") && text.includes("Suppléments pizza") && text.includes("Mozzarella"), "contenu de la fiche incomplet");
    await visitor.keyboard.press("Escape");
    await visitor.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  });
  await step(visitor, "changement de langue", async () => {
    await click(visitor, "button", "en", { exact: true });
    await hasText(visitor, `Together at the table ${stamp}`);
    await hasText(visitor, "Opening hours and access");
    await click(visitor, "button", "fr", { exact: true });
    await hasText(visitor, "Horaires et accès");
  });
  await step(visitor, "navigation par catégorie, sans défilement spontané au chargement", async () => {
    await visitor.setViewport({ width: 360, height: 640, isMobile: true, hasTouch: true });
    await go(visitor, "/");
    await sleep(800);
    assert((await visitor.evaluate(() => window.scrollY)) === 0, "la page a défilé toute seule au chargement");
    await click(visitor, 'div[role="navigation"] a', "Desserts");
    await visitor.waitForFunction(() => location.hash.startsWith("#cat-"));
    await visitor.waitForFunction(() => document.querySelector('div[role="navigation"] a[aria-current="true"]')?.textContent === "Desserts", { timeout: T });
  });

  section("Mobile et compte");
  const mobile = await newPage(context, "mobile", true);
  await step(mobile, "administration sur mobile : menu latéral et navigation", async () => {
    await mobile.bringToFront();
    await go(mobile, "/admin");
    await mobile.click('button[aria-label="Ouvrir le menu"]');
    await mobile.waitForSelector(`${DIALOG} nav a`, { visible: true });
    await Promise.all([mobile.waitForFunction(() => location.pathname === "/admin/produits", { timeout: 30000 }), click(mobile, `${DIALOG} a`, "Produits")]);
    await hasText(mobile, "Catalogue des produits");
    const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(overflow <= 1, `débordement horizontal de ${overflow}px`);
  });
  await mobile.close();
  await admin.bringToFront();
  await step(admin, "bouton retour : revient à la page précédente", async () => {
    await go(admin, "/admin/produits");
    await go(admin, "/admin/tables");
    await admin.click('header button[aria-label="Retour à la page précédente"]');
    await admin.waitForFunction(() => location.pathname === "/admin/produits", { timeout: T });
    await hasText(admin, "Catalogue des produits");
  });
  await step(admin, "changement de mot de passe puis déconnexion et reconnexion", async () => {
    const next = `Nouveau-Motdepasse-${stamp}`;
    await go(admin, "/admin");
    await click(admin, "header button", ADMIN.name);
    await click(admin, '[role="menuitem"]', "Changer mon mot de passe");
    await fill(admin, "#mdp-actuel", "mauvais-mot-de-passe");
    await fill(admin, "#mdp-nouveau", next);
    await fill(admin, "#mdp-confirmation", next);
    await click(admin, "button", "Enregistrer", { root: DIALOG });
    await hasText(admin, "Mot de passe incorrect.");
    await fill(admin, "#mdp-actuel", password);
    await click(admin, "button", "Enregistrer", { root: DIALOG });
    await toast(admin, "Mot de passe modifié.");
    password = next;
    await click(admin, "header button", ADMIN.name);
    await Promise.all([admin.waitForNavigation({ waitUntil: "networkidle2" }), click(admin, '[role="menuitem"]', "Se déconnecter")]);
    assert(admin.url().endsWith("/admin/login"), `URL inattendue ${admin.url()}`);
    await go(admin, "/admin/produits");
    assert(admin.url().endsWith("/admin/login"), "page admin accessible après déconnexion");
    await login(admin, ADMIN.email, password);
    assert(admin.url().endsWith("/admin"), "reconnexion impossible avec le nouveau mot de passe");
  });
}

/* ------------------------------------------------ 2. parcours client */

async function guestJourney(admin: Page, browser: Browser): Promise<void> {
  section("Parcours client : rejoindre la table, commander ensemble, suivre, régler");
  axeSource ||= fs.readFileSync(path.join(ROOT, "node_modules/axe-core/axe.min.js"), "utf8");
  await admin.bringToFront();
  let tableId = "";
  let code = "";
  const vera = await newPage(await browser.createBrowserContext(), "convive 1");
  const lina = await newPage(await browser.createBrowserContext(), "convive 2");
  await vera.setViewport({ width: 1536, height: 1024 });
  await lina.setViewport({ width: 1536, height: 1024 });
  const base = () => `/table/${tableId}`;

  await step(admin, "le restaurant ouvre toute la journée et publie ses horaires", async () => {
    await openAllDay(admin);
  });
  await step(admin, "le personnel ouvre une session et obtient le code de la table", async () => {
    await go(admin, "/admin/qr");
    tableId = /\/table\/(tbl_[a-f0-9]+)/.exec(await admin.content())?.[1] ?? "";
    assert(tableId, "identifiant de table introuvable");
    await click(admin, "button", "Sessions");
    await click(admin, "button", "Ouvrir une session");
    await toast(admin, "Session ouverte pour");
    await admin.waitForFunction(() => [...document.querySelectorAll("td span")].some((s) => /^\d{4}$/.test((s.textContent ?? "").trim())));
    code = await admin.evaluate(() => ([...document.querySelectorAll("td span")].find((s) => /^\d{4}$/.test((s.textContent ?? "").trim()))?.textContent ?? "").trim());
  });
  await step(vera, "l'accueil de la table ne montre ni code ni panier, et refuse un mauvais code", async () => {
    await vera.bringToFront();
    await go(vera, base());
    await hasText(vera, "Prenez place.");
    const html = await vera.content();
    assert(!html.includes(code) && !html.includes("Le panier de la table"), "le code ou le panier est visible avant l'admission");
    assert((await value(vera, 'input[aria-label="Chiffre 1 du code"]')) === "", "le code est prérempli");
    await audit(vera, "accueil de la table");
    await vera.type('input[aria-label="Chiffre 1 du code"]', code === "0000" ? "1111" : "0000");
    await click(vera, "button", "Rejoindre la table");
    await hasText(vera, "Ce code n'est pas valide pour la session actuelle.");
  });
  await step(vera, "le bon code ouvre le menu de la table", async () => {
    await vera.type('input[aria-label="Chiffre 1 du code"]', code);
    await fill(vera, "#pseudo", "Vera");
    await Promise.all([vera.waitForNavigation({ waitUntil: "networkidle2" }), click(vera, "button", "Rejoindre la table")]);
    await hasText(vera, "Le panier de la table");
    await hasText(vera, "Le panier attend vos envies.");
    await audit(vera, "menu de la table");
  });
  await step(lina, "un second convive rejoint la table et ajoute un plat, vu aussitôt par le premier", async () => {
    await lina.bringToFront();
    await go(lina, base());
    await lina.type('input[aria-label="Chiffre 1 du code"]', code);
    await fill(lina, "#pseudo", "Lina");
    await Promise.all([lina.waitForNavigation({ waitUntil: "networkidle2" }), click(lina, "button", "Rejoindre la table")]);
    await lina.click('button[aria-label="Ajouter Bruschetta al pomodoro au panier"]');
    await toast(lina, "Bruschetta al pomodoro ajouté au panier de la table.");
    await vera.bringToFront();
    await vera.waitForFunction(() => document.querySelector('[aria-labelledby="titre-panier"]')?.textContent?.includes("Bruschetta al pomodoro"), { timeout: T });
    await hasText(vera, "Lina");
  });
  await step(vera, "fiche produit : options, préférence et ajout au panier", async () => {
    await click(vera, "h3 button", "Pizza della casa");
    await vera.waitForSelector(DIALOG, { visible: true });
    await hasText(vera, "Allergènes à vérifier");
    await audit(vera, "fiche produit de la table");
    await click(vera, `${DIALOG} label`, "Mozzarella");
    await fill(vera, "#preference", "Sans oignons");
    await click(vera, `${DIALOG} button`, "Ajouter au panier");
    await toast(vera, "Pizza della casa ajouté au panier de la table.");
    const total = await vera.$eval('[aria-labelledby="titre-panier"]', (e) => (e as HTMLElement).innerText);
    assert(/29,00\s€/.test(total), `total inattendu : ${total.slice(-80)}`);
  });
  await step(vera, "quantité, instruction modifiée et retrait d'une ligne", async () => {
    await vera.click('[role="group"][aria-label="Quantité de Pizza della casa"] button[aria-label="Ajouter un"]');
    await vera.waitForFunction(() => /49,50\s€/.test((document.querySelector('[aria-labelledby="titre-panier"]') as HTMLElement).innerText), { timeout: T });
    await click(vera, "button", "« Sans oignons »");
    await vera.waitForSelector("#instruction", { visible: true });
    await audit(vera, "fenêtre d'instruction");
    await fill(vera, "#instruction", "Bien cuite");
    await click(vera, `${DIALOG} button`, "Enregistrer");
    await toast(vera, "Instruction enregistrée.");
    await hasText(vera, "« Bien cuite »");
    await vera.click('button[aria-label="Retirer Bruschetta al pomodoro du panier"]');
    await vera.waitForFunction(() => /41,00\s€/.test((document.querySelector('[aria-labelledby="titre-panier"]') as HTMLElement).innerText), { timeout: T });
  });
  await step(vera, "envoi en cuisine après confirmation", async () => {
    await click(vera, "button", "Commander maintenant");
    await hasText(vera, "On envoie en cuisine ?");
    await audit(vera, "confirmation d'envoi");
    await click(vera, `${DIALOG} button`, "Confirmer la commande");
    await hasText(vera, "C'est envoyé !");
    await audit(vera, "commande envoyée");
    await vera.keyboard.press("Escape");
    await hasText(vera, "Le panier attend vos envies.");
  });
  await step(vera, "suivi : la commande apparaît, verrouillée, au statut Reçue", async () => {
    await click(vera, 'nav[aria-label="Votre table"] a', "Nos commandes");
    await hasText(vera, "Ça se prépare.");
    await hasText(vera, "Commande 01");
    await hasText(vera, "Bien cuite");
    assert((await vera.$eval("article ol li[aria-current]", (e) => e.textContent)) === "Reçue", "statut inattendu");
    await audit(vera, "commandes de la table");
  });
  await step(vera, "coup de main : une demande part vers le personnel", async () => {
    await vera.click('header button[aria-label^="Demander de l\'aide"]');
    await hasText(vera, "Un coup de main ?");
    await audit(vera, "fenêtre de demande d'aide");
    await click(vera, `${DIALOG} button`, "De l'eau");
    await toast(vera, "Demande transmise à notre équipe.");
    await vera.keyboard.press("Escape");
  });
  await step(admin, "service en direct : le personnel voit la commande et la demande, et fait avancer la commande", async () => {
    await admin.bringToFront();
    await go(admin, "/admin/service");
    await hasText(admin, "Commandes en cours (1)");
    await hasText(admin, "Bien cuite");
    await hasText(admin, "De l'eau");
    await audit(admin, "/admin/service");
    await click(admin, "button", "Passer à « En préparation »");
    await toast(admin, "En préparation.");
    await click(admin, "button", "Traitée");
    await toast(admin, "Demande traitée.");
    await hasText(admin, "Aucune demande en attente.");
  });
  await step(vera, "le convive voit le nouveau statut sans recharger la page", async () => {
    await vera.bringToFront();
    await vera.waitForFunction(() => document.querySelector("article ol li[aria-current]")?.textContent === "En préparation", { timeout: T });
  });
  await step(vera, "addition : total confirmé, partage et demande d'addition", async () => {
    await click(vera, 'nav[aria-label="Votre table"] a', "Notre addition");
    await hasText(vera, "On fait les comptes ?");
    await hasText(vera, "Total confirmé");
    const text = await vera.$eval("main", (e) => (e as HTMLElement).innerText);
    assert(/41,00\s€/.test(text) && /20,50\s€/.test(text), "total ou part par personne inattendu");
    await vera.click('button[aria-label="Un convive de plus"]');
    await vera.waitForFunction(() => /13,67\s€/.test((document.querySelector("main") as HTMLElement).innerText), { timeout: T });
    await audit(vera, "addition de la table");
    await click(vera, "button", "Demander l'addition");
    await toast(vera, "Demande transmise : notre équipe apporte l'addition.");
    await hasText(vera, "Addition demandée");
  });
  await step(vera, "table en direct : convives et dernières envies", async () => {
    await click(vera, 'nav[aria-label="Votre table"] a', "La table en direct");
    await hasText(vera, "Les envies se rencontrent.");
    await hasText(vera, "Vera a envoyé la commande 01");
    await hasText(vera, "Lina a rejoint la table");
    await audit(vera, "table en direct");
  });
  await step(vera, "aucun débordement horizontal sur les écrans du convive", async () => {
    const bad: string[] = [];
    for (const width of [1024, 1280, 1536]) {
      await vera.setViewport({ width, height: 900 });
      for (const p of ["", "/commandes", "/addition", "/direct"]) {
        await go(vera, `${base()}${p}`);
        const over = await vera.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (over > 1) bad.push(`${p || "/"} à ${width}px (${over}px)`);
      }
    }
    assert(bad.length === 0, bad.join(" ; "));
  });
  await step(admin, "la fermeture de la session renvoie les convives à l'accueil", async () => {
    await admin.bringToFront();
    await go(admin, "/admin/qr");
    await click(admin, "button", "Sessions");
    await click(admin, "button", "Fermer", { exact: true });
    await click(admin, "button", "Fermer la session", { root: DIALOG });
    await toast(admin, "Session fermée, accès révoqués.");
    await vera.bringToFront();
    await go(vera, `${base()}/commandes`);
    await hasText(vera, "Merci pour ce moment.");
    assert(!(await vera.content()).includes("Commande 01"), "une commande reste visible après la fermeture");
  });
  await vera.close();
  await lina.close();
}

/* ------------------------------------- parcours client sur téléphone */

async function mobileJourney(admin: Page, browser: Browser): Promise<void> {
  section("Parcours client sur téléphone et tablette");
  axeSource ||= fs.readFileSync(path.join(ROOT, "node_modules/axe-core/axe.min.js"), "utf8");
  let tableId = "";
  let code = "";
  const phone = await newPage(await browser.createBrowserContext(), "téléphone", true);
  const base = () => `/table/${tableId}`;
  const tabs = 'nav[aria-label="Rubriques de la table"] a';
  const noOverflow = async (label: string) => {
    const over = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(over <= 1, `débordement horizontal de ${over}px (${label})`);
  };

  await step(admin, "le personnel ouvre une session pour la table", async () => {
    await admin.bringToFront();
    await go(admin, "/admin/qr");
    tableId = /\/table\/(tbl_[a-f0-9]+)/.exec(await admin.content())?.[1] ?? "";
    await click(admin, "button", "Sessions");
    await click(admin, "button", "Ouvrir une session");
    await toast(admin, "Session ouverte pour");
    await admin.waitForFunction(() => [...document.querySelectorAll("td span")].some((s) => /^\d{4}$/.test((s.textContent ?? "").trim())));
    code = await admin.evaluate(() => ([...document.querySelectorAll("td span")].find((s) => /^\d{4}$/.test((s.textContent ?? "").trim()))?.textContent ?? "").trim());
  });
  await step(phone, "carte publique : aide pour lire le QR code de la table", async () => {
    await phone.bringToFront();
    await go(phone, "/");
    await click(phone, "button", "Scanner le QR de ma table");
    await hasText(phone, "Commander depuis votre table");
    await audit(phone, "carte publique, aide QR, téléphone");
    await phone.keyboard.press("Escape");
    await noOverflow("carte publique");
  });
  await step(phone, "accueil de table : un mauvais code reste affiché et se corrige", async () => {
    await go(phone, base());
    await hasText(phone, "Code de votre table");
    await phone.type('input[aria-label="Chiffre 1 du code"]', code === "0000" ? "1111" : "0000");
    await click(phone, "button", "Rejoindre la table");
    await hasText(phone, "Ce code n'est pas valide pour la session actuelle.");
    assert((await value(phone, 'input[aria-label="Chiffre 2 du code"]')) !== "", "le code refusé a été effacé");
    await audit(phone, "accueil de table, code refusé, téléphone");
    await noOverflow("accueil de table");
    await phone.click('input[aria-label="Chiffre 1 du code"]');
    await phone.type('input[aria-label="Chiffre 1 du code"]', code);
    const typed = await phone.$$eval('input[aria-label^="Chiffre"]', (els) => els.map((e) => (e as HTMLInputElement).value).join(""));
    assert(typed === code, `code saisi ${typed} au lieu de ${code}`);
    await fill(phone, "#pseudo", "Vera");
    await Promise.all([phone.waitForNavigation({ waitUntil: "networkidle2" }), click(phone, "button", "Rejoindre la table")]);
    await phone.waitForSelector(tabs, { visible: true });
  });
  await step(phone, "menu : barre d'onglets, filtres et panier vide", async () => {
    await audit(phone, "menu de la table, téléphone");
    await noOverflow("menu");
    await click(phone, "button", "Filtres");
    await hasText(phone, "Affiner votre recherche");
    await audit(phone, "filtres, téléphone");
    await click(phone, `${DIALOG} label`, "Masquer les plats indisponibles");
    await click(phone, `${DIALOG} button`, "Afficher");
    await hasText(phone, "Filtres (1)");
    await click(phone, tabs, "Panier");
    await hasText(phone, "Tout commence par une envie.");
    await audit(phone, "panier vide, téléphone");
    await noOverflow("panier vide");
  });
  await step(phone, "fiche du plat en deux étapes, puis ajout au panier partagé", async () => {
    await click(phone, tabs, "Menu");
    await click(phone, "h3 button", "Pizza della casa");
    await hasText(phone, "Préparation indicative");
    await audit(phone, "fiche du plat, téléphone");
    await click(phone, `${DIALOG} button`, "Personnaliser");
    await hasText(phone, "À votre goût");
    await audit(phone, "personnalisation, téléphone");
    await click(phone, `${DIALOG} label`, "Mozzarella");
    await fill(phone, "#preference", "Basilic à part");
    await click(phone, `${DIALOG} button`, "Ajouter au panier partagé");
    await toast(phone, "Pizza della casa ajouté au panier de la table.");
    await hasText(phone, "Voir le panier");
  });
  await step(phone, "panier, confirmation et écran « C'est envoyé »", async () => {
    await click(phone, "a", "Voir le panier");
    await hasText(phone, "À commander (1)");
    await hasText(phone, "« Basilic à part »");
    await audit(phone, "panier, téléphone");
    await noOverflow("panier");
    await click(phone, "button", "Commander maintenant");
    await hasText(phone, "On envoie en cuisine ?");
    await click(phone, `${DIALOG} button`, "Confirmer la commande");
    await hasText(phone, "C'est envoyé !");
    await audit(phone, "commande envoyée, téléphone");
    await click(phone, `${DIALOG} a`, "Suivre la commande");
    await phone.waitForFunction(() => /\/commandes\/cmd_/.test(location.pathname), { timeout: T });
    await hasText(phone, "Commande envoyée · modification indisponible.");
    await audit(phone, "suivi d'une commande, téléphone");
    await noOverflow("suivi");
  });
  await step(phone, "commandes, service et addition", async () => {
    await click(phone, tabs, "Commandes");
    await hasText(phone, "Total commandé");
    await audit(phone, "commandes, téléphone");
    await noOverflow("commandes");
    await click(phone, tabs, "Service");
    await hasText(phone, "Notre équipe est là pour vous.");
    await click(phone, "li button", "Demander");
    await toast(phone, "Demande transmise à notre équipe.");
    await hasText(phone, "En attente de prise en charge");
    await audit(phone, "service, téléphone");
    await noOverflow("service");
    await click(phone, "a", "Demander l'addition");
    await hasText(phone, "Total confirmé");
    await audit(phone, "addition, téléphone");
    await noOverflow("addition");
  });
  await step(phone, "coupure du réseau pendant l'envoi : aucune commande en double", async () => {
    await go(phone, base());
    await phone.$eval('button[aria-label="Ajouter Tiramisu maison au panier"]', (e) => (e as HTMLElement).click());
    await toast(phone, "Tiramisu maison ajouté au panier de la table.");
    await go(phone, `${base()}/panier`);
    await click(phone, "button", "Commander maintenant");
    await hasText(phone, "On envoie en cuisine ?");
    await phone.setOfflineMode(true);
    await click(phone, `${DIALOG} button`, "Confirmer la commande");
    await hasText(phone, "On rétablit la connexion");
    await hasText(phone, "Envoi à vérifier");
    await phone.setOfflineMode(false);
    await click(phone, `${DIALOG} button`, "Réessayer la connexion");
    await hasText(phone, "C'est envoyé !");
    const orders = await phone.evaluate(async () => ((await (await fetch("/api/table/etat")).json()) as { data: { commandes: unknown[] } }).data.commandes.length);
    assert(orders === 2, `${orders} commandes au lieu de 2`);
  });
  await phone.setOfflineMode(false).catch(() => undefined);
  await step(phone, "aucun débordement sur petit téléphone et tablette", async () => {
    const bad: string[] = [];
    for (const width of [360, 768]) {
      await phone.setViewport({ width, height: 800, isMobile: true, hasTouch: true });
      for (const p of ["", "/panier", "/commandes", "/service", "/addition", "/direct"]) {
        await go(phone, `${base()}${p}`);
        const over = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (over > 1) bad.push(`${p || "/"} à ${width}px (${over}px)`);
      }
    }
    assert(bad.length === 0, bad.join(" ; "));
    await phone.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  });
  await step(admin, "session clôturée : écran « Merci pour ce moment » sur le téléphone", async () => {
    await admin.bringToFront();
    await go(admin, "/admin/qr");
    await click(admin, "button", "Sessions");
    await click(admin, "button", "Fermer", { exact: true });
    await click(admin, "button", "Fermer la session", { root: DIALOG });
    await toast(admin, "Session fermée, accès révoqués.");
    await phone.bringToFront();
    await go(phone, `${base()}/commandes`);
    await hasText(phone, "Merci pour ce moment.");
    assert(!(await phone.content()).includes("Commande 01"), "une commande reste visible après la clôture");
    await audit(phone, "session terminée, téléphone");
    await noOverflow("session terminée");
  });
  await phone.close();
}

/* ----------------------------------------------- parcours de l'espace serveur */

async function serverJourney(admin: Page, browser: Browser): Promise<void> {
  section("Espace serveur : servir, répondre aux demandes, remettre l'addition");
  axeSource ||= fs.readFileSync(path.join(ROOT, "node_modules/axe-core/axe.min.js"), "utf8");
  const stamp = String(Date.now()).slice(-5);
  const teo = `teo.${stamp}@example.test`;
  const salle = await newPage(await browser.createBrowserContext(), "serveur");
  const client = await newPage(await browser.createBrowserContext(), "convive salle");
  let tableId = "";
  let tableNom = "";
  let code = "";
  let lien = "";

  await step(admin, "une table ouvre une session et un convive envoie une commande", async () => {
    await admin.bringToFront();
    await openAllDay(admin);
    await go(admin, "/admin/qr");
    tableId = /\/table\/(tbl_[a-f0-9]+)/.exec(await admin.content())?.[1] ?? "";
    assert(tableId, "identifiant de table introuvable");
    await click(admin, "button", "Sessions");
    await click(admin, "button", "Ouvrir une session");
    await toast(admin, "Session ouverte pour");
    await admin.waitForFunction(() => [...document.querySelectorAll("td span")].some((s) => /^\d{4}$/.test((s.textContent ?? "").trim())));
    code = await admin.evaluate(() => ([...document.querySelectorAll("td span")].find((s) => /^\d{4}$/.test((s.textContent ?? "").trim()))?.textContent ?? "").trim());

    await client.bringToFront();
    await go(client, `/table/${tableId}`);
    await client.type('input[aria-label="Chiffre 1 du code"]', code);
    await fill(client, "#pseudo", "Chloé");
    await Promise.all([client.waitForNavigation({ waitUntil: "networkidle2" }), click(client, "button", "Rejoindre la table")]);
    await client.$eval('button[aria-label="Ajouter Pizza della casa au panier"]', (e) => (e as HTMLElement).click());
    await toast(client, "Pizza della casa ajouté au panier de la table.");
    await go(client, `/table/${tableId}/panier`);
    await click(client, "button", "Commander maintenant");
    await click(client, `${DIALOG} button`, "Confirmer la commande");
    await hasText(client, "C'est envoyé !");
  });

  await step(admin, "la cuisine signale la commande prête", async () => {
    await admin.bringToFront();
    await go(admin, "/admin/service");
    await click(admin, "button", 'Passer à « En préparation »');
    await toast(admin, "En préparation.");
    await click(admin, "button", 'Passer à « Prête »');
    await toast(admin, "Prête.");
  });

  await step(admin, "mes tables : priorités, pastilles et accès au détail", async () => {
    await go(admin, "/salle");
    await hasText(admin, "Vos tables, en un coup d'œil.");
    await hasText(admin, "Commande prête");
    await hasText(admin, "Servir la commande 01.");
    const badge = await admin.$eval('nav[aria-label="Espace serveur"] a[href="/salle/servir"]', (a) => (a.textContent ?? "").replace(/\s+/g, " ").trim());
    assert(badge.includes("1"), `pastille « à servir » inattendue : ${badge}`);
    await audit(admin, "espace serveur, mes tables");
    await click(admin, "a", "Voir la table");
    await hasText(admin, "Commandes de la table");
    tableNom = await admin.$eval("h1", (e) => (e.textContent ?? "").trim());
    assert(/^Table/.test(tableNom), `nom de table inattendu : ${tableNom}`);
    await hasText(admin, "Prête à servir");
    await audit(admin, "espace serveur, détail d'une table");
  });

  await step(admin, "à servir : la commande prête est listée puis marquée servie", async () => {
    await go(admin, "/salle/servir");
    await hasText(admin, "C'est prêt, à vous de servir.");
    await audit(admin, "espace serveur, à servir");
    await click(admin, "a", "Voir et servir");
    await hasText(admin, "Confirmez le service après avoir apporté tous les articles de cette commande à la table.");
    await audit(admin, "espace serveur, commande à servir");
    await click(admin, "button", "Marquer la commande servie");
    await toast(admin, "marquée servie.");
    await hasText(admin, "Cette commande est déjà marquée servie.");
    await go(admin, "/salle/servir");
    await hasText(admin, "Rien à servir pour le moment.");
  });

  await step(client, "le convive voit sa commande servie et appelle l'équipe", async () => {
    await client.bringToFront();
    await go(client, `/table/${tableId}/service`);
    await click(client, "li button", "Demander");
    await toast(client, "Demande transmise à notre équipe.");
    await hasText(client, "En attente de prise en charge");
  });

  await step(admin, "demandes clients : prise en charge, puis demande traitée", async () => {
    await admin.bringToFront();
    await go(admin, "/salle/demandes");
    await hasText(admin, "Un coup de main, au bon moment.");
    await audit(admin, "espace serveur, demandes clients");
    await click(admin, "button", "Prendre en charge");
    await toast(admin, "Demande prise en charge.");
    await client.bringToFront();
    await client.reload({ waitUntil: "networkidle2" });
    await hasText(client, "Prise en charge : notre équipe arrive");
    await admin.bringToFront();
    // La demande a quitté « À traiter » pour « En cours » : c'est là qu'on la retrouve.
    await hasText(admin, "Aucune demande en attente.");
    await click(admin, "button", "En cours");
    await click(admin, "a", "Voir le détail");
    await hasText(admin, "Prise en charge par vous.");
    await audit(admin, "espace serveur, détail d'une demande");
    await click(admin, "button", "Marquer la demande traitée");
    await toast(admin, "Demande marquée traitée.");
    await go(admin, "/salle/demandes");
    await hasText(admin, "Aucune demande en attente.");
  });

  await step(client, "le convive demande l'addition", async () => {
    await client.bringToFront();
    await go(client, `/table/${tableId}/addition`);
    await click(client, "button", "Demander l'addition");
    await toast(client, "Demande transmise");
  });

  await step(admin, "additions : total exact, remise confirmée en deux temps", async () => {
    await admin.bringToFront();
    await go(admin, "/salle/additions");
    await hasText(admin, "Consultez et suivez les additions de vos tables.");
    await hasText(admin, tableNom);
    await audit(admin, "espace serveur, additions");
    assert(await admin.evaluate(() => document.body.innerText.includes("€")), "aucun montant affiché dans la liste des additions");
    await click(admin, "a", "Voir l'addition de la");
    await hasText(admin, "Addition demandée");
    await hasText(admin, "Total de l'addition");
    await hasText(admin, "La remise de l'addition ne confirme pas un paiement.");
    await audit(admin, "espace serveur, détail d'une addition");
    await click(admin, "button", "Marquer l'addition remise");
    await hasText(admin, "L'addition a été remise ?");
    await hasText(admin, "Cette action indique uniquement la remise de l'addition.");
    await audit(admin, "espace serveur, confirmation de remise");
    await click(admin, `${DIALOG} button`, "Confirmer la remise");
    await toast(admin, "marquée remise.");
    await hasText(admin, "Addition remise");
    await go(admin, "/salle/additions");
    await hasText(admin, "Aucune addition à remettre.");
    await click(admin, "button", "Remises");
    await hasText(admin, tableNom);
  });

  await step(admin, "clôture de la session : l'addition passe en clôturée et se fige", async () => {
    await go(admin, "/admin/qr");
    await click(admin, "button", "Sessions");
    await click(admin, "button", "Fermer", { exact: true });
    await click(admin, "button", "Fermer la session", { root: DIALOG });
    await toast(admin, "Session fermée, accès révoqués.");
    await go(admin, "/salle/additions");
    await click(admin, "button", "Clôturées");
    await hasText(admin, tableNom);
  });

  await step(salle, "un serveur arrive sur son espace, jamais dans l'administration", async () => {
    await admin.bringToFront();
    // Le parcours d'administration a pu ouvrir /admin au rôle Serveur : on rétablit ses droits d'origine.
    await go(admin, "/admin/roles");
    await admin.select(`select[aria-label="Accéder à l'administration pour Serveur"]`, "");
    if (await clickIfEnabled(admin, "button", "Enregistrer")) await toast(admin, "Permissions enregistrées.");
    await go(admin, "/admin/utilisateurs/inviter");
    await fill(admin, "#prenom", "Téo");
    await fill(admin, "#nom", "Marchand");
    await fill(admin, "#email", teo);
    await admin.select("#role", "role_serveur");
    await click(admin, "button", "Créer l'invitation");
    await toast(admin, "Invitation créée.");
    lien = await value(admin, 'input[aria-label="Lien d\'invitation"]');

    await salle.bringToFront();
    await salle.goto(lien, { waitUntil: "networkidle2" });
    await fill(salle, "#mdp", "Teo-Motdepasse-2026");
    await fill(salle, "#mdp2", "Teo-Motdepasse-2026");
    await click(salle, "button", "Accepter l'invitation");
    await hasText(salle, "Votre compte est activé.");
    await login(salle, teo, "Teo-Motdepasse-2026");
    assert(salle.url().endsWith("/salle"), `URL inattendue après connexion : ${salle.url()}`);
    await hasText(salle, "Vos tables, en un coup d'œil.");
    await go(salle, "/admin");
    assert(salle.url().endsWith("/admin/acces-refuse"), `URL inattendue : ${salle.url()}`);
    await hasText(salle, "Aller à mon espace serveur");
  });

  await step(salle, "la portée du rôle tient : aucune table affectée, aucun accès par l'URL", async () => {
    await go(salle, "/salle");
    await hasText(salle, "Aucune table ne vous est affectée.");
    await audit(salle, "espace serveur, aucune table affectée");
    const direct = await salle.goto(`${BASE}/salle/tables/${tableId}`, { waitUntil: "networkidle2" });
    assert(direct?.status() === 404, `une table hors service répond ${direct?.status()}`);
    await hasText(salle, "Cette page n'existe pas.");
    await go(salle, "/salle/additions");
    await hasText(salle, "Aucune addition à remettre.");
    await go(salle, "/responsable");
    assert(salle.url().endsWith("/admin/acces-refuse"), `un serveur entre dans l'espace responsable : ${salle.url()}`);
  });

  await step(salle, "aucun débordement de l'espace serveur sur téléphone et tablette", async () => {
    const bad: string[] = [];
    for (const width of [360, 768, 1280]) {
      await salle.setViewport({ width, height: 860, isMobile: width < 1024, hasTouch: width < 1024 });
      for (const p of ["/salle", "/salle/servir", "/salle/demandes", "/salle/additions"]) {
        await go(salle, p);
        const over = await salle.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (over > 1) bad.push(`${p} à ${width}px (${over}px)`);
      }
      if (width === 360) {
        const tabs = await salle.$$eval('nav[aria-label="Espace serveur"] a', (as) => as.map((a) => (a.textContent ?? "").trim()));
        assert(tabs.length >= 4, `barre d'onglets incomplète : ${tabs.join(", ")}`);
        await audit(salle, "espace serveur, téléphone");
      }
    }
    assert(bad.length === 0, bad.join(" ; "));
  });

  await salle.close();
  await client.close();
  await admin.bringToFront();
}

/* ------------------------------------ parcours de l'espace responsable */

async function chefJourney(admin: Page, browser: Browser): Promise<void> {
  section("Espace responsable : coordonner la salle, affecter, clôturer");
  axeSource ||= fs.readFileSync(path.join(ROOT, "node_modules/axe-core/axe.min.js"), "utf8");
  const client = await newPage(await browser.createBrowserContext(), "convive salle 2");
  let tableId = "";
  let code = "";
  const optionValue = async (page: Page, selector: string, texte: string) =>
    page.$eval(selector, (e, t: string) => [...(e as HTMLSelectElement).options].find((o) => (o.textContent ?? "").includes(t))?.value ?? "", texte);

  await step(admin, "sessions de table : le responsable ouvre une table et relève son code", async () => {
    await admin.bringToFront();
    await openAllDay(admin);
    await go(admin, "/admin/qr");
    tableId = /\/table\/(tbl_[a-f0-9]+)/.exec(await admin.content())?.[1] ?? "";
    assert(tableId, "identifiant de table introuvable");
    await go(admin, `/responsable/sessions?vue=disponibles&table=${tableId}`);
    await hasText(admin, "Une table, une session bien définie.");
    await audit(admin, "espace responsable, sessions de table");
    await click(admin, "button", "Ouvrir une session");
    await toast(admin, "Session ouverte pour");
    await admin.waitForSelector('[aria-label^="Code de session"]', { visible: true });
    code = await admin.$eval('[aria-label^="Code de session"]', (e) => (e.getAttribute("aria-label") ?? "").replace(/[^0-9]/g, ""));
    assert(/^\d{4}$/.test(code), `code de session illisible : ${code}`);
  });

  await step(client, "un convive rejoint la table et envoie une commande", async () => {
    await client.bringToFront();
    await go(client, `/table/${tableId}`);
    await client.type('input[aria-label="Chiffre 1 du code"]', code);
    await fill(client, "#pseudo", "Noé");
    await Promise.all([client.waitForNavigation({ waitUntil: "networkidle2" }), click(client, "button", "Rejoindre la table")]);
    await client.$eval('button[aria-label="Ajouter Pizza della casa au panier"]', (e) => (e as HTMLElement).click());
    await toast(client, "Pizza della casa ajouté au panier de la table.");
    await go(client, `/table/${tableId}/panier`);
    await click(client, "button", "Commander maintenant");
    await click(client, `${DIALOG} button`, "Confirmer la commande");
    await hasText(client, "C'est envoyé !");
  });

  await step(admin, "la cuisine signale la commande prête", async () => {
    await admin.bringToFront();
    await go(admin, "/admin/service");
    await click(admin, "button", 'Passer à « En préparation »');
    await toast(admin, "En préparation.");
    await click(admin, "button", 'Passer à « Prête »');
    await toast(admin, "Prête.");
  });

  await step(admin, "vue d'ensemble : compteurs, plan de salle et priorités", async () => {
    await go(admin, "/responsable");
    await hasText(admin, "Le service, sous votre regard.");
    await hasText(admin, "Tables occupées");
    await hasText(admin, "Commande prête");
    await hasText(admin, "Équipe en service");
    const occupees = await admin.evaluate(() => (/Tables occupées\s*(\d+)/.exec(document.body.innerText) ?? [])[1] ?? "");
    assert(occupees === "1", `tables occupées : ${occupees} au lieu de 1`);
    await audit(admin, "espace responsable, vue d'ensemble");
  });

  await step(admin, "plan de salle : la table se sélectionne et change de serveur", async () => {
    await go(admin, `/responsable/plan?table=${tableId}`);
    await hasText(admin, "Chaque table, à la bonne place.");
    await hasText(admin, "Dernières actions");
    await audit(admin, "espace responsable, plan de salle");
    await click(admin, "button", "Changer le serveur");
    await hasText(admin, "Les commandes et demandes ouvertes resteront rattachées à cette table.");
    await audit(admin, "espace responsable, transfert de table");
    // La table est déjà confiée à Hugo dans les données de démonstration : on la passe à Sarah.
    await admin.select("#transfert-serveur", await optionValue(admin, "#transfert-serveur", "Sarah"));
    await click(admin, `${DIALOG} button`, "Confirmer le transfert");
    await toast(admin, "confiée à Sarah.");
    await hasText(admin, "Serveur : Sarah");
    await hasText(admin, "Table confiée à Sarah");
  });

  await step(admin, "équipe & affectations : la charge suit le transfert", async () => {
    await go(admin, "/responsable/equipe");
    await hasText(admin, "Une équipe, un service fluide.");
    await hasText(admin, "Répartition des tables");
    await hasText(admin, "Commandes prêtes à servir");
    const fiche = await admin.evaluate(() => {
      const bloc = [...document.querySelectorAll("li")].find((l) => (l.textContent ?? "").includes("Sarah") && (l.textContent ?? "").includes("table"));
      return (bloc?.textContent ?? "").replace(/\s+/g, " ");
    });
    assert(fiche.includes("En service"), `Sarah n'est pas en service : ${fiche.slice(0, 80)}`);
    await audit(admin, "espace responsable, équipe et affectations");
  });

  await step(admin, "suivi du service : filtre par serveur", async () => {
    await go(admin, "/responsable/service");
    await hasText(admin, "Le bon plat, au bon moment.");
    await hasText(admin, "Prête à servir");
    await audit(admin, "espace responsable, suivi du service");
    const autre = await optionValue(admin, 'select[aria-label="Filtrer par serveur"]', "Hugo");
    await admin.select('select[aria-label="Filtrer par serveur"]', autre);
    await hasText(admin, "Aucune commande ne correspond à ces filtres.");
    await admin.select('select[aria-label="Filtrer par serveur"]', "");
    await hasText(admin, "Prête à servir");
  });

  await step(client, "le convive appelle l'équipe, le responsable attribue la demande", async () => {
    await client.bringToFront();
    await go(client, `/table/${tableId}/service`);
    await click(client, "li button", "Demander");
    await toast(client, "Demande transmise à notre équipe.");

    await admin.bringToFront();
    await go(admin, "/responsable/demandes");
    await hasText(admin, "Chaque demande trouve son relais.");
    await hasText(admin, "Une seule prise en charge");
    await audit(admin, "espace responsable, demandes clients");
    await admin.waitForSelector('select[id^="attrib-"]', { visible: true });
    await admin.select('select[id^="attrib-"]', await optionValue(admin, 'select[id^="attrib-"]', "Hugo"));
    await click(admin, "button", "Attribuer");
    await toast(admin, "Demande confiée à Hugo.");
    await click(admin, "button", "En cours (1)");
    await hasText(admin, "Prise en charge par Hugo");

    await client.bringToFront();
    await client.reload({ waitUntil: "networkidle2" });
    await hasText(client, "Prise en charge : notre équipe arrive");
  });

  await step(admin, "clôture : la liste de contrôle refuse de masquer une commande non servie", async () => {
    await admin.bringToFront();
    await go(admin, `/responsable/sessions?vue=actives&table=${tableId}`);
    await hasText(admin, "Code de la session");
    await click(admin, "button", "Changer le code");
    await toast(admin, "Nouveau code pour la");
    await click(admin, "button", "Fermer la session");
    await hasText(admin, "Une commande n'est pas encore servie");
    await hasText(admin, "Addition pas encore remise");
    await hasText(admin, "Le règlement se fait à la caisse, en dehors de l'application.");
    await audit(admin, "espace responsable, fermeture de session");
    await click(admin, `${DIALOG} button`, "Garder la session ouverte");
  });

  await step(admin, "une fois la commande servie, la session se ferme et la table se libère", async () => {
    await go(admin, "/salle/servir");
    await click(admin, "a", "Voir et servir");
    await click(admin, "button", "Marquer la commande servie");
    await toast(admin, "marquée servie.");
    await go(admin, `/responsable/sessions?vue=actives&table=${tableId}`);
    await click(admin, "button", "Fermer la session");
    await hasText(admin, "Toutes les commandes sont servies");
    await click(admin, `${DIALOG} button`, "Confirmer la fermeture");
    await toast(admin, "fermée, accès révoqués.");
    await go(admin, "/responsable/sessions?vue=actives");
    await hasText(admin, "Aucune session ouverte.");
    await go(admin, "/responsable");
    const occupees = await admin.evaluate(() => (/Tables occupées\s*(\d+)/.exec(document.body.innerText) ?? [])[1] ?? "");
    assert(occupees === "0", `tables occupées après clôture : ${occupees}`);
  });

  await step(admin, "aucun débordement de l'espace responsable, du téléphone au grand écran", async () => {
    const bad: string[] = [];
    for (const width of [360, 768, 1280]) {
      await admin.setViewport({ width, height: 900, isMobile: width < 1024, hasTouch: width < 1024 });
      for (const p of ["/responsable", "/responsable/plan", "/responsable/equipe", "/responsable/service", "/responsable/demandes", "/responsable/sessions"]) {
        await go(admin, p);
        const over = await admin.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (over > 1) bad.push(`${p} à ${width}px (${over}px)`);
      }
      if (width === 360) await audit(admin, "espace responsable, téléphone");
    }
    assert(bad.length === 0, bad.join(" ; "));
    await admin.setViewport({ width: 1440, height: 950 });
  });

  await client.close();
  await admin.bringToFront();
}

/* --------------------------------------------------- accessibilité */

declare const axe: { run: (context: Document, options: unknown) => Promise<{ violations: { id: string; impact: string; help: string; nodes: { target: string[]; failureSummary?: string }[] }[] }> };
let axeSource = "";
let audited = 0;

async function audit(page: Page, name: string): Promise<void> {
  await sleep(600);
  await page.evaluate(axeSource);
  const violations = (await page.evaluate(() => axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }))).violations;
  audited++;
  if (violations.length === 0) {
    passed++;
    return;
  }
  for (const v of violations) {
    failures.push(`accessibilité, ${name} : [${v.impact}] ${v.id} (${v.nodes.length}) ${v.help}`);
    console.log(`  ✘ ${name} : [${v.impact}] ${v.id} : ${v.help}`);
    for (const n of v.nodes.slice(0, 3)) console.log(`       ${n.target.join(" ")}  ${(n.failureSummary ?? "").split("\n").slice(1, 2).join(" ").trim().slice(0, 160)}`);
  }
}

async function accessibility(admin: Page, visitor: Page, context: BrowserContext): Promise<void> {
  section("Accessibilité (axe-core, WCAG 2.1 A et AA)");
  axeSource = fs.readFileSync(path.join(ROOT, "node_modules/axe-core/axe.min.js"), "utf8");
  await admin.bringToFront();
  for (const p of PAGES) {
    await go(admin, `/${p}`);
    await audit(admin, `/${p}`);
  }

  // États ouverts : panneaux, menus et fenêtres modales.
  const open = async (name: string, url: string, action: () => Promise<void>) => {
    try {
      await go(admin, url);
      await action();
      await audit(admin, name);
    } catch (e) {
      failures.push(`accessibilité, ${name} : état non atteint (${String((e as Error).message).split("\n")[0]})`);
      console.log(`  ✘ ${name} : état non atteint`);
    }
  };
  await open("catégories, panneau d'édition", "/admin/categories", async () => {
    await click(admin, "button", "Ajouter une catégorie");
    await admin.waitForSelector("#cat-nom");
  });
  await open("produits, menu d'actions ouvert", "/admin/produits", async () => {
    await admin.click("tbody tr:nth-child(2) td:last-child button[aria-haspopup]");
    await admin.waitForSelector('[role="menu"]');
  });
  await open("fiche d'un produit existant, sélecteur d'image ouvert", "/admin/produits", async () => {
    const href = await admin.$eval('tbody a[href^="/admin/produits/prd_"]', (a) => a.getAttribute("href"));
    await go(admin, href ?? "/admin/produits");
    await click(admin, "button", "Remplacer");
    await admin.waitForSelector(DIALOG, { visible: true });
  });
  await open("médiathèque, détail et recadrage", "/admin/medias", async () => {
    await admin.click("ul li:first-child button[aria-pressed]");
    await admin.waitForSelector("#m-alt");
    await click(admin, "button", "Recadrer");
    await admin.waitForSelector(DIALOG, { visible: true });
  });
  await open("tables, formulaire ouvert", "/admin/tables", async () => {
    await click(admin, "button", "Ajouter une table");
    await admin.waitForSelector("#t-nom");
  });
  await open("utilisateurs, fenêtre de modification", "/admin/utilisateurs", async () => {
    await admin.click("tbody tr:nth-child(2) td:last-child button");
    await admin.waitForSelector('[role="menu"]');
    await click(admin, '[role="menuitem"]', "Modifier");
    await admin.waitForSelector("#u-prenom");
  });
  await open("plan de salle, élément sélectionné", "/admin/plan", async () => {
    await admin.click('[role="application"] > button');
    await admin.waitForSelector("#p-x");
  });
  await open("QR, onglet sessions", "/admin/qr", async () => click(admin, "button", "Sessions"));
  await open("supports QR à imprimer", "/admin/qr/imprimer?table=toutes", async () => undefined);
  await open("données, onglet sauvegardes", "/admin/donnees", async () => click(admin, "button", "Sauvegardes"));
  await open("horaires, fenêtre de fermeture", "/admin/horaires", async () => {
    await click(admin, "button", "Ajouter une date");
    await admin.waitForSelector("#exc-date");
  });
  await open("changement de mot de passe", "/admin", async () => {
    await click(admin, "header button", ADMIN.name);
    await click(admin, '[role="menuitem"]', "Changer mon mot de passe");
    await admin.waitForSelector("#mdp-actuel");
  });

  await visitor.bringToFront();
  await visitor.setViewport({ width: 1440, height: 950 });
  await go(visitor, "/");
  await click(visitor, "li button", "Pizza della casa");
  await visitor.waitForSelector(DIALOG, { visible: true });
  await audit(visitor, "menu public, fiche produit ouverte");
  await go(visitor, "/admin/login");
  await audit(visitor, "connexion");
  await go(visitor, "/admin/invitation/jeton-invalide-jeton-invalide-0000");
  await audit(visitor, "invitation, lien invalide");
  await go(visitor, "/page-inexistante");
  await audit(visitor, "page introuvable");
  await visitor.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await go(visitor, "/");
  await audit(visitor, "menu public, mobile");

  const mobile = await newPage(context, "mobile", true);
  await mobile.bringToFront();
  for (const p of ["admin", "admin/produits", "admin/roles"]) {
    await go(mobile, `/${p}`);
    await audit(mobile, `/${p}, mobile`);
  }
  await go(mobile, "/admin");
  await mobile.click('button[aria-label="Ouvrir le menu"]');
  await mobile.waitForSelector(`${DIALOG} nav a`, { visible: true });
  await audit(mobile, "menu latéral, mobile");
  await mobile.close();
  console.log(`  ${audited} page(s) et état(s) audités.`);
}

/* ------------------------------------------------------ 3. traduction */

async function translation(admin: Page): Promise<void> {
  section("Traduction de l'interface en anglais");
  await admin.bringToFront();
  const missing = new Map<string, string>();
  await step(admin, "le sélecteur FR / EN traduit la page affichée, puis la rétablit", async () => {
    await go(admin, "/admin/produits");
    await click(admin, "header button", "en", { exact: true });
    await hasText(admin, "Product catalogue");
    assert((await admin.evaluate(() => document.documentElement.lang)) === "en", "attribut lang non mis à jour");
    assert((await admin.$eval('input[type="search"]', (e) => e.getAttribute("placeholder") ?? "")).startsWith("Search"), "placeholder non traduit");
    await click(admin, "header button", "fr", { exact: true });
    await hasText(admin, "Catalogue des produits");
    assert(!(await admin.evaluate(() => document.body.innerText.includes("Product catalogue"))), "texte anglais resté affiché");
  });
  await step(admin, "le choix est conservé d'une page à l'autre, notifications comprises", async () => {
    await click(admin, "header button", "en", { exact: true });
    await go(admin, "/admin/etablissement");
    await hasText(admin, "Restaurant information.");
    await fill(admin, "#sousTitre", "Cuisine de saison, toujours");
    await click(admin, "button", "Save");
    await toast(admin, "Restaurant information saved.");
    await click(admin, 'nav[aria-label="Administration"] a', "Opening hours");
    await hasText(admin, "The right menu, at the right time.");
  });
  await step(admin, "tous les écrans s'affichent en anglais, sans libellé courant resté en français", async () => {
    await admin.evaluateOnNewDocument("globalThis.__olivaMissing = new Set()");
    const forgotten: string[] = [];
    for (const p of PAGES) {
      await go(admin, `/${p}`);
      await sleep(700);
      const left = await admin.evaluate(() => (document.body.innerText.match(/Enregistrer|Ajouter|Supprimer|Modifier|Annuler|Rechercher|Paramètres|Aucune? /g) ?? []).slice(0, 3));
      if (left.length > 0) forgotten.push(`/${p} (${left.join(", ")})`);
      for (const m of await admin.evaluate(() => [...((globalThis as { __olivaMissing?: Set<string> }).__olivaMissing ?? [])])) if (!missing.has(m)) missing.set(m, `/${p}`);
    }
    // Restent en français, et c'est attendu : les contenus saisis par le restaurant (noms, descriptions, adresses).
    const french = /(^|\s)(le|la|les|des|du|une|un|est|sont|pas|pour|avec|vos|votre|cette|aucun|aucune)(\s|$)|[éèêàùç]/i;
    const suspects = [...missing].filter(([m]) => french.test(m));
    fs.writeFileSync(path.join(DIR, "non-traduits.txt"), [...missing].map(([m, p]) => `${french.test(m) ? "?" : " "} ${p}\t${m}`).join("\n"));
    if (process.env.OLIVA_I18N_REPORT) fs.copyFileSync(path.join(DIR, "non-traduits.txt"), process.env.OLIVA_I18N_REPORT);
    assert(forgotten.length === 0, `libellés français restants : ${forgotten.join(" ; ")}`);
    console.log(`    ${missing.size} texte(s) laissé(s) tels quels, dont ${suspects.length} d'allure française (contenus saisis par le restaurant).`);
  });
  await step(admin, "retour au français", async () => {
    await go(admin, "/admin");
    await click(admin, "header button", "fr", { exact: true });
    await hasText(admin, "Votre restaurant, à votre image.");
  });
}

/* ---------------------------------------------------- 4. débordements */

async function overflow(admin: Page): Promise<void> {
  section("Débordements horizontaux");
  await admin.bringToFront();
  for (const width of [360, 390, 768, 1024, 1280]) {
    await admin.setViewport({ width, height: 800, isMobile: width < 700, hasTouch: width < 700 });
    const bad: string[] = [];
    for (const p of PAGES) {
      await go(admin, `/${p}`);
      const r = await admin.evaluate(() => {
        const rect = document.querySelector('header button[aria-label*="menu du compte"]')?.getBoundingClientRect();
        return { over: document.documentElement.scrollWidth - window.innerWidth, account: rect ? rect.right <= window.innerWidth + 1 && rect.width > 0 : null };
      });
      if (r.over > 1 || r.account === false) bad.push(`/${p} (${r.over}px${r.account === false ? ", menu du compte hors écran" : ""})`);
    }
    if (bad.length === 0) {
      passed++;
      console.log(`  ✔ largeur ${width}px : aucun débordement sur ${PAGES.length} pages`);
    } else {
      failures.push(`débordement à ${width}px : ${bad.join(" ; ")}`);
      console.log(`  ✘ largeur ${width}px : ${bad.join(" ; ")}`);
    }
  }
  await admin.setViewport({ width: 1440, height: 950 });
}

/* ---------------------------------------------------------------- main */

async function main(): Promise<void> {
  const chrome = findChrome();
  if (!chrome) throw new Error("Chrome est introuvable. Installez-le ou indiquez son chemin avec la variable CHROME_PATH.");
  if (!fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"))) throw new Error("Build de production absent : lancez d'abord `npm run build`.");

  fs.mkdirSync(DIR, { recursive: true });
  console.log(script("scripts/admin-init.ts").split("\n")[0]);
  console.log(script("scripts/demo-seed.ts").split("\n")[0]);
  const server = await startServer();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox", "--hide-scrollbars"] });
  try {
    const context = browser.defaultBrowserContext();
    const admin = await newPage(context, "admin");
    const staff = await newPage(await browser.createBrowserContext(), "membre");
    const visitor = await newPage(await browser.createBrowserContext(), "public");
    await admin.bringToFront();
    if (process.env.OLIVA_UI_ONLY === "traduction") {
      // Passe rapide pour mettre à jour le dictionnaire : OLIVA_UI_ONLY=traduction OLIVA_I18N_REPORT=fichier.txt
      await login(admin, ADMIN.email, password);
      await translation(admin);
    } else if (process.env.OLIVA_UI_ONLY === "debordements") {
      await login(admin, ADMIN.email, password);
      await overflow(admin);
    } else if (process.env.OLIVA_UI_ONLY === "client") {
      await login(admin, ADMIN.email, password);
      await guestJourney(admin, browser);
      await mobileJourney(admin, browser);
    } else if (process.env.OLIVA_UI_ONLY === "serveur") {
      await login(admin, ADMIN.email, password);
      await serverJourney(admin, browser);
    } else if (process.env.OLIVA_UI_ONLY === "responsable") {
      await login(admin, ADMIN.email, password);
      await chefJourney(admin, browser);
    } else {
      await walkthrough(admin, staff, visitor, context);
      await guestJourney(admin, browser);
      await mobileJourney(admin, browser);
      await serverJourney(admin, browser);
      await chefJourney(admin, browser);
      await accessibility(admin, visitor, context);
      await translation(admin);
      await overflow(admin);
    }
  } finally {
    await browser.close().catch(() => undefined);
    await new Promise<void>((resolve) => {
      server.once("exit", () => resolve());
      server.kill();
    });
  }

  console.log(`\n${passed} contrôle(s) réussi(s), ${failures.length} échec(s).`);
  if (noise.size > 0) {
    console.log(`\nMessages inattendus dans la console du navigateur (${noise.size}) :`);
    [...noise].slice(0, 30).forEach((l) => console.log(`  ${l}`));
    failures.push(`${noise.size} message(s) inattendu(s) dans la console`);
  }
  if (failures.length > 0) {
    console.log("\nÉchecs :");
    failures.forEach((f) => console.log(`  - ${f}`));
    console.log(`\nCaptures d'écran des échecs conservées dans ${DIR}`);
    process.exitCode = 1;
  } else {
    fs.rmSync(DIR, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exitCode = 1;
});
