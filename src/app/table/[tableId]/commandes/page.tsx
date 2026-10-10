import type { Metadata } from "next";
import { OrdersPage } from "@/components/table/views";

export const metadata: Metadata = { title: "Nos commandes" };

export default function Page() {
  return <OrdersPage />;
}
