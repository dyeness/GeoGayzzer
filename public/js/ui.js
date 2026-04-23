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
      listEl.innerHTML = players.map((p) => {
        const prestige = (p.prestige || 0) > 0
          ? ` <span class="prestige-sm">[${p.prestige}\ud83d\udc8e]</span>`
          : '';
        const meta = `<span class="lobby-player-meta">Ур. ${p.level ?? 1} &middot; ${eloBadge(p.elo ?? 1000)}</span>`;
        return `
        <li>
          <span class="player-color-dot" style="background:${p.color || '#4fc3f7'}"></span>
          <span class="lobby-player-name">${escapeHtml(p.nickname)}${prestige}</span>
          ${meta}
          ${p.isHost ? '<span class="host-badge">\u0425\u043e\u0441\u0442</span>' : ''}
          ${p.isReady ? '<span class="ready-badge">\u2705</span>' : ''}
        </li>`;
      }).join('');
    }

    if (startBtn) startBtn.style.display = isHost ? 'block' : 'none';
    if (waitMsg)  waitMsg.style.display = isHost ? 'none' : 'block';
    const excludeRow = document.getElementById('exclude-pano-row');
    if (excludeRow) excludeRow.style.display = isHost ? 'block' : 'none';
  }

  /* ── Result Screen (fullscreen) ── */

  function showRoundResult(location, distance, score, guessLat, guessLng) {
    const nameEl    = document.getElementById('result-location-name');
    const distEl    = document.getElementById('result-distance');
    const ptsEl     = document.getElementById('result-points');
    const totalEl   = document.getElementById('result-total-running');
    const btnNext   = document.getElementById('btn-next-round');
    const linkEl    = document.getElementById('result-panorama-link');

    if (nameEl) {
      nameEl.textContent = location.name
        ? `${location.name}, ${location.country}`
        : `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`;
    }
    if (distEl)  distEl.textContent  = Scoring.formatDistance(distance);
    if (ptsEl)   ptsEl.textContent   = `+${score.toLocaleString()}`;
    if (totalEl) totalEl.textContent = GameState.get('totalScore').toLocaleString();

    // Mapillary link
    if (linkEl) {
      if (location.imageId) {
        const url = `https://www.mapillary.com/app/?pKey=${encodeURIComponent(location.imageId)}`;
        linkEl.innerHTML =
          `<a href="${url}" target="_blank" rel="noopener" class="mapillary-link">` +
          `🌏 Посмотреть панораму на Mapillary</a>`;
      } else {
        linkEl.innerHTML = '';
      }
    }

    if (btnNext) {
      btnNext.textContent = GameState.isGameOver()
        ? '🏆 Показать итоги'
        : 'Следующий раунд →';
    }

    showScreen('result');

    setTimeout(() => {
      GameMap.initResultMap();
      GameMap.showResult(location.lat, location.lng, guessLat, guessLng);
    }, 250);
  }

  function showMultiplayerRoundResults(results, location) {
    const container = document.getElementById('result-multiplayer');
    const list = document.getElementById('result-player-list');

    if (!container || !list) return;
    container.style.display = 'block';

    list.innerHTML = results.map((r) => {
      const stealBadge = r.stolen > 0
        ? `<span class="steal-badge">+${r.stolen.toLocaleString()} 🗡️</span>`
        : '';
      const dist = r.distance !== null ? Scoring.formatDistance(r.distance) : '—';
      return `
        <li>
          <span class="result-player-dot" style="background:${r.color || '#4fc3f7'}"></span>
          <span class="result-player-nick">${escapeHtml(r.nickname)}</span>
          <span class="result-player-score">${r.score.toLocaleString()} pts (${dist})${stealBadge}</span>
        </li>`;
    }).join('');

    // Mapillary link below the player list
    const linkEl = document.getElementById('result-panorama-link');
    if (linkEl && location?.imageId) {
      const url = `https://www.mapillary.com/app/?pKey=${encodeURIComponent(location.imageId)}`;
      linkEl.innerHTML =
        `<a href="${url}" target="_blank" rel="noopener" class="mapillary-link">` +
        `🌏 Посмотреть панораму на Mapillary</a>`;
    }
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

  function showMultiplayerLeaderboard(leaderboard, eloChanges = {}, avgElo) {
    const container = document.getElementById('final-leaderboard');
    const list = document.getElementById('final-leaderboard-list');

    if (!container || !list) return;
    container.style.display = 'block';

    // Average ELO subtitle
    const heading = container.querySelector('h3');
    if (heading) {
      const avgPart = avgElo ? ` <span class="lb-avg-elo">Ср. ЭЛО: ${avgElo}</span>` : '';
      heading.innerHTML = `🏅 Таблица лидеров${avgPart}`;
    }

    list.innerHTML = leaderboard.map((p, i) => {
      const medal = ['\ud83e\udd47', '\ud83e\udd48', '\ud83e\udd49'][i] || '';
      const profileUrl = '/profile/' + encodeURIComponent(p.nickname);
      const delta = eloChanges[p.nickname];
      const eloHtml = (delta !== undefined && p.elo != null)
        ? eloBadge(p.elo, delta)
        : (p.elo != null ? eloBadge(p.elo) : '');
      return `
      <li>
        ${p.color ? `<span class="player-color-dot" style="background:${p.color}"></span>` : ''}
        <span class="lb-name">
          ${medal ? `<span class="lb-medal">${medal}</span>` : ''}
          <a href="${profileUrl}" class="lb-profile-link">${escapeHtml(p.nickname)}</a>
        </span>
        <span class="lb-score">${p.totalScore.toLocaleString()} pts</span>
        ${eloHtml}
      </li>`;
    }).join('');
  }

  function hideMultiplayerLeaderboard() {
    const container = document.getElementById('final-leaderboard');
    if (container) container.style.display = 'none';
  }

  /* ── Players Screen ── */

  async function showStats() {
    showScreen('stats');
    const list = document.getElementById('players-list');
    if (!list) return;
    list.innerHTML = '<p class="menu-lb-empty">Загрузка...</p>';
    try {
      const profiles = await fetch('/api/profiles').then(r => r.json());
      // Sort by ELO desc
      profiles.sort((a, b) => (b.elo ?? 1000) - (a.elo ?? 1000));
      if (!profiles.length) {
        list.innerHTML = '<p class="menu-lb-empty">Нет игроков</p>';
        return;
      }
      list.innerHTML = profiles.map((p, i) => {
        const elo = p.elo ?? 1000;
        const eloCls = elo >= 1500 ? 'elo-tier-diamond' : elo >= 1350 ? 'elo-tier-platinum' : elo >= 1250 ? 'elo-tier-gold' : elo >= 1150 ? 'elo-tier-silver' : elo >= 1000 ? '' : elo >= 900 ? 'elo-tier-bronze' : 'elo-tier-iron';
        const profileUrl = '/profile/' + encodeURIComponent(p.nickname);
        const avatarLetter = p.nickname.charAt(0).toUpperCase();
        const rankDisplay = i < 3
          ? ['🥇', '🥈', '🥉'][i]
          : `${i + 1}`;
        const prestige = p.prestige > 0 ? `<span class="player-row-prestige">${p.prestige}💎</span>` : '';
        return `<a href="${profileUrl}" class="player-row" style="text-decoration:none;color:inherit;">
          <span class="player-row-rank${i < 3 ? '-medal' : ''}">${rankDisplay}</span>
          <span class="player-row-avatar">${escapeHtml(avatarLetter)}</span>
          <span class="player-row-info">
            <span class="player-row-nick">${escapeHtml(p.nickname)}${prestige}</span>
            <span class="player-row-sub">Ур. ${p.level} · ${p.gamesPlayed} игр · ${(p.totalXp || 0).toLocaleString()} XP</span>
          </span>
          <span class="player-row-elo ${eloCls}">${elo.toLocaleString()} ЭЛО</span>
        </a>`;
      }).join('');
    } catch {
      list.innerHTML = '<p class="menu-lb-empty">Ошибка загрузки</p>';
    }
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

  /* ── Menu Leaderboard ── */

  function showMenuLeaderboard(entries) {
    const list = document.getElementById('menu-lb-list');
    if (!list) return;
    if (!entries || entries.length === 0) {
      list.innerHTML = '<li class="menu-lb-empty">Пока нет результатов</li>';
      return;
    }
    list.innerHTML = entries.slice(0, 10).map((e, i) => {
      const modeIcon = e.mode === 'multiplayer' ? '👥' : '🎯';
      return `<li>
        <span class="menu-lb-rank">${i + 1}.</span>
        <span class="menu-lb-name">${escapeHtml(e.nickname)}</span>
        <span class="menu-lb-mode">${modeIcon}</span>
        <span class="menu-lb-score">${e.score.toLocaleString()}</span>
      </li>`;
    }).join('');
  }

  /* ── Ready Status (result screen) ── */

  function showReadyStatus(readyCount, total) {
    const el = document.getElementById('ready-status');
    const txt = document.getElementById('ready-count-text');
    if (el) el.style.display = 'block';
    if (txt) txt.textContent = `${readyCount}/${total} готовы`;
  }

  function hideReadyStatus() {
    const el = document.getElementById('ready-status');
    if (el) el.style.display = 'none';
  }

  /** Show/hide and enable/disable the "Ready" button on the result screen. */
  function showReadyButton(enabled) {
    const btn = document.getElementById('btn-next-round');
    if (!btn) return;
    const mode = GameState.get('mode');
    if (mode === 'multiplayer') {
      btn.textContent = enabled ? '✅ Готов' : '⏳ Ожидание...';
      btn.disabled = !enabled;
    }
  }

  /* ── In-game leaderboard with color ── */
  function showInGameLeaderboard(players) {
    const panel = document.getElementById('game-leaderboard');
    if (panel) panel.classList.remove('hidden');
    if (players && players.length > 0) updateInGameLeaderboard(players);
  }

  /** Update the leaderboard list with round-results data */
  function updateInGameLeaderboard(results) {
    const list = document.getElementById('game-lb-list');
    if (!list) return;

    const sorted = [...results].sort((a, b) => b.totalScore - a.totalScore);
    list.innerHTML = sorted.map((r, i) => `
      <li class="game-lb-item${i === 0 ? ' game-lb-leader' : ''}">
        <span class="game-lb-rank">${i + 1}</span>
        ${r.color ? `<span class="game-lb-dot" style="background:${r.color}"></span>` : ''}
        <span class="game-lb-nick">${escapeHtml(r.nickname)}${r.elo != null ? `<span class="game-lb-elo"> ${r.elo} ЭЛО</span>` : ''}</span>
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

  /**
   * Генерирует HTML единого .elo-badge.
   * @param {number} elo         — текущее ЭЛО игрока
   * @param {number|null} delta  — изменение за матч (опционально)
   * @returns {string} HTML-строка
   */
  function eloBadge(elo, delta = null) {
    const tierCls = elo >= 1500 ? 'elo-tier-diamond'
                  : elo >= 1350 ? 'elo-tier-platinum'
                  : elo >= 1250 ? 'elo-tier-gold'
                  : elo >= 1150 ? 'elo-tier-silver'
                  : elo >= 1000 ? ''
                  : elo >= 900  ? 'elo-tier-bronze'
                  : 'elo-tier-iron';
    let deltaHtml = '';
    if (delta !== null && delta !== undefined) {
      const sign = delta > 0 ? '+' : '';
      const cls  = delta > 0 ? 'gain' : delta < 0 ? 'loss' : 'zero';
      deltaHtml = `<span class="elo-delta ${cls}">${sign}${delta}</span><span class="elo-sep">→</span>`;
    }
    return `<span class="elo-badge ${tierCls}">${deltaHtml}${elo}&nbsp;ЭЛО</span>`;
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
    showMenuLeaderboard,
    showReadyStatus,
    hideReadyStatus,
    showReadyButton,
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
    eloBadge,
  };
})();
