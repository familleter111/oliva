import type { Metadata } from "next";
import { CartPage } from "@/components/table/menu";

export const metadata: Metadata = { title: "Notre panier" };

export default function Page() {
  return <CartPage />;
}
