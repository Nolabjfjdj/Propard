# Propard

> **Propard** est une plateforme web française de communication entre utilisateurs, développée avec **React**, **Vite**, **Node.js**, **Express**, **MongoDB**, **Mongoose** et **Socket.IO**.

Propard est un projet indépendant développé par **BananeVR**.

---

## 📌 À propos

Propard regroupe plusieurs outils de communication et d'interaction dans une même plateforme web.

Le projet est composé de deux applications principales :

- **Frontend** : application React/Vite exécutée dans le navigateur.
- **Backend** : serveur Node.js/Express qui fournit l'API, la messagerie temps réel, les appels et sert également le frontend compilé en production.

Les données persistantes sont stockées dans **MongoDB** via **Mongoose**.

Le projet utilise **Socket.IO** pour les communications temps réel et **WebRTC** pour les appels entre utilisateurs.

---

## ✨ Fonctionnalités

### 👤 Comptes

- Création de compte
- Connexion
- Authentification JWT
- Sessions avec jetons valables 30 jours
- Modification du profil
- Nom d'affichage
- Avatar
- Clé publique cryptographique
- Profil utilisateur

### 👥 Relations entre utilisateurs

- Recherche et interaction avec les utilisateurs
- Demandes d'amis
- Acceptation/refus des demandes
- Liste d'amis
- Surnoms personnalisés pour les amis
- Amis en commun
- Blocage et déblocage
- Statut en ligne/hors ligne

### 💬 Messagerie

- Messagerie entre amis
- Communication en temps réel avec Socket.IO
- Messages chiffrés côté client
- Édition des messages
- Suppression des messages
- Statut de lecture
- Notifications de nouveaux messages
- Protection contre l'envoi trop rapide de messages

### 🔐 Cryptographie

Propard utilise un système de chiffrement côté client pour les messages.

Les clés publiques sont enregistrées côté serveur afin de permettre aux clients de communiquer de manière chiffrée.

Le backend vérifie notamment la structure des clés publiques utilisées par Propard.

> **Important :** le terme « chiffrement côté client » ne signifie pas qu'une sécurité cryptographique parfaite ou qu'un protocole E2EE professionnellement audité est garanti. Le système doit être considéré comme une implémentation propre au projet et non comme un protocole cryptographique certifié.

### 📞 Appels

Propard intègre une infrastructure d'appels basée sur :

- WebRTC
- Socket.IO pour la signalisation
- Serveurs STUN
- Serveurs TURN

Les appels sont actuellement limités aux utilisateurs autorisés à communiquer entre eux.

### ⚡ Temps réel

Socket.IO est utilisé notamment pour :

- les nouveaux messages ;
- les changements de présence ;
- les appels ;
- les offres WebRTC ;
- les réponses WebRTC ;
- les ICE candidates ;
- la fin des appels.

Le backend prend également en charge plusieurs connexions simultanées pour un même compte.

Ainsi, un utilisateur connecté sur plusieurs onglets ou appareils reste considéré comme en ligne tant qu'au moins une connexion Socket.IO est active.

### 📢 Annonces

Propard possède un système d'annonces administratives.

Une annonce possède notamment :

- un titre ;
- un contenu ;
- un état actif/inactif ;
- une date de création.

Les utilisateurs peuvent également conserver l'information indiquant qu'une annonce a été acceptée.

### 🛡️ Administration

Le backend contient une API d'administration destinée aux fonctionnalités réservées aux comptes disposant des autorisations nécessaires.

### 🚨 Signalements

Propard possède un système de signalement permettant de transmettre des contenus ou comportements à la modération.

Le backend contient également les mécanismes nécessaires au traitement des signalements.

### 📧 E-mails

Le backend utilise **Nodemailer** pour les fonctionnalités nécessitant l'envoi d'e-mails.

### 🗑️ Suppression de compte

La suppression d'un compte est organisée en deux étapes.

