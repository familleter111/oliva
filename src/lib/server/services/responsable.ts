import "server-only";
import type { ChefMember, ChefOverview, ChefPriority, ChefRequests, ChefService, ChefSessions, ChefStats, ChefTable, ChefTableDetail, ChefTeam, ChefZone, TableEtat } from "@/lib/responsable-types";
import type { Auth } from "../auth/resolve";
import { fullName, must } from "../db-utils";
import { AppError, conflit, introuvable, invalide } from "../errors";
import type { Db, Row } from "../schema";
import { transaction } from "../storage";
import { billTotals } from "./bill";
import { orderBuilder, requestBuilder, scopeOf, sortedStatuses } from "./salle";

/**
 * Espace responsable de salle : coordonner le service, répartir les tables entre les serveurs,
 * attribuer les demandes et clôturer les sessions.
 *
 * Comme l'espace serveur, rien n'est repris du navigateur : les états de table sont recalculés
 * depuis les sessions, les commandes et les demandes à chaque lecture, et chaque écriture
 * revérifie la permission et la portée du rôle dans sa propre transaction.
 */

/** Membres capables de servir, d'après les permissions de leur rôle. */
function servers(db: Db): Row<"Utilisateurs">[] {
  const roles = new Set(db.Permissions.filter((p) => p.permission === "commandes.servir").map((p) => p.roleId));
  return db.Utilisateurs.filter((u) => u.statut === "actif" && roles.has(u.roleId)).sort((a, b) => fullName(a).localeCompare(fullName(b), "fr"));
}

export function chefTables(db: Db, auth: Auth): ChefTable[] {
  const scope = scopeOf(db, auth);
  const statuts = sortedStatuses(db);
  const ready = statuts.at(-2)?.id ?? "prete";
  const last = statuts.at(-1)?.id ?? "servie";
  const zones = new Map(db.Zones.map((z) => [z.id, z.nom]));
  const membres = new Map(db.Utilisateurs.map((u) => [u.id, fullName(u)]));

  return db.Tables.filter((t) => !t.archiveeLe && scope.ids.has(t.id))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr", { numeric: true }))
    .map((t) => {
      const session = db.SessionsTable.find((s) => s.tableId === t.id && s.statut === "ouverte");
      const commandes = session ? db.Commandes.filter((c) => c.sessionId === session.id) : [];
      const demandes = session ? db.DemandesClient.filter((d) => d.sessionId === session.id && d.statut !== "traitee") : [];
      const pretes = commandes.filter((c) => c.statut === ready).length;
      const addition = session ? db.AdditionsTable.find((a) => a.sessionId === session.id) : undefined;
      const etat: TableEtat = !session ? "libre" : pretes > 0 ? "a_servir" : demandes.length > 0 || addition?.statut === "a_remettre" ? "demande" : "en_service";
      const dates = [session?.ouverteLe ?? "", ...commandes.map((c) => c.creeLe), ...demandes.map((d) => d.creeLe)].filter(Boolean).sort();
      return {
        id: t.id,
        nom: t.nom,
        zoneId: t.zoneId,
        zone: zones.get(t.zoneId) ?? "",
        capacite: t.capacite,
        etat,
        sessionId: session?.id ?? "",
        convives: session ? db.Participants.filter((p) => p.sessionId === session.id && p.statut === "admis").length : 0,
        serveurId: t.serveurId,
        serveur: t.serveurId ? (membres.get(t.serveurId) ?? "") : "",
        pretes,
        enPreparation: commandes.filter((c) => c.statut !== ready && c.statut !== last).length,
        demandes: demandes.length,
        additionARemettre: addition?.statut === "a_remettre",
        ouverteLe: session?.ouverteLe ?? "",
        derniereActiviteLe: dates.at(-1) ?? "",
      };
    });
}

