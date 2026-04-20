/**
 * app-lobby.js — Lobby page logic.
 * Reads room code from URL (/lobby/:code), connects socket, handles lobby state.
 */
(() => {
  const roomCode = window.location.pathname.split('/')[2]?.toUpperCase();

  function _restoreColor() {
    const saved = Player.getColor() || '#4fc3f7';
    GameState.set('playerColor', saved);
    document.querySelectorAll('.color-swatch').forEach(s => {
      s.classList.toggle('selected', s.dataset.color === saved);
    });
  }

  function _bindNetworkEvents() {
    Network.on('onPlayerJoined', (data) => {
      UI.updateLobby(roomCode, data.players, GameState.get('isHost'));
    });
    Network.on('onPlayerLeft', (data) => {
      UI.updateLobby(roomCode, data.players, GameState.get('isHost'));
    });
    // Game started — navigate everyone to game page
    Network.on('onRoundStart', () => {
      window.location.href = '/game/' + roomCode;
    });
    Network.on('onResolvingPanoramas', (data) => {
      UI.showResolvingProgress(data.found, data.total);
    });
    Network.on('onGameError', (data) => {
      UI.showResolvingProgress(null, null);
      const btn = document.getElementById('btn-start-game');
      if (btn) { btn.disabled = false; btn.textContent = 'Начать игру'; }
      alert(data?.message || 'Ошибка при старте игры');
    });
  }

  function _bindUiEvents() {
    // Color swatches
    document.getElementById('color-swatches')?.addEventListener('click', (e) => {
      const swatch = e.target.closest('.color-swatch');
      if (!swatch) return;
      const color = swatch.dataset.color;
      GameState.set('playerColor', color);
      Player.setColor(color);
      document.querySelectorAll('.color-swatch').forEach(s =>
        s.classList.toggle('selected', s.dataset.color === color)
      );
      Network.updateColor(color).catch(() => {});
    });

    document.getElementById('btn-start-game')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-start-game');
      if (btn) { btn.disabled = true; btn.textContent = 'Запуск…'; }
      try {
        const excludeRaw = document.getElementById('exclude-pano-input')?.value || '';
        const excludeIds = excludeRaw.split(',').map(s => s.trim()).filter(Boolean);
        await Network.startGame(excludeIds);
      } catch (err) {
        alert('Ошибка: ' + err.message);
        if (btn) { btn.disabled = false; btn.textContent = 'Начать игру'; }
      }
    });

    document.getElementById('btn-leave-lobby')?.addEventListener('click', () => {
      Network.disconnect();
      window.location.href = '/menu';
    });

    document.getElementById('btn-copy-code')?.addEventListener('click', () => {
      navigator.clipboard?.writeText(roomCode);
    });
  }

  async function init() {
    if (!roomCode) { window.location.replace('/menu'); return; }

    const nick  = Player.getNickname();
    const token = Player.getToken();
    if (!nick || !token) { window.location.replace('/login'); return; }

    const color = Player.getColor() || '#4fc3f7';
    GameState.set('nickname', nick);

    try {
      await Network.connect(window.location.origin);
      const data = await Network.rejoinRoom(roomCode, nick, color);

      if (data.status === 'playing') {
        // Game already in progress — go there
        window.location.replace('/game/' + roomCode);
        return;
      }

      // Waiting in lobby
      GameState.set('roomCode', roomCode);
      GameState.set('isHost', data.isHost);
      GameState.set('mode', 'multiplayer');

      UI.updateLobby(roomCode, data.players, data.isHost);
      _restoreColor();

    } catch (err) {
      console.warn('[lobby] Failed to join room:', err.message);
      window.location.replace('/menu');
      return;
    }

    _bindNetworkEvents();
    _bindUiEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
