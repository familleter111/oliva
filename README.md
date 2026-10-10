# Oliva

Application de restaurant : une carte publique sur `/`, la commande depuis la table, deux espaces pour le personnel de salle et une administration complète sous `/admin`.
Next.js (App Router), TypeScript, Tailwind. Toutes les données métier tiennent dans un classeur Excel, enregistré sur le disque du serveur ou, pour un hébergement sans disque, dans une base PostgreSQL sous la même forme.

## Démarrage rapide

Prérequis : Node.js 22 ou plus récent.

```bash
npm install
npm run setup          # crée .env.local avec un secret aléatoire (ne remplace jamais un fichier existant)
```

Ouvrez `.env.local` et renseignez le premier administrateur :

```
OLIVA_ADMIN_EMAIL=vous@exemple.fr
OLIVA_ADMIN_PASSWORD=un mot de passe d'au moins 12 caractères
OLIVA_ADMIN_NAME=Prénom Nom
```

```bash
npm run admin:init     # crée le premier administrateur (ne fait rien s'il en existe déjà un)
npm run demo:seed      # facultatif : carte de démonstration (refusé si une carte existe déjà)
npm run dev            # http://localhost:3000 et http://localhost:3000/admin
```

Une fois le compte créé, retirez `OLIVA_ADMIN_PASSWORD` de `.env.local`. Seule une empreinte scrypt du mot de passe est enregistrée dans le classeur.

Il n'existe aucun mot de passe par défaut, et aucune commande ne réinitialise un compte ou des données : ni l'installation, ni le démarrage, ni une mise à jour.

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` puis `npm start` | Serveur de production |
| `npm run setup` | Crée `.env.local` s'il est absent |
| `npm run admin:init` | Crée le premier administrateur à partir des variables d'environnement |
| `npm run demo:seed` | Ajoute la carte de démonstration dans un stockage vide |
| `npm run storage:verifier` | Contrôle l'état enregistré sans rien écrire : lecture, schéma, identifiants, relations |
| `npm run base:verifier` | Contrôle la connexion à la base et au dépôt Blob, sans rien écrire |
| `npm run storage:restaurer -- <fichier.xlsx>` | Remet en place un classeur, application arrêtée |
| `npm run i18n:verifier` | Liste les textes de l'interface absents du dictionnaire anglais |
| `npm run typecheck` | Vérification TypeScript |
| `npm test` | Tests unitaires et d'intégration du stockage (93) |
| `npm run test:e2e` | Tests HTTP sur le serveur de production (114), après `npm run build` |
| `npm run test:ui` | Parcours dans Chrome, audit d'accessibilité, traduction et débordements, après `npm run build` |

`test:ui` a besoin de Chrome ou d'Edge installé. Indiquez un autre chemin avec `CHROME_PATH` si nécessaire.
Les trois suites de tests travaillent dans `tests/.tmp/` et ne touchent jamais à votre dossier `storage/`.

## Variables d'environnement

| Variable | Rôle |
| --- | --- |
| `OLIVA_SECRET` | Secret technique, 32 caractères minimum. Signe les jetons de session et la protection CSRF. |
| `OLIVA_STORAGE_DIR` | Dossier de stockage privé. Par défaut `./storage`. Refusé s'il se trouve sous `public/`. |
| `DATABASE_URL` | Base PostgreSQL. Renseignée, elle remplace le classeur sur disque. `POSTGRES_URL` et `OLIVA_DATABASE_URL` sont acceptées aussi. |
| `BLOB_READ_WRITE_TOKEN` | Dépôt Vercel Blob pour les images, les sauvegardes et les archives. Fourni par l'hébergeur. |
| `OLIVA_PUBLIC_URL` | URL publique, utilisée pour les QR codes et les liens d'invitation. |
| `OLIVA_ADMIN_EMAIL`, `OLIVA_ADMIN_PASSWORD`, `OLIVA_ADMIN_NAME` | Lues uniquement par `npm run admin:init`. |
| `OLIVA_COOKIE_SECURE` | `false` uniquement pour tester un build de production en HTTP local. |

Les secrets restent dans l'environnement. Ils ne sont jamais écrits dans le classeur.

## Organisation du code

```
src/app/                      pages et routes
  page.tsx                    carte publique
  table/[tableId]/            parcours client d'une table : accueil, menu et panier, commandes, addition, table en direct
  api/table/[...chemin]/      API des convives (jeton de table, sans compte)
  media/[fichier]/            images publiées
  admin/login, invitation     accès du personnel, point d'entrée commun à tous les rôles
  admin/(panel)/              les 25 écrans d'administration
  salle/                      espace serveur : mes tables, à servir, demandes clients, additions
  responsable/                espace responsable de salle : vue d'ensemble, plan, équipe, service, demandes, sessions
  api/admin/[...chemin]/      toutes les opérations de l'administration
  api/salle, api/responsable  actions des espaces de salle
