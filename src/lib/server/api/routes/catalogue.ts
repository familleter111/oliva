import "server-only";
import fsp from "node:fs/promises";
import { z } from "zod";
import { labelOf, must, removeRow, usagesOf } from "../../db-utils";
import { AppError, conflit, invalide } from "../../errors";
import { allFiles } from "../../services/media-names";
import { readDb, transaction } from "../../storage";
import { MAX_UPLOAD_BYTES, MEDIA_CATEGORIES, MEDIA_NAME, collectGarbage, cropStored, mediaPath, removeStored, storeImage } from "../../services/media";
import { assertBodySize, cents, choix, collection, entier, hex, logUpdate, nom, ref, refs, txt, type Ctx, type Routes } from "../core";

const PERM = "carte.modifier" as const;

async function uploaded(c: Ctx): Promise<{ buffer: Buffer; name: string; form: FormData }> {
  assertBodySize(c.req, MAX_UPLOAD_BYTES + 64 * 1024);
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    throw invalide("Envoi illisible : sélectionnez un fichier image.");
  }
  const file = form.get("fichier");
  if (!(file instanceof File)) throw invalide("Aucun fichier reçu.");
  if (file.size > MAX_UPLOAD_BYTES) throw invalide("Image trop lourde : 10 Mo maximum par fichier.");
  // Le nom d'origine ne sert qu'à l'affichage : jamais comme chemin sur le disque.
  const name = (file.name.split(/[\\/]/).pop() ?? "image").replace(/[^\p{L}\p{N}._ -]/gu, "").slice(0, 80) || "image";
  return { buffer: Buffer.from(await file.arrayBuffer()), name, form };
}

