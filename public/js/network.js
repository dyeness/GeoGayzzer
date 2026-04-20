/**
 * Network — Socket.IO client for multiplayer functionality.
 * Connects to the game server (local or Radmin VPN).
 */

const Network = (() => {
  let socket = null;
  let serverUrl = null;

  /** Connect to a game server */
  function connect(url = window.location.origin) {
    return new Promise((resolve, reject) => {
      if (socket?.connected) {
        socket.disconnect();
      }

      serverUrl = url;
      socket = io(url, {
        transports: ['websocket', 'polling'],
        timeout: 5000,
        reconnection: true,
        reconnectionAttempts: 3,
      });

      socket.on('connect', () => {
        console.log('Connected to server:', url);
        resolve(socket);
      });

      socket.on('connect_error', (err) => {
        console.error('Connection failed:', err.message);
        reject(err);
      });

      // Set up event listeners
      setupListeners();
    });
  }

  /** Disconnect from the server */
  function disconnect() {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
  }

  /** Whether we are currently connected */
  function isConnected() {
    return socket?.connected ?? false;
  }

  /* ── Room Operations ── */

  function createRoom(nickname, color) {
    return new Promise((resolve, reject) => {
      if (!socket) return reject(new Error('Not connected'));
      socket.emit('create-room', { nickname, color }, (response) => {
        if (response.success) resolve(response);
        else reject(new Error(response.error || 'Failed'));
      });
    });
  }

  function joinRoom(code, nickname, color) {
    return new Promise((resolve, reject) => {
      if (!socket) return reject(new Error('Not connected'));
      socket.emit('join-room', { code: code.toUpperCase(), nickname, color }, (response) => {
        if (response.success) resolve(response);
        else reject(new Error(response.error || 'Failed'));
      });
    });
  }

  function startGame(excludeIds = []) {
    return new Promise((resolve, reject) => {
      if (!socket) return reject(new Error('Not connected'));
      socket.emit('start-game', { excludeIds }, (response) => {
        if (response.success) resolve(response);
        else reject(new Error(response.error || 'Failed'));
      });
    });
  }

  function submitGuess(lat, lng) {
    return new Promise((resolve, reject) => {
      if (!socket) return reject(new Error('Not connected'));
      socket.emit('submit-guess', { lat, lng }, (response) => {
        if (response.success) resolve(response);
        else reject(new Error(response.error || 'Failed'));
      });
    });
  }

  function playerReady() {
    return new Promise((resolve, reject) => {
      if (!socket) return reject(new Error('Not connected'));
      socket.emit('player-ready', null, (response) => {
        if (response?.success) resolve(response);
        else reject(new Error(response?.error || 'Failed'));
      });
    });
  }

  function updateColor(color) {
    return new Promise((resolve, reject) => {
      if (!socket) return reject(new Error('Not connected'));
      socket.emit('update-color', { color }, (response) => {
        if (response?.success) resolve(response);
        else reject(new Error(response?.error || 'Failed'));
      });
    });
  }

  function rejoinRoom(code, nickname, color) {
    return new Promise((resolve, reject) => {
      if (!socket) return reject(new Error('Not connected'));
      socket.emit('rejoin-room', { code: code.toUpperCase(), nickname, color }, (response) => {
        if (response.success) resolve(response);
        else reject(new Error(response.error || 'Failed'));
      });
    });
  }

  function requestNextRound() {
    return new Promise((resolve, reject) => {
      if (!socket) return reject(new Error('Not connected'));
      socket.emit('next-round', null, (response) => {
        if (response?.success) resolve(response);
        else reject(new Error(response?.error || 'Failed'));
      });
    });
  }

  /** Fetch list of open rooms from the server (no socket needed, plain HTTP). */
  async function getRooms(serverUrl = window.location.origin) {
    const url = serverUrl.replace(/\/$/, '');
    const res = await fetch(`${url}/api/rooms`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  /* ── Event Listeners ── */

  /** Callbacks that the App module can set */
  const callbacks = {
    onPlayerJoined: null,
    onPlayerLeft: null,
    onRoundStart: null,
    onPlayerGuessed: null,
    onRoundResults: null,
    onGameOver: null,
    onResolvingPanoramas: null,
    onGameError: null,
    onReadyUpdate: null,
  };

  function on(event, cb) {
    callbacks[event] = cb;
  }

  function setupListeners() {
    if (!socket) return;

    socket.on('player-joined', (data) => {
      callbacks.onPlayerJoined?.(data);
    });

    socket.on('player-left', (data) => {
      callbacks.onPlayerLeft?.(data);
    });

    socket.on('round-start', (data) => {
      callbacks.onRoundStart?.(data);
    });

    socket.on('player-guessed', (data) => {
      callbacks.onPlayerGuessed?.(data);
    });

    socket.on('round-results', (data) => {
      callbacks.onRoundResults?.(data);
    });

    socket.on('game-over', (data) => {
      callbacks.onGameOver?.(data);
    });

    socket.on('resolving-panoramas', (data) => {
      callbacks.onResolvingPanoramas?.(data);
    });

    socket.on('game-error', (data) => {
      callbacks.onGameError?.(data);
    });

    socket.on('ready-update', (data) => {
      callbacks.onReadyUpdate?.(data);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });
  }

  return {
    connect,
    disconnect,
    isConnected,
    createRoom,
    joinRoom,
    rejoinRoom,
    startGame,
    submitGuess,
    playerReady,
    updateColor,
    requestNextRound,
    getRooms,
    on,
  };
})();
