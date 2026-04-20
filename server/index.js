/**
 * GeoGuessr Server
 * Express + Socket.IO for serving the game and handling multiplayer.
 */

const path = require('path');
const https = require('https');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');

// Load API config
let apiConfig;
try {
  apiConfig = require('../config/api');
} catch {
  console.error('⚠  config/api.js not found. Copy config/api.example.js → config/api.js and add your tokens.');
  process.exit(1);
}

const { createRoom, getRoom, deleteRoom, getRoomByPlayer } = require('./game');

/* ───── Scoring helpers (mirrored on server for multiplayer validation) ───── */

const scoring = {
  haversine(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },
  calculateScore(distanceKm) {
    const MAX = 5000;
    return Math.round(MAX * Math.exp(-distanceKm / 2000));
  },
};

/* ───── Locations pool (same as client — authoritative copy for multiplayer) ───── */

const LOCATIONS = [
  // Europe
  { lat: 48.8584, lng: 2.2945,   name: 'Eiffel Tower',       country: 'France' },
  { lat: 51.5007, lng: -0.1246,  name: 'Big Ben',             country: 'UK' },
  { lat: 41.8902, lng: 12.4922,  name: 'Colosseum',           country: 'Italy' },
  { lat: 41.4036, lng: 2.1744,   name: 'Sagrada Familia',     country: 'Spain' },
  { lat: 41.0086, lng: 28.9802,  name: 'Hagia Sophia',        country: 'Turkey' },
  { lat: 52.5163, lng: 13.3777,  name: 'Brandenburg Gate',    country: 'Germany' },
  { lat: 52.3731, lng: 4.8932,   name: 'Dam Square',          country: 'Netherlands' },
  { lat: 50.0875, lng: 14.4213,  name: 'Old Town Square',     country: 'Czech Republic' },
  { lat: 37.9715, lng: 23.7267,  name: 'Acropolis',           country: 'Greece' },
  { lat: 38.6916, lng: -9.2160,  name: 'Belem Tower',         country: 'Portugal' },
  { lat: 48.2082, lng: 16.3738,  name: 'St. Stephen\'s Cathedral', country: 'Austria' },
  { lat: 47.5072, lng: 19.0457,  name: 'Parliament',          country: 'Hungary' },
  { lat: 59.3293, lng: 18.0686,  name: 'Gamla Stan',          country: 'Sweden' },
  { lat: 59.9065, lng: 10.7548,  name: 'Opera House',         country: 'Norway' },
  { lat: 55.9486, lng: -3.2008,  name: 'Edinburgh Castle',    country: 'Scotland' },
  { lat: 53.3438, lng: -6.2546,  name: 'Trinity College',     country: 'Ireland' },
  { lat: 41.1469, lng: -8.6144,  name: 'Clérigos Tower',      country: 'Portugal' },
  { lat: 50.8467, lng: 4.3525,   name: 'Grand Place',         country: 'Belgium' },
  { lat: 37.3861, lng: -5.9927,  name: 'Seville Cathedral',   country: 'Spain' },
  { lat: 47.3769, lng: 8.5417,   name: 'Old Town Zurich',     country: 'Switzerland' },
  { lat: 52.2318, lng: 21.0063,  name: 'Palace of Culture',   country: 'Poland' },
  // Americas
  { lat: 40.7580, lng: -73.9855, name: 'Times Square',        country: 'USA' },
  { lat: -22.9711, lng: -43.1822,name: 'Copacabana Beach',    country: 'Brazil' },
  { lat: -34.6037, lng: -58.3816,name: 'Obelisco',            country: 'Argentina' },
  { lat: 37.8199, lng: -122.4783,name: 'Golden Gate Bridge',  country: 'USA' },
  { lat: 19.4326, lng: -99.1332, name: 'Zócalo',              country: 'Mexico' },
  { lat: 43.6426, lng: -79.3871, name: 'CN Tower',            country: 'Canada' },
  { lat: 49.2827, lng: -123.1207,name: 'Stanley Park',        country: 'Canada' },
  { lat: -12.0464, lng: -77.0308,name: 'Plaza Mayor',         country: 'Peru' },
  { lat: 4.6097,  lng: -74.0817, name: 'La Candelaria',       country: 'Colombia' },
  { lat: -33.4372, lng: -70.6506,name: 'Plaza de Armas',      country: 'Chile' },
  { lat: 23.1366, lng: -82.3539, name: 'Malecón',             country: 'Cuba' },
  // Asia
  { lat: 35.6595, lng: 139.7004, name: 'Shibuya Crossing',    country: 'Japan' },
  { lat: 13.7500, lng: 100.4913, name: 'Grand Palace',        country: 'Thailand' },
  { lat: 1.2814,  lng: 103.8585, name: 'Marina Bay',          country: 'Singapore' },
  { lat: 25.1972, lng: 55.2744,  name: 'Burj Khalifa',        country: 'UAE' },
  { lat: 39.9163, lng: 116.3972, name: 'Forbidden City',      country: 'China' },
  { lat: 31.2304, lng: 121.4737, name: 'The Bund',            country: 'China' },
  { lat: 37.5796, lng: 126.9770, name: 'Gyeongbokgung',       country: 'South Korea' },
  { lat: 18.9218, lng: 72.8347,  name: 'Gateway of India',    country: 'India' },
  { lat: 28.6129, lng: 77.2295,  name: 'India Gate',          country: 'India' },
  { lat: 10.7769, lng: 106.6980, name: 'Ben Thanh Market',    country: 'Vietnam' },
  { lat: 3.1569,  lng: 101.7123, name: 'Petronas Towers',     country: 'Malaysia' },
  { lat: 25.0338, lng: 121.5645, name: 'Taipei 101',          country: 'Taiwan' },
  { lat: 22.2975, lng: 114.1722, name: 'Tsim Sha Tsui',       country: 'Hong Kong' },
  // Africa
  { lat: 29.9792, lng: 31.1342,  name: 'Pyramids of Giza',    country: 'Egypt' },
  { lat: -33.9249, lng: 18.4241, name: 'Table Mountain',      country: 'South Africa' },
  { lat: 31.6260, lng: -7.9891,  name: 'Djemaa el-Fna',       country: 'Morocco' },
  { lat: 33.6073, lng: -7.6320,  name: 'Hassan II Mosque',    country: 'Morocco' },
  { lat: -1.2921, lng: 36.8219,  name: 'Kenyatta Avenue',     country: 'Kenya' },
  // Oceania
  { lat: -33.8568, lng: 151.2153,name: 'Sydney Opera House',  country: 'Australia' },
  { lat: -37.8183, lng: 144.9671,name: 'Flinders Street',     country: 'Australia' },
  { lat: -36.8272, lng: 174.7658,name: 'Harbour Bridge',      country: 'New Zealand' },
  // Russia / CIS
  { lat: 55.7539, lng: 37.6208,  name: 'Red Square',          country: 'Russia' },
  { lat: 59.9541, lng: 30.3161,  name: 'Palace Square',       country: 'Russia' },
];

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pickRandomLocations(count = 5) {
  const shuffled = [...LOCATIONS].sort(() => Math.random() - 0.5);
  const picked = [];
  for (const loc of shuffled) {
    // Require at least 500 km distance from every already-picked location
    const tooClose = picked.some(p => haversineKm(loc.lat, loc.lng, p.lat, p.lng) < 500);
    if (!tooClose) picked.push(loc);
    if (picked.length === count) break;
  }
  return picked;
}

