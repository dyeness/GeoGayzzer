/**
 * GeoGAYZZER Server
 * Express + Socket.IO for serving the game and handling multiplayer.
 */

const path = require('path');
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');
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

const { createRoom, getRoom, deleteRoom, getRoomByPlayer, getAllRooms, TEAM_NAMES } = require('./game');
const profiles = require('./profiles');

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
    return Math.round(MAX * Math.exp(-distanceKm / 1000));
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
  { name: 'Германия / Франция / Швейцария', minLat: 47.0, maxLat: 53.5, minLng:  2.0,  maxLng: 15.0  },
  { name: 'Великобритания / Ирландия',  minLat: 50.0, maxLat: 58.7, minLng: -8.0,  maxLng:  2.0  },
  { name: 'Испания / Португалия',             minLat: 36.0, maxLat: 44.0, minLng: -9.5,  maxLng:  4.0  },
  { name: 'Италия',                          minLat: 37.0, maxLat: 47.5, minLng:  7.0,  maxLng: 18.5  },
  { name: 'Польша / Чехия',                  minLat: 49.0, maxLat: 54.5, minLng: 14.0,  maxLng: 24.0  },
  { name: 'Скандинавия',                    minLat: 55.0, maxLat: 65.5, minLng:  5.0,  maxLng: 28.0  },
  { name: 'Балканы / Греция',               minLat: 35.5, maxLat: 42.0, minLng: 23.0,  maxLng: 30.0  },
  { name: 'Австрия / Венгрия',             minLat: 45.5, maxLat: 49.5, minLng: 14.0,  maxLng: 24.0  },
  { name: 'Украина / Беларусь',            minLat: 44.0, maxLat: 56.0, minLng: 24.0,  maxLng: 42.0  },
  { name: 'Западная Россия',               minLat: 55.0, maxLat: 60.5, minLng: 30.0,  maxLng: 61.0  },
  { name: 'Турция',                          minLat: 36.0, maxLat: 42.0, minLng: 26.0,  maxLng: 45.0  },
  { name: 'Северо-восток США',          minLat: 40.0, maxLat: 47.5, minLng: -90.0, maxLng: -70.0 },
  { name: 'Юг / Запад США',             minLat: 33.0, maxLat: 40.0, minLng:-122.0, maxLng: -80.0 },
  { name: 'Канада',                          minLat: 43.0, maxLat: 50.0, minLng: -95.0, maxLng: -72.0 },
  { name: 'Мексика',                         minLat: 19.0, maxLat: 32.0, minLng:-117.0, maxLng: -87.0 },
  { name: 'Бразилия / Аргентина',       minLat: -34.0,maxLat: -10.0,minLng: -65.0, maxLng: -38.0 },
  { name: 'Япония',                          minLat: 33.0, maxLat: 43.5, minLng:130.0,  maxLng: 141.5 },
  { name: 'Южная Корея',                  minLat: 34.0, maxLat: 38.5, minLng:126.5,  maxLng: 129.5 },
  { name: 'Юго-восточная Азия',          minLat:  1.0, maxLat: 15.0, minLng: 99.0,  maxLng: 115.0 },
  { name: 'Австралия',                        minLat: -38.5,maxLat: -27.0,minLng:140.0,  maxLng: 153.5 },
  { name: 'Южная Африка',                minLat: -34.5,maxLat: -26.0,minLng: 17.0,  maxLng:  31.5 },
];

function randomSeed() {
  const z = COVERAGE_ZONES[Math.floor(Math.random() * COVERAGE_ZONES.length)];
  return {
    lat: z.minLat + Math.random() * (z.maxLat - z.minLat),
    lng: z.minLng + Math.random() * (z.maxLng - z.minLng),
  };
}

