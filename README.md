# Propard

Propard est une plateforme web française de communication développée avec React, Node.js, Express, MongoDB et Socket.IO.

## Fonctionnalités

- Inscription et connexion avec JWT
- Clés d’accès WebAuthn et codes de récupération
- Consultation et révocation des sessions par appareil
- Protection des mots de passe avec bcryptjs
- Profils utilisateurs, avatars, statuts, badges personnels décoratifs, surnoms et blocage
- Système d'amis
- Dossiers de conversations synchronisés entre les appareils du compte
- Messagerie privée en temps réel
- Traduction locale des messages privés et de groupe, sans transmettre le texte à un service tiers
- Messages vocaux enregistrés dans le navigateur et chiffrés avant téléversement
- Messages privés et de groupe programmés avec stockage du seul contenu chiffré
- Chiffrement de bout en bout des messages privés
- Sauvegarde chiffrée de la clé privée E2EE
- Coffre-fort personnel de notes chiffrées côté navigateur
- Système de groupes
- Messagerie de groupe en temps réel
- Chiffrement des messages de groupe
- Gestion des membres et rôles de groupe
- Appels audio privés avec WebRTC
- Appels audio de groupe avec WebRTC
- Serveurs STUN/TURN et ICE restart
- Support de plusieurs serveurs Metered
- Notifications Web Push
- Rappels personnels avec notifications push programmées
- Service Worker
- Fonctionnalités hors ligne
- Mini-jeu hors ligne
- Annonces globales
- Système de signalement
- Gestion administrative des signalements
- Pages d'aide, CGU et politique de confidentialité
- Présence en ligne et confirmations de lecture configurables
- Propard AI avec conversations sauvegardées sous forme chiffrée côté client
- Mode vocal et dictée vocale pour Propard AI selon les capacités du navigateur
- Demandes de support et suivi des demandes liées au compte
- Espaces Staff et Admin avec rôles, permissions et journal d'audit
- Stockage de fichiers réparti sur plusieurs buckets Filebase configurables
- Notifications Web Push et notifications natives APNs sur iOS
- Suppression de compte avec traitement côté serveur

## Protection des rappels et messages programmés

Les listes personnelles de rappels et de messages programmés sont limitées à 60 consultations par minute et par compte. Les créations, annulations et suppressions conservent leurs limites de modification dédiées.

## Protection des sessions et de l'historique de sécurité

Les consultations des sessions actives et de l'historique de sécurité sont limitées à 30 requêtes par minute et par compte. Les révocations individuelles sont limitées à 15 opérations par tranche de 15 minutes. Les déconnexions de session sont limitées à 10 requêtes par minute. La déconnexion globale conserve sa limite renforcée et sa vérification anti-bot.

## Protection de l’espace Staff

Les consultations des données de l’espace Staff sont limitées à 60 requêtes par minute et par compte. Les actions Staff conservent également la limite générale de 300 requêtes par tranche de 15 minutes, avec des limites plus strictes pour certaines opérations sensibles.

## Protection des données personnelles et des annonces

La lecture des dossiers de conversations est limitée à 60 requêtes par minute et par compte. La lecture du coffre-fort E2EE est limitée à 30 requêtes par minute. Les annonces actives sont limitées à 30 consultations par minute et leur confirmation à 10 opérations par tranche de 15 minutes.

## Protection des clés d’accès

La consultation des clés d’accès est limitée à 30 requêtes par minute et par compte. Le renommage et la suppression des clés sont limités à 10 opérations par tranche de 15 minutes et par compte. La création et la régénération des codes de récupération conservent leur limite de gestion dédiée, tandis que les tentatives de connexion par clé restent limitées par adresse IP.

## Limites d'utilisation de Propard AI

Les conversations Propard AI sont protégées par des limites distinctes par compte : 10 créations par heure, 60 consultations par minute et 30 modifications ou suppressions toutes les 15 minutes. L'envoi de messages à l'IA conserve sa propre limite de 20 messages par tranche de 10 minutes. Ces limites réduisent les abus et les créations massives de conversations.