/** Promisified https GET with 6s timeout. Resolves with parsed JSON or rejects. */
function mapillaryGet(url) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), 6000);
    const req = https.get(url, (res) => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => {
        clearTimeout(timer);
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 120)}`)); return; }
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('error', (e) => { clearTimeout(timer); reject(e); });
    req.end();
  });
}

/**
 * Sequentially search for the closest Mapillary panorama near a coordinate.
 * Tries increasingly large bboxes, stops as soon as one returns results.
 * Sequential (not parallel) to avoid hitting Mapillary rate limits at game start.
 * @returns {Promise<{ id: string, lat: number, lng: number } | null>}
 */
async function findMapillaryImageOnServer(lat, lng) {
  const token = apiConfig.MAPILLARY_ACCESS_TOKEN;
  // Deltas chosen so bbox area = (2*delta)^2 stays under Mapillary's 0.010 sq° limit
  const deltas = [0.005, 0.01, 0.025, 0.04];

  for (const delta of deltas) {
    const bbox = [lng - delta, lat - delta, lng + delta, lat + delta].join(',');
    const params = new URLSearchParams({
      access_token: token,
      fields: 'id,geometry,computed_geometry',
      limit: '10',
      is_pano: 'true',
      bbox,
    });

    try {
      const data = await mapillaryGet(`https://graph.mapillary.com/images?${params}`);
      if (!data?.data?.length) continue;

      let closest = null, minDist = Infinity;
      for (const img of data.data) {
        const coords = img.computed_geometry?.coordinates ?? img.geometry?.coordinates;
        if (!coords) continue;
        const [imgLng, imgLat] = coords;
        const d = scoring.haversine(lat, lng, imgLat, imgLng);
        if (d < minDist) { minDist = d; closest = { id: img.id, lat: imgLat, lng: imgLng }; }
      }
      if (closest) return closest;
    } catch (err) {
      console.warn(`[findMapillaryImage] delta=${delta} failed: ${err.message}`);
    }
  }
  return null;
}