src/proxy.ts                  redirection vers la connexion et politique de sécurité du contenu
src/lib/server/
  storage.ts, workbook.ts     service de stockage Excel (lecture, verrou, écriture atomique)
  schema.ts, defaults.ts      feuilles, colonnes, relations, valeurs initiales
  auth/                       mots de passe, sessions, CSRF, limitation des tentatives
  api/                        répartiteur et table des routes
  services/                   images, publication, carte publique, panier, import et export, sauvegardes, QR
src/components/               composants d'interface réutilisables
scripts/                      commandes d'installation et de maintenance
demo/media/                   photos de démonstration (crédits dans CREDITS.md)
tests/                        unit, e2e, ui
```

## Stockage Excel

```
storage/
  data/oliva.xlsx             classeur principal (44 feuilles typées et une feuille _Meta)
  data/oliva.precedent.xlsx   copie de l'état précédant la dernière écriture
  data/oliva.lock             verrou de l'instance qui écrit
  data/archives/              historique ancien, au-delà de 5 000 lignes
  media/                      images au format WebP
  backups/                    sauvegardes manuelles, backups/auto/ pour les automatiques
  tmp/                        fichiers temporaires d'écriture
```

Le dossier est hors de `public/` et aucune route ne sert un fichier `.xlsx`. Les exports passent par l'API d'administration, après contrôle de la session et de la permission.

Conventions du classeur : montants en centimes entiers, dates au format ISO en texte, identifiants stables, listes en JSON. Les mots de passe n'y figurent que sous forme d'empreintes scrypt, les jetons sous forme d'empreintes HMAC.

Mise à niveau : un enregistrement créé par une version précédente est lu tel quel. Les feuilles ajoutées depuis (les demandes des clients en version 2, les additions de table en version 3, les demandes d'accès en version 4) sont considérées comme vides, et une colonne ajoutée depuis (le jeton de QR code des tables, en version 4) prend sa valeur par défaut. Le fichier n'est réécrit qu'au moment d'une vraie sauvegarde, et aucune donnée existante n'est modifiée.

### Les deux stockages

Le modèle de données ne change pas d'un stockage à l'autre : les mêmes 44 feuilles, les mêmes colonnes, les mêmes contrôles.

| | Disque | Base de données |
| --- | --- | --- |
| Déclenché par | configuration par défaut | `DATABASE_URL` renseignée |
| État | `storage/data/oliva.xlsx` | une ligne de la table `oliva_etat` |
| Version précédente | `oliva.precedent.xlsx` | colonne `precedent` de la même ligne |
| Écritures concurrentes | verrou de fichier, une seule instance | comparaison de révision, plusieurs serveurs acceptés |
| Images et sauvegardes | `storage/media`, `storage/backups` | dépôt Blob aux mêmes chemins |
| Rafraîchissement en direct | bus en mémoire | bus en mémoire et relecture de la révision toutes les 4 secondes |

La table est créée au premier démarrage et mise à niveau sans rien perdre. Les exports, les imports et les sauvegardes restent des fichiers `.xlsx` dans les deux cas.

### Déroulement d'une écriture

Toute modification passe par `transaction()` dans `src/lib/server/storage.ts` :

1. contrôle de la session et de la permission ;
2. prise du verrou, qui couvre toute la séquence lecture, modification, écriture ;
3. lecture de la dernière version du classeur ;
4. validation des données et des relations ;
5. application du changement, ligne d'historique et clé d'idempotence ;
6. écriture dans un fichier temporaire, synchronisation sur le disque ;
7. relecture du fichier temporaire et comparaison de son empreinte avec les données attendues ;
8. copie de l'ancien classeur vers `oliva.precedent.xlsx`, puis remplacement atomique ;
9. libération du verrou, et seulement alors réponse de succès.

En base, les étapes 6 à 8 deviennent une seule transaction SQL : l'écriture n'est acceptée que si la révision lue au départ n'a pas bougé, le contenu enregistré est relu et comparé avant la validation, et la version précédente est conservée dans la même ligne. Si un autre serveur est passé entre-temps, le travail est refait sur l'état frais plutôt qu'appliqué à l'aveugle.

Si une étape échoue, le classeur en place n'est pas modifié et l'appelant reçoit une erreur. Aucun succès n'est annoncé avant l'enregistrement effectif.

### Garde-fous

- Sur disque, une seule instance peut écrire : une seconde instance démarrée sur le même dossier est refusée tant que la première est vivante. En base, plusieurs serveurs peuvent écrire, et chaque écriture est acceptée seulement si personne n'a modifié l'état entre-temps.
- Un enregistrement illisible n'est jamais remplacé par un enregistrement vide : l'application s'arrête sur une erreur explicite et vous oriente vers la version précédente ou une sauvegarde.
- Un classeur vide n'est créé que lors de la toute première initialisation d'un dossier vierge.
- Une sauvegarde automatique est prise au plus une fois par heure lors d'une écriture, les 24 dernières sont conservées.
- Les exports traitent les textes saisis comme du texte : une cellule qui commence par `=`, `+`, `-` ou `@` est neutralisée.
- Un import est d'abord analysé. S'il contient une seule ligne en erreur, rien n'est écrit.

### Limites à connaître

Ce stockage convient à un restaurant, pas à une plateforme.

- Chaque écriture réécrit le classeur entier : environ 20 écritures par seconde mesurées sur un poste de développement avec la carte de démonstration. Le débit baisse quand le classeur grossit.
- Les écritures sont traitées l'une après l'autre. Les lectures utilisent une copie en mémoire.
- Visez quelques milliers de lignes par feuille. L'historique est archivé automatiquement au-delà de 5 000 lignes.
- Sur disque, un seul processus Node, sans montée en charge horizontale. En base, plusieurs serveurs sont possibles, mais chaque écriture réécrit l'état complet : la limite de débit reste la même.
- Si l'activité dépasse ces ordres de grandeur, il faudra découper l'état en vraies tables. `src/lib/server/store/` est le seul point à remplacer.

## Sécurité

- Chaque page du personnel et chaque route `/api/admin/...`, `/api/salle/...` et `/api/responsable/...` contrôle la session et la permission sur le serveur. Le menu masqué et la redirection du proxy ne sont que du confort.
- Trois espaces, trois portes d'entrée : `admin.acces` ouvre `/admin`, `tables.affecter` ouvre `/responsable`, `commandes.servir` ouvre `/salle`. Après la connexion, le serveur renvoie chaque compte vers son espace. Un serveur n'entre pas dans l'administration, et un rôle sans aucun de ces droits reçoit « Accès refusé ».
- Dans les espaces de salle, la portée du rôle limite les tables visibles : « toutes » pour un responsable ou un administrateur, les tables affectées pour un serveur. Elle est recalculée sur le serveur à chaque lecture et à chaque écriture : l'identifiant d'une table, d'une commande ou d'une addition dans une URL ne donne aucun accès, la page répond « introuvable ».
- Sessions à durée limitée (inactivité et durée maximale réglables dans Sécurité), cookie `HttpOnly`, `SameSite=Lax`, `Secure` en production.
- Protection CSRF : jeton lié à la session dans l'en-tête `x-oliva-csrf`, et contrôle de l'origine de la requête.
- Tentatives de connexion limitées, avec blocage temporaire. Le compteur est en mémoire : il repart de zéro au redémarrage.
- Suspendre un compte ou réinitialiser son mot de passe révoque ses sessions immédiatement. Un changement de rôle ou de droits s'applique dès la requête suivante.
- Le dernier administrateur actif ne peut être ni supprimé, ni suspendu, ni rétrogradé.
- Politique de sécurité du contenu avec nonce, en-têtes de sécurité, corps JSON limité à 256 Ko.
- Un identifiant de table dans une URL ne donne aucun droit : sans admission, `/table/[tableId]` n'affiche que l'écran d'accueil (voir « Commande depuis la table »).

## Commande depuis la table

La carte est visible par tous sur `/`, sans rien demander. L'accueil annonce le restaurant, met en avant quelques plats de la carte publiée (« Nos coups de cœur » : le premier plat disponible de chaque catégorie, au plus quatre), puis déroule la carte entière. Pour commander, le client rejoint une table par l'un des deux chemins, et aucun compte n'est créé :

- **Le QR code de la table**, qui ouvre `/table/[tableId]`.
- **« Choisir ma table » depuis l'accueil**, qui ouvre la liste des tables en service, puis la même page.

Dans les deux cas, le client annonce son prénom et demande la table. Le personnel le reconnaît de vive voix, puis l'installe depuis son espace : la session de la table s'ouvre si besoin, et le jeton déjà remis au client devient celui de son participant. Tant que personne n'a confirmé, la demande n'ouvre aucun droit : ni panier, ni commande, ni nom de convive. Une demande oubliée expire au bout de deux heures.

Le code à quatre chiffres reste disponible pour les restaurants qui le préfèrent (politique « code de session ») : le client peut toujours saisir le code, ou prévenir l'équipe s'il ne l'a pas.

1. Le personnel ouvre une session pour la table (QR & sessions, onglet Sessions), ou laisse la première arrivée l'ouvrir.
2. Le client saisit le code s'il en a un, et son prénom si le restaurant le demande. Le serveur lui remet un jeton aléatoire dans un cookie `HttpOnly`, `SameSite=Lax`, `Secure` en production.
3. Toute la table partage un seul panier, mis à jour en direct sur chaque appareil. Chacun ajoute des plats, choisit ses options, précise une instruction.
4. L'envoi en cuisine fige la commande : libellés, options et prix. Les commandes envoyées ne sont plus modifiables par les clients.
5. Le client suit l'avancement, consulte l'addition, estime un partage à parts égales et peut appeler l'équipe ou demander l'addition.
6. Le personnel suit tout dans **Service en direct** (`/admin/service`) : commandes à faire avancer, demandes à traiter, arrivées à valider.
7. À la fermeture de la session, tous les accès sont révoqués. Les prochains occupants ne voient jamais les commandes précédentes.

Garanties tenues par le serveur :

- Sans jeton valide, la page d'une table ne montre que l'écran d'accueil : ni code, ni panier, ni commande, ni nom de convive.
- La liste publique des tables ne donne que leur nom, leur zone, leur capacité et le fait qu'un service soit en cours. Choisir une table n'accorde rien.
- Le navigateur n'envoie jamais de prix. Chaque montant est recalculé à partir de la carte publiée.
- Chaque opération passe par une transaction du stockage. Une clé d'idempotence empêche une commande de partir deux fois, même en cas de double clic ou de confirmations simultanées.
- Les essais de code sont limités par adresse et par table, avec blocage temporaire. Le compteur est en mémoire. Les demandes d'accès sont limitées de la même façon, et une table n'accepte pas plus de douze demandes en attente.
- Les requêtes d'écriture venant d'une autre origine sont refusées.

Sur téléphone et tablette, le parcours client a ses propres écrans : barre d'onglets Menu / Panier / Commandes / Service, fiche de plat en deux étapes, filtres en feuille, écran « C'est envoyé ». Si le réseau se coupe pendant l'envoi, un écran de vérification reprend la même clé d'idempotence : la commande ne part jamais deux fois.

Limites actuelles :

- Le règlement se fait auprès du personnel. Aucun paiement n'est encaissé par l'application.
- Les frais de service, s'ils sont activés, sont ajoutés au total affiché. Aucun calcul de taxe n'est fait.
- « Mes envies » est gardé sur l'appareil du client, pas sur le serveur.
- Aucune impression automatique ni alerte sonore : un écran de service doit rester ouvert pendant le service.

## Espace serveur

Un membre qui a le droit « Marquer servi » (`commandes.servir`) arrive sur `/salle` après sa connexion. Il ne voit que les tables qui lui sont affectées, sauf si son rôle a la portée « toutes ».

- **Mes tables** : les tables dont il a la charge, leur état, et « À faire maintenant », la file des prochaines actions.
- **À servir** : les commandes signalées prêtes par la cuisine. Le détail rappelle les instructions des convives et permet de marquer la commande servie.
- **Demandes clients** : prendre une demande en charge, puis la marquer traitée. La table voit « Prise en charge : notre équipe arrive » dès la prise en charge.
- **Additions** : à remettre, remises, clôturées. L'addition s'imprime depuis le navigateur et se marque remise en deux temps.

La remise de l'addition ne vaut pas encaissement : elle enregistre seulement que l'addition a été apportée à la table. Le règlement reste traité par l'organisation du restaurant.

## Espace responsable de salle

Un membre qui a le droit « Affecter les tables » (`tables.affecter`) arrive sur `/responsable`.

- **Vue d'ensemble** : tables occupées, convives, commandes à servir, demandes en attente, plan de salle en direct, priorités du service et équipe en service.
- **Plan de salle** : le plan dessiné dans l'administration, affiché en lecture seule avec l'état réel de chaque table, le serveur affecté, les demandes en cours et les dernières actions journalisées. Sans plan enregistré, les tables sont présentées en grille.
- **Équipe & affectations** : charge de chaque serveur et répartition des tables. Un transfert peut porter une note de passation, conservée dans l'historique. Les commandes et les demandes ouvertes restent attachées à la table.
- **Suivi du service** : toutes les commandes de la salle, filtrables par état et par serveur.
- **Demandes clients** : attribuer une demande à un membre précis. Elle passe « en cours » à son nom, et le convive le voit aussitôt.
- **Sessions de table** : ouvrir une session, changer son code, fermer une session. La fermeture affiche une liste de contrôle calculée sur l'état réel (commandes servies, addition remise) et rappelle que le règlement se fait à la caisse, en dehors de l'application.

## Brouillon et publication

Les modifications de la carte, de l'apparence et des informations du restaurant sont enregistrées tout de suite dans le classeur, comme brouillon. Le public ne voit que la dernière version publiée. L'écran Publication liste les changements en attente, permet de publier maintenant ou de programmer une date, et de revenir à l'une des cinq versions précédentes.

Exception voulue : la disponibilité d'un produit ou d'une option (rupture) s'applique en direct, sans publication.

## Langues : FR / EN

Un sélecteur FR / EN est présent sur toutes les pages. Le choix est gardé dans le cookie `oliva_langue`.

- Le code source reste en français. En anglais, la page affichée est traduite automatiquement dans le navigateur par `src/lib/i18n/engine.ts`, à partir du dictionnaire `src/lib/i18n/en.json` : textes, libellés, notifications et messages d'erreur. Aucun service externe n'est appelé.
- Après avoir ajouté ou modifié un texte de l'interface, lancez `npm run i18n:verifier` : il liste les textes qui manquent au dictionnaire. Clé = le texte français, où `#` remplace un nombre et `{}` une valeur insérée par le code. Une valeur vide signifie « ne pas traduire ».
- Les contenus saisis par le restaurant (noms de plats, descriptions) ne sont pas dans le dictionnaire, à l'exception de la carte de démonstration. Pour les afficher en anglais, ajoutez la langue dans Apparence puis renseignez « Textes à traduire » : la carte publique utilise ces traductions quand le visiteur choisit EN.
- À défaut, sur les navigateurs qui proposent un traducteur intégré (Chrome sur ordinateur), les phrases restantes lui sont confiées, sur l'appareil du visiteur. Ailleurs, elles restent en français.
- Les dates et les montants gardent le format français.

