import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";

/** Dépose une arrivée en attente, puis capture les pastilles côté personnel. */
const ROOT = process.cwd();
const DIR = path.join(ROOT, "tests/.tmp", `shot2-${Date.now()}`);
const OUT = process.env.SHOT_OUT!;
const PORT = 3321;
const BASE = `http://localhost:${PORT}`;
const ADMIN = { email: "admin@oliva.test", mdp: "Shot-Motdepasse-2026" };
const ENV = {
  ...process.env,
  NODE_ENV: "production",
  OLIVA_STORAGE_DIR: DIR,
  OLIVA_SECRET: "shot-secret-shot-secret-shot-secret-shot-secret-0123",
  OLIVA_PUBLIC_URL: BASE,
  OLIVA_ADMIN_EMAIL: ADMIN.email,
  OLIVA_ADMIN_PASSWORD: ADMIN.mdp,
  OLIVA_ADMIN_NAME: "Vous Admin",
  OLIVA_COOKIE_SECURE: "false",
  OLIVA_DATABASE_URL: "",
  DATABASE_URL: "",
  POSTGRES_URL: "",
  BLOB_READ_WRITE_TOKEN: "",
} as NodeJS.ProcessEnv;

fs.mkdirSync(DIR, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
for (const s of ["scripts/admin-init.ts", "scripts/demo-seed.ts"]) {
  const r = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", s], { cwd: ROOT, env: ENV, encoding: "utf8" });
  console.log(s, ":", (r.stdout || r.stderr).trim().split("\n")[0]);
  if (r.status !== 0) process.exit(1);
}

const child = spawn(process.execPath, [path.join(ROOT, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT)], { cwd: ROOT, env: ENV, stdio: ["ignore", "pipe", "pipe"] });
let log = "";
child.stdout?.on("data", (d) => (log += d));
child.stderr?.on("data", (d) => (log += d));

const clic = async (page: Page, selecteur: string, texte: string) => {
  const cible = await page.evaluateHandle(
    (sel, t) => [...document.querySelectorAll(sel)].find((e) => (e.textContent ?? "").replace(/\s+/g, " ").includes(t)) ?? null,
    selecteur,
    texte,
  );
  const el = cible.asElement();
  if (!el) throw new Error(`introuvable : ${selecteur} « ${texte} »`);
  await (el as unknown as { click: () => Promise<void> }).click();
};

async function main() {
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      if ((await fetch(`${BASE}/admin/login`)).status === 200) break;
    } catch {
      /* pas encore prêt */
    }
    if (i === 99) throw new Error(`serveur absent\n${log}`);
  }
  const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((c) => fs.existsSync(c))!;
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] });

  // 1. Un client demande une table depuis la carte publique.
  const client = await browser.createBrowserContext();
  const cp = await client.newPage();
  await cp.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await cp.evaluateOnNewDocument("globalThis.__name = (f) => f");
  await cp.goto(`${BASE}/table`, { waitUntil: "networkidle2" });
  const lien = await cp.evaluate(() => document.querySelector<HTMLAnchorElement>('a[href*="/table/tbl"]')?.getAttribute("href") ?? "");
  if (!lien) throw new Error("aucune table proposée");
  await cp.goto(`${BASE}${lien}`, { waitUntil: "networkidle2" });
  await cp.type('input[type="text"]', "Nina");
  await clic(cp, "button", "Demander");
  await cp.waitForFunction(() => /confirmer|envoyée/i.test(document.body.textContent ?? ""), { timeout: 15000 });
  console.log("demande déposée :", (await cp.evaluate(() => document.body.textContent ?? "")).replace(/\s+/g, " ").slice(0, 120));

  // 2. Le personnel regarde son espace.
  const staff = await browser.createBrowserContext();
  const sp = await staff.newPage();
  await sp.evaluateOnNewDocument("globalThis.__name = (f) => f");
  await sp.goto(`${BASE}/admin/login`, { waitUntil: "networkidle2" });
  await sp.type('input[name="identifiant"]', ADMIN.email);
  await sp.type('input[type="password"]', ADMIN.mdp);
  await Promise.all([sp.waitForNavigation({ waitUntil: "networkidle2" }), clic(sp, "button", "Se connecter")]);

  for (const [nom, url, vp] of [
    ["salle-mobile", "/salle", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
    ["salle-bureau", "/salle", { width: 1440, height: 950 }],
    ["responsable-plan", "/responsable/plan", { width: 1440, height: 950 }],
    ["admin-mobile", "/admin", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ] as const) {
    await sp.setViewport(vp);
    await sp.goto(`${BASE}${url}`, { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 500));
    await sp.screenshot({ path: path.join(OUT, `${nom}.png`) as `${string}.png` });
    const debord = await sp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(`${nom} : débordement ${debord}px`);
  }
  await browser.close();
}

main()
  .catch((e) => {
    console.error("ÉCHEC :", String((e as Error).message));
    process.exitCode = 1;
  })
  .finally(() => {
    child.kill();
    fs.rmSync(DIR, { recursive: true, force: true });
  });
