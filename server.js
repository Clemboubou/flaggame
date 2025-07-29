const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.static('public'));

// Servir le fichier HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Structure des données en mémoire
const rooms = new Map();
const players = new Map(); // socketId -> playerData

// Liste des pays et leurs codes
const countries = {
    'fr': 'France', 'de': 'Allemagne', 'it': 'Italie', 'es': 'Espagne',
    'gb': 'Royaume-Uni', 'us': 'États-Unis', 'ca': 'Canada', 'jp': 'Japon',
    'cn': 'Chine', 'in': 'Inde', 'br': 'Brésil', 'mx': 'Mexique',
    'au': 'Australie', 'za': 'Afrique du Sud', 'eg': 'Égypte', 'ma': 'Maroc',
    'ng': 'Nigéria', 'ke': 'Kenya', 'gh': 'Ghana', 'se': 'Suède',
    'no': 'Norvège', 'fi': 'Finlande', 'dk': 'Danemark', 'nl': 'Pays-Bas',
    'be': 'Belgique', 'ch': 'Suisse', 'at': 'Autriche', 'pt': 'Portugal',
    'gr': 'Grèce', 'tr': 'Turquie', 'ru': 'Russie', 'ua': 'Ukraine',
    'pl': 'Pologne', 'cz': 'République tchèque', 'hu': 'Hongrie', 'ro': 'Roumanie'
};

const countryNames = Object.values(countries);
const countryCodes = Object.keys(countries);

// Mapping des pays vers leurs continents pour le mode LeFist
const countryToContinent = {
    // Europe
    'fr': 'Europe', 'de': 'Europe', 'it': 'Europe', 'es': 'Europe',
    'gb': 'Europe', 'se': 'Europe', 'no': 'Europe', 'fi': 'Europe',
    'dk': 'Europe', 'nl': 'Europe', 'be': 'Europe', 'ch': 'Europe',
    'at': 'Europe', 'pt': 'Europe', 'gr': 'Europe', 'tr': 'Europe',
    'ru': 'Europe', 'ua': 'Europe', 'pl': 'Europe', 'cz': 'Europe',
    'hu': 'Europe', 'ro': 'Europe',
    
    // Amérique
    'us': 'Amérique', 'ca': 'Amérique', 'br': 'Amérique', 'mx': 'Amérique',
    
    // Asie
    'jp': 'Asie', 'cn': 'Asie', 'in': 'Asie',
    
    // Afrique
    'za': 'Afrique', 'eg': 'Afrique', 'ma': 'Afrique', 'ng': 'Afrique',
    'ke': 'Afrique', 'gh': 'Afrique',
    
    // Océanie
    'au': 'Océanie'
};

// Fonctions utilitaires
function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function generateRandomFlag() {
    const randomCode = countryCodes[Math.floor(Math.random() * countryCodes.length)];
    return {
        code: randomCode,
        name: countries[randomCode]
    };
}

function getCountryContinent(countryCode) {
    // Utiliser le mapping défini plus haut
    return countryToContinent[countryCode] || 'Autre';
}

// === FONCTIONS UTILITAIRES DE SÉCURITÉ ===

// Validation stricte des payloads
function validateSubmitAnswerPayload(data) {
    if (!data || typeof data !== 'object') {
        return { valid: false, error: 'Payload invalide' };
    }
    
    const { answer, responseTime, responseType } = data;
    
    // Vérifier la présence des champs requis
    if (typeof answer !== 'string' || answer.trim().length === 0) {
        return { valid: false, error: 'Réponse manquante ou invalide' };
    }
    
    if (typeof responseTime !== 'number' || responseTime < 0 || responseTime > 15000) {
        return { valid: false, error: 'Temps de réponse invalide' };
    }
    
    if (responseType && !['text', 'carre', 'fifty'].includes(responseType)) {
        return { valid: false, error: 'Type de réponse invalide' };
    }
    
    // Sanitiser la réponse (anti-injection basique)
    const sanitizedAnswer = answer.trim().substring(0, 100); // Limiter à 100 caractères
    
    return { 
        valid: true, 
        sanitized: { 
            answer: sanitizedAnswer, 
            responseTime: Math.floor(responseTime), 
            responseType: responseType || 'text' 
        } 
    };
}

