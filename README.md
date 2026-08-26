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

```text
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