function statsOf(db: Db, tables: ChefTable[]): ChefStats {
  const statuts = sortedStatuses(db);
  const ready = statuts.at(-2)?.id ?? "prete";
  const last = statuts.at(-1)?.id ?? "servie";
  const ids = new Set(tables.filter((t) => t.sessionId).map((t) => t.sessionId));
  const commandes = db.Commandes.filter((c) => ids.has(c.sessionId));
  return {
    tablesOccupees: tables.filter((t) => t.sessionId).length,
    tablesTotal: tables.length,
    convives: tables.reduce((n, t) => n + t.convives, 0),
    aServir: commandes.filter((c) => c.statut === ready).length,
    demandes: tables.reduce((n, t) => n + t.demandes, 0),
    enPreparation: commandes.filter((c) => c.statut !== ready && c.statut !== last).length,
    servies: commandes.filter((c) => c.statut === last).length,
  };
}

function teamOf(db: Db, tables: ChefTable[]): ChefMember[] {
  const roles = new Map(db.Roles.map((r) => [r.id, r.nom]));
  return servers(db).map((u) => {
    const siennes = tables.filter((t) => t.serveurId === u.id && t.sessionId);
    return {
      id: u.id,
      nom: fullName(u),
      role: roles.get(u.roleId) ?? "",
      etat: siennes.length > 0 ? ("en_service" as const) : ("disponible" as const),
      tables: siennes.map((t) => ({ id: t.id, nom: t.nom })),
      convives: siennes.reduce((n, t) => n + t.convives, 0),
      demandes: siennes.reduce((n, t) => n + t.demandes, 0),
    };
  });
}

function prioritiesOf(tables: ChefTable[]): ChefPriority[] {
  const out: ChefPriority[] = [];
  for (const t of tables.filter((x) => x.pretes > 0)) out.push({ id: `s-${t.id}`, tableId: t.id, table: t.nom, serveur: t.serveur, libelle: "Commande prête", type: "servir", href: `/responsable/plan?table=${t.id}` });
  for (const t of tables.filter((x) => x.additionARemettre)) out.push({ id: `a-${t.id}`, tableId: t.id, table: t.nom, serveur: t.serveur, libelle: "Addition demandée", type: "addition", href: `/responsable/plan?table=${t.id}` });
  for (const t of tables.filter((x) => x.demandes > 0 && !x.additionARemettre)) out.push({ id: `d-${t.id}`, tableId: t.id, table: t.nom, serveur: t.serveur, libelle: "Demande en attente", type: "demande", href: "/responsable/demandes" });
  return out.slice(0, 6);
}

/** Zones et plan publié, pour afficher la salle telle qu'elle a été dessinée. */
export function floorZones(db: Db): ChefZone[] {
  return [...db.Zones]
    .filter((z) => z.active)
    .sort((a, b) => a.ordre - b.ordre)
    .map((z) => ({
      id: z.id,
      nom: z.nom,
      objets: db.ObjetsPlan.filter((o) => o.zoneId === z.id)
        .sort((a, b) => a.ordre - b.ordre)
        .map((o) => ({ id: o.id, type: o.type, tableId: o.tableId, libelle: o.libelle, x: o.x, y: o.y, largeur: o.largeur, hauteur: o.hauteur, rotation: o.rotation })),
    }));
}

export function overview(db: Db, auth: Auth): ChefOverview {
  const tables = chefTables(db, auth);
  const priorites = prioritiesOf(tables);
  const attente = tables.filter((t) => t.demandes > 0);
  return {
    stats: statsOf(db, tables),
    zones: floorZones(db),
    tables,
    priorites,
    equipe: teamOf(db, tables),
    alerte:
      attente.length === 1
        ? `Une demande à la ${attente[0].nom.toLowerCase()} attend une prise en charge.`
        : attente.length > 1
          ? `${attente.length} tables attendent une prise en charge.`
          : "",
  };
}

