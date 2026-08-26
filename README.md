# Propard

> **Propard** est une plateforme web de communication et d'interaction entre utilisateurs, développée avec **React**, **Node.js**, **Express**, **MongoDB** et **Socket.IO**.

[![Website](https://img.shields.io/badge/Website-propard.site-blue?style=flat-square)](https://propard.site)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-black?style=flat-square&logo=github)](https://github.com/Nolabjfjdj/Propard)
[![License](https://img.shields.io/badge/License-Proprietary-red?style=flat-square)](./LICENSE)

---

## 📖 Présentation

**Propard** est un projet indépendant visant à regrouper plusieurs fonctionnalités de communication dans une seule plateforme.

L'application est organisée autour de deux parties principales :

- **Frontend** — application React exécutée dans le navigateur.
- **Backend** — serveur Node.js / Express fournissant l'API et les fonctionnalités serveur.

L'application utilise également **MongoDB** pour la persistance des données et **Socket.IO** pour certaines communications en temps réel.

---

## ✨ Fonctionnalités

| Fonctionnalité | Description |
|---|---|
| 👤 Comptes | Création et authentification des utilisateurs |
| 🔐 Authentification | Authentification basée notamment sur JWT |
| 👥 Amis | Gestion des relations entre utilisateurs |
| 💬 Messagerie | Conversations entre utilisateurs |
| ⚡ Temps réel | Communications via Socket.IO |
| 🔒 Chiffrement | Chiffrement côté client des messages |
| 📢 Annonces | Publication d'annonces |
| 🛡️ Administration | Fonctionnalités réservées aux administrateurs |
| 🚨 Signalements | Système de signalement |
| 📞 Appels | Infrastructure nécessaire aux communications WebRTC |
| 📧 E-mails | Envoi d'e-mails via Nodemailer |
| 🗄️ Base de données | MongoDB avec Mongoose |

---

## 🧱 Architecture

<pre>
┌───────────────────────────────┐
│           UTILISATEUR         │
│          Navigateur           │
└───────────────┬───────────────┘
                │
                │ HTTPS
                ▼
┌───────────────────────────────┐
│           FRONTEND            │
│                               │
│       React + Vite            │
│                               │
│  ├── Pages                    │
│  ├── Components               │
│  ├── Context                  │
│  ├── Utils                    │
│  └── Socket.IO Client         │
└───────────────┬───────────────┘
                │
                │ HTTP / Socket.IO
                ▼
┌───────────────────────────────┐
│            BACKEND            │
│                               │
│      Node.js + Express        │
│                               │
│  ├── Authentication           │
│  ├── Friends                  │
│  ├── Messages                 │
│  ├── Announcements            │
│  ├── Reports                  │
│  ├── Administration           │
│  └── TURN                     │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│            MongoDB            │
│                               │
│  ├── Users                    │
│  ├── Messages                 │
│  └── Announcements            │
└───────────────────────────────┘
</pre>

---

## 📁 Structure du projet

<pre>
Propard/
│
├── propard-backend/
│   ├── middleware/
│   │   └── auth.js
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
│   │   └── discordReport.js
│   │
│   ├── index.js
│   ├── package.json
│   └── package-lock.json
│
├── propard-frontend/
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
</pre>

---

## 🖥️ Frontend

Le frontend de Propard est développé avec **React** et construit avec **Vite**.

### Technologies principales

- React
- React DOM
- React Router
- Axios
- Socket.IO Client
- Vite
- ESLint

### Organisation

#### `src/components/`

Contient les composants réutilisables de l'interface.

#### `src/pages/`

Contient les différentes pages de l'application.

#### `src/context/`

Contient les contextes React utilisés pour partager certains états dans l'application.

#### `src/utils/`

Contient les fonctions utilitaires du frontend, notamment les fonctions liées au système cryptographique.

#### `src/socket.js`

Gère la connexion Socket.IO côté client.

#### `src/App.jsx`

Point central de l'application React.

#### `src/main.jsx`

Point d'entrée de l'application.

---

## ⚙️ Backend

Le backend est développé avec **Node.js** et **Express**.

### Technologies principales

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

---

## 🔑 Authentification

Propard utilise plusieurs mécanismes pour gérer l'authentification.

### JWT

Les **JSON Web Tokens** sont utilisés pour maintenir l'authentification des utilisateurs.

### Mots de passe

Les mots de passe sont traités avec **bcryptjs** afin de ne pas stocker directement les mots de passe en clair.

### Middleware

Les routes nécessitant une authentification peuvent utiliser le middleware :

`propard-backend/middleware/auth.js`

---

## 👥 Système d'amis

Le système d'amis est principalement géré dans :

`propard-backend/routes/friends.js`

Il permet aux utilisateurs d'interagir avec leurs contacts et sert notamment de base au système de messagerie.

---

## 💬 Messagerie

Propard possède un système de messagerie permettant aux utilisateurs de communiquer entre eux.

Le modèle MongoDB associé aux messages est :

`propard-backend/models/Message.js`

Les communications temps réel utilisent **Socket.IO**.

### Flux simplifié

**Utilisateur A → Frontend A → Chiffrement → Socket.IO / API → Backend → MongoDB → Socket.IO → Frontend B → Déchiffrement → Utilisateur B**

---

## 🔐 Chiffrement des messages

Le frontend contient une implémentation de chiffrement permettant notamment de :

- gérer des clés cryptographiques ;
- stocker la clé privée localement ;
- utiliser la clé publique d'un autre utilisateur ;
- dériver une clé partagée ;
- chiffrer les messages ;
- déchiffrer les messages reçus.

Les fonctions cryptographiques sont utilisées côté client avant l'envoi des messages.

> [!IMPORTANT]
> La présence d'un système de chiffrement côté client ne signifie pas automatiquement que l'implémentation possède toutes les garanties d'un protocole E2EE professionnellement audité. Toute modification de cette partie doit être réalisée avec précaution.

---

## ⚡ Communications en temps réel

Propard utilise **Socket.IO** pour certaines communications temps réel.

Cela permet au serveur et aux clients d'échanger des événements sans devoir effectuer continuellement des requêtes HTTP.

Le client possède notamment :

`propard-frontend/src/socket.js`

---

## 📢 Annonces

Les annonces sont gérées par :

`propard-backend/routes/announcements.js`

Le modèle correspondant est :

`propard-backend/models/Announcement.js`

Les annonces permettent de communiquer des informations importantes aux utilisateurs.

---

## 🛡️ Administration

Les fonctionnalités d'administration sont regroupées dans :

`propard-backend/routes/admin.js`

Ces fonctionnalités sont destinées aux utilisateurs disposant des permissions nécessaires.

---

## 🚨 Signalements

Propard possède un système de signalement accessible via :

`propard-backend/routes/reports.js`

Les signalements permettent notamment de transmettre des contenus ou comportements problématiques à la modération.

Le projet possède également un utilitaire pour l'envoi de rapports vers Discord :

`propard-backend/utils/discordReport.js`

---

## 📞 Appels

Le backend possède une route dédiée aux informations TURN :

`propard-backend/routes/turn.js`

Cette infrastructure peut être utilisée avec WebRTC afin de permettre des communications lorsque la connexion directe entre deux utilisateurs n'est pas possible.

---

## 🗄️ Base de données

Propard utilise **MongoDB** avec **Mongoose**.

### Modèles principaux

| Modèle | Rôle |
|---|---|
| `User` | Informations relatives aux utilisateurs |
| `Message` | Messages échangés entre utilisateurs |
| `Announcement` | Annonces publiées sur la plateforme |

---

## 📡 API

Les API backend sont organisées par fonctionnalité.

| Route | Fonction |
|---|---|
| `auth.js` | Authentification et gestion des utilisateurs |
| `friends.js` | Amis et messagerie |
| `announcements.js` | Annonces |
| `admin.js` | Administration |
| `reports.js` | Signalements |
| `turn.js` | Informations/configuration TURN |

> [!NOTE]
> Les routes et paramètres exacts peuvent évoluer avec les différentes versions du projet.

---

## 🧰 Prérequis

Pour lancer Propard localement, vous aurez besoin de :

- **Node.js**
- **npm**
- **MongoDB**
- Un environnement permettant de configurer les variables d'environnement nécessaires

---

## 📥 Installation

### 1. Cloner le dépôt

<pre>
git clone https://github.com/Nolabjfjdj/Propard.git
cd Propard
</pre>

### 2. Installer le backend

<pre>
cd propard-backend
npm install
</pre>

### 3. Installer le frontend

Depuis la racine du projet :

<pre>
cd propard-frontend
npm install
</pre>

---

## ▶️ Lancer le projet

### Backend

Depuis `propard-backend/` :

<pre>
npm start
</pre>

Pour le développement :

<pre>
npm run dev
</pre>

### Frontend

Depuis `propard-frontend/` :

<pre>
npm run dev
</pre>

---

## 🏗️ Build de production

Pour générer le frontend de production :

<pre>
npm run build
</pre>

Pour prévisualiser le build :

<pre>
npm run preview
</pre>

---

## 🔐 Configuration

Le backend utilise `dotenv` pour charger les variables d'environnement.

Créez un fichier :

`propard-backend/.env`

Exemple :

<pre>
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
PORT=your_port
</pre>

> [!WARNING]
> Ne publiez jamais vos clés privées, mots de passe, tokens, clés API, URI MongoDB contenant des identifiants ou autres secrets dans GitHub.

Le fichier `.env` doit être exclu du dépôt grâce au `.gitignore`.

---

## 🌍 Déploiement

Une architecture de déploiement typique peut être organisée comme ceci :

<pre>
                  ┌─────────────────┐
                  │    propard.site │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │    Frontend     │
                  │  React + Vite   │
                  └────────┬────────┘
                           │
                           │ API / Socket.IO
                           ▼
                  ┌─────────────────┐
                  │     Backend     │
                  │ Node + Express  │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │     MongoDB     │
                  └─────────────────┘
</pre>

Les fonctionnalités WebRTC peuvent également nécessiter une infrastructure STUN/TURN.

---

## 🛡️ Sécurité

Propard utilise plusieurs mécanismes liés à la sécurité :

- authentification JWT ;
- hachage des mots de passe ;
- middleware d'authentification ;
- variables d'environnement ;
- chiffrement côté client des messages ;
- permissions administrateur ;
- système de signalement ;
- séparation frontend/backend.

> [!CAUTION]
> Aucun logiciel ne doit être considéré comme parfaitement sécurisé sans audit approprié. Les mécanismes cryptographiques, l'authentification, les permissions et les API doivent être régulièrement vérifiés lors des évolutions du projet.

---

## 🧪 Développement

### Vérifier le frontend

<pre>
cd propard-frontend
npm run lint
</pre>

### Construire le frontend

<pre>
npm run build
</pre>

### Démarrer le backend en développement

<pre>
cd propard-backend
npm run dev
</pre>

---

## 📋 Checklist de déploiement

- [ ] Configurer MongoDB
- [ ] Configurer les variables d'environnement
- [ ] Définir un `JWT_SECRET` sécurisé
- [ ] Vérifier la configuration CORS
- [ ] Installer les dépendances backend
- [ ] Installer les dépendances frontend
- [ ] Construire le frontend
- [ ] Configurer le serveur backend
- [ ] Configurer HTTPS
- [ ] Vérifier Socket.IO
- [ ] Vérifier la configuration TURN si nécessaire
- [ ] Vérifier les permissions administrateur
- [ ] Tester l'inscription et la connexion
- [ ] Tester la messagerie
- [ ] Tester les signalements

---

## 🧩 Commandes utiles

### Installation complète

<pre>
git clone https://github.com/Nolabjfjdj/Propard.git
cd Propard/propard-backend
npm install
cd ../propard-frontend
npm install
</pre>

### Développement

Backend :

<pre>
cd propard-backend
npm run dev
</pre>

Frontend :

<pre>
cd propard-frontend
npm run dev
</pre>

### Production

<pre>
cd propard-frontend
npm run build
</pre>

---

## 📂 Fichiers importants

<details>
<summary><strong>Afficher les fichiers principaux</strong></summary>

### Backend

- `propard-backend/index.js`
- `propard-backend/routes/auth.js`
- `propard-backend/routes/friends.js`
- `propard-backend/routes/announcements.js`
- `propard-backend/routes/admin.js`
- `propard-backend/routes/reports.js`
- `propard-backend/routes/turn.js`
- `propard-backend/middleware/auth.js`
- `propard-backend/models/User.js`
- `propard-backend/models/Message.js`
- `propard-backend/models/Announcement.js`

### Frontend

- `propard-frontend/src/App.jsx`
- `propard-frontend/src/main.jsx`
- `propard-frontend/src/socket.js`
- `propard-frontend/src/context/`
- `propard-frontend/src/components/`
- `propard-frontend/src/pages/`
- `propard-frontend/src/utils/`

</details>

---

## 🗺️ Vue d'ensemble des fonctionnalités

<details>
<summary><strong>Voir l'architecture fonctionnelle</strong></summary>

<pre>
PROPARD
│
├── 👤 Utilisateurs
│   └── Authentification
│
├── 👥 Relations
│   └── Amis
│
├── 💬 Communication
│   ├── Messagerie
│   ├── Socket.IO
│   └── Chiffrement côté client
│
├── 📢 Contenu
│   └── Annonces
│
├── 🛡️ Modération
│   ├── Administration
│   └── Signalements
│
└── 📞 Communications
    └── TURN / WebRTC
</pre>

</details>

---

## 📜 Licence

Le projet est distribué sous une **licence propriétaire**.

La licence complète est disponible dans [`LICENSE`](./LICENSE).

La présence du code sur GitHub ne signifie pas que celui-ci peut être librement copié, modifié, redistribué ou réutilisé.

Consultez le fichier `LICENSE` avant toute utilisation du code.

---

## 🤝 Contributions

Les contributions externes ne sont pas automatiquement autorisées.

Avant de publier une modification, une version dérivée ou une redistribution du projet, consultez la licence et contactez l'auteur si nécessaire.

---

## 🐛 Signaler un bug

Lorsqu'un problème est signalé, fournissez si possible :

1. Une description du problème ;
2. Les étapes pour le reproduire ;
3. Le résultat attendu ;
4. Le résultat obtenu ;
5. Les informations concernant l'environnement ;
6. Les logs ou captures utiles.

> [!WARNING]
> Ne publiez jamais de mots de passe, tokens, clés API, clés privées ou données personnelles dans un rapport de bug.

---

## 🔗 Liens

- 🌐 **Site officiel :** [propard.site](https://propard.site)
- 💻 **Dépôt GitHub :** [Nolabjfjdj/Propard](https://github.com/Nolabjfjdj/Propard)

---

## 👨‍💻 Projet

**Propard**  
Projet indépendant — **2026**

Tous droits réservés.

Voir [`LICENSE`](./LICENSE) pour les conditions complètes d'utilisation.

---

> **Propard — Communication, simplicité et sécurité.**