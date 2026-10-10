import type { Metadata } from "next";
import { ServicePage } from "@/components/table/views";

export const metadata: Metadata = { title: "Un coup de main" };

export default function Page() {
  return <ServicePage />;
}
