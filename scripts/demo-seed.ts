import fs from "node:fs";
import path from "node:path";
import { blankRow, must } from "@/lib/server/db-utils";
import { ID } from "@/lib/server/defaults";
import { isAppError } from "@/lib/server/errors";
import type { Row } from "@/lib/server/schema";
import { removeStored, storeImage, type StoredImage } from "@/lib/server/services/media";
import { publish } from "@/lib/server/services/publication";
import { __releaseLock, readDb, transaction } from "@/lib/server/storage";

/**
 * Données de démonstration, clairement identifiées (marqueur `donneesDemo` dans le classeur).
 * Refuse de s'exécuter si une carte existe déjà : rien n'est jamais réinitialisé.
 */
const MEDIA_DIR = path.resolve(process.cwd(), "demo/media");
const DEMO = { id: "demo", nom: "Données de démonstration" };

const IMAGES: [string, string, string][] = [
  ["pizza-casa", "Pizza della casa, tomate, mozzarella et basilic", "produits"],
  ["pizza-quattro", "Pizza aux quatre fromages", "produits"],
  ["bruschetta", "Bruschetta aux tomates fraîches", "produits"],
  ["salade-jardin", "Salade composée de légumes de saison", "produits"],
  ["pasta-pesto", "Farfalle au pesto et tomates cerises", "produits"],
  ["penne-arrabbiata", "Penne à la sauce tomate relevée", "produits"],
  ["risotto", "Risotto crémeux au parmesan", "produits"],
  ["burger-oliva", "Burger maison au cheddar", "produits"],
  ["douceur-chocolat", "Gâteau fondant au chocolat", "produits"],
  ["tiramisu", "Tiramisu maison au cacao", "produits"],
  ["limonade", "Limonade artisanale au citron et à la menthe", "produits"],
  ["table-dressee", "Table dressée dans la salle du restaurant", "restaurant"],
  ["salle-restaurant", "Salle du restaurant", "restaurant"],
];

