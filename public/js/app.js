/**
 * App — main game orchestrator.
 * Wires together all modules and handles the game flow.
 */

const App = (() => {
  // Generation counter — incremented on every new startRound() call.
  // Lets async operations detect they've been superseded by a newer round.
  let _roundGen = 0;
  let _preloadPollTimer = null;

  function _startPreloadPoll() {
    _stopPreloadPoll();
    _preloadPollTimer = setInterval(async () => {
      try {
        const s = await fetch('/api/preload/status').then(r => r.json());
        const el = document.getElementById('preload-count');
        if (el) el.textContent = s.count;
        if (!s.running) {
          _stopPreloadPoll();
          document.getElementById('btn-preload-start').disabled = false;
          document.getElementById('btn-preload-stop').disabled  = true;
          const badge = document.getElementById('preload-status-badge');
          if (badge) { badge.textContent = 'Остановлено'; badge.className = 'preload-badge preload-badge-idle'; }
        }
      } catch(e) { /* ignore */ }
    }, 2000);
  }

  function _stopPreloadPoll() {
    if (_preloadPollTimer) { clearInterval(_preloadPollTimer); _preloadPollTimer = null; }
  }

  /* ══════════════════════════════════════
     Initialization
     ══════════════════════════════════════ */

  async function init() {
    // Wait for API config to load
    await GameConfig.ready;

    // Check for saved session (token + nickname)
    const savedNick = Player.getNickname();
    const savedToken = Player.getToken();
    if (savedNick && savedToken) {
      GameState.set('nickname', savedNick);
      UI.updateMenuNickname(savedNick);
      _restoreSavedColor();

      // Try auto-rejoin if we were in a room before page refresh
      const pendingRoom = sessionStorage.getItem('gg_room');
      const pendingColor = sessionStorage.getItem('gg_color');
      if (pendingRoom) {
        sessionStorage.removeItem('gg_room');
        sessionStorage.removeItem('gg_color');
        await _tryRejoin(pendingRoom, savedNick, pendingColor || Player.getColor() || '#4fc3f7');
      } else {
        UI.showScreen('menu');
        _loadMenuLeaderboard();
      }
    } else {
      UI.showScreen('login');
    }

    bindEvents();
  }

  async function _tryRejoin(code, nickname, color) {
    try {
      await Network.connect(window.location.origin);
      const data = await Network.rejoinRoom(code, nickname, color);
      GameState.set('roomCode', data.code);
      GameState.set('isHost', data.isHost);
      GameState.set('mode', 'multiplayer');

      if (data.status === 'waiting') {
        UI.showScreen('lobby');
        UI.updateLobby(data.players, data.code, data.isHost);
        UI.showScreen('lobby');
      } else if (data.status === 'playing') {
        GameState.set('currentRound', data.round - 1);
        GameState.set('locations', [{ lat: data.location.lat, lng: data.location.lng, imageId: data.imageId }]);
        GameState.set('currentGuess', null);
        UI.showScreen('game');
        UI.hideMultiplayerRoundResults();
        GameMap.initMiniMap();
        GameMap.resetMiniMap();
        UI.updateHUD();
        UI.updateMultiplayerHUD(0, 0);
        if (data.imageId) {
          await Panorama.loadById(data.imageId, data.location.lat, data.location.lng);
          if (!data.alreadyGuessed) Panorama.lockInteraction(1500);
        }
      }
    } catch (err) {
      console.warn('[rejoin] Failed:', err.message);
      UI.showScreen('menu');
      _loadMenuLeaderboard();
    }
  }

  /* ══════════════════════════════════════
     Event Bindings
     ══════════════════════════════════════ */

  function bindEvents() {
    // ─── Login / Register ───
    const nicknameInput = document.getElementById('nickname-input');
    const passwordInput = document.getElementById('password-input');
    const btnLogin = document.getElementById('btn-login');
    const btnRegister = document.getElementById('btn-register');

    function _updateAuthButtons() {
      const ok = nicknameInput.value.trim().length > 0 && passwordInput.value.length > 0;
      if (btnLogin) btnLogin.disabled = !ok;
      if (btnRegister) btnRegister.disabled = !ok;
    }

    nicknameInput?.addEventListener('input', _updateAuthButtons);
    passwordInput?.addEventListener('input', _updateAuthButtons);

    btnLogin?.addEventListener('click', () => handleLogin());
    btnRegister?.addEventListener('click', () => handleRegister());
    passwordInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !btnLogin?.disabled) handleLogin();
    });
    nicknameInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') passwordInput?.focus();
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

    // ─── Preload panoramas ───
    document.getElementById('btn-preload')?.addEventListener('click', async () => {
      // Update count and populate zones before opening
      try {
        const [s, zones] = await Promise.all([
          fetch('/api/preload/status').then(r => r.json()),
          fetch('/api/preload/zones').then(r => r.json()),
        ]);
        const el = document.getElementById('preload-count');
        if (el) el.textContent = s.count;
        const badge = document.getElementById('preload-status-badge');
        if (badge) {
          badge.textContent = s.running ? 'Работает' : 'Остановлено';
          badge.className = 'preload-badge ' + (s.running ? 'preload-badge-running' : 'preload-badge-idle');
        }
        const startBtn = document.getElementById('btn-preload-start');
        const stopBtn  = document.getElementById('btn-preload-stop');
        if (startBtn) startBtn.disabled = s.running;
        if (stopBtn)  stopBtn.disabled  = !s.running;
        // Populate zone selector
        const sel = document.getElementById('preload-zone-select');
        if (sel && zones.length && sel.options.length <= 1) {
          zones.forEach(z => {
            const opt = document.createElement('option');
            opt.value = z.index;
            opt.textContent = z.name;
            sel.appendChild(opt);
          });
        }
      } catch(e) { /* ignore */ }
      UI.showModal('modal-preload');
    });

    document.getElementById('btn-preload-close')?.addEventListener('click', () => UI.hideModal('modal-preload'));

    document.getElementById('btn-preload-start')?.addEventListener('click', async () => {
      const sel = document.getElementById('preload-zone-select');
      const zoneVal = sel?.value !== '' ? parseInt(sel.value, 10) : null;
      const body = JSON.stringify(zoneVal !== null ? { zone: zoneVal } : {});
      await fetch('/api/preload/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      document.getElementById('btn-preload-start').disabled = true;
      document.getElementById('btn-preload-stop').disabled  = false;
      const badge = document.getElementById('preload-status-badge');
      if (badge) { badge.textContent = 'Работает'; badge.className = 'preload-badge preload-badge-running'; }
      _startPreloadPoll();
    });

    document.getElementById('btn-preload-stop')?.addEventListener('click', async () => {
      const res = await fetch('/api/preload/stop', { method: 'POST' }).then(r => r.json());
      document.getElementById('btn-preload-start').disabled = false;
      document.getElementById('btn-preload-stop').disabled  = true;
      const badge = document.getElementById('preload-status-badge');
      if (badge) { badge.textContent = 'Остановлено'; badge.className = 'preload-badge preload-badge-idle'; }
      const el = document.getElementById('preload-count');
      if (el && res.count !== undefined) el.textContent = res.count;
      _stopPreloadPoll();
    });
    document.getElementById('btn-lb-toggle')?.addEventListener('click', () => {
      const lb = document.getElementById('game-leaderboard');
      const btn = document.getElementById('btn-lb-toggle');
      if (lb) lb.classList.toggle('collapsed');
      if (btn) btn.textContent = lb?.classList.contains('collapsed') ? '+' : '−';
    });

    document.getElementById('btn-lb-refresh')?.addEventListener('click', _loadMenuLeaderboard);

    // ─── Color swatches ───
    document.getElementById('color-swatches')?.addEventListener('click', (e) => {
      const swatch = e.target.closest('.color-swatch');
      if (!swatch) return;
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      swatch.classList.add('selected');
      const color = swatch.dataset.color;
      GameState.set('playerColor', color);
      Player.setColor(color);
      // If already in a room, sync color to server immediately
      if (Network.isConnected() && GameState.get('roomCode')) {
        Network.updateColor(color).catch(() => {});
      }
    });

    // ─── Lobby ───
    // Pre-select saved color on lobby screen
    document.getElementById('screen-lobby')?.addEventListener('click', (e) => {
      // handled by color-swatches delegation above
    });
    // Restore saved color swatch on entering lobby
    _restoreSavedColor();
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
      // Show live guess marker on minimap if dev.players is active
      if (window._devPlayers && data.nickname && data.lat != null && data.lng != null) {
        GameMap.updateLiveMarker(data.nickname, data.color, data.lat, data.lng);
      }
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

    Network.on('onReadyUpdate', (data) => {
      UI.showReadyStatus(data.readyCount, data.total);
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

  function _showAuthError(msg) {
    const el = document.getElementById('auth-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }
  function _hideAuthError() {
    const el = document.getElementById('auth-error');
    if (el) el.style.display = 'none';
  }

  function _afterAuthSuccess(nickname) {
    GameState.set('nickname', nickname);
    UI.updateMenuNickname(nickname);
    document.getElementById('nickname-input').value = '';
    document.getElementById('password-input').value = '';
    _hideAuthError();
    UI.showScreen('menu');
    _restoreSavedColor();
    _loadMenuLeaderboard();
  }

  async function handleLogin() {
    const nickname = document.getElementById('nickname-input')?.value?.trim();
    const password = document.getElementById('password-input')?.value;
    if (!nickname || !password) return;
    _hideAuthError();
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname, password }),
      });
      const data = await res.json();
      if (!res.ok) { _showAuthError(data.error || 'Ошибка входа'); return; }
      Player.loginSave(data.nickname, data.token);
      _afterAuthSuccess(data.nickname);
    } catch {
      _showAuthError('Нет соединения с сервером');
    }
  }

  async function handleRegister() {
    const nickname = document.getElementById('nickname-input')?.value?.trim();
    const password = document.getElementById('password-input')?.value;
    if (!nickname || !password) return;
    _hideAuthError();
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname, password }),
      });
      const data = await res.json();
      if (!res.ok) { _showAuthError(data.error || 'Ошибка регистрации'); return; }
      Player.loginSave(data.nickname, data.token);
      _afterAuthSuccess(data.nickname);
    } catch {
      _showAuthError('Нет соединения с сервером');
    }
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

    // Show solo loading animation
    UI.showSoloLoading(true, 'Поиск панорам…');
    UI.updateSoloLoadingProgress(0, 5);

    // Fetch locations from server or use local pool
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
    GameMap.clearLiveMarkers();
    UI.updateHUD();

    const location = locations[round];
    if (!location) return;

    let foundLocation = null;

    if (location.imageId) {
      // Server already resolved the panorama — load it directly.
      // Use the server-provided coords as the scoring point (they come directly from
      // the Mapillary API geometry field and are authoritative).
      // Do NOT overwrite with viewer.getImage() coords — the viewer may redirect
      // to a neighbour image which would shift the scoring point to the wrong place.
      if (_roundGen !== myRound) return;
      await Panorama.loadById(location.imageId, location.lat, location.lng);
      if (_roundGen !== myRound) return;
      Panorama.lockInteraction(1500);
      foundLocation = { ...location };
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
          Panorama.lockInteraction(1500);
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
    const mode = GameState.get('mode');

    if (mode === 'multiplayer') {
      // Always signal ready — server decides next round or game-over
      UI.showReadyButton(false);
      Network.playerReady().catch(console.error);
      return;
    }

    // Solo
    if (GameState.isGameOver()) {
      Player.recordGame(
        GameState.get('totalScore'),
        GameState.get('roundScores'),
        mode
      );
      _submitGameEnd();
      UI.showFinalResults();
      return;
    }

    UI.showScreen('game');
    startRound().catch(console.error);
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
      const color = GameState.get('playerColor') || Player.getColor() || '#4fc3f7';
      await Network.connect(serverUrl);
      const result = await Network.joinRoom(code, GameState.get('nickname'), color);

      GameState.set('mode', 'multiplayer');
      GameState.set('roomCode', result.code);
      GameState.set('isHost', false);
      sessionStorage.setItem('gg_room', result.code);
      sessionStorage.setItem('gg_color', color);

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
      const color = GameState.get('playerColor') || Player.getColor() || '#4fc3f7';
      await Network.connect(window.location.origin);
      const result = await Network.createRoom(GameState.get('nickname'), color);

      GameState.set('mode', 'multiplayer');
      GameState.set('roomCode', result.code);
      GameState.set('isHost', true);
      sessionStorage.setItem('gg_room', result.code);
      sessionStorage.setItem('gg_color', color);

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
      const excludeRaw = document.getElementById('exclude-pano-input')?.value || '';
      const excludeIds = excludeRaw.split(',').map(s => s.trim()).filter(Boolean);
      await Network.startGame(excludeIds);
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
    sessionStorage.removeItem('gg_room');
    sessionStorage.removeItem('gg_color');
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
      Panorama.lockInteraction(1500);
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
    // data: { results, location, round, isLastRound }
    const location = data.location;
    const nickname = GameState.get('nickname');

    const myResult = data.results.find((r) => r.nickname === nickname);
    const guess = myResult?.guess;
    const distance = myResult?.distance ?? 0;
    const score = myResult?.score ?? 0;

    GameState.recordRound(distance, score, guess);

    if (guess) {
      UI.showRoundResult(location, distance, score, guess.lat, guess.lng);
    } else {
      UI.showRoundResult(location, 0, 0, location.lat, location.lng);
    }

    UI.showMultiplayerRoundResults(data.results);
    UI.updateHUD();
    UI.updateInGameLeaderboard(data.results);
    setTimeout(() => GameMap.showMultiplayerGuesses(data.results, nickname), 300);

    // Show ready button for ALL rounds including last
    UI.showReadyButton(true);
    UI.showReadyStatus(0, data.results.length);
    if (data.isLastRound) {
      // Change button label to indicate final screen
      const btn = document.getElementById('btn-next-round');
      if (btn) { btn.textContent = '🏆 Показать итоги'; btn.disabled = false; }
    }
  }

  function handleMultiplayerGameOver(data) {
    sessionStorage.removeItem('gg_room');
    sessionStorage.removeItem('gg_color');
    Player.recordGame(
      GameState.get('totalScore'),
      GameState.get('roundScores'),
      'multiplayer'
    );
    _submitGameEnd();
    UI.showFinalResults();
    UI.showMultiplayerLeaderboard(data.leaderboard);
    UI.hideReadyStatus();
  }

  /* ══════════════════════════════════════
     Game History / Leaderboard
     ══════════════════════════════════════ */

  function _submitGameEnd() {
    const nickname = GameState.get('nickname');
    const totalScore = GameState.get('totalScore');
    const mode = GameState.get('mode') || 'solo';
    const roundScores = GameState.get('roundScores') || [];
    const locations = GameState.get('locations') || [];
    const roundGuesses = GameState.get('roundGuesses') || [];
    const roundDistances = GameState.get('roundDistances') || [];

    fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname, score: totalScore, mode }),
    }).catch(() => {});

    const rounds = roundScores.map((score, i) => ({
      imageId: locations[i]?.imageId || null,
      lat: locations[i]?.lat || null,
      lng: locations[i]?.lng || null,
      guess: roundGuesses[i] || null,
      score,
      distance: roundDistances[i] || null,
    }));
    fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname, mode, totalScore, rounds }),
    }).catch(() => {});
  }

  async function _loadMenuLeaderboard() {
    try {
      const lb = await fetch('/api/leaderboard').then(r => r.json());
      UI.showMenuLeaderboard(lb);
    } catch (e) { /* ignore */ }
  }

  /* ══════════════════════════════════════
     Bootstrap
     ══════════════════════════════════════ */

  // Start the app when DOM is ready
  function _restoreSavedColor() {
    const saved = Player.getColor() || '#4fc3f7';
    GameState.set('playerColor', saved);
    document.querySelectorAll('.color-swatch').forEach(s => {
      s.classList.toggle('selected', s.dataset.color === saved);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init };
})();

