/**
 * Player Profiles — XP, levels, records, and achievements.
 * Data stored in server/profiles.json (gitignored alongside accounts.json).
 */

const path = require('path');
const fs   = require('fs');

const PROFILES_FILE = path.join(__dirname, 'profiles.json');
let profiles = {};

/* ── Persistence ─────────────────────────────────────────────────────────── */

function loadProfiles() {
  try {
    if (fs.existsSync(PROFILES_FILE)) {
      profiles = JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8'));
      console.log(`[profiles] Loaded ${Object.keys(profiles).length} profiles`);
      migrateProfiles();
    }
  } catch (e) {
    console.warn('[profiles] Failed to load:', e.message);
    profiles = {};
  }
}

/** One-time migration: compute bestAccuracyDist from bestAccuracyPct for old profiles */
function migrateProfiles() {
  let changed = 0;
  for (const prof of Object.values(profiles)) {
    if (prof.records && prof.records.bestAccuracyDist === undefined) {
      const pct = prof.records.bestAccuracyPct;
      if (typeof pct === 'number' && pct > 0 && pct < 100) {
        // Inverse of: score = 5000 * exp(-d/1000) → d = -1000 * ln(pct/100)
        prof.records.bestAccuracyDist = parseFloat((-1000 * Math.log(pct / 100)).toFixed(3));
      } else {
        // pct >= 100 means steals inflated score beyond max — no reliable distance
        prof.records.bestAccuracyDist = null;
      }
      changed++;
    }
  }
  if (changed > 0) {
    saveProfiles();
    console.log(`[profiles] Migrated bestAccuracyDist for ${changed} profiles`);
  }
}

function saveProfiles() {
  try { fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles), 'utf8'); }
  catch (e) { console.warn('[profiles] Save error:', e.message); }
}

/* ── Level system ────────────────────────────────────────────────────────── */

const MAX_ROUND_SCORE = 5000;

/** XP required to advance FROM level N to N+1 */
function xpForLevel(n) {
  // Мягкий рост: 350 * n^1.2 вместо 200 * n^1.5
  return Math.floor(150 * Math.pow(n, 1.1));
}

/**
 * Given total accumulated XP, return { level, currentXp, xpNeeded }.
 * Level 1 = start, no upper cap.
 */
function getLevelInfo(totalXp) {
  let level  = 1;
  let xpSpent = 0;
  for (;;) {
    const needed = xpForLevel(level);
    if (xpSpent + needed > totalXp) {
      return { level, currentXp: totalXp - xpSpent, xpNeeded: needed };
    }
    xpSpent += needed;
    level++;
  }
}

/**
 * Prestige: every 55 levels gives +1 prestige.
 * Level 55 → prestige 1, level 110 → prestige 2, etc.
 */
function getPrestige(level) {
  return Math.floor(level / 55);
}

/** XP earned at the end of a round */
function calcRoundXp(score, distance, stolen, roundPlacement, playerCount) {
  // Base: score / 8 (more generous than /10)
  const scoreXp = Math.floor(score / 8);

  // Placement bonus (multiplayer only)
  const placeBonuses = [200, 100, 60, 35, 20, 10];
  const placeBonus   = playerCount > 1
    ? (placeBonuses[Math.min(roundPlacement - 1, placeBonuses.length - 1)] ?? 10)
    : 0;

  // Accuracy bonus
  const pct = (score / MAX_ROUND_SCORE) * 100;
  const accuracyBonus = pct >= 99 ? 100 : pct >= 90 ? 50 : 0;

  // Distance bonus
  const distBonus = distance !== null
    ? (distance < 0.1 ? 200 : distance < 1 ? 75 : 0)
    : 0;

  // Steal bonus
  const stealBonus = stolen > 0 ? 30 : 0;

  return scoreXp + placeBonus + accuracyBonus + distBonus + stealBonus;
}