export function chefTableDetail(db: Db, auth: Auth, tableId: string): ChefTableDetail {
  const tables = chefTables(db, auth);
  const table = tables.find((t) => t.id === tableId);
  if (!table) throw introuvable("Cette table ne fait pas partie de votre salle.");
  const order = orderBuilder(db);
  const toRequest = requestBuilder(db, auth);
  const session = table.sessionId ? db.SessionsTable.find((s) => s.id === table.sessionId) : undefined;
  const totals = session ? billTotals(db, session.id) : { totalCentimes: 0 };
  const nom = table.nom;
  return {
    table,
    commandes: session ? db.Commandes.filter((c) => c.sessionId === session.id).sort((a, b) => a.creeLe.localeCompare(b.creeLe)).map(order) : [],
    demandes: session ? db.DemandesClient.filter((d) => d.sessionId === session.id && d.statut !== "traitee").sort((a, b) => a.creeLe.localeCompare(b.creeLe)).map(toRequest) : [],
    additionCentimes: totals.totalCentimes,
    additionRemise: !!session && db.AdditionsTable.find((a) => a.sessionId === session.id)?.statut === "remise",
    devise: db.Restaurant[0]?.devise || "EUR",
    code: session?.code ?? "",
    actions: db.HistoriqueActions.filter((h) => h.entiteId === tableId || (h.entiteNom === nom && h.entiteNom !== ""))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 6)
      .map((h) => ({ date: h.date, libelle: h.libelle, detail: h.auteurNom })),
  };
}

export function team(db: Db, auth: Auth): ChefTeam {
  const tables = chefTables(db, auth);
  const order = orderBuilder(db);
  const toRequest = requestBuilder(db, auth);
  const ready = sortedStatuses(db).at(-2)?.id ?? "prete";
  const ids = new Set(tables.filter((t) => t.sessionId).map((t) => t.sessionId));
  const membres = teamOf(db, tables);
  return {
    membres,
    tables,
    demandes: db.DemandesClient.filter((d) => ids.has(d.sessionId) && d.statut !== "traitee").sort((a, b) => b.creeLe.localeCompare(a.creeLe)).map(toRequest),
    pretes: db.Commandes.filter((c) => ids.has(c.sessionId) && c.statut === ready).sort((a, b) => a.creeLe.localeCompare(b.creeLe)).map(order),
    stats: {
      serveurs: membres.filter((m) => m.etat === "en_service").length,
      convives: tables.reduce((n, t) => n + t.convives, 0),
      tablesOccupees: tables.filter((t) => t.sessionId).length,
      tablesTotal: tables.length,
    },
  };
}

export function serviceFollow(db: Db, auth: Auth): ChefService {
  const tables = chefTables(db, auth);
  const parTable = new Map(tables.map((t) => [t.id, { id: t.serveurId, nom: t.serveur }]));
  const ids = new Set(tables.filter((t) => t.sessionId).map((t) => t.sessionId));
  const order = orderBuilder(db);
  return {
    stats: statsOf(db, tables),
    commandes: db.Commandes.filter((c) => ids.has(c.sessionId))
      .sort((a, b) => b.creeLe.localeCompare(a.creeLe))
      .map((c) => {
        const o = order(c);
        const s = parTable.get(c.tableId);
        return { ...o, serveurId: s?.id ?? "", serveur: s?.nom ?? "" };
      }),
    serveurs: servers(db).map((u) => ({ id: u.id, nom: fullName(u) })),
  };
}

export function requestsBoard(db: Db, auth: Auth): ChefRequests {
  const tables = chefTables(db, auth);
  const visibles = new Set(tables.map((t) => t.id));
  const toRequest = requestBuilder(db, auth);
  return {
    demandes: db.DemandesClient.filter((d) => visibles.has(d.tableId))
      .sort((a, b) => b.creeLe.localeCompare(a.creeLe))
      .slice(0, 120)
      .map(toRequest),
    serveurs: servers(db).map((u) => ({ id: u.id, nom: fullName(u) })),
    parTable: Object.fromEntries(tables.filter((t) => t.serveurId).map((t) => [t.id, t.serveurId])),
  };
}

