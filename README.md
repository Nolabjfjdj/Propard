# Propard

Propard est une plateforme web française de communication développée avec React, Node.js, Express, MongoDB et Socket.IO.

## Fonctionnalités

- Inscription et connexion avec JWT
- Protection des mots de passe avec bcryptjs
- Profils utilisateurs, avatars, surnoms et blocage
- Système d'amis
- Messagerie privée en temps réel
- Chiffrement de bout en bout des messages privés
- Sauvegarde chiffrée de la clé privée E2EE
- Système de groupes
- Messagerie de groupe en temps réel
- Chiffrement des messages de groupe
- Gestion des membres et rôles de groupe
- Appels audio privés avec WebRTC
- Appels audio de groupe avec WebRTC
- Serveurs STUN/TURN et ICE restart
- Support de plusieurs serveurs Metered
- Notifications Web Push
- Service Worker
- Fonctionnalités hors ligne
- Mini-jeu hors ligne
- Annonces globales
- Système de signalement
- Gestion administrative des signalements
- Pages d'aide, CGU et politique de confidentialité
- Suppression de compte avec traitement côté serveur

## Architecture

```text
Navigateur
├── React / Vite
├── Socket.IO Client
├── Web Crypto API
├── WebRTC
├── Web Push
└── Service Worker
        │
        │ HTTP / WebSocket
        ▼
Backend
├── Node.js
├── Express
├── JWT / bcryptjs
├── Socket.IO
├── Web Push
└── WebRTC / TURN
        │
        │ Mongoose
        ▼
MongoDB
├── Users
├── Messages
├── Groups
├── GroupMessages
├── Reports
└── Announcements
```

## Structure

```text
Propard/
├── propard-backend/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── index.js
│   └── package.json
│
├── propard-frontend/
│   ├── public/
│   │   ├── sw.js
│   │   ├── notification.wav
│   │   ├── privacy.html
│   │   ├── terms.html
│   │   ├── robots.txt
│   │   └── sitemap.xml
│   ├── src/
│   │   ├── components/
│   │   │   ├── Chat.jsx
│   │   │   ├── FriendList.jsx
│   │   │   ├── GroupChat.jsx
│   │   │   ├── GroupManager.jsx
│   │   │   ├── GroupProfile.jsx
│   │   │   ├── GroupVoiceCall.jsx
│   │   │   ├── OfflineGame.jsx
│   │   │   └── VoiceCall.jsx
│   │   └── utils/
│   │       ├── crypto.js
│   │       ├── groupCrypto.js
│   │       └── pushNotifications.js
│   └── package.json
│
└── README.md
```

## Technologies

### Frontend

- React
- React Router
- Axios
- Socket.IO Client
- Vite
- ESLint
- Web Crypto API
- WebRTC
- Service Worker
- Web Push

### Backend

- Node.js
- Express
- MongoDB
- Mongoose
- JSON Web Tokens
- bcryptjs
- Socket.IO
- web-push
- Nodemailer
- dotenv
- CORS

## Authentification

Les routes protégées utilisent un token JWT envoyé avec :

```http
Authorization: Bearer <token>
```

Les mots de passe sont protégés avec `bcryptjs`.

Le middleware d'authentification se trouve dans :

```text
propard-backend/middleware/auth.js
```

## Messagerie privée

Les conversations privées utilisent Socket.IO pour le temps réel.

Les messages sont chiffrés côté client avec :

```text
ECDH P-256
    ↓
clé partagée
    ↓
AES-256-GCM
    ↓
message chiffré
```

Le serveur ne reçoit pas le message privé en clair lorsqu'il est envoyé sous forme chiffrée.

Le payload de message utilise une version et contient notamment :

```json
{
  "v": 1,
  "iv": "...",
  "ct": "..."
}
```

## Sauvegarde E2EE

La clé privée peut être sauvegardée sous une forme chiffrée afin de permettre sa récupération sur un autre appareil.

Le mécanisme utilise :

```text
PBKDF2-SHA-256
600 000 itérations
        ↓
AES-256-GCM
```

Le mot de passe et la clé privée en clair ne sont pas envoyés au serveur dans ce processus.

## Groupes

Le système de groupes est notamment composé de :

```text
propard-backend/models/Group.js
propard-backend/models/GroupMessage.js
propard-backend/routes/groups.js

propard-frontend/src/components/GroupChat.jsx
propard-frontend/src/components/GroupManager.jsx
propard-frontend/src/components/GroupProfile.jsx
propard-frontend/src/components/GroupVoiceCall.jsx
propard-frontend/src/utils/groupCrypto.js
```

Les groupes prennent en charge :