## QR codes des tables

Le QR code d'une table encode `https://votre-domaine/table/<identifiant>`, avec le jeton `k` de l'affichette en cours. Il identifie la table : il n'autorise rien par lui-même.

- L'administration (**QR & sessions**) affiche le QR code de chaque table, son adresse, et une page d'impression pour toute la salle.
- Le serveur et le responsable de salle peuvent **remplacer le QR code** d'une table depuis leur espace, quand une affichette est abîmée, perdue ou remplacée. Les anciennes affichettes affichent alors « Ce QR code a été remplacé » et proposent de choisir sa table depuis la carte.
- Une table dont le QR code n'a jamais été remplacé accepte toutes les affichettes, y compris celles imprimées avant cette fonction.

## Images

Les fichiers importés sont contrôlés sur leur contenu réel (JPEG, PNG ou WebP, 10 Mo et 60 millions de pixels au maximum), puis réencodés en WebP sous un nom généré. Trois variantes plus légères sont produites pour les petits écrans. Seules les images utilisées par la version publiée sont servies sans connexion. Une image utilisée ne peut pas être supprimée.

## Hébergement

Oliva a besoin d'**un seul serveur Node avec un disque persistant**.

Compatible : un serveur privé virtuel, une machine dédiée, ou une plateforme de conteneurs avec volume persistant et une seule instance (Railway, Render, Fly.io avec un volume, par exemple).