Lorsqu'un utilisateur demande la suppression :

1. le compte est anonymisé ;
2. le pseudonyme original est conservé temporairement ;
3. une période de restauration de **30 jours** commence ;
4. l'utilisateur peut restaurer son compte pendant cette période ;
5. après expiration, le compte est définitivement anonymisé.

Une suppression définitive immédiate est également disponible via l'API dédiée.

---

# 🧱 Architecture

```text
                         ┌──────────────────────┐
                         │      Utilisateur     │
                         │      Navigateur      │
                         └──────────┬───────────┘
                                    │
                                  HTTPS
                                    │
                                    ▼
                    ┌────────────────────────────┐
                    │          Frontend          │
                    │                            │
                    │       React + Vite         │
                    │                            │
                    │  ├─ Pages                  │
                    │  ├─ Components             │
                    │  ├─ Context               │
                    │  ├─ Utils                 │
                    │  └─ Socket.IO Client      │
                    └──────────────┬─────────────┘
                                   │
                         HTTP / Socket.IO
                                   │
                                   ▼
                    ┌────────────────────────────┐
                    │          Backend           │
                    │                            │
                    │      Node.js + Express     │
                    │                            │
                    │  ├─ Auth                   │
                    │  ├─ Friends                │
                    │  ├─ Messages               │
                    │  ├─ Profiles               │
                    │  ├─ Announcements          │
                    │  ├─ Reports                │
                    │  ├─ Administration         │
                    │  └─ TURN / WebRTC          │
                    └──────────────┬─────────────┘
                                   │
                                   ▼
                         ┌──────────────────┐
                         │     MongoDB      │
                         │                  │
                         │  Users           │
                         │  Messages        │
                         │  Announcements   │
                         └──────────────────┘
```

---

# 📁 Structure du dépôt

```text
Propard/
│
├── propard-backend/
│   │
│   ├── middleware/
│   │   ├── auth.js
│   │   └── rateLimit.js
│   │
│   ├── models/
│   │   ├── Announcement.js
│   │   ├── Message.js
│   │   └── User.js
│   │
│   ├── routes/
│   │   ├── admin.js
│   │   ├── announcements.js
│   │   ├── auth.js
│   │   ├── friends.js
│   │   ├── reports.js
│   │   └── turn.js
│   │
│   ├── utils/
│   │
│   ├── index.js
│   ├── package.json
│   └── package-lock.json
│
├── propard-frontend/
│   │
│   ├── public/
│   │
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   ├── context/
│   │   ├── pages/
│   │   ├── utils/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── index.css
│   │   ├── main.jsx
│   │   └── socket.js
│   │
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
│
├── .gitignore
├── LICENSE
└── README.md
```

> La structure peut évoluer au fil du développement. Le dépôt reste la référence pour connaître l'organisation exacte des fichiers.

---

# 🖥️ Frontend

Le frontend est une application **React** construite avec **Vite**.

## Technologies

- React 19
- React DOM
- React Router
- Axios
- Socket.IO Client
- Vite
- ESLint
- ESLint React Hooks
- ESLint React Refresh

## Scripts disponibles

Depuis `propard-frontend/` :

### Installation

```bash
npm install
```

### Développement

```bash
npm run dev
```

### Build de production

```bash
npm run build
```

### Vérification ESLint

```bash
npm run lint
```

### Prévisualisation du build

```bash
npm run preview
```

---

# ⚙️ Backend

Le backend est une application **Node.js + Express**.

Il gère notamment :

- l'authentification ;
- les comptes ;
- les profils ;
- les amis ;
- les messages ;
- les annonces ;
- les signalements ;
- l'administration ;
- les informations TURN ;
- les communications Socket.IO ;
- la signalisation WebRTC.

Le backend peut également servir directement le frontend compilé depuis son dossier `dist`.

---

# 📦 Technologies backend

Le backend utilise notamment :

