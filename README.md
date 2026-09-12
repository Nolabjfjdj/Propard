# Propard

> Propard est une plateforme web française de communication entre utilisateurs, développée avec React, Vite, Node.js, Express, MongoDB, Mongoose et Socket.IO.

Propard est un projet indépendant développé par BananeVR.

## À propos

Propard regroupe plusieurs outils de communication et d'interaction dans une même plateforme web.

Le projet est composé de deux applications principales :

- **Frontend** : application React/Vite exécutée dans le navigateur.
- **Backend** : serveur Node.js/Express fournissant l'API, les communications temps réel, la signalisation WebRTC et le service du frontend compilé en production.

Les données persistantes sont stockées dans MongoDB via Mongoose.

Socket.IO est utilisé pour les communications temps réel et WebRTC pour les appels entre utilisateurs.

---

# Fonctionnalités

## Comptes

- Création de compte
- Connexion
- Authentification JWT
- Jetons valables 30 jours
- Modification du profil
- Nom d'affichage
- Avatar
- Clé publique cryptographique
- Consultation de profils
- Suppression et restauration de compte

## Relations entre utilisateurs

- Recherche/interactions prévues par les routes et composants du projet
- Demandes d'amis
- Acceptation des demandes
- Refus des demandes
- Liste d'amis
- Surnoms personnalisés
- Amis en commun
- Blocage
- Déblocage
- Présence en ligne/hors ligne

## Messagerie

- Conversations entre amis
- Communication temps réel avec Socket.IO
- Messages chiffrés côté client
- Édition des messages
- Suppression des messages
- Statut de lecture
- Messages non lus
- Protection contre l'envoi trop rapide de messages

## Cryptographie

Propard utilise un système de chiffrement côté client pour les messages.

Les utilisateurs peuvent enregistrer une clé publique cryptographique.

Le backend vérifie la structure de la clé publique avant de l'enregistrer.

Le serveur reçoit les messages sous une structure chiffrée et effectue plusieurs validations avant leur traitement.

> Le chiffrement utilisé par Propard est une implémentation propre au projet. Il ne faut pas le présenter comme un protocole cryptographique professionnellement audité ou comme une garantie absolue de sécurité.

## Appels

Les appels utilisent :

- WebRTC
- Socket.IO pour la signalisation
- STUN
- TURN

Le backend vérifie que les utilisateurs sont authentifiés et autorisés à communiquer.

Le système de signalisation prend notamment en charge :

- les offres ;
- les réponses ;
- les ICE candidates ;
- la fin des appels ;
- le redémarrage ICE.

## Temps réel

Socket.IO est utilisé notamment pour :

- l'authentification des sockets ;
- les nouveaux messages ;
- les confirmations d'envoi ;
- les erreurs de message ;
- les avertissements liés au spam ;
- les appels entrants ;
- les réponses aux appels ;
- la fin des appels ;
- les échecs d'appel ;
- les communications liées aux relations entre utilisateurs ;
- les annonces.

Un même compte peut disposer de plusieurs connexions Socket.IO simultanées.

Le compte reste en ligne tant qu'au moins une de ses connexions reste active.

## Annonces

Propard possède un système d'annonces administratives.

Une annonce possède notamment :

- un titre ;
- un message ;
- un état actif/inactif ;
- une date de création.

Les utilisateurs peuvent enregistrer qu'ils ont accepté une annonce.

Une nouvelle annonce active désactive l'annonce active précédente selon la logique actuelle du backend.

## Signalements

Propard possède un système de signalement.

Les signalements sont séparés de la messagerie classique.

Le système permet notamment de transmettre un message à la modération avec les informations nécessaires au traitement du signalement.

Le backend vérifie plusieurs éléments avant d'accepter un signalement, notamment l'existence du message et la relation entre le signalant et le message concerné.

Un mécanisme de limitation empêche également l'envoi trop rapide de plusieurs signalements.

Le projet possède également une partie d'administration des signalements permettant notamment leur consultation et leur traitement.

## Administration

Le backend possède des routes administratives protégées par des clés provenant des variables d'environnement.

Les fonctionnalités d'administration comprennent notamment :

- certaines opérations sur les comptes ;
- la réinitialisation de mot de passe ;
- la gestion des annonces ;
- la gestion des signalements.

Les opérations administratives sensibles possèdent également des protections contre les tentatives répétées.

## E-mails

Nodemailer est présent dans les dépendances du backend et est utilisé par les fonctionnalités du projet nécessitant l'envoi d'e-mails.

## Suppression de compte

Propard possède un mécanisme de suppression différée.