// Gestion sécurisée des timers
class TimerManager {
    constructor() {
        this.timers = new Map(); // roomCode -> { questionTimer, cleanupTimer }
    }
    
    startQuestionTimer(roomCode, callback, duration = 10000) {
        this.clearQuestionTimer(roomCode);
        
        const timerId = setTimeout(() => {
            this.clearQuestionTimer(roomCode);
            callback();
        }, duration);
        
        if (!this.timers.has(roomCode)) {
            this.timers.set(roomCode, {});
        }
        this.timers.get(roomCode).questionTimer = timerId;
        
        console.log(`[Timer] Question timer démarré pour room ${roomCode} (${duration}ms)`);
        return timerId;
    }
    
    clearQuestionTimer(roomCode) {
        const roomTimers = this.timers.get(roomCode);
        if (roomTimers && roomTimers.questionTimer) {
            clearTimeout(roomTimers.questionTimer);
            roomTimers.questionTimer = null;
            console.log(`[Timer] Question timer nettoyé pour room ${roomCode}`);
        }
    }
    
    clearAllTimers(roomCode) {
        const roomTimers = this.timers.get(roomCode);
        if (roomTimers) {
            if (roomTimers.questionTimer) {
                clearTimeout(roomTimers.questionTimer);
            }
            if (roomTimers.cleanupTimer) {
                clearTimeout(roomTimers.cleanupTimer);
            }
            this.timers.delete(roomCode);
            console.log(`[Timer] Tous les timers nettoyés pour room ${roomCode}`);
        }
    }
    
    hasActiveQuestionTimer(roomCode) {
        const roomTimers = this.timers.get(roomCode);
        return roomTimers && roomTimers.questionTimer !== null;
    }
}

// Instance globale du gestionnaire de timers
const timerManager = new TimerManager();

// Système anti-spam avancé
class AntiSpamManager {
    constructor() {
        this.playerAttempts = new Map(); // playerId -> { count, lastAttempt, windowStart }
        this.questionTimestamps = new Map(); // roomCode -> timestamp
    }
    
    // Marquer le début d'une nouvelle question
    markQuestionStart(roomCode) {
        this.questionTimestamps.set(roomCode, Date.now());
        console.log(`[AntiSpam] Nouvelle question marquée pour room ${roomCode}`);
    }
    
    // Vérifier si une réponse est dans la fenêtre temporelle valide
    isResponseInValidWindow(roomCode, maxAge = 12000) { // 12s de marge
        const questionStart = this.questionTimestamps.get(roomCode);
        if (!questionStart) return false;
        
        const age = Date.now() - questionStart;
        return age <= maxAge;
    }
    
    // Vérifier et enregistrer une tentative de réponse
    checkAndRecordAttempt(playerId, roomCode) {
        const now = Date.now();
        const windowDuration = 60000; // 1 minute
        const maxAttemptsPerWindow = 10;
        
        if (!this.playerAttempts.has(playerId)) {
            this.playerAttempts.set(playerId, {
                count: 1,
                lastAttempt: now,
                windowStart: now,
                roomCode: roomCode
            });
            return { allowed: true, remaining: maxAttemptsPerWindow - 1 };
        }
        
        const attempts = this.playerAttempts.get(playerId);
        
        // Réinitialiser si nouvelle fenêtre temporelle
        if (now - attempts.windowStart > windowDuration) {
            attempts.count = 1;
            attempts.windowStart = now;
            attempts.lastAttempt = now;
            attempts.roomCode = roomCode;
            return { allowed: true, remaining: maxAttemptsPerWindow - 1 };
        }
        
        // Vérifier si trop de tentatives
        if (attempts.count >= maxAttemptsPerWindow) {
            console.log(`[AntiSpam] Joueur ${playerId} bloqué: ${attempts.count} tentatives en ${windowDuration}ms`);
            return { allowed: false, remaining: 0, reason: 'Trop de tentatives' };
        }
        
        // Vérifier délai minimum entre tentatives (500ms)
        if (now - attempts.lastAttempt < 500) {
            console.log(`[AntiSpam] Joueur ${playerId} bloqué: tentative trop rapide`);
            return { allowed: false, remaining: 0, reason: 'Tentatives trop rapides' };
        }
        
        attempts.count++;
        attempts.lastAttempt = now;
        attempts.roomCode = roomCode;
        
        return { allowed: true, remaining: maxAttemptsPerWindow - attempts.count };
    }
    
