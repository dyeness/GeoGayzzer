/**
 * Game Room Management
 * Handles multiplayer rooms, player tracking, and round synchronization.
 *
 * Features:
 *  - Team mode (2 teams, steal only across teams, balanced by join order)
 *  - Round timer (started after first player guesses, host-configurable)
 *  - Streak bonus (+200/+500/+1000 for 3/5/7 consecutive accurate rounds < 500 km)
 */

const crypto = require('crypto');

/** Generate a short random room code */
function generateRoomCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

const TEAM_NAMES  = ['🔴 Красные', '🔵 Синие'];
const TEAM_COLORS = ['#e53935', '#1e88e5'];

class GameRoom {
  constructor(code, hostId, hostNickname, hostColor) {
    this.code = code;
    this.hostId = hostId;
    this.players = new Map();
    this.locations = [];
    this.currentRound = 0;
    this.totalRounds = 5;
    this.status = 'waiting'; // waiting | playing | finished
    this.roundGuesses = new Map();
    this.readySet = new Set();
    this.roundStartTime = null;

    /* ── Host-configurable settings ── */
    this.teamMode            = false; // 2-team battle
    this.timeLimitSecs       = 0;     // 0 = off; seconds after first guess
    this.streakBonusEnabled  = true;  // bonus for N consecutive accurate rounds

    /* ── Runtime state ── */
    this.preTeams      = new Map(); // socketId → 0 | 1  (player-chosen before game)
    this.teams         = new Map(); // socketId → 0 | 1  (active during game)
    this.teamScores    = [0, 0];
    this.roundTimer    = null;      // setTimeout handle
    this.roundFinalized = false;    // prevents double-finalize

    this.addPlayer(hostId, hostNickname, hostColor);
  }

  /* ───── Player management ───── */

  addPlayer(socketId, nickname, color = '#4fc3f7') {
    this.players.set(socketId, {
      nickname,
      color: color || '#4fc3f7',
      scores: [],
      totalScore: 0,
      guesses: [],
      streak: 0,
    });
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
    this.roundGuesses.delete(socketId);
    this.readySet.delete(socketId);
    this.teams.delete(socketId);
    this.preTeams.delete(socketId);
  }

  getPlayerList() {
    return Array.from(this.players.entries()).map(([id, p]) => ({
      id,
      nickname: p.nickname,
      color:    p.color,
      totalScore: p.totalScore,
      isHost:   id === this.hostId,
      isReady:  this.readySet.has(id),
      team:     this.teamMode ? (this.teams.get(id) ?? null) : null,
      preTeam:  this.preTeams.get(id) ?? null,
      streak:   p.streak,
    }));
  }

  /* ───── Ready system ───── */

  markReady(socketId) {
    this.readySet.add(socketId);
    return this.readySet.size >= this.players.size;
  }

  clearReady() { this.readySet.clear(); }
  getReadyCount() { return this.readySet.size; }

  /** Store a pre-game team preference for a player. */
  setPreTeam(socketId, team) {
    if (team === 0 || team === 1) this.preTeams.set(socketId, team);
  }

  /* ───── Team assignment (balanced by join order) ───── */

  _assignTeams() {
    this.teamScores = [0, 0];
    this.teams.clear();
    // Step 1: honour pre-selected teams
    for (const [sid] of this.players) {
      const pre = this.preTeams.get(sid);
      if (pre === 0 || pre === 1) this.teams.set(sid, pre);
    }
    // Step 2: balance remaining unassigned players
    for (const [sid] of this.players) {
      if (!this.teams.has(sid)) {
        const c0 = [...this.teams.values()].filter(t => t === 0).length;
        const c1 = [...this.teams.values()].filter(t => t === 1).length;
        this.teams.set(sid, c0 <= c1 ? 0 : 1);
      }
    }
  }

  /* ───── Game flow ───── */

  startGame(locations) {
    this.locations = locations;
    this.currentRound = 0;
    this.status = 'playing';
    this.readySet.clear();
    this.roundFinalized = false;

    for (const p of this.players.values()) {
      p.scores     = [];
      p.totalScore = 0;
      p.guesses    = [];
      p.streak     = 0;
    }

    if (this.teamMode) this._assignTeams();

    return this.getCurrentLocation();
  }

  getCurrentLocation() {
    return this.locations[this.currentRound] ?? null;
  }

  submitGuess(socketId, guess) {
    if (this.status !== 'playing') return false;
    if (this.roundGuesses.has(socketId)) return false;
    this.roundGuesses.set(socketId, guess);
    return true;
  }

  allGuessesIn() {
    return this.roundGuesses.size >= this.players.size;
  }