Sur une plateforme sans serveur (Vercel, Netlify, fonctions Lambda), le disque est en lecture seule et recréé à chaque requête : il faut alors une base et un dépôt de fichiers, voir plus bas. Sans eux, l'application refuse de démarrer et l'explique, plutôt que d'écrire un classeur vide qui disparaîtrait à la requête suivante. La cause exacte est lisible sur `/api/sante`, qui sert aussi de sonde d'état à l'hébergeur.

### Avec Docker

Une image, un volume, une seule instance :

```bash
cp .env.example .env            # renseignez au moins OLIVA_SECRET
docker compose up -d --build
docker compose exec oliva npm run admin:init   # une seule fois, avec OLIVA_ADMIN_EMAIL et OLIVA_ADMIN_PASSWORD
```

Le volume `oliva-donnees` est monté sur `/data` et contient tout le stockage. Il survit aux reconstructions de l'image : ne le supprimez pas. Les commandes d'exploitation s'exécutent dans le conteneur, par exemple `docker compose exec oliva npm run storage:verifier`.

### Sur une plateforme d'hébergement

Deux descripteurs prêts à l'emploi, tous deux fondés sur le `Dockerfile` :

| Fichier | Plateforme | Mise en place |
| --- | --- | --- |
| `fly.toml` | Fly.io | `fly launch --no-deploy --copy-config`, puis `fly volumes create oliva_donnees --size 3`, `fly secrets set OLIVA_SECRET=...`, `fly deploy` |
| `render.yaml` | Render | Nouveau Blueprint à partir du dépôt, puis saisie des variables dans le tableau de bord |