/** XP bonus earned for finishing the whole match */
function calcMatchXp(matchPlacement, playerCount, allRounds90, bigOpponents) {
  // Always give participation XP
  const participationXp = 50;

  if (playerCount <= 1) return participationXp;

  const bonuses = [600, 300, 180, 100, 50, 25];
  let xp = (bonuses[Math.min(matchPlacement - 1, bonuses.length - 1)] ?? 25) + participationXp;

  if (allRounds90)  xp += 200; // flawless match bonus
  if (bigOpponents) xp += 100; // won vs 3+ players

  return xp;
}

/* ── Achievement definitions ─────────────────────────────────────────────── */

const ACHIEVEMENT_DEFS = {
  // ──────────────── ТОЧНОСТЬ (раунд) ──────────────────────────────────────────────
  accuracy_50:     { name: 'На глаз',           icon: '🎯',  desc: 'Набрал 2 500+ очков в раунде — угадал с точностью от 50%' },
  accuracy_75:     { name: 'Снайпер',           icon: '🔭',  desc: 'Набрал 3 750+ очков в раунде — угадал с точностью от 75%' },
  accuracy_90:     { name: 'Орёл',              icon: '🦅',  desc: 'Набрал 4 500+ очков в раунде — угадал с точностью от 90%' },
  accuracy_99:     { name: 'Перфекционист',     icon: '💎',  desc: 'Набрал 4 950+ очков в раунде — почти идеальное попадание' },
  close_call:      { name: 'Игла в стоге',      icon: '📌',  desc: 'Угадал в пределах 1 км от цели — буквально на месте!' },
  close_500m:      { name: 'Прямое попадание',  icon: '🔎',  desc: 'Угадал в пределах 500 м от цели — почти рядом!' },
  close_100m:      { name: 'Точность хирурга',  icon: '🏥',  desc: 'Угадал в пределах 100 м от цели — невероятная точность!' },
  round_dominator: { name: 'Доминация',         icon: '💪',  desc: '1-е место в раунде с 4 000+ очков — подавил всех' },
  steal_victim:    { name: 'Ограбленный',       icon: '😤',  desc: 'У тебя украли очки — соперник был ближе к цели' },

  // ──────────────── МЕСТА ───────────────────────────────────────────────────────
  round_first:     { name: 'Первый в раунде',   icon: '🥇',  desc: 'Занял 1-е место среди всех игроков в раунде' },
  game_first:      { name: 'Чемпион',           icon: '🏆',  desc: 'Победил в многопользовательском матче, заняв 1-е место' },
  top3_match:      { name: 'Призёр',            icon: '🥉',  desc: 'Завершил матч в топ-3 — встал на пьедестал почёта' },
  underdog:        { name: 'Тёмная лошадка',    icon: '🐴',  desc: 'Победил, имея 3 и более соперников — настоящая победа!' },

  // Победы в матчах (milestone, не повторяются)
  wins_1:          { name: 'Первая кровь',       icon: '🎖️', desc: 'Одержал первую победу в матче' },
  wins_5:          { name: 'Серийный победитель',icon: '🔥',  desc: 'Одержал 5 побед в матчах — стабильный результат' },
  wins_10:         { name: 'Непобедимый',        icon: '⚔️',  desc: 'Одержал 10 побед в матчах — истинная доминация' },
  wins_25:         { name: 'Ветеран побед',       icon: '🏅',  desc: 'Одержал 25 побед в матчах — легендарный игрок' },
  wins_50:         { name: 'Доминатор',          icon: '👑',  desc: 'Одержал 50 побед в матчах — неоспоримый чемпион' },

  // ──────────────── КРАЖА ОЧКОВ ────────────────────────────────────────────────
  steal_scored:    { name: 'Карманник',         icon: '🗡️', desc: 'Украл очки у соперника — ты был ближе к цели' },
  steal_big:       { name: 'Ограбление',        icon: '💰',  desc: 'Украл 500+ очков в одном раунде — серьёзный куш' },
  steal_jackpot:   { name: 'Козырный петух',    icon: '🐓',  desc: 'Украл 2000+ очков в одном раунде — королевский куш!' },
  match_steals_3:  { name: 'Серийный вор',      icon: '🦹',  desc: 'Украл очки в 3 и более раундах одного матча' },

  // ──────────────── СЧЁТ ЗА МАТЧ ───────────────────────────────────────────────
  score_5000:      { name: 'Исследователь',     icon: '🗺️', desc: 'Набрал 5 000+ очков за матч — неплохое начало' },
  score_10000:     { name: 'Знаток',            icon: '📍',  desc: 'Набрал 10 000+ очков за матч — ты точно знаешь мир' },
  score_15000:     { name: 'Профессионал',      icon: '📊',  desc: 'Набрал 15 000+ очков за матч — выдающийся результат' },
  score_20000:     { name: 'Эксперт',           icon: '🌍',  desc: 'Набрал 20 000+ очков за матч — почти идеальный результат' },
  score_25000:     { name: 'Легенда',           icon: '🌟',  desc: 'Набрал все 25 000 очков за матч — абсолютный максимум!' },
  all_rounds_50:   { name: 'Стабильный',        icon: '📈',  desc: 'Все раунды матча с 50%+ точностью — ни одного провала' },
  all_rounds_90:   { name: 'Безупречный',       icon: '✨',  desc: 'Все раунды матча с 90%+ точностью — совершенная игра!' },

  // ──────────────── МАТЧИ СЫГРАНО (milestone, не повторяются) ─────────────────
  first_game:      { name: 'Первый шаг',        icon: '🎮',  desc: 'Завершил свой первый многопользовательский матч' },
  games_10:        { name: 'Ветеран',           icon: '🎲',  desc: 'Сыграл 10 матчей — настоящий исследователь' },
  games_25:        { name: 'Завсегдатай',       icon: '📅',  desc: 'Сыграл 25 матчей — постоянный исследователь' },
  games_50:        { name: 'Мастер',            icon: '🎓',  desc: 'Сыграл 50 матчей — неоспоримый мастер географии' },
  games_100:       { name: 'Сотник',            icon: '💯',  desc: 'Сыграл 100 матчей — настоящий фанат' },
  games_250:       { name: 'Одержимый',         icon: '🔱',  desc: 'Сыграл 250 матчей — ты здесь живёшь?' },

  // ──────────────── ЭЛО (milestone, не повторяются) ────────────────────────────
  elo_1100:        { name: 'Подающий надежды',  icon: '📈',  desc: 'Достиг рейтинга 1100 ЭЛО — выше среднего' },
  elo_1200:        { name: 'Серебряный',        icon: '🥈',  desc: 'Достиг рейтинга 1200 ЭЛО — ты в элите' },
  elo_1400:        { name: 'Золотой',           icon: '🥇',  desc: 'Достиг рейтинга 1400 ЭЛО — выдающийся игрок' },
  elo_1600:        { name: 'Платиновый',        icon: '💠',  desc: 'Достиг рейтинга 1600 ЭЛО — почти непобедим' },
  elo_2000:        { name: 'Алмазный',          icon: '💎',  desc: 'Достиг рейтинга 2000 ЭЛО — абсолютный чемпион' },
  elo_drop:        { name: 'Дно',               icon: '📉',  desc: 'Рейтинг упал ниже 900 ЭЛО — бывает...' },
};

