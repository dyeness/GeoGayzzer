/**
 * UI — screen management, modal control, and DOM updates.
 */

const UI = (() => {
  /* ── Screen Management ── */

  const screens = {
    login:  document.getElementById('screen-login'),
    menu:   document.getElementById('screen-menu'),
    lobby:  document.getElementById('screen-lobby'),
    stats:  document.getElementById('screen-stats'),
    game:   document.getElementById('screen-game'),
    result: document.getElementById('screen-result'),
    final:  document.getElementById('screen-final'),
  };

  function showScreen(name) {
    Object.values(screens).forEach((s) => s?.classList.remove('active'));
    if (screens[name]) {
      screens[name].classList.add('active');
    }

    // Invalidate maps when game screen is shown
    if (name === 'game') {
      setTimeout(() => GameMap.invalidateAll(), 150);
    }
    if (name === 'result') {
      setTimeout(() => GameMap.invalidateResultMap(), 200);
    }
  }

  /* ── Modal Management ── */

  function showModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'flex';
  }

  function hideModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
  }

  /* ── Panorama Loading ── */

  function showPanoramaLoading(show) {
    const el = document.getElementById('panorama-loading');
    if (el) {
      el.classList.toggle('hidden', !show);
    }
  }

  /* ── HUD Updates ── */

  function updateHUD() {
    const roundNum = document.getElementById('hud-round-num');
    const roundTotal = document.getElementById('hud-round-total');
    const totalScore = document.getElementById('hud-total-score');

    if (roundNum)   roundNum.textContent = GameState.get('currentRound') + 1;
    if (roundTotal) roundTotal.textContent = GameState.get('totalRounds');
    if (totalScore) totalScore.textContent = GameState.get('totalScore').toLocaleString();
  }

  function updateMultiplayerHUD(guessed, total) {
    const badge = document.getElementById('hud-guessed-badge');
    if (badge) {
      badge.textContent = guessed + '/' + total + ' угадали';
      badge.style.display = 'inline';
    }
  }

  function hideMultiplayerHUD() {
    const badge = document.getElementById('hud-guessed-badge');
    if (badge) badge.style.display = 'none';
  }

  /* ── Menu Screen ── */

  function updateMenuNickname(nickname) {
    const el = document.getElementById('menu-nickname');
    if (el) el.textContent = nickname;
  }

  /* ── Lobby Screen ── */

  function updateLobby(code, players, isHost) {
    const codeEl = document.getElementById('lobby-room-code');
    const countEl = document.getElementById('lobby-player-count');
    const listEl = document.getElementById('lobby-player-list');
    const startBtn = document.getElementById('btn-start-game');
    const waitMsg = document.getElementById('lobby-wait-msg');

    if (codeEl) codeEl.textContent = code;
    if (countEl) countEl.textContent = `(${players.length}/10)`;

    if (listEl) {
      listEl.innerHTML = players.map((p) => `
        <li>
          <span>${escapeHtml(p.nickname)}</span>
          ${p.isHost ? '<span class="host-badge">Хост</span>' : ''}
        </li>
      `).join('');
    }

    if (startBtn) startBtn.style.display = isHost ? 'block' : 'none';
    if (waitMsg)  waitMsg.style.display = isHost ? 'none' : 'block';
  }

  /* ── Result Screen (fullscreen) ── */

  function showRoundResult(location, distance, score, guessLat, guessLng) {
    const nameEl    = document.getElementById('result-location-name');
    const distEl    = document.getElementById('result-distance');
    const ptsEl     = document.getElementById('result-points');
    const totalEl   = document.getElementById('result-total-running');
    const btnNext   = document.getElementById('btn-next-round');

    if (nameEl) {
      nameEl.textContent = location.name
        ? `${location.name}, ${location.country}`
        : `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`;
    }
    if (distEl)  distEl.textContent  = Scoring.formatDistance(distance);
    if (ptsEl)   ptsEl.textContent   = `+${score.toLocaleString()}`;
    if (totalEl) totalEl.textContent = GameState.get('totalScore').toLocaleString();

    if (btnNext) {
      btnNext.textContent = GameState.isGameOver()
        ? '🏆 Показать итоги'
        : 'Следующий раунд →';
    }

    // Show fullscreen result screen
    showScreen('result');

    // Init result map and draw lines after screen is visible
    setTimeout(() => {
      GameMap.initResultMap();
      GameMap.showResult(location.lat, location.lng, guessLat, guessLng);
    }, 250);
  }

  function showMultiplayerRoundResults(results) {
    const container = document.getElementById('result-multiplayer');
    const list = document.getElementById('result-player-list');

    if (!container || !list) return;
    container.style.display = 'block';

    list.innerHTML = results.map((r) => `
      <li>
        <span>${escapeHtml(r.nickname)}</span>
        <span>${r.score.toLocaleString()} pts (${r.distance !== null ? Scoring.formatDistance(r.distance) : '—'})</span>
      </li>
    `).join('');
  }

  function hideMultiplayerRoundResults() {
    const container = document.getElementById('result-multiplayer');
    if (container) container.style.display = 'none';
  }

  /* ── Final Results Screen ── */

  function showFinalResults() {
    const totalEl  = document.getElementById('final-total-score');
    const ratingEl = document.getElementById('final-rating');
    const listEl   = document.getElementById('final-rounds-list');

    const totalScore = GameState.get('totalScore');
    const locations  = GameState.get('locations');
    const scores     = GameState.get('roundScores');
    const distances  = GameState.get('roundDistances');

    if (totalEl)  totalEl.textContent  = totalScore.toLocaleString();
    if (ratingEl) ratingEl.textContent = Scoring.getRating(totalScore);

    if (listEl) {
      listEl.innerHTML = scores.map((score, i) => {
        const loc = locations[i];
        const dist = distances[i];
        return `
          <div class="round-item">
            <div class="round-item-info">
              <span class="round-item-name">${loc ? `${loc.name}, ${loc.country}` : `Раунд ${i + 1}`}</span>
              <span class="round-item-distance">${Scoring.formatDistance(dist)}</span>
            </div>
            <span class="round-item-score">${score.toLocaleString()}</span>
          </div>
        `;
      }).join('');
    }

    showScreen('final');
  }

  function showMultiplayerLeaderboard(leaderboard) {
    const container = document.getElementById('final-leaderboard');
    const list = document.getElementById('final-leaderboard-list');

    if (!container || !list) return;
    container.style.display = 'block';

    list.innerHTML = leaderboard.map((p) => `
      <li>
        <span class="lb-name">${escapeHtml(p.nickname)}</span>
        <span class="lb-score">${p.totalScore.toLocaleString()} pts</span>
      </li>
    `).join('');
  }

  function hideMultiplayerLeaderboard() {
    const container = document.getElementById('final-leaderboard');
    if (container) container.style.display = 'none';
  }

  /* ── Stats Screen ── */

  function showStats() {
    const stats = Player.getStats();

    document.getElementById('stats-nickname').textContent = GameState.get('nickname');
    document.getElementById('stat-games').textContent = stats.gamesPlayed;
    document.getElementById('stat-avg').textContent = stats.averageScore.toLocaleString();
    document.getElementById('stat-best').textContent = stats.bestGame.toLocaleString();
    document.getElementById('stat-best-round').textContent = stats.bestRound.toLocaleString();

    const historyEl = document.getElementById('stats-history-list');
    if (historyEl) {
      if (stats.history.length === 0) {
        historyEl.innerHTML = '<p class="text-muted">Пока нет игр</p>';
      } else {
        historyEl.innerHTML = stats.history.map((g) => {
          const date = new Date(g.date).toLocaleDateString('ru-RU');
          return `
            <div class="history-item">
              <span>${date} — ${g.mode === 'multiplayer' ? '👥' : '🎯'}</span>
              <strong>${g.score.toLocaleString()} pts</strong>
            </div>
          `;
        }).join('');
      }
    }

    showScreen('stats');
  }

  /* ── Join Modal ── */

  function showJoinError(msg) {
    const el = document.getElementById('join-error');
    if (el) {
      el.textContent = msg;
      el.style.display = 'block';
    }
  }

  function hideJoinError() {
    const el = document.getElementById('join-error');
    if (el) el.style.display = 'none';
  }

  /** Show/hide full-screen loading overlay for solo game */
  function showSoloLoading(show, text) {
    const overlay = document.getElementById('solo-loading-overlay');
    if (!overlay) return;
    overlay.classList.toggle('hidden', !show);
    if (show && text) {
      const t = document.getElementById('solo-loading-text');
      if (t) t.textContent = text;
    }
  }

  function updateSoloLoadingProgress(found, total) {
    const bar = document.getElementById('solo-loading-bar');
    const text = document.getElementById('solo-loading-text');
    if (bar) bar.style.width = total > 0 ? Math.round(found / total * 100) + '%' : '0%';
    if (text) text.textContent = 'Поиск панорам… ' + found + '/' + total;
  }

  /** Show/hide the "resolving panoramas" progress overlay in the lobby.
   * @param {number|null} found  null = hide overlay
   * @param {number|null} total
   */
  function showResolvingProgress(found, total) {
    const overlay = document.getElementById('resolving-overlay');
    const bar = document.getElementById('resolving-bar');
    const text = document.getElementById('resolving-text');
    if (!overlay) return;

    if (found === null) {
      overlay.classList.add('hidden');
      return;
    }

    overlay.classList.remove('hidden');
    const pct = total > 0 ? Math.round((found / total) * 100) : 0;
    if (bar) bar.style.width = `${pct}%`;
    if (text) text.textContent = `Поиск панорам ${found}/${total}…`;
  }

  /**
   * Render the room list inside #room-list-container.
   * @param {Array|null} rooms  null = loading, [] = empty, [{code,host,playerCount}] = list
   * @param {function}   onJoin  called with room code when user clicks Join
   */
  function showRoomList(rooms, onJoin) {
    const container = document.getElementById('room-list-container');
    if (!container) return;

    if (rooms === null) {
      container.innerHTML = '<p class="room-list-empty">Загрузка...</p>';
      return;
    }
    if (rooms.length === 0) {
      container.innerHTML = '<p class="room-list-empty">Открытых комнат нет. Создай свою!</p>';
      return;
    }

    container.innerHTML = rooms.map(r => `
      <div class="room-item" data-code="${escapeHtml(r.code)}">
        <div class="room-item-info">
          <span class="room-host">${escapeHtml(r.host)}</span>
          <span class="room-players">${r.playerCount} / 10 игроков</span>
        </div>
        <button class="btn btn-sm btn-primary room-join-btn">Войти</button>
      </div>
    `).join('');

    container.querySelectorAll('.room-join-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const code = btn.closest('.room-item')?.dataset.code;
        if (code) onJoin(code);
      });
    });
  }

  /** Show the in-game leaderboard panel (multiplayer) */
  function showInGameLeaderboard(players) {
    const panel = document.getElementById('game-leaderboard');
    if (panel) panel.classList.remove('hidden');
    if (players?.length) updateInGameLeaderboard(players);
  }

  /** Update the leaderboard list with round-results data */
  function updateInGameLeaderboard(results) {
    const list = document.getElementById('game-lb-list');
    if (!list) return;

    const sorted = [...results].sort((a, b) => b.totalScore - a.totalScore);
    list.innerHTML = sorted.map((r, i) => `
      <li class="game-lb-item${i === 0 ? ' game-lb-leader' : ''}">
        <span class="game-lb-rank">${i + 1}</span>
        <span class="game-lb-nick">${escapeHtml(r.nickname)}</span>
        <span class="game-lb-score">${r.totalScore.toLocaleString()}</span>
      </li>
    `).join('');
  }

  /* ── Utilities ── */

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return {
    showScreen,
    showModal,
    hideModal,
    showPanoramaLoading,
    updateHUD,
    updateMultiplayerHUD,
    hideMultiplayerHUD,
    updateMenuNickname,
    updateLobby,
    showRoundResult,
    showMultiplayerRoundResults,
    hideMultiplayerRoundResults,
    showFinalResults,
    showMultiplayerLeaderboard,
    hideMultiplayerLeaderboard,
    showStats,
    showJoinError,
    hideJoinError,
    showRoomList,
    showResolvingProgress,
    showInGameLeaderboard,
    updateInGameLeaderboard,
    showSoloLoading,
    updateSoloLoadingProgress,
    escapeHtml,
  };
})();
