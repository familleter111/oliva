/** Types partagés entre les pages serveur et leurs éditeurs navigateur. */

export interface MediaLite {
  id: string;
  nom: string;
  alt: string;
  thumb: string;
  src: string;
  largeur: number;
  hauteur: number;
  taille: number;
  format: string;
  categorie: string;
}

export interface Named {
  id: string;
  nom: string;
}
