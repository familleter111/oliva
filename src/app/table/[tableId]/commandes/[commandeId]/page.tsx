import type { Metadata } from "next";
import { OrderDetailPage } from "@/components/table/views";

export const metadata: Metadata = { title: "Suivi de la commande" };

export default async function Page({ params }: { params: Promise<{ commandeId: string }> }) {
  return <OrderDetailPage commandeId={(await params).commandeId} />;
}