/* ── Profile init ────────────────────────────────────────────────────────── */

function initProfile(nickname) {
  const key = nickname.trim().toLowerCase();
  if (!profiles[key]) {
    profiles[key] = {
      nickname:    nickname.trim(),
      totalXp:     0,
      gamesPlayed: 0,
      roundsPlayed: 0,
      banner:      null,
      records: {
        bestTotalScore:   0,
        bestRoundScore:   0,
        bestAccuracyPct:  0,
        bestSteals:       0,
        gamesWon:         0,
        roundsWon:        0,
      },
      lastGame:     null,
      achievements: [],
      elo:          1000,
      eloChange:    0,
    };
    saveProfiles(); // persist immediately so profile exists from day 1
  }
  return profiles[key];
}

/* ── Award a (repeatable) achievement ────────────────────────────────────── */

function awardAchievement(profile, id, value = null) {
  const def = ACHIEVEMENT_DEFS[id];
  if (!def) return;
  profile.achievements.push({
    id,
    name:  def.name,
    icon:  def.icon,
    desc:  def.desc,
    date:  new Date().toISOString(),
    value,
  });
}

/** One-time milestone: выдаётся только если ещё не было в истории */
function awardMilestone(profile, id) {
  if (!hasEverEarned(profile, id)) awardAchievement(profile, id);
}

