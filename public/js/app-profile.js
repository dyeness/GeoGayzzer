/**
 * app-profile.js — Profile page logic.
 * URL: /profile/:nickname
 */

(function () {
  'use strict';

  /* ── Helpers ───────────────────────────────────────────────────────────── */

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmt(n) {
    return typeof n === 'number' ? n.toLocaleString('ru-RU') : '—';
  }

  function pct(n) {
    return typeof n === 'number' ? n.toFixed(1) + '%' : '—';
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  /** Ordinal for match placement */
  function placement(n) {
    if (n === 1) return '🥇 1-е место';
    if (n === 2) return '🥈 2-е место';
    if (n === 3) return '🥉 3-е место';
    return `${n}-е место`;
  }

  /* ── Tab switching ─────────────────────────────────────────────────────── */

  function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const pane = document.getElementById('tab-' + btn.dataset.tab);
        if (pane) pane.classList.add('active');
      });
    });
  }

  function initInfoModal() {
    const overlay = document.getElementById('xp-modal-overlay');
    const closeBtn = document.getElementById('xp-modal-close');
    const openBtn  = document.getElementById('xp-info-btn');
    if (!overlay) return;
    openBtn?.addEventListener('click', () => overlay.classList.remove('hidden'));
    closeBtn?.addEventListener('click', () => overlay.classList.add('hidden'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.add('hidden');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') overlay.classList.add('hidden');
    });
  }

  /* ── Banner IDs and their GIF URLs ────────────────────────────────────── */
  const BANNER_DEFS = [
    { key: 'city_night',      label: 'Ночной город',    url: 'https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExaHdocW1zMGp6anV5ODZuYmNnaGZhN3VuaXYzMjdlbHdtcXNjZHFwbyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/jDuKZ5l0ZvPIM3PZz6/giphy.gif' },
    { key: 'rain_window',     label: 'Дождь',            url: 'https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExeHRpNzFmaTJlbG96bnl1eTdjcnZscDVxOTdkbmE0OXBpc2M1cThwZyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/u5IJdDXKFfGWi01ydS/giphy.gif' },
    { key: 'forest_fog',      label: 'Туманный лес',    url: 'https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHZoMG9ndXY2bGQ4bnFtbTlnNmZqajdnZGpsMW9obXhuMnUzeXllcyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/C4wk6m8Q04DeDRckhj/giphy.gif' },
    { key: 'ocean_waves',     label: 'Океан',           url: 'https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExc3pqeWlsOGNzbHJpeXI5cGJndXRtZ2MxZTZxcHJ5ZmVqcDVxd3FkbiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/hQIrijIRX3kKvaYaua/giphy.gif' },
    { key: 'neon_city',       label: 'Неон',            url: 'https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExMTkyNzdwZWUxMHBjZTZvd25xemhsYm9zdGEwd2k3MWYxb3pqdGljOSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/lwo2cfTZq6TtsxeeW8/giphy.gif' },
    { key: 'space_drift',     label: 'Космос',          url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExYzMzOGhpY3h6ZmN4bDUxMXhibnNxd241cHFzdm04a3I4bnR3bGxlOSZlcD12MV9naWZzX3JlbGF0ZWQmY3Q9Zw/5YOUEDaB3CGNbnsG2i/giphy.gif' },
    { key: 'aurora',          label: 'Северное сияние', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExYzMzOGhpY3h6ZmN4bDUxMXhibnNxd241cHFzdm04a3I4bnR3bGxlOSZlcD12MV9naWZzX3JlbGF0ZWQmY3Q9Zw/NrXyKCIbSebv5Sgxpj/giphy.gif' },
    { key: 'desert_dunes',    label: 'Пустыня',         url: 'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3bGU0eWwzOG9uazAyMWJxenlsOHdmNjUwcGpnaDNvcjFlemczaGszdCZlcD12MV9naWZzX3JlbGF0ZWQmY3Q9Zw/sG0LZNRWqTaijf2EEj/giphy.gif' },
    { key: 'mountain_snow',   label: 'Горы в снегу',   url: 'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3bGU0eWwzOG9uazAyMWJxenlsOHdmNjUwcGpnaDNvcjFlemczaGszdCZlcD12MV9naWZzX3JlbGF0ZWQmY3Q9Zw/WQ3Uz2IGuyC4FtrZIn/giphy.gif' },
    { key: 'fireplace',       label: 'Камин',           url: 'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3bGU0eWwzOG9uazAyMWJxenlsOHdmNjUwcGpnaDNvcjFlemczaGszdCZlcD12MV9naWZzX3JlbGF0ZWQmY3Q9Zw/0s0HrYMIlCVqOspDRd/giphy.gif' },
    { key: 'cherry_blossom',  label: 'Сакура',          url: 'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3bGU0eWwzOG9uazAyMWJxenlsOHdmNjUwcGpnaDNvcjFlemczaGszdCZlcD12MV9naWZzX3JlbGF0ZWQmY3Q9Zw/JMlIy2LIUY6j8vG4FW/giphy.gif' },
  ];

  /** Return the GIF URL for a given banner key (or null) */
  function bannerUrl(key) {
    if (!key) return null;
    const def = BANNER_DEFS.find(d => d.key === key);
    return def ? def.url : null;
  }

  /** Apply banner visually to header card + full-page bg */
  function _applyBanner(key) {
    const url = bannerUrl(key);
    const pageBg    = document.getElementById('profile-bg-banner');
    const cardBg    = document.getElementById('profile-card-banner');
    const headerCard = document.querySelector('.profile-header-card');
    if (pageBg) {
      pageBg.style.backgroundImage = url ? `url("${url}")` : '';
      pageBg.classList.toggle('active', !!url);
    }
    if (cardBg)   cardBg.style.backgroundImage  = url ? `url("${url}")` : '';
    if (headerCard) headerCard.classList.toggle('has-banner', !!url);
  }

  /** Init banner picker modal */
  function initBannerPicker(currentKey, nickname) {
    const overlay  = document.getElementById('banner-modal-overlay');
    const editBtn  = document.getElementById('btn-edit-banner');
    const closeBtn = document.getElementById('banner-modal-close');
    const saveBtn  = document.getElementById('btn-banner-save');
    const removeBtn= document.getElementById('btn-banner-remove');
    const grid     = document.getElementById('banner-grid');
    if (!overlay || !editBtn) return;

    let selectedKey = currentKey || null;

    function renderGrid() {
      grid.innerHTML = BANNER_DEFS.map(def => {
        const active = def.key === selectedKey ? ' banner-item--active' : '';
        return `<button class="banner-item${active}" data-key="${def.key}"
          style="background-image:url('${def.url}')" title="${def.label}"></button>`;
      }).join('');
    }

    function openModal() {
      selectedKey = currentKey || null;
      renderGrid();
      saveBtn.disabled = !selectedKey;
      overlay.classList.remove('hidden');
    }

    editBtn.addEventListener('click', openModal);
    closeBtn?.addEventListener('click', () => overlay.classList.add('hidden'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.add('hidden');
    });

    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('.banner-item');
      if (!btn) return;
      grid.querySelectorAll('.banner-item').forEach(b => b.classList.remove('banner-item--active'));
      btn.classList.add('banner-item--active');
      selectedKey = btn.dataset.key;
      saveBtn.disabled = false;
    });

    removeBtn?.addEventListener('click', async () => {
      const ok = await _saveBanner(nickname, null);
      if (ok !== false) {
        currentKey = null;
        _applyBanner(null);
        overlay.classList.add('hidden');
      }
    });

    saveBtn?.addEventListener('click', async () => {
      if (!selectedKey) return;
      const ok = await _saveBanner(nickname, selectedKey);
      if (ok !== false) {
        currentKey = selectedKey;
        _applyBanner(selectedKey);
        overlay.classList.add('hidden');
      }
    });
  }

  async function _saveBanner(nickname, key) {
    // Try Player.getToken(), fall back to raw localStorage
    const token = Player.getToken()
      || (() => { try { return JSON.parse(localStorage.getItem('geogayzzer_player'))?.token; } catch { return null; } })();
    if (!token) {
      console.error('[banner] No auth token — cannot save. Is the user logged in?');
      alert('Ошибка: вы не авторизованы. Войдите в аккаунт.');
      return false;
    }
    try {
      const res = await fetch(`/api/profile/${encodeURIComponent(nickname)}/banner`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify({ banner: key }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('[banner] Save failed:', res.status, data);
        alert(`Ошибка сохранения фона: ${data.error || res.status}`);
        return false;
      }
      console.log('[banner] Saved ok:', data);
      return true;
    } catch (err) {
      console.error('[banner] Save error:', err);
      return false;
    }
  }

  /* ── Render ────────────────────────────────────────────────────────────── */

  function renderProfile(prof) {
    /* Avatar (first letter of nickname, colored via CSS) */
    const avatar = document.getElementById('profile-avatar');
    avatar.textContent = prof.nickname.charAt(0).toUpperCase();

    /* Nickname */
    document.getElementById('profile-nickname').textContent = prof.nickname;

    /* Prestige badge */
    const prestigeBadge = document.getElementById('prestige-badge');
    if (prestigeBadge) {
      if ((prof.prestige || 0) > 0) {
        prestigeBadge.textContent = `[${prof.prestige}💎]`;
        prestigeBadge.classList.remove('hidden');
      } else {
        prestigeBadge.classList.add('hidden');
      }
    }

    /* Level badge + XP bar */
    document.getElementById('level-badge').textContent = `Ур. ${prof.level}`;
    const xpPct = prof.xpNeeded > 0 ? Math.min((prof.currentXp / prof.xpNeeded) * 100, 100) : 100;
    document.getElementById('xp-bar-fill').style.width = xpPct.toFixed(1) + '%';
    document.getElementById('xp-label').textContent =
      `${fmt(prof.currentXp)} / ${fmt(prof.xpNeeded)} XP`;

    /* Meta row */
    document.getElementById('meta-games').textContent   = declension(prof.gamesPlayed, 'игра', 'игры', 'игр');
    document.getElementById('meta-rounds').textContent  = declension(prof.roundsPlayed, 'раунд', 'раунда', 'раундов');
    document.getElementById('meta-total-xp').textContent = `${fmt(prof.totalXp)} XP всего`;
    const eloEl = document.getElementById('meta-elo');
    if (eloEl) {
      const eloVal = prof.elo ?? 1000;
      eloEl.innerHTML = UI.eloBadge(eloVal);
    }

    /* Records tab */
    document.getElementById('rec-best-total').textContent    = fmt(prof.records.bestTotalScore) + ' pts';
    document.getElementById('rec-best-round').textContent    = fmt(prof.records.bestRoundScore) + ' pts';
    /* Точность: показываем реальное расстояние в км/м если есть, иначе % */
    const accEl = document.getElementById('rec-best-accuracy');
    if (prof.records.bestAccuracyDist !== undefined && prof.records.bestAccuracyDist !== null) {
      const d = prof.records.bestAccuracyDist;
      accEl.textContent = d < 1 ? Math.round(d * 1000) + ' м' : d.toFixed(2) + ' км';
    } else {
      accEl.textContent = '—';
    }
    document.getElementById('rec-games-won').textContent     = fmt(prof.records.gamesWon);
    document.getElementById('rec-rounds-won').textContent    = fmt(prof.records.roundsWon);
    document.getElementById('rec-best-steals').textContent   = fmt(prof.records.bestSteals) + ' pts';

    /* Achievements tab */
    renderAchievements(prof.achievements);

    /* All achievements tab */
    renderAllAchievements(prof.achievements);

    /* Game history tab */
    renderGameHistory(prof.gameHistory || []);

    /* Last game tab */
    renderLastGame(prof.lastGame);

    /* Banner */
    _applyBanner(prof.banner || null);

    /* Banner picker (own profile only) */
    const myNick = Player.getNickname();
    const isOwn = myNick && myNick.toLowerCase() === prof.nickname.toLowerCase();
    const editBtn = document.getElementById('btn-edit-banner');
    if (editBtn) editBtn.classList.toggle('hidden', !isOwn);
  }

  function renderAchievements(list) {
    const container = document.getElementById('achievements-list');
    const label     = document.getElementById('ach-total-label');

    label.textContent = `Всего достижений: ${list.length}`;

    if (!list || list.length === 0) {
      container.innerHTML = '<p class="empty-state">Нет достижений</p>';
      return;
    }

    /* Group by id, count occurrences, keep latest date */
    const grouped = {};
    for (const ach of list) {
      if (!grouped[ach.id]) {
        grouped[ach.id] = { ...ach, count: 0 };
      }
      grouped[ach.id].count += 1;
      // Keep the latest date
      if (ach.date > grouped[ach.id].date) grouped[ach.id].date = ach.date;
    }

    // Sort by count desc, then name
    const sorted = Object.values(grouped).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    container.innerHTML = sorted.map(a => `
      <div class="ach-card">
        <div class="ach-icon">${escapeHtml(a.icon)}</div>
        <div class="ach-body">
          <div class="ach-name">${escapeHtml(a.name)}</div>
          <div class="ach-desc">${escapeHtml(a.desc)}</div>
          <div class="ach-date">${fmtDate(a.date)}</div>
        </div>
        <div class="ach-count">×${a.count}</div>
      </div>`).join('');
  }

  async function renderAllAchievements(earnedList) {
    const container = document.getElementById('all-achievements-list');
    if (!container) return;

    // Build a set of earned ids for quick lookup
    const earnedIds = new Set((earnedList || []).map(a => a.id));

    try {
      const defs = await fetch('/api/achievements').then(r => r.json());
      container.innerHTML = defs.map(def => {
        const earned = earnedIds.has(def.id);
        const earnedCount = (earnedList || []).filter(a => a.id === def.id).length;
        const countBadge  = earned && earnedCount > 1
          ? `<div class="ach-count">×${earnedCount}</div>`
          : '';
        const checkMark   = earned
          ? '<span class="ach-earned-mark">✔️</span>'
          : '<span class="ach-lock-mark">🔒</span>';
        return `
        <div class="ach-card${earned ? '' : ' locked'}">
          <div class="ach-icon">${escapeHtml(def.icon)}</div>
          <div class="ach-body">
            <div class="ach-name">${escapeHtml(def.name)}</div>
            <div class="ach-desc">${escapeHtml(def.desc)}</div>
          </div>
          ${countBadge || checkMark}
        </div>`;
      }).join('');
    } catch {
      container.innerHTML = '<p class="empty-state">Ошибка загрузки</p>';
    }
  }

  function renderGameHistory(history) {
    const container = document.getElementById('game-history-list');
    if (!container) return;
    if (!history || history.length === 0) {
      container.innerHTML = '<p class="empty-state">История игр пуста</p>';
      return;
    }

    function fmtDist(km) {
      if (km === null || km === undefined) return '—';
      return km < 1 ? Math.round(km * 1000) + ' м' : km.toFixed(1) + ' км';
    }

    function teamLabel(team) {
      if (team === 0) return '<span class="gh-team-badge gh-team-0">\ud83d\udd34</span>';
      if (team === 1) return '<span class="gh-team-badge gh-team-1">\ud83d\udd35</span>';
      return '';
    }

    function modeBadge(mode) {
      if (mode === 'team')     return '<span class="gh-mode-badge gh-mode-team">\ud83d\udc65 \u041a\u043e\u043c\u0430\u043d\u0434\u043d\u044b\u0439</span>';
      if (mode === 'standard') return '<span class="gh-mode-badge gh-mode-std">\ud83c\udfc6 \u0421\u0442\u0430\u043d\u0434\u0430\u0440\u0442</span>';
      return '<span class="gh-mode-badge gh-mode-solo">\ud83d\udc64 \u0421\u043e\u043b\u043e</span>';
    }

    container.innerHTML = history.map((g, idx) => {
      const medal = g.placement === 1 ? '\ud83e\udd47' : g.placement === 2 ? '\ud83e\udd48' : g.placement === 3 ? '\ud83e\udd49' : `${g.placement}-\u0435`;
      const eloBadgeHtml = g.newElo != null ? UI.eloBadge(g.newElo, g.eloDelta) : '';
      const mode = g.mode || (g.players > 1 ? 'standard' : 'solo');
      const isTeam = mode === 'team';

      // All players section (show everyone including self)
      const allPlayers = (g.allPlayers && g.allPlayers.length > 0)
        ? g.allPlayers
        : [];

      const playersHtml = allPlayers.length > 0
        ? `<div class="gh-players">
            ${allPlayers.map(op => {
              const opMedal = op.matchPlacement === 1 ? '\ud83e\udd47' : op.matchPlacement === 2 ? '\ud83e\udd48' : op.matchPlacement === 3 ? '\ud83e\udd49' : `${op.matchPlacement}.`;
              const profileLink = `/profile/${encodeURIComponent(op.nickname)}`;
              const teamBadge = isTeam ? teamLabel(op.team) : '';
              return `<div class="gh-opponent">
                <span class="gh-opp-place">${opMedal}</span>
                ${teamBadge}
                <a href="${profileLink}" class="gh-opp-name">${escapeHtml(op.nickname)}</a>
                <span class="gh-opp-score">${op.totalScore.toLocaleString()} pts</span>
              </div>`;
            }).join('')}
          </div>`
        : '<p class="gh-no-opponents">\u0421\u043e\u043b\u043e-\u0438\u0433\u0440\u0430</p>';

      // Round report
      const roundsHtml = (g.roundsData && g.roundsData.length > 0)
        ? `<div class="gh-rounds">
            ${g.roundsData.map(r => {
              const locName = r.location
                ? (r.location.city ? `${r.location.city}, ${r.location.country || ''}` : (r.location.country || `${r.location.lat.toFixed(2)}, ${r.location.lng.toFixed(2)}`))
                : `\u0420\u0430\u0443\u043d\u0434 ${r.round}`;
              const guessRows = (r.players || []).map((rp, rpIdx) => {
                const gMedal = rpIdx === 0 ? '\ud83e\udd47' : rpIdx === 1 ? '\ud83e\udd48' : rpIdx === 2 ? '\ud83e\udd49' : `${rpIdx + 1}.`;
                const teamB = isTeam ? teamLabel(rp.team) : '';
                const guessCoords = rp.guess
                  ? `<span class="gh-coords">${rp.guess.lat.toFixed(3)}, ${rp.guess.lng.toFixed(3)}</span>`
                  : '<span class="gh-coords">\u2014</span>';
                const distStr = fmtDist(rp.distance);
                return `<div class="gh-round-player">
                  <span class="gh-round-place">${gMedal}</span>
                  ${teamB}
                  <span class="gh-round-nick">${escapeHtml(rp.nickname)}</span>
                  ${guessCoords}
                  <span class="gh-round-dist">${distStr}</span>
                  <span class="gh-round-score">+${rp.score.toLocaleString()}</span>
                </div>`;
              }).join('');
              return `<div class="gh-round-block">
                <div class="gh-round-title">\u0420\u0430\u0443\u043d\u0434 ${r.round}: <span class="gh-round-loc">${escapeHtml(locName)}</span></div>
                <div class="gh-round-players">${guessRows || '<span class="gh-no-data">\u041d\u0435\u0442 \u0434\u0430\u043d\u043d\u044b\u0445</span>'}</div>
              </div>`;
            }).join('')}
          </div>`
        : '';

      return `<div class="gh-card" data-idx="${idx}">
        <div class="gh-header" role="button" tabindex="0">
          <span class="gh-date">${fmtDate(g.date)}</span>
          ${modeBadge(mode)}
          <span class="gh-place">${medal}</span>
          <span class="gh-score">${g.totalScore.toLocaleString()} pts</span>
          <span class="gh-elo">${eloBadgeHtml}</span>
          <span class="gh-chevron">\u25bc</span>
        </div>
        <div class="gh-body" hidden>
          <div class="gh-details">
            <span>\ud83d\udc65 ${g.players} \u0438\u0433\u0440\u043e\u043a\u043e\u0432</span>
            <span>\ud83d\udd04 ${g.rounds} \u0440\u0430\u0443\u043d\u0434\u043e\u0432</span>
          </div>
          ${playersHtml}
          ${roundsHtml}
        </div>
      </div>`;
    }).join('');

    // Toggle expand on click/enter
    container.querySelectorAll('.gh-header').forEach(header => {
      const toggle = () => {
        const card = header.parentElement;
        const body = card.querySelector('.gh-body');
        const chevron = header.querySelector('.gh-chevron');
        const open = !body.hidden;
        body.hidden = open;
        card.classList.toggle('gh-open', !open);
        if (chevron) chevron.textContent = open ? '\u25bc' : '\u25b2';
      };
      header.addEventListener('click', toggle);
      header.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') toggle(); });
    });
  }

  function renderLastGame(game) {
    const el = document.getElementById('lastgame-content');
    if (!game) {
      el.innerHTML = '<p class="empty-state">Игры ещё не было</p>';
      return;
    }
    el.innerHTML = `
      <div class="lastgame-row">
        <span class="lastgame-label">Дата</span>
        <span class="lastgame-value">${fmtDate(game.date)}</span>
      </div>
      <div class="lastgame-row">
        <span class="lastgame-label">Итоговый счёт</span>
        <span class="lastgame-value">${fmt(game.totalScore)} pts</span>
      </div>
      <div class="lastgame-row">
        <span class="lastgame-label">Место</span>
        <span class="lastgame-value">${placement(game.placement)} из ${game.players}</span>
      </div>
      <div class="lastgame-row">
        <span class="lastgame-label">Раундов</span>
        <span class="lastgame-value">${game.rounds}</span>
      </div>`;
  }

  /* ── Russian declension helper ─────────────────────────────────────────── */

  function declension(n, one, few, many) {
    const abs = Math.abs(n) % 100;
    const mod = abs % 10;
    if (abs > 10 && abs < 20) return `${n} ${many}`;
    if (mod === 1) return `${n} ${one}`;
    if (mod >= 2 && mod <= 4) return `${n} ${few}`;
    return `${n} ${many}`;
  }

  /* ── Init ──────────────────────────────────────────────────────────────── */

  async function init() {
    const nickname = decodeURIComponent(window.location.pathname.split('/profile/')[1] || '');
    if (!nickname) {
      window.location.href = '/menu';
      return;
    }

    document.title = `${nickname} — GeoGAYZZER`;
    initTabs();
    initInfoModal();

    try {
      const resp = await fetch(`/api/profile/${encodeURIComponent(nickname)}`);
      if (resp.status === 404) {
        document.querySelector('.profile-page').style.display = 'none';
        document.getElementById('profile-not-found').classList.remove('hidden');
        return;
      }
      const prof = await resp.json();
      renderProfile(prof);

      /* Banner picker (only own profile) */
      const myNick = Player.getNickname();
      if (myNick && myNick.toLowerCase() === prof.nickname.toLowerCase()) {
        initBannerPicker(prof.banner || null, prof.nickname);
      }
    } catch (err) {
      console.error('Profile load error:', err);
    }
  }

  init();
})();
