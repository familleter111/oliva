/** Navigation de l'administration, organisée par domaine. Chaque entrée déclare la permission requise. */

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  perm: string;
  /** Titre court utilisé dans le fil d'Ariane quand il diffère du libellé. */
  crumb?: string;
}
export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    title: "Restaurant",
    items: [
      { href: "/admin/etablissement", label: "Établissement", icon: "storefront", perm: "restaurant.configurer" },
      { href: "/admin/horaires", label: "Horaires", icon: "clock", perm: "restaurant.configurer" },
      { href: "/admin/apparence", label: "Apparence", icon: "paint", perm: "restaurant.configurer" },
    ],
  },
  {
    title: "Carte",
    items: [
      { href: "/admin/categories", label: "Listes & catégories", icon: "book", perm: "carte.modifier" },
      { href: "/admin/produits", label: "Produits", icon: "chef", perm: "carte.modifier" },
      { href: "/admin/options", label: "Options & variantes", icon: "sliders", perm: "carte.modifier" },
      { href: "/admin/medias", label: "Médiathèque", icon: "image", perm: "carte.modifier" },
    ],
  },
  {
    title: "Équipe & salle",
    items: [
      { href: "/admin/service", label: "Service en direct", icon: "service", perm: "commandes.voir" },
      { href: "/responsable", label: "Espace responsable", icon: "compass", perm: "tables.affecter" },
      { href: "/salle", label: "Espace serveur", icon: "picnic", perm: "commandes.servir" },
      { href: "/cuisine", label: "Écran de cuisine", icon: "chef", perm: "preparation.changer" },
      { href: "/admin/utilisateurs", label: "Utilisateurs", icon: "users", perm: "utilisateurs.gerer" },
      { href: "/admin/roles", label: "Rôles & droits", icon: "shield", perm: "utilisateurs.gerer" },
      { href: "/admin/tables", label: "Zones & tables", icon: "grid", perm: "salle.configurer" },
      { href: "/admin/plan", label: "Plan de salle", icon: "armchair", perm: "salle.configurer" },
      { href: "/admin/qr", label: "QR & sessions", icon: "qr", perm: "salle.configurer" },
    ],
  },
  {
    title: "Réglages",
    items: [
      { href: "/admin/commandes", label: "Commandes", icon: "bag", perm: "restaurant.configurer" },
      { href: "/admin/notifications", label: "Notifications", icon: "bell", perm: "restaurant.configurer" },
      { href: "/admin/addition", label: "Addition", icon: "receipt", perm: "restaurant.configurer" },
      { href: "/admin/connexions", label: "Connexions", icon: "link", perm: "restaurant.configurer" },
      { href: "/admin/securite", label: "Sécurité", icon: "lock", perm: "securite.gerer" },
      { href: "/admin/historique", label: "Historique", icon: "history", perm: "historique.consulter" },
      { href: "/admin/donnees", label: "Données", icon: "database", perm: "donnees.gerer" },
    ],
  },
];

export const EXTRA_CRUMBS: Record<string, string> = {
  "/admin/publication": "Publication",
  "/admin/apercu": "Aperçu client",
  "/admin/utilisateurs/inviter": "Inviter un membre",
  "/admin/commandes/statuts": "Statuts & préparation",
  "/admin/qr/imprimer": "Supports à imprimer",
};
