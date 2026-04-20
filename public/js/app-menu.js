/**
 * app-menu.js — Menu page logic.
 * Handles main menu, stats, create/join room navigation.
 */
(() => {
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

  async function _loadLeaderboard() {
    try {
      const lb = await fetch('/api/leaderboard').then(r => r.json());
      UI.showMenuLeaderboard(lb);
    } catch { /* ignore */ }
  }

  async function _loadRoomList(serverUrl) {
    UI.hideJoinError();
    UI.showRoomList(null);
    try {
      const rooms = await Network.getRooms(serverUrl);
      UI.showRoomList(rooms, (code) => _joinRoom(code, serverUrl));
    } catch (err) {
      UI.showRoomList([]);
      UI.showJoinError('Не удалось подключиться: ' + err.message);
    }
  }

  async function _joinRoom(code, serverUrl) {
    try {
      UI.hideJoinError();
      const nick  = Player.getNickname();
      const color = Player.getColor() || '#4fc3f7';
      await Network.connect(serverUrl || window.location.origin);
      const result = await Network.joinRoom(code, nick, color);
      window.location.href = '/lobby/' + result.code;
    } catch (err) {
      UI.showJoinError(err.message || 'Не удалось войти в комнату');
    }
  }

  async function handleCreateRoom() {
    try {
      const nick  = Player.getNickname();
      const color = Player.getColor() || '#4fc3f7';
      await Network.connect(window.location.origin);
      const result = await Network.createRoom(nick, color);
      window.location.href = '/lobby/' + result.code;
    } catch (err) {
      alert('Не удалось создать комнату: ' + err.message);
    }
  }

  function handleLogout() {
    Player.logout();
    window.location.href = '/login';
  }

  function init() {
    const nick  = Player.getNickname();
    const token = Player.getToken();
    if (!nick || !token) {
      window.location.replace('/login');
      return;
    }

    UI.updateMenuNickname(nick);
    _loadLeaderboard();

    // ── Menu ──
    document.getElementById('btn-solo')?.addEventListener('click', () => {
      window.location.href = '/game/solo';
    });
    document.getElementById('btn-create-room')?.addEventListener('click', handleCreateRoom);
    document.getElementById('btn-join-room')?.addEventListener('click', () => {
      UI.hideJoinError();
      UI.showModal('modal-join');
      _loadRoomList(window.location.origin);
    });
    document.getElementById('btn-join-refresh')?.addEventListener('click', () => {
      const serverInput = document.getElementById('join-server-input');
      const serverAddr  = serverInput?.value?.trim();
      let url = window.location.origin;
      if (serverAddr) {
        const addr = serverAddr.includes('://') ? serverAddr : `http://${serverAddr}`;
        url = /:\d+/.test(addr.replace('://', '')) ? addr : `${addr}:3000`;
      }
      _loadRoomList(url);
    });
    document.getElementById('btn-join-cancel')?.addEventListener('click', () => UI.hideModal('modal-join'));
    document.getElementById('btn-stats')?.addEventListener('click', () => UI.showStats());
    document.getElementById('btn-stats-back')?.addEventListener('click', () => {
      document.getElementById('screen-stats')?.classList.remove('active');
      document.getElementById('screen-menu')?.classList.add('active');
    });
    document.getElementById('btn-logout')?.addEventListener('click', handleLogout);
    document.getElementById('btn-lb-refresh')?.addEventListener('click', _loadLeaderboard);

    // ── Preload ──
    document.getElementById('btn-preload')?.addEventListener('click', async () => {
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
          badge.className   = 'preload-badge ' + (s.running ? 'preload-badge-running' : 'preload-badge-idle');
        }
        document.getElementById('btn-preload-start').disabled = s.running;
        document.getElementById('btn-preload-stop').disabled  = !s.running;
        const sel = document.getElementById('preload-zone-select');
        if (sel && zones.length && sel.options.length <= 1) {
          zones.forEach(z => {
            const opt = document.createElement('option');
            opt.value = z.index; opt.textContent = z.name;
            sel.appendChild(opt);
          });
        }
      } catch { /* ignore */ }
      UI.showModal('modal-preload');
    });
    document.getElementById('btn-preload-close')?.addEventListener('click', () => UI.hideModal('modal-preload'));
    document.getElementById('btn-preload-start')?.addEventListener('click', async () => {
      const sel = document.getElementById('preload-zone-select');
      const zoneVal = sel?.value !== '' ? parseInt(sel.value, 10) : null;
      await fetch('/api/preload/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(zoneVal !== null ? { zone: zoneVal } : {}),
      });
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
