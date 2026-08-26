Propard

Plateforme web de communication et de partage développée autour d’une architecture moderne React + Node.js.

Propard est une plateforme web proposant différents services autour des comptes utilisateurs, des relations entre utilisateurs, de la messagerie en temps réel, des annonces et de la modération.

Le projet est composé de deux parties principales :

* Frontend : application web React utilisant Vite.
* Backend : API Node.js utilisant Express, MongoDB/Mongoose et Socket.IO.

🌐 Site

Site officiel : https://propard.site

Dépôt GitHub : https://github.com/Nolabjfjdj/Propard

⸻

✨ Fonctionnalités

👤 Comptes utilisateurs

Propard possède un système de comptes permettant notamment :

* la création de compte ;
* la connexion ;
* l’authentification ;
* la gestion des utilisateurs ;
* la gestion de certaines informations publiques du profil ;
* la gestion des clés publiques utilisées par le système de chiffrement.

L’authentification du backend utilise notamment JSON Web Tokens (JWT) et le hachage des mots de passe avec bcryptjs.

👥 Système d’amis

Les utilisateurs peuvent interagir entre eux grâce au système d’amis.

Le backend possède une route dédiée à cette partie :

propard-backend/routes/friends.js

Le système permet notamment de gérer les relations entre utilisateurs et leurs conversations.

💬 Messagerie

Propard dispose d’un système de messagerie entre utilisateurs.

La communication temps réel repose sur Socket.IO, avec un serveur Socket.IO côté backend et un client Socket.IO côté frontend.

Le backend possède notamment le modèle :

propard-backend/models/Message.js

Les messages sont associés aux utilisateurs concernés et disposent notamment d’informations permettant leur gestion et leur affichage.

🔐 Chiffrement des messages

Le projet intègre un système de chiffrement côté client pour les conversations.

Le frontend possède des utilitaires cryptographiques permettant notamment de :

* gérer les clés de chiffrement ;
* dériver une clé partagée entre utilisateurs ;
* chiffrer les messages avant leur envoi ;
* déchiffrer les messages lors de leur affichage.

Le principe général est que le contenu destiné à être envoyé est chiffré côté client avant sa transmission au backend.

Important : la présence d’un système de chiffrement dans le code ne constitue pas à elle seule une preuve qu’une implémentation est parfaitement sécurisée ou qu’elle possède toutes les propriétés d’un système E2EE audité professionnellement. Toute modification du système cryptographique doit donc être réalisée avec beaucoup de précautions.

⚡ Temps réel

Socket.IO est utilisé pour certaines communications en temps réel.

Cela permet notamment au frontend de recevoir des événements sans devoir recharger continuellement la page.

Le frontend possède également :

propard-frontend/src/socket.js

📢 Annonces

Propard possède un système d’annonces.

Le backend contient une route dédiée :

propard-backend/routes/announcements.js

ainsi qu’un modèle :

propard-backend/models/Announcement.js

Les annonces permettent notamment de communiquer des informations importantes aux utilisateurs.

🛡️ Administration

Une partie du backend est dédiée aux fonctions d’administration :

propard-backend/routes/admin.js

Ces fonctionnalités sont destinées aux opérations nécessitant des privilèges administrateur.

🚨 Signalements

Propard possède également un système de signalement :

propard-backend/routes/reports.js

Les signalements permettent de transmettre des contenus ou comportements problématiques à la modération.

Le projet possède également un utilitaire destiné à l’envoi de rapports vers Discord :

propard-backend/utils/discordReport.js

📞 Appels

Le backend possède une route dédiée à la configuration TURN :

propard-backend/routes/turn.js

Cette partie est utilisée pour les communications nécessitant une infrastructure STUN/TURN.

⸻

🏗️ Architecture

Le projet est organisé en deux applications principales.

Propard/
├── propard-backend/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── utils/
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
│   ├── package.json
│   ├── vite.config.js
│   └── index.html
│
├── .gitignore
└── LICENSE

⸻

🖥️ Frontend

Le frontend est une application React construite avec Vite.

Les dépendances principales sont :

* React
* React DOM
* React Router
* Axios
* Socket.IO Client