## Traduction des messages

Les conversations privées et les groupes proposent une traduction à la demande des messages texte. La traduction est exécutée localement avec l'API Translator intégrée au navigateur lorsqu'elle est disponible. La langue source peut être détectée automatiquement ou sélectionnée manuellement, et la langue cible est configurable. Le message original n'est jamais modifié et le texte déchiffré n'est pas envoyé à un service de traduction externe. Les navigateurs qui ne prennent pas en charge cette API affichent une indication au lieu de transmettre le message à un tiers.

## Messages vocaux

Les messages vocaux sont enregistrés dans le navigateur via MediaRecorder, limités à deux minutes et 25 Mo, puis envoyés par le même pipeline de pièces jointes chiffrées côté client que les autres fichiers. Le serveur ne reçoit pas le son en clair. Les messages vocaux ne sont pas disponibles lorsque l'expiration éphémère est activée.

## Dossiers de conversations

Les dossiers et leurs affectations sont synchronisés sur le compte, avec un cache local pour garder l'affichage réactif. Chaque compte peut créer jusqu'à 30 dossiers de 24 caractères et affecter les conversations privées ou les groupes. L'API n'accepte que des identifiants de conversation valides et des dossiers existants.

API authentifiée : `GET /api/conversation-folders` et `PUT /api/conversation-folders`.

## Coffre-fort personnel E2EE

Le coffre-fort permet de conserver jusqu'à 50 notes personnelles. Le navigateur chiffre le JSON avec AES-256-GCM et une clé dérivée de la phrase secrète par PBKDF2-HMAC-SHA-256 (600 000 itérations), avec un sel de 16 octets et un IV aléatoire de 12 octets. La phrase secrète et le texte clair ne sont jamais envoyés à l'API. Le serveur stocke uniquement la version, le sel, l'IV et le texte chiffré. Une phrase secrète oubliée ne peut pas être réinitialisée par le serveur : les données deviennent irrécupérables.

API authentifiée : `GET /api/vault`, `PUT /api/vault` et `DELETE /api/vault`.

## Messages programmés

Les messages programmés sont chiffrés dans le navigateur avant leur enregistrement. Le serveur ne stocke que le texte chiffré et les métadonnées de livraison. Les envois sont limités aux messages texte sans pièce jointe, dans une fenêtre maximale de 30 jours, avec 50 messages en attente par compte. La livraison est traitée par un worker avec verrouillage atomique, reprise après interruption et identifiant unique pour éviter la création de doublons. Pour les groupes, une rotation de clé avant l'envoi rend le message programmé invalide plutôt que de risquer un contenu indéchiffrable.

API authentifiée : `GET /api/scheduled-messages`, `POST /api/scheduled-messages` et `DELETE /api/scheduled-messages/:messageId`.

## Rappels personnels

Les rappels sont privés au compte connecté. Ils comportent un titre, une note facultative et une date future. La création exige au moins une destination de notification Web Push ou APNs déjà enregistrée. Le worker serveur traite les rappels échus, revendique chaque tâche de façon atomique, retente les échecs avec un délai et ne transmet que le titre dans la notification push. La note reste stockée côté serveur et n'est jamais incluse dans le payload de notification.

API authentifiée : `GET /api/reminders`, `POST /api/reminders`, `PATCH /api/reminders/:reminderId/cancel` et `DELETE /api/reminders/:reminderId`.

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

## Sessions et appareils connectés

Les sessions JWT sont identifiées par un identifiant unique. Le compte conserve au maximum 10 sessions actives et une liste limitée de sessions révoquées.

Routes authentifiées :

```http
GET /api/auth/sessions
DELETE /api/auth/sessions/:jti
POST /api/auth/logout
POST /api/auth/logout-all
```

La page des paramètres permet de consulter le navigateur et la date de connexion, de révoquer un appareil précis ou de déconnecter toutes les sessions. Les adresses IP ne sont pas enregistrées dans les entrées de session du compte.