Lorsqu'un utilisateur demande la suppression :

1. le compte est anonymisé ;
2. certaines informations permettant la restauration sont conservées temporairement ;
3. une période de restauration de 30 jours commence ;
4. le compte peut être restauré pendant cette période ;
5. après expiration, les informations nécessaires à la restauration sont supprimées ou remplacées.

Une route de suppression immédiate existe également.

---

# Architecture

```text
                         Utilisateur
                             │
                             │ HTTPS
                             ▼
                  ┌─────────────────────┐
                  │      Frontend       │
                  │     React + Vite    │
                  └──────────┬──────────┘
                             │
                    HTTP / Socket.IO
                             │
                             ▼
                  ┌─────────────────────┐
                  │      Backend        │
                  │ Node.js + Express   │
                  │     + Socket.IO     │
                  └───────┬───────┬─────┘
                          │       │
                          │       └── WebRTC / STUN / TURN
                          │
                          ▼
                    ┌─────────────┐
                    │   MongoDB   │
                    │  Mongoose   │
                    └─────────────┘
```

---

# Structure du dépôt

```text
Propard/
├── propard-backend/
│   ├── middleware/
│   │   ├── auth.js
│   │   └── rateLimit.js
│   │
│   ├── models/
│   │   ├── Announcement.js
│   │   ├── Message.js
│   │   ├── Report.js
│   │   └── User.js
│   │
│   ├── routes/
│   │   ├── admin.js
│   │   ├── announcements.js
│   │   ├── auth.js
│   │   ├── friends.js
│   │   ├── reports.js
│   │   ├── reportsAdmin.js
│   │   └── turn.js
│   │
│   ├── utils/
│   │
│   ├── index.js
│   ├── package.json
│   └── package-lock.json
│
├── propard-frontend/
│   ├── public/
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

> L'arborescence peut évoluer avec les nouvelles versions du projet. Le dépôt reste la référence pour connaître les fichiers réellement présents.

---

# Frontend

Le frontend utilise React et Vite.

## Technologies principales

- React 19
- React DOM
- React Router
- Axios
- Socket.IO Client
- Vite
- ESLint
- ESLint React Hooks
- ESLint React Refresh

## Scripts

Depuis `propard-frontend/` :

```bash
npm install
```

Installe les dépendances.

```bash
npm run dev
```

Lance le serveur de développement Vite.

```bash
npm run build
```

Construit la version de production.

```bash
npm run lint
```

Lance ESLint.

```bash
npm run preview
```

Lance une prévisualisation du build.

---

# Backend

Le backend utilise Node.js et Express.

Il gère notamment :

- l'authentification ;
- les comptes ;
- les profils ;
- les relations entre utilisateurs ;
- les messages ;
- les annonces ;
- les signalements ;
- l'administration ;
- les credentials TURN ;
- Socket.IO ;
- la signalisation WebRTC.

Le backend peut également servir le frontend compilé depuis son dossier `dist`.

---

# Technologies backend

Les dépendances principales comprennent :

- Node.js
- Express
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

# Authentification

Propard utilise des JSON Web Tokens.

Lors de l'inscription ou de la connexion, le backend génère un token associé au compte.

La durée actuelle du token est de 30 jours.

Les mots de passe sont hachés avec `bcryptjs`.

Les routes protégées utilisent le middleware :

```text
propard-backend/middleware/auth.js
```

---

# Profils utilisateurs

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

Certaines informations internes ne sont pas renvoyées au client, notamment le mot de passe.

Le profil utilisateur permet également de récupérer les informations liées à la relation entre deux utilisateurs et les amis en commun.

---

# Alias IP

Chaque compte possède un `ipAlias`.

Cet alias est généré par le backend et ne correspond pas directement à l'adresse IP réelle de l'utilisateur.

Il sert notamment d'identifiant alternatif dans certaines interactions du système.

---

# Système d'amis

Le système d'amis est principalement géré par :

```text
propard-backend/routes/friends.js
```

Il permet notamment :

- d'envoyer des demandes ;
- d'accepter des demandes ;
- de refuser des demandes ;
- de consulter ses amis ;
- de définir des surnoms ;
- de supprimer une relation ;
- de bloquer un utilisateur ;
- de débloquer un utilisateur ;
- de récupérer certaines informations de relation.

Certaines fonctions de communication nécessitent que les utilisateurs soient amis.

---

# Messagerie

Les messages sont stockés dans :

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

Le backend vérifie notamment :

- l'authentification ;
- l'identité du destinataire ;
- la relation d'amitié ;
- la structure du message chiffré ;
- la fréquence d'envoi.

Les messages sont également transmis en temps réel par Socket.IO.

---

# Chiffrement des messages

Le chiffrement est effectué côté client.

La clé publique d'un utilisateur peut être enregistrée dans son profil.

Le backend vérifie notamment que la clé publique respecte le format cryptographique attendu par le projet.

La clé privée n'est pas enregistrée dans le modèle `User`.

Le backend attend pour les messages une structure contenant notamment les éléments nécessaires au contenu chiffré.

---

# Socket.IO

Le serveur Socket.IO est initialisé dans :

```text
propard-backend/index.js
```

Les principaux événements entrants comprennent :

```text
authenticate
sendMessage
callUser
answerCall
iceCandidate
iceRestartOffer
iceRestartAnswer
endCall
```

Le serveur utilise également différents événements sortants, notamment :

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

Le nombre exact d'événements peut évoluer avec le développement du projet.

---

# Présence

Le backend maintient les connexions Socket.IO actives par utilisateur.

Cela permet à un même compte d'avoir plusieurs connexions simultanées.

Exemples :

- plusieurs onglets ;
- plusieurs appareils ;
- plusieurs sockets.

Le compte reste considéré comme en ligne tant qu'une connexion active existe.

---

# WebRTC

Les appels utilisent WebRTC.

Socket.IO sert de canal de signalisation.

Le système prend en charge notamment :

- l'appel ;
- la réponse ;
- les ICE candidates ;
- la fin d'appel ;
- le redémarrage ICE.

Le serveur vérifie l'authentification et les autorisations de communication avant de transmettre les informations de signalisation.

---

# STUN / TURN

Les informations nécessaires à WebRTC sont fournies par :

```text
propard-backend/routes/turn.js
```

Le backend peut récupérer des credentials TURN auprès de plusieurs configurations Metered.

Les serveurs retournés sont utilisés comme ICE servers par le frontend.

La route TURN est protégée et possède une limitation de fréquence.

---

# Annonces

Les annonces sont gérées par :

```text
propard-backend/routes/announcements.js
```

Le modèle est :

```text
propard-backend/models/Announcement.js
```

Une annonce contient :

```text
title
message
active
createdAt
```

Le backend gère notamment :

- la récupération de l'annonce active ;
- l'acceptation d'une annonce ;
- la désactivation des annonces précédentes lors de la création d'une nouvelle annonce ;
- la diffusion de changements via Socket.IO.

---

# Signalements

Les signalements sont gérés par :

```text
propard-backend/routes/reports.js
```

Le modèle est :

```text
propard-backend/models/Report.js
```

Le projet possède également une route d'administration :

```text
propard-backend/routes/reportsAdmin.js
```

Le système de modération permet notamment de gérer l'état des signalements.

Les signalements possèdent des informations permettant notamment de retrouver :

- le message concerné ;
- l'utilisateur signalé ;
- le contenu concerné ;
- le motif ;
- la date associée au message ;
- l'état du signalement ;
- les informations de traitement.

Le système limite également la fréquence des signalements.

---

# Administration

Les fonctionnalités administratives sont principalement regroupées dans :

```text
propard-backend/routes/admin.js
```

Certaines fonctionnalités nécessitent une clé secrète fournie par une variable d'environnement.

Les opérations administratives sont protégées contre les tentatives répétées.

Les fonctionnalités comprennent notamment la gestion d'annonces et certaines opérations sur les comptes.

---

# Base de données

Propard utilise MongoDB avec Mongoose.

Les modèles actuellement présents comprennent notamment :

```text
User
Message
Announcement
Report
```

## User

Gère :

- comptes ;
- profils ;
- relations ;
- demandes d'amis ;
- blocages ;
- présence ;
- clés publiques ;
- suppression différée.

## Message

Gère les messages échangés entre utilisateurs.

## Announcement

Gère les annonces administratives.

## Report

Gère les signalements transmis au système de modération.

---

# API

Les routes sont montées dans `propard-backend/index.js`.

```text
/api/auth
```

Authentification, comptes, profils et gestion du compte.

```text
/api/friends
```

Relations entre utilisateurs et fonctionnalités liées aux messages.

```text
/api/admin
```

Administration.

```text
/api/announcements
```

Annonces.

```text
/api/reports
```

Création de signalements.

```text
/api/reports-admin
```

Gestion administrative des signalements.

```text
/api/turn-credentials
```

Récupération des credentials nécessaires à WebRTC.

```text
/health
```

Vérification de l'état du serveur.

---

# Endpoint de santé

Le backend possède :

```text
GET /health
```

Une requête correcte renvoie :

```text
OK
```

avec le statut HTTP `200`.

---

# Protection contre les abus

Le backend possède un système de limitation de fréquence dans :

```text
propard-backend/middleware/rateLimit.js
```

Il est utilisé pour plusieurs opérations sensibles.

Cela comprend notamment :

- les inscriptions ;
- les connexions ;
- les messages ;
- les signalements ;
- certaines opérations administratives ;
- les demandes de credentials TURN.

Le backend utilise également `trust proxy` afin de fonctionner correctement derrière un reverse proxy.

---

# Sécurité applicative

Le backend utilise notamment :

- JWT ;
- bcryptjs ;
- middleware d'authentification ;
- rate limiting ;
- validation des entrées ;
- vérification des permissions ;
- contrôle des relations entre utilisateurs ;
- variables d'environnement pour les secrets ;
- CORS ;
- en-têtes HTTP de sécurité ;
- Content Security Policy.

Les en-têtes configurés comprennent notamment :

```text
X-Content-Type-Options
X-Frame-Options
Referrer-Policy
Content-Security-Policy
```

La sécurité du projet dépend néanmoins de l'ensemble du code, de sa configuration et de son environnement de déploiement.

---

# Variables d'environnement

Le backend utilise `dotenv`.

Les secrets ne doivent pas être placés directement dans le code source.

Les variables principales comprennent notamment :

```text
MONGO_URI
JWT_SECRET
FRONTEND_ORIGIN
PORT
```

D'autres variables sont utilisées par les fonctionnalités externes, notamment :

```text
METERED_DOMAIN
METERED_SECRET_KEY
```

ainsi que les configurations Metered supplémentaires utilisées par le système TURN.

Les variables administratives et autres secrets externes doivent également être configurés dans l'environnement de déploiement.

Ne commitez jamais :

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

---

# Installation

## Prérequis

- Node.js
- npm
- MongoDB accessible
- variables d'environnement nécessaires

## Cloner le dépôt

```bash
git clone https://github.com/Nolabjfjdj/Propard.git
cd Propard
```

## Installer le backend

```bash
cd propard-backend
npm install
```

## Installer le frontend

```bash
cd ../propard-frontend
npm install
```

---

# Développement

## Backend

```bash
cd propard-backend
npm run dev
```

Le script utilise Nodemon.

## Frontend

Dans un autre terminal :

```bash
cd propard-frontend
npm run dev
```

---

# Production

Le frontend est compilé avec :

```bash
cd propard-frontend
npm run build
```

Le résultat est placé dans `dist`.

Le backend peut ensuite servir le frontend compilé depuis son propre environnement de production.

Le backend peut être lancé avec :

```bash
cd propard-backend
npm start
```

---

# Déploiement

L'architecture de production peut être représentée ainsi :

```text
propard.site
     │
     ▼
