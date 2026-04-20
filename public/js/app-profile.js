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

  /* ── Render ────────────────────────────────────────────────────────────── */

  function renderProfile(prof) {
    /* Avatar (first letter of nickname, colored via CSS) */
    const avatar = document.getElementById('profile-avatar');
    avatar.textContent = prof.nickname.charAt(0).toUpperCase();

    /* Nickname */
    document.getElementById('profile-nickname').textContent = prof.nickname;

    /* Level badge + XP bar */
    document.getElementById('level-badge').textContent = `Ур. ${prof.level}`;
    const xpPct = prof.xpNeeded > 0 ? Math.min((prof.currentXp / prof.xpNeeded) * 100, 100) : 100;
    document.getElementById('xp-bar-fill').style.width = xpPct.toFixed(1) + '%';
    document.getElementById('xp-label').textContent =
      `${fmt(prof.currentXp)} / ${fmt(prof.xpNeeded)} XP`;

    /* Meta row */
    document.getElementById('meta-games').textContent   = `${prof.gamesPlayed} ${declension(prof.gamesPlayed, 'игра', 'игры', 'игр')}`;
    document.getElementById('meta-rounds').textContent  = `${prof.roundsPlayed} ${declension(prof.roundsPlayed, 'раунд', 'раунда', 'раундов')}`;
    document.getElementById('meta-total-xp').textContent = `${fmt(prof.totalXp)} XP всего`;

    /* Records tab */
    document.getElementById('rec-best-total').textContent    = fmt(prof.records.bestTotalScore) + ' pts';
    document.getElementById('rec-best-round').textContent    = fmt(prof.records.bestRoundScore) + ' pts';
    document.getElementById('rec-best-accuracy').textContent = pct(prof.records.bestAccuracyPct);
    document.getElementById('rec-games-won').textContent     = fmt(prof.records.gamesWon);
    document.getElementById('rec-rounds-won').textContent    = fmt(prof.records.roundsWon);
    document.getElementById('rec-best-steals').textContent   = fmt(prof.records.bestSteals) + ' pts';

    /* Achievements tab */
    renderAchievements(prof.achievements);

    /* Last game tab */
    renderLastGame(prof.lastGame);
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

    try {
      const resp = await fetch(`/api/profile/${encodeURIComponent(nickname)}`);
      if (resp.status === 404) {
        document.querySelector('.profile-page').style.display = 'none';
        document.getElementById('profile-not-found').classList.remove('hidden');
        return;
      }
      const prof = await resp.json();
      renderProfile(prof);
    } catch (err) {
      console.error('Profile load error:', err);
    }
  }

  init();
})();