Le projet utilise également ESLint pour l’analyse du code.

Structure du frontend

src/components/

Contient les composants réutilisables de l’interface.

src/pages/

Contient les différentes pages de l’application.

src/context/

Contient les contextes React utilisés pour partager certains états entre plusieurs composants.

src/utils/

Contient les fonctions utilitaires du frontend, notamment les fonctions utilisées par le système cryptographique.

src/socket.js

Gère la connexion Socket.IO côté client.

App.jsx

Point central de l’application React et de son système de navigation.

main.jsx

Point d’entrée de l’application React.

⸻

⚙️ Backend

Le backend est une application Node.js + Express.

Les principales dépendances sont :

* Express
* Mongoose
* bcryptjs
* jsonwebtoken
* Socket.IO
* Nodemailer
* CORS
* dotenv

Le backend expose les différentes API utilisées par le frontend.

Structure du backend

index.js

Point d’entrée du serveur backend.

Il initialise notamment l’application Express et les fonctionnalités serveur nécessaires au fonctionnement de Propard.

routes/

Les routes principales sont organisées par fonctionnalité :

routes/
├── admin.js
├── announcements.js
├── auth.js
├── friends.js
├── reports.js
└── turn.js

middleware/

Contient les middlewares utilisés par le backend.

Le projet possède notamment un middleware d’authentification :

middleware/auth.js

models/

Les modèles MongoDB/Mongoose actuellement présents sont notamment :

models/
├── Announcement.js
├── Message.js
└── User.js

utils/

Contient les utilitaires backend.

⸻

🗄️ Base de données

Propard utilise MongoDB avec Mongoose.

Les modèles principaux sont :

User

Représente les utilisateurs de la plateforme.

Message

Représente les messages échangés entre utilisateurs.

Announcement

Représente les annonces publiées sur la plateforme.

⸻

🔑 Authentification

L’authentification du backend utilise plusieurs composants :

* bcryptjs pour le traitement sécurisé des mots de passe ;
* jsonwebtoken pour les tokens JWT ;
* middleware d’authentification pour protéger les routes nécessitant un utilisateur connecté.

Les fonctionnalités d’authentification sont principalement regroupées dans :

propard-backend/routes/auth.js

⸻

📡 API

Les principales catégories d’API sont organisées dans les fichiers suivants :

Fichier	Fonction
auth.js	Authentification et gestion des utilisateurs
friends.js	Amis et messagerie
announcements.js	Annonces
admin.js	Administration
reports.js	Signalements
turn.js	Configuration TURN

Les routes exactes et leurs paramètres doivent être considérés comme dépendants de la version actuellement présente dans le dépôt.

⸻

🛠️ Installation

Prérequis

Pour lancer Propard localement, il faut notamment disposer de :

* Node.js
* npm
* une instance MongoDB
* les variables d’environnement nécessaires au backend

⸻

📥 Cloner le dépôt

git clone https://github.com/Nolabjfjdj/Propard.git
cd Propard

⸻

🔧 Installation du backend

cd propard-backend
npm install

Le backend possède les scripts suivants :

npm start

pour lancer le serveur en mode normal.

Pour le développement :

npm run dev

Le script de développement utilise nodemon.

⸻

🎨 Installation du frontend

Depuis la racine du projet :

cd propard-frontend
npm install

Lancer le serveur de développement :

npm run dev

Créer une version de production :

npm run build

Prévisualiser le build :

npm run preview

Vérifier le code avec ESLint :

npm run lint

⸻

🔐 Variables d’environnement

Le backend utilise dotenv, ce qui permet de charger les variables depuis un fichier .env.

Les valeurs sensibles ne doivent jamais être ajoutées au dépôt Git.

Un environnement de production doit notamment prévoir les informations nécessaires pour :

* la connexion MongoDB ;
* la signature des JWT ;
* les services d’envoi d’e-mails ;
* les services TURN ;
* les éventuels services externes utilisés par la modération.

Les noms exacts des variables doivent correspondre à ceux utilisés dans le code de la version déployée.

Exemple de structure :

MONGODB_URI=...
JWT_SECRET=...
PORT=...

