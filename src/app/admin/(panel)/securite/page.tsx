import type { Metadata } from "next";
import { requirePage } from "@/lib/server/auth/session";
import { ID } from "@/lib/server/defaults";
import { fullName, must } from "@/lib/server/db-utils";
import { readDb } from "@/lib/server/storage";
import { SecuriteEditor } from "./editor";

export const metadata: Metadata = { title: "Sécurité & accès" };

function device(ua: string): string {
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Navigateur";
  const os = /Windows/.test(ua) ? "Windows" : /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser}, ${os}` : browser;
}

export default async function Page() {
  const auth = await requirePage("securite.gerer");
  const db = await readDb();
  const s = must(db, "ParametresSecurite", ID.securite);
  const now = Date.now();
  const users = new Map(db.Utilisateurs.map((u) => [u.id, u]));
  const sessions = db.SessionsPersonnel.filter((x) => !x.revoqueeLe && Date.parse(x.expireLe) > now && now - Date.parse(x.vueLe) < s.inactiviteMin * 60 * 1000 + 5 * 60 * 1000)
    .sort((a, b) => b.vueLe.localeCompare(a.vueLe))
    .map((x) => ({ id: x.id, nom: users.get(x.utilisateurId) ? fullName(users.get(x.utilisateurId)!) : "Compte supprimé", appareil: device(x.navigateur), ip: x.ip, vueLe: x.vueLe, courante: x.id === auth.session.id }));
  return (
    <SecuriteEditor
      initial={{ motDePasseMin: s.motDePasseMin, exigerLettreChiffre: s.exigerLettreChiffre, exigerSpecial: s.exigerSpecial, inactiviteMin: s.inactiviteMin, dureeMaxHeures: s.dureeMaxHeures, tentativesMax: s.tentativesMax, verrouillageMin: s.verrouillageMin }}
      sessions={sessions}
    />
  );
}
