// Connexion Socket.io
const socket = io();

// === ÉTAT GLOBAL CLIENT ===
let currentRoom = null;
let currentPlayer = null;
let isHost = false;
let betweenQuestionsTimer = null;
let currentGameMode = 'lefast';
let questionStartTime = null;
let selectedLedreamMode = null;

// Nouvel état pour LeFast
let lefastAttempts = 0;
let maxLefastAttempts = 3;
let hasCorrectAnswer = false;
let lefastAttemptsHistory = []; // Nouvel historique des tentatives
let lefastQuestionTimer = null; // Timer pour affichage
let lefastTimeLeft = 15; // Temps restant pour la question

let gameState = {
  score: 0,
  currentFlag: null,
  gameStarted: false,
  timeLeft: 30,
  gameDuration: 30,
  betweenQuestions: false,
  speed: 1
};

// État pour LeRythm (configuration consolidée)
let lerythmGameState = {
  isPlaying: false,
  gameOver: false,
  score: 0,
  combo: 0,
  multiplier: 1,
  stats: { perfect: 0, good: 0, ok: 0, miss: 0 },
  fallingFlags: [],
  spawnTimer: null,
  gameTimer: null,
  startTime: null,
  activeLanes: [] // Lanes dynamiques
};

// Configuration LeRythm consolidée
const lerythmConfig = {
  fallSpeed: 3500,
  spawnRate: 1800,
  perfectWindow: 20,
  goodWindow: 40,
  okWindow: 60,
  scoring: {
    perfect: 300,
    good: 200,
    ok: 100
  }
};

// Base de données des pays étendue pour LeRythm
const lerythmCountries = {
  'A': [
    { name: 'Allemagne', code: 'de' },
    { name: 'Australie', code: 'au' },
    { name: 'Autriche', code: 'at' },
    { name: 'Afrique du Sud', code: 'za' },
    { name: 'Argentine', code: 'ar' },
    { name: 'Algérie', code: 'dz' }
  ],
  'B': [
    { name: 'Belgique', code: 'be' },
    { name: 'Brésil', code: 'br' },
    { name: 'Bangladesh', code: 'bd' },
    { name: 'Bulgarie', code: 'bg' }
  ],
  'C': [
    { name: 'Canada', code: 'ca' },
    { name: 'Chine', code: 'cn' },
    { name: 'Chili', code: 'cl' },
    { name: 'Colombie', code: 'co' },
    { name: 'Croatie', code: 'hr' }
  ],
  'E': [
    { name: 'Espagne', code: 'es' },
    { name: 'États-Unis', code: 'us' },
    { name: 'Égypte', code: 'eg' },
    { name: 'Estonie', code: 'ee' }
  ],
  'F': [
    { name: 'France', code: 'fr' },
    { name: 'Finlande', code: 'fi' },
    { name: 'Philippines', code: 'ph' }
  ],
  'G': [
    { name: 'Grèce', code: 'gr' },
    { name: 'Ghana', code: 'gh' },
    { name: 'Guatemala', code: 'gt' },
    { name: 'Géorgie', code: 'ge' }
  ],
  'I': [
    { name: 'Italie', code: 'it' },
    { name: 'Inde', code: 'in' },
    { name: 'Irlande', code: 'ie' },
    { name: 'Islande', code: 'is' },
    { name: 'Israël', code: 'il' }
  ],
  'M': [
    { name: 'Mexique', code: 'mx' },
    { name: 'Maroc', code: 'ma' },
    { name: 'Malaisie', code: 'my' },
    { name: 'Madagascar', code: 'mg' }
  ]
};

// === UTILITAIRES UI ===
function updateConnectionStatus(connected) {
  const status = document.getElementById('connectionStatus');
  if (connected) {
    status.textContent = '🟢 Connecté';
    status.className = 'connection-status connected';
  } else {
    status.textContent = '🔴 Déconnecté';
    status.className = 'connection-status disconnected';
  }
}

function showNotification(message, isError = false) {
  const notification = document.getElementById('notification');
  notification.textContent = message;
  notification.className = 'notification show';
  if (isError) notification.classList.add('error');
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.classList.remove('error'), 300);
  }, 3000);
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
}

function updatePlayersList(players) {
  const playersList = document.getElementById('playersList');
  playersList.innerHTML = players.map(p => `
    <div class="player">
      <span>${p.name} ${p.isHost ? '👑' : ''}</span>
      <span>${p.score} pts</span>
    </div>
  `).join('');
}

// === LOGIQUE D'ÉCRAN ===
function goHome() {
  if (currentRoom) socket.emit('leave-room');
  if (betweenQuestionsTimer) {
    clearInterval(betweenQuestionsTimer);
    betweenQuestionsTimer = null;
  }
  if (lefastQuestionTimer) {
    clearInterval(lefastQuestionTimer);
    lefastQuestionTimer = null;
  }
  currentRoom = null;
  currentPlayer = null;
  isHost = false;
  currentGameMode = 'lefast';
  lefastAttempts = 0;
  hasCorrectAnswer = false;
  lefastAttemptsHistory = []; // Réinitialiser l'historique
  lefastTimeLeft = 15;
  gameState = {
    score: 0, currentFlag: null, gameStarted: false,
    timeLeft: 30, gameDuration: 30, betweenQuestions: false, speed: 1
  };
  showScreen('homeScreen');
}

function showJoinRoom() {
  showScreen('joinScreen');
}

// === GESTION MODES & DURÉE (UI salle d'attente) ===
function updateGameModeUI(mode) {
  const durationOptions = document.querySelector('.duration-options');
  const ledreamInfo = document.getElementById('ledreamInfo');
  const lefastInfo = document.getElementById('lefastInfo');
  const lefistInfo = document.getElementById('lefistInfo');
  
  if (mode === 'ledream') {
    durationOptions.style.display = 'none';
    ledreamInfo.style.display = 'block';
    if (lefastInfo) lefastInfo.style.display = 'none';
    if (lefistInfo) lefistInfo.style.display = 'none';
  } else if (mode === 'lefast') {
    durationOptions.style.display = 'none';
    ledreamInfo.style.display = 'none';
    if (lefastInfo) lefastInfo.style.display = 'block';
    if (lefistInfo) lefistInfo.style.display = 'none';
  } else if (mode === 'lefist') {
    durationOptions.style.display = 'flex';
    ledreamInfo.style.display = 'none';
    if (lefastInfo) lefastInfo.style.display = 'none';
    if (lefistInfo) lefistInfo.style.display = 'block';
  } else if (mode === 'lerythm') {
    durationOptions.style.display = 'flex';
    ledreamInfo.style.display = 'none';
    if (lefastInfo) lefastInfo.style.display = 'none';
    if (lefistInfo) lefistInfo.style.display = 'none';
  } else {
    durationOptions.style.display = 'flex';
    ledreamInfo.style.display = 'none';
    if (lefastInfo) lefastInfo.style.display = 'none';
    if (lefistInfo) lefistInfo.style.display = 'none';
  }
}

