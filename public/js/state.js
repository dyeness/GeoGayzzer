/**
 * GameState — central state management for the game.
 */

const GameState = (() => {
  const state = {
    mode: 'solo',           // 'solo' | 'multiplayer'
    nickname: '',
    roomCode: null,
    isHost: false,

    // Round data
    locations: [],          // Array of {lat, lng, name, country}
    currentRound: 0,        // 0-indexed
    totalRounds: 5,
    roundScores: [],        // Score per round
    roundDistances: [],     // Distance per round (km)
    roundGuesses: [],       // Player's guess per round {lat, lng}
    totalScore: 0,

    // Current round
    currentLocation: null,  // {lat, lng, name?, country?}
    currentGuess: null,     // {lat, lng}
    mapillaryImageId: null, // Current Mapillary image ID

    // Multiplayer
    multiplayerResults: [], // Per-round results from server
  };

  return {
    /** Get a state value */
    get(key) {
      return state[key];
    },

    /** Set a state value */
    set(key, value) {
      state[key] = value;
    },

    /** Reset game state for a new game */
    resetGame() {
      state.currentRound = 0;
      state.roundScores = [];
      state.roundDistances = [];
      state.roundGuesses = [];
      state.totalScore = 0;
      state.currentLocation = null;
      state.currentGuess = null;
      state.mapillaryImageId = null;
      state.multiplayerResults = [];
    },

    /** Record the result of a round */
    recordRound(distance, score, guess) {
      state.roundScores.push(score);
      state.roundDistances.push(distance);
      state.roundGuesses.push(guess);
      state.totalScore += score;
      state.currentRound += 1;
    },

    /** Check if all rounds are done */
    isGameOver() {
      return state.currentRound >= state.totalRounds;
    },

    /** Get snapshot of the full state (for debugging) */
    snapshot() {
      return { ...state };
    },
  };
})();
