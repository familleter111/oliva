import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireStaffPage } from "@/lib/server/auth/session";
import { requestsBoard } from "@/lib/server/services/responsable";
import { readDb } from "@/lib/server/storage";
import { ChefRequestBoard } from "./board";

export const metadata: Metadata = { title: "Demandes clients" };

export default async function Page() {
  const auth = await requireStaffPage("tables.affecter");
  const db = await readDb();
  return (
    <>
      <PageHeader eyebrow="Gestion des demandes clients" title="Chaque demande trouve son relais." subtitle="Attribuez les demandes et suivez leur prise en charge." />
      <ChefRequestBoard data={requestsBoard(db, auth)} fuseau={db.Restaurant[0]?.fuseauHoraire || "Europe/Paris"} />
    </>
  );
}