function selectGameMode(mode) {
  if (!isHost) return;
  currentGameMode = mode;

  document.querySelectorAll('.game-mode-card').forEach(card => card.classList.remove('selected'));
  const selected = document.querySelector(`[data-mode="${mode}"]`);
  if (selected) selected.classList.add('selected');

  updateGameModeUI(mode);
  socket.emit('set-game-mode', { mode });
}

function setGameDuration(duration, el) {
  if (!isHost || currentGameMode === 'ledream' || currentGameMode === 'lefast') return;
  gameState.gameDuration = duration;
  socket.emit('set-game-duration', { duration });

  document.querySelectorAll('.duration-btn').forEach(btn => btn.classList.remove('active'));
  if (el) el.classList.add('active');
}

// === CRÉATION / REJOINDRE / DÉMARRER ===
function createRoom() {
  const playerName = document.getElementById('playerName').value.trim();
  if (!playerName) return showNotification('Veuillez entrer votre nom', true);

  currentPlayer = playerName;
  socket.emit('create-room', { playerName, gameDuration: gameState.gameDuration });
}

function joinRoom() {
  const playerName = document.getElementById('playerName').value.trim();
  const roomCode = document.getElementById('roomCode').value.trim().toUpperCase();
  if (!playerName || !roomCode) return showNotification('Veuillez remplir tous les champs', true);

  currentPlayer = playerName;
  socket.emit('join-room', { roomCode, playerName });
}

function startGame() {
  if (!isHost) return;
  socket.emit('start-game');
}

function leaveRoom() {
  socket.emit('leave-room');
  goHome();
}

// === MISE À JOUR SCORE ===
function updateScore(score, mode) {
  gameState.score = score;
  if (mode === 'lefast') document.getElementById('lefastScore').textContent = score;
  else if (mode === 'ledream') document.getElementById('ledreamScore').textContent = score;
  else if (mode === 'lefist') document.getElementById('lefistScore').textContent = score;
  else if (mode === 'lerythm') {
    // LeRythm gère son propre score via updateLerythmUI()
    lerythmGameState.score = score;
    updateLerythmUI();
  }
}

// === AFFICHAGE NOUVEAU DRAPEAU ===
function displayNewFlag(flag) {
  gameState.currentFlag = flag;
  questionStartTime = Date.now();

  if (currentGameMode === 'lefast') {
    // Réinitialiser l'état pour la nouvelle question
    lefastAttempts = 0;
    maxLefastAttempts = 3;
    hasCorrectAnswer = false;
    lefastAttemptsHistory = []; // Réinitialiser l'historique
    lefastTimeLeft = 15; // Réinitialiser le timer
    
    document.getElementById('lefastFlagImage').src = `https://flagpedia.net/data/flags/w580/${flag.code}.png`;
    document.getElementById('lefastBetweenQuestions').style.display = 'none';
    document.getElementById('lefastGameContent').style.display = 'block';
    document.getElementById('lefastTextInput').value = '';
    document.getElementById('lefastTextInput').disabled = false;
    document.getElementById('lefastTextInput').focus();
    
    // Mettre à jour l'affichage des tentatives
    updateLefastAttemptsDisplay();
    
    // Démarrer le timer visuel de 15 secondes
    startLefastQuestionTimer();
    
  } else if (currentGameMode === 'ledream') {
    document.getElementById('ledreamFlagImage').src = `https://flagpedia.net/data/flags/w580/${flag.code}.png`;
    resetLedreamQuestion();
    startLedreamTimer();
  } else if (currentGameMode === 'lefist') {
    showLefistFlag(flag);
  } else if (currentGameMode === 'lerythm') {
    // LeRythm ne gère pas les drapeaux individuels, il les génère automatiquement
    // Pas d'action nécessaire ici
  }
}

// === LEFAST NOUVELLES RÈGLES ===
function updateLefastAttemptsDisplay() {
  const attemptsDisplay = document.getElementById('lefastAttemptsDisplay');
  const historyDisplay = document.getElementById('lefastAttemptsHistory');
  
  if (attemptsDisplay) {
    if (hasCorrectAnswer) {
      // Si bonne réponse trouvée, afficher "Bonne réponse" en vert
      attemptsDisplay.textContent = '✅ Bonne réponse !';
      attemptsDisplay.classList.remove('no-attempts');
      attemptsDisplay.classList.add('correct-answer');
    } else {
      // Sinon afficher les tentatives restantes
      const remaining = maxLefastAttempts - lefastAttempts;
      attemptsDisplay.textContent = `Tentatives restantes: ${remaining}/${maxLefastAttempts}`;
      attemptsDisplay.classList.remove('correct-answer');
      
      if (remaining === 0) {
        attemptsDisplay.classList.add('no-attempts');
      } else {
        attemptsDisplay.classList.remove('no-attempts');
      }
    }
  }
  
  // Afficher l'historique des tentatives
  if (historyDisplay && lefastAttemptsHistory.length > 0) {
    let historyHTML = '<div class="attempts-history-title">Vos tentatives:</div>';
    historyHTML += '<div class="attempts-list">';
    
    lefastAttemptsHistory.forEach((attempt, index) => {
      const statusIcon = attempt.isCorrect ? '✅' : '❌';
      const statusClass = attempt.isCorrect ? 'correct-attempt' : 'incorrect-attempt';
      
      historyHTML += `
        <div class="attempt-item ${statusClass}">
          <span class="attempt-number">${index + 1}.</span>
          <span class="attempt-answer">"${attempt.answer}"</span>
          <span class="attempt-status">${statusIcon}</span>
        </div>
      `;
    });
    
    historyHTML += '</div>';
    historyDisplay.innerHTML = historyHTML;
    historyDisplay.style.display = 'block';
  } else if (historyDisplay) {
    historyDisplay.style.display = 'none';
  }
}

