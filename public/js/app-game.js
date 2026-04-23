/**
 * app-game.js — Game page logic.
 * URL: /game/solo  → solo mode
 * URL: /game/:code → multiplayer reconnect
 */
(() => {
  const _pathCode = window.location.pathname.split('/')[2] || '';
  const isSolo    = _pathCode.toLowerCase() === 'solo';
  const roomCode  = isSolo ? null : _pathCode.toUpperCase();

  let _roundGen = 0;

  /* ═══════════════════════════════════════
     Helpers
     ═══════════════════════════════════════ */

  function _submitGameEnd() {
    const nickname      = GameState.get('nickname');
    const totalScore    = GameState.get('totalScore');
    const mode          = GameState.get('mode') || 'solo';
    const roundScores   = GameState.get('roundScores')    || [];
    const locations     = GameState.get('locations')      || [];
    const roundGuesses  = GameState.get('roundGuesses')   || [];
    const roundDistances = GameState.get('roundDistances') || [];

    fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname, score: totalScore, mode }),
    }).catch(() => {});

    const rounds = roundScores.map((score, i) => ({
      imageId:  locations[i]?.imageId || null,
      lat:      locations[i]?.lat     || null,
      lng:      locations[i]?.lng     || null,
      guess:    roundGuesses[i]       || null,
      score,
      distance: roundDistances[i]     || null,
    }));
    fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname, mode, totalScore, rounds }),
    }).catch(() => {});

    // Solo XP — award halved XP via authenticated endpoint
    if (mode === 'solo') {
      const token = Player.getToken();
      if (token) {
        fetch('/api/solo-finish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
          body: JSON.stringify({ totalScore, rounds }),
        }).catch(() => {});
      }
    }
  }

  /* ═══════════════════════════════════════
     Solo Mode
     ═══════════════════════════════════════ */

  async function initSolo() {
    await GameConfig.ready;
    GameState.set('mode', 'solo');
    GameState.resetGame();
    UI.hideMultiplayerHUD();
    UI.hideMultiplayerRoundResults();
    UI.hideMultiplayerLeaderboard();

    UI.showSoloLoading(true, 'Поиск панорам…');

    let locations;
    try {
      const res = await fetch('/api/locations');
      locations = await res.json();
    } catch {
      locations = Locations.pickRandom(5);
    } finally {
      UI.showSoloLoading(false);
    }

    GameState.set('locations', locations);
    GameState.set('totalRounds', locations.length);

    GameMap.initMiniMap();
    UI.showScreen('game');
    await startRound();
  }

  async function startRound() {
    const myRound = ++_roundGen;

    Panorama.reset();

    const locations = GameState.get('locations');
    const round     = GameState.get('currentRound');

    GameState.set('currentGuess', null);
    GameMap.resetMiniMap();
    GameMap.clearLiveMarkers();
    UI.updateHUD();

    const location = locations[round];
    if (!location) return;

    let foundLocation = null;

    if (location.imageId) {
      if (_roundGen !== myRound) return;
      await Panorama.loadById(location.imageId, location.lat, location.lng);
      if (_roundGen !== myRound) return;
      Panorama.lockInteraction(1500);
      foundLocation = { ...location };
    } else {
      const usedLocations = locations.slice(0, round);
      const extras = Locations.ALL.filter(l =>
        usedLocations.every(u => Scoring.haversine(l.lat, l.lng, u.lat, u.lng) >= 500)
      );
      const candidates = [location, ...extras].filter(Boolean);

      for (const candidate of candidates) {
        if (_roundGen !== myRound) return;
        const actual = await Panorama.loadLocation(candidate.lat, candidate.lng);
        if (_roundGen !== myRound) return;
        if (actual) {
          Panorama.lockInteraction(1500);
          foundLocation = { ...candidate, lat: actual.lat, lng: actual.lng };
          break;
        }
      }

      if (_roundGen !== myRound) return;

      if (!foundLocation) {
        foundLocation = location;
        document.getElementById('panorama-fallback')?.classList.remove('hidden');
        const coordsEl = document.getElementById('fallback-coords');
        if (coordsEl) coordsEl.textContent = `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`;
        UI.showPanoramaLoading(false);
      }
    }

    locations[round] = foundLocation;
    GameState.set('currentLocation', foundLocation);
  }

  async function handleGuessSolo() {
    const guess    = GameState.get('currentGuess');
    const location = GameState.get('currentLocation');
    if (!guess || !location) return;

    const distance = Scoring.haversine(location.lat, location.lng, guess.lat, guess.lng);
    const score    = Scoring.calculateScore(distance);

    GameState.recordRound(distance, score, guess);
    UI.showRoundResult(location, distance, score, guess.lat, guess.lng);
    UI.updateHUD();
  }

  function handleNextRoundSolo() {
    if (GameState.isGameOver()) {
      Player.recordGame(GameState.get('totalScore'), GameState.get('roundScores'), 'solo');
      _submitGameEnd();
      UI.showFinalResults();
      return;
    }
    UI.showScreen('game');
    startRound().catch(console.error);
  }

  /* ═══════════════════════════════════════
     Multiplayer Mode
     ═══════════════════════════════════════ */

  async function initMulti() {
    await GameConfig.ready;
    const nick  = Player.getNickname();
    const color = Player.getColor() || '#4fc3f7';

    GameState.set('mode', 'multiplayer');
    GameState.set('nickname', nick);

    try {
      await Network.connect(window.location.origin);
      const data = await Network.rejoinRoom(roomCode, nick, color);

      if (data.status === 'waiting') {
        window.location.replace('/lobby/' + roomCode);
        return;
      }

      // status === 'playing'
      GameState.set('roomCode', roomCode);
      GameState.set('isHost', data.isHost);
      GameState.set('currentRound', data.round - 1);
      GameState.set('totalRounds', data.totalRounds);
      GameState.set('locations', [{ lat: data.location.lat, lng: data.location.lng, imageId: data.imageId }]);
      GameState.set('currentLocation', data.location);
      GameState.set('currentGuess', null);

      GameMap.initMiniMap();
      GameMap.resetMiniMap();
      UI.showScreen('game');
      UI.hideMultiplayerRoundResults();
      UI.showInGameLeaderboard(data.players ?? []);
      UI.updateHUD();
      UI.updateMultiplayerHUD(0, data.totalRounds);

      // Restore timer if countdown was already running
      if (data.timerSecsLeft > 0) UI.startRoundTimer(data.timerSecsLeft);
      else UI.clearRoundTimer();

      if (data.imageId) {
        await Panorama.loadById(data.imageId, data.location.lat, data.location.lng);
        if (!data.alreadyGuessed) Panorama.lockInteraction(1500);
      }

    } catch (err) {
      console.warn('[game] Failed to rejoin room:', err.message);
      window.location.replace('/menu');
      return;
    }

    _bindNetworkEvents();
    _initGameChat();
  }

  function _bindNetworkEvents() {
    Network.on('onRoundStart', handleMultiRoundStart);
    Network.on('onPlayerGuessed', (data) => {
      UI.updateMultiplayerHUD(data.playersGuessed, data.totalPlayers);
      if (window._devPlayers && data.nickname && data.lat != null && data.lng != null) {
        GameMap.updateLiveMarker(data.nickname, data.color, data.lat, data.lng);
      }
    });
    Network.on('onRoundResults', handleMultiRoundResults);
    Network.on('onGameOver', handleMultiGameOver);
    Network.on('onReadyUpdate', (data) => {
      UI.showReadyStatus(data.readyCount, data.total);
    });
    // Game chat
    Network.on('onChatMessage', (data) => {
      _appendGameChatMsg(data);
    });
    // Round countdown timer
    Network.on('onRoundTimerStart', (data) => {
      if (data.secs > 0) UI.startRoundTimer(data.secs);
      else UI.clearRoundTimer();
    });
  }

  function _appendGameChatMsg({ nickname, text, color, system = false }) {
    const box = document.getElementById('game-chat-messages');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'chat-msg' + (system ? ' chat-msg-system' : '');
    if (system) {
      el.textContent = text;
    } else {
      const nick = document.createElement('span');
      nick.className = 'chat-msg-nick';
      nick.style.color = color || '#cc6666';
      nick.textContent = nickname + ':';
      el.appendChild(nick);
      el.appendChild(document.createTextNode(' ' + text));
    }
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;

    // Show unread dot if panel is closed
    const panel = document.getElementById('game-chat-panel');
    if (panel && panel.classList.contains('hidden')) {
      const dot = document.getElementById('game-chat-unread');
      if (dot) {
        dot.classList.remove('hidden');
        dot.classList.add('blinking');
      }
    }
  }

  function _initGameChat() {
    const panel = document.getElementById('game-chat-panel');
    const toggleBtn = document.getElementById('btn-game-chat-toggle');
    const closeBtn = document.getElementById('btn-game-chat-close');
    const input = document.getElementById('game-chat-input');
    const sendBtn = document.getElementById('game-chat-send');
    const dot = document.getElementById('game-chat-unread');
    if (!panel || !toggleBtn) return;

    toggleBtn.addEventListener('click', () => {
      panel.classList.toggle('hidden');
      if (!panel.classList.contains('hidden')) {
        if (dot) { dot.classList.add('hidden'); dot.classList.remove('blinking'); }
        input?.focus();
      }
    });
    closeBtn?.addEventListener('click', () => {
      panel.classList.add('hidden');
    });

    function sendMsg() {
      const text = input?.value.trim();
      if (!text || !roomCode) return;
      Network.sendChat(roomCode, text);
      input.value = '';
    }
    sendBtn?.addEventListener('click', sendMsg);
    input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMsg(); });
  }

  async function handleMultiRoundStart(data) {
    Panorama.reset();

    if (data.round === 1) {
      GameState.resetGame();
      GameState.set('totalRounds', data.totalRounds);
      GameState.set('locations', []);
    }

    const loc = data.location;
    GameState.set('currentLocation', loc);

    const locations = GameState.get('locations');
    if (locations.length < data.round) locations.push(loc);

    GameState.set('currentRound', data.round - 1);
    GameState.set('currentGuess', null);

    UI.showScreen('game');
    UI.hideMultiplayerRoundResults();
    GameMap.initMiniMap();
    GameMap.resetMiniMap();
    GameMap.clearLiveMarkers();
    UI.updateHUD();
    UI.updateMultiplayerHUD(0, 0);

    // Always show the leaderboard panel; update content if server sent players
    UI.showInGameLeaderboard(data.players ?? []);
    UI.clearRoundTimer();

    if (data.settings) GameState.set('gameSettings', data.settings);
    if (data.teamScores && data.settings?.teamMode) UI.updateTeamScores(data.teamScores);

    if (data.imageId) {
      await Panorama.loadById(data.imageId, loc.lat, loc.lng);
      Panorama.lockInteraction(1500);
    } else {
      Panorama.reset();
      const c = document.getElementById('panorama-container');
      if (c) c.innerHTML = '<div class="pano-no-image">⚠️ Панорама не найдена — воспользуйтесь картой</div>';
    }
  }

  function handleMultiRoundResults(data) {
    const location = data.location;
    const nickname = GameState.get('nickname');
    const myResult = data.results.find(r => r.nickname === nickname);
    const guess    = myResult?.guess;
    const distance = myResult?.distance ?? 0;
    const score    = myResult?.score    ?? 0;

    GameState.recordRound(distance, score, guess);

    if (guess) {
      UI.showRoundResult(location, distance, score, guess.lat, guess.lng);
    } else {
      UI.showRoundResult(location, 0, 0, location.lat, location.lng);
    }

    UI.showMultiplayerRoundResults(data.results, data.location);
    UI.updateHUD();
    UI.updateInGameLeaderboard(data.results);
    UI.clearRoundTimer();
    if (data.teamScores) UI.updateTeamScores(data.teamScores);
    setTimeout(() => GameMap.showMultiplayerGuesses(data.results, nickname), 300);

    UI.showReadyButton(true);
    UI.showReadyStatus(0, data.results.length);
    if (data.isLastRound) {
      const btn = document.getElementById('btn-next-round');
      if (btn) { btn.textContent = '🏆 Показать итоги'; btn.disabled = false; }
    }
  }

  function handleMultiGameOver(data) {
    Player.recordGame(GameState.get('totalScore'), GameState.get('roundScores'), 'multiplayer');
    _submitGameEnd();
    UI.showFinalResults();
    UI.showMultiplayerLeaderboard(data.leaderboard, data.eloChanges || {}, data.avgElo);
    UI.hideReadyStatus();
  }

  async function handleGuessMulti() {
    const guess = GameState.get('currentGuess');
    if (!guess) return;
    try {
      await Network.submitGuess(guess.lat, guess.lng);
      document.getElementById('btn-guess').disabled = true;
    } catch (err) {
      console.error('Failed to submit guess:', err);
    }
  }

  function handleNextRoundMulti() {
    UI.showReadyButton(false);
    Network.playerReady().catch(console.error);
  }

  /* ═══════════════════════════════════════
     Common UI bindings
     ═══════════════════════════════════════ */

  function _bindUiEvents() {
    document.getElementById('btn-guess')?.addEventListener('click', () => {
      if (isSolo) handleGuessSolo(); else handleGuessMulti();
    });

    document.getElementById('btn-next-round')?.addEventListener('click', () => {
      if (isSolo) handleNextRoundSolo(); else handleNextRoundMulti();
    });

    document.getElementById('btn-play-again')?.addEventListener('click', () => {
      window.location.reload();
    });

    document.getElementById('btn-back-menu')?.addEventListener('click', () => {
      if (!isSolo) Network.disconnect();
      window.location.href = '/menu';
    });

    // Leaderboard collapse toggle
    document.getElementById('btn-lb-toggle')?.addEventListener('click', () => {
      const list = document.getElementById('game-lb-list');
      const btn  = document.getElementById('btn-lb-toggle');
      if (!list) return;
      const collapsed = list.style.display === 'none';
      list.style.display = collapsed ? '' : 'none';
      if (btn) btn.textContent = collapsed ? '−' : '+';
    });

    // Minimap size buttons
    document.getElementById('minimap-size-up')?.addEventListener('click',   () => GameMap.resizeMiniMap(1));
    document.getElementById('minimap-size-down')?.addEventListener('click', () => GameMap.resizeMiniMap(-1));

    // Tile style selector
    document.getElementById('tile-select')?.addEventListener('change', (e) => GameMap.setTileLayer(e.target.value));
  }

  /* ═══════════════════════════════════════
     Bootstrap
     ═══════════════════════════════════════ */

  async function init() {
    const nick  = Player.getNickname();
    const token = Player.getToken();
    if (!nick || !token) { window.location.replace('/login'); return; }

    GameState.set('nickname', nick);

    _bindUiEvents();

    if (isSolo) {
      await initSolo();
    } else if (roomCode) {
      await initMulti();
    } else {
      window.location.replace('/menu');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ── Developer console commands ── */
  window.dev = {
    info() {
      document.body.classList.toggle('dev-info-visible');
    },
    players() {
      window._devPlayers = !window._devPlayers;
      if (!window._devPlayers) GameMap.clearLiveMarkers();
      console.log(window._devPlayers ? '✅ live markers ON' : '❌ live markers OFF');
    },
    target() {
      window._devTarget = !window._devTarget;
      if (!window._devTarget) {
        GameMap.clearDevTarget();
        console.log('❌ ДЕАКТИВИРОВАНА');
        return;
      }
      const loc = GameState.get('currentLocation');
      if (!loc?.lat) { window._devTarget = false; return; }
      GameMap.showDevTarget(loc.lat, loc.lng);
      console.log(`✅ АКТИВИРОВАНА — ${loc.lat}, ${loc.lng}`);
    },
  };
})();