async function main() {
  const current = await readDb();
  if (current.Produits.length > 0 || current.Categories.length > 0) {
    console.log("Une carte existe déjà dans ce stockage : les données de démonstration n'ont pas été ajoutées.");
    return;
  }

  const stored = new Map<string, StoredImage>();
  try {
    for (const [name] of IMAGES) stored.set(name, await storeImage(fs.readFileSync(path.join(MEDIA_DIR, `${name}.jpg`))));

    await transaction({ actor: DEMO }, (db, tx) => {
      if (db.Produits.length > 0 || db.Categories.length > 0) throw new Error("Une carte existe déjà.");
      const now = tx.now;
      const media = new Map<string, string>();
      for (const [name, alt, categorie] of IMAGES) {
        const id = tx.id("med");
        media.set(name, id);
        db.Medias.push({ id, nom: `${name}.jpg`, ...stored.get(name)!, alt, categorie, creeLe: now, creePar: "", majLe: now });
      }

      Object.assign(must(db, "Restaurant", ID.restaurant), { nom: "Oliva", sousTitre: "Cuisine de saison", description: "Une cuisine fraîche, simple et généreuse.", email: "contact@example.test", majLe: now });
      Object.assign(must(db, "Apparence", ID.apparence), { banniereMediaId: media.get("table-dressee"), titreAccueil: "À table, ensemble.", texteBanniere: "Un peu d'Italie. Beaucoup de plaisir.", majLe: now });
      for (const h of db.Horaires) {
        const midi = { libelle: "Déjeuner", debut: "12:00", fin: "15:00" };
        const soir = { libelle: "Dîner", debut: "19:00", fin: "23:00" };
        if (h.jour === 1) continue;
        h.ouvert = true;
        h.plages = h.jour === 7 ? [midi] : [midi, soir];
      }

      const station = (nom: string, icone: string, ordre: number) => {
        const id = tx.id("sta");
        db.StationsPreparation.push({ id, nom, icone, utilisateurIds: [], notifierServeur: true, ordre });
        return id;
      };
      const four = station("Four", "oven", 1);
      const chaude = station("Cuisine chaude", "fire", 2);
      const froide = station("Cuisine froide", "snowflake", 3);
      const patisserie = station("Pâtisserie", "cake", 4);
      const bar = station("Bar", "wine", 5);

      const categorie = (nom: string, description: string, image: string, stationId: string, ordre: number) => {
        const id = tx.id("cat");
        db.Categories.push({ id, nom, description, imageMediaId: media.get(image)!, visible: true, ordre, stationId, creeLe: now, majLe: now });
        return id;
      };
      const entrees = categorie("Entrées", "Pour commencer, à partager ou non.", "bruschetta", froide, 1);
      const pizzas = categorie("Pizzas", "Nos pizzas artisanales, préparées avec des ingrédients de saison.", "pizza-casa", four, 2);
      const plats = categorie("Plats", "Pâtes fraîches, risotto et grillades.", "pasta-pesto", chaude, 3);
      const desserts = categorie("Desserts", "Faits maison chaque matin.", "tiramisu", patisserie, 4);
      const boissons = categorie("Boissons", "Fraîches et sans alcool.", "limonade", bar, 5);

      const groupe = (nom: string, selection: string, min: number, max: number, ordre: number, options: [string, number][]) => {
        const id = tx.id("grp");
        db.GroupesOptions.push({ id, nom, selection, min, max, ordre, creeLe: now, majLe: now });
        options.forEach(([n, prix], i) => db.Options.push({ id: tx.id("opt"), groupeId: id, nom: n, prixCentimes: prix, imageMediaId: "", disponible: true, ordre: i + 1 }));
        return id;
      };
      const supplements = groupe("Suppléments pizza", "facultative", 0, 3, 1, [["Mozzarella", 200], ["Champignons", 150], ["Olives", 100]]);
      const cuisson = groupe("Cuisson du burger", "obligatoire", 1, 1, 2, [["Saignant", 0], ["À point", 0], ["Bien cuit", 0]]);
      const taille = groupe("Taille de boisson", "obligatoire", 1, 1, 3, [["33 cl", 0], ["50 cl", 150]]);

      const alg = (...noms: string[]) => noms.map((n) => db.Allergenes.find((a) => a.nom === n)!.id);
      let ordre = 0;
      const produit = (nom: string, description: string, categorieId: string, prixCentimes: number, image: string, extra: Partial<Row<"Produits">> = {}) =>
        db.Produits.push({ ...(blankRow("Produits") as unknown as Row<"Produits">), id: tx.id("prd"), nom, description, categorieId, prixCentimes, imageMediaId: media.get(image)!, disponible: true, visible: true, ordre: ++ordre, creeLe: now, majLe: now, ...extra });

      produit("Bruschetta al pomodoro", "Pain grillé, tomates fraîches, ail et basilic.", entrees, 850, "bruschetta", { allergeneIds: alg("Gluten"), etiquetteIds: ["etq_vegan"], tempsPreparationMin: 8 });
      produit("Salade du jardin", "Légumes de saison, pois chiches, avocat et vinaigrette maison.", entrees, 1250, "salade-jardin", { etiquetteIds: ["etq_vegetarien"], tempsPreparationMin: 10 });
      produit("Pizza della casa", "Tomate, mozzarella et basilic frais.", pizzas, 1850, "pizza-casa", { allergeneIds: alg("Gluten", "Lait"), etiquetteIds: ["etq_vegetarien"], groupeOptionIds: [supplements], tempsPreparationMin: 15 });
      produit("Pizza quattro formaggi", "Mozzarella, gorgonzola, parmesan et chèvre.", pizzas, 1700, "pizza-quattro", { allergeneIds: alg("Gluten", "Lait"), etiquetteIds: ["etq_vegetarien"], groupeOptionIds: [supplements], tempsPreparationMin: 15 });
      produit("Pasta al pesto", "Farfalle, pesto de basilic, tomates cerises et roquette.", plats, 1690, "pasta-pesto", { allergeneIds: alg("Gluten", "Lait", "Fruits à coque"), etiquetteIds: ["etq_vegetarien"], tempsPreparationMin: 14 });
      produit("Penne all'arrabbiata", "Sauce tomate relevée, ail et piment.", plats, 1550, "penne-arrabbiata", { allergeneIds: alg("Gluten"), etiquetteIds: ["etq_epice", "etq_vegan"], tempsPreparationMin: 14 });
      produit("Risotto au parmesan", "Riz carnaroli, parmesan affiné et poivre du moulin.", plats, 1750, "risotto", { allergeneIds: alg("Lait"), etiquetteIds: ["etq_vegetarien"], tempsPreparationMin: 20 });
      produit("Burger Oliva", "Bœuf, cheddar, salade, tomate et sauce maison.", plats, 1790, "burger-oliva", { allergeneIds: alg("Gluten", "Lait", "Œufs", "Moutarde", "Sésame"), groupeOptionIds: [cuisson], tempsPreparationMin: 18 });
      produit("Douceur chocolat", "Fondant au chocolat noir, cœur coulant.", desserts, 850, "douceur-chocolat", { allergeneIds: alg("Gluten", "Lait", "Œufs"), etiquetteIds: ["etq_maison"], disponible: false, tempsPreparationMin: 12 });
      produit("Tiramisu maison", "Mascarpone, café et cacao.", desserts, 790, "tiramisu", { allergeneIds: alg("Gluten", "Lait", "Œufs"), etiquetteIds: ["etq_maison"], tempsPreparationMin: 5 });
      produit("Limonade artisanale", "Citron pressé, menthe fraîche et eau pétillante.", boissons, 550, "limonade", { etiquetteIds: ["etq_maison"], groupeOptionIds: [taille], tempsPreparationMin: 3 });

      const zone = (nom: string, icone: string, o: number) => {
        const id = tx.id("zon");
        db.Zones.push({ id, nom, icone, ordre: o, active: true });
        return id;
      };
      const salle = zone("Salle principale", "house", 1);
      const terrasse = zone("Terrasse", "sun", 2);

      const user = (prenom: string, roleId: string, statut: string, zoneIds: string[], stationId = "") => {
        const id = tx.id("usr");
        // Comptes d'exemple sans mot de passe : ils ne peuvent pas se connecter tant qu'un administrateur ne leur remet pas un lien.
        db.Utilisateurs.push({ id, prenom, nom: "", email: `${prenom.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}@example.test`, identifiant: "", motDePasseHash: "", roleId, statut, zoneIds, stationId, jetonHash: "", jetonType: "", jetonExpireLe: "", derniereConnexionLe: "", creeLe: now, majLe: now });
        return id;
      };
      user("Camille", "role_responsable", "actif", []);
      const hugo = user("Hugo", "role_serveur", "actif", [salle]);
      const sarah = user("Sarah", "role_serveur", "actif", [terrasse]);
      user("Léa", "role_cuisine", "invite", [], chaude);
      user("Adam", "role_serveur", "suspendu", [salle]);

      const table = (n: number, zoneId: string, capacite: number, serveurId: string) => {
        const id = tx.id("tbl");
        db.Tables.push({ id, nom: `Table ${String(n).padStart(2, "0")}`, zoneId, capacite, active: true, serveurId, couleur: "#8FA382", archiveeLe: "", creeLe: now, majLe: now });
        return id;
      };
      const obj = (zoneId: string, type: string, x: number, y: number, largeur: number, hauteur: number, extra: { tableId?: string; libelle?: string; rotation?: number } = {}) =>
        db.ObjetsPlan.push({ id: tx.id("obj"), zoneId, type, tableId: extra.tableId ?? "", libelle: extra.libelle ?? "", x, y, largeur, hauteur, rotation: extra.rotation ?? 0, ordre: db.ObjetsPlan.length + 1 });

      const caps = [4, 2, 4, 4, 4, 2, 6, 4];
      const spots: [string, number, number, number, number][] = [
        ["table_ronde", 260, 120, 90, 90], ["table_carree", 440, 130, 70, 70], ["table_ronde", 600, 120, 90, 90], ["table_rect", 250, 290, 90, 70],
        ["table_rect", 620, 290, 90, 70], ["table_ronde", 270, 450, 80, 80], ["table_rect", 410, 280, 160, 100], ["table_rect", 520, 460, 110, 70],
      ];
      spots.forEach(([type, x, y, w, h], i) => obj(salle, type, x, y, w, h, { tableId: table(i + 1, salle, caps[i], hugo) }));
      obj(salle, "mur", 40, 40, 760, 12);
      obj(salle, "mur", 40, 40, 12, 560);
      obj(salle, "mur", 788, 40, 12, 560);
      obj(salle, "mur", 40, 588, 560, 12);
      obj(salle, "porte", 360, 28, 80, 36, { libelle: "Entrée" });
      obj(salle, "comptoir", 70, 150, 70, 300, { libelle: "Comptoir" });
      obj(salle, "plante", 80, 70, 50, 50);
      obj(salle, "plante", 720, 70, 50, 50);
      obj(salle, "plante", 720, 520, 50, 50);

      [[120, 100], [320, 100], [120, 280], [320, 280]].forEach(([x, y], i) => obj(terrasse, "table_carree", x, y, 80, 80, { tableId: table(9 + i, terrasse, i < 2 ? 2 : 4, sarah) }));
      obj(terrasse, "plante", 500, 110, 50, 50);
      obj(terrasse, "plante", 500, 290, 50, 50);

      const equipement = (nom: string, type: string, emplacement: string) => db.Equipements.push({ id: tx.id("eqp"), nom, type, emplacement, stationId: "", formatTicket: type === "imprimante" ? "80 mm" : "", impressionAuto: false, statut: "a_associer", creeLe: now });
      equipement("Écran cuisine", "ecran_cuisine", "Cuisine");
      equipement("Tablette de salle", "tablette", "Salle");
      equipement("Imprimante tickets", "imprimante", "Bar");

      db._meta.donneesDemo = true;
      tx.log({ action: "import", libelle: "Données de démonstration ajoutées", entite: "", entiteNom: "Démonstration", resultat: "Terminé" });
    });
  } catch (e) {
    // Rien n'a été enregistré : les images déjà copiées sont retirées.
    for (const s of stored.values()) await removeStored(s);
    throw e;
  }

  const version = await publish(DEMO, "maintenant");
  console.log(`Données de démonstration ajoutées et publiées (version ${version.numero}).`);
  console.log("Les comptes d'exemple (@example.test) n'ont pas de mot de passe et ne peuvent pas se connecter.");
}

main()
  .catch((e) => {
    console.error(isAppError(e) ? e.message : (e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => __releaseLock());