function submitLefastAnswer() {
  const userAnswer = document.getElementById('lefastTextInput').value.trim();
  if (!userAnswer || gameState.betweenQuestions || hasCorrectAnswer) return;
  
  // Vérifier si on a encore des tentatives
  if (lefastAttempts >= maxLefastAttempts) {
    showNotification('Vous avez utilisé toutes vos tentatives pour cette question', true);
    return;
  }

  const responseTime = Date.now() - questionStartTime;
  socket.emit('submit-answer', { 
    answer: userAnswer, 
    mode: 'lefast',
    responseTime: responseTime
  });
  
  document.getElementById('lefastTextInput').value = '';
}

function showLefastBetweenQuestions(results, correctAnswer) {
  // Arrêter le timer de question
  stopLefastQuestionTimer();
  
  gameState.betweenQuestions = true;
  document.getElementById('lefastBetweenQuestions').style.display = 'block';
  document.getElementById('lefastGameContent').style.display = 'none';
  
  // Afficher le classement
  let resultHTML = `<div class="lefast-results-header">
    <h3>📊 Résultats de la question</h3>
    <p>Réponse: <strong>${correctAnswer}</strong></p>
  </div>`;
  
  if (results.length > 0) {
    resultHTML += '<div class="lefast-ranking">';
    results.forEach((result, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🏆';
      const isCurrentPlayer = result.playerName === currentPlayer;
      const playerClass = isCurrentPlayer ? 'current-player' : '';
      
      resultHTML += `
        <div class="ranking-item ${playerClass}">
          <span class="rank">${medal} ${result.rank}e</span>
          <span class="player-name">${result.playerName} ${isCurrentPlayer ? '(Vous)' : ''}</span>
          <span class="points">+${result.points} pts</span>
          <span class="total-score">${result.newScore} pts total</span>
        </div>
      `;
    });
    resultHTML += '</div>';
  } else {
    resultHTML += '<p class="no-correct-answers">Aucune bonne réponse cette fois !</p>';
  }
  
  document.getElementById('lefastResultsDisplay').innerHTML = resultHTML;

  let countdown = 4;
  document.getElementById('lefastQuestionCountdown').textContent = countdown;

  if (betweenQuestionsTimer) clearInterval(betweenQuestionsTimer);
  betweenQuestionsTimer = setInterval(() => {
    countdown--;
    document.getElementById('lefastQuestionCountdown').textContent = countdown;
    if (countdown <= 0) {
      clearInterval(betweenQuestionsTimer);
      betweenQuestionsTimer = null;
      gameState.betweenQuestions = false;
    }
  }, 1000);
}

// Timer pour LeFast
function startLefastQuestionTimer() {
  if (lefastQuestionTimer) {
    clearInterval(lefastQuestionTimer);
  }
  
  lefastTimeLeft = 15;
  updateLefastTimerDisplay();
  
  lefastQuestionTimer = setInterval(() => {
    lefastTimeLeft--;
    updateLefastTimerDisplay();
    
    if (lefastTimeLeft <= 0) {
      clearInterval(lefastQuestionTimer);
      lefastQuestionTimer = null;
    }
  }, 1000);
}

function updateLefastTimerDisplay() {
  const timerElement = document.getElementById('lefastQuestionTimer');
  if (timerElement) {
    timerElement.textContent = lefastTimeLeft;
    
    // Changer la couleur selon le temps restant
    if (lefastTimeLeft <= 5) {
      timerElement.className = 'question-timer danger';
    } else if (lefastTimeLeft <= 10) {
      timerElement.className = 'question-timer warning';
    } else {
      timerElement.className = 'question-timer normal';
    }
  }
}

function stopLefastQuestionTimer() {
  if (lefastQuestionTimer) {
    clearInterval(lefastQuestionTimer);
    lefastQuestionTimer = null;
  }
}

// === LEDREAM (INCHANGÉ) ===
let ledreamQuestionTimer = null;
let ledreamTimeLeft = 10;

function activateLedreamMode(mode) {
  if (currentGameMode !== 'ledream' || !gameState.gameStarted) return;
  document.getElementById('ledreamCarreBtn').disabled = true;
  document.getElementById('ledreamFiftyBtn').disabled = true;
  document.getElementById('ledreamAnswerInterface').style.display = 'none';
  generateLedreamOptions(gameState.currentFlag.name, mode);
  selectedLedreamMode = mode;
}

function resetLedreamQuestion() {
  if (ledreamQuestionTimer) {
    clearInterval(ledreamQuestionTimer);
    ledreamQuestionTimer = null;
  }
  selectedLedreamMode = null;
  ledreamTimeLeft = 10;
  document.getElementById('ledreamCarreBtn').disabled = false;
  document.getElementById('ledreamFiftyBtn').disabled = false;
  document.getElementById('ledreamAnswerInterface').style.display = 'block';
  document.getElementById('ledreamAnswerOptions').style.display = 'none';

  const textInput = document.getElementById('ledreamTextInput');
  textInput.value = '';
  textInput.disabled = false;
  textInput.focus();

  const fb = document.getElementById('ledreamFeedback');
  fb.classList.remove('show');

  document.getElementById('ledreamDashboard').style.display = 'none';

  const timerProgress = document.getElementById('ledreamTimerProgress');
  if (timerProgress) {
    timerProgress.style.width = '100%';
    timerProgress.style.background = '#4CAF50';
  }
}

function disableLedreamInput() {
  const textInput = document.getElementById('ledreamTextInput');
  textInput.disabled = true;
  document.getElementById('ledreamCarreBtn').disabled = true;
  document.getElementById('ledreamFiftyBtn').disabled = true;
}

