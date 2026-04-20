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
      _loadRoomList();
    });
    document.getElementById('btn-join-refresh')?.addEventListener('click', _loadRoomList);
    document.getElementById('btn-join-cancel')?.addEventListener('click', () => UI.hideModal('modal-join'));
    document.getElementById('btn-stats')?.addEventListener('click', () => UI.showStats());
    document.getElementById('btn-logout')?.addEventListener('click', handleLogout);
    document.getElementById('btn-lb-toggle')?.addEventListener('click', () => {
      const lb = document.getElementById('game-leaderboard');
      const btn = document.getElementById('btn-lb-toggle');
      if (lb) lb.classList.toggle('collapsed');
      if (btn) btn.textContent = lb?.classList.contains('collapsed') ? '+' : '−';
    });

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

    Network.on('onResolvingPanoramas', (data) => {
      UI.showResolvingProgress(data.found, data.total);
    });

    Network.on('onGameError', (data) => {
      UI.showResolvingProgress(null, null); // hide overlay
      const msg = data?.message || 'Ошибка при старте игры';
      alert(msg);
      // re-enable start button for host
      const btn = document.getElementById('btn-start-game');
      if (btn) { btn.disabled = false; btn.textContent = 'Начать игру'; }
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

    const location = locations[round];
    if (!location) return;

    let foundLocation = null;

    if (location.imageId) {
      // Server already resolved the panorama — just load it directly, no bbox search
      if (_roundGen !== myRound) return;
      const actual = await Panorama.loadById(location.imageId, location.lat, location.lng);
      if (_roundGen !== myRound) return;
      // Use viewer's actual coords (may differ slightly due to moveTo redirect)
      foundLocation = { ...location, lat: actual?.lat ?? location.lat, lng: actual?.lng ?? location.lng };
    } else {
      // Fallback: no imageId (e.g. /api/locations failed, using local pool)
      // Try the scheduled location, then extras spread across the globe
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
          foundLocation = { ...candidate, lat: actual.lat, lng: actual.lng };
          break;
        }
      }

      if (_roundGen !== myRound) return;

      if (!foundLocation) {
        foundLocation = location;
        const fallbackEl = document.getElementById('panorama-fallback');
        const coordsEl  = document.getElementById('fallback-coords');
        if (fallbackEl) fallbackEl.classList.remove('hidden');
        if (coordsEl)   coordsEl.textContent = `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`;
        UI.showPanoramaLoading(false);
      }
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
     Room Browser
     ══════════════════════════════════════ */

  async function _loadRoomList() {
    const serverInput = document.getElementById('join-server-input');
    const serverAddr = serverInput?.value?.trim();
    let url = window.location.origin;
    if (serverAddr) {
      const addr = serverAddr.includes('://') ? serverAddr : `http://${serverAddr}`;
      url = /:\d+/.test(addr.replace('://', '')) ? addr : `${addr}:3000`;
    }

    UI.hideJoinError();
    UI.showRoomList(null);   // loading state

    try {
      const rooms = await Network.getRooms(url);
      UI.showRoomList(rooms, (code) => _joinRoomByCode(code, url));
    } catch (err) {
      UI.showRoomList([]);
      UI.showJoinError('Не удалось подключиться: ' + err.message);
    }
  }

  async function _joinRoomByCode(code, serverUrl) {
    try {
      UI.hideJoinError();
      await Network.connect(serverUrl);
      const result = await Network.joinRoom(code, GameState.get('nickname'));

      GameState.set('mode', 'multiplayer');
      GameState.set('roomCode', result.code);
      GameState.set('isHost', false);

      UI.hideModal('modal-join');
      UI.updateLobby(result.code, result.players, false);
      UI.showScreen('lobby');
    } catch (err) {
      UI.showJoinError(err.message || 'Не удалось войти в комнату');
    }
  }

  /* ══════════════════════════════════════
     Multiplayer — Room Management
     ══════════════════════════════════════ */

  async function handleCreateRoom() {
    try {
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

  async function handleJoinRoom() { /* no-op: replaced by room browser */ }

  async function handleStartMultiplayer() {
    const btn = document.getElementById('btn-start-game');
    if (btn) { btn.disabled = true; btn.textContent = 'Запуск…'; }
    try {
      await Network.startGame();
      // server now resolving panoramas — progress shown via onResolvingPanoramas
    } catch (err) {
      console.error('Failed to start game:', err);
      alert('Ошибка: ' + err.message);
      if (btn) { btn.disabled = false; btn.textContent = 'Начать игру'; }
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

    // Show leaderboard panel on first round (or keep visible)
    if (data.round === 1) {
      UI.showInGameLeaderboard(data.players ?? []);
    }

    // In multiplayer the server has already resolved the imageId —
    // clients NEVER make bbox search requests.
    if (data.imageId) {
      await Panorama.loadById(data.imageId, loc.lat, loc.lng);
    } else {
      // Server couldn't find a panorama; show placeholder message.
      Panorama.reset();
      const panoContainer = document.getElementById('panorama-container');
      if (panoContainer) {
        panoContainer.innerHTML = '<div class="pano-no-image">⚠️ Панорама не найдена — воспользуйтесь картой</div>';
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
    UI.updateInGameLeaderboard(data.results);
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