Dans les deux cas : une seule instance, un disque monté sur `/data`, et `/api/sante` comme sonde d'état. Le premier administrateur se crée ensuite une seule fois, dans la console de la plateforme : `npm run admin:init`, avec `OLIVA_ADMIN_EMAIL` et `OLIVA_ADMIN_PASSWORD` définis. La commande ne touche à rien si un administrateur existe déjà.

Un disque persistant est une option payante chez Render, et le volume Fly.io est facturé au gigaoctet. C'est le prix d'un stockage qui survit aux redémarrages.

### Sur Vercel, avec une base de données

Il n'y a pas de disque, donc les deux services suivants sont nécessaires, tous deux créés depuis l'onglet Storage du projet :

1. **Postgres (Neon)**, connecté au projet. Vercel ajoute seul `DATABASE_URL`.
2. **Blob Store**, connecté au même projet, pour les images, les sauvegardes et les archives. Vercel ajoute seul `BLOB_READ_WRITE_TOKEN`.

Ajoutez ensuite `OLIVA_SECRET` et `OLIVA_PUBLIC_URL` dans les variables du projet, puis déployez.

Le premier administrateur se crée depuis votre poste, une seule fois, en pointant la base de production :

```bash
# dans .env.local, le temps de la commande
DATABASE_URL=postgres://...            # copié depuis Vercel
OLIVA_ADMIN_EMAIL=vous@exemple.fr
OLIVA_ADMIN_PASSWORD=un mot de passe d'au moins 12 caractères

npm run base:verifier   # connexion, table, dépôt Blob : aucun écrit
npm run admin:init      # ne fait rien si un administrateur existe déjà
```