function showLedreamQuestionResults(correctAnswer, playerResults) {
  if (ledreamQuestionTimer) {
    clearInterval(ledreamQuestionTimer);
    ledreamQuestionTimer = null;
  }
  const dashboard = document.getElementById('ledreamDashboard');
  const playersContainer = document.getElementById('dashboardPlayers');
  playersContainer.innerHTML = '';

  playerResults.forEach(player => {
    const playerDiv = document.createElement('div');
    playerDiv.className = 'dashboard-player';
    const emoji = player.isCorrect ? '✅' : '❌';
    const pointsText = player.points > 0 ? `+${player.points}` : '0';
    playerDiv.innerHTML = `
      <div class="dashboard-player-name">${player.playerName}</div>
      <div class="dashboard-player-score">${player.newScore} pts</div>
      <div class="dashboard-player-result">${emoji}</div>
      ${player.points > 0 ? `<div style="color:#4CAF50;font-size:.9em;">${pointsText} pts</div>` : ''}
    `;
    playersContainer.appendChild(playerDiv);
  });

  dashboard.style.display = 'block';
  showLedreamFeedback(`⏰ Temps écoulé!<br>La réponse était: <strong>${correctAnswer}</strong>`, false, null, 0, 0);
  setTimeout(() => { dashboard.style.display = 'none'; }, 3000);
}

function startLedreamTimer() {
  if (ledreamQuestionTimer) clearInterval(ledreamQuestionTimer);
  ledreamTimeLeft = 10;
  updateLedreamTimerDisplay();
  ledreamQuestionTimer = setInterval(() => {
    ledreamTimeLeft--;
    updateLedreamTimerDisplay();
    if (ledreamTimeLeft <= 0) {
      clearInterval(ledreamQuestionTimer);
      // Timeout géré côté serveur (timer sécurisé)
    }
  }, 1000);
}

function updateLedreamTimerDisplay() {
  const timerText = document.getElementById('ledreamTimer');
  const timerProgress = document.getElementById('ledreamTimerProgress');

  timerText.textContent = ledreamTimeLeft;
  const percentage = (ledreamTimeLeft / 10) * 100;
  timerProgress.style.width = percentage + '%';
  if (ledreamTimeLeft <= 3) timerProgress.style.background = '#FF5722';
  else if (ledreamTimeLeft <= 6) timerProgress.style.background = '#FFD700';
  else timerProgress.style.background = '#4CAF50';
}

function submitLedreamTextAnswer() {
  const textInput = document.getElementById('ledreamTextInput');
  const answer = textInput.value.trim();
  if (!answer) return;
  const responseTime = Date.now() - questionStartTime;
  socket.emit('submit-answer', {
    answer, mode: 'ledream', responseType: 'text', responseTime
  });
}

function generateLedreamOptions(correctAnswer, mode) {
  const allCountries = [
    'France','Allemagne','Italie','Espagne','Royaume-Uni','États-Unis','Canada','Japon','Chine','Inde',
    'Brésil','Mexique','Australie','Afrique du Sud','Égypte','Maroc','Suède','Norvège','Pays-Bas','Belgique',
    'Suisse','Autriche','Portugal','Grèce','Turquie','Russie','Ukraine','Pologne','République tchèque','Hongrie'
  ];
  const wrongAnswers = allCountries.filter(c => c !== correctAnswer);
  const numWrongAnswers = mode === 'fifty' ? 1 : 3;
  const shuffledWrong = wrongAnswers.sort(() => 0.5 - Math.random()).slice(0, numWrongAnswers);
  const options = [correctAnswer, ...shuffledWrong].sort(() => 0.5 - Math.random());

  const optionsContainer = document.getElementById('ledreamAnswerOptions');
  optionsContainer.className = `answer-options ledream-answer-options mode-${mode}`;
  optionsContainer.innerHTML = options.map(opt => `
    <div class="ledream-answer-btn" onclick="submitLedreamAnswer('${opt}', '${mode}')">${opt}</div>
  `).join('');
  optionsContainer.style.display = 'grid';
}

function submitLedreamAnswer(answer, mode) {
  const responseTime = Date.now() - questionStartTime;
  socket.emit('submit-answer', { answer, mode: 'ledream', responseType: mode, responseTime });
}

function showLedreamFeedback(message, isCorrect, correctAnswer = null, points = 0, speedBonus = 0) {
  const feedback = document.getElementById('ledreamFeedback');
  let feedbackText = message;
  if (isCorrect && points > 0) {
    feedbackText += `<br>+${points} points`;
    if (speedBonus > 0) feedbackText += `<br><span class="speed-bonus-display">Bonus rapidité: +${speedBonus}</span>`;
  } else if (!isCorrect && correctAnswer) {
    feedbackText += `<br>Réponse: ${correctAnswer}`;
  }
  feedback.innerHTML = feedbackText;
  feedback.className = `ledream-feedback ${isCorrect ? 'correct' : 'incorrect'} show`;
  setTimeout(() => feedback.classList.remove('show'), 1500);
}

// === LEFIST NOUVEAU CONCEPT ===
let lefistPlayerStats = { correct: 0, incorrect: 0, isFinished: false };
let lefistCanClick = true; // Protection anti-spam
let lefistClickTimeout = null;

function showLefistFlag(flag) {
  // Nouveau concept : juste afficher le drapeau
  const flagImage = document.getElementById('lefistFlagImage');
  flagImage.src = `https://flagpedia.net/data/flags/w580/${flag.code}.png`;
  flagImage.alt = flag.name;
  
  // Réactiver les boutons pour le nouveau drapeau (si pas terminé)
  if (!lefistPlayerStats.isFinished) {
    lefistCanClick = true;
    const buttons = document.querySelectorAll('.lefist-continent-btn');
    buttons.forEach(btn => btn.disabled = false);
  }
  
  console.log(`[LeFist] Nouveau drapeau affiché: ${flag.name}`);
}

function handleLefistContinentClick(continent) {
  // Protection anti-spam
  if (!lefistCanClick) {
    console.log('[LeFist] Clic ignoré - protection anti-spam active');
    return;
  }
  
  // Nouveau concept : clic sur bouton au lieu de drag & drop
  if (lefistPlayerStats.isFinished) {
    console.log('[LeFist] Joueur déjà terminé, clic ignoré');
    return;
  }
  
  // Désactiver les clics temporairement
  lefistCanClick = false;
  
  // Feedback visuel immédiat
  const buttons = document.querySelectorAll('.lefist-continent-btn');
  buttons.forEach(btn => btn.disabled = true);
  
  const responseTime = Date.now() - questionStartTime;
  socket.emit('submit-answer', {
    answer: continent, 
    mode: 'lefist', 
    responseTime: responseTime
  });
  
  console.log(`[LeFist] Continent cliqué: ${continent}`);
  
  // Réactiver après 1.5 secondes (temps du feedback + nouveau drapeau)
  if (lefistClickTimeout) clearTimeout(lefistClickTimeout);
  lefistClickTimeout = setTimeout(() => {
    lefistCanClick = true;
    if (!lefistPlayerStats.isFinished) {
      buttons.forEach(btn => btn.disabled = false);
    }
  }, 1500);
}

