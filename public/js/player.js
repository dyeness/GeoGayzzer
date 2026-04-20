/**
 * Player — registration, localStorage persistence, and statistics.
 */

const Player = (() => {
  const STORAGE_KEY = 'geoguessr_player';
  const STATS_KEY   = 'geoguessr_stats';

  /** Load player data from localStorage */
  function loadPlayer() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /** Save player data to localStorage */
  function savePlayer(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  /** Register or update a player nickname */
  function register(nickname) {
    const trimmed = nickname.trim().slice(0, 20);
    if (!trimmed) return null;

    const existing = loadPlayer();
    const player = {
      nickname: trimmed,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    };
    savePlayer(player);
    return player;
  }

  /** Get the saved nickname, or null */
  function getNickname() {
    return loadPlayer()?.nickname ?? null;
  }

  /** Clear saved player */
  function logout() {
    localStorage.removeItem(STORAGE_KEY);
  }

  /* ─── Statistics ─── */

  function loadStats() {
    try {
      const raw = localStorage.getItem(STATS_KEY);
      return raw ? JSON.parse(raw) : getDefaultStats();
    } catch {
      return getDefaultStats();
    }
  }

  function getDefaultStats() {
    return {
      gamesPlayed: 0,
      totalScore: 0,
      bestGame: 0,
      bestRound: 0,
      history: [], // last 20 games
    };
  }

  /**
   * Record a completed game.
   * @param {number} totalScore
   * @param {number[]} roundScores
   * @param {string} mode - 'solo' | 'multiplayer'
   */
  function recordGame(totalScore, roundScores, mode = 'solo') {
    const stats = loadStats();
    stats.gamesPlayed += 1;
    stats.totalScore += totalScore;
    stats.bestGame = Math.max(stats.bestGame, totalScore);
    stats.bestRound = Math.max(stats.bestRound, ...roundScores);

    stats.history.unshift({
      date: new Date().toISOString(),
      score: totalScore,
      rounds: roundScores,
      mode,
    });

    // Keep only last 20 games
    if (stats.history.length > 20) {
      stats.history = stats.history.slice(0, 20);
    }

    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    return stats;
  }

  /** Get computed stats for display */
  function getStats() {
    const stats = loadStats();
    return {
      gamesPlayed: stats.gamesPlayed,
      averageScore: stats.gamesPlayed > 0
        ? Math.round(stats.totalScore / stats.gamesPlayed)
        : 0,
      bestGame: stats.bestGame,
      bestRound: stats.bestRound,
      history: stats.history,
    };
  }

  return { register, getNickname, logout, recordGame, getStats };
})();
