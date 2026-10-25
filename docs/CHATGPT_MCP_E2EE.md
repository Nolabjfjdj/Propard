# Intégration ChatGPT / Propard avec chiffrement de bout en bout

## Objectif

Préparer une intégration de Propard utilisable depuis ChatGPT, sans remplacer le chiffrement de bout en bout (E2EE) des messages privés et sans exposer les clés privées des utilisateurs.

Ce document définit les exigences de sécurité avant toute modification du système de messagerie. Il ne signifie pas que l'intégration est déjà opérationnelle.

## État actuel vérifié

- Le backend est Node.js / Express et utilise MongoDB avec Mongoose.
- Les messages privés sont envoyés par Socket.IO avec `encrypted: true`.
- Le serveur valide le format des contenus chiffrés, mais le chiffrement et le déchiffrement des conversations se font côté client.
- Le modèle `Message` stocke le contenu et un indicateur `encrypted`.
- Les routes de messagerie privée exigent que les deux utilisateurs soient amis.

## Règles de sécurité obligatoires

1. Ne jamais envoyer une clé privée E2EE à ChatGPT, au serveur MCP, au backend Propard ou à un journal serveur.
2. Ne jamais créer une route qui accepte du texte clair et le stocke comme s'il s'agissait d'un message E2EE.
3. Ne jamais marquer arbitrairement un texte clair comme `encrypted: true`.
4. Le backend Propard ne doit recevoir que l'enveloppe chiffrée finale, produite par un composant de chiffrement côté client approuvé.
5. Respecter les amitiés, blocages, droits de groupe, limites de taille et protections anti-abus déjà appliqués par Propard.
6. Les lectures de messages ne doivent renvoyer que des enveloppes chiffrées si l'outil serveur ne possède pas de mécanisme client E2EE approuvé.
7. Les journaux, traces et erreurs ne doivent contenir ni texte des messages, ni jetons d'accès, ni clés.
8. Les opérations d'envoi doivent nécessiter une confirmation explicite de l'utilisateur avant toute transmission.

## Limite technique à résoudre

Un outil MCP classique reçoit les arguments fournis par le modèle sur son serveur. Si l'outil reçoit directement le texte que ChatGPT a rédigé, ce serveur peut lire ce texte avant de le transmettre. Chiffrer ensuite le texte dans le serveur MCP ne préserve donc pas la propriété selon laquelle le serveur ne peut pas lire le message.

Pour préserver le modèle E2EE existant, le chiffrement doit être effectué côté client, avant que le contenu n'atteigne le backend Propard. Cela exige un composant client approuvé capable d'utiliser la clé publique du destinataire et de produire exactement le format de chiffrement déjà compris par Propard. Une simple route REST/MCP qui reçoit du texte ne suffit pas.

Il faut aussi distinguer la confidentialité vis-à-vis du backend Propard de la confidentialité vis-à-vis du fournisseur du modèle : quand l'utilisateur demande à ChatGPT de rédiger un message, le texte soumis au modèle est visible par le service ChatGPT conformément à ses règles de traitement des données. Il ne faut pas présenter cela comme un chiffrement de bout en bout entre deux appareils contrôlés uniquement par les utilisateurs.

## Architecture cible à valider

- **Couche ChatGPT/MCP** : authentification OAuth avec autorisations minimales; outils limités à des actions explicitement autorisées.
- **Couche client E2EE** : composant de confiance qui chiffre le brouillon pour le destinataire à l'aide du protocole et du format de clés de Propard; aucune clé privée ne quitte le client.
- **Backend Propard** : reçoit uniquement le contenu chiffré final et applique les mêmes contrôles d'identité, d'amitié, de blocage, de groupe, de taille et de débit que la messagerie existante.
- **Client destinataire** : déchiffre le message selon le mécanisme E2EE actuel.
- **Confirmation** : afficher le destinataire exact et le texte à envoyer avant de lancer le chiffrement et l'envoi.

Cette architecture n'est pas validée tant que le composant client de chiffrement n'a pas été identifié et testé. Ne pas implémenter l'envoi MCP de texte clair en attendant.

## Étapes de développement

1. Cartographier le format E2EE actuel : génération et distribution des clés publiques, enveloppe chiffrée, métadonnées et version du protocole.
2. Identifier si le client Propard peut fournir un flux d'envoi approuvé depuis un brouillon ChatGPT sans exposer de clé privée.
3. Définir OAuth et les permissions de l'intégration avant d'ajouter des routes accessibles par ChatGPT.
4. Implémenter des outils MCP en lecture seule en premier, avec réponses minimales et sans déchiffrement côté serveur.
5. N'ajouter l'envoi qu'après validation d'un chiffrement côté client et tests d'intégration.
6. Ajouter des tests vérifiant qu'aucun texte clair ou secret n'est écrit dans les logs ou stocké par le backend.
7. Vérifier les limitations de connexion MCP et d'écriture du compte ChatGPT cible avant d'annoncer une compatibilité.

## Critères d'acceptation avant l'envoi

- Le serveur Propard ne peut pas déchiffrer le message.
- Aucune clé privée n'est envoyée au serveur MCP ou à Propard.
- L'enveloppe produite est compatible avec les clients Propard existants.
- Les contrôles de destinataire et d'amitié sont appliqués côté backend.
- L'envoi ne se produit qu'après confirmation explicite.
- Les tests démontrent qu'aucun texte clair n'est stocké dans MongoDB ou écrit dans les logs.