function updateLefistStats(stats) {
  lefistPlayerStats = stats;
  
  const statsDisplay = document.getElementById('lefistStatsDisplay');
  if (statsDisplay) {
    statsDisplay.innerHTML = `
      <div class="lefist-stat correct">✅ ${stats.correct}</div>
      <div class="lefist-stat incorrect">❌ ${stats.incorrect}/5</div>
    `;
    
    // Changer la couleur si proche de 5 erreurs
    if (stats.incorrect >= 3) {
      statsDisplay.classList.add('danger');
    } else {
      statsDisplay.classList.remove('danger');
    }
  }
}

function showLefistPlayerFinished(data) {
  const gameArea = document.getElementById('lefistGameArea');
  const finishedScreen = document.getElementById('lefistFinishedScreen');
  
  // Désactiver définitivement les clics
  lefistCanClick = false;
  const buttons = document.querySelectorAll('.lefist-continent-btn');
  buttons.forEach(btn => btn.disabled = true);
  
  if (gameArea) gameArea.style.display = 'none';
  if (finishedScreen) {
    finishedScreen.style.display = 'block';
    
    const reasonText = data.reason === 'errors' ? 
      '❌ 5 erreurs atteintes' : 
      '⏰ Temps écoulé';
    
    finishedScreen.innerHTML = `
      <div class="lefist-finished-content">
        <h3>${reasonText}</h3>
        <div class="lefist-final-stats">
          <div class="stat-item">
            <span class="stat-label">Bonnes réponses:</span>
            <span class="stat-value correct">✅ ${data.correctAnswers}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Mauvaises réponses:</span>
            <span class="stat-value incorrect">❌ ${data.incorrectAnswers}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Score final:</span>
            <span class="stat-value score">${data.finalScore} pts</span>
          </div>
        </div>
        <p class="waiting-message">Attente des autres joueurs...</p>
      </div>
    `;
  }
}

function showLefistFeedback(message, isCorrect, correctContinent = null) {
  const feedback = document.getElementById('lefistFeedback');
  let feedbackText = message;
  
  if (!isCorrect && correctContinent) {
    feedbackText += `<br>Continent: <strong>${correctContinent}</strong>`;
  }
  
  feedback.innerHTML = feedbackText;
  feedback.className = `lefist-feedback ${isCorrect ? 'correct' : 'incorrect'} show`;
  setTimeout(() => feedback.classList.remove('show'), 1200);
}

// === LERYTHM FUNCTIONS ===

// Générer les lanes dynamiquement
function lerythmGenerateLanes() {
  const lanesContainer = document.getElementById('lerythmLanes');
  if (!lanesContainer) return;
  
  lanesContainer.innerHTML = '';
  lerythmGameState.activeLanes = [];
  
  const letters = Object.keys(lerythmCountries);
  
  letters.forEach((letter, index) => {
    const laneElement = document.createElement('div');
    laneElement.className = 'lerythm-lane';
    laneElement.setAttribute('data-letter', letter.toLowerCase());
    laneElement.setAttribute('data-lane', index);
    
    const hitZone = document.createElement('div');
    hitZone.className = 'lerythm-hit-zone';
    // Ne pas afficher la lettre (invisible)
    
    laneElement.appendChild(hitZone);
    lanesContainer.appendChild(laneElement);
    
    lerythmGameState.activeLanes.push({
      letter: letter.toLowerCase(),
      index: index,
      element: laneElement
    });
  });
}

// Démarrer le jeu LeRythm
function startLerythmGame() {
  if (currentGameMode !== 'lerythm') return;
  
  // Générer les lanes dynamiques
  lerythmGenerateLanes();
  
  // Reset du jeu
  lerythmGameState.isPlaying = true;
  lerythmGameState.gameOver = false;
  lerythmGameState.startTime = Date.now();
  lerythmGameState.score = 0;
  lerythmGameState.combo = 0;
  lerythmGameState.multiplier = 1;
  lerythmGameState.stats = { perfect: 0, good: 0, ok: 0, miss: 0 };
  lerythmGameState.fallingFlags = [];
  
  // Nettoyer les timers précédents
  if (lerythmGameState.spawnTimer) clearInterval(lerythmGameState.spawnTimer);
  if (lerythmGameState.gameTimer) clearTimeout(lerythmGameState.gameTimer);
  
  updateLerythmUI();
  
  // Commencer à spawner des drapeaux
  setTimeout(() => lerythmSpawnFlag(), 1000);
  lerythmGameState.spawnTimer = setInterval(lerythmSpawnFlag, lerythmConfig.spawnRate);
  
  // Timer de fin de partie
  lerythmGameState.gameTimer = setTimeout(endLerythmGame, gameState.gameDuration * 1000);
  
  console.log('LeRythm démarré avec', lerythmGameState.activeLanes.length, 'lanes');
}

// Spawner un drapeau
function lerythmSpawnFlag() {
  if (!gameState.gameStarted || lerythmGameState.gameOver) return;
  
  // Choisir une lettre aléatoire parmi les lanes actives
  const letters = Object.keys(lerythmCountries);
  const randomLetter = letters[Math.floor(Math.random() * letters.length)];
  const countriesForLetter = lerythmCountries[randomLetter];
  
  if (!countriesForLetter || countriesForLetter.length === 0) return;
  
  // Choisir un pays aléatoire
  const country = countriesForLetter[Math.floor(Math.random() * countriesForLetter.length)];
  
  // Trouver la lane correspondante
  const lane = lerythmGameState.activeLanes.find(l => l.letter === randomLetter.toLowerCase());
  if (!lane) return;
  
  // Créer l'élément drapeau
  const flagElement = document.createElement('div');
  flagElement.className = 'lerythm-flag';
  flagElement.innerHTML = `
    <img src="https://flagpedia.net/data/flags/w580/${country.code}.png" 
         alt="${country.name}" 
         onerror="this.src='https://flagpedia.net/data/flags/w580/${country.code}.webp'">
  `;
  
  // Positionner dans la lane
  lane.element.appendChild(flagElement);
  
  // Animation de chute
  flagElement.style.animationDuration = lerythmConfig.fallSpeed + 'ms';
  
  // Données du drapeau
  const flagData = {
    element: flagElement,
    letter: randomLetter.toLowerCase(),
    country: country,
    startTime: Date.now(),
    lane: lane
  };
  
  lerythmGameState.fallingFlags.push(flagData);
  
  // Supprimer quand l'animation est finie
  setTimeout(() => {
    if (flagElement.parentNode) {
      flagElement.remove();
      lerythmGameState.fallingFlags = lerythmGameState.fallingFlags.filter(f => f.element !== flagElement);
      lerythmHandleMiss();
    }
  }, lerythmConfig.fallSpeed + 100);
}