- Node.js
- Express 5
- MongoDB
- Mongoose
- JSON Web Token
- bcryptjs
- Socket.IO
- Nodemailer
- dotenv
- CORS
- Nodemon pour le développement

---

# 🔑 Authentification

Propard utilise des **JSON Web Tokens (JWT)**.

Lors de l'inscription ou de la connexion, le backend génère un token associé au compte.

Les tokens ont actuellement une durée de validité de **30 jours**.

Les mots de passe ne sont pas stockés directement : ils sont hachés avec **bcryptjs**.

Les routes protégées utilisent le middleware :

```text
propard-backend/middleware/auth.js
```

---

# 🛡️ Protection contre les abus

Le backend possède un système de limitation de fréquence pour certaines opérations sensibles.

Par exemple :

- les connexions ;
- les inscriptions ;
- l'envoi trop rapide de messages.

Les limites sont gérées par :

```text
propard-backend/middleware/rateLimit.js
```

Le backend est également configuré pour prendre en compte le proxy inverse utilisé en production.

---

# 👤 Profils utilisateurs

Le modèle `User` contient notamment :

```text
username
displayName
avatar
password
ipAlias
publicKey
realUsername
pendingDeletionAt
friends
friendRequests
blockedUsers
isOnline
acceptedAnnouncements
createdAt
```

Le profil public peut notamment exposer :

- username ;
- nom d'affichage ;
- avatar ;
- alias IP ;
- clé publique ;
- statut en ligne ;
- informations liées à la relation avec le visiteur ;
- amis en commun.

Certaines informations internes, comme le mot de passe et le nom d'utilisateur temporairement conservé pour une suppression différée, ne sont pas exposées au client.

---

# 🌐 Alias IP

Propard attribue aux comptes un `ipAlias`.

Cet alias est généré aléatoirement et ne correspond pas directement à l'adresse IP réelle de l'utilisateur.

Il sert notamment à disposer d'un identifiant d'affichage alternatif lié à la protection de la vie privée.

---

# 👥 Système d'amis

Le système d'amis est principalement géré par :

```text
propard-backend/routes/friends.js
```

Les utilisateurs peuvent notamment :

- envoyer une demande ;
- accepter une demande ;
- gérer leurs amis ;
- définir un surnom pour un ami ;
- bloquer un utilisateur ;
- débloquer un utilisateur.

Certaines fonctionnalités de communication sont volontairement limitées aux utilisateurs qui sont amis.

---

# 💬 Messagerie

Les messages sont stockés avec le modèle :

```text
propard-backend/models/Message.js
```

Le modèle contient notamment :

```text
sender
receiver
content
originalContent
encrypted
edited
deleted
read
createdAt
```

Le contenu transmis au backend est attendu sous forme de message chiffré.

Le serveur effectue également des vérifications avant d'accepter l'enregistrement d'un message.

---

# 🔐 Chiffrement

Le système de messagerie utilise une paire de clés cryptographiques côté client.

La clé publique peut être enregistrée sur le compte utilisateur afin de permettre aux autres clients de préparer des messages chiffrés destinés à cet utilisateur.

Le backend vérifie notamment que la clé publique fournie respecte le format attendu par Propard.

La clé privée n'a pas vocation à être stockée dans la base MongoDB.

> **Attention :** cette architecture ne constitue pas une preuve formelle de sécurité cryptographique. Le système n'est pas présenté comme ayant été audité par un organisme indépendant.

---

# ⚡ Socket.IO

Le serveur Socket.IO est initialisé directement dans :

```text
propard-backend/index.js
```

Il gère notamment :

```text
authenticate
sendMessage
callUser
answerCall
iceCandidate
endCall
```

Des événements sont également envoyés aux clients pour :

```text
authenticated
newMessage
messageSent
messageError
spamWarning
incomingCall
callAnswered
callEnded
callFailed
```

---

# 🟢 Présence en ligne

