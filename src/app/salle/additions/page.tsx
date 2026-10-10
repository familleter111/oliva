import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireStaffPage } from "@/lib/server/auth/session";
import { billList } from "@/lib/server/services/salle";
import { readDb } from "@/lib/server/storage";
import { BillBoard } from "./board";

export const metadata: Metadata = { title: "Additions" };

export default async function Page() {
  const auth = await requireStaffPage("commandes.servir");
  return (
    <>
      <PageHeader eyebrow="Salle" title="Additions" subtitle="Consultez et suivez les additions de vos tables." />
      <BillBoard additions={billList(await readDb(), auth)} />
    </>
  );
}