Retirez ensuite ces lignes de `.env.local`. Points à connaître :

- Le rafraîchissement en direct relit la révision toutes les 4 secondes, puisque les serveurs ne partagent pas de mémoire. Un flux coupé par la plateforme est rouvert seul par le navigateur.
- Chaque écriture transporte l'état complet. C'est tenable pour un restaurant, pas pour un catalogue de grande taille.
- Les sauvegardes et les exports restent des fichiers `.xlsx`, déposés dans le Blob et téléchargeables depuis l'administration.

### Sans Docker

Mise en place :

```bash
npm ci
npm run build
# variables à définir dans l'environnement du serveur :
#   OLIVA_SECRET, OLIVA_PUBLIC_URL=https://votre-domaine, OLIVA_STORAGE_DIR=/var/lib/oliva
npm run admin:init     # une seule fois
npm start              # derrière un proxy inverse HTTPS
```

- Placez `OLIVA_STORAGE_DIR` sur le disque persistant, en dehors du dossier de l'application, pour qu'un déploiement ne l'écrase jamais.
- Servez le site en HTTPS derrière un proxy inverse (Caddy, Nginx), de préférence en HTTP/2. Désactivez la mise en tampon des réponses pour `/api/admin/evenements`, qui est un flux d'événements.
- Gardez une seule instance. Pour mettre à jour : arrêtez l'application, déployez, relancez.
- Copiez régulièrement le dossier de stockage complet hors du serveur. Les sauvegardes internes protègent d'une erreur de manipulation, pas d'une panne de disque.
- `GET /api/sante` renvoie `{ "ok": true }` quand le stockage répond, et sinon la cause en clair avec le code 503. Aucune donnée du restaurant ni aucun secret n'y figure.

