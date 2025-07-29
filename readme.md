# 🏁 Flag Party - Jeu Multijoueur

Un jeu multijoueur en temps réel où les joueurs devinent des drapeaux de pays avec différents modes de réponse !

## 🎮 Modes de Jeu

Flag Party propose **3 modes de jeu distincts** pour des expériences variées :

### 🏃 **LeFast** - Course de Vitesse  (Timer configuré dans la waiting room)
- **Principe** : Premier arrivé, premier servi !
- **Gameplay** : Saisissez le nom du pays le plus rapidement possible
- **Points** : 1000 points pour le premier qui trouve
- **Stratégie** : Vitesse et précision sont essentielles
- **Interface** : Timer circulaire, saisie libre, pause entre questions
- **Timer** : Le premier a 15000 points gagne, attention à bien supprimer le timer lorsque qu'on sélectionne le mode lefast (voir le fichier server.js)

### 🧠 **LeDream** - Réflexion Stratégique  (Vainqueur premier à 15000points)
- **Principe** : Choisissez votre niveau de difficulté à chaque question
- **Timer** : 10 secondes par question avec barre de progression
- **3 modes de réponse** :
  - 📝 **Saisie libre** : 1000 points (+ bonus rapidité jusqu'à 100 pts)
  - 🔤 **Carré (QCM 4 choix)** : 500 points (+ bonus rapidité)
  - ⚡ **50/50 (2 choix)** : 250 points (+ bonus rapidité)
- **Stratégie** : Équilibrez risque/récompense selon vos connaissances
- **Interface** : Ambiance sobre, feedback discret, changement de mode en cours de jeu
Problème : Il faut que la question change toutes les 10 secondes, et pas changer dès qu'on valide une réponse

### 🎯 **LeFist** - Drag & Drop Géographique (Timer configuré dans la waiting room)
- **Principe** : Glissez-déposez les drapeaux dans les bonnes zones continentales
- **Gameplay** : Drapeaux apparaissent au centre, à placer dans 6 boîtes (Europe, Asie, Amérique, Afrique, Océanie, Autre)
- **Difficulté progressive** : Vitesse augmente, temps réduit, fond coloré évolutif
- **Points** : 200 × vitesse actuelle (plus c'est rapide, plus ça rapporte)
- **Interface** : Inspiration Mario 64, zones de drop agrandies, timer individuel par drapeau
- **Stratégie** : Réflexes et connaissance géographique

Problème : les drapeaux ne se génèrent pas, analyser et mettre des logs, vérifier que le serveur est bien lancé et que les drapeaux sont bien chargés, le glissez-déposez ne fonctionne pas pas non plus 

Autre probleme/feature que je voudrais ajouter : quand l'une des parties est terminée, on doit pouvoir retourner dans la waiting room pour refaire une partie, ou quitter la room et revenir sur la page d'accueil pour créer une nouvelle partie


## 🎮 Fonctionnalités Générales

- **Multijoueur en temps réel** avec Socket.io
- **Créer/Rejoindre des parties** avec codes uniques
- **Timer personnalisable** (30s, 60s, 90s) selon le mode
- **Système de scores** en temps réel avec classements
- **Interface moderne** avec design glassmorphism sobre

## 🚀 Installation

### 1. Cloner/Télécharger le projet
```bash
# Si vous avez git
git clone <votre-repo>
cd flag-party

# Ou créez simplement un dossier avec les fichiers
```

### 2. Installer les dépendances
```bash
npm install
```

### 3. Structure des fichiers
Assurez-vous d'avoir cette structure :
```
flag-party/
├── server.js
├── package.json
├── public/
│   └── index.html
└── README.md
```

### 4. Démarrer le serveur
```bash
# Mode production
npm start

# Mode développement (avec nodemon)
npm run dev
```

### 5. Accéder au jeu
Ouvrez votre navigateur et allez à :
```
http://localhost:3000
```

## 🎯 Comment jouer

1. **Entrez votre nom** sur l'écran d'accueil
2. **Créez une partie** ou **rejoignez** avec un code
3. **L'hôte** peut choisir la durée du jeu et lancer la partie
4. **Devinez un maximum de drapeaux** dans le temps imparti !
5. **Choisissez votre stratégie** :
   - Texte libre pour 1000 pts (mais plus difficile)
   - QCM pour 500 pts (plus facile)
   - 50/50 pour 250 pts (très facile)

## 🔧 Configuration

### Port du serveur
Par défaut, le serveur utilise le port 3000. Pour changer :
```bash
PORT=8080 npm start
```

### Nettoyage automatique
Les salles inactives sont automatiquement supprimées après 2 heures.

## 📡 API Socket.io

### Événements côté client
- `create-room` - Créer une nouvelle salle
- `join-room` - Rejoindre une salle existante  
- `leave-room` - Quitter la salle
- `set-game-duration` - Changer la durée (hôte uniquement)
- `start-game` - Commencer le jeu (hôte uniquement)
- `set-answer-mode` - Choisir le mode de réponse
- `submit-answer` - Soumettre une réponse

### Événements côté serveur
- `room-created` - Salle créée avec succès
- `room-joined` - Rejoint une salle
- `join-error` - Erreur lors de la connexion
- `player-joined/left` - Joueur rejoint/quitte
- `game-started` - Le jeu commence
- `timer-update` - Mise à jour du timer
- `answer-result` - Résultat de la réponse
- `game-ended` - Fin du jeu avec classements

## 🌍 Pays supportés

Le jeu inclut 36 pays avec leurs drapeaux :
- Europe : France, Allemagne, Italie, Espagne, UK, etc.
- Amérique : États-Unis, Canada, Brésil, Mexique
- Asie : Japon, Chine, Inde
- Afrique : Égypte, Maroc, Nigéria, Kenya, Ghana, Afrique du Sud
- Océanie : Australie

## 🛠️ Technologies utilisées

- **Backend** : Node.js, Express, Socket.io
- **Frontend** : HTML5, CSS3, JavaScript (Vanilla)
- **Images** : API Flagpedia
- **Temps réel** : WebSockets

## 🎨 Fonctionnalités avancées

- **Transfert d'hôte** automatique si l'hôte se déconnecte
- **Nettoyage des salles** inactives  
- **Gestion des déconnexions** gracieuse
- **Interface responsive** pour mobile/desktop
- **Indicateur de connexion** en temps réel
- **Notifications** pour tous les événements

## 🐛 Dépannage

### Le serveur ne démarre pas
- Vérifiez que Node.js est installé : `node --version`
- Vérifiez que les dépendances sont installées : `npm install`

### Impossible de rejoindre une salle
- Vérifiez que le code de la salle est correct
- La salle peut avoir expiré (2h d'inactivité)
- Le jeu peut avoir déjà commencé

### Images de drapeaux ne s'affichent pas
- Vérifiez votre connexion internet
- L'API Flagpedia peut être temporairement indisponible

## 📜 Licence

MIT License - Utilisez librement pour vos projets !

## 🤝 Contribution

N'hésitez pas à :
- Ajouter de nouveaux pays
- Améliorer l'interface
- Optimiser les performances
- Corriger des bugs

---

**Amusez-vous bien avec Flag Party ! 🎉**