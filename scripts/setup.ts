import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** Crée `.env.local` avec un secret aléatoire. Ne remplace jamais un fichier existant. */
const target = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(target)) {
  console.log(".env.local existe déjà : rien n'a été modifié.");
  process.exit(0);
}
const example = fs.readFileSync(path.resolve(process.cwd(), ".env.example"), "utf8");
const secret = randomBytes(48).toString("base64url");
fs.writeFileSync(target, example.replace(/^OLIVA_SECRET=.*$/m, `OLIVA_SECRET=${secret}`), { flag: "wx" });
console.log(".env.local créé avec un secret aléatoire.");
console.log("Renseignez OLIVA_ADMIN_EMAIL, OLIVA_ADMIN_PASSWORD et OLIVA_ADMIN_NAME, puis lancez : npm run admin:init");