    // Nettoyer les données d'une question terminée
    cleanupQuestion(roomCode) {
        this.questionTimestamps.delete(roomCode);
        
        // Nettoyer les tentatives des joueurs de cette room
        for (const [playerId, attempts] of this.playerAttempts.entries()) {
            if (attempts.roomCode === roomCode) {
                this.playerAttempts.delete(playerId);
            }
        }
        
        console.log(`[AntiSpam] Données nettoyées pour room ${roomCode}`);
    }
}

// Instance globale du gestionnaire anti-spam
const antiSpamManager = new AntiSpamManager();

// === LOGIQUE CENTRALISÉE LEDREAM ===

// Fonction centralisée pour gérer la fin d'une question LeDream
async function handleLeDreamQuestionEnd(roomCode) {
    const room = rooms.get(roomCode);
    if (!room || !room.gameState.started) {
        console.log(`[LeDream] Room ${roomCode} non trouvée ou jeu arrêté`);
        return;
    }
    
    const correctAnswer = room.gameState.currentFlag.name;
    
    // Préparer les résultats des joueurs
    const playerResults = [];
    if (room.gameState.ledreamAnswers) {
        for (const [playerId, result] of room.gameState.ledreamAnswers.entries()) {
            const playerData = room.players.get(playerId);
            if (playerData) {
                playerResults.push({
                    playerId: playerId,
                    playerName: playerData.name,
                    isCorrect: result.isCorrect,
                    points: result.points,
                    newScore: playerData.score
                });
            }
        }
    }
    
    // Envoyer les résultats finaux à tous les joueurs
    io.to(roomCode).emit('ledream-question-ended', {
        correctAnswer: correctAnswer,
        playerResults: playerResults
    });
    
    console.log(`[LeDream] Résultats envoyés pour room ${roomCode}: ${playerResults.length} joueurs`);
    
    // Nettoyer les données de la question
    room.gameState.ledreamAnswers = new Map();
    antiSpamManager.cleanupQuestion(roomCode);
    
    // Programmer la prochaine question après un délai
    setTimeout(() => {
        generateNextLeDreamQuestion(roomCode);
    }, 2000); // 2 secondes pour voir les résultats
}

// Fonction pour générer la prochaine question LeDream
function generateNextLeDreamQuestion(roomCode) {
    const room = rooms.get(roomCode);
    if (!room || !room.gameState.started) {
        console.log(`[LeDream] Room ${roomCode} non trouvée ou jeu arrêté pour nouvelle question`);
        return;
    }
    
    const newFlag = generateRandomFlag();
    room.gameState.currentFlag = newFlag;
    
    // Marquer le début de la nouvelle question pour l'anti-spam
    antiSpamManager.markQuestionStart(roomCode);
    
    // Envoyer la nouvelle question
    io.to(roomCode).emit('new-flag', { flag: newFlag });
    
    console.log(`[LeDream] Nouvelle question générée pour room ${roomCode}: ${newFlag.code} - ${newFlag.name}`);
}

// Fonction pour démarrer une question LeDream avec timer sécurisé
function startLeDreamQuestion(roomCode) {
    const room = rooms.get(roomCode);
    if (!room || !room.gameState.started) {
        return;
    }
    
    // Vérifier si un timer est déjà actif
    if (timerManager.hasActiveQuestionTimer(roomCode)) {
        console.log(`[LeDream] Timer déjà actif pour room ${roomCode}`);
        return;
    }
    
    // Marquer le début de la question
    antiSpamManager.markQuestionStart(roomCode);
    
    // Démarrer le timer de 10 secondes
    timerManager.startQuestionTimer(roomCode, () => {
        handleLeDreamQuestionEnd(roomCode);
    }, 10000);
    
    console.log(`[LeDream] Question démarrée pour room ${roomCode}`);
}

