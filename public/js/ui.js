/**
 * UI — screen management, modal control, and DOM updates.
 */

const UI = (() => {
  /* ── Banner GIF map (key → URL) ── */
  const BANNER_URL_MAP = {
    city_night:     'https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExaHdocW1zMGp6anV5ODZuYmNnaGZhN3VuaXYzMjdlbHdtcXNjZHFwbyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/jDuKZ5l0ZvPIM3PZz6/giphy.gif',
    rain_window:    'https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExeHRpNzFmaTJlbG96bnl1eTdjcnZscDVxOTdkbmE0OXBpc2M1cThwZyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/u5IJdDXKFfGWi01ydS/giphy.gif',
    forest_fog:     'https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHZoMG9ndXY2bGQ4bnFtbTlnNmZqajdnZGpsMW9obXhuMnUzeXllcyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/C4wk6m8Q04DeDRckhj/giphy.gif',
    ocean_waves:    'https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExc3pqeWlsOGNzbHJpeXI5cGJndXRtZ2MxZTZxcHJ5ZmVqcDVxd3FkbiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/hQIrijIRX3kKvaYaua/giphy.gif',
    neon_city:      'https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExMTkyNzdwZWUxMHBjZTZvd25xemhsYm9zdGEwd2k3MWYxb3pqdGljOSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/lwo2cfTZq6TtsxeeW8/giphy.gif',
    space_drift:    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExYzMzOGhpY3h6ZmN4bDUxMXhibnNxd241cHFzdm04a3I4bnR3bGxlOSZlcD12MV9naWZzX3JlbGF0ZWQmY3Q9Zw/5YOUEDaB3CGNbnsG2i/giphy.gif',
    aurora:         'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExYzMzOGhpY3h6ZmN4bDUxMXhibnNxd241cHFzdm04a3I4bnR3bGxlOSZlcD12MV9naWZzX3JlbGF0ZWQmY3Q9Zw/NrXyKCIbSebv5Sgxpj/giphy.gif',
    desert_dunes:   'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3bGU0eWwzOG9uazAyMWJxenlsOHdmNjUwcGpnaDNvcjFlemczaGszdCZlcD12MV9naWZzX3JlbGF0ZWQmY3Q9Zw/sG0LZNRWqTaijf2EEj/giphy.gif',
    mountain_snow:  'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3bGU0eWwzOG9uazAyMWJxenlsOHdmNjUwcGpnaDNvcjFlemczaGszdCZlcD12MV9naWZzX3JlbGF0ZWQmY3Q9Zw/WQ3Uz2IGuyC4FtrZIn/giphy.gif',
    fireplace:      'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3bGU0eWwzOG9uazAyMWJxenlsOHdmNjUwcGpnaDNvcjFlemczaGszdCZlcD12MV9naWZzX3JlbGF0ZWQmY3Q9Zw/0s0HrYMIlCVqOspDRd/giphy.gif',
    cherry_blossom: 'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3bGU0eWwzOG9uazAyMWJxenlsOHdmNjUwcGpnaDNvcjFlemczaGszdCZlcD12MV9naWZzX3JlbGF0ZWQmY3Q9Zw/JMlIy2LIUY6j8vG4FW/giphy.gif',
  };

  function resolveBannerUrl(key) {
    return key ? (BANNER_URL_MAP[key] || null) : null;
  }
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
      const inTeamMode = !document.getElementById('team-selector')?.classList.contains('hidden');
      listEl.innerHTML = players.map((p) => {
        const prestige = (p.prestige || 0) > 0
          ? ` <span class="prestige-sm">[${p.prestige}\ud83d\udc8e]</span>`
          : '';
        const teamIcon = p.preTeam === 0 ? '<span class="lp-team-icon">\ud83d\udd34</span>'
                       : p.preTeam === 1 ? '<span class="lp-team-icon">\ud83d\udd35</span>'
                       : inTeamMode ? '<span class="lp-team-icon" style="opacity:0.25">\u25e6</span>'
                       : '';
        const badges = (p.isHost ? '<span class="host-badge">\u0425\u043e\u0441\u0442</span>' : '') +
                       (p.isReady ? '<span class="ready-badge">\u2705</span>' : '');
        return `
        <li>
          <div class="lp-left">
            ${teamIcon}
            <span class="player-color-dot" style="background:${p.color || '#4fc3f7'}"></span>
            <span class="lobby-player-name">${escapeHtml(p.nickname)}${prestige}</span>
          </div>
          <div class="lp-right">
            <span class="lobby-player-meta">\u0423\u0440.${p.level ?? 1} &middot; ${eloBadge(p.elo ?? 1000)}</span>
            ${badges}
          </div>
        </li>`;
      }).join('');
    }

    if (startBtn && isHost) {
      const canStart = players.length >= 2;
      startBtn.disabled = !canStart;
      startBtn.title = canStart ? '' : `\u041d\u0443\u0436\u043d\u043e \u043c\u0438\u043d\u0438\u043c\u0443\u043c 2 \u0438\u0433\u0440\u043e\u043a\u0430 (${players.length}/2)`;
    }

    if (startBtn) startBtn.style.display = isHost ? 'block' : 'none';
    if (waitMsg)  waitMsg.style.display = isHost ? 'none' : 'block';
    const excludeRow = document.getElementById('exclude-pano-row');
    if (excludeRow) excludeRow.style.display = isHost ? 'block' : 'none';
    const settingsEl = document.getElementById('lobby-settings');
    if (settingsEl) settingsEl.classList.toggle('hidden', !isHost);
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
      const parts = [];
      if (location.city)    parts.push(location.city);
      else if (location.name) parts.push(location.name);
      if (location.country) parts.push(location.country);
      nameEl.textContent = parts.length > 0
        ? parts.join(', ')
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
      const streakBadge = r.streakBonus > 0
        ? `<span class="streak-badge">🔥 +${r.streakBonus.toLocaleString()}</span>`
        : '';
      const dist = r.distance !== null ? Scoring.formatDistance(r.distance) : '—';
      return `
        <li>
          <span class="result-player-dot" style="background:${r.color || '#4fc3f7'}"></span>
          <span class="result-player-nick">${escapeHtml(r.nickname)}</span>
          <span class="result-player-score">${r.score.toLocaleString()} pts (${dist})${stealBadge}${streakBadge}</span>
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
        let locName;
        if (loc) {
          if (loc.city)         locName = loc.country ? `${loc.city}, ${loc.country}` : loc.city;
          else if (loc.country) locName = loc.country;
          else if (loc.name)    locName = loc.country ? `${loc.name}, ${loc.country}` : loc.name;
          else                  locName = `${loc.lat?.toFixed(4)}, ${loc.lng?.toFixed(4)}`;
        } else {
          locName = `Раунд ${i + 1}`;
        }
        return `
          <div class="round-item">
            <div class="round-item-info">
              <span class="round-item-name">${locName}</span>
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
      const bannerGifUrl = resolveBannerUrl(p.banner || null);
      const bannerBg = bannerGifUrl
        ? `style="--row-banner:url('${bannerGifUrl}')"` : '';
      const bannerCls = bannerGifUrl ? ' has-banner' : '';
      return `
      <li class="lb-row${bannerCls}" ${bannerBg}>
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
        const bannerGifUrl = resolveBannerUrl(p.banner || null);
        const bannerStyle  = bannerGifUrl ? ` --row-banner:url('${bannerGifUrl}')` : '';
        const hasBannerCls = bannerGifUrl ? ' has-banner' : '';
        return `<a href="${profileUrl}" class="player-row${hasBannerCls}" style="text-decoration:none;color:inherit;${bannerStyle}">
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

    const hasTeams = results.some(r => r.team != null);
    if (hasTeams) {
      const teams = [0, 1].map(t => results.filter(r => r.team === t).sort((a, b) => b.totalScore - a.totalScore));
      const teamTotals = [0, 1].map(t => teams[t].reduce((s, r) => s + r.totalScore, 0));
      const TEAM_ICONS  = ['🔴', '🔵'];
      const TEAM_LABELS = ['Красные', 'Синие'];
      const TEAM_COLORS = ['#e53935', '#1e88e5'];
      list.innerHTML = [0, 1].map(t => {
        const members = teams[t].map(r => `
          <li class="game-lb-item game-lb-team-member">
            ${r.color ? `<span class="game-lb-dot" style="background:${r.color}"></span>` : ''}
            <span class="game-lb-nick">${escapeHtml(r.nickname)}${r.elo != null ? `<span class="game-lb-elo"> ${r.elo} ЭЛО</span>` : ''}</span>
            <span class="game-lb-score">${r.totalScore.toLocaleString()}</span>
          </li>`).join('');
        return `<li class="game-lb-team-header" style="color:${TEAM_COLORS[t]}">${TEAM_ICONS[t]} ${TEAM_LABELS[t]}: ${teamTotals[t].toLocaleString()}</li>${members}`;
      }).join('');
    } else {
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

  function startRoundTimer(secs) {
    const el = document.getElementById('hud-timer');
    const secsEl = document.getElementById('hud-timer-secs');
    if (!el || !secsEl) return;
    if (el.dataset.interval) clearInterval(Number(el.dataset.interval));
    if (secs <= 0) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden', 'hud-timer-urgent');
    secsEl.textContent = secs;
    let remaining = secs;
    const iv = setInterval(() => {
      remaining--;
      if (remaining <= 0) { clearInterval(iv); el.classList.add('hidden'); return; }
      secsEl.textContent = remaining;
      if (remaining <= 10) el.classList.add('hud-timer-urgent');
    }, 1000);
    el.dataset.interval = String(iv);
  }

  function clearRoundTimer() {
    const el = document.getElementById('hud-timer');
    if (!el) return;
    if (el.dataset.interval) clearInterval(Number(el.dataset.interval));
    el.classList.add('hidden');
    el.classList.remove('hud-timer-urgent');
  }

  function updateTeamScores(teamScores) {
    const container = document.getElementById('hud-team-scores');
    const t0 = document.getElementById('hud-team-0');
    const t1 = document.getElementById('hud-team-1');
    if (!container || !teamScores) return;
    container.classList.remove('hidden');
    if (t0) t0.textContent = (teamScores[0] || 0).toLocaleString();
    if (t1) t1.textContent = (teamScores[1] || 0).toLocaleString();
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
    startRoundTimer,
    clearRoundTimer,
    updateTeamScores,
  };
})();