function randomSeedInZone(zone) {
  return {
    lat: zone.minLat + Math.random() * (zone.maxLat - zone.minLat),
    lng: zone.minLng + Math.random() * (zone.maxLng - zone.minLng),
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
  if (panoramaCache.some(e => e.id === entry.id)) return;
  panoramaCache.push(entry);
  if (panoramaCache.length % 10 === 0) saveCache();
}

/** Reverse-geocode lat/lng via Nominatim. Returns { country, city } or nulls. */
async function reverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat.toFixed(5)}&lon=${lng.toFixed(5)}&format=json&zoom=10&accept-language=ru`;
    const data = await new Promise((resolve, reject) => {
      const req = https.get(url, { headers: { 'User-Agent': 'GeoGAYZZER/1.0 (educational)' } }, (res) => {
        let body = '';
        res.on('data', c => { body += c; });
        res.on('end', () => { try { resolve(JSON.parse(body)); } catch { reject(new Error('parse')); } });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
      req.end();
    });
    const addr = data?.address ?? {};
    return {
      country: addr.country ?? null,
      city:    addr.city ?? addr.town ?? addr.municipality ?? addr.county ?? addr.village ?? null,
    };
  } catch {
    return { country: null, city: null };
  }
}

/** Pick N random entries from cache that are geographically spread.
 *
 *  Priority: panoramas with 0 plays are ALWAYS preferred over played ones.
 *  Only when there aren't enough never-played panoramas do we fall back to
 *  played ones (lowest play count first, weighted random within that tier).
 *
 *  Within each tier, weighted random is used:
 *    0-play tier:  uniform weight
 *    played tier:  weight = 1 / (1 + plays)^2
 */
function pickFromCache(count, excludeSet = new Set()) {
  // Exclude panoramas already used this server session or explicitly excluded
  const available = panoramaCache.filter(e => !sessionUsed.has(e.id) && !excludeSet.has(e.id));
  if (available.length < count) return null; // not enough fresh ones

  // Split into never-played vs played pools
  const neverPlayed = available.filter(e => !(panPlays[e.id] > 0));
  const played      = available.filter(e =>  (panPlays[e.id] > 0))
                                .map(e => ({ entry: e, weight: 1 / Math.pow(1 + panPlays[e.id], 2) }));

  // Weighted random pick from a pool [{entry, weight}] or [entry] (uniform)
  function weightedPick(pool, uniform = false) {
    if (uniform) {
      return pool[Math.floor(Math.random() * pool.length)];
    }
    const total = pool.reduce((s, x) => s + x.weight, 0);
    let r = Math.random() * total;
    for (const x of pool) {
      r -= x.weight;
      if (r <= 0) return x;
    }
    return pool[pool.length - 1];
  }

  const picked = [];

  // Helper: try to add an entry respecting geographic spread (>300 km from all picked)
  function tryAdd(e) {
    if (picked.every(p => haversineKm(p.lat, p.lng, e.lat, e.lng) > 300)) {
      picked.push(e);
      return true;
    }
    return false;
  }

  // Phase 1: fill from never-played pool first
  const neverPool = [...neverPlayed];
  let attempts = 0;
  while (picked.length < count && neverPool.length > 0 && attempts < neverPool.length * 4) {
    attempts++;
    const e = weightedPick(neverPool, true);
    const idx = neverPool.indexOf(e);
    neverPool.splice(idx, 1);
    tryAdd(e);
  }
  // Phase 1 fallback: spread couldn't be satisfied — add remaining never-played ignoring distance
  if (picked.length < count && neverPool.length > 0) {
    for (const e of neverPool.sort(() => Math.random() - 0.5)) {
      if (picked.length >= count) break;
      if (!picked.includes(e)) picked.push(e);
    }
  }

  // Phase 2: if still not enough, fill from played pool (lowest plays preferred)
  if (picked.length < count) {
    const playedPool = [...played];
    attempts = 0;
    while (picked.length < count && playedPool.length > 0 && attempts < playedPool.length * 4) {
      attempts++;
      const x = weightedPick(playedPool);
      const idx = playedPool.indexOf(x);
      playedPool.splice(idx, 1);
      tryAdd(x.entry);
    }
    // Phase 2 fallback: geographic spread relaxed
    if (picked.length < count) {
      for (const x of playedPool.sort(() => Math.random() - 0.5)) {
        if (picked.length >= count) break;
        if (!picked.includes(x.entry)) picked.push(x.entry);
      }
    }
  }

  return picked.slice(0, count).map(e => ({ lat: e.lat, lng: e.lng, imageId: e.id, country: e.country ?? null, city: e.city ?? null }));
}

loadCache();

/* ───── Session memory (panoramas used this run — resets on server restart) ───── */

const sessionUsed = new Set();

function markUsed(imageIds) {
  if (!Array.isArray(imageIds)) return;
  imageIds.forEach(id => { if (id) sessionUsed.add(id); });
  console.log(`[session] Used panoramas this session: ${sessionUsed.size}`);
  // Persist play counts
  imageIds.forEach(id => {
    if (id) panPlays[id] = (panPlays[id] || 0) + 1;
  });
  savePanPlays();
}

/* ───── Panorama play-count tracking (persists across restarts) ───── */

const PAN_PLAYS_FILE = path.join(__dirname, 'panorama-plays.json');
let panPlays = {};
try {
  if (fs.existsSync(PAN_PLAYS_FILE)) {
    panPlays = JSON.parse(fs.readFileSync(PAN_PLAYS_FILE, 'utf8'));
    console.log(`[plays] Loaded play counts for ${Object.keys(panPlays).length} panoramas`);
  }
} catch (e) { panPlays = {}; }

function savePanPlays() {
  try { fs.writeFileSync(PAN_PLAYS_FILE, JSON.stringify(panPlays), 'utf8'); } catch (e) {}
}

/* ───── Leaderboard (persists across restarts) ───── */

const LEADERBOARD_FILE = path.join(__dirname, 'leaderboard.json');
let leaderboard = [];
try {
  if (fs.existsSync(LEADERBOARD_FILE)) {
    leaderboard = JSON.parse(fs.readFileSync(LEADERBOARD_FILE, 'utf8'));
    console.log(`[leaderboard] Loaded ${leaderboard.length} entries`);
  }
} catch (e) { leaderboard = []; }

function saveLeaderboard() {
  try { fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(leaderboard), 'utf8'); } catch (e) {}
}

/* ───── Game History (persists across restarts) ───── */

const HISTORY_FILE = path.join(__dirname, 'game-history.json');
let gameHistory = [];
try {
  if (fs.existsSync(HISTORY_FILE)) {
    gameHistory = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    console.log(`[history] Loaded ${gameHistory.length} games`);
  }
} catch (e) { gameHistory = []; }

function saveGameHistory() {
  try { fs.writeFileSync(HISTORY_FILE, JSON.stringify(gameHistory), 'utf8'); } catch (e) {}
}

/* ───── Accounts (nickname + hashed password, persists across restarts) ───── */

const ACCOUNTS_FILE = path.join(__dirname, 'accounts.json');
let accounts = {}; // { nickname_lower: { nickname, passwordHash, salt, token, createdAt } }
try {
  if (fs.existsSync(ACCOUNTS_FILE)) {
    accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
    console.log(`[accounts] Loaded ${Object.keys(accounts).length} accounts`);
  }
} catch (e) { accounts = {}; }

function saveAccounts() {
  try { fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts), 'utf8'); } catch (e) {}
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/** Returns { ok, error?, account? } */
function registerAccount(nickname, password) {
  const key = nickname.trim().toLowerCase();
  if (accounts[key]) return { ok: false, error: 'Никнейм уже занят' };
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);
  const token = generateToken();
  accounts[key] = { nickname: nickname.trim(), passwordHash, salt, token, createdAt: new Date().toISOString() };
  saveAccounts();
  return { ok: true, account: accounts[key] };
}

/** Returns { ok, error?, account? } */
function loginAccount(nickname, password) {
  const key = nickname.trim().toLowerCase();
  const acc = accounts[key];
  if (!acc) return { ok: false, error: 'Аккаунт не найден' };
  const hash = hashPassword(password, acc.salt);
  if (hash !== acc.passwordHash) return { ok: false, error: 'Неверный пароль' };
  // Refresh token on every login
  acc.token = generateToken();
  saveAccounts();
  return { ok: true, account: acc };
}

/** Verify a token, returns account or null */
function verifyToken(token) {
  if (!token) return null;
  return Object.values(accounts).find(a => a.token === token) ?? null;
}

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
      // Skip panoramas already used this session
      if (sessionUsed.has(img.id)) { await sleep(50); continue; }
      console.log('[findMapillaryImage] found after ' + (attempt + 1) + ' attempt(s): ' + img.id);
      await sleep(1100); // Nominatim rate-limit: max 1 req/sec
      const geo = await reverseGeocode(coords[1], coords[0]);
      const result = { id: img.id, lat: coords[1], lng: coords[0], country: geo.country, city: geo.city };
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

async function resolveLocationsForGame(count, onProgress, excludeIds = []) {
  if (!count) count = 5;
  const excludeSet = new Set(excludeIds);

  // Fast path: use cache if we have enough entries
  const cached = pickFromCache(count, excludeSet);
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
      const loc = { lat: img.lat, lng: img.lng, imageId: img.id, country: img.country ?? null, city: img.city ?? null };
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
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

app.use(express.json());

// Page routes (must be before static middleware)
app.get('/', (_req, res) => res.redirect('/menu'));
app.get('/login', (_req, res) => res.sendFile('login.html', { root: PUBLIC_DIR }));
app.get('/menu', (_req, res) => res.sendFile('menu.html', { root: PUBLIC_DIR }));
app.get('/lobby/:code', (_req, res) => res.sendFile('lobby.html', { root: PUBLIC_DIR }));
app.get('/game/:code', (_req, res) => res.sendFile('game.html', { root: PUBLIC_DIR }));
app.get('/profile/:nickname', (_req, res) => res.sendFile('profile.html', { root: PUBLIC_DIR }));

app.use(express.static(PUBLIC_DIR));

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
    markUsed(locations.map(l => l.imageId).filter(Boolean));
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

/* ── Profile API ── */
app.get('/api/profile/:nickname', (req, res) => {
  const prof = profiles.getProfile(req.params.nickname);
  if (!prof) return res.status(404).json({ error: 'Профиль не найден' });
  res.json(prof);
});

app.get('/api/profiles', (_req, res) => {
  res.json(profiles.getAllProfiles());
});

app.get('/api/achievements', (_req, res) => {
  res.json(profiles.getAchievementDefs());
});

/* ── Auth API ── */
app.post('/api/auth/register', (req, res) => {
  const { nickname, password } = req.body || {};
  if (!nickname || !password) return res.status(400).json({ error: 'Нужны никнейм и пароль' });
  if (nickname.trim().length < 2 || nickname.trim().length > 20) return res.status(400).json({ error: 'Никнейм: 2–20 символов' });
  if (password.length < 4) return res.status(400).json({ error: 'Пароль: минимум 4 символа' });
  const result = registerAccount(nickname, password);
  if (!result.ok) return res.status(409).json({ error: result.error });
  profiles.initProfile(result.account.nickname); // create profile immediately
  res.json({ nickname: result.account.nickname, token: result.account.token });
});

app.post('/api/auth/login', (req, res) => {
  const { nickname, password } = req.body || {};
  if (!nickname || !password) return res.status(400).json({ error: 'Нужны никнейм и пароль' });
  const result = loginAccount(nickname, password);
  if (!result.ok) return res.status(401).json({ error: result.error });
  profiles.initProfile(result.account.nickname); // ensure profile exists for legacy accounts
  res.json({ nickname: result.account.nickname, token: result.account.token });
});

// Panorama cache status
app.get('/api/preload/status', (_req, res) => {
  res.json({ count: panoramaCache.length, sessionUsed: sessionUsed.size, running: preloading });
});

// List available coverage zones
app.get('/api/preload/zones', (_req, res) => {
  res.json(COVERAGE_ZONES.map((z, i) => ({ index: i, name: z.name })));
});

// Start background preloading (optional zone filter via body: { zone: 5 })
app.post('/api/preload/start', (req, res) => {
  if (preloading) return res.json({ ok: true, message: 'Already running' });
  const zoneIdx = (typeof req.body?.zone === 'number') ? req.body.zone : null;
  const zoneName = (zoneIdx !== null && COVERAGE_ZONES[zoneIdx]) ? COVERAGE_ZONES[zoneIdx].name : 'все регионы';
  preloading = true;
  res.json({ ok: true, zone: zoneName });
  console.log(`[preload] Background preloading started (zone: ${zoneName})`);
  (async () => {
    while (preloading) {
      try {
        const seed = (zoneIdx !== null && COVERAGE_ZONES[zoneIdx])
          ? randomSeedInZone(COVERAGE_ZONES[zoneIdx])
          : randomSeed();
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

// Global leaderboard — top 20 scores
app.get('/api/leaderboard', (_req, res) => {
  // Deduplicate: keep only best score per nickname
  const best = new Map();
  for (const e of leaderboard) {
    if (!best.has(e.nickname) || best.get(e.nickname).score < e.score) {
      best.set(e.nickname, e);
    }
  }
  res.json([...best.values()].sort((a, b) => b.score - a.score).slice(0, 10));
});

app.post('/api/leaderboard', (req, res) => {
  const { nickname, score, mode } = req.body || {};
  if (!nickname || typeof score !== 'number') return res.status(400).json({ error: 'invalid' });
  leaderboard.push({ nickname, score, mode: mode || 'solo', date: new Date().toISOString() });
  leaderboard.sort((a, b) => b.score - a.score);
  if (leaderboard.length > 200) leaderboard = leaderboard.slice(0, 200);
  saveLeaderboard();
  res.json({ ok: true });
});

// Game history — store with coordinates
app.post('/api/history', (req, res) => {
  const { nickname, mode, totalScore, rounds } = req.body || {};
  if (!nickname) return res.status(400).json({ error: 'invalid' });
  gameHistory.unshift({
    date: new Date().toISOString(),
    nickname,
    mode: mode || 'solo',
    totalScore: totalScore || 0,
    rounds: Array.isArray(rounds) ? rounds : [],
  });
  if (gameHistory.length > 1000) gameHistory = gameHistory.slice(0, 1000);
  saveGameHistory();
  res.json({ ok: true });
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

/** Call after game-over to update all players' profiles. Returns ELO changes map. */
function finalizeGameProfiles(room) {
  const leaderboard = room.getLeaderboard();
  const allPlayers = leaderboard.map((p, idx) => ({
    nickname:       p.nickname,
    totalScore:     p.totalScore,
    matchPlacement: idx + 1,
  }));
  const gameProfileData = leaderboard.map((p, idx) => ({
    nickname:       p.nickname,
    totalScore:     p.totalScore,
    matchPlacement: idx + 1,
    playerCount:    leaderboard.length,
    rounds:         room.totalRounds,
    allPlayers,
  }));
  return profiles.updateAfterGame(gameProfileData);
}

/** Build enriched game-over payload: leaderboard with current ELO + avgElo + team data. */
function buildGameOverPayload(room, eloChanges) {
  const lb = room.getLeaderboard().map(p => ({
    ...p,
    elo: profiles.getProfile(p.nickname)?.elo ?? 1000,
  }));
  const avgElo = lb.length > 0
    ? Math.round(lb.reduce((s, p) => s + p.elo, 0) / lb.length)
    : 0;
  return {
    leaderboard: lb,
    eloChanges,
    avgElo,
    teamMode:   room.teamMode,
    teamScores: room.teamMode ? [...room.teamScores] : null,
  };
}

/**
 * Finalize a round and emit results. Guards against double-call.
 * Also broadcasts round-timer-stop so clients can clear countdown.
 */
function finalizeAndEmitRound(room) {
  if (room.roundFinalized) return;
  const results = room.finalizeRound(scoring);
  const enrichedResults = results.map(r => ({
    ...r,
    elo: profiles.getProfile(r.nickname)?.elo ?? 1000,
  }));
  const loc = room.getCurrentLocation();
  io.to(room.code).emit('round-results', {
    results: enrichedResults,
    location: loc,
    round:       room.currentRound + 1,
    isLastRound: room.currentRound + 1 >= room.totalRounds,
    teamMode:    room.teamMode,
    teamScores:  room.teamMode ? [...room.teamScores] : null,
  });
  io.to(room.code).emit('round-timer-stop');

  const roundProfileData = results.map((r, idx) => ({
    nickname:       r.nickname,
    score:          r.score,
    distance:       r.distance,
    stolen:         r.stolen || 0,
    lostToSteal:    r.lostToSteal || 0,
    roundPlacement: idx + 1,
    playerCount:    results.length,
    roundNumber:    room.currentRound,
  }));
  profiles.updateAfterRound(roundProfileData);
}

/** Enrich player list with profile data (level, prestige, elo) for lobby display. */
function enrichedPlayerList(room) {
  return room.getPlayerList().map(p => {
    const prof = profiles.getProfile(p.nickname);
    return {
      ...p,
      level:    prof?.level    ?? 1,
      prestige: prof?.prestige ?? 0,
      elo:      prof?.elo      ?? 1000,
    };
  });
}

io.on('connection', (socket) => {
  console.log(`⚡ Connected: ${socket.id}`);

  /* Create a room */
  socket.on('create-room', ({ nickname, color }, cb) => {
    const room = createRoom(socket.id, nickname, color);
    socket.join(room.code);
    cb({ success: true, code: room.code, players: room.getPlayerList() });
    console.log(`🏠 Room ${room.code} created by ${nickname}`);
  });

  /* Join a room */
  socket.on('join-room', ({ code, nickname, color }, cb) => {
    const room = getRoom(code);
    if (!room) return cb({ success: false, error: 'Комната не найдена' });
    if (room.status !== 'waiting') return cb({ success: false, error: 'Игра уже началась' });
    if (room.players.size >= 10) return cb({ success: false, error: 'Комната заполнена' });

    room.addPlayer(socket.id, nickname, color);
    socket.join(room.code);
    cb({ success: true, code: room.code, players: enrichedPlayerList(room) });
    socket.to(room.code).emit('player-joined', { players: enrichedPlayerList(room) });
    console.log(`👤 ${nickname} joined room ${room.code}`);
  });

  /* Rejoin a room after disconnect/page refresh */
  socket.on('rejoin-room', ({ code, nickname, color }, cb) => {
    const room = getRoom(code);
    if (!room) return cb({ success: false, error: 'Комната не найдена' });

    if (room.status === 'waiting') {
      // Room still in lobby — just add as new player if not already there
      const existing = [...room.players.values()].find(p => p.nickname === nickname);
      if (existing) {
        // Update socket id, clear pending-remove flag
        const oldId = [...room.players.entries()].find(([, p]) => p.nickname === nickname)?.[0];
        if (oldId) {
          room.players.set(socket.id, { ...room.players.get(oldId), socketId: socket.id, _pendingRemove: false });
          room.players.delete(oldId);
          if (room.hostId === oldId) room.hostId = socket.id;
        }
      } else {
        room.addPlayer(socket.id, nickname, color);
      }
      socket.join(room.code);
      const isHost = room.hostId === socket.id;
      cb({ success: true, code: room.code, players: enrichedPlayerList(room), status: 'waiting', isHost });
      socket.to(room.code).emit('player-joined', { players: enrichedPlayerList(room) });
    } else if (room.status === 'playing') {
      // Game in progress — reconnect existing player by nickname
      const oldEntry = [...room.players.entries()].find(([, p]) => p.nickname === nickname);
      if (!oldEntry) return cb({ success: false, error: 'Игрок не найден в комнате' });
      const [oldId, playerData] = oldEntry;
      room.players.set(socket.id, { ...playerData, socketId: socket.id, _pendingRemove: false });
      room.players.delete(oldId);
      // Transfer team assignments to new socketId
      if (room.teams.has(oldId))    { room.teams.set(socket.id, room.teams.get(oldId));       room.teams.delete(oldId); }
      if (room.preTeams.has(oldId)) { room.preTeams.set(socket.id, room.preTeams.get(oldId)); room.preTeams.delete(oldId); }
      if (room.readySet?.has(oldId)) { room.readySet.delete(oldId); room.readySet.add(socket.id); }
      if (room.hostId === oldId) room.hostId = socket.id;
      socket.join(room.code);

      const roundIdx = room.currentRound;
      const loc = room.getCurrentLocation();
      const imageId = room.resolvedImages?.[roundIdx]?.id ?? null;
      cb({
        success: true,
        code: room.code,
        status: 'playing',
        isHost: room.hostId === socket.id,
        players: room.getPlayerList(),
        round: roundIdx + 1,
        totalRounds: room.totalRounds,
        location: { lat: loc.lat, lng: loc.lng },
        imageId,
        alreadyGuessed: room.roundGuesses.has(socket.id),
      });
      socket.to(room.code).emit('player-joined', { players: enrichedPlayerList(room) });
      console.log(`🔄 ${nickname} reconnected to room ${room.code}`);
    } else {
      cb({ success: false, error: 'Игра завершена' });
    }
  });

  /* Host broadcasts live settings change (e.g. team mode toggle) */
  socket.on('update-room-settings', (data, cb) => {
    const room = getRoomByPlayer(socket.id);
    if (!room || room.hostId !== socket.id) return cb?.({ success: false, error: 'Нет прав' });
    if (room.status !== 'waiting') return cb?.({ success: false, error: 'Игра уже началась' });
    if (typeof data?.teamMode === 'boolean') room.teamMode = data.teamMode;
    io.to(room.code).emit('room-settings', { teamMode: room.teamMode });
    io.to(room.code).emit('player-joined', { players: enrichedPlayerList(room) });
    cb?.({ success: true });
  });

  /* Player selects their team before game start */
  socket.on('select-team', ({ team }, cb) => {
    const room = getRoomByPlayer(socket.id);
    if (!room || room.status !== 'waiting') return cb?.({ success: false });
    if (team !== 0 && team !== 1) return cb?.({ success: false, error: 'Неверная команда' });
    room.setPreTeam(socket.id, team);
    io.to(room.code).emit('player-joined', { players: enrichedPlayerList(room) });
    cb?.({ success: true });
  });

  /* Host starts the game */
  socket.on('start-game', async (data, cb) => {
    try {
      const excludeIds = Array.isArray(data?.excludeIds) ? data.excludeIds : [];
      const room = getRoomByPlayer(socket.id);
      if (!room) return cb?.({ success: false, error: 'Komната не найдена' });
      if (room.hostId !== socket.id) return cb?.({ success: false, error: 'Только хост может начать' });
      if (room.players.size < 1) return cb?.({ success: false, error: 'Недостаточно игроков' });

      // Apply host-configured settings before starting
      room.teamMode          = !!data?.teamMode;
      room.totalRounds       = Math.min(20, Math.max(1, parseInt(data?.totalRounds)  || 5));
      room.timeLimitSecs     = Math.min(120, Math.max(0, parseInt(data?.timeLimitSecs) || 0));
      room.streakBonusEnabled = data?.streakBonus !== false;

      cb?.({ success: true });  // ack immediately so host UI unblocks

      // Tell all lobby players we are searching for panoramas
      io.to(room.code).emit('resolving-panoramas', { total: room.totalRounds, found: 0 });
      console.log(`[start-game] Resolving ${room.totalRounds} panoramas for room ${room.code}...`);

      const locations = await resolveLocationsForGame(room.totalRounds, (n, loc) => {
        io.to(room.code).emit('resolving-panoramas', { total: room.totalRounds, found: n });
        console.log(`  [${n}/${room.totalRounds}] ${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)} id=${loc.imageId}`);
      }, excludeIds);

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
        location: { lat: firstLocation.lat, lng: firstLocation.lng, country: firstLocation.country ?? null, city: firstLocation.city ?? null },
        imageId: locations[0].imageId ?? null,
        players: room.getPlayerList(),
        settings:   { teamMode: room.teamMode, timeLimitSecs: room.timeLimitSecs, streakBonus: room.streakBonusEnabled },
        teamScores: room.teamMode ? [...room.teamScores] : null,
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
    // Notify ALL players (including the guesser) that a player has guessed
    const guessingPlayer = room.players.get(socket.id);
    io.to(room.code).emit('player-guessed', {
      playersGuessed: room.roundGuesses.size,
      totalPlayers: room.players.size,
      nickname: guessingPlayer?.nickname,
      color: guessingPlayer?.color || '#4fc3f7',
      lat,
      lng,
    });

    // Start countdown after first guess if timer is enabled
    if (room.roundGuesses.size === 1 && room.timeLimitSecs > 0 && !room.roundFinalized) {
      io.to(room.code).emit('round-timer-start', { secs: room.timeLimitSecs });
      room.roundTimer = setTimeout(() => {
        finalizeAndEmitRound(room);
      }, room.timeLimitSecs * 1000);
    }

    // If all guesses are in, finalize immediately
    if (room.allGuessesIn()) {
      finalizeAndEmitRound(room);
    }
  });

  /* Chat messages (lobby and in-game) */
  socket.on('chat-message', ({ text }) => {
    const room = getRoomByPlayer(socket.id);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player || typeof text !== 'string') return;
    const safe = text.trim().slice(0, 200);
    if (!safe) return;
    io.to(room.code).emit('chat-message', {
      nickname: player.nickname,
      color: player.color,
      text: safe,
    });
  });

  /* Update player color in room */
  socket.on('update-color', ({ color }, cb) => {
    const room = getRoomByPlayer(socket.id);
    if (!room) return cb?.({ success: false });
    // Reject if another player already holds this color
    const takenByOther = [...room.players.entries()].some(
      ([id, p]) => id !== socket.id && p.color === color
    );
    if (takenByOther) return cb?.({ success: false, error: 'Цвет уже занят другим игроком' });
    const player = room.players.get(socket.id);
    if (player) player.color = color || '#4fc3f7';
    cb?.({ success: true });
    // Broadcast updated player list so everyone sees new color
    io.to(room.code).emit('player-joined', { players: enrichedPlayerList(room) });
  });

  /* Player signals ready for next round (replaces host-only next-round) */
  socket.on('player-ready', (_, cb) => {
    const room = getRoomByPlayer(socket.id);
    if (!room || room.status !== 'playing') return cb?.({ success: false });

    const allReady = room.markReady(socket.id);
    cb?.({ success: true });

    // Broadcast ready count to everyone
    io.to(room.code).emit('ready-update', {
      readyCount: room.getReadyCount(),
      total: room.players.size,
      readyIds: Array.from(room.readySet),
    });

    if (allReady) {
      room.clearReady();
      const nextLoc = room.nextRound();
      if (!nextLoc) {
        // Game over — mark all used this session
        markUsed((room.resolvedImages || []).map(r => r.id));
        const eloChanges1 = finalizeGameProfiles(room);
        io.to(room.code).emit('game-over', buildGameOverPayload(room, eloChanges1));
      } else {
        const imageId = room.resolvedImages?.[room.currentRound]?.id ?? null;
        io.to(room.code).emit('round-start', {
          round: room.currentRound + 1,
          totalRounds: room.totalRounds,
          location: { lat: nextLoc.lat, lng: nextLoc.lng, country: nextLoc.country ?? null, city: nextLoc.city ?? null },
          imageId,
          players: room.getPlayerList(),
          settings:   { teamMode: room.teamMode, timeLimitSecs: room.timeLimitSecs, streakBonus: room.streakBonusEnabled },
          teamScores: room.teamMode ? [...room.teamScores] : null,
        });
      }
    }
  });

  /* Legacy: host-only force-advance (kept for backward compat) */
  socket.on('next-round', async (_, cb) => {
    const room = getRoomByPlayer(socket.id);
    if (!room || room.hostId !== socket.id) return cb?.({ success: false });

    room.clearReady();
    const nextLoc = room.nextRound();
    if (!nextLoc) {
      markUsed((room.resolvedImages || []).map(r => r.id));
      const eloChanges2 = finalizeGameProfiles(room);
      io.to(room.code).emit('game-over', buildGameOverPayload(room, eloChanges2));
      return cb?.({ success: true, finished: true });
    }
    const imageId = room.resolvedImages?.[room.currentRound]?.id ?? null;
    cb?.({ success: true, finished: false });
    io.to(room.code).emit('round-start', {
      round: room.currentRound + 1,
      totalRounds: room.totalRounds,
      location: { lat: nextLoc.lat, lng: nextLoc.lng, country: nextLoc.country ?? null, city: nextLoc.city ?? null },
      imageId,
      settings:   { teamMode: room.teamMode, timeLimitSecs: room.timeLimitSecs, streakBonus: room.streakBonusEnabled },
      teamScores: room.teamMode ? [...room.teamScores] : null,
    });
  });

  /* Disconnect */
  socket.on('disconnect', () => {
    const room = getRoomByPlayer(socket.id);
    if (room) {
      // Give the player time to reconnect (page navigation takes 1-4s).
      // We keep the player in the room for a brief grace period.
      const player = room.players.get(socket.id);
      if (player) player._pendingRemove = true;

      const graceMs = room.status === 'playing' ? 10000 : 5000;
      setTimeout(() => {
        // If the player rejoined, their entry was moved to a new socket.id key.
        const still = room.players.get(socket.id);
        if (still?._pendingRemove) {
          // ELO penalty for disconnecting mid-game without reconnecting
          if (room.status === 'playing' && player?.nickname) {
            const remainingCount = room.players.size - 1; // excluding this player
            if (remainingCount > 0) {
              const K = 32;
              // Simulate losing to every remaining player
              const lossScore = 0;
              const expectedScore = 1 / (remainingCount + 1);
              const delta = Math.round(K * (lossScore - expectedScore) * (remainingCount + 1) * 0.5);
              const prof = profiles.getProfile(player.nickname);
              if (prof) {
                prof.elo = Math.max(100, (prof.elo ?? 1000) + delta);
                console.log(`📉 ELO penalty for ${player.nickname}: ${delta} → ${prof.elo}`);
              }
            }
          }
          room.removePlayer(socket.id);
          if (room.players.size === 0) {
            deleteRoom(room.code);
            console.log(`🗑  Room ${room.code} deleted (empty)`);
          } else {
            if (room.hostId === socket.id) {
              room.hostId = room.players.keys().next().value;
            }
            io.to(room.code).emit('player-left', { players: room.getPlayerList() });
          }
        }
      }, graceMs);
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
  console.log(`\n🌍 GeoGAYZZER Server running on port ${PORT}`);
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
