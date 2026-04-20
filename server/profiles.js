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
    }
  } catch (e) {
    console.warn('[profiles] Failed to load:', e.message);
    profiles = {};
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
  return Math.floor(200 * Math.pow(n, 1.5));
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
  accuracy_50:     { name: 'На глаз',          icon: '🎯', desc: 'Набрал 2 500+ очков в раунде — угадал с точностью от 50%' },
  accuracy_75:     { name: 'Снайпер',         icon: '🔭', desc: 'Набрал 3 750+ очков в раунде — угадал с точностью от 75%' },
  accuracy_90:     { name: 'Орёл',            icon: '🦅', desc: 'Набрал 4 500+ очков в раунде — угадал с точностью от 90%' },
  accuracy_99:     { name: 'Перфекционист',  icon: '💎', desc: 'Набрал 4 950+ очков в раунде — почти идеальное попадание' },
  close_call:      { name: 'Игла в стоге',    icon: '📌', desc: 'Угадал в пределах 1 км от цели — буквально на месте!' },
  close_500m:      { name: 'Прямое попадание', icon: '🔎', desc: 'Угадал в пределах 500 м от цели — почти рядом!' },
  close_100m:      { name: 'Точность хирурга', icon: '🏥', desc: 'Угадал в пределах 100 м от цели — невероятная точность!' },
  no_guess:        { name: 'Созерцатель',    icon: '👁️', desc: 'Не сделал ни одного угадывания в раунде — глядел и молчал' },
  round_dominator: { name: 'Доминация',      icon: '💪', desc: '1-е место в раунде С 4 000+ очков — подавил всех' },
  steal_victim:    { name: 'Ограбленный',    icon: '😤', desc: 'У тебя украли очки — соперник был ближе к цели' },

  // ──────────────── МЕСТА ──────────────────────────────────────────────────────────────────
  round_first:     { name: 'Первый в раунде', icon: '🥇', desc: 'Занял 1-е место среди всех игроков в раунде' },
  game_first:      { name: 'Чемпион',        icon: '🏆', desc: 'Победил в многопользовательском матче, заняв 1-е место' },
  top3_match:      { name: 'Призёр',           icon: '🥉', desc: 'Завершил матч в топ-3 — встал на пьедестал почёта' },
  underdog:        { name: 'Тёмная лошадка',  icon: '🐴', desc: 'Победил, имея 3 и более соперников — настоящая победа!' },
  five_wins:       { name: 'Серийный победитель', icon: '🔥', desc: 'Одержал 5 побед в матчах — стабильный результат' },
  ten_wins:        { name: 'Непобедимый',    icon: '⚔️', desc: 'Одержал 10 побед в матчах — истинная доминация' },

  // ──────────────── КРАЖА ОЧКОВ ──────────────────────────────────────────────────────────
  steal_scored:    { name: 'Карманник',      icon: '🗡️', desc: 'Украл очки у соперника — ты был ближе к цели' },
  steal_big:       { name: 'Ограбление',       icon: '💰', desc: 'Украл 500+ очков в одном раунде — серьёзный куш' },
  match_steals_3:  { name: 'Серийный вор',   icon: '🦹', desc: 'Украл очки в 3 и более раундах одного матча' },

  // ──────────────── СЧЁТ ЗА МАТЧ ──────────────────────────────────────────────────────────
  score_5000:      { name: 'Исследователь',  icon: '🗺️', desc: 'Набрал 5 000+ очков за матч — неплохое начало' },
  score_10000:     { name: 'Знаток',          icon: '📍', desc: 'Набрал 10 000+ очков за матч — ты точно знаешь мир' },
  score_15000:     { name: 'Профессионал',   icon: '📊', desc: 'Набрал 15 000+ очков за матч — выдающийся результат' },
  score_20000:     { name: 'Эксперт',          icon: '🌍', desc: 'Набрал 20 000+ очков за матч — почти идеальный результат' },
  score_25000:     { name: 'Легенда',          icon: '🌟', desc: 'Набрал все 25 000 очков за матч из 5 раундов — абсолютный максимум!' },
  all_rounds_50:   { name: 'Стабильный',      icon: '📈', desc: 'Все раунды матча с 50%+ точностью — ни одного провала' },
  all_rounds_90:   { name: 'Безупречный',     icon: '✨', desc: 'Все раунды матча с 90%+ точностью — совершенная игра!' },

  // ──────────────── ОПЫТ ПЛЕЙЕРА ─────────────────────────────────────────────────────────
  first_game:      { name: 'Первый шаг',    icon: '🎮', desc: 'Завершил свой первый многопользовательский матч' },
  game_veteran:    { name: 'Ветеран',        icon: '🎖️', desc: 'Сыграл 10 матчей — настоящий исследователь!' },
  games_25:        { name: 'Завсегдатай',    icon: '🎲', desc: 'Сыграл 25 матчей — постоянный исследователь' },
  games_50:        { name: 'Мастер',          icon: '🎓', desc: 'Сыграл 50 матчей — неоспоримый мастер географии' },
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

    // Round achievements
    if (accuracyPct >= 50)  awardAchievement(prof, 'accuracy_50', +accuracyPct.toFixed(1));
    if (accuracyPct >= 75)  awardAchievement(prof, 'accuracy_75', +accuracyPct.toFixed(1));
    if (accuracyPct >= 90)  awardAchievement(prof, 'accuracy_90', +accuracyPct.toFixed(1));
    if (accuracyPct >= 99)  awardAchievement(prof, 'accuracy_99', +accuracyPct.toFixed(1));
    if (r.distance !== null && r.distance < 1)   awardAchievement(prof, 'close_call',  +r.distance.toFixed(3));
    if (r.distance !== null && r.distance < 0.5) awardAchievement(prof, 'close_500m',  +r.distance.toFixed(3));
    if (r.distance !== null && r.distance < 0.1) awardAchievement(prof, 'close_100m',  +r.distance.toFixed(3));
    if (r.distance === null) awardAchievement(prof, 'no_guess');
    if (r.roundPlacement === 1 && r.playerCount > 1) {
      awardAchievement(prof, 'round_first');
      if (r.score >= 4000) awardAchievement(prof, 'round_dominator', r.score);
    }
    if ((r.stolen      || 0) > 0)   awardAchievement(prof, 'steal_scored', r.stolen);
    if ((r.stolen      || 0) >= 500) awardAchievement(prof, 'steal_big',    r.stolen);
    if ((r.lostToSteal || 0) > 0)   awardAchievement(prof, 'steal_victim',  r.lostToSteal);
  }
  saveProfiles();
}

