import "server-only";
import { z } from "zod";
import { ID } from "../../defaults";
import { must } from "../../db-utils";
import { conflit, invalide } from "../../errors";
import type { Row } from "../../schema";
import { admitParticipant, closeTableSession, openTableSession, renewSessionCode } from "../../services/cart";
import { closeRequest, refuseParticipant, serviceState, setOrderStatus } from "../../services/table";
import { readDb, transaction } from "../../storage";
import { choix, collection, entier, hex, nom, ref, singleton, txt, type Routes } from "../core";

const PERM = "salle.configurer" as const;
export const PLAN_TYPES = ["table_ronde", "table_carree", "table_rect", "mur", "porte", "comptoir", "plante"] as const;

const objet = z.object({
  id: z.string().max(60).optional(),
  type: choix(PLAN_TYPES),
  tableId: ref,
  libelle: txt(40),
  x: entier(0, 4000),
  y: entier(0, 4000),
  largeur: entier(10, 2000),
  hauteur: entier(10, 2000),
  rotation: entier(0, 359),
});

export const salleRoutes: Routes = {
  ...collection({
    path: "zones",
    sheet: "Zones",
    perm: PERM,
    prefix: "zon",
    ordered: true,
    required: ["nom"],
    schema: z.object({ nom: nom(40), icone: txt(30), active: z.boolean() }),
    defaults: () => ({ active: true, icone: "house" }),
    check: (row, db) => {
      if (db.Zones.some((z2) => z2.id !== row.id && z2.nom.toLowerCase() === row.nom.toLowerCase())) throw conflit(`Une zone « ${row.nom} » existe déjà.`);
    },
  }),
  ...collection({
    path: "tables",
    sheet: "Tables",
    perm: PERM,
    prefix: "tbl",
    stamped: true,
    required: ["nom", "zoneId"],
    schema: z.object({ nom: nom(30), zoneId: ref, capacite: entier(1, 50), active: z.boolean(), serveurId: ref, couleur: hex }),
    defaults: () => ({ active: true, capacite: 2, couleur: "#8FA382" }),
    check: (row, db, before) => {
      if (db.Tables.some((t) => t.id !== row.id && !t.archiveeLe && t.nom.toLowerCase() === row.nom.toLowerCase())) throw conflit(`Une table « ${row.nom} » existe déjà.`);
      if (before && before.active && !row.active && db.SessionsTable.some((s) => s.tableId === row.id && s.statut === "ouverte")) {
        throw conflit("Une session est ouverte sur cette table : fermez-la avant de désactiver la table.");
      }
    },
  }),
  "POST tables/:id/archiver": {
    perm: PERM,
    run: (c) =>
      transaction({ actor: c.actor }, (db, tx) => {
        const t = must(db, "Tables", c.params.id);
        if (db.SessionsTable.some((s) => s.tableId === t.id && s.statut === "ouverte")) throw conflit("L'archivage nécessite qu'aucune session ne soit active sur cette table.");
        t.archiveeLe = tx.now;
        t.active = false;
        t.majLe = tx.now;
        for (const o of db.ObjetsPlan) if (o.tableId === t.id) o.tableId = "";
        tx.log({ action: "archivage", libelle: "Table archivée", entite: "Tables", entiteId: t.id, entiteNom: t.nom });
        return t;
      }),
  },

  /** Enregistre d'un bloc tous les éléments du plan d'une zone. */
  "PUT plan/:zoneId": {
    perm: PERM,
    input: z.object({ objets: z.array(objet).max(300, "Plan trop chargé : 300 éléments maximum par zone.") }),
    run: (c, input: { objets: z.infer<typeof objet>[] }) =>
      transaction({ actor: c.actor }, (db, tx) => {
        const zone = must(db, "Zones", c.params.zoneId);
        const linked = input.objets.map((o) => o.tableId).filter(Boolean);
        if (new Set(linked).size !== linked.length) throw invalide("Une même table est associée à plusieurs éléments du plan.");
        for (const id of linked) {
          const t = must(db, "Tables", id);
          if (t.zoneId !== zone.id) throw invalide(`« ${t.nom} » appartient à une autre zone.`);
        }
        const before = db.ObjetsPlan.filter((o) => o.zoneId === zone.id).length;
        db.ObjetsPlan = db.ObjetsPlan.filter((o) => o.zoneId !== zone.id);
        input.objets.forEach((o, i) => {
          const isTable = o.type.startsWith("table");
          db.ObjetsPlan.push({ id: tx.id("obj"), zoneId: zone.id, type: o.type, tableId: isTable ? o.tableId : "", libelle: o.libelle, x: o.x, y: o.y, largeur: o.largeur, hauteur: o.hauteur, rotation: o.rotation, ordre: i + 1 } satisfies Row<"ObjetsPlan">);
        });
        tx.log({ action: "plan", libelle: "Plan modifié", entite: "Zones", entiteId: zone.id, entiteNom: zone.nom, avant: { elements: before }, apres: { elements: input.objets.length } });
        return { n: input.objets.length };
      }),
  },

  ...singleton({
    path: "acces-table",
    sheet: "ReglesAccesTable",
    id: ID.acces,
    perm: PERM,
    schema: z.object({ politique: choix(["code_session", "validation_personnel", "acces_direct"]), validiteCode: choix(["session", "60", "120"]), wifi: txt(60) }),
  }),

  /* ------------------------------------------------- sessions de table */
  "POST sessions-table": {
    perm: "sessions.gerer",
    input: z.object({ tableId: ref.min(1) }),
    run: (c, input: { tableId: string }) => openTableSession(c.actor, input.tableId),
  },
  "POST sessions-table/:id/fermer": { perm: "sessions.gerer", run: (c) => closeTableSession(c.actor, c.params.id) },
  "POST sessions-table/:id/code": { perm: "sessions.gerer", run: (c) => renewSessionCode(c.actor, c.params.id) },

  /* ------------------------------------------------- service en direct */
  "GET service": { perm: "commandes.voir", run: async () => serviceState(await readDb()) },
  "POST commandes/:id/statut": {
    perm: ["preparation.changer", "commandes.servir"],
    input: z.object({ statut: ref.min(1) }),
    run: (c, input: { statut: string }) => setOrderStatus(c.actor, c.params.id, input.statut, { preparer: c.auth.can("preparation.changer"), servir: c.auth.can("commandes.servir") }),
  },
  "POST demandes/:id/traiter": { perm: "commandes.voir", run: (c) => closeRequest(c.actor, c.params.id) },
  "POST participants/:id/admettre": { perm: "sessions.gerer", run: (c) => admitParticipant(c.actor, c.params.id) },
  "POST participants/:id/refuser": { perm: "sessions.gerer", run: (c) => refuseParticipant(c.actor, c.params.id) },
};
