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
    'at': 'Europe', 'pt': 'Portugal', 'gr': 'Europe', 'tr': 'Europe',
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
    return countryToContinent[countryCode] || 'Autre';
}

// === SYSTÈME DE GESTION DES QUESTIONS LEFAST ===

// Gérer la fin d'une question LeFast avec classement
function handleLeFastQuestionEnd(roomCode) {
    const room = rooms.get(roomCode);
    if (!room || !room.gameState.started || room.gameState.gameMode !== 'lefast') {
        return;
    }

    const correctAnswer = room.gameState.currentFlag.name;
    const questionAnswers = room.gameState.lefastAnswers || new Map();
    
    // Calculer le classement basé sur les timestamps
    const correctAnswers = [];
    
    for (const [playerId, playerAnswers] of questionAnswers.entries()) {
        const correctAttempt = playerAnswers.find(attempt => 
            attempt.answer.toLowerCase().trim() === correctAnswer.toLowerCase()
        );
        
        if (correctAttempt) {
            correctAnswers.push({
                playerId: playerId,
                playerName: room.players.get(playerId)?.name || 'Inconnu',
                timestamp: correctAttempt.timestamp,
                responseTime: correctAttempt.responseTime
            });
        }
    }
    
    // Trier par timestamp (premier = plus petit timestamp)
    correctAnswers.sort((a, b) => a.timestamp - b.timestamp);
    
    // Attribution des points selon le classement
    const pointsScale = [1000, 700, 500, 300, 200]; // puis 100 pour tous les autres
    const questionResults = [];
    
    correctAnswers.forEach((answer, index) => {
        const points = index < pointsScale.length ? pointsScale[index] : 100;
        const player = room.players.get(answer.playerId);
        
        if (player) {
            player.score += points;
            questionResults.push({
                playerId: answer.playerId,
                playerName: answer.playerName,
                rank: index + 1,
                points: points,
                newScore: player.score,
                responseTime: answer.responseTime
            });
            
            // Vérifier si le joueur a atteint 15000 points
            if (player.score >= 15000) {
                console.log(`[LeFast] ${player.name} a atteint 15000 points - fin de partie`);
                endGame(roomCode, 'lefast');
                return;
            }
        }
    });
    
    // Envoyer le récapitulatif à tous les joueurs
    io.to(roomCode).emit('lefast-question-results', {
        correctAnswer: correctAnswer,
        results: questionResults,
        totalAnswers: questionAnswers.size
    });
    
    console.log(`[LeFast] Question terminée dans room ${roomCode}: ${correctAnswers.length} bonnes réponses`);
    
    // Nettoyer les données de la question
    room.gameState.lefastAnswers = new Map();
    
    // Programmer la prochaine question après 4 secondes
    setTimeout(() => {
        generateNextLeFastQuestion(roomCode);
    }, 4000);
}