Propard maintient une liste des connexions Socket.IO actives.

Un même compte peut donc être connecté :

- dans plusieurs onglets ;
- sur plusieurs appareils ;
- avec plusieurs connexions simultanées.

Le compte n'est marqué hors ligne que lorsque sa dernière connexion active disparaît.

---

# 📞 WebRTC

Les appels utilisent WebRTC.

Socket.IO sert de canal de signalisation entre les utilisateurs pour transmettre notamment :

- les offres ;
- les réponses ;
- les ICE candidates ;
- les événements de fin d'appel.

Les informations nécessaires au fonctionnement de STUN/TURN sont fournies par :

```text
propard-backend/routes/turn.js
```

Les appels sont soumis aux mêmes contrôles d'autorisation que la messagerie : le serveur vérifie notamment que les utilisateurs sont authentifiés et autorisés à communiquer.

---

# 📢 Annonces

Les annonces sont gérées par :

```text
propard-backend/routes/announcements.js
```

Le modèle associé est :

```text
propard-backend/models/Announcement.js
```

Une annonce contient notamment :

```text
title
message
active
createdAt
```

Une seule annonce peut être considérée comme active à la fois selon la logique actuelle du modèle.

---

# 🚨 Signalements

Les signalements sont gérés par :

```text
propard-backend/routes/reports.js
```

Ils permettent de transmettre des informations à la modération.

Le mécanisme de signalement est séparé du système de messagerie classique.

---

# 🛡️ Administration

Les fonctionnalités d'administration sont regroupées dans :

```text
propard-backend/routes/admin.js
```

Elles sont destinées aux utilisateurs disposant des autorisations administratives nécessaires.

---

# 🗄️ Base de données

Propard utilise **MongoDB** avec **Mongoose**.

## Modèles actuels

### `User`

Stocke les informations nécessaires aux comptes, profils, relations, présence et mécanismes de suppression.

### `Message`

Stocke les messages échangés entre utilisateurs.

### `Announcement`

Stocke les annonces publiées sur la plateforme.

---

# 📡 API

Les principales routes sont montées dans `propard-backend/index.js`.

| Préfixe | Fonction |
|---|---|
| `/api/auth` | Comptes, connexion, profils et gestion des données personnelles |
| `/api/friends` | Relations entre utilisateurs |
| `/api/admin` | Administration |
| `/api/announcements` | Annonces |
| `/api/reports` | Signalements |
| `/api` | Fonctions liées à TURN |
| `/health` | Vérification de l'état du serveur |

Le backend expose également Socket.IO pour les fonctionnalités temps réel.

> Les endpoints précis et leurs paramètres peuvent évoluer avec les nouvelles versions de Propard.

---

# ❤️ Endpoint de santé

Le backend fournit :

```text
GET /health
```

Une réponse HTTP `200` avec :

```text
OK
```

indique que le serveur HTTP répond correctement.

---

# 🧰 Installation

## Prérequis

Pour développer Propard localement, il faut notamment :

- Node.js ;
- npm ;
- une instance MongoDB accessible ;
- les variables d'environnement nécessaires au backend.

---

## 1. Cloner le dépôt

```bash
git clone https://github.com/Nolabjfjdj/Propard.git
cd Propard
```

---

## 2. Installer le backend

```bash
cd propard-backend
npm install
```

---

## 3. Installer le frontend

```bash
cd ../propard-frontend
npm install
```

---

# 🔐 Variables d'environnement

Le backend utilise `dotenv`.

Les secrets et paramètres de déploiement doivent être configurés dans l'environnement du serveur.

Exemple minimal :

```env
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_long_random_secret
PORT=3000
FRONTEND_ORIGIN=https://propard.site
```

Selon les fonctionnalités activées, d'autres variables d'environnement peuvent être nécessaires, notamment pour les services externes utilisés par Propard.

> **Ne copiez pas cet exemple tel quel en production.**