/* ───── Express Setup ───── */

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Serve API config (non-sensitive tokens that client needs)
app.get('/api/config', (_req, res) => {
  res.json({
    mapillaryToken: apiConfig.MAPILLARY_ACCESS_TOKEN,
  });
});

// Serve locations for solo mode
app.get('/api/locations', (_req, res) => {
  res.json(pickRandomLocations(5));
});

// Proxy Mapillary Graph API — server-side, token never exposed to client
app.get('/api/mapillary/images', (req, res) => {
  const token = apiConfig.MAPILLARY_ACCESS_TOKEN;
  const { bbox, limit, is_pano } = req.query;

  if (!bbox) return res.status(400).json({ error: 'bbox required' });

  const params = new URLSearchParams({
    access_token: token,
    fields: 'id,geometry,computed_geometry',
    limit: limit || '25',
    bbox,
  });
  if (is_pano) params.set('is_pano', is_pano);

  const url = `https://graph.mapillary.com/images?${params}`;
  console.log('[Mapillary]', url.replace(token, '***'));

  const request = https.get(url, (upstream) => {
    let body = '';
    upstream.on('data', chunk => { body += chunk; });
    upstream.on('end', () => {
      if (upstream.statusCode !== 200) {
        console.error(`[Mapillary] ${upstream.statusCode}:`, body.slice(0, 300));
      }
      res.status(upstream.statusCode).set('Content-Type', 'application/json').send(body);
    });
  });
  request.on('error', (err) => {
    console.error('[Mapillary] request error:', err.message);
    res.status(502).json({ error: err.message });
  });
  request.end();
});

/* ───── Socket.IO Setup ───── */

const io = new Server(server, {
  cors: { origin: '*' },
});

