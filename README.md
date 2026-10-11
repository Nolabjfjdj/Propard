# Propard

Propard est une plateforme de communication web développée indépendamment par **BananeVR**. Elle propose une messagerie privée et de groupe, des appels en temps réel, des outils de gestion sociale et des fonctions de sécurité.

- Site : https://propard.site
- Dépôt : https://github.com/Nolabjfjdj/Propard
- Contact : support@propard.site
- Langue principale : français
- Licence : propriétaire, tous droits réservés (voir `LICENSE` et la section Licence ci-dessous)

> **État du projet :** ce dépôt contient le code source publié pour inspection technique. Les changements ne sont pas considérés comme déployés sur le site tant qu'ils n'ont pas été fusionnés dans la branche de production et déployés par l'hébergeur.

## Fonctionnalités

- Création de compte et authentification par pseudo et mot de passe.
- Mots de passe hachés avec `bcryptjs`, sessions JWT et invalidation de sessions.
- Profils, avatars, surnoms d'amis, demandes d'amis et blocage.
- Messagerie privée en temps réel avec chiffrement côté client.
- Groupes avec propriétaires, administrateurs et membres.
- Messages de groupe chiffrés côté client, gestion des membres et versions de clés.
- Appels audio et vidéo privés ou de groupe via WebRTC, selon les fonctionnalités et capacités de l'appareil.
- Historique de fin d'appel : événement système, statut manqué/terminé, heures serveur de début et de fin, durée calculée. Les événements d'appel sont des métadonnées d'historique, pas des enregistrements audio ou vidéo.
- Notifications Web Push et notifications natives iOS selon la configuration.
- Service Worker, shell web hors ligne et mini-jeu hors ligne.
- Annonces globales et pages d'aide, de contact, de CGU et de politique de confidentialité.
- Signalements de messages ou d'une conversation, y compris un instantané fourni volontairement par la personne qui signale.
- Outils d'administration pour traiter les signalements et appliquer des mesures de modération.
- CAPTCHA Cloudflare Turnstile sur certaines actions sensibles ou répétées.
- Suppression de compte avec période de restauration de 30 jours, selon le parcours proposé par le service.

## Architecture

```text
Propard/
├── propard-backend/
│   ├── db/                 # Enregistrement des modèles / configuration de bases
│   ├── middleware/        # Authentification et limitation de débit
│   ├── models/             # Utilisateurs, messages, groupes, signalements...
│   ├── routes/             # API REST
│   ├── services/           # État des appels et notifications
│   ├── test/               # Tests Node.js
│   └── index.js            # Serveur Express et Socket.IO
├── propard-frontend/
│   ├── public/             # Service Worker, documents légaux, icônes et médias
│   ├── scripts/            # Configuration audio/push iOS
│   └── src/
│       ├── components/     # Chats, groupes, appels, profils...
│       ├── context/        # Authentification et thème
│       ├── pages/          # Pages de l'application
│       └── utils/          # API, chiffrement, notifications, Markdown
├── .github/workflows/      # Automatisation du dépôt
└── README.md
```

## Technologies

**Frontend**
- React, React Router et Vite
- Axios et Socket.IO Client
- Web Crypto API et IndexedDB
- WebRTC
- Service Worker, Cache API et Web Push
- Capacitor Push Notifications pour l'intégration native iOS

**Backend**
- Node.js et Express
- MongoDB avec Mongoose
- Socket.IO
- JSON Web Tokens et bcryptjs
- Web Push, Nodemailer et dotenv
- Cloudflare Turnstile pour certaines vérifications anti-robot
- Fournisseurs STUN/TURN, dont Metered lorsque configuré

Les versions exactes installées sont définies dans les fichiers `package.json` et `package-lock.json`.

## Chiffrement des messages

### Conversations privées

Le client utilise ECDH sur la courbe P-256 pour dériver une clé partagée et AES-256-GCM pour chiffrer les messages. Le serveur conserve le contenu chiffré et des métadonnées nécessaires au routage et à l'historique. Il conserve également les clés publiques nécessaires au protocole.

Une sauvegarde de la clé privée peut être chiffrée côté client avant d'être transmise au serveur. Le mécanisme de sauvegarde utilise PBKDF2-SHA-256 avec 600 000 itérations puis AES-256-GCM. La récupération dépend de la disponibilité de la sauvegarde, du mot de passe et des données locales nécessaires.

### Groupes

Les messages de groupe sont chiffrés côté client. Une clé de groupe est distribuée aux membres autorisés au moyen de paquets chiffrés. Le modèle conserve les membres, les rôles, les dates de lecture, la version de clé et les paquets de clés chiffrés. Le retrait d'un membre peut déclencher une rotation de clé pour les nouveaux messages.

Le chiffrement ne supprime pas toutes les métadonnées : le serveur doit notamment connaître l'auteur, la conversation ou le groupe, les dates, les relations de membres et l'état des messages. Le signalement volontaire d'un contenu constitue une exception importante : le client transmet à la modération un instantané déchiffré de l'historique sélectionné.

## Appels et historique

Les appels audio/vidéo utilisent WebRTC et des échanges de signalisation via le serveur. Selon la topologie réseau, les flux peuvent être directs ou utiliser un relais TURN. Les appels ne sont pas enregistrés comme fichiers audio ou vidéo par le code de l'historique.