---

# ⚠️ Sécurité des secrets

Ne commitez jamais dans Git :

- mots de passe ;
- secrets JWT ;
- clés privées ;
- tokens ;
- identifiants MongoDB ;
- clés API ;
- credentials SMTP ;
- credentials TURN ;
- webhooks privés ;
- fichiers `.env`.

Utilisez les variables d'environnement du système ou celles fournies par votre hébergeur.

---

# ▶️ Développement

## Backend

Depuis `propard-backend/` :

```bash
npm run dev
```

Le script utilise Nodemon pour redémarrer automatiquement le serveur lors des modifications.

## Frontend

Depuis `propard-frontend/` :

```bash
npm run dev
```

---

# 🏗️ Production

Le frontend est compilé avec :

```bash
cd propard-frontend
npm run build
```

Le résultat est ensuite placé dans le dossier `dist`.

Le backend est capable de servir le frontend compilé depuis son propre dossier `dist`.

En production, le serveur peut être démarré avec :

```bash
cd propard-backend
npm start
```

---

# 🌍 Déploiement

L'architecture de production peut être représentée ainsi :

```text
                         propard.site
                              │
                              ▼
                     ┌────────────────┐
                     │    Frontend    │
                     │  React / Vite  │
                     └───────┬────────┘
                             │
                       HTTPS / WSS
                             │
                             ▼
                     ┌────────────────┐
                     │    Backend     │
                     │ Node / Express │
                     │   Socket.IO    │
                     └───────┬────────┘
                             │
                 ┌───────────┴───────────┐
                 ▼                       ▼
          ┌─────────────┐        ┌─────────────┐
          │   MongoDB   │        │ STUN / TURN │
          └─────────────┘        └─────────────┘
```

Le déploiement réel peut utiliser un reverse proxy ou une plateforme d'hébergement fournissant HTTPS et la gestion des variables d'environnement.

---

# 🔒 Sécurité applicative

Le backend met notamment en place :

- JWT ;
- bcryptjs pour les mots de passe ;
- middleware d'authentification ;
- limitation de fréquence ;
- validation de plusieurs entrées ;
- vérification des permissions pour les messages et appels ;
- protection contre certaines interactions non autorisées ;
- en-têtes HTTP de sécurité ;
- Content Security Policy ;
- contrôle de l'origine frontend ;
- utilisation des variables d'environnement pour les secrets.

Le serveur configure notamment :

```text
X-Content-Type-Options
X-Frame-Options
Referrer-Policy
Content-Security-Policy
```

> Aucun mécanisme de sécurité ne garantit qu'une application est invulnérable. Toute évolution importante de l'authentification, du chiffrement, des permissions ou du traitement des données doit être testée attentivement.

---

# 🗑️ Suppression et restauration d'un compte

Propard possède un mécanisme de suppression différée.

Lorsqu'une suppression est demandée :

```text
Compte actif
     │
     ▼
Anonymisation
     │
     ▼
Période de restauration
     │
     │ 30 jours
     ▼
Anonymisation définitive
```

Pendant les 30 jours, l'utilisateur peut restaurer son compte avec ses identifiants habituels.

Après expiration, les informations nécessaires à la restauration sont supprimées ou remplacées et le compte ne peut plus être restauré par ce mécanisme.

---

# 🧪 Vérifications

## Frontend

Vérifier le code avec ESLint :

```bash
cd propard-frontend
npm run lint
```

Construire le frontend :

```bash
npm run build
```

## Backend

Lancer le backend :

```bash
cd propard-backend
npm run dev
```

Tester ensuite :

```text
GET /health
```

---

# 📋 Checklist de déploiement

Avant une mise en production :