- création de groupes
- membres
- rôles `owner`, `admin` et `member`
- gestion des membres
- départ et suppression
- messages
- modification et suppression des messages
- lecture et messages non lus
- appels audio de groupe

Les messages de groupe sont également chiffrés côté client.

## Socket.IO

Socket.IO est utilisé pour la messagerie, la présence et les appels.

### Messages privés

```text
sendMessage
newMessage
messageSent
messageError
```

### Appels privés

```text
callUser
incomingCall
answerCall
callAnswered
iceCandidate
iceRestartOffer
iceRestartAnswer
endCall
callEnded
```

### Groupes et appels de groupe

```text
sendGroupMessage
newGroupMessage
groupMessageSent
groupMessageError

groupCallStart
groupCallStarted
groupCallInvite
groupCallJoin
groupCallParticipants
groupCallOffer
groupCallAnswer
groupCallIceCandidate
groupCallIceRestartOffer
groupCallIceRestartAnswer
groupCallLeave
groupCallMemberLeft
groupCallEnded
groupCallError
```

## WebRTC et TURN

Les informations ICE/TURN sont fournies par :

```http
GET /api/turn-credentials
```

La route est protégée par authentification et limitée à 10 demandes par minute et par utilisateur.

Le backend peut utiliser plusieurs serveurs Metered :

```env
METERED_DOMAIN=
METERED_SECRET_KEY=

METERED1_DOMAIN=
METERED1_SECRET_KEY=

# ...

METERED20_DOMAIN=
METERED20_SECRET_KEY=
```

Les serveurs configurés sont interrogés en parallèle et les entrées ICE sont regroupées puis mélangées.

## Notifications Push

Propard utilise Web Push avec :

```text
propard-backend/routes/push.js
propard-backend/services/push.js
propard-frontend/src/utils/pushNotifications.js
propard-frontend/public/sw.js
```

Les notifications prennent notamment en charge :

- messages privés
- messages de groupe
- abonnements par appareil/navigateur
- suppression des abonnements invalides
- réception en arrière-plan
- ouverture de la conversation concernée

Lorsqu'une conversation pertinente est déjà ouverte, le client peut éviter d'afficher une notification inutile.

## Service Worker et hors ligne

Le Service Worker se trouve ici :

```text
propard-frontend/public/sw.js
```

Il est utilisé pour les notifications Push et les fonctionnalités liées au fonctionnement hors ligne.

Le projet contient également :

```text
OfflineGame.jsx
```

pour le mini-jeu hors ligne.

## Annonces

Les annonces globales sont gérées par le backend et affichées côté client, notamment avec :

```text
GlobalAnnouncement.jsx
```

## Signalements et administration

Les signalements utilisent notamment :

```text
propard-backend/routes/reports.js
propard-backend/routes/reportsAdmin.js
propard-backend/routes/admin.js
propard-backend/models/Report.js
```

## Modèles MongoDB

Les principaux modèles sont :

```text
User
Message
Group
GroupMessage
Report
Announcement
```

## Variables d'environnement

### Base

```env
MONGO_URI=
JWT_SECRET=
FRONTEND_ORIGIN=
PORT=
```

### Administration

```env
ADMIN_KEY=
ADMIN_KEY_ANNOUNCEMENT=
```

### Metered / TURN

```env
METERED_DOMAIN=
METERED_SECRET_KEY=

METERED1_DOMAIN=
METERED1_SECRET_KEY=
# ...
METERED20_DOMAIN=
METERED20_SECRET_KEY=
```

### Web Push

```env
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
```

Les secrets ne doivent jamais être commités dans le dépôt.

## Installation

### Cloner le dépôt

```bash
git clone https://github.com/Nolabjfjdj/Propard.git
cd Propard
```

### Backend

```bash
cd propard-backend
npm install
npm start
```

Développement :

```bash
npm run dev
```

### Frontend

Dans un autre terminal :

```bash
cd propard-frontend
npm install
npm run dev
```

Build :

```bash
npm run build
```

## Scripts frontend

```bash
npm run dev
npm run build
npm run lint
npm run preview
```

## Scripts backend

```bash
npm start
npm run dev
```

## Pages et documents

Le projet contient notamment :

- page d'aide
- page de contact
- conditions générales d'utilisation
- politique de confidentialité
- pages d'administration
- `terms.html`
- `privacy.html`

Ces documents doivent être mis à jour lorsque les fonctionnalités ou le traitement des données évoluent.

## Projet

**Propard** est développé indépendamment par **BananeVR**.

Site : https://propard.site

Dépôt : https://github.com/Nolabjfjdj/Propard.git

## Licence

Le backend utilise actuellement la licence `ISC` indiquée dans son `package.json`.

Les dépendances tierces restent soumises à leurs propres licences.
