/**
 * Game Room Management
 * Handles multiplayer rooms, player tracking, and round synchronization.
 */

const crypto = require('crypto');

/** Generate a short random room code */
function generateRoomCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

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
    this.readySet = new Set();  // players who clicked "Ready" between rounds
    this.roundStartTime = null;
    this.roundTimeLimit = 120_000;
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
    });
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
    this.roundGuesses.delete(socketId);
    this.readySet.delete(socketId);
  }

  getPlayerList() {
    return Array.from(this.players.entries()).map(([id, p]) => ({
      id,
      nickname: p.nickname,
      color: p.color,
      totalScore: p.totalScore,
      isHost: id === this.hostId,
      isReady: this.readySet.has(id),
    }));
  }

  /* ───── Ready system ───── */

  /** Mark a player ready. Returns true when ALL players are ready. */
  markReady(socketId) {
    this.readySet.add(socketId);
    return this.readySet.size >= this.players.size;
  }

  clearReady() {
    this.readySet.clear();
  }

  getReadyCount() {
    return this.readySet.size;
  }

  /* ───── Game flow ───── */

  startGame(locations) {
    this.locations = locations;
    this.currentRound = 0;
    this.status = 'playing';
    this.readySet.clear();
    for (const p of this.players.values()) {
      p.scores = [];
      p.totalScore = 0;
      p.guesses = [];
    }
    return this.getCurrentLocation();
  }

  getCurrentLocation() {
    return this.locations[this.currentRound] ?? null;
  }

  submitGuess(socketId, guess) {
    if (this.status !== 'playing') return false;
    if (this.roundGuesses.has(socketId)) return false; // already guessed
    this.roundGuesses.set(socketId, guess);
    return true;
  }

  allGuessesIn() {
    return this.roundGuesses.size >= this.players.size;
  }

  /** Finalize the current round — store scores and return results.
   *  Applies "steal" mechanic: if two guesses are within STEAL_RADIUS km,
   *  the closer player takes STEAL_FRACTION of the farther player's score.
   */
  finalizeRound(scoringFn) {
    const location  = this.getCurrentLocation();
    const STEAL_RADIUS   = 50;   // km — trigger distance between guesses
    const STEAL_FRACTION = 0.20; // fraction of loser's score taken

    // ── Step 1: base scores ──
    const entries = [];
    for (const [socketId, player] of this.players) {
      const guess = this.roundGuesses.get(socketId);
      let distance = null;
      let score = 0;

      if (guess) {
        distance = scoringFn.haversine(location.lat, location.lng, guess.lat, guess.lng);
        score    = scoringFn.calculateScore(distance);
      }

      entries.push({ socketId, player, guess, distance, baseScore: score, score, stolen: 0, lostToSteal: 0 });
    }

    // ── Step 2: steal — all pairs within radius ──
    const guessers = entries.filter(e => e.guess && e.score > 0);
    for (let i = 0; i < guessers.length; i++) {
      for (let j = i + 1; j < guessers.length; j++) {
        const a = guessers[i];
        const b = guessers[j];
        const guessDist = scoringFn.haversine(
          a.guess.lat, a.guess.lng, b.guess.lat, b.guess.lng
        );
        if (guessDist <= STEAL_RADIUS) {
          const [winner, loser] = a.distance <= b.distance ? [a, b] : [b, a];
          const amount = Math.floor(loser.score * STEAL_FRACTION);
          if (amount > 0) {
            winner.score  += amount;
            winner.stolen += amount;
            loser.score    = Math.max(0, loser.score - amount);
            loser.lostToSteal += amount;
          }
        }
      }
    }

    // ── Step 3: commit to player state ──
    const results = [];
    for (const { socketId, player, guess, distance, score, stolen, lostToSteal } of entries) {
      player.scores.push(score);
      player.totalScore += score;
      player.guesses.push(guess || null);

      results.push({
        socketId,
        nickname:   player.nickname,
        color:      player.color,
        guess,
        distance,
        score,
        stolen,
        lostToSteal,
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
    this.currentRound += 1;
    if (this.currentRound >= this.totalRounds) {
      this.status = 'finished';
      return null;
    }
    this.roundStartTime = Date.now();
    return this.getCurrentLocation();
  }

  /** Get final leaderboard */
  getLeaderboard() {
    return Array.from(this.players.entries())
      .map(([id, p]) => ({
        id,
        nickname: p.nickname,
        color: p.color,
        totalScore: p.totalScore,
        scores: p.scores,
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

module.exports = { createRoom, getRoom, deleteRoom, getRoomByPlayer, getAllRooms, GameRoom };
