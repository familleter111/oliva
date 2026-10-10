import type { Metadata } from "next";
import { BillPage } from "@/components/table/views";

export const metadata: Metadata = { title: "Notre addition" };

export default function Page() {
  return <BillPage />;
}