// Gérer les touches
function lerythmHandleKeyPress(event) {
  if (!gameState.gameStarted || lerythmGameState.gameOver) return;
  
  const letter = event.key.toUpperCase();
  const lane = lerythmGameState.activeLanes.find(l => l.letter === letter.toLowerCase());
  
  if (!lane) return;
  
  // Effet visuel sur la hit-zone
  const hitZone = lane.element.querySelector('.lerythm-hit-zone');
  hitZone.classList.add('hit');
  setTimeout(() => hitZone.classList.remove('hit'), 500);
  
  // Chercher le drapeau le plus proche dans cette lane
  const flagsInLane = lerythmGameState.fallingFlags.filter(f => f.letter === letter.toLowerCase());
  
  if (flagsInLane.length === 0) {
    lerythmHandleMiss();
    return;
  }
  
  // Trouver le drapeau le plus proche de la hit-zone
  let closestFlag = null;
  let minDistance = Infinity;
  
  flagsInLane.forEach(flag => {
    const flagRect = flag.element.getBoundingClientRect();
    const hitZoneRect = flag.lane.element.querySelector('.lerythm-hit-zone').getBoundingClientRect();
    
    const flagCenterY = flagRect.top + flagRect.height / 2;
    const hitZoneCenterY = hitZoneRect.top + hitZoneRect.height / 2;
    const distance = Math.abs(flagCenterY - hitZoneCenterY);
    
    if (distance < minDistance) {
      minDistance = distance;
      closestFlag = flag;
    }
  });
  
  if (closestFlag) {
    lerythmHandleHit(closestFlag, minDistance);
  }
}

// Gérer un hit
function lerythmHandleHit(flag, distance) {
  // Supprimer le drapeau
  flag.element.remove();
  lerythmGameState.fallingFlags = lerythmGameState.fallingFlags.filter(f => f !== flag);
  
  // Calculer le score selon la précision
  let hitType, points;
  
  if (distance <= lerythmConfig.perfectWindow) {
    hitType = 'perfect';
    points = lerythmConfig.scoring.perfect;
    lerythmGameState.stats.perfect++;
    lerythmShowFeedback('PARFAIT! 🎯', 'perfect');
  } else if (distance <= lerythmConfig.goodWindow) {
    hitType = 'good';
    points = lerythmConfig.scoring.good;
    lerythmGameState.stats.good++;
    lerythmShowFeedback('BIEN! ✅', 'good');
  } else if (distance <= lerythmConfig.okWindow) {
    hitType = 'ok';
    points = lerythmConfig.scoring.ok;
    lerythmGameState.stats.ok++;
    lerythmShowFeedback('OK! 👍', 'ok');
  } else {
    lerythmHandleMiss();
    return;
  }
  
  // Augmenter le combo
  lerythmGameState.combo++;
  lerythmUpdateCombo();
  
  // Calculer le multiplicateur (max x5)
  lerythmGameState.multiplier = Math.min(5, Math.floor(lerythmGameState.combo / 10) + 1);
  
  // Ajouter les points avec multiplicateur
  lerythmGameState.score += points * lerythmGameState.multiplier;
  updateLerythmUI();
}

// Gérer un miss
function lerythmHandleMiss() {
  lerythmGameState.stats.miss++;
  lerythmGameState.combo = 0;
  lerythmGameState.multiplier = 1;
  lerythmUpdateCombo();
  updateLerythmUI();
  lerythmShowFeedback('RATÉ! ❌', 'miss');
}

// Afficher le feedback
function lerythmShowFeedback(text, type) {
  const feedback = document.getElementById('lerythmFeedback');
  if (!feedback) return;
  
  feedback.textContent = text;
  feedback.className = `lerythm-feedback ${type} show`;
  
  setTimeout(() => {
    feedback.classList.remove('show');
  }, 1400);
}

// Mettre à jour le combo
function lerythmUpdateCombo() {
  const comboElement = document.getElementById('lerythmCombo');
  const comboCount = document.getElementById('lerythmComboCount');
  
  if (comboCount) comboCount.textContent = lerythmGameState.combo;
  
  if (comboElement) {
    if (lerythmGameState.combo > 5) {
      comboElement.classList.add('active');
    } else {
      comboElement.classList.remove('active');
    }
  }
}

// Mettre à jour l'UI
function updateLerythmUI() {
  const scoreElement = document.getElementById('lerythmScore');
  const multiplierElement = document.getElementById('lerythmMultiplier');
  
  if (scoreElement) scoreElement.textContent = lerythmGameState.score.toLocaleString();
  if (multiplierElement) multiplierElement.textContent = lerythmGameState.multiplier;
}