function hasEverEarned(profile, id) {
  return profile.achievements.some(a => a.id === id);
}

/* ── Update after each round ─────────────────────────────────────────────── */

/**
 * roundResults: Array of {
 *   nickname, score, distance, stolen,
 *   roundPlacement, playerCount
 * }
 * (already sorted best → worst so roundPlacement = index + 1)
 */
function updateAfterRound(roundResults) {
  for (const r of roundResults) {
    const key  = r.nickname.trim().toLowerCase();
    const prof = profiles[key] ?? initProfile(r.nickname);

    // Reset per-match tracker at the start of a new match (round 0)
    if ((r.roundNumber || 0) === 0) {
      prof._match = { roundScores: [], stealsCount: 0, victimCount: 0 };
    }
    if (!prof._match) prof._match = { roundScores: [], stealsCount: 0, victimCount: 0 };
    prof._match.roundScores.push(r.score);
    if ((r.stolen      || 0) > 0) prof._match.stealsCount += 1;
    if ((r.lostToSteal || 0) > 0) prof._match.victimCount += 1;

    // XP (new expanded formula)
    prof.totalXp      += calcRoundXp(r.score, r.distance, r.stolen || 0, r.roundPlacement, r.playerCount);
    prof.roundsPlayed += 1;

    // Records
    if (r.score > prof.records.bestRoundScore) prof.records.bestRoundScore = r.score;
    if (r.roundPlacement === 1 && r.playerCount > 1) prof.records.roundsWon += 1;
    const accuracyPct = (r.score / MAX_ROUND_SCORE) * 100;
    if (accuracyPct > prof.records.bestAccuracyPct) prof.records.bestAccuracyPct = accuracyPct;
    if ((r.stolen || 0) > prof.records.bestSteals) prof.records.bestSteals = r.stolen;
    // Лучшая точность по реальному расстоянию (меньше = лучше)
    if (r.distance !== null) {
      if (prof.records.bestAccuracyDist === undefined || r.distance < prof.records.bestAccuracyDist) {
        prof.records.bestAccuracyDist = r.distance;
      }
    }

    // Round achievements
    if (accuracyPct >= 50)  awardAchievement(prof, 'accuracy_50', +accuracyPct.toFixed(1));
    if (accuracyPct >= 75)  awardAchievement(prof, 'accuracy_75', +accuracyPct.toFixed(1));
    if (accuracyPct >= 90)  awardAchievement(prof, 'accuracy_90', +accuracyPct.toFixed(1));
    if (accuracyPct >= 99)  awardAchievement(prof, 'accuracy_99', +accuracyPct.toFixed(1));
    if (r.distance !== null && r.distance < 1)   awardAchievement(prof, 'close_call',  +r.distance.toFixed(3));
    if (r.distance !== null && r.distance < 0.5) awardAchievement(prof, 'close_500m',  +r.distance.toFixed(3));
    if (r.distance !== null && r.distance < 0.1) awardAchievement(prof, 'close_100m',  +r.distance.toFixed(3));
    if (r.roundPlacement === 1 && r.playerCount > 1) {
      awardAchievement(prof, 'round_first');
      if (r.score >= 4000) awardAchievement(prof, 'round_dominator', r.score);
    }
    if ((r.stolen      || 0) > 0)    awardAchievement(prof, 'steal_scored', r.stolen);
    if ((r.stolen      || 0) >= 500) awardAchievement(prof, 'steal_big',    r.stolen);
    if ((r.stolen      || 0) >= 2000) awardAchievement(prof, 'steal_jackpot', r.stolen);
    if ((r.lostToSteal || 0) > 0)    awardAchievement(prof, 'steal_victim',  r.lostToSteal);
  }
  saveProfiles();
}

/* ── ELO calculation (pairwise multi-player) ─────────────────────────────── */