- [ ] MongoDB configuré
- [ ] `MONGO_URI` configuré
- [ ] `JWT_SECRET` généré aléatoirement
- [ ] `FRONTEND_ORIGIN` configuré
- [ ] Secrets externes configurés
- [ ] HTTPS activé
- [ ] Socket.IO fonctionnel
- [ ] MongoDB accessible depuis le backend
- [ ] STUN/TURN vérifié
- [ ] Inscription testée
- [ ] Connexion testée
- [ ] Profils testés
- [ ] Demandes d'amis testées
- [ ] Blocage testé
- [ ] Messagerie testée
- [ ] Chiffrement testé
- [ ] Appels testés
- [ ] Annonces testées
- [ ] Signalements testés
- [ ] Administration testée
- [ ] Suppression/restauration testée
- [ ] Endpoint `/health` vérifié
- [ ] Aucun secret présent dans Git

---

# 📂 Fichiers importants

## Backend

```text
propard-backend/index.js
propard-backend/middleware/auth.js
propard-backend/middleware/rateLimit.js

propard-backend/models/User.js
propard-backend/models/Message.js
propard-backend/models/Announcement.js

propard-backend/routes/auth.js
propard-backend/routes/friends.js
propard-backend/routes/admin.js
propard-backend/routes/announcements.js
propard-backend/routes/reports.js
propard-backend/routes/turn.js
```

## Frontend

```text
propard-frontend/src/App.jsx
propard-frontend/src/main.jsx
propard-frontend/src/socket.js

propard-frontend/src/components/
propard-frontend/src/context/
propard-frontend/src/pages/
propard-frontend/src/utils/
```

---

# 🗺️ Vue fonctionnelle

```text
PROPARD
│
├── 👤 Comptes
│   ├── Inscription
│   ├── Connexion
│   ├── JWT
│   ├── Profil
│   └── Suppression / restauration
│
├── 👥 Relations
│   ├── Demandes d'amis
│   ├── Amis
│   ├── Surnoms
│   ├── Blocage
│   └── Amis en commun
│
├── 💬 Communication
│   ├── Messagerie
│   ├── Socket.IO
│   ├── Chiffrement côté client
│   └── Notifications
│
├── 📞 Appels
│   ├── WebRTC
│   ├── STUN
│   ├── TURN
│   └── Signalisation Socket.IO
│
├── 📢 Contenu
│   └── Annonces
│
└── 🛡️ Modération
    ├── Administration
    └── Signalements
```

---

# 📜 Licence

Propard est distribué sous une **licence propriétaire**.

La licence complète se trouve dans [`LICENSE`](./LICENSE).

La présence du projet sur GitHub ne signifie pas que son code peut être librement copié, modifié, redistribué ou exploité.

Toute utilisation doit respecter les conditions indiquées dans `LICENSE`.

---

# 🤝 Contributions

Les contributions externes ne sont pas automatiquement autorisées.

Avant de proposer une modification importante, une redistribution ou une version dérivée de Propard, consultez `LICENSE` et contactez l'auteur du projet si nécessaire.

---

# 🐛 Signaler un problème

Pour signaler un bug, indiquez si possible :

1. Une description du problème ;
2. Les étapes permettant de le reproduire ;
3. Le comportement attendu ;
4. Le comportement observé ;
5. Le navigateur et l'appareil utilisés ;
6. Les logs pertinents ;
7. Une capture d'écran si elle est utile.

Ne publiez jamais :

- mot de passe ;
- token ;
- clé privée ;
- secret JWT ;
- clé API ;
- identifiant MongoDB ;
- données personnelles ;
- informations confidentielles.

---

# 🌐 Propard

- 🌐 **Site officiel :** https://propard.site
- 💻 **Dépôt GitHub :** https://github.com/Nolabjfjdj/Propard

---

# 👨‍💻 Projet

**Propard**

Projet indépendant français.

**Développeur : BananeVR**

**2026**

Tous droits réservés.

Voir [`LICENSE`](./LICENSE) pour les conditions complètes d'utilisation du code.

---

> **Propard — Communication, simplicité et sécurité.**