// Terminer le jeu
function endLerythmGame() {
  lerythmGameState.isPlaying = false;
  lerythmGameState.gameOver = true;
  
  clearInterval(lerythmGameState.spawnTimer);
  clearTimeout(lerythmGameState.gameTimer);
  
  // Nettoyer les drapeaux restants
  lerythmGameState.fallingFlags.forEach(flag => flag.element.remove());
  lerythmGameState.fallingFlags = [];
  
  // Calculer la précision
  const totalHits = lerythmGameState.stats.perfect + lerythmGameState.stats.good + lerythmGameState.stats.ok + lerythmGameState.stats.miss;
  const accuracy = totalHits > 0 ? Math.round(((totalHits - lerythmGameState.stats.miss) / totalHits) * 100) : 0;
  
  // Afficher l'écran de fin
  const finalScoreElement = document.getElementById('lerythmFinalScore');
  const perfectCountElement = document.getElementById('lerythmPerfectCount');
  const goodCountElement = document.getElementById('lerythmGoodCount');
  const okCountElement = document.getElementById('lerythmOkCount');
  const missCountElement = document.getElementById('lerythmMissCount');
  const accuracyElement = document.getElementById('lerythmAccuracy');
  
  if (finalScoreElement) finalScoreElement.textContent = lerythmGameState.score.toLocaleString();
  if (perfectCountElement) perfectCountElement.textContent = lerythmGameState.stats.perfect;
  if (goodCountElement) goodCountElement.textContent = lerythmGameState.stats.good;
  if (okCountElement) okCountElement.textContent = lerythmGameState.stats.ok;
  if (missCountElement) missCountElement.textContent = lerythmGameState.stats.miss;
  if (accuracyElement) accuracyElement.textContent = accuracy;
  
  const gameOverScreen = document.getElementById('lerythmGameOverScreen');
  if (gameOverScreen) gameOverScreen.style.display = 'flex';
  
  // Envoyer le score final au serveur
  socket.emit('lerythm-game-finished', { 
    score: lerythmGameState.score,
    stats: lerythmGameState.stats,
    accuracy: accuracy
  });
}

// === SOCKET.IO — ÉVÉNEMENTS ===
socket.on('connect', () => updateConnectionStatus(true));
socket.on('disconnect', () => updateConnectionStatus(false));

socket.on('room-created', (data) => {
  currentRoom = data.roomCode;
  isHost = data.isHost;

  document.getElementById('roomCodeDisplay').textContent = data.roomCode;
  document.getElementById('startGameBtn').style.display = 'block';
  document.getElementById('gameModeSelector').style.display = 'block';
  document.getElementById('gameDurationSelector').style.display = 'block';

  document.querySelector('[data-mode="lefast"]').classList.add('selected');
  updateGameModeUI('lefast');

  updatePlayersList(data.players);
  showScreen('waitingScreen');
  showNotification(`Room créée: ${data.roomCode}`);
});

socket.on('room-joined', (data) => {
  currentRoom = data.roomCode;
  isHost = data.isHost;
  gameState.gameDuration = data.gameDuration;

  document.getElementById('roomCodeDisplay').textContent = data.roomCode;
  document.getElementById('startGameBtn').style.display = 'none';
  document.getElementById('gameModeSelector').style.display = 'none';
  document.getElementById('gameDurationSelector').style.display = 'none';

  updatePlayersList(data.players);
  showScreen('waitingScreen');
  showNotification(`Vous avez rejoint la room: ${data.roomCode}`);
});

socket.on('join-error', (message) => showNotification(message, true));

socket.on('player-joined', (data) => {
  updatePlayersList(data.players);
  showNotification(`${data.newPlayer} a rejoint la partie`);
});

socket.on('player-left', (data) => {
  updatePlayersList(data.players);
  showNotification(`${data.playerName} a quitté la partie`);
});

socket.on('host-changed', (data) => {
  updatePlayersList(data.players);
  showNotification(`${data.newHostName} est maintenant l'hôte`);
  if (data.newHostName === currentPlayer) {
    isHost = true;
    document.getElementById('startGameBtn').style.display = 'block';
    document.getElementById('gameModeSelector').style.display = 'block';
    document.getElementById('gameDurationSelector').style.display = 'block';
  }
});

socket.on('game-mode-changed', (mode) => {
  currentGameMode = mode;
  document.querySelectorAll('.game-mode-card').forEach(card => card.classList.remove('selected'));
  document.querySelector(`[data-mode="${mode}"]`).classList.add('selected');
  updateGameModeUI(mode);
});

socket.on('game-duration-changed', (duration) => {
  gameState.gameDuration = duration;
  document.querySelectorAll('.duration-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.textContent === `${duration}s`) btn.classList.add('active');
  });
});

socket.on('game-started', (data) => {
  gameState.gameStarted = true;
  gameState.timeLeft = data.timeLeft;
  gameState.score = 0;
  currentGameMode = data.gameMode;

  displayNewFlag(data.currentFlag);
  updateScore(0, currentGameMode);

  if (currentGameMode === 'lefast') {
    showScreen('lefastScreen');
    // Plus de timer circulaire pour LeFast
  } else if (currentGameMode === 'ledream') {
    showScreen('ledreamScreen');
  } else if (currentGameMode === 'lefist') {
    showScreen('lefistScreen');
    document.getElementById('lefistTimer').textContent = data.timeLeft;
    lefistPlayerStats = { correct: 0, incorrect: 0, isFinished: false };
    updateLefistStats(lefistPlayerStats);
  } else if (currentGameMode === 'lerythm') {
    showScreen('lerythmScreen');
    startLerythmGame();
  }
  showNotification('Le jeu commence !');
});

socket.on('timer-update', (timeLeft) => {
  gameState.timeLeft = timeLeft;
  // Seulement pour LeFist maintenant
  if (currentGameMode === 'lefist') {
    document.getElementById('lefistTimer').textContent = timeLeft;
  }
});

// === NOUVEAUX ÉVÉNEMENTS LEFAST ===
socket.on('lefast-attempt-result', (data) => {
  lefastAttempts = data.attemptNumber;
  hasCorrectAnswer = data.isCorrect;
  
  // Ajouter la tentative à l'historique
  lefastAttemptsHistory.push({
    answer: data.answer,
    isCorrect: data.isCorrect,
    attemptNumber: data.attemptNumber
  });
  
  updateLefastAttemptsDisplay();
  
  if (data.isCorrect) {
    // Plus de notification pour éviter la duplication - l'affichage en haut à gauche suffit
    document.getElementById('lefastTextInput').disabled = true;
  } else {
    if (data.remainingAttempts > 0) {
      // Notification discrète pour les mauvaises réponses
      showNotification(`Mauvaise réponse (${data.remainingAttempts} restante${data.remainingAttempts > 1 ? 's' : ''})`, true);
      // Permettre de retenter
      document.getElementById('lefastTextInput').focus();
    } else {
      showNotification('Plus de tentatives pour cette question', true);
      document.getElementById('lefastTextInput').disabled = true;
    }
  }
});

