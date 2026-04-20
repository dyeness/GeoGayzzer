/**
 * App — main game orchestrator.
 * Wires together all modules and handles the game flow.
 */

const App = (() => {
  // Generation counter — incremented on every new startRound() call.
  // Lets async operations detect they've been superseded by a newer round.
  let _roundGen = 0;

  /* ══════════════════════════════════════
     Initialization
     ══════════════════════════════════════ */

  async function init() {
    // Wait for API config to load
    await GameConfig.ready;

    // Check for saved nickname
    const savedNick = Player.getNickname();
    if (savedNick) {
      GameState.set('nickname', savedNick);
      UI.updateMenuNickname(savedNick);
      UI.showScreen('menu');
    } else {
      UI.showScreen('login');
    }

    bindEvents();
  }

  /* ══════════════════════════════════════
     Event Bindings
     ══════════════════════════════════════ */

  function bindEvents() {
    // ─── Login ───
    const nicknameInput = document.getElementById('nickname-input');
    const btnLogin = document.getElementById('btn-login');

    nicknameInput?.addEventListener('input', () => {
      btnLogin.disabled = nicknameInput.value.trim().length < 2;
    });

    btnLogin?.addEventListener('click', () => handleLogin());
    nicknameInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !btnLogin.disabled) handleLogin();
    });

    // ─── Menu ───
    document.getElementById('btn-solo')?.addEventListener('click', startSoloGame);
    document.getElementById('btn-create-room')?.addEventListener('click', handleCreateRoom);
    document.getElementById('btn-join-room')?.addEventListener('click', () => {
      UI.hideJoinError();
      UI.showModal('modal-join');
    });
    document.getElementById('btn-stats')?.addEventListener('click', () => UI.showStats());
    document.getElementById('btn-logout')?.addEventListener('click', handleLogout);

    // ─── Join Modal ───
    document.getElementById('btn-join-confirm')?.addEventListener('click', handleJoinRoom);
    document.getElementById('btn-join-cancel')?.addEventListener('click', () => UI.hideModal('modal-join'));

    // ─── Lobby ───
    document.getElementById('btn-start-game')?.addEventListener('click', handleStartMultiplayer);
    document.getElementById('btn-leave-lobby')?.addEventListener('click', handleLeaveLobby);
    document.getElementById('btn-copy-code')?.addEventListener('click', () => {
      const code = GameState.get('roomCode');
      if (code) {
        navigator.clipboard?.writeText(code);
      }
    });

    // ─── Game ───
    document.getElementById('btn-guess')?.addEventListener('click', handleGuess);

    // ─── Result Modal ───
    document.getElementById('btn-next-round')?.addEventListener('click', handleNextRound);

    // ─── Final ───
    document.getElementById('btn-play-again')?.addEventListener('click', () => {
      if (GameState.get('mode') === 'multiplayer') {
        UI.showScreen('lobby');
      } else {
        startSoloGame();
      }
    });
    document.getElementById('btn-back-menu')?.addEventListener('click', () => {
      Network.disconnect();
      UI.hideMultiplayerLeaderboard();
      UI.showScreen('menu');
    });

    // ─── Stats ───
    document.getElementById('btn-stats-back')?.addEventListener('click', () => UI.showScreen('menu'));

    // ─── Network callbacks ───
    Network.on('onPlayerJoined', (data) => {
      UI.updateLobby(GameState.get('roomCode'), data.players, GameState.get('isHost'));
    });

    Network.on('onPlayerLeft', (data) => {
      UI.updateLobby(GameState.get('roomCode'), data.players, GameState.get('isHost'));
    });

    Network.on('onRoundStart', (data) => {
      handleMultiplayerRoundStart(data);
    });

    Network.on('onPlayerGuessed', (data) => {
      UI.updateMultiplayerHUD(data.playersGuessed, data.totalPlayers);
    });

    Network.on('onRoundResults', (data) => {
      handleMultiplayerRoundResults(data);
    });

    Network.on('onGameOver', (data) => {
      handleMultiplayerGameOver(data);
    });
  }

  /* ══════════════════════════════════════
     Login / Logout
     ══════════════════════════════════════ */

  function handleLogin() {
    const input = document.getElementById('nickname-input');
    const nickname = input?.value?.trim();
    if (!nickname || nickname.length < 2) return;

    Player.register(nickname);
    GameState.set('nickname', nickname);
    UI.updateMenuNickname(nickname);
    UI.showScreen('menu');
  }

  function handleLogout() {
    Player.logout();
    GameState.set('nickname', '');
    document.getElementById('nickname-input').value = '';
    UI.showScreen('login');
  }

  /* ══════════════════════════════════════
     Solo Game
     ══════════════════════════════════════ */

  async function startSoloGame() {
    GameState.set('mode', 'solo');
    GameState.resetGame();
    UI.hideMultiplayerHUD();
    UI.hideMultiplayerRoundResults();
    UI.hideMultiplayerLeaderboard();

    // Fetch locations from server or use local pool
    let locations;
    try {
      const res = await fetch('/api/locations');
      locations = await res.json();
    } catch {
      locations = Locations.pickRandom(5);
    }

    GameState.set('locations', locations);
    GameState.set('totalRounds', locations.length);

    UI.showScreen('game');
    GameMap.initMiniMap();
    await startRound();
  }

  async function startRound() {
    // Claim this generation — any previous startRound() running concurrently will bail out
    const myRound = ++_roundGen;

    // Immediately cover the old panorama with the loading overlay
    Panorama.reset();

    const locations = GameState.get('locations');
    const round = GameState.get('currentRound');

    GameState.set('currentGuess', null);
    GameMap.resetMiniMap();
    UI.updateHUD();

    // Build a pool of candidates: scheduled location first, then extras not too close to used ones
    const scheduled = locations[round];
    const usedLocations = locations.slice(0, round);
    const usedKeys = new Set(usedLocations.map(l => `${l.lat},${l.lng}`));

    const extras = Locations.ALL.filter(l => {
      const key = `${l.lat},${l.lng}`;
      if (usedKeys.has(key)) return false;
      if (scheduled && key === `${scheduled.lat},${scheduled.lng}`) return false;
      // Skip locations within 500 km of any already-played location
      return usedLocations.every(u => Scoring.haversine(l.lat, l.lng, u.lat, u.lng) >= 500);
    });
    const candidates = [scheduled, ...extras].filter(Boolean);

    let found = null;
    let foundLocation = null;

    for (const candidate of candidates) {
      if (_roundGen !== myRound) return;  // superseded — a new round started, abort
      const actual = await Panorama.loadLocation(candidate.lat, candidate.lng);
      if (_roundGen !== myRound) return;  // superseded after await
      if (actual) {
        // Bind the target to the actual panorama position
        foundLocation = { ...candidate, lat: actual.lat, lng: actual.lng };
        found = true;
        break;
      }
    }

    if (_roundGen !== myRound) return;  // superseded

    if (!found) {
      // Absolute fallback: no panoramas anywhere — extremely rare
      foundLocation = scheduled;
      const fallbackEl = document.getElementById('panorama-fallback');
      const coordsEl  = document.getElementById('fallback-coords');
      if (fallbackEl) fallbackEl.classList.remove('hidden');
      if (coordsEl)   coordsEl.textContent = `${scheduled.lat.toFixed(5)}, ${scheduled.lng.toFixed(5)}`;
      UI.showPanoramaLoading(false);
    }

    // Update the locations array so the result screen shows the right place
    locations[round] = foundLocation;
    GameState.set('currentLocation', foundLocation);
  }

  /* ══════════════════════════════════════
     Guess Handling
     ══════════════════════════════════════ */

  async function handleGuess() {
    const guess = GameState.get('currentGuess');
    const location = GameState.get('currentLocation');
    if (!guess || !location) return;

    const mode = GameState.get('mode');

    if (mode === 'multiplayer') {
      // Send guess to server
      try {
        await Network.submitGuess(guess.lat, guess.lng);
        document.getElementById('btn-guess').disabled = true;
        // Wait for server to send round-results
      } catch (err) {
        console.error('Failed to submit guess:', err);
      }
    } else {
      // Solo — calculate locally
      const distance = Scoring.haversine(location.lat, location.lng, guess.lat, guess.lng);
      const score = Scoring.calculateScore(distance);

      GameState.recordRound(distance, score, guess);

      UI.showRoundResult(location, distance, score, guess.lat, guess.lng);
      UI.updateHUD();
    }
  }

  function handleNextRound() {
    // Go back to game screen (result screen → game screen or final)
    const mode = GameState.get('mode');

    if (GameState.isGameOver()) {
      Player.recordGame(
        GameState.get('totalScore'),
        GameState.get('roundScores'),
        mode
      );
      UI.showFinalResults();
      return;
    }

    if (mode === 'multiplayer') {
      if (GameState.get('isHost')) {
        Network.requestNextRound().catch(console.error);
      }
      // Non-hosts wait for round-start event
    } else {
      UI.showScreen('game');
      startRound().catch(console.error);
    }
  }

  /* ══════════════════════════════════════
     Multiplayer — Room Management
     ══════════════════════════════════════ */

  async function handleCreateRoom() {
    try {
      // Connect to local server
      await Network.connect(window.location.origin);
      const result = await Network.createRoom(GameState.get('nickname'));

      GameState.set('mode', 'multiplayer');
      GameState.set('roomCode', result.code);
      GameState.set('isHost', true);

      UI.updateLobby(result.code, result.players, true);
      UI.showScreen('lobby');
    } catch (err) {
      console.error('Failed to create room:', err);
      alert('Не удалось создать комнату: ' + err.message);
    }
  }

  async function handleJoinRoom() {
    const serverInput = document.getElementById('join-server-input');
    const codeInput = document.getElementById('join-code-input');
    const serverAddr = serverInput?.value?.trim();
    const code = codeInput?.value?.trim()?.toUpperCase();

    if (!code || code.length < 3) {
      UI.showJoinError('Введи код комнаты');
      return;
    }

    // Build server URL
    let url;
    if (serverAddr) {
      // User provided a Radmin VPN address
      const addr = serverAddr.includes('://') ? serverAddr : `http://${serverAddr}`;
      url = addr.includes(':') && !addr.includes('://') ? `http://${addr}` : addr;
      // Ensure port
      if (!/:\d+/.test(url.replace('://', ''))) {
        url += ':3000';
      }
    } else {
      url = window.location.origin;
    }

    try {
      UI.hideJoinError();
      await Network.connect(url);
      const result = await Network.joinRoom(code, GameState.get('nickname'));

      GameState.set('mode', 'multiplayer');
      GameState.set('roomCode', result.code);
      GameState.set('isHost', false);

      UI.hideModal('modal-join');
      UI.updateLobby(result.code, result.players, false);
      UI.showScreen('lobby');
    } catch (err) {
      UI.showJoinError(err.message || 'Не удалось подключиться');
    }
  }

  async function handleStartMultiplayer() {
    try {
      await Network.startGame();
    } catch (err) {
      console.error('Failed to start game:', err);
      alert('Ошибка: ' + err.message);
    }
  }

  function handleLeaveLobby() {
    Network.disconnect();
    GameState.set('roomCode', null);
    GameState.set('isHost', false);
    UI.showScreen('menu');
  }

  /* ══════════════════════════════════════
     Multiplayer — Game Flow (from server events)
     ══════════════════════════════════════ */

  async function handleMultiplayerRoundStart(data) {
    // Immediately cancel any previous panorama load and show loading overlay
    // This must happen BEFORE any await so the old image is covered right away
    Panorama.reset();

    // data: { round, totalRounds, location: {lat, lng} }
    // Only reset on first round; for subsequent rounds, preserve state
    if (data.round === 1) {
      GameState.resetGame();
      GameState.set('totalRounds', data.totalRounds);
      GameState.set('locations', []);
    }

    // Store current location
    const loc = data.location;
    GameState.set('currentLocation', loc);

    // Add to locations array
    const locations = GameState.get('locations');
    if (locations.length < data.round) {
      locations.push(loc);
    }

    GameState.set('currentRound', data.round - 1);
    GameState.set('currentGuess', null);

    UI.showScreen('game');
    UI.hideMultiplayerRoundResults();
    GameMap.initMiniMap();
    GameMap.resetMiniMap();
    UI.updateHUD();
    UI.updateMultiplayerHUD(0, 0);

    // Load panorama — use server-resolved imageId so ALL players see the SAME panorama
    const result = data.imageId
      ? await Panorama.loadById(data.imageId, loc.lat, loc.lng)
      : await Panorama.loadLocation(loc.lat, loc.lng);
    if (!result) {
      // Try any other location that is at least 500 km away
      const fallbacks = Locations.ALL.filter(l =>
        Scoring.haversine(l.lat, l.lng, loc.lat, loc.lng) > 500
      ).sort(() => Math.random() - 0.5);

      for (const fb of fallbacks) {
        const r2 = await Panorama.loadLocation(fb.lat, fb.lng);
        if (r2) {
          // Update location so the result map shows the right place
          const updated = { ...fb, lat: r2.lat, lng: r2.lng };
          GameState.set('currentLocation', updated);
          break;
        }
      }
    }
  }

  function handleMultiplayerRoundResults(data) {
    // data: { results, location, round }
    const location = data.location;
    const nickname = GameState.get('nickname');

    // Find this player's result
    const myResult = data.results.find((r) => r.nickname === nickname);
    const guess = myResult?.guess;
    const distance = myResult?.distance ?? 0;
    const score = myResult?.score ?? 0;

    // Record locally
    GameState.recordRound(distance, score, guess);

    // Show result
    if (guess) {
      UI.showRoundResult(location, distance, score, guess.lat, guess.lng);
    } else {
      UI.showRoundResult(location, 0, 0, location.lat, location.lng);
    }

    UI.showMultiplayerRoundResults(data.results);
    UI.updateHUD();
    // Show other players' guess markers on the result map (after map init at 250ms)
    setTimeout(() => GameMap.showMultiplayerGuesses(data.results, nickname), 300);
  }

  function handleMultiplayerGameOver(data) {
    Player.recordGame(
      GameState.get('totalScore'),
      GameState.get('roundScores'),
      'multiplayer'
    );

    UI.showFinalResults();
    UI.showMultiplayerLeaderboard(data.leaderboard);
  }

  /* ══════════════════════════════════════
     Bootstrap
     ══════════════════════════════════════ */

  // Start the app when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init };
})();