/**
 * @param {Array<{nickname, elo, placement}>} players - sorted best→worst not required
 * @returns {{ [nickname]: number }} - ELO delta per player (can be negative)
 */
function calcEloChanges(players) {
  const K = 48;
  const changes = {};
  players.forEach(p => { changes[p.nickname] = 0; });

  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i], b = players[j];
      // Expected score for A vs B
      const ea = 1 / (1 + Math.pow(10, (b.elo - a.elo) / 400));
      // Actual: lower placement = better result (1st place beats 2nd)
      const sa = a.placement < b.placement ? 1 : a.placement > b.placement ? 0 : 0.5;
      const da = Math.round(K * (sa - ea));
      // Winner gets +20% bonus on top; loser only loses the base amount
      if (da > 0) {
        changes[a.nickname] += Math.round(da * 1.2);
        changes[b.nickname] -= da;
      } else if (da < 0) {
        changes[a.nickname] += da;
        changes[b.nickname] += Math.round(Math.abs(da) * 1.2);
      }
    }
  }
  return changes;
}

/* ── Update after game ends ──────────────────────────────────────────────── */

/**
 * gameResults: Array of {
 *   nickname, totalScore, matchPlacement, playerCount, rounds
 * }
 */
function updateAfterGame(gameResults) {
  // ── Compute ELO changes before mutating profiles (uses current ELO values) ──
  let eloChanges = {};
  if (gameResults.length > 1) {
    const eloPlayers = gameResults.map(r => ({
      nickname:  r.nickname,
      elo:       profiles[r.nickname.trim().toLowerCase()]?.elo ?? 1000,
      placement: r.matchPlacement,
    }));
    eloChanges = calcEloChanges(eloPlayers);
  }

  for (const r of gameResults) {
    const key  = r.nickname.trim().toLowerCase();
    const prof = profiles[key] ?? initProfile(r.nickname);

    // Per-match tracker data
    const match      = prof._match || {};
    const roundScores = match.roundScores || [];
    const allRounds90 = roundScores.length > 0 && roundScores.every(s => s >= MAX_ROUND_SCORE * 0.9);
    const bigOpponents = r.matchPlacement === 1 && r.playerCount >= 4;

    // XP (expanded formula with bonus params)
    prof.totalXp     += calcMatchXp(r.matchPlacement, r.playerCount, allRounds90, bigOpponents);
    prof.gamesPlayed += 1;

    // ELO (multiplayer only, floor at 100)
    const eloDelta = eloChanges[r.nickname] ?? 0;
    prof.elo       = Math.max(100, (prof.elo ?? 1000) + eloDelta);
    prof.eloChange = eloDelta;

    // Records
    if (r.totalScore > prof.records.bestTotalScore) prof.records.bestTotalScore = r.totalScore;
    if (r.matchPlacement === 1 && r.playerCount > 1) prof.records.gamesWon += 1;

    // Last game + game history
    const gameEntry = {
      date:       new Date().toISOString(),
      totalScore: r.totalScore,
      placement:  r.matchPlacement,
      players:    r.playerCount,
      rounds:     r.rounds,
      mode:       r.mode || (r.playerCount > 1 ? 'standard' : 'solo'),
      eloDelta,
      newElo:     prof.elo,
      allPlayers: r.allPlayers || [],
      roundsData: r.roundsData || [],
    };
    prof.lastGame = gameEntry;
    if (!prof.gameHistory) prof.gameHistory = [];
    prof.gameHistory.unshift(gameEntry);
    if (prof.gameHistory.length > 30) prof.gameHistory = prof.gameHistory.slice(0, 30);

    // Game achievements
    if (r.matchPlacement === 1 && r.playerCount > 1) awardAchievement(prof, 'game_first');
    if (r.matchPlacement <= 3 && r.playerCount > 1)  awardAchievement(prof, 'top3_match', r.matchPlacement);
    if (r.matchPlacement === 1 && r.playerCount >= 4) awardAchievement(prof, 'underdog');
    if (r.totalScore >= 5000)  awardAchievement(prof, 'score_5000',  r.totalScore);
    if (r.totalScore >= 10000) awardAchievement(prof, 'score_10000', r.totalScore);
    if (r.totalScore >= 15000) awardAchievement(prof, 'score_15000', r.totalScore);
    if (r.totalScore >= 20000) awardAchievement(prof, 'score_20000', r.totalScore);
    if (r.totalScore >= 25000) awardAchievement(prof, 'score_25000', r.totalScore);

    // Milestone: матчи сыграно (выдаётся ровно один раз)
    const gp = prof.gamesPlayed;
    if (gp === 1)   awardMilestone(prof, 'first_game');
    if (gp === 10)  awardMilestone(prof, 'games_10');
    if (gp === 25)  awardMilestone(prof, 'games_25');
    if (gp === 50)  awardMilestone(prof, 'games_50');
    if (gp === 100) awardMilestone(prof, 'games_100');
    if (gp === 250) awardMilestone(prof, 'games_250');

    // Milestone: победы (выдаётся ровно один раз)
    const gw = prof.records.gamesWon;
    if (gw === 1)  awardMilestone(prof, 'wins_1');
    if (gw === 5)  awardMilestone(prof, 'wins_5');
    if (gw === 10) awardMilestone(prof, 'wins_10');
    if (gw === 25) awardMilestone(prof, 'wins_25');
    if (gw === 50) awardMilestone(prof, 'wins_50');

    // Milestone: ЭЛО (выдаётся ровно один раз при первом достижении)
    const currentElo = prof.elo;
    if (currentElo >= 1100 && !hasEverEarned(prof, 'elo_1100')) awardMilestone(prof, 'elo_1100');
    if (currentElo >= 1200 && !hasEverEarned(prof, 'elo_1200')) awardMilestone(prof, 'elo_1200');
    if (currentElo >= 1400 && !hasEverEarned(prof, 'elo_1400')) awardMilestone(prof, 'elo_1400');
    if (currentElo >= 1600 && !hasEverEarned(prof, 'elo_1600')) awardMilestone(prof, 'elo_1600');
    if (currentElo >= 2000 && !hasEverEarned(prof, 'elo_2000')) awardMilestone(prof, 'elo_2000');
    if (currentElo < 900   && eloDelta < 0 && !hasEverEarned(prof, 'elo_drop')) awardMilestone(prof, 'elo_drop');

    // Per-match aggregate achievements
    if (roundScores.length > 0) {
      if (roundScores.every(s => s >= MAX_ROUND_SCORE * 0.5)) awardAchievement(prof, 'all_rounds_50');
      if (allRounds90) awardAchievement(prof, 'all_rounds_90');
    }
    if ((match.stealsCount || 0) >= 3) awardAchievement(prof, 'match_steals_3', match.stealsCount);

    // Cleanup match tracker
    delete prof._match;
  }
  saveProfiles();
  return eloChanges; // returned to caller so it can be emitted to clients
}