Frontend React / Vite
     │
     │ HTTPS / WSS
     ▼
Backend Node.js / Express / Socket.IO
     │
     ├── MongoDB
     │
     └── STUN / TURN
```

Le backend peut être placé derrière un reverse proxy ou une plateforme d'hébergement fournissant HTTPS et la gestion des variables d'environnement.

---

# Suppression et restauration

Lorsqu'une suppression différée est demandée :

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

Pendant la période de restauration, le compte peut être restauré avec les mécanismes prévus par l'API.

Après expiration, les informations nécessaires à la restauration sont supprimées ou remplacées.

Une suppression immédiate est également disponible.

---

# Vérifications

## Frontend

```bash
cd propard-frontend
npm run lint
```

Puis :

```bash
npm run build
```

## Backend

```bash
cd propard-backend
npm run dev
```

Puis vérifier :

```text
GET /health
```

---

# Licence

Le projet possède une licence propriétaire.

Le fichier `LICENSE` indique que la copie, la modification, la distribution ou l'utilisation du code nécessitent une autorisation écrite préalable.

Consultez `LICENSE` avant toute réutilisation du code.

---

# Liens

Site :

https://propard.site

Dépôt :

https://github.com/Nolabjfjdj/Propard

---

# État du dépôt

Ce README décrit le fonctionnement du projet tel qu'il est présenté dans la version actuelle du dépôt.

Le dépôt est la source de vérité pour :

- les fichiers présents ;
- les routes ;
- les modèles ;
- les dépendances ;
- les fonctionnalités ;
- les paramètres ;
- les évolutions futures.

Le README peut devenir obsolète si le code évolue sans que sa documentation soit mise à jour.