Ne réutilisez jamais ces valeurs telles quelles en production avec de vraies informations sensibles.

⸻

🚀 Déploiement

Propard peut être déployé en séparant le frontend et le backend.

Architecture recommandée :

                    ┌─────────────────┐
                    │     Utilisateur │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │    Frontend     │
                    │ React + Vite    │
                    └────────┬────────┘
                             │
                 HTTP / HTTPS + Socket.IO
                             │
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

Pour les fonctionnalités nécessitant des communications WebRTC, une infrastructure STUN/TURN peut également être utilisée.

⸻

🔒 Sécurité

Propard intègre plusieurs mécanismes liés à la sécurité :

* authentification JWT ;
* hachage des mots de passe avec bcryptjs ;
* middleware d’authentification ;
* séparation frontend/backend ;
* variables d’environnement pour les secrets ;
* système de chiffrement côté client pour les messages ;
* système de signalement ;
* système de permissions pour certaines fonctionnalités d’administration.

Bonnes pratiques pour une installation

Ne commitez jamais :

.env

ou toute autre clé secrète.

Les secrets doivent être configurés directement dans l’environnement du serveur.

⸻

📜 Licence

Le dépôt contient une licence propriétaire.

Le fichier LICENSE indique notamment que la copie, la modification, la distribution ou l’utilisation du code sans autorisation écrite préalable et explicite de l’auteur est interdite.

En conséquence, le fait que le dépôt GitHub soit public ne signifie pas que son code est librement réutilisable.

Consultez impérativement le fichier LICENSE avant toute utilisation ou redistribution du code.

⸻

🧪 État du projet

Propard est un projet en développement actif.

Le dépôt principal contient actuellement le frontend et le backend séparés et continue d’évoluer.

Certaines fonctionnalités peuvent être modifiées, améliorées ou remplacées au fil des versions.

⸻

🤝 Contribution

Les contributions externes ne sont pas automatiquement autorisées.

Avant de :

* modifier le code ;
* redistribuer le projet ;
* créer une version dérivée ;
* publier une copie ;
* intégrer une partie du code dans un autre projet ;

consultez la licence du projet et contactez l’auteur si nécessaire.

⸻

🐛 Signaler un problème

Pour signaler un problème de sécurité ou un bug, il est recommandé de fournir :

1. une description claire du problème ;
2. les étapes permettant de le reproduire ;
3. le comportement attendu ;
4. le comportement observé ;
5. les informations utiles concernant l’environnement ;
6. des captures d’écran ou logs si nécessaire.

Ne publiez jamais de secrets, tokens JWT, mots de passe, clés API ou données personnelles dans un rapport public.

⸻

📁 Technologies utilisées

Frontend

* React
* Vite
* React Router
* Axios
* Socket.IO Client
* ESLint

Backend

* Node.js
* Express
* MongoDB
* Mongoose
* JWT
* bcryptjs
* Socket.IO
* Nodemailer
* dotenv
* CORS

⸻

📊 Structure technique simplifiée

                         PROPARD
                            │
             ┌──────────────┴──────────────┐
             │                             │
             ▼                             ▼
       FRONTEND                         BACKEND
     React + Vite                   Node + Express
             │                             │
             │                             ├── Authentication
             │                             ├── Friends
             │                             ├── Messages
             │                             ├── Announcements
             │                             ├── Reports
             │                             ├── Administration
             │                             └── TURN
             │
             ├── Pages
             ├── Components
             ├── Context
             ├── Utils
             └── Socket.IO
                                           │
                                           ▼
                                      MongoDB

⸻

🌐 À propos de Propard

Propard est un projet indépendant visant à proposer une plateforme web regroupant plusieurs fonctionnalités de communication et d’interaction entre utilisateurs dans une même application.

Le projet évolue progressivement avec l’ajout de nouvelles fonctionnalités et l’amélioration de son architecture.

⸻

📌 Liens

* Site officiel : https://propard.site
* GitHub : https://github.com/Nolabjfjdj/Propard

⸻

© Copyright

Copyright © 2026 Propard.

Tous droits réservés.

Voir LICENSE pour les conditions complètes d’utilisation du code.