/**
 * GeoGuessr Server
 * Express + Socket.IO for serving the game and handling multiplayer.
 */

const path = require('path');
const https = require('https');
const fs = require('fs');
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

const { createRoom, getRoom, deleteRoom, getRoomByPlayer, getAllRooms } = require('./game');

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

/* ───── Geometry helper ───── */

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ───── Coverage zones (regions with good Mapillary street-level data) ───── */

const COVERAGE_ZONES = [
  { minLat: 47.0, maxLat: 53.5, minLng:  2.0,  maxLng: 15.0  }, // DE/FR/Benelux/CH
  { minLat: 50.0, maxLat: 58.7, minLng: -8.0,  maxLng:  2.0  }, // UK/Ireland
  { minLat: 36.0, maxLat: 44.0, minLng: -9.5,  maxLng:  4.0  }, // Iberia
  { minLat: 37.0, maxLat: 47.5, minLng:  7.0,  maxLng: 18.5  }, // Italy
  { minLat: 49.0, maxLat: 54.5, minLng: 14.0,  maxLng: 24.0  }, // Poland/Czechia
  { minLat: 55.0, maxLat: 65.5, minLng:  5.0,  maxLng: 28.0  }, // Scandinavia
  { minLat: 35.5, maxLat: 42.0, minLng: 23.0,  maxLng: 30.0  }, // Balkans/Greece
  { minLat: 45.5, maxLat: 49.5, minLng: 14.0,  maxLng: 24.0  }, // Austria/Hungary
  { minLat: 44.0, maxLat: 56.0, minLng: 24.0,  maxLng: 42.0  }, // Ukraine/Belarus
  { minLat: 55.0, maxLat: 60.5, minLng: 30.0,  maxLng: 61.0  }, // Russia west
  { minLat: 36.0, maxLat: 42.0, minLng: 26.0,  maxLng: 45.0  }, // Turkey
  { minLat: 40.0, maxLat: 47.5, minLng: -90.0, maxLng: -70.0 }, // NE USA
  { minLat: 33.0, maxLat: 40.0, minLng:-122.0, maxLng: -80.0 }, // S+W USA
  { minLat: 43.0, maxLat: 50.0, minLng: -95.0, maxLng: -72.0 }, // Canada
  { minLat: 19.0, maxLat: 32.0, minLng:-117.0, maxLng: -87.0 }, // Mexico
  { minLat: -34.0,maxLat: -10.0,minLng: -65.0, maxLng: -38.0 }, // Brazil/Argentina
  { minLat: 33.0, maxLat: 43.5, minLng:130.0,  maxLng: 141.5 }, // Japan
  { minLat: 34.0, maxLat: 38.5, minLng:126.5,  maxLng: 129.5 }, // South Korea
  { minLat:  1.0, maxLat: 15.0, minLng: 99.0,  maxLng: 115.0 }, // SE Asia
  { minLat: -38.5,maxLat: -27.0,minLng:140.0,  maxLng: 153.5 }, // Australia
  { minLat: -34.5,maxLat: -26.0,minLng: 17.0,  maxLng:  31.5 }, // South Africa
];

function randomSeed() {
  const z = COVERAGE_ZONES[Math.floor(Math.random() * COVERAGE_ZONES.length)];
  return {
    lat: z.minLat + Math.random() * (z.maxLat - z.minLat),
    lng: z.minLng + Math.random() * (z.maxLng - z.minLng),
  };
}

/* ───── Panorama cache ───── */

const CACHE_FILE = path.join(__dirname, 'panorama-cache.json');

/** In-memory cache: [{id, lat, lng}, ...] */
let panoramaCache = [];

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      panoramaCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      console.log(`[cache] Loaded ${panoramaCache.length} panoramas from cache`);
    }
  } catch (e) {
    console.warn('[cache] Failed to load cache:', e.message);
    panoramaCache = [];
  }
}

function saveCache() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(panoramaCache), 'utf8');
  } catch (e) {
    console.warn('[cache] Failed to save cache:', e.message);
  }
}

function addToCache(entry) {
  // Avoid duplicates
  if (panoramaCache.some(e => e.id === entry.id)) return;
  panoramaCache.push(entry);
  // Save every 10 new entries to avoid excessive writes
  if (panoramaCache.length % 10 === 0) saveCache();
}

