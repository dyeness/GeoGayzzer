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
function calcRoundXp(score, roundPlacement, playerCount) {
  const scoreXp = Math.floor(score / 10);
  // Placement bonus (single-player rounds get no bonus)
  const bonuses  = [150, 80, 50, 30, 15, 10];
  const bonus    = playerCount > 1 ? (bonuses[Math.min(roundPlacement - 1, bonuses.length - 1)] ?? 10) : 0;
  return scoreXp + bonus;
}

/** XP bonus earned for finishing the whole match */
function calcMatchXp(matchPlacement, playerCount) {
  if (playerCount <= 1) return 0;
  const bonuses = [500, 250, 150, 80, 40, 20];
  return bonuses[Math.min(matchPlacement - 1, bonuses.length - 1)] ?? 20;
}

/* ── Achievement definitions ─────────────────────────────────────────────── */

const ACHIEVEMENT_DEFS = {
  // ── Точность (раунд) ──────────────────────────────────────────────────────
  accuracy_50:  {
    name: 'На глаз',
    icon: '🎯',
    desc: 'Набрал 2 500+ очков в раунде — угадал с точностью от 50%',
  },
  accuracy_75:  {
    name: 'Снайпер',
    icon: '🔭',
    desc: 'Набрал 3 750+ очков в раунде — угадал с точностью от 75%',
  },
  accuracy_90:  {
    name: 'Орёл',
    icon: '🦅',
    desc: 'Набрал 4 500+ очков в раунде — угадал с точностью от 90%',
  },
  accuracy_99:  {
    name: 'Перфекционист',
    icon: '💎',
    desc: 'Набрал 4 950+ очков в раунде — почти идеальное попадание',
  },
  close_call:   {
    name: 'Игла в стоге',
    icon: '📌',
    desc: 'Угадал в пределах 1 км от цели — буквально на месте!',
  },
  // ── Места (раунд / матч) ─────────────────────────────────────────────────
  round_first:  {
    name: 'Первый в раунде',
    icon: '🥇',
    desc: 'Занял 1-е место среди всех игроков в раунде',
  },
  game_first:   {
    name: 'Чемпион',
    icon: '🏆',
    desc: 'Победил в многопользовательском матче, заняв 1-е место',
  },
  game_veteran: {
    name: 'Ветеран',
    icon: '🎖️',
    desc: 'Сыграл 10 и более матчей — настоящий исследователь!',
  },
  // ── Кража очков ─────────────────────────────────────────────────────────
  steal_scored: {
    name: 'Карманник',
    icon: '🗡️',
    desc: 'Украл очки у соперника — ты был ближе к цели',
  },
  steal_big:    {
    name: 'Ограбление',
    icon: '💰',
    desc: 'Украл 500+ очков в одном раунде — серьёзный куш',
  },
  // ── Счёт за матч ─────────────────────────────────────────────────────────
  score_5000:   {
    name: 'Исследователь',
    icon: '🗺️',
    desc: 'Набрал 5 000+ очков за матч — неплохое начало',
  },
  score_10000:  {
    name: 'Знаток',
    icon: '📍',
    desc: 'Набрал 10 000+ очков за матч — ты точно знаешь мир',
  },
  score_20000:  {
    name: 'Эксперт',
    icon: '🌍',
    desc: 'Набрал 20 000+ очков за матч — почти идеальный результат',
  },
  score_25000:  {
    name: 'Легенда',
    icon: '🌟',
    desc: 'Набрал все 25 000 очков за матч из 5 раундов — абсолютный максимум!',
  },
  // ── Особые ───────────────────────────────────────────────────────────────
  first_game:   {
    name: 'Первый шаг',
    icon: '🎮',
    desc: 'Завершил свой первый многопользовательский матч',
  },
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

    // XP
    const xpGained = calcRoundXp(r.score, r.roundPlacement, r.playerCount);
    prof.totalXp     += xpGained;
    prof.roundsPlayed += 1;

    // Records
    if (r.score > prof.records.bestRoundScore) prof.records.bestRoundScore = r.score;
    if (r.roundPlacement === 1 && r.playerCount > 1) prof.records.roundsWon += 1;
    const accuracyPct = (r.score / MAX_ROUND_SCORE) * 100;
    if (accuracyPct > prof.records.bestAccuracyPct) prof.records.bestAccuracyPct = accuracyPct;
    if ((r.stolen || 0) > prof.records.bestSteals) prof.records.bestSteals = r.stolen;

    // Round achievements
    if (accuracyPct >= 50) awardAchievement(prof, 'accuracy_50', +accuracyPct.toFixed(1));
    if (accuracyPct >= 75) awardAchievement(prof, 'accuracy_75', +accuracyPct.toFixed(1));
    if (accuracyPct >= 90) awardAchievement(prof, 'accuracy_90', +accuracyPct.toFixed(1));
    if (accuracyPct >= 99) awardAchievement(prof, 'accuracy_99', +accuracyPct.toFixed(1));
    if (r.distance !== null && r.distance < 1) awardAchievement(prof, 'close_call', +r.distance.toFixed(3));
    if (r.roundPlacement === 1 && r.playerCount > 1) awardAchievement(prof, 'round_first');
    if ((r.stolen || 0) > 0)   awardAchievement(prof, 'steal_scored', r.stolen);
    if ((r.stolen || 0) >= 500) awardAchievement(prof, 'steal_big', r.stolen);
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

    // XP
    prof.totalXp     += calcMatchXp(r.matchPlacement, r.playerCount);
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
    if (prof.gamesPlayed === 1)  awardAchievement(prof, 'first_game');
    if (prof.gamesPlayed === 10) awardAchievement(prof, 'game_veteran');
    if (r.totalScore >= 5000)  awardAchievement(prof, 'score_5000',  r.totalScore);
    if (r.totalScore >= 10000) awardAchievement(prof, 'score_10000', r.totalScore);
    if (r.totalScore >= 20000) awardAchievement(prof, 'score_20000', r.totalScore);
    if (r.totalScore >= 25000) awardAchievement(prof, 'score_25000', r.totalScore);
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