Une réinitialisation du mot de passe invalide les sessions existantes et vide la liste des appareils actifs.

## Messages épinglés

Les participants d'une conversation privée peuvent épingler ou désépingler un message. Les membres d'un groupe peuvent faire de même dans leur groupe. L'état d'épinglage et sa date sont des métadonnées séparées du contenu chiffré : le serveur ne déchiffre jamais les messages.

Routes :

```http
PATCH /api/friends/messages/:messageId/pin
PATCH /api/groups/:groupId/messages/:messageId/pin
```

Le corps de la requête contient `pinned: true` pour épingler ou `pinned: false` pour désépingler. Les mises à jour sont diffusées aux participants connectés.

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

### Sécurité des jetons et codes de récupération

```env
TOKEN_HMAC_SECRET=
RECOVERY_CODE_SECRET=
```

Ces deux secrets doivent être différents et contenir au moins 32 octets chacun. Ils doivent être définis uniquement dans l’environnement du serveur, jamais dans le frontend ni dans le dépôt. Leur remplacement invalide les anciens liens d’aide et codes de récupération.

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

### Stockages Filebase multiples

Le backend accepte jusqu'à 100 configurations Filebase. La première utilise les noms historiques :

```env
FILEBASE_KEY=
FILEBASE_SECRET=
FILEBASE_BUCKET=
```

Les stockages supplémentaires utilisent un numéro :

```env
FILEBASE_KEY2=
FILEBASE_SECRET2=
FILEBASE_BUCKET2=

FILEBASE_KEY3=
FILEBASE_SECRET3=
FILEBASE_BUCKET3=
```

Les variables `FILEBASE_ENDPOINT` et `FILEBASE_REGION` sont communes aux stockages. Chaque configuration doit fournir les trois variables de clé, secret et bucket. Une configuration partielle provoque une erreur au lieu d'être ignorée.

Les morceaux de fichiers sont répartis entre les stockages configurés. Leur identifiant de stockage est conservé dans le manifeste de chaque morceau afin que les téléchargements et suppressions utilisent le bon bucket. Ne retire pas les variables d'un stockage tant que des fichiers y sont encore enregistrés, sinon ces fichiers ne pourront plus être téléchargés ni supprimés correctement.

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

Propard est un logiciel propriétaire.

Le code source est rendu public afin de permettre la transparence, l’inspection technique et l’analyse du projet, mais cette publication ne constitue pas une licence open source et n’accorde pas automatiquement le droit de copier, modifier, redistribuer ou exploiter le logiciel.

Tous droits réservés à **BananeVR**, sous réserve des droits de tiers et des dépendances utilisées par le projet.

Les dépendances tierces restent soumises à leurs propres licences.

Pour toute utilisation, reproduction, modification, redistribution ou exploitation du code de Propard qui n’est pas expressément autorisée par la licence du projet, une autorisation écrite préalable du titulaire des droits est requise.

### Galerie des médias et fichiers

Les conversations privées et les groupes disposent d'un accès « Médias et fichiers » dans leur en-tête. La galerie charge les identifiants de pièces jointes de tout l'historique non supprimé et non expiré, déduplique les identifiants et réutilise le même parcours de téléchargement et de déchiffrement côté client que les messages. Le serveur ne reçoit pas de contenu déchiffré supplémentaire pour afficher la galerie.


### Dossiers de conversations

La liste des amis et des groupes permet de créer jusqu'à 30 dossiers et d'y classer chaque conversation. Le filtre affiche toutes les conversations, celles sans dossier ou un dossier précis. Les dossiers sont synchronisés avec le compte sur le serveur et conservés en cache local pour accélérer l'affichage.


### Historique de sécurité du compte

La rubrique Sécurité affiche les 50 derniers événements de création de compte et de connexion par mot de passe, clé d’accès ou code de récupération. Chaque entrée conserve uniquement le type d’événement, sa date et l’agent utilisateur du navigateur. Aucune adresse IP n’est enregistrée dans cet historique.


### Confirmations de lecture facultatives