export function sessionsBoard(db: Db, auth: Auth): ChefSessions {
  const tables = chefTables(db, auth);
  return {
    stats: statsOf(db, tables),
    actives: tables.filter((t) => t.sessionId),
    disponibles: tables.filter((t) => !t.sessionId),
  };
}

/* ------------------------------------------------------------ écritures */

/**
 * Confie une table à un serveur. Les commandes et les demandes déjà ouvertes restent attachées
 * à la table : seule la personne qui en a la charge change. La note de passation est journalisée.
 */
export function assignTable(auth: Auth, tableId: string, serveurId: string, note = "") {
  return transaction({ actor: auth.actor }, (db, tx) => {
    if (!auth.can("tables.affecter")) throw new AppError("interdit", "Votre rôle ne permet pas de réaffecter une table.");
    const t = must(db, "Tables", tableId);
    if (!scopeOf(db, auth).ids.has(t.id)) throw introuvable("Cette table ne fait pas partie de votre salle.");
    const texte = note.trim();
    if (texte.length > 200) throw invalide("Note de passation trop longue : 200 caractères maximum.");
    let nouveau = "";
    if (serveurId) {
      const u = db.Utilisateurs.find((x) => x.id === serveurId && x.statut === "actif");
      if (!u) throw invalide("Ce membre de l'équipe n'est pas disponible.");
      if (!servers(db).some((x) => x.id === u.id)) throw invalide(`${fullName(u)} n'a pas le droit de servir les tables.`);
      nouveau = u.id;
    }
    if (t.serveurId === nouveau) throw conflit(nouveau ? "Cette table est déjà confiée à ce serveur." : "Cette table n'est affectée à personne.");
    const avant = db.Utilisateurs.find((u) => u.id === t.serveurId);
    const apres = db.Utilisateurs.find((u) => u.id === nouveau);
    t.serveurId = nouveau;
    t.majLe = tx.now;
    tx.log({
      action: "affectation",
      libelle: nouveau ? `Table confiée à ${fullName(apres!)}${texte ? ` · ${texte}` : ""}` : "Table sans serveur affecté",
      entite: "Tables",
      entiteId: t.id,
      entiteNom: t.nom,
      resultat: "Terminé",
      avant: { serveur: avant ? fullName(avant) : "" },
      apres: { serveur: apres ? fullName(apres) : "" },
    });
    tx.publish("service");
    return { id: t.id, serveurId: nouveau };
  });
}

/** Attribue une demande client à un membre : elle passe en cours, au nom de la personne désignée. */
export function assignRequest(auth: Auth, demandeId: string, serveurId: string) {
  return transaction({ actor: auth.actor }, (db, tx) => {
    if (!auth.can("tables.affecter")) throw new AppError("interdit", "Votre rôle ne permet pas d'attribuer une demande.");
    const d = must(db, "DemandesClient", demandeId);
    if (!scopeOf(db, auth).ids.has(d.tableId)) throw introuvable("Cette demande ne concerne pas votre salle.");
    if (d.statut === "traitee") throw conflit("Cette demande est déjà traitée.");
    const u = servers(db).find((x) => x.id === serveurId);
    if (!u) throw invalide("Ce membre de l'équipe ne peut pas prendre une demande en charge.");
    if (d.statut === "en_cours" && d.traiteePar === u.id) throw conflit(`Cette demande est déjà confiée à ${fullName(u)}.`);
    d.statut = "en_cours";
    d.traiteePar = u.id;
    const table = db.Tables.find((t) => t.id === d.tableId);
    tx.log({ action: "modification", libelle: `Demande attribuée à ${fullName(u)} : ${d.libelle}`, entite: "DemandesClient", entiteId: d.id, entiteNom: table?.nom ?? "", resultat: "Terminé" });
    tx.publish(`session:${d.sessionId}`);
    tx.publish("service");
    return { id: d.id, serveurId: u.id };
  });
}