/* ── Update after game ends ──────────────────────────────────────────────── */

/**
 * gameResults: Array of {
 *   nickname, totalScore, matchPlacement, playerCount, rounds
 * }
 */
function updateAfterGame(gameResults) {
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

    // Records
    if (r.totalScore > prof.records.bestTotalScore) prof.records.bestTotalScore = r.totalScore;
    if (r.matchPlacement === 1 && r.playerCount > 1) prof.records.gamesWon += 1;

    // Last game
    prof.lastGame = {
      date:       new Date().toISOString(),
      totalScore: r.totalScore,
      placement:  r.matchPlacement,
      players:    r.playerCount,
      rounds:     r.rounds,
    };

    // Game achievements
    if (r.matchPlacement === 1 && r.playerCount > 1) awardAchievement(prof, 'game_first');
    if (r.matchPlacement <= 3 && r.playerCount > 1)  awardAchievement(prof, 'top3_match', r.matchPlacement);
    if (r.matchPlacement === 1 && r.playerCount >= 4) awardAchievement(prof, 'underdog');
    if (prof.gamesPlayed === 1)  awardAchievement(prof, 'first_game');
    if (prof.gamesPlayed === 10) awardAchievement(prof, 'game_veteran');
    if (prof.gamesPlayed === 25) awardAchievement(prof, 'games_25');
    if (prof.gamesPlayed === 50) awardAchievement(prof, 'games_50');
    if (prof.records.gamesWon === 5)  awardAchievement(prof, 'five_wins');
    if (prof.records.gamesWon === 10) awardAchievement(prof, 'ten_wins');
    if (r.totalScore >= 5000)  awardAchievement(prof, 'score_5000',  r.totalScore);
    if (r.totalScore >= 10000) awardAchievement(prof, 'score_10000', r.totalScore);
    if (r.totalScore >= 15000) awardAchievement(prof, 'score_15000', r.totalScore);
    if (r.totalScore >= 20000) awardAchievement(prof, 'score_20000', r.totalScore);
    if (r.totalScore >= 25000) awardAchievement(prof, 'score_25000', r.totalScore);

    // Per-match aggregate achievements
    if (roundScores.length > 0) {
      if (roundScores.every(s => s >= MAX_ROUND_SCORE * 0.5)) awardAchievement(prof, 'all_rounds_50');
      if (allRounds90)  awardAchievement(prof, 'all_rounds_90');
    }
    if ((match.stealsCount || 0) >= 3) awardAchievement(prof, 'match_steals_3', match.stealsCount);

    // Cleanup match tracker
    delete prof._match;
  }
  saveProfiles();
}

/* ── Public query ────────────────────────────────────────────────────────── */

/** Returns full enriched profile, or null if unknown. */
function getProfile(nickname) {
  const key  = nickname.trim().toLowerCase();
  const prof = profiles[key];
  if (!prof) return null;
  const { level, currentXp, xpNeeded } = getLevelInfo(prof.totalXp);
  return { ...prof, level, currentXp, xpNeeded };
}

/** Returns a lightweight list for the leaderboard (nickname + level + totalXp). */
function getAllProfiles() {
  return Object.values(profiles).map(p => {
    const { level } = getLevelInfo(p.totalXp);
    return { nickname: p.nickname, level, totalXp: p.totalXp, gamesPlayed: p.gamesPlayed };
  }).sort((a, b) => b.totalXp - a.totalXp);
}

loadProfiles();

module.exports = { getProfile, getAllProfiles, updateAfterRound, updateAfterGame, initProfile, getLevelInfo };