Chaque compte peut désactiver l’envoi des confirmations de lecture depuis les paramètres de sécurité. Quand l’option est désactivée, les compteurs de messages non lus continuent de fonctionner sur ton compte, mais les expéditeurs ne voient pas l’état de lecture des messages privés concernés. Le suivi des messages non lus dans les groupes reste indépendant. Les confirmations reçues des autres utilisateurs restent visibles.


### Notes partagées chiffrées

Les conversations privées et les groupes disposent d'une note partagée modifiable depuis leur en-tête. Le navigateur chiffre le texte avec la clé E2EE de la conversation avant l'envoi ; le serveur ne stocke que le texte chiffré et les métadonnées de mise à jour. Les accès sont limités aux amis de la conversation privée ou aux membres du groupe. Pour les groupes, la note conserve sa version de clé et les membres qui possèdent encore l'ancienne clé peuvent la migrer vers la version actuelle lors de son ouverture.


### Vérification manuelle des clés E2EE

Les conversations privées affichent une empreinte SHA-256 calculée à partir des deux clés publiques, triées de façon canonique pour obtenir la même empreinte des deux côtés. Les groupes affichent l’empreinte SHA-256 de la clé de groupe courante et sa version. Les participants doivent comparer ces empreintes par un canal indépendant ; Propard ne marque pas automatiquement une conversation comme vérifiée.


### Alertes de nouvelle connexion

Lorsqu'une connexion par mot de passe, clé d'accès ou code de récupération est créée alors qu'une autre session est déjà active, Propard tente d'envoyer une notification push de sécurité aux appareils enregistrés. L'alerte ne contient ni adresse IP ni mot de passe. Elle dépend de la configuration Web Push ou APNs du compte.


### Messages éphémères

Les conversations privées et les groupes permettent de choisir une expiration de 1 heure, 24 heures ou 7 jours pour un nouveau message texte. Le serveur conserve uniquement le contenu chiffré et la date d'expiration ; les messages expirés sont exclus de l'historique et des compteurs non lus, puis supprimés automatiquement par l'index TTL MongoDB. Les pièces jointes sont volontairement désactivées pour les messages éphémères afin d'éviter de laisser des fichiers orphelins.


### Sondages chiffrés

Les conversations privées et les groupes permettent de créer des sondages contenant une question et de 2 à 6 réponses. Le texte du sondage est chiffré côté client avant l'envoi. Les votes utilisent les réactions numérotées ; le serveur impose un seul choix actif par participant et ne connaît pas le texte des réponses. Les sondages ne prennent pas en charge les pièces jointes ni l'expiration éphémère.


### Messages programmés et rappels

Les messages programmés privés et de groupe sont chiffrés côté client avant leur stockage. Le serveur vérifie à nouveau les relations, l'appartenance au groupe et la version de clé avant la livraison. Les programmations peuvent être annulées tant qu'elles sont en attente. Les rappels personnels déclenchent une notification Push à l'heure prévue ; le titre est utilisé dans la notification, mais la note facultative n'est pas envoyée dans son contenu. La livraison dépend de la disponibilité des abonnements Push.

### Coffre-fort personnel E2EE

Le coffre-fort chiffre les notes dans le navigateur avec une clé dérivée d'une phrase secrète. Le serveur ne reçoit que le contenu chiffré et les paramètres nécessaires à son déchiffrement. La phrase secrète n'est jamais transmise ni récupérable par Propard. Sa perte rend le contenu du coffre-fort inaccessible. La suppression du compte efface également l'historique Propard AI associé, les rappels et les programmations personnels, ainsi que les notes privées. Après le délai de suppression de 30 jours, les données personnelles supplémentaires sont purgées lors de l'anonymisation définitive.

### Messages vocaux et profils

Les messages vocaux sont enregistrés dans le navigateur puis transmis par le parcours existant de pièces jointes chiffrées. Les profils peuvent afficher un statut et un badge personnel. Les préférences d'apparence comprennent le thème sombre ou clair et cinq couleurs d'accent, enregistrés sur l'appareil.