socket.on('lefast-question-results', (data) => {
  // Mettre à jour les scores des joueurs si fournis
  if (data.results) {
    data.results.forEach(result => {
      if (result.playerName === currentPlayer) {
        updateScore(result.newScore, 'lefast');
      }
    });
  }
  
  showLefastBetweenQuestions(data.results, data.correctAnswer);
});

socket.on('max-attempts-reached', (data) => {
  showNotification(data.message, true);
  document.getElementById('lefastTextInput').disabled = true;
});

socket.on('already-correct', (data) => {
  showNotification(data.message);
});

// Anciens événements conservés pour compatibilité et autres modes
socket.on('question-won', (data) => {
  // Cet événement n'est plus utilisé pour LeFast mais conservé pour compatibilité
  if (currentGameMode !== 'lefast') {
    if (data.winnerName === currentPlayer) {
      const scoreDisplay = document.querySelector('.score-display');
      if (scoreDisplay) {
        scoreDisplay.classList.add('player-highlight');
        setTimeout(() => scoreDisplay.classList.remove('player-highlight'), 1000);
      }
    }
  }
});

socket.on('answer-result', (data) => {
  if (currentGameMode === 'ledream') {
    const message = data.isCorrect ? '✅ Réponse soumise !' : '❌ Réponse soumise';
    showLedreamFeedback(message, data.isCorrect, null, 0, 0);
    disableLedreamInput();
    if (data.isCorrect) updateScore(data.newScore, currentGameMode);
  } else if (currentGameMode === 'lefist') {
    // Nouveau système LeFist
    const message = data.isCorrect ? '✅ Correct !' : '❌ Incorrect';
    
    if (data.points && data.points > 0) {
      showLefistFeedback(`${message} (+${data.points} pts)`, data.isCorrect, data.correctContinent);
    } else {
      showLefistFeedback(message, data.isCorrect, data.correctContinent);
    }
    
    // Mettre à jour les statistiques
    if (data.playerStats) {
      updateLefistStats(data.playerStats);
    }
    
    updateScore(data.newScore, currentGameMode);
  }
  // Plus d'action pour LeFast ici car géré par les nouveaux événements
});

// Nouveaux événements pour LeFist
socket.on('lefist-player-finished', (data) => {
  console.log('[LeFist] Joueur terminé:', data);
  showLefistPlayerFinished(data);
});

socket.on('ledream-question-ended', (data) => {
  if (currentGameMode !== 'ledream') return;
  if (ledreamQuestionTimer) {
    clearInterval(ledreamQuestionTimer);
    ledreamQuestionTimer = null;
  }
  showLedreamQuestionResults(data.correctAnswer, data.playerResults);
});

socket.on('new-flag', (data) => {
  displayNewFlag(data.flag);
  // Plus de gestion de vitesse pour LeFist (ancien système)
});

socket.on('game-ended', (data) => {
  const rankingElement = document.getElementById('finalRanking');
  rankingElement.innerHTML = data.finalRanking.map((p, i) => `
    <div class="player">
      <span>${i + 1}. ${p.name} ${p.name === currentPlayer ? '(Vous)' : ''}</span>
      <span>${p.score} pts</span>
    </div>
  `).join('');
  showScreen('resultsScreen');
  showNotification('Fin de partie !');
});

// Dashboard universel pour tous les modes
function showGameDashboard(finalRanking, gameMode) {
  const dashboardElement = document.getElementById('gameDashboard');
  const rankingElement = document.getElementById('dashboardRanking');
  
  if (dashboardElement && rankingElement) {
    rankingElement.innerHTML = finalRanking.map((p, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      const isCurrentPlayer = p.name === currentPlayer;
      const playerClass = isCurrentPlayer ? 'current-player' : '';
      
      return `
        <div class="dashboard-player ${playerClass}">
          <span class="player-rank">${medal}</span>
          <span class="player-name">${p.name} ${isCurrentPlayer ? '(Vous)' : ''}</span>
          <span class="player-score">${p.score} pts</span>
        </div>
      `;
    }).join('');
    
    // Afficher le bon titre selon le mode
    const titleElement = document.getElementById('dashboardTitle');
    if (titleElement) {
      const modeNames = {
        'lefast': 'LeFast',
        'ledream': 'LeDream', 
        'lefist': 'LeFist'
      };
      titleElement.textContent = `🏆 Classement ${modeNames[gameMode] || ''}`;
    }
    
    showScreen('dashboardScreen');
  }
}

function returnToLobby() {
  // Retourner à la salle d'attente
  showScreen('waitingScreen');
}

function quitGame() {
  // Quitter complètement
  goHome();
}

// Gestion des erreurs
socket.on('error', (data) => {
  showNotification(data.message, true);
});

socket.on('rate-limited', (data) => {
  showNotification(`Ralentissez ! ${data.message}`, true);
});

// === CLAVIERS / INIT ===
document.addEventListener('DOMContentLoaded', () => {
  const lefastInput = document.getElementById('lefastTextInput');
  if (lefastInput) lefastInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') submitLefastAnswer(); });

  const playerNameInput = document.getElementById('playerName');
  if (playerNameInput) {
    playerNameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') createRoom(); });
    playerNameInput.focus();
  }

  const roomCodeInput = document.getElementById('roomCode');
  if (roomCodeInput) roomCodeInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') joinRoom(); });

  const ledreamInput = document.getElementById('ledreamTextInput');
  if (ledreamInput) ledreamInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') submitLedreamTextAnswer(); });

  // Gestionnaire d'événements clavier pour LeRythm
  document.addEventListener('keydown', (e) => {
    if (currentGameMode === 'lerythm' && gameState.gameStarted) {
      lerythmHandleKeyPress(e);
    }
  });
});

// === EXPOSE FONCTIONS GLOBALES POUR onclick HTML ===
window.createRoom = createRoom;
window.showJoinRoom = showJoinRoom;
window.joinRoom = joinRoom;
window.goHome = goHome;
window.startGame = startGame;
window.leaveRoom = leaveRoom;
window.selectGameMode = selectGameMode;
window.setGameDuration = setGameDuration;
window.submitLefastAnswer = submitLefastAnswer;
window.activateLedreamMode = activateLedreamMode;
window.submitLedreamTextAnswer = submitLedreamTextAnswer;
window.submitLedreamAnswer = submitLedreamAnswer;
window.handleLefistContinentClick = handleLefistContinentClick;
window.returnToLobby = returnToLobby;
window.quitGame = quitGame;