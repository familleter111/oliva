import type { Metadata } from "next";
import { requirePage } from "@/lib/server/auth/session";
import { listBackups } from "@/lib/server/services/backups";
import { exportCatalog, importCatalog } from "@/lib/server/services/transfer";
import { readDb, storageInfo } from "@/lib/server/storage";
import { DonneesEditor } from "./editor";

export const metadata: Metadata = { title: "Données & sauvegardes" };

export default async function Page() {
  await requirePage("donnees.gerer");
  const db = await readDb();
  return <DonneesEditor imports={importCatalog()} exports={exportCatalog()} sauvegardes={await listBackups()} stockage={await storageInfo()} fuseau={db.Restaurant[0]?.fuseauHoraire || ""} />;
}