/** Pick N random entries from cache that are geographically spread. */
function pickFromCache(count) {
  if (panoramaCache.length < count) return null; // not enough
  // Shuffle and pick spread entries
  const shuffled = [...panoramaCache].sort(() => Math.random() - 0.5);
  const picked = [];
  for (const entry of shuffled) {
    if (picked.every(p => haversineKm(p.lat, p.lng, entry.lat, entry.lng) > 300)) {
      picked.push(entry);
      if (picked.length === count) break;
    }
  }
  // fallback: if spread requirement too strict, just take first N
  if (picked.length < count) return shuffled.slice(0, count).map(e => ({ lat: e.lat, lng: e.lng, imageId: e.id }));
  return picked.map(e => ({ lat: e.lat, lng: e.lng, imageId: e.id }));
}

loadCache();

/** Preloader state */
let preloading = false;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function mapillaryGet(url) {
  const https = require('https');
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error('HTTP ' + res.statusCode + ': ' + body.slice(0, 300)));
        } else {
          try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function findMapillaryImageOnServer(lat, lng) {
  const token = apiConfig.MAPILLARY_ACCESS_TOKEN;
  // delta=0.005° → bbox ~1.1km×1.1km (area=0.0001 sq°) — only size that works.
  // Larger deltas (0.01+) trigger "reduce data" 500 errors.
  // Strategy: retry in the same coverage zone with random spots.
  const DELTA = 0.005;
  const MAX_ATTEMPTS = 60;

  // Find which coverage zone contains the seed.
  const zone = COVERAGE_ZONES.find(z =>
    lat >= z.minLat && lat <= z.maxLat && lng >= z.minLng && lng <= z.maxLng
  ) || COVERAGE_ZONES[Math.floor(Math.random() * COVERAGE_ZONES.length)];

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const testLat = attempt === 0 ? lat : zone.minLat + Math.random() * (zone.maxLat - zone.minLat);
    const testLng = attempt === 0 ? lng : zone.minLng + Math.random() * (zone.maxLng - zone.minLng);

    const bbox = [
      (testLng - DELTA).toFixed(6),
      (testLat - DELTA).toFixed(6),
      (testLng + DELTA).toFixed(6),
      (testLat + DELTA).toFixed(6),
    ].join(',');

    const params = new URLSearchParams({
      access_token: token,
      fields: 'id,geometry',
      limit: '1',
      is_pano: 'true',
      bbox,
    });

    try {
      const data = await mapillaryGet('https://graph.mapillary.com/images?' + params);
      if (!data || !data.data || !data.data.length) {
        await sleep(150); // small pause between requests to avoid rate limiting
        continue;
      }
      const img = data.data[0];
      const coords = img.geometry && img.geometry.coordinates;
      if (!coords) continue;
      console.log('[findMapillaryImage] found after ' + (attempt + 1) + ' attempt(s): ' + img.id);
      const result = { id: img.id, lat: coords[1], lng: coords[0] };
      addToCache(result);
      return result;
    } catch (err) {
      const msg = (err.message || '');
      console.warn('[findMapillaryImage] attempt=' + attempt + ' (' + testLat.toFixed(3) + ',' + testLng.toFixed(3) + '): ' + msg.slice(0, 80));
      await sleep(msg.indexOf('timeout') !== -1 ? 1000 : 300);
    }
  }
  return null;
}