/* ── Public query ────────────────────────────────────────────────────────── */

/** Returns full enriched profile, or null if unknown. */
function getProfile(nickname) {
  const key  = nickname.trim().toLowerCase();
  const prof = profiles[key];
  if (!prof) return null;
  const { level, currentXp, xpNeeded } = getLevelInfo(prof.totalXp);
  const prestige = getPrestige(level);
  return { ...prof, level, currentXp, xpNeeded, prestige };
}

/** Set banner gif for a profile. bannerKey must be one of the allowed keys. */
function setProfileBanner(nickname, bannerKey) {
  const key = nickname.trim().toLowerCase();
  const prof = profiles[key];
  if (!prof) return false;
  prof.banner = bannerKey || null;
  saveProfiles();
  return true;
}

/** Returns a lightweight list for the leaderboard (nickname + level + totalXp). */
function getAllProfiles() {
  return Object.values(profiles).map(p => {
    const { level } = getLevelInfo(p.totalXp);
    const prestige  = getPrestige(level);
    return { nickname: p.nickname, level, totalXp: p.totalXp, gamesPlayed: p.gamesPlayed, prestige, elo: p.elo ?? 1000, banner: p.banner ?? null };
  }).sort((a, b) => b.totalXp - a.totalXp);
}

/** Returns all achievement definitions as an ordered array. */
function getAchievementDefs() {
  return Object.entries(ACHIEVEMENT_DEFS).map(([id, def]) => ({ id, ...def }));
}