  /**
   * Finalize the current round.
   * Returns sorted results array (by this-round score desc).
   */
  finalizeRound(scoringFn) {
    this.roundFinalized = true;
    if (this.roundTimer) { clearTimeout(this.roundTimer); this.roundTimer = null; }

    const location       = this.getCurrentLocation();
    const STEAL_RADIUS   = 100;   // km
    const STEAL_FRACTION = 0.20;
    const STREAK_KM      = 500;   // accurate = within 500 km

    /* ── Step 1: base scores ── */
    const entries = [];
    for (const [socketId, player] of this.players) {
      const guess = this.roundGuesses.get(socketId);
      let distance = null;
      let score    = 0;
      if (guess) {
        distance = scoringFn.haversine(location.lat, location.lng, guess.lat, guess.lng);
        score    = scoringFn.calculateScore(distance);
      }
      entries.push({ socketId, player, guess, distance, score, stolen: 0, lostToSteal: 0, streakBonus: 0 });
    }

    /* ── Step 2: steal ── */
    const guessers = entries.filter(e => e.guess && e.score > 0);
    for (let i = 0; i < guessers.length; i++) {
      for (let j = i + 1; j < guessers.length; j++) {
        const a = guessers[i];
        const b = guessers[j];

        // In team mode: steal only allowed across DIFFERENT teams
        if (this.teamMode) {
          const ta = this.teams.get(a.socketId) ?? -1;
          const tb = this.teams.get(b.socketId) ?? -1;
          if (ta === tb) continue;
        }

        const dist = scoringFn.haversine(a.guess.lat, a.guess.lng, b.guess.lat, b.guess.lng);
        if (dist <= STEAL_RADIUS) {
          const [winner, loser] = a.distance <= b.distance ? [a, b] : [b, a];
          const amount = Math.floor(loser.score * STEAL_FRACTION);
          if (amount > 0) {
            winner.score       += amount;
            winner.stolen      += amount;
            loser.score         = Math.max(0, loser.score - amount);
            loser.lostToSteal  += amount;
          }
        }
      }
    }

    /* ── Step 3: streak bonus ── */
    if (this.streakBonusEnabled) {
      for (const e of entries) {
        const accurate = e.distance !== null && e.distance < STREAK_KM;
        e.player.streak = accurate ? (e.player.streak || 0) + 1 : 0;
        const s = e.player.streak;
        const bonus = s >= 7 ? 1000 : s >= 5 ? 500 : s >= 3 ? 200 : 0;
        if (bonus > 0) { e.score += bonus; e.streakBonus = bonus; }
      }
    }

    /* ── Step 4: commit to state ── */
    const results = [];
    for (const { socketId, player, guess, distance, score, stolen, lostToSteal, streakBonus } of entries) {
      player.scores.push(score);
      player.totalScore += score;
      player.guesses.push(guess || null);

      if (this.teamMode) {
        const t = this.teams.get(socketId) ?? 0;
        this.teamScores[t] = (this.teamScores[t] || 0) + score;
      }

      results.push({
        socketId,
        nickname:   player.nickname,
        color:      player.color,
        guess,
        distance,
        score,
        stolen,
        lostToSteal,
        streakBonus,
        streak:     player.streak,
        team:       this.teamMode ? (this.teams.get(socketId) ?? null) : null,
        totalScore: player.totalScore,
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results;
  }

  /** Advance to the next round or end the game */
  nextRound() {
    this.roundGuesses.clear();
    this.readySet.clear();
    this.roundFinalized = false;
    this.currentRound  += 1;
    if (this.currentRound >= this.totalRounds) {
      this.status = 'finished';
      return null;
    }
    this.roundStartTime = Date.now();
    return this.getCurrentLocation();
  }

  /** Final leaderboard — players sorted by totalScore */
  getLeaderboard() {
    return Array.from(this.players.entries())
      .map(([id, p]) => ({
        id,
        nickname:   p.nickname,
        color:      p.color,
        totalScore: p.totalScore,
        scores:     p.scores,
        team:       this.teamMode ? (this.teams.get(id) ?? null) : null,
      }))
      .sort((a, b) => b.totalScore - a.totalScore);
  }
}

/* ───── Room Registry ───── */

const rooms = new Map();

function createRoom(hostId, hostNickname, hostColor) {
  let code = generateRoomCode();
  while (rooms.has(code)) code = generateRoomCode();
  const room = new GameRoom(code, hostId, hostNickname, hostColor);
  rooms.set(code, room);
  return room;
}

function getRoom(code) {
  return rooms.get(code?.toUpperCase()) ?? null;
}

function deleteRoom(code) {
  rooms.delete(code);
}

function getRoomByPlayer(socketId) {
  for (const room of rooms.values()) {
    if (room.players.has(socketId)) return room;
  }
  return null;
}

function getAllRooms() {
  return Array.from(rooms.values()).map(room => ({
    code: room.code,
    host: Array.from(room.players.values())[0]?.nickname ?? '?',
    playerCount: room.players.size,
    status: room.status,
  }));
}

module.exports = { createRoom, getRoom, deleteRoom, getRoomByPlayer, getAllRooms, GameRoom, TEAM_NAMES, TEAM_COLORS };