À la fin d'un appel, le backend crée un événement dans la conversation. Sur la branche qui ajoute les champs d'historique, cet événement comporte des dates serveur de début et de fin, une durée en secondes et un marqueur de type événement d'appel. Ces événements servent à afficher l'historique ; ils ne prouvent pas à eux seuls l'identité d'une personne ni l'authenticité d'une capture d'écran externe. Les événements d'appel nouvellement créés sont protégés contre la modification et la suppression via les routes prévues à cet effet. Les anciens événements déjà modifiés et chiffrés avant l'ajout du marqueur ne peuvent pas tous être identifiés rétroactivement.

## Signalements et modération

L'utilisateur peut signaler un message ou une conversation privée/de groupe. Pour un signalement de conversation, le navigateur transmet volontairement un instantané pouvant contenir jusqu'à 2 000 messages, dans la limite de taille appliquée par l'API. Le contenu reçu est conservé avec le signalement pour examen par les personnes disposant de l'accès administratif approprié.

Les administrateurs peuvent consulter les signalements, en changer le statut et les supprimer. Les mesures de modération peuvent comprendre une restriction, une suspension ou un bannissement, avec invalidation des sessions selon le cas. Le chiffrement de bout en bout ne signifie donc pas qu'un contenu envoyé volontairement dans un signalement reste inaccessible à la modération.

## Sécurité et données personnelles

- Les routes protégées utilisent un jeton JWT transmis dans l'en-tête `Authorization: Bearer <token>`.
- Les mots de passe sont hachés, et non stockés en clair.
- Certaines opérations sont limitées en fréquence ; des CAPTCHA peuvent être demandés en cas d'abus présumé.
- Les abonnements Push stockent des données techniques nécessaires à la livraison des notifications.
- Le thème et certaines données techniques peuvent être conservés localement dans le navigateur ; les clés cryptographiques sont stockées dans IndexedDB selon le mécanisme du client.
- L'infrastructure d'hébergement, les bases de données et les fournisseurs tiers peuvent traiter leurs propres données techniques conformément à leurs conditions.
- Les documents de référence sont `propard-frontend/public/terms.html` et `propard-frontend/public/privacy.html`, ainsi que les pages React correspondantes. Ils doivent être synchronisés lors d'une évolution du service.

La documentation juridique décrit le fonctionnement observé dans le code, mais ne remplace pas un audit juridique ni un audit de sécurité indépendant. Toute affirmation de conformité doit être vérifiée en fonction du déploiement réel, des contrats fournisseurs, des durées de conservation configurées et des obligations applicables.

## Variables d'environnement

Les noms exacts dépendent des fonctions activées et du déploiement. Ne committez jamais de secrets.

Variables généralement utilisées :

- Base de données : `MONGO_URI` et, si configuré, les variables de connexion supplémentaires.
- Serveur : `PORT`, `FRONTEND_ORIGIN`.
- Authentification : `JWT_SECRET`.
- Administration : clés dédiées aux actions administratives, par exemple `ADMIN_KEY`, `ADMIN_KEY_ANNOUNCEMENT` et `ADMIN_KEY_REPORTS`.
- Web Push : `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
- Turnstile : `VITE_TURNSTILE_SITE_KEY` côté frontend et `TURNSTILE_SECRET_KEY` côté backend.
- STUN/TURN/Metered : variables `METERED_DOMAIN`, `METERED_SECRET_KEY` et variantes numérotées si plusieurs fournisseurs sont configurés.

Consultez le code et la configuration de déploiement pour la liste complète réellement utilisée. N'insérez pas de valeurs secrètes dans le dépôt, les tickets ou les journaux publics.

## Installation locale

Prérequis : une version de Node.js compatible avec les versions indiquées dans les manifests, npm et une instance MongoDB configurée.

Cloner le dépôt :

```bash
git clone https://github.com/Nolabjfjdj/Propard.git
cd Propard
```

Backend, dans un premier terminal :

```bash
cd propard-backend
npm install
npm start
```

Développement backend :

```bash
npm run dev
```

Frontend, dans un second terminal :

```bash
cd propard-frontend
npm install
npm run dev
```

Vérification frontend :

```bash
npm run build
npm run lint
```

Tests backend :

```bash
cd propard-backend
npm test
```

Le démarrage nécessite des variables d'environnement valides. Les appels, notifications, CAPTCHA et fonctions natives ne sont pleinement disponibles que lorsque les fournisseurs et autorisations correspondants sont configurés.

## Documents du service

- [Site Propard](https://propard.site)
- [Conditions générales d'utilisation](https://propard.site/terms/)
- [Politique de confidentialité](https://propard.site/privacy/)
- [Contact](mailto:support@propard.site)

Les documents juridiques du site sont destinés à informer les utilisateurs. Ils doivent refléter les fonctions réellement déployées, et non uniquement une branche de développement.

## Licence et propriété intellectuelle

Propard est un logiciel propriétaire. La publication du code source permet son inspection technique, mais ne constitue pas une licence open source et n'accorde pas automatiquement le droit de copier, modifier, redistribuer ou exploiter le logiciel.

Le nom Propard, son identité visuelle et le code original sont revendiqués par **BananeVR**, sous réserve des droits de tiers. Les dépendances restent soumises à leurs licences respectives. Toute utilisation non expressément autorisée nécessite une autorisation écrite préalable du titulaire des droits.
