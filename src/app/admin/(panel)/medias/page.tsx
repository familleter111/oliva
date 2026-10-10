import type { Metadata } from "next";
import { requirePage } from "@/lib/server/auth/session";
import { usagesOf } from "@/lib/server/db-utils";
import { COL_LABEL } from "@/lib/server/schema";
import { readDb } from "@/lib/server/storage";
import { mediaList } from "@/lib/server/view";
import { MediasEditor } from "./editor";

export const metadata: Metadata = { title: "Médiathèque" };

export default async function Page() {
  await requirePage("carte.modifier");
  const db = await readDb();
  const usages = Object.fromEntries(db.Medias.map((m) => [m.id, usagesOf(db, "Medias", m.id).map((u) => ({ type: u.type, nom: u.nom || u.type, champ: COL_LABEL[u.col] ?? u.col }))]));
  return <MediasEditor medias={mediaList(db)} usages={usages} />;
}