## Sauvegarde et récupération

Depuis l'administration, écran Import et export, onglet Sauvegardes : créer, télécharger, vérifier puis restaurer une sauvegarde. La restauration demande une confirmation saisie, conserve l'état courant dans une sauvegarde de sécurité et déconnecte les autres sessions.

Si l'application ne démarre plus à cause d'un classeur endommagé :

```bash
npm run storage:verifier
npm run storage:restaurer -- storage/data/oliva.precedent.xlsx
```

L'ancien classeur est conservé à côté, rien n'est supprimé.

## Tests

- `npm test` : stockage (persistance après redémarrage, écritures concurrentes, panne disque sans faux succès, classeur corrompu jamais remplacé, seconde instance refusée), demandes d'accès à une table (aucun droit avant confirmation, session ouverte à l'acceptation, QR code remplacé), forme JSON de la base (aller-retour fidèle, colonnes inconnues écartées, types faux refusés, mise à niveau d'un enregistrement ancien) et dépôt de fichiers, authentification et suspension, publication, panier partagé, parcours client d'une table (accueil sans fuite, instructions, demandes, statuts selon les droits, fermeture de session, mise à niveau d'un classeur de la version précédente), import et export, sauvegardes.
- `npm run test:e2e` : accès public sans connexion, refus des pages et de l'API d'administration, classeur inaccessible par URL, CSRF, permissions, envois de fichiers, import invalide sans écrasement, données intactes après redémarrage du serveur, sécurité des tables (identifiant seul refusé, mauvais code, jeton inventé, origine étrangère, prix imposé par le serveur, double confirmation, session fermée, verrouillage des essais de code).
- `npm run test:ui` : parcours de l'administration, parcours client complet avec deux convives et l'écran de service, le même parcours sur téléphone (coupure du réseau comprise), parcours de l'espace serveur et de l'espace responsable (portée du rôle, transfert de table, attribution d'une demande, clôture d'une session), traduction en anglais, audit axe-core (WCAG 2.1 A et AA) des pages et des états ouverts, absence de débordement de 360 à 1280 px. Variante : `OLIVA_UI_ONLY=client|serveur|responsable|traduction|debordements npm run test:ui` pour ne rejouer qu'une partie.

## État du projet

### En place et enregistré dans Excel

- Les 25 écrans d'administration : vue d'ensemble, établissement, horaires et fermetures, apparence et traductions, listes et catégories, produits et fiche produit, options et variantes, médiathèque, service en direct, utilisateurs et invitations, rôles et droits, zones et tables, plan de salle, QR codes et sessions de table, réglages du panier, statuts et acheminement, notifications, addition et taxes, connexions, sécurité, historique, import et export, sauvegardes, publication, aperçu.
- La carte publique sur `/`.
- Le parcours client d'une table sur `/table/[tableId]`, sur ordinateur comme sur téléphone : accueil avec code, menu et panier partagé, fiche produit, instruction, envoi en cuisine, suivi des commandes, addition et partage, demandes à l'équipe, table en direct.
- L'espace serveur sur `/salle` : mes tables, à servir, demandes clients, additions.
- L'espace responsable de salle sur `/responsable` : vue d'ensemble, plan de salle, équipe et affectations, suivi du service, demandes clients, sessions de table.

### Reste à connecter

Ces éléments apparaissent comme « Non configuré » dans l'administration. Rien n'est simulé.

- Écrans dédiés à la cuisine et au bar, filtrés par station. Service en direct en tient lieu pour l'instant.
- Annulation d'une commande par le personnel.
- Messagerie interne entre le responsable et ses serveurs.
- Envoi d'e-mails. En attendant, le lien d'invitation est affiché pour être transmis à la main.
- Paiement en ligne, logiciel de caisse, imprimantes de tickets, appairage d'appareils.
- Double authentification.
- Diffusion réelle des notifications (les règles sont enregistrées, rien n'est émis).
- Calcul des taxes sur une addition (les profils sont enregistrés, aucun calcul n'est branché).