// === GESTION DES ROOMS ===

// Fonction pour nettoyer complètement une room
function cleanupRoom(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    console.log(`[Room] Nettoyage complet de la room ${roomCode}`);
    
    // Nettoyer tous les timers
    timerManager.clearAllTimers(roomCode);
    
    // Nettoyer le timer de jeu principal si présent
    if (room.gameState.timer) {
        clearInterval(room.gameState.timer);
    }
    
    // Nettoyer les données anti-spam
    antiSpamManager.cleanupQuestion(roomCode);
    
    // Supprimer la room
    rooms.delete(roomCode);
    
    console.log(`[Room] Room ${roomCode} complètement supprimée`);
}

// Fonction pour détecter et nettoyer les rooms abandonnées
function cleanupAbandonedRooms() {
    const now = new Date();
    let cleanedCount = 0;
    
    for (const [roomCode, room] of rooms.entries()) {
        // Vérifier si la room n'a plus de joueurs connectés
        let hasConnectedPlayers = false;
        for (const playerId of room.players.keys()) {
            if (players.has(playerId)) {
                hasConnectedPlayers = true;
                break;
            }
        }
        
        // Supprimer les rooms sans joueurs connectés
        if (!hasConnectedPlayers) {
            console.log(`[Cleanup] Room abandonnée détectée: ${roomCode}`);
            cleanupRoom(roomCode);
            cleanedCount++;
            continue;
        }
        
        // Supprimer les rooms très anciennes (plus de 2h)
        const hoursSinceCreation = (now - room.createdAt) / (1000 * 60 * 60);
        if (hoursSinceCreation > 2) {
            console.log(`[Cleanup] Room ancienne supprimée: ${roomCode} (${hoursSinceCreation.toFixed(1)}h)`);
            cleanupRoom(roomCode);
            cleanedCount++;
        }
    }
    
    if (cleanedCount > 0) {
        console.log(`[Cleanup] ${cleanedCount} rooms nettoyées`);
    }
}

function createRoom(hostId, hostName, gameDuration = 30) {
    const roomCode = generateRoomCode();
    const room = {
        code: roomCode,
        hostId: hostId,
        players: new Map(),
        gameState: {
            started: false,
            currentFlag: null,
            timeLeft: gameDuration,
            gameDuration: gameDuration,
            timer: null,
            betweenQuestions: false,
            gameMode: 'lefast', // Mode par défaut
            speed: 1 // Pour LeFist
        },
        createdAt: new Date()
    };
    
    // Ajouter l'hôte à la room
    room.players.set(hostId, {
        id: hostId,
        name: hostName,
        score: 0,
        isHost: true
    });
    
    rooms.set(roomCode, room);
    return room;
}

function joinRoom(roomCode, playerId, playerName) {
    const room = rooms.get(roomCode);
    if (!room) return null;
    
    if (room.gameState.started) return null; // Jeu déjà commencé
    
    room.players.set(playerId, {
        id: playerId,
        name: playerName,
        score: 0,
        isHost: false
    });
    
    return room;
}

function getRoomPlayersList(room) {
    return Array.from(room.players.values()).map(player => ({
        name: player.name,
        score: player.score,
        isHost: player.isHost
    }));
}

function startGameTimer(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    // Ne pas démarrer de timer pour LeDream
    if (room.gameState.gameMode === 'ledream') {
        console.log(`[LeDream] Pas de timer global pour room ${roomCode}`);
        return;
    }
    
    room.gameState.timer = setInterval(() => {
        room.gameState.timeLeft--;
        
        // Envoyer le timer à tous les joueurs (sauf LeDream)
        io.to(roomCode).emit('timer-update', room.gameState.timeLeft);
        
        if (room.gameState.timeLeft <= 0) {
            clearInterval(room.gameState.timer);
            endGame(roomCode);
        }
    }, 1000);
    
    console.log(`[Timer] Timer global démarré pour room ${roomCode} (${room.gameState.gameDuration}s)`);
}