// Générer la prochaine question LeFast
function generateNextLeFastQuestion(roomCode) {
    const room = rooms.get(roomCode);
    if (!room || !room.gameState.started || room.gameState.gameMode !== 'lefast') {
        return;
    }
    
    const newFlag = generateRandomFlag();
    room.gameState.currentFlag = newFlag;
    room.gameState.lefastAnswers = new Map();
    room.gameState.questionStartTime = Date.now();
    
    // Marquer le début de la nouvelle question (très permissif)
    antiSpamManager.markQuestionStart(roomCode);
    
    // Envoyer la nouvelle question
    io.to(roomCode).emit('new-flag', { flag: newFlag });
    
    console.log(`[LeFast] Nouvelle question: ${newFlag.code} - ${newFlag.name}`);
    
    // Démarrer le timer de 15 secondes pour clôturer automatiquement
    setTimeout(() => {
        handleLeFastQuestionEnd(roomCode);
    }, 15000); // 15 secondes par question
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
    
    if (typeof responseTime !== 'number' || responseTime < 0 || responseTime > 20000) {
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

// Système anti-spam simplifié (très permissif pour jeu entre amis)
class AntiSpamManager {
    constructor() {
        this.questionTimestamps = new Map(); // roomCode -> timestamp
    }
    
    // Marquer le début d'une nouvelle question
    markQuestionStart(roomCode) {
        this.questionTimestamps.set(roomCode, Date.now());
        console.log(`[AntiSpam] Nouvelle question marquée pour room ${roomCode}`);
    }
    
    // Vérifier si une réponse est dans la fenêtre temporelle valide (très permissif)
    isResponseInValidWindow(roomCode, maxAge = 25000) { // 25s de marge généreuse
        const questionStart = this.questionTimestamps.get(roomCode);
        if (!questionStart) return true; // Si pas de timestamp, on accepte
        
        const age = Date.now() - questionStart;
        return age <= maxAge;
    }
    
    // Version simplifiée - juste vérifier le spam évident
    checkAndRecordAttempt(playerId, roomCode) {
        // Pour un jeu entre amis, on est très permissif
        // On bloque seulement le spam vraiment excessif (plus de 100 tentatives en 10 secondes)
        return { allowed: true, remaining: 999 }; // Toujours autorisé
    }
    
    // Nettoyer les données d'une question terminée
    cleanupQuestion(roomCode) {
        this.questionTimestamps.delete(roomCode);
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
            speed: 1, // Pour LeFist (legacy)
            lefastAnswers: new Map(), // Pour LeFast
            questionStartTime: null,
            lefistStats: new Map() // Nouveau: stats LeFist (bonnes/mauvaises réponses par joueur)
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
    
    // Ne pas démarrer de timer pour LeDream et LeFast (nouvelles règles)
    if (room.gameState.gameMode === 'ledream' || room.gameState.gameMode === 'lefast') {
        console.log(`[Timer] Pas de timer global pour room ${roomCode} (mode ${room.gameState.gameMode})`);
        return;
    }
    
    // Pour LeFist : timer global
    room.gameState.timer = setInterval(() => {
        room.gameState.timeLeft--;
        
        // Envoyer le timer à tous les joueurs (seulement LeFist maintenant)
        io.to(roomCode).emit('timer-update', room.gameState.timeLeft);
        
        if (room.gameState.timeLeft <= 0) {
            clearInterval(room.gameState.timer);
            
            // Pour LeFist : marquer tous les joueurs non finis comme terminés
            if (room.gameState.gameMode === 'lefist') {
                room.gameState.lefistStats.forEach((stats, playerId) => {
                    if (!stats.isFinished) {
                        stats.isFinished = true;
                        // Informer le joueur que le temps est écoulé
                        const playerSocket = [...players.entries()].find(([socketId, player]) => 
                            socketId === playerId && player.roomCode === roomCode
                        );
                        if (playerSocket) {
                            io.to(playerId).emit('lefist-player-finished', {
                                reason: 'timeout',
                                correctAnswers: stats.correct,
                                incorrectAnswers: stats.incorrect,
                                finalScore: room.players.get(playerId)?.score || 0
                            });
                        }
                    }
                });
            }
            
            endGame(roomCode);
        }
    }, 1000);
    
    console.log(`[Timer] Timer global démarré pour room ${roomCode} (${room.gameState.gameDuration}s) - mode ${room.gameState.gameMode}`);
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
    
    // Nettoyer les timers spécifiques selon le mode
    if (mode === 'ledream') {
        timerManager.clearAllTimers(roomCode);
        antiSpamManager.cleanupQuestion(roomCode);
        // Nettoyer les données LeDream
        if (room.gameState.ledreamAnswers) {
            room.gameState.ledreamAnswers.clear();
        }
        console.log(`[LeDream] Jeu LeDream terminé dans room ${roomCode}`);
    } else if (mode === 'lefast') {
        // Nettoyer les données LeFast
        if (room.gameState.lefastAnswers) {
            room.gameState.lefastAnswers.clear();
        }
        antiSpamManager.cleanupQuestion(roomCode);
        console.log(`[LeFast] Jeu LeFast terminé dans room ${roomCode}`);
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

    // Changer la durée du jeu (seulement l'hôte, pas pour LeDream et plus pour LeFast)
    socket.on('set-game-duration', (data) => {
        const player = players.get(socket.id);
        if (!player) return;
        
        const room = rooms.get(player.roomCode);
        if (!room || room.hostId !== socket.id) return;
        
        // Ignorer la durée pour le mode LeDream et LeFast (nouvelles règles)
        if (room.gameState.gameMode === 'ledream' || room.gameState.gameMode === 'lefast') {
            console.log(`[Game] Durée ignorée pour room ${player.roomCode} (mode ${room.gameState.gameMode})`);
            return;
        }
        
        room.gameState.gameDuration = data.duration;
        room.gameState.timeLeft = data.duration;
        
        io.to(player.roomCode).emit('game-duration-changed', data.duration);
        console.log(`[Game] Durée changée à ${data.duration}s pour room ${player.roomCode} (mode LeFist)`);
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
        if (room.gameState.gameMode === 'lefast') {
            // Pour LeFast : initialiser le système de réponses multiples
            room.gameState.lefastAnswers = new Map();
            room.gameState.questionStartTime = Date.now();
            antiSpamManager.markQuestionStart(player.roomCode);
            
            // Démarrer le timer de 15 secondes pour clôturer automatiquement
            setTimeout(() => {
                handleLeFastQuestionEnd(player.roomCode);
            }, 15000);
            
            console.log(`[LeFast] Jeu LeFast démarré pour room ${player.roomCode} - 15s par question`);
        } else if (room.gameState.gameMode === 'ledream') {
            // Pour LeDream : pas de timer global, jeu en continu
            antiSpamManager.markQuestionStart(player.roomCode);
            console.log(`[LeDream] Jeu LeDream démarré pour room ${player.roomCode} - pas de timer global`);
        } else {
            // Pour LeFist : utiliser le timer global avec les nouvelles règles
            startGameTimer(player.roomCode);
            
            // Initialiser les stats LeFist pour chaque joueur
            room.gameState.lefistStats = new Map();
            room.players.forEach((player, playerId) => {
                room.gameState.lefistStats.set(playerId, {
                    correct: 0,
                    incorrect: 0,
                    isFinished: false
                });
            });
            
            console.log(`[LeFist] Jeu LeFist démarré pour room ${player.roomCode} (${room.gameState.gameDuration}s)`);
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
        
        const { answer, mode, responseTime, responseType } = data;
        const correctAnswer = room.gameState.currentFlag.name;
        let isCorrect = false;
        let points = 0;
        let speedBonus = 0;
        
        // Logique selon le mode de jeu
        if (mode === 'lefast') {
            // === MODE LEFAST NOUVELLES RÈGLES (VERSION SIMPLIFIÉE) ===
            
            // Validation basique du payload
            if (!answer || typeof answer !== 'string' || answer.trim().length === 0) {
                console.log(`[LeFast] Réponse vide de ${socket.id}`);
                return;
            }
            
            const sanitizedAnswer = answer.trim().substring(0, 100);
            const sanitizedResponseTime = responseTime || 0;
            
            // Vérification anti-spam très permissive
            if (!antiSpamManager.isResponseInValidWindow(player.roomCode)) {
                console.log(`[LeFast] Réponse tardive de ${socket.id} - mais on accepte quand même`);
                // On accepte quand même pour éviter les frustrations
            }
            
            // Initialiser le système de réponses si nécessaire
            if (!room.gameState.lefastAnswers) {
                room.gameState.lefastAnswers = new Map();
            }
            
            // Vérifier si le joueur a déjà des réponses pour cette question
            let playerAnswers = room.gameState.lefastAnswers.get(socket.id) || [];
            
            // Vérifier le nombre de tentatives (max 3)
            if (playerAnswers.length >= 3) {
                console.log(`[LeFast] Joueur ${socket.id} a déjà utilisé ses 3 tentatives`);
                socket.emit('max-attempts-reached', { message: 'Vous avez utilisé vos 3 tentatives pour cette question' });
                return;
            }
            
            // Vérifier si le joueur a déjà une réponse correcte (ne compte plus)
            const hasCorrectAnswer = playerAnswers.some(attempt => 
                attempt.answer.toLowerCase().trim() === correctAnswer.toLowerCase()
            );
            
            if (hasCorrectAnswer) {
                console.log(`[LeFast] Joueur ${socket.id} a déjà une réponse correcte pour cette question`);
                socket.emit('already-correct', { message: 'Vous avez déjà trouvé la bonne réponse !' });
                return;
            }
            
            // Calculer si la réponse est correcte
            isCorrect = sanitizedAnswer.toLowerCase().trim() === correctAnswer.toLowerCase();
            
            // Enregistrer la tentative
            const attempt = {
                answer: sanitizedAnswer,
                timestamp: Date.now(),
                responseTime: sanitizedResponseTime,
                isCorrect: isCorrect
            };
            
            playerAnswers.push(attempt);
            room.gameState.lefastAnswers.set(socket.id, playerAnswers);
            
            console.log(`[LeFast] Tentative ${playerAnswers.length}/3 de ${roomPlayer.name}: "${sanitizedAnswer}" (${isCorrect ? 'CORRECT' : 'INCORRECT'})`);
            
            // Informer le joueur du résultat de sa tentative
            socket.emit('lefast-attempt-result', {
                attemptNumber: playerAnswers.length,
                maxAttempts: 3,
                isCorrect: isCorrect,
                answer: sanitizedAnswer,
                remainingAttempts: 3 - playerAnswers.length
            });
            
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
            
            // Informer le joueur du résultat
            socket.emit('answer-result', {
                isCorrect,
                points,
                speedBonus,
                newScore: roomPlayer.score,
                correctAnswer: correctAnswer
            });
            
        } else if (mode === 'lefist') {
            // === MODE LEFIST NOUVEAU CONCEPT AVEC PROTECTION ANTI-SPAM ===
            console.log(`[LeFist] Réponse reçue: ${answer} pour le drapeau ${room.gameState.currentFlag.code}`);
            
            // Vérification anti-spam spécifique à LeFist
            const now = Date.now();
            const playerId = socket.id;
            
            // Vérifier si le joueur a déjà une réponse en cours de traitement
            if (!room.gameState.lefistLastResponse) {
                room.gameState.lefistLastResponse = new Map();
            }
            
            const lastResponse = room.gameState.lefistLastResponse.get(playerId);
            if (lastResponse && (now - lastResponse) < 1000) { // 1 seconde minimum entre les réponses
                console.log(`[LeFist] Spam détecté pour ${socket.id} - réponse ignorée`);
                return;
            }
            
            room.gameState.lefistLastResponse.set(playerId, now);
            
            const correctContinent = getCountryContinent(room.gameState.currentFlag.code);
            console.log(`[LeFist] Continent correct: ${correctContinent}`);
            
            isCorrect = answer === correctContinent;
            console.log(`[LeFist] Réponse correcte: ${isCorrect}`);
            
            // Initialiser les stats du joueur si nécessaire
            if (!room.gameState.lefistStats) {
                room.gameState.lefistStats = new Map();
            }
            
            let playerStats = room.gameState.lefistStats.get(socket.id) || {
                correct: 0,
                incorrect: 0,
                isFinished: false
            };
            
            // Vérifier si le joueur n'est pas déjà terminé
            if (playerStats.isFinished) {
                console.log(`[LeFist] Joueur ${socket.id} déjà terminé - réponse ignorée`);
                return;
            }
            
            if (isCorrect) {
                points = 100; // Points fixes par bonne réponse
                roomPlayer.score += points;
                playerStats.correct++;
                console.log(`[LeFist] ${roomPlayer.name}: bonne réponse ! Total: ${playerStats.correct} bonnes, ${playerStats.incorrect} mauvaises`);
            } else {
                playerStats.incorrect++;
                console.log(`[LeFist] ${roomPlayer.name}: mauvaise réponse ! Total: ${playerStats.correct} bonnes, ${playerStats.incorrect} mauvaises`);
                
                // Vérifier si le joueur a fait 5 erreurs
                if (playerStats.incorrect >= 5) {
                    playerStats.isFinished = true;
                    console.log(`[LeFist] ${roomPlayer.name} a fait 5 erreurs - partie terminée pour ce joueur`);
                    
                    // Informer le joueur qu'il a terminé
                    socket.emit('lefist-player-finished', {
                        reason: 'errors',
                        correctAnswers: playerStats.correct,
                        incorrectAnswers: playerStats.incorrect,
                        finalScore: roomPlayer.score
                    });
                }
            }
            
            // Sauvegarder les stats
            room.gameState.lefistStats.set(socket.id, playerStats);
            
            // Informer le joueur du résultat
            socket.emit('answer-result', {
                isCorrect,
                points,
                newScore: roomPlayer.score,
                correctAnswer: room.gameState.currentFlag.name,
                correctContinent: correctContinent,
                playerStats: {
                    correct: playerStats.correct,
                    incorrect: playerStats.incorrect,
                    isFinished: playerStats.isFinished
                }
            });
            
            // Si le joueur n'a pas terminé, générer un nouveau drapeau après un délai
            if (!playerStats.isFinished) {
                setTimeout(() => {
                    const currentRoom = rooms.get(player.roomCode);
                    if (!currentRoom || !currentRoom.gameState.started) {
                        console.log(`[LeFist] Room non trouvée ou jeu arrêté`);
                        return;
                    }
                    
                    const newFlag = generateRandomFlag();
                    console.log(`[LeFist] Nouveau drapeau pour ${roomPlayer.name}: ${newFlag.code} - ${newFlag.name}`);
                    
                    // Envoyer le nouveau drapeau seulement à ce joueur
                    socket.emit('new-flag', { flag: newFlag });
                    
                }, 1200); // 1.2 secondes pour voir le feedback et éviter le spam
            }
        }
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