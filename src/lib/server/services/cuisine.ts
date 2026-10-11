import "server-only";
import type { KitchenLine, KitchenOrder, KitchenState } from "@/lib/cuisine-types";
import type { Auth } from "../auth/resolve";
import { fullName } from "../db-utils";
import { introuvable } from "../errors";
import type { Db, Row } from "../schema";
import { sortedStatuses } from "./salle";
import { setOrderStatus } from "./table";

/**
 * Espace cuisine : les commandes des tables ouvertes, limitées aux plats de la station du membre.
 * Un rôle de portée « station » ne voit jamais le travail d'une autre station, et le dernier
 * statut reste au service : la cuisine prépare, elle ne sert pas.
 */

export interface Stations {
  toutes: boolean;
  ids: Set<string>;
  noms: string[];
}

/** Stations suivies : celle de la fiche du membre, plus celles où il est nommé. */
export function stationsOf(db: Db, auth: Auth): Stations {
  const nom = (id: string) => db.StationsPreparation.find((s) => s.id === id)?.nom ?? "";
  if (auth.role.portee !== "station") {
    const ids = new Set(db.StationsPreparation.map((s) => s.id));
    return { toutes: true, ids, noms: [...ids].map(nom).filter(Boolean) };
  }
  const ids = new Set<string>();
  if (auth.user.stationId) ids.add(auth.user.stationId);
  for (const s of db.StationsPreparation) if (s.utilisateurIds.includes(auth.user.id)) ids.add(s.id);
  return { toutes: false, ids, noms: [...ids].map(nom).filter(Boolean) };
}

/** Vrai quand la commande comporte au moins un plat relevant des stations du membre. */
function concerne(db: Db, stations: Stations, commandeId: string): boolean {
  if (stations.toutes) return true;
  return db.LignesCommande.some((l) => l.commandeId === commandeId && stations.ids.has(l.stationId));
}

export function kitchenOf(db: Db, auth: Auth): KitchenState {
  const stations = stationsOf(db, auth);
  const statuts = sortedStatuses(db);
  const dernier = statuts.at(-1)?.id ?? "servie";
  const nomStation = new Map(db.StationsPreparation.map((s) => [s.id, s.nom]));
  const tables = new Map(db.Tables.map((t) => [t.id, t.nom]));

  const ouvertes = new Set(db.SessionsTable.filter((s) => s.statut === "ouverte").map((s) => s.id));
  const rangs = new Map<string, number>();
  for (const id of ouvertes) {
    db.Commandes.filter((c) => c.sessionId === id)
      .sort((a, b) => a.creeLe.localeCompare(b.creeLe))
      .forEach((c, i) => rangs.set(c.id, i + 1));
  }

  const build = (c: Row<"Commandes">): KitchenOrder => {
    const st = statuts.find((s) => s.id === c.statut);
    const rang = statuts.findIndex((s) => s.id === c.statut);
    const suivant = rang < 0 ? undefined : statuts[rang + 1];
    const toutes = db.LignesCommande.filter((l) => l.commandeId === c.id);
    const miennes = stations.toutes ? toutes : toutes.filter((l) => stations.ids.has(l.stationId));
    const lignes: KitchenLine[] = miennes.map((l) => ({
      nom: l.nom,
      quantite: l.quantite,
      options: (l.options ?? []).map((o) => ({ nom: o.nom })),
      instructions: l.instructions,
      station: nomStation.get(l.stationId) ?? "",
    }));
    return {
      id: c.id,
      table: tables.get(c.tableId) ?? "",
      rang: rangs.get(c.id) ?? 1,
      numero: c.numero,
      creeLe: c.creeLe,
      statut: c.statut,
      statutNom: st?.nom ?? c.statut,
      couleur: st?.couleur ?? "#5B6B7A",
      // La dernière étape appartient au service : la cuisine ne la propose pas.
      suivant: suivant && suivant.id !== dernier ? { id: suivant.id, nom: suivant.nom } : null,
      articles: lignes.reduce((n, l) => n + l.quantite, 0),
      lignes,
      partielle: miennes.length !== toutes.length,
    };
  };

  const commandes = db.Commandes.filter((c) => ouvertes.has(c.sessionId) && c.statut !== dernier && concerne(db, stations, c.id))
    .sort((a, b) => a.creeLe.localeCompare(b.creeLe))
    .map(build);

  return {
    membre: auth.user.prenom || fullName(auth.user),
    stations: stations.toutes ? [] : stations.noms,
    toutesStations: stations.toutes,
    aPreparer: commandes.filter((c) => c.suivant),
    pretes: commandes.filter((c) => !c.suivant),
  };
}

/**
 * Fait avancer une commande depuis l'écran de cuisine. Les droits sont ceux du membre,
 * et la commande doit comporter un plat de sa station : un identifiant dans l'URL ne suffit pas.
 */
export function advanceKitchenOrder(auth: Auth, commandeId: string, statut: string) {
  return setOrderStatus(auth.actor, commandeId, statut, { preparer: auth.can("preparation.changer"), servir: auth.can("commandes.servir") }, (db, commande) => {
    if (!concerne(db, stationsOf(db, auth), commande.id)) throw introuvable("Cette commande ne relève pas de votre station.");
  });
}