io.on('connection', (socket) => {
  console.log(`⚡ Connected: ${socket.id}`);

  /* Create a room */
  socket.on('create-room', ({ nickname }, cb) => {
    const room = createRoom(socket.id, nickname);
    socket.join(room.code);
    cb({ success: true, code: room.code, players: room.getPlayerList() });
    console.log(`🏠 Room ${room.code} created by ${nickname}`);
  });

  /* Join a room */
  socket.on('join-room', ({ code, nickname }, cb) => {
    const room = getRoom(code);
    if (!room) return cb({ success: false, error: 'Комната не найдена' });
    if (room.status !== 'waiting') return cb({ success: false, error: 'Игра уже началась' });
    if (room.players.size >= 10) return cb({ success: false, error: 'Комната заполнена' });

    room.addPlayer(socket.id, nickname);
    socket.join(room.code);
    cb({ success: true, code: room.code, players: room.getPlayerList() });
    socket.to(room.code).emit('player-joined', { players: room.getPlayerList() });
    console.log(`👤 ${nickname} joined room ${room.code}`);
  });

  /* Host starts the game */
  socket.on('start-game', async (_, cb) => {
    try {
      const room = getRoomByPlayer(socket.id);
      if (!room) return cb?.({ success: false, error: 'Комната не найдена' });
      if (room.hostId !== socket.id) return cb?.({ success: false, error: 'Только хост может начать' });
      if (room.players.size < 1) return cb?.({ success: false, error: 'Недостаточно игроков' });

      const locations = pickRandomLocations(5);
      const firstLocation = room.startGame(locations);
      room.roundStartTime = Date.now();

      // Resolve the Mapillary image on the server so ALL players load the SAME panorama
      const image = await findMapillaryImageOnServer(firstLocation.lat, firstLocation.lng);

      cb?.({ success: true });
      io.to(room.code).emit('round-start', {
        round: room.currentRound + 1,
        totalRounds: room.totalRounds,
        location: { lat: firstLocation.lat, lng: firstLocation.lng },
        imageId: image?.id ?? null,
      });
      console.log(`🎮 Game started in room ${room.code} [imageId=${image?.id ?? 'none'}]`);
    } catch (err) {
      console.error('[start-game] error:', err);
      cb?.({ success: false, error: err.message });
    }
  });

  /* Player submits a guess */
  socket.on('submit-guess', ({ lat, lng }, cb) => {
    const room = getRoomByPlayer(socket.id);
    if (!room) return cb({ success: false });

    const ok = room.submitGuess(socket.id, { lat, lng });
    if (!ok) return cb({ success: false, error: 'Уже отгадано' });

    cb({ success: true });
    // Notify others that a player has guessed
    socket.to(room.code).emit('player-guessed', {
      playersGuessed: room.roundGuesses.size,
      totalPlayers: room.players.size,
    });

    // If all guesses are in, finalize the round
    if (room.allGuessesIn()) {
      const results = room.finalizeRound(scoring);
      const loc = room.getCurrentLocation();
      io.to(room.code).emit('round-results', {
        results,
        location: loc,
        round: room.currentRound + 1,
      });
    }
  });

  /* Advance to the next round */
  socket.on('next-round', async (_, cb) => {
    const room = getRoomByPlayer(socket.id);
    if (!room || room.hostId !== socket.id) return cb?.({ success: false });

    const nextLoc = room.nextRound();
    if (!nextLoc) {
      // Game over
      io.to(room.code).emit('game-over', { leaderboard: room.getLeaderboard() });
      return cb?.({ success: true, finished: true });
    }

    // Resolve Mapillary image on the server so all clients load the same panorama
    const image = await findMapillaryImageOnServer(nextLoc.lat, nextLoc.lng);

    cb?.({ success: true, finished: false });
    io.to(room.code).emit('round-start', {
      round: room.currentRound + 1,
      totalRounds: room.totalRounds,
      location: { lat: nextLoc.lat, lng: nextLoc.lng },
      imageId: image?.id ?? null,
    });
  });

  /* Disconnect */
  socket.on('disconnect', () => {
    const room = getRoomByPlayer(socket.id);
    if (room) {
      room.removePlayer(socket.id);
      if (room.players.size === 0) {
        deleteRoom(room.code);
        console.log(`🗑  Room ${room.code} deleted (empty)`);
      } else {
        // Transfer host if needed
        if (room.hostId === socket.id) {
          room.hostId = room.players.keys().next().value;
        }
        io.to(room.code).emit('player-left', { players: room.getPlayerList() });
      }
    }
    console.log(`💤 Disconnected: ${socket.id}`);
  });
});

/* ───── Start ───── */

// Prevent crashes from unhandled async errors in socket handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🌍 GeoGuessr Server running on port ${PORT}`);
  console.log('─'.repeat(45));

  // Show all network interfaces for Radmin VPN
  const nets = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(nets)) {
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        console.log(`  ${name}: http://${addr.address}:${PORT}`);
      }
    }
  }

  console.log(`  Local:   http://localhost:${PORT}`);
  console.log('─'.repeat(45));
  console.log('Поделись IP-адресом Radmin VPN с друзьями для совместной игры.\n');
});