async function resolveLocationsForGame(count, onProgress) {
  if (!count) count = 5;

  // Fast path: use cache if we have enough entries
  const cached = pickFromCache(count);
  if (cached && cached.length >= count) {
    console.log(`[resolveLocations] Using ${count} cached panoramas`);
    cached.forEach((loc, i) => {
      if (onProgress) onProgress(i + 1, loc);
    });
    return cached;
  }

  console.log(`[resolveLocations] Cache too small (${panoramaCache.length}), searching API...`);

  const found = [];
  const usedZoneIndices = new Set();
  let totalAttempts = 0;
  const MAX_TOTAL = count * 4;

  while (found.length < count && totalAttempts < MAX_TOTAL) {
    totalAttempts++;

    let zoneIdx;
    if (usedZoneIndices.size < COVERAGE_ZONES.length) {
      do { zoneIdx = Math.floor(Math.random() * COVERAGE_ZONES.length); }
      while (usedZoneIndices.has(zoneIdx));
    } else {
      zoneIdx = Math.floor(Math.random() * COVERAGE_ZONES.length);
    }
    usedZoneIndices.add(zoneIdx);
    const zone = COVERAGE_ZONES[zoneIdx];

    const seed = {
      lat: zone.minLat + Math.random() * (zone.maxLat - zone.minLat),
      lng: zone.minLng + Math.random() * (zone.maxLng - zone.minLng),
    };

    console.log('[resolveLocations] searching ' + (found.length + 1) + '/' + count + ' (attempt ' + totalAttempts + ')...');
    const img = await findMapillaryImageOnServer(seed.lat, seed.lng);
    if (img) {
      const loc = { lat: img.lat, lng: img.lng, imageId: img.id };
      found.push(loc);
      if (onProgress) onProgress(found.length, loc);
      console.log('[resolveLocations] [' + found.length + '/' + count + '] id=' + img.id);
    }
  }

  return found;
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

// Serve locations for solo mode -- resolved server-side (panorama coords = scoring point)
app.get('/api/locations', async (_req, res) => {
  try {
    console.log('[/api/locations] Resolving random panoramas...');
    const locations = await resolveLocationsForGame(5);
    res.json(locations);
  } catch (err) {
    console.error('/api/locations error:', err);
    res.status(500).json({ error: err.message });
  }
});

// List open rooms (for room browser)
app.get('/api/rooms', (_req, res) => {
  res.json(getAllRooms());
});

// Panorama cache status
app.get('/api/preload/status', (_req, res) => {
  res.json({ count: panoramaCache.length, running: preloading });
});

// Start background preloading
app.post('/api/preload/start', (_req, res) => {
  if (preloading) return res.json({ ok: true, message: 'Already running' });
  preloading = true;
  res.json({ ok: true });
  console.log('[preload] Background preloading started');
  (async () => {
    while (preloading) {
      try {
        const seed = randomSeed();
        const img = await findMapillaryImageOnServer(seed.lat, seed.lng);
        if (img) {
          console.log(`[preload] Cached: ${img.id} (total: ${panoramaCache.length})`);
        }
        await sleep(200);
      } catch (e) {
        await sleep(1000);
      }
    }
    saveCache();
    console.log('[preload] Stopped. Cache saved: ' + panoramaCache.length + ' panoramas');
  })();
});

// Stop background preloading
app.post('/api/preload/stop', (_req, res) => {
  preloading = false;
  saveCache();
  res.json({ ok: true, count: panoramaCache.length });
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
      if (!room) return cb?.({ success: false, error: 'Komната не найдена' });
      if (room.hostId !== socket.id) return cb?.({ success: false, error: 'Только хост может начать' });
      if (room.players.size < 1) return cb?.({ success: false, error: 'Недостаточно игроков' });

      cb?.({ success: true });  // ack immediately so host UI unblocks

      // Tell all lobby players we are searching for panoramas
      io.to(room.code).emit('resolving-panoramas', { total: room.totalRounds, found: 0 });
      console.log(`[start-game] Resolving ${room.totalRounds} panoramas for room ${room.code}...`);

      const locations = await resolveLocationsForGame(room.totalRounds, (n, loc) => {
        io.to(room.code).emit('resolving-panoramas', { total: room.totalRounds, found: n });
        console.log(`  [${n}/${room.totalRounds}] ${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)} id=${loc.imageId}`);
      });

      if (locations.length === 0) {
        io.to(room.code).emit('game-error', { message: 'Не удалось найти панорамы — попробуйте ещё раз' });
        return;
      }

      // Store pre-resolved images on the room so next-round never calls the API again
      room.resolvedImages = locations.map(l => ({ id: l.imageId }));

      const firstLocation = room.startGame(locations);
      room.roundStartTime = Date.now();

      io.to(room.code).emit('round-start', {
        round: room.currentRound + 1,
        totalRounds: room.totalRounds,
        location: { lat: firstLocation.lat, lng: firstLocation.lng },
        imageId: locations[0].imageId ?? null,
      });
      console.log(`Game started in room ${room.code} [imageId=${locations[0].imageId ?? 'none'}]`);
    } catch (err) {
      console.error('[start-game] error:', err);
      const room = getRoomByPlayer(socket.id);
      if (room) io.to(room.code).emit('game-error', { message: err.message });
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

    // Use the pre-resolved imageId -- no API call needed
    const imageId = room.resolvedImages?.[room.currentRound]?.id ?? null;

    cb?.({ success: true, finished: false });
    io.to(room.code).emit('round-start', {
      round: room.currentRound + 1,
      totalRounds: room.totalRounds,
      location: { lat: nextLoc.lat, lng: nextLoc.lng },
      imageId,
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