loadProfiles();

/* ── Admin CLI commands ──────────────────────────────────────────────────── */
const ADMIN_PASSCODE = 'dyeness.adm';
const readline = require('readline');

/**
 * Выполнить admin-команду.
 * Формат: add [achievement|xp|elo] <игрок>, <id/количество>
 * Возвращает строку-результат.
 */
function adminCmd(input) {
  const raw = input.trim();
  const match = raw.match(/^add\s+(achievement|xp|elo)\s+(.+?),\s*(.+)$/i);
  if (!match) {
    return '❌  Синтаксис: add [achievement|xp|elo] <игрок>, <значение>';
  }
  const [, type, nick, val] = match;
  const key  = nick.trim().toLowerCase();
  const prof = profiles[key];
  if (!prof) return `❌  Игрок "${nick.trim()}" не найден.`;

  if (type.toLowerCase() === 'achievement') {
    const id = val.trim();
    if (!ACHIEVEMENT_DEFS[id]) return `❌  Достижение "${id}" не существует.`;
    awardAchievement(prof, id);
    saveProfiles();
    return `✅  Выдано достижение [${id}] (${ACHIEVEMENT_DEFS[id].icon} ${ACHIEVEMENT_DEFS[id].name}) → ${prof.nickname}`;
  }

  if (type.toLowerCase() === 'xp') {
    const amount = parseInt(val.trim(), 10);
    if (isNaN(amount)) return '❌  XP должно быть числом.';
    prof.totalXp = Math.max(0, prof.totalXp + amount);
    saveProfiles();
    return `✅  ${amount >= 0 ? '+' : ''}${amount} XP → ${prof.nickname} (итого ${prof.totalXp} XP)`;
  }

  if (type.toLowerCase() === 'elo') {
    const amount = parseInt(val.trim(), 10);
    if (isNaN(amount)) return '❌  ЭЛО должно быть числом.';
    prof.elo = Math.max(100, (prof.elo ?? 1000) + amount);
    saveProfiles();
    return `✅  ${amount >= 0 ? '+' : ''}${amount} ЭЛО → ${prof.nickname} (итого ${prof.elo} ЭЛО)`;
  }

  return '❌  Неизвестный тип команды. Используй: achievement, xp, elo';
}

// Запускаем консольный REPL только если stdin доступен (не pipe)
if (process.stdin.isTTY) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '' });
  let adminAuth = false;

  rl.on('line', line => {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (!adminAuth) {
      if (trimmed === ADMIN_PASSCODE) {
        adminAuth = true;
        console.log('🔓  Admin mode activated. Commands: add [achievement|xp|elo] <player>, <value>');
        console.log('    Achievements list: node -e "const p=require(\'./profiles\'); p.getAchievementDefs().forEach(a=>console.log(a.id, a.icon, a.name))"');
      }
      return; // не выводим ничего на неверный пароль
    }

    if (trimmed === 'exit' || trimmed === 'logout') {
      adminAuth = false;
      console.log('🔒  Admin mode deactivated.');
      return;
    }

    if (trimmed === 'list achievements') {
      Object.entries(ACHIEVEMENT_DEFS).forEach(([id, d]) => console.log(`  ${id.padEnd(18)} ${d.icon}  ${d.name}`));
      return;
    }

    if (trimmed === 'list players') {
      Object.values(profiles).forEach(p =>
        console.log(`  ${p.nickname.padEnd(20)} ELO:${(p.elo??1000)} XP:${p.totalXp} Games:${p.gamesPlayed}`)
      );
      return;
    }

    const result = adminCmd(trimmed);
    console.log(result);
  });
}

module.exports = { getProfile, getAllProfiles, getAchievementDefs, updateAfterRound, updateAfterGame, initProfile, getLevelInfo, setProfileBanner, adminCmd };