/* ── Developer console commands ──
   dev.info    → toggle Mapillary attribution visibility
   dev.players → toggle live guess markers on minimap
*/
window.dev = {
  info() {
    document.body.classList.toggle('dev-info-visible');
    const on = document.body.classList.contains('dev-info-visible');
    console.log(`[dev.info] Mapillary attribution ${on ? '✅ АКТИВИРОВАНА' : '❌ ДЕАКТИВИРОВАНА'}`);
  },
  players() {
    window._devPlayers = !window._devPlayers;
    if (!window._devPlayers) GameMap.clearLiveMarkers();
    console.log(`[dev.players] Маркеры игроков в реальном времени ${window._devPlayers ? '✅ АКТИВИРОВАНЫ' : '❌ ДЕАКТИВИРОВАНЫ'}`);
  },
  target() {
    window._devTarget = !window._devTarget;
    if (!window._devTarget) {
      GameMap.clearDevTarget();
      console.log('[dev.target] ❌ ДЕАКТИВИРОВАНА');
      return;
    }
    const loc = GameState.get('currentLocation');
    if (!loc?.lat || !loc?.lng) {
      window._devTarget = false;
      console.warn('[dev.target] Координаты цели недоступны');
      return;
    }
    GameMap.showDevTarget(loc.lat, loc.lng);
    console.log(`[dev.target] ✅ АКТИВИРОВАНА — ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`);
  },
};