export const catalogueRoutes: Routes = {
  ...collection({
    path: "categories",
    sheet: "Categories",
    perm: PERM,
    prefix: "cat",
    ordered: true,
    stamped: true,
    required: ["nom"],
    schema: z.object({ nom: nom(60), description: txt(300), imageMediaId: ref, visible: z.boolean(), stationId: ref }),
    defaults: () => ({ visible: true }),
    check: (row, db) => {
      if (db.Categories.some((c) => c.id !== row.id && c.nom.toLowerCase() === row.nom.toLowerCase())) throw conflit(`Une catégorie « ${row.nom} » existe déjà.`);
    },
  }),
  ...collection({ path: "allergenes", sheet: "Allergenes", perm: PERM, prefix: "alg", ordered: true, required: ["nom"], schema: z.object({ nom: nom(40) }) }),
  ...collection({
    path: "etiquettes",
    sheet: "Etiquettes",
    perm: PERM,
    prefix: "etq",
    ordered: true,
    required: ["nom"],
    schema: z.object({ nom: nom(40), couleur: hex, icone: txt(30) }),
    defaults: () => ({ couleur: "#52683F", icone: "tag" }),
  }),
  ...collection({
    path: "produits",
    sheet: "Produits",
    perm: PERM,
    prefix: "prd",
    ordered: true,
    stamped: true,
    required: ["nom", "categorieId"],
    schema: z.object({
      nom: nom(80),
      description: txt(500),
      categorieId: ref,
      prixCentimes: cents,
      imageMediaId: ref,
      allergeneIds: refs,
      etiquetteIds: refs,
      groupeOptionIds: refs,
      tempsPreparationMin: entier(0, 240).nullable(),
      disponible: z.boolean(),
      visible: z.boolean(),
    }),
    defaults: () => ({ disponible: true, visible: true }),
  }),
  "POST produits/lot": {
    perm: PERM,
    input: z.object({ ids: refs.min(1, "Sélectionnez au moins un produit."), action: choix(["categorie", "masquer", "afficher", "disponible", "indisponible", "supprimer"]), categorieId: ref.optional() }),
    run: (c, input: { ids: string[]; action: string; categorieId?: string }) =>
      transaction({ actor: c.actor }, (db, tx) => {
        if (input.action === "categorie") must(db, "Categories", input.categorieId ?? "");
        for (const id of input.ids) {
          const p = must(db, "Produits", id);
          const before = structuredClone(p);
          if (input.action === "supprimer") {
            removeRow(db, "Produits", id);
            tx.log({ action: "suppression", libelle: "Suppression", entite: "Produits", entiteId: id, entiteNom: p.nom });
            continue;
          }
          if (input.action === "categorie") p.categorieId = input.categorieId!;
          if (input.action === "masquer") p.visible = false;
          if (input.action === "afficher") p.visible = true;
          if (input.action === "disponible") p.disponible = true;
          if (input.action === "indisponible") p.disponible = false;
          if (logUpdate(tx, "Produits", before, p)) p.majLe = tx.now;
        }
        return { n: input.ids.length };
      }),
  },

  ...collection({
    path: "groupes-options",
    sheet: "GroupesOptions",
    perm: PERM,
    prefix: "grp",
    ordered: true,
    stamped: true,
    required: ["nom"],
    schema: z.object({ nom: nom(60), selection: choix(["facultative", "obligatoire"]), min: entier(0, 20), max: entier(1, 20) }),
    defaults: () => ({ selection: "facultative", min: 0, max: 1 }),
    check: (row) => {
      if (row.selection === "obligatoire" && row.min < 1) row.min = 1;
      if (row.selection === "facultative") row.min = 0;
      if (row.min > row.max) throw invalide("Le minimum ne peut pas dépasser le maximum.", { min: "Supérieur au maximum." });
    },
  }),
  "PUT groupes-options/:id/produits": {
    perm: PERM,
    input: z.object({ produitIds: refs }),
    run: (c, input: { produitIds: string[] }) =>
      transaction({ actor: c.actor }, (db, tx) => {
        const g = must(db, "GroupesOptions", c.params.id);
        const wanted = new Set(input.produitIds);
        for (const p of db.Produits) {
          const has = p.groupeOptionIds.includes(g.id);
          if (wanted.has(p.id) === has) continue;
          const before = structuredClone(p);
          p.groupeOptionIds = has ? p.groupeOptionIds.filter((x) => x !== g.id) : [...p.groupeOptionIds, g.id];
          if (logUpdate(tx, "Produits", before, p)) p.majLe = tx.now;
        }
        return { id: g.id };
      }),
  },
  ...collection({
    path: "options",
    sheet: "Options",
    perm: PERM,
    prefix: "opt",
    ordered: true,
    required: ["nom", "groupeId"],
    schema: z.object({ groupeId: ref, nom: nom(60), prixCentimes: cents, imageMediaId: ref, disponible: z.boolean() }),
    defaults: () => ({ disponible: true }),
  }),

  /** Ordre des options à l'intérieur d'un seul groupe. */
  "POST options/ordre-groupe": {
    perm: PERM,
    input: z.object({ ids: refs.min(1) }),
    run: (c, input: { ids: string[] }) =>
      transaction({ actor: c.actor }, (db, tx) => {
        const first = must(db, "Options", input.ids[0]);
        const group = db.Options.filter((o) => o.groupeId === first.groupeId);
        if (group.length !== input.ids.length || input.ids.some((id) => !group.some((o) => o.id === id))) {
          throw conflit("La liste des options a changé entre-temps. Rechargez la page avant de réordonner.");
        }
        input.ids.forEach((id, i) => (group.find((o) => o.id === id)!.ordre = i + 1));
        tx.log({ action: "ordre", libelle: "Ordre modifié", entite: "Options", entiteNom: db.GroupesOptions.find((g) => g.id === first.groupeId)?.nom ?? "" });
        return { ids: input.ids };
      }),
  },

  /* ------------------------------------------------------------- médias */

  "POST medias": {
    perm: PERM,
    run: async (c) => {
      const { buffer, name, form } = await uploaded(c);
      const categorie = MEDIA_CATEGORIES.find((x) => x === form.get("categorie")) ?? "produits";
      const stored = await storeImage(buffer);
      try {
        return await transaction({ actor: c.actor }, (db, tx) => {
          const row = { id: tx.id("med"), nom: name, ...stored, alt: String(form.get("alt") ?? "").trim().slice(0, 125), categorie, creeLe: tx.now, creePar: c.actor.id, majLe: tx.now };
          db.Medias.push(row);
          tx.log({ action: "creation", libelle: "Image importée", entite: "Medias", entiteId: row.id, entiteNom: row.nom });
          return row;
        });
      } catch (e) {
        await removeStored(stored);
        throw e;
      }
    },
  },
  "PATCH medias/:id": {
    perm: PERM,
    input: z.object({ nom: nom(80), alt: txt(125), categorie: choix(MEDIA_CATEGORIES) }).partial(),
    run: (c, input: Record<string, unknown>) =>
      transaction({ actor: c.actor }, (db, tx) => {
        const m = must(db, "Medias", c.params.id);
        const before = structuredClone(m);
        Object.assign(m, input);
        if (logUpdate(tx, "Medias", before, m)) m.majLe = tx.now;
        return m;
      }),
  },
  "POST medias/:id/remplacer": {
    perm: PERM,
    run: async (c) => {
      const { buffer, name } = await uploaded(c);
      const stored = await storeImage(buffer);
      try {
        const row = await transaction({ actor: c.actor }, (db, tx) => {
          const m = must(db, "Medias", c.params.id);
          Object.assign(m, stored, { nom: name, majLe: tx.now });
          tx.log({ action: "modification", libelle: "Image remplacée", entite: "Medias", entiteId: m.id, entiteNom: m.nom });
          return m;
        });
        await collectGarbage(await readDb());
        return row;
      } catch (e) {
        await removeStored(stored);
        throw e;
      }
    },
  },
  "POST medias/:id/recadrer": {
    perm: PERM,
    input: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), w: z.number().gt(0).max(1), h: z.number().gt(0).max(1) }),
    run: async (c, zone: { x: number; y: number; w: number; h: number }) => {
      if (zone.x + zone.w > 1.0001 || zone.y + zone.h > 1.0001) throw invalide("La zone de recadrage dépasse l'image.");
      const current = must(await readDb(), "Medias", c.params.id);
      const stored = await cropStored(current.fichier, zone);
      try {
        const row = await transaction({ actor: c.actor }, (db, tx) => {
          const m = must(db, "Medias", c.params.id);
          if (m.fichier !== current.fichier) throw new AppError("conflit", "L'image a changé entre-temps. Rechargez la page.");
          Object.assign(m, stored, { majLe: tx.now });
          tx.log({ action: "modification", libelle: "Image recadrée", entite: "Medias", entiteId: m.id, entiteNom: m.nom });
          return m;
        });
        await collectGarbage(await readDb());
        return row;
      } catch (e) {
        await removeStored(stored);
        throw e;
      }
    },
  },
  "DELETE medias/:id": {
    perm: PERM,
    run: async (c) => {
      const out = await transaction({ actor: c.actor }, (db, tx) => {
        const m = must(db, "Medias", c.params.id);
        const used = usagesOf(db, "Medias", m.id);
        if (used.length > 0) {
          throw conflit(`Cette image est encore utilisée (${used.slice(0, 3).map((u) => `${u.type} « ${u.nom || labelOf(m)} »`).join(", ")}). Remplacez-la ou détachez-la d'abord.`);
        }
        removeRow(db, "Medias", m.id);
        tx.log({ action: "suppression", libelle: "Image supprimée", entite: "Medias", entiteId: m.id, entiteNom: m.nom });
        return { id: m.id };
      });
      await collectGarbage(await readDb());
      return out;
    },
  },
  /** Fichiers servis au personnel connecté, y compris ceux qui ne sont pas encore publiés. */
  "GET medias/fichier/:nom": {
    perm: [],
    run: async (c) => {
      const name = c.params.nom;
      if (!MEDIA_NAME.test(name)) throw invalide("Nom de fichier refusé.");
      const db = await readDb();
      if (!db.Medias.some((m) => allFiles(m.fichier).includes(name))) throw new AppError("introuvable", "Image introuvable.");
      const data = await fsp.readFile(mediaPath(name)).catch(() => null);
      if (!data) throw new AppError("introuvable", "Image introuvable sur le disque.");
      return new Response(new Uint8Array(data), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
    },
  },
};