function endGame(roomCode, gameMode = null) {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    const mode = gameMode || room.gameState.gameMode;
    
    const finalRanking = Array.from(room.players.values())
        .map(player => ({
            name: player.name,
            score: player.score,
            isHost: player.isHost
        }))
        .sort((a, b) => b.score - a.score);
    
    io.to(roomCode).emit('game-ended', { finalRanking });
    
    // Réinitialiser l'état du jeu
    room.gameState.started = false;
    room.gameState.currentFlag = null;
    room.gameState.timeLeft = room.gameState.gameDuration;
    
    // Nettoyer le timer s'il existe
    if (room.gameState.timer) {
        clearInterval(room.gameState.timer);
        room.gameState.timer = null;
    }
    
    // Nettoyer les timers spécifiques à LeDream
    if (mode === 'ledream') {
        timerManager.clearAllTimers(roomCode);
        antiSpamManager.cleanupQuestion(roomCode);
        // Nettoyer les données LeDream
        if (room.gameState.ledreamAnswers) {
            room.gameState.ledreamAnswers.clear();
        }
        console.log(`[LeDream] Jeu LeDream terminé dans room ${roomCode}`);
    }
    
    console.log(`Jeu terminé dans la room: ${roomCode}`);
}

// Gestion des connexions Socket.io
io.on('connection', (socket) => {
    console.log(`Joueur connecté: ${socket.id}`);
    
    // Créer une nouvelle room
    socket.on('create-room', (data) => {
        const { playerName, gameDuration } = data;
        
        const room = createRoom(socket.id, playerName, gameDuration);
        socket.join(room.code);
        
        players.set(socket.id, {
            id: socket.id,
            name: playerName,
            roomCode: room.code
        });
        
        socket.emit('room-created', {
            roomCode: room.code,
            players: getRoomPlayersList(room),
            isHost: true
        });
        
        console.log(`Room créée: ${room.code} par ${playerName}`);
    });
    
    // Rejoindre une room
    socket.on('join-room', (data) => {
        const { roomCode, playerName } = data;
        
        const room = joinRoom(roomCode, socket.id, playerName);
        
        if (!room) {
            socket.emit('join-error', 'Room introuvable ou jeu déjà commencé');
            return;
        }
        
        socket.join(roomCode);
        
        players.set(socket.id, {
            id: socket.id,
            name: playerName,
            roomCode: roomCode
        });
        
        const playersList = getRoomPlayersList(room);
        
        // Informer le joueur qui rejoint
        socket.emit('room-joined', {
            roomCode: roomCode,
            players: playersList,
            isHost: false,
            gameDuration: room.gameState.gameDuration
        });
        
        // Informer tous les autres joueurs
        socket.to(roomCode).emit('player-joined', {
            players: playersList,
            newPlayer: playerName
        });
        
        console.log(`${playerName} a rejoint la room: ${roomCode}`);
    });
    
    // Changer le mode de jeu (seulement l'hôte)
    socket.on('set-game-mode', (data) => {
        const player = players.get(socket.id);
        if (!player) return;
        
        const room = rooms.get(player.roomCode);
        if (!room || room.hostId !== socket.id) return;
        
        room.gameState.gameMode = data.mode;
        
        io.to(player.roomCode).emit('game-mode-changed', data.mode);
    });

    // Changer la durée du jeu (seulement l'hôte, pas pour LeDream)
    socket.on('set-game-duration', (data) => {
        const player = players.get(socket.id);
        if (!player) return;
        
        const room = rooms.get(player.roomCode);
        if (!room || room.hostId !== socket.id) return;
        
        // Ignorer la durée pour le mode LeDream
        if (room.gameState.gameMode === 'ledream') {
            console.log(`[LeDream] Durée ignorée pour room ${player.roomCode} (mode LeDream)`);
            return;
        }
        
        room.gameState.gameDuration = data.duration;
        room.gameState.timeLeft = data.duration;
        
        io.to(player.roomCode).emit('game-duration-changed', data.duration);
        console.log(`[Game] Durée changée à ${data.duration}s pour room ${player.roomCode}`);
    });
    
    // Commencer le jeu (seulement l'hôte)
    socket.on('start-game', () => {
        const player = players.get(socket.id);
        if (!player) return;
        
        const room = rooms.get(player.roomCode);
        if (!room || room.hostId !== socket.id || room.gameState.started) return;
        
        room.gameState.started = true;
        room.gameState.timeLeft = room.gameState.gameDuration;
        room.gameState.currentFlag = generateRandomFlag();
        
        // Réinitialiser les scores des joueurs
        room.players.forEach(p => {
            p.score = 0;
        });
        
        io.to(player.roomCode).emit('game-started', {
            timeLeft: room.gameState.timeLeft,
            currentFlag: room.gameState.currentFlag,
            gameMode: room.gameState.gameMode
        });
        
        // Logique spécifique selon le mode de jeu
        if (room.gameState.gameMode === 'ledream') {
            // Pour LeDream : pas de timer global, jeu en continu
            antiSpamManager.markQuestionStart(player.roomCode);
            console.log(`[LeDream] Jeu LeDream démarré pour room ${player.roomCode} - pas de timer global`);
        } else {
            // Pour LeFast et LeFist : utiliser le timer global
            startGameTimer(player.roomCode);
            console.log(`[Game] Timer global démarré pour room ${player.roomCode} (${room.gameState.gameDuration}s)`);
        }
        
        console.log(`Jeu commencé dans la room: ${player.roomCode}`);
    });
    
    // Soumettre une réponse
    socket.on('submit-answer', (data) => {
        const player = players.get(socket.id);
        if (!player) return;
        
        const room = rooms.get(player.roomCode);
        if (!room || !room.gameState.started) return;
        
        const roomPlayer = room.players.get(socket.id);
        if (!roomPlayer) return;
        
        // Vérifier si on est en pause entre les questions (seulement pour LeFast)
        if (room.gameState.betweenQuestions && room.gameState.gameMode === 'lefast') return;
        
        const { answer, mode, responseTime, responseType } = data;
        const correctAnswer = room.gameState.currentFlag.name;
        let isCorrect = false;
        let points = 0;
        let speedBonus = 0;
        
        // Logique selon le mode de jeu
        if (mode === 'lefast') {
            // Mode LeFast: premier qui trouve gagne
            isCorrect = answer.toLowerCase().trim() === correctAnswer.toLowerCase();
            points = isCorrect ? 1000 : 0;
            
            if (isCorrect) {
                roomPlayer.score += points;
                
                // Vérifier si le joueur a atteint 15000 points
                if (roomPlayer.score >= 15000) {
                    // Fin de partie pour LeFast
                    endGame(player.roomCode, 'lefast');
                    return;
                }
                
                room.gameState.betweenQuestions = true;
                
                // Informer tous les joueurs du gagnant
                io.to(player.roomCode).emit('question-won', {
                    winnerName: roomPlayer.name,
                    correctAnswer: correctAnswer,
                    points: points
                });
                
                // Timer de 6 secondes avant la prochaine question
                setTimeout(() => {
                    const currentRoom = rooms.get(player.roomCode);
                    if (!currentRoom || !currentRoom.gameState.started) return;
                    
                    const newFlag = generateRandomFlag();
                    currentRoom.gameState.currentFlag = newFlag;
                    currentRoom.gameState.betweenQuestions = false;
                    
                    io.to(player.roomCode).emit('new-flag', { flag: newFlag });
                }, 6000);
            }
        } else if (mode === 'ledream') {
            // === MODE LEDREAM SÉCURISÉ ===
            
            // 1. Validation stricte du payload
            const validation = validateSubmitAnswerPayload(data);
            if (!validation.valid) {
                console.log(`[LeDream] Payload invalide de ${socket.id}: ${validation.error}`);
                socket.emit('error', { message: 'Données invalides' });
                return;
            }
            
            const { answer: sanitizedAnswer, responseTime: sanitizedResponseTime, responseType } = validation.sanitized;
            
            // 2. Vérifications anti-spam avancées
            const spamCheck = antiSpamManager.checkAndRecordAttempt(socket.id, player.roomCode);
            if (!spamCheck.allowed) {
                console.log(`[LeDream] Tentative bloquée pour ${socket.id}: ${spamCheck.reason}`);
                socket.emit('rate-limited', { 
                    message: spamCheck.reason,
                    remaining: spamCheck.remaining 
                });
                return;
            }
            
            // 3. Vérifier si la réponse est dans la fenêtre temporelle valide
            if (!antiSpamManager.isResponseInValidWindow(player.roomCode)) {
                console.log(`[LeDream] Réponse hors fenêtre temporelle de ${socket.id}`);
                socket.emit('error', { message: 'Réponse trop tardive' });
                return;
            }
            
            // 4. Vérifier si le joueur a déjà répondu à cette question
            if (room.gameState.ledreamAnswers && room.gameState.ledreamAnswers.has(socket.id)) {
                console.log(`[LeDream] Réponse déjà soumise par ${socket.id}`);
                return; // Silencieux pour éviter les attaques
            }
            
            // 5. Initialiser le système de suivi des réponses si nécessaire
            if (!room.gameState.ledreamAnswers) {
                room.gameState.ledreamAnswers = new Map();
            }
            
            // 6. Calculer la correction et les points
            isCorrect = sanitizedAnswer.toLowerCase() === correctAnswer.toLowerCase();
            
            if (isCorrect) {
                // Points selon le type de réponse
                switch (responseType) {
                    case 'text':
                        points = 1000; // Saisie complète
                        break;
                    case 'carre':
                        points = 500;  // QCM 4 choix
                        break;
                    case 'fifty':
                        points = 250;  // QCM 2 choix
                        break;
                    default:
                        points = 500;  // Défaut sécurisé
                }
                
                // Bonus de rapidité (moins de 5 secondes = bonus)
                if (sanitizedResponseTime < 5000) {
                    speedBonus = Math.max(50, Math.floor((5000 - sanitizedResponseTime) / 50));
                    points += speedBonus;
                }
                
                // Appliquer les points au joueur
                roomPlayer.score += points;
                
                console.log(`[LeDream] ${roomPlayer.name} a marqué ${points} points (${speedBonus} bonus)`);
                
                // Vérifier si le joueur a atteint 15000 points
                if (roomPlayer.score >= 15000) {
                    console.log(`[LeDream] ${roomPlayer.name} a atteint 15000 points - fin de partie`);
                    endGame(player.roomCode, 'ledream');
                    return;
                }
            }
            
            // 7. Enregistrer la réponse du joueur
            room.gameState.ledreamAnswers.set(socket.id, {
                answer: sanitizedAnswer,
                isCorrect: isCorrect,
                responseTime: sanitizedResponseTime,
                points: points,
                timestamp: Date.now()
            });
            
            console.log(`[LeDream] Réponse enregistrée: ${roomPlayer.name} -> "${sanitizedAnswer}" (${isCorrect ? 'CORRECT' : 'INCORRECT'})`);
            
            // 8. Démarrer le timer de question si ce n'est pas déjà fait
            startLeDreamQuestion(player.roomCode);
        } else if (mode === 'lefist') {
            // Mode LeFist: glisser-déposer par continent
            console.log(`[LeFist] Réponse reçue: ${answer} pour le drapeau ${room.gameState.currentFlag.code}`);
            
            const correctContinent = getCountryContinent(room.gameState.currentFlag.code);
            console.log(`[LeFist] Continent correct: ${correctContinent}`);
            
            isCorrect = answer === correctContinent;
            console.log(`[LeFist] Réponse correcte: ${isCorrect}`);
            
            if (isCorrect) {
                points = Math.round(200 * room.gameState.speed); // Points augmentent avec la vitesse
                roomPlayer.score += points;
                console.log(`[LeFist] Points ajoutés: ${points}, nouveau score: ${roomPlayer.score}`);
                
                // Augmenter progressivement la vitesse
                room.gameState.speed = Math.min(4, room.gameState.speed + 0.1);
                console.log(`[LeFist] Nouvelle vitesse: ${room.gameState.speed}`);
            }
            
            // Générer un nouveau drapeau après un délai (correct ou incorrect)
            setTimeout(() => {
                const currentRoom = rooms.get(player.roomCode);
                if (!currentRoom || !currentRoom.gameState.started) {
                    console.log(`[LeFist] Room non trouvée ou jeu arrêté`);
                    return;
                }
                
                const newFlag = generateRandomFlag();
                currentRoom.gameState.currentFlag = newFlag;
                console.log(`[LeFist] Nouveau drapeau généré: ${newFlag.code} - ${newFlag.name}`);
                
                io.to(player.roomCode).emit('new-flag', { 
                    flag: newFlag, 
                    speed: currentRoom.gameState.speed 
                });
                console.log(`[LeFist] Événement new-flag envoyé à la room ${player.roomCode}`);
            }, 1500); // Délai pour voir le feedback
        }
        
        // Informer le joueur du résultat
        socket.emit('answer-result', {
            isCorrect,
            points,
            speedBonus,
            newScore: roomPlayer.score,
            correctAnswer: correctAnswer
        });
    });
    
    // Quitter la room
    socket.on('leave-room', () => {
        handlePlayerLeave(socket.id);
    });
    
    // Déconnexion
    socket.on('disconnect', () => {
        console.log(`Joueur déconnecté: ${socket.id}`);
        handlePlayerLeave(socket.id);
    });
    
    function handlePlayerLeave(playerId) {
        const player = players.get(playerId);
        if (!player) return;
        
        const room = rooms.get(player.roomCode);
        if (!room) return;
        
        const roomCode = player.roomCode;
        
        // Retirer le joueur de la room
        room.players.delete(playerId);
        socket.leave(roomCode);
        
        // Si c'était l'hôte, transférer à un autre joueur ou supprimer la room
        if (room.hostId === playerId) {
            if (room.players.size > 0) {
                // Transférer l'hôte au premier joueur restant
                const newHost = Array.from(room.players.values())[0];
                newHost.isHost = true;
                room.hostId = newHost.id;
                
                io.to(roomCode).emit('host-changed', {
                    newHostName: newHost.name,
                    players: getRoomPlayersList(room)
                });
                
                console.log(`[Room] Hôte transféré de ${player.name} à ${newHost.name} dans room ${roomCode}`);
            } else {
                // Supprimer la room vide - nettoyage complet
                cleanupRoom(roomCode);
            }
        } else {
            // Informer les autres joueurs du départ
            socket.to(roomCode).emit('player-left', {
                playerName: player.name,
                players: getRoomPlayersList(room)
            });
        }
        
        players.delete(playerId);
        console.log(`[Player] ${player.name} a quitté la room: ${roomCode}`);
    }
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`🚀 Serveur Flag Party démarré sur le port ${PORT}`);
    console.log(`🌐 Accédez au jeu sur: http://localhost:${PORT}`);
});

