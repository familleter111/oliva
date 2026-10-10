import type { Metadata } from "next";
import { LivePage } from "@/components/table/views";

export const metadata: Metadata = { title: "La table en direct" };

export default function Page() {
  return <LivePage />;
}
