# Propard

> **Propard** est une plateforme web de communication et d'interaction française entre utilisateurs, développée avec **React**, **Node.js**, **Express**, **MongoDB** et **Socket.IO**.

[![Website](https://img.shields.io/badge/Website-propard.site-blue?style=flat-square)](https://propard.site)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-black?style=flat-square&logo=github)](https://github.com/Nolabjfjdj/Propard)
[![License](https://img.shields.io/badge/License-Proprietary-red?style=flat-square)](./LICENSE)

---

## 📖 Présentation

**Propard** est un projet indépendant français regroupant différentes fonctionnalités de communication et d'interaction entre utilisateurs.

L'application est composée de deux parties principales :

- **Frontend** — interface utilisateur développée avec React et Vite.
- **Backend** — serveur Node.js / Express fournissant l'API et les fonctionnalités temps réel.

Les données sont stockées avec **MongoDB** via **Mongoose**, tandis que **Socket.IO** est utilisé pour les communications en temps réel.

---

## ✨ Fonctionnalités

| Fonctionnalité | Description |
|---|---|
| 👤 Comptes | Création et authentification des utilisateurs |
| 🔐 Authentification | JWT et mots de passe protégés avec bcrypt |
| 👥 Amis | Demandes, acceptation, suppression, blocage et surnoms |
| 💬 Messagerie | Messages privés entre utilisateurs |
| 🔒 Chiffrement | Chiffrement côté client des messages |
| ⚡ Temps réel | Communications via Socket.IO |
| 📢 Annonces | Système d'annonces pour les utilisateurs |
| 🚨 Signalements | Signalement de messages et gestion de leur statut |
| 🛡️ Administration | Fonctions d'administration protégées |
| 📞 WebRTC | Signalisation et infrastructure STUN/TURN pour les appels |
| 🗄️ Base de données | MongoDB avec Mongoose |
| 🗑️ Suppression de compte | Gestion de la suppression et de la restauration temporaire |

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
│     Socket.IO Client          │
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
│  ├── Reports                  │
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
│   ├── index.js
│   ├── package.json
│   └── package-lock.json
│
├── propard-frontend/
│   ├── public/
│   ├── src/
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

Le frontend est développé avec **React** et construit avec **Vite**.

### Technologies

- ⚛️ React
- 🧭 React Router
- 🌐 Axios
- ⚡ Socket.IO Client
- ⚡ Vite
- 🧹 ESLint

Le frontend contient notamment les pages, composants, contextes, utilitaires et la gestion de la connexion Socket.IO.

---

## ⚙️ Backend

Le backend repose sur :

- 🟢 Node.js
- 🚂 Express
- 🍃 Mongoose
- 🗄️ MongoDB
- 🔐 JSON Web Token
- 🔑 bcryptjs
- ⚡ Socket.IO
- 📧 Nodemailer
- 🔧 dotenv
- 🌐 CORS

Le serveur fournit également le frontend compilé en production et gère le routage de l'application.

---

## 🔑 Authentification

Propard utilise **JWT** pour l'authentification et **bcryptjs** pour le traitement sécurisé des mots de passe.

Les inscriptions appliquent notamment des règles sur :

- le format du nom d'utilisateur ;
- sa longueur ;
- l'unicité du compte ;
- la longueur minimale du mot de passe.

Les routes nécessitant une authentification utilisent le middleware dédié.

---

## 👥 Système d'amis

Le système d'amis permet notamment :

- ➕ d'envoyer une demande ;
- ✅ d'accepter une demande ;
- ❌ de refuser ou supprimer une relation ;
- ✏️ de définir un surnom ;
- 🚫 de bloquer un utilisateur ;
- 🔓 de débloquer un utilisateur.

L'ajout d'un utilisateur peut notamment utiliser son **ID** ou son **IP alias**.

---

## 💬 Messagerie

Les utilisateurs peuvent échanger des messages avec leurs amis.

La messagerie prend notamment en charge :

- 💬 envoi de messages ;
- ✏️ modification ;
- 🗑️ suppression ;
- 👀 lecture des messages ;
- 🔔 messages non lus ;
- ⚡ réception en temps réel.

Les messages sont transmis au backend sous forme chiffrée lorsqu'ils utilisent le format cryptographique prévu par le client.

---

## 🔐 Chiffrement

Propard utilise un système de **chiffrement côté client**.

Le backend reçoit notamment des données contenant :

- une version du format ;
- un vecteur d'initialisation (`iv`) ;
- le contenu chiffré (`ct`).

Les clés publiques sont enregistrées côté serveur afin de permettre au client d'utiliser le système cryptographique prévu par l'application.

> ⚠️ Le système de chiffrement n'a pas été présenté comme un protocole cryptographique audité professionnellement.

---

## ⚡ Temps réel

**Socket.IO** est utilisé pour plusieurs fonctionnalités temps réel.

Le serveur gère notamment :

- `authenticate`
- `sendMessage`
- `callUser`
- `answerCall`
- `iceCandidate`
- `iceRestartOffer`
- `iceRestartAnswer`
- `endCall`

Le système permet également de suivre la présence des utilisateurs connectés.

---

## 📢 Annonces

Propard possède un système d'annonces permettant à l'administration de publier une annonce active.

Les utilisateurs peuvent :

- 📢 recevoir une annonce ;
- 👀 la consulter ;
- ✅ l'accepter.

Les annonces acceptées sont enregistrées pour chaque compte.

---

## 🚨 Signalements

Les utilisateurs peuvent signaler un message.

Un signalement contient notamment :

- 👤 le signalant ;
- 👤 l'utilisateur signalé ;
- 💬 le message concerné ;
- 📝 le contenu du message ;
- 📌 un motif facultatif ;
- 📊 son statut.

Les statuts disponibles sont :

- `new`
- `processed`
- `rejected`

Les signalements disposent également de limitations afin de réduire les abus.

---

## 🛡️ Administration

Le backend possède plusieurs fonctionnalités d'administration protégées par des clés secrètes configurées dans les variables d'environnement.

Elles permettent notamment de gérer :

- 🔑 certains comptes ;
- 📢 les annonces ;
- 🚨 les signalements.

La gestion des signalements utilise notamment :

`/api/admin/reports`

---

## 📞 WebRTC & TURN

Propard possède une infrastructure de signalisation permettant d'utiliser **WebRTC**.

Le backend fournit les informations ICE via :

`/api/turn-credentials`

La configuration peut utiliser plusieurs serveurs **STUN/TURN**.

Les serveurs TURN configurés sont récupérés en parallèle puis regroupés côté serveur afin d'être fournis au client.

---

## 🗄️ Base de données

Propard utilise **MongoDB** avec **Mongoose**.

### Modèles principaux

| Modèle | Utilisation |
|---|---|
| `User` | Comptes et relations entre utilisateurs |
| `Message` | Messages privés |
| `Report` | Signalements |
| `Announcement` | Annonces |

---

## 🛡️ Sécurité

Le backend utilise notamment :

- 🔐 JWT ;
- 🔑 bcrypt ;
- 🛡️ middleware d'authentification ;
- 🚦 limitations de requêtes ;
- 🔒 headers de sécurité HTTP ;
- 🌐 configuration CORS ;
- 🔐 variables d'environnement pour les secrets ;
- 🕵️ IP aliases ;
- 🔒 chiffrement côté client.

Les limitations de requêtes actuelles utilisent un stockage en mémoire du processus Node.js.

---

## 📥 Installation

### Cloner le dépôt

```bash
git clone https://github.com/Nolabjfjdj/Propard.git
cd Propard