// === NETTOYAGE AUTOMATIQUE AMÉLIORÉ ===

// Nettoyage des rooms abandonnées (toutes les 15 minutes)
setInterval(() => {
    console.log('[Cleanup] Démarrage du nettoyage automatique des rooms');
    cleanupAbandonedRooms();
}, 15 * 60 * 1000); // Toutes les 15 minutes

// Nettoyage complet moins fréquent (toutes les heures)
setInterval(() => {
    console.log('[Cleanup] Nettoyage complet - statistiques:');
    console.log(`[Cleanup] - Rooms actives: ${rooms.size}`);
    console.log(`[Cleanup] - Joueurs connectés: ${players.size}`);
    console.log(`[Cleanup] - Timers actifs: ${timerManager.timers.size}`);
    
    // Nettoyer les données anti-spam anciennes
    const now = Date.now();
    let cleanedSpamData = 0;
    for (const [playerId, attempts] of antiSpamManager.playerAttempts.entries()) {
        if (now - attempts.windowStart > 5 * 60 * 1000) { // Plus de 5 minutes
            antiSpamManager.playerAttempts.delete(playerId);
            cleanedSpamData++;
        }
    }
    
    if (cleanedSpamData > 0) {
        console.log(`[Cleanup] ${cleanedSpamData} entrées anti-spam nettoyées`);
    }
    
    cleanupAbandonedRooms();
}, 60 * 60 * 1000); // Toutes les heures