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
    document.getElementById('meta-games').textContent   = `${prof.gamesPlayed} ${declension(prof.gamesPlayed, 'игра', 'игры', 'игр')}`;
    document.getElementById('meta-rounds').textContent  = `${prof.roundsPlayed} ${declension(prof.roundsPlayed, 'раунд', 'раунда', 'раундов')}`;
    document.getElementById('meta-total-xp').textContent = `${fmt(prof.totalXp)} XP всего`;
    const eloEl = document.getElementById('meta-elo');
    if (eloEl) {
      const eloVal = prof.elo ?? 1000;
      eloEl.textContent = `${fmt(eloVal)} ЭЛО`;
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
      accEl.textContent = pct(prof.records.bestAccuracyPct);
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

    container.innerHTML = history.map((g, idx) => {
      const medal = g.placement === 1 ? '🥇' : g.placement === 2 ? '🥈' : g.placement === 3 ? '🥉' : `${g.placement}-е`;
      const eloCls = g.eloDelta > 0 ? 'elo-gain' : g.eloDelta < 0 ? 'elo-loss' : 'elo-zero';
      const eloSign = g.eloDelta > 0 ? '+' : '';
      const eloStr = g.eloDelta !== undefined
        ? `<span class="${eloCls}">${eloSign}${g.eloDelta} ЭЛО</span>`
        : '';
      const newEloStr = g.newElo != null ? ` → ${g.newElo}` : '';

      const opponents = (g.opponents || []).map(op => {
        const opMedal = op.matchPlacement === 1 ? '🥇' : op.matchPlacement === 2 ? '🥈' : op.matchPlacement === 3 ? '🥉' : `${op.matchPlacement}.`;
        const profileLink = `/profile/${encodeURIComponent(op.nickname)}`;
        return `<div class="gh-opponent">
          <span class="gh-opp-place">${opMedal}</span>
          <a href="${profileLink}" class="gh-opp-name">${escapeHtml(op.nickname)}</a>
          <span class="gh-opp-score">${op.totalScore.toLocaleString()} pts</span>
        </div>`;
      }).join('');

      return `<div class="gh-card" data-idx="${idx}">
        <div class="gh-header" role="button" tabindex="0">
          <span class="gh-date">${fmtDate(g.date)}</span>
          <span class="gh-place">${medal}</span>
          <span class="gh-score">${g.totalScore.toLocaleString()} pts</span>
          <span class="gh-elo">${eloStr}${newEloStr ? `<span class="gh-new-elo">${newEloStr}</span>` : ''}</span>
          <span class="gh-chevron">▼</span>
        </div>
        <div class="gh-body" hidden>
          <div class="gh-details">
            <span>👥 ${g.players} игроков</span>
            <span>🔄 ${g.rounds} раундов</span>
          </div>
          ${opponents ? `<div class="gh-opponents">${opponents}</div>` : '<p class="gh-no-opponents">Соло-игра</p>'}
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
        if (chevron) chevron.textContent = open ? '▼' : '▲';
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
    } catch (err) {
      console.error('Profile load error:', err);
    }
  }

  init();
})();
