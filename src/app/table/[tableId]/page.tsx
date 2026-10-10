import type { Metadata } from "next";
import { MenuPage } from "@/components/table/menu";

export const metadata: Metadata = { title: "Notre menu" };

export default function Page() {
  return <MenuPage />;
}
