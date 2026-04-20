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
  constructor(code, hostId, hostNickname) {
    this.code = code;
    this.hostId = hostId;
    this.players = new Map();
    this.locations = [];
    this.currentRound = 0;
    this.totalRounds = 5;
    this.status = 'waiting'; // waiting | playing | finished
    this.roundGuesses = new Map();
    this.roundStartTime = null;
    this.roundTimeLimit = 120_000; // 2 minutes per round
    this.addPlayer(hostId, hostNickname);
  }

  /* ───── Player management ───── */

  addPlayer(socketId, nickname) {
    this.players.set(socketId, {
      nickname,
      scores: [],
      totalScore: 0,
      guesses: [],
    });
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
    this.roundGuesses.delete(socketId);
  }

  getPlayerList() {
    return Array.from(this.players.entries()).map(([id, p]) => ({
      id,
      nickname: p.nickname,
      totalScore: p.totalScore,
      isHost: id === this.hostId,
    }));
  }

  /* ───── Game flow ───── */

  startGame(locations) {
    this.locations = locations;
    this.currentRound = 0;
    this.status = 'playing';
    // Reset all player scores
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

  /** Finalize the current round — store scores and return results */
  finalizeRound(scoringFn) {
    const location = this.getCurrentLocation();
    const results = [];

    for (const [socketId, player] of this.players) {
      const guess = this.roundGuesses.get(socketId);
      let distance = null;
      let score = 0;

      if (guess) {
        distance = scoringFn.haversine(location.lat, location.lng, guess.lat, guess.lng);
        score = scoringFn.calculateScore(distance);
      }

      player.scores.push(score);
      player.totalScore += score;
      player.guesses.push(guess || null);

      results.push({
        socketId,
        nickname: player.nickname,
        guess,
        distance,
        score,
        totalScore: player.totalScore,
      });
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    return results;
  }

  /** Advance to the next round or end the game */
  nextRound() {
    this.roundGuesses.clear();
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
        totalScore: p.totalScore,
        scores: p.scores,
      }))
      .sort((a, b) => b.totalScore - a.totalScore);
  }
}

/* ───── Room Registry ───── */

const rooms = new Map();

function createRoom(hostId, hostNickname) {
  let code = generateRoomCode();
  while (rooms.has(code)) code = generateRoomCode();
  const room = new GameRoom(code, hostId, hostNickname);
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
