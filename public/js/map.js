/**
 * GameMap — Leaflet map for guessing and result display.
 * Manages the mini-map, guess marker, result polyline, and tile layers.
 */

const GameMap = (() => {
  let miniMap = null;
  let resultMap = null;
  let guessMarker = null;
  let resultLayers = [];  // polylines and markers on result map
  let currentTileLayer = null;
  let currentOverlayLayer = null;

  /* ── Tile Layers ── */
  const TILES = {
    // OpenStreetMap — стандарт, видны страны, дороги, города
    'osm': {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      options: { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 },
    },
    // OSM Humanitarian — чёткие границы стран, яркие цвета
    'osm-hot': {
      url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
      options: { attribution: '&copy; OpenStreetMap, Tiles by HOT', maxZoom: 19 },
    },
    // CartoDB Voyager — чистая карта с метками стран
    'carto-voyager': {
      url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      options: { attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 20 },
    },
    // CartoDB Dark — тёмная с метками
    'carto-dark': {
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      options: { attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 20 },
    },
    // CartoDB Dark + только границы/метки поверх (overlay)
    'carto-borders': {
      url: 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
      options: { attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 20 },
      base: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    },
    // Esri Satellite — спутник без подписей
    'esri-satellite': {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      options: { attribution: '&copy; Esri', maxZoom: 18 },
    },
    // Esri World Street Map — детальные улицы + страны
    'esri-street': {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      options: { attribution: '&copy; Esri', maxZoom: 18 },
    },
    // Esri National Geographic — красивый стиль с границами
    'esri-natgeo': {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}',
      options: { attribution: '&copy; Esri, National Geographic', maxZoom: 16 },
    },
  };

  let currentTileKey = localStorage.getItem('gg_tile') || 'osm';

  /* ── Custom Icons ── */
  function makeGuessIcon(color) {
    const c = color || '#e94560';
    return L.divIcon({
      className: 'custom-marker guess-marker-icon',
      html: `<div style="width:16px;height:16px;background:${c};border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.5);"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
  }

  const actualIcon = L.divIcon({
    className: 'custom-marker actual-marker-icon',
    html: '<svg width="22" height="22" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 2px 6px rgba(0,0,0,0.65));display:block;"><polygon points="11,2 20,20 2,20" fill="#2ecc71" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></svg>',
    iconSize: [22, 22],
    iconAnchor: [11, 18],
  });

  const COLLAPSED_W = 200, COLLAPSED_H = 150;
  const SIZE_STEP = 80;

  function getExpandedSize() {
    const w = parseInt(localStorage.getItem('gg_map_w'), 10) || 400;
    const h = parseInt(localStorage.getItem('gg_map_h'), 10) || 300;
    return {
      w: Math.min(700, Math.max(COLLAPSED_W + SIZE_STEP, w)),
      h: Math.min(550, Math.max(COLLAPSED_H + SIZE_STEP, h)),
    };
  }

  function saveExpandedSize(w, h) {
    localStorage.setItem('gg_map_w', w);
    localStorage.setItem('gg_map_h', h);
  }

  /* ── Mini-map ── */

  function initMiniMap() {
    if (miniMap) {
      // Remove stale live markers before destroying the map instance
      _liveMarkers.forEach(m => miniMap.removeLayer(m));
      _liveMarkers.clear();
      miniMap.remove();
      miniMap = null;
    }

    const wrapper = document.getElementById('minimap-wrapper');
    const outer   = document.querySelector('.minimap-outer');

    // Start collapsed
    if (wrapper) {
      wrapper.style.width  = COLLAPSED_W + 'px';
      wrapper.style.height = COLLAPSED_H + 'px';
    }

    // Hover: expand to saved size; leave: collapse back
    if (outer && wrapper) {
      outer.addEventListener('mouseenter', () => {
        const { w, h } = getExpandedSize();
        wrapper.style.width  = w + 'px';
        wrapper.style.height = h + 'px';
        setTimeout(() => miniMap?.invalidateSize(), 230);
      });
      outer.addEventListener('mouseleave', () => {
        wrapper.style.width  = COLLAPSED_W + 'px';
        wrapper.style.height = COLLAPSED_H + 'px';
        setTimeout(() => miniMap?.invalidateSize(), 230);
      });
    }

    miniMap = L.map('minimap', {
      center: [20, 0],
      zoom: 2,
      zoomControl: false,
      attributionControl: false,
    });

    setTileLayer(currentTileKey, miniMap);  // restore saved tile

    // Click to place guess marker
    miniMap.on('click', (e) => {
      placeGuessMarker(e.latlng.lat, e.latlng.lng);
    });

    // Tile selector
    const tileSelect = document.getElementById('tile-select');
    if (tileSelect) {
      tileSelect.value = currentTileKey;
      tileSelect.addEventListener('change', (e) => {
        setTileLayer(e.target.value, miniMap);
      });
    }

    // − button: decrease expanded size
    document.getElementById('minimap-size-down')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const { w, h } = getExpandedSize();
      const newW = Math.max(COLLAPSED_W + SIZE_STEP, w - SIZE_STEP);
      const newH = Math.max(COLLAPSED_H + SIZE_STEP, h - Math.round(SIZE_STEP * 0.75));
      saveExpandedSize(newW, newH);
      if (wrapper) {
        wrapper.style.width  = newW + 'px';
        wrapper.style.height = newH + 'px';
        miniMap.invalidateSize();
      }
    });

    // + button: increase expanded size
    document.getElementById('minimap-size-up')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const { w, h } = getExpandedSize();
      const newW = Math.min(700, w + SIZE_STEP);
      const newH = Math.min(550, h + Math.round(SIZE_STEP * 0.75));
      saveExpandedSize(newW, newH);
      if (wrapper) {
        wrapper.style.width  = newW + 'px';
        wrapper.style.height = newH + 'px';
        miniMap.invalidateSize();
      }
    });

    return miniMap;
  }

  function setTileLayer(key, map) {
    if (!TILES[key]) return;
    currentTileKey = key;
    localStorage.setItem('gg_tile', key);  // persist choice

    // Remove all existing tile layers
    if (currentTileLayer) {
      map.removeLayer(currentTileLayer);
      currentTileLayer = null;
    }
    if (currentOverlayLayer) {
      map.removeLayer(currentOverlayLayer);
      currentOverlayLayer = null;
    }

    const cfg = TILES[key];

    // Special case: satellite base + labels overlay
    if (cfg.base) {
      const baseLayer = L.tileLayer(cfg.base, { attribution: '&copy; Esri', maxZoom: 18 });
      baseLayer.addTo(map);
      currentTileLayer = baseLayer;

      const overlay = L.tileLayer(cfg.url, cfg.options);
      overlay.addTo(map);
      currentOverlayLayer = overlay;
    } else {
      currentTileLayer = L.tileLayer(cfg.url, cfg.options);
      currentTileLayer.addTo(map);
    }
  }

  function placeGuessMarker(lat, lng) {
    if (!miniMap) return;

    if (guessMarker) {
      guessMarker.setLatLng([lat, lng]);
    } else {
      guessMarker = L.marker([lat, lng], { icon: makeGuessIcon(Player.getColor()), draggable: true }).addTo(miniMap);
      guessMarker.on('dragend', () => {
        const pos = guessMarker.getLatLng();
        GameState.set('currentGuess', { lat: pos.lat, lng: pos.lng });
      });
    }

    GameState.set('currentGuess', { lat, lng });

    // Enable guess button
    const btn = document.getElementById('btn-guess');
    if (btn) btn.disabled = false;
  }

  function clearGuessMarker() {
    if (guessMarker && miniMap) {
      miniMap.removeLayer(guessMarker);
    }
    guessMarker = null;
    GameState.set('currentGuess', null);

    const btn = document.getElementById('btn-guess');
    if (btn) btn.disabled = true;
  }

  /** Reset mini-map to default view for a new round */
  function resetMiniMap() {
    clearGuessMarker();
    // Clear dev target marker
    clearDevTarget();
    if (miniMap) {
      miniMap.setView([20, 0], 2);
    }
  }

  /* ── Result Map ── */

  function initResultMap() {
    if (resultMap) {
      resultMap.remove();
      resultMap = null;
    }

    resultMap = L.map('result-map', {
      center: [20, 0],
      zoom: 2,
      zoomControl: true,
      attributionControl: true,
    });

    const tileConfig = TILES[currentTileKey] || TILES['osm'];
    // Use base layer if present (e.g. satellite+labels)
    if (tileConfig.base) {
      L.tileLayer(tileConfig.base, { attribution: '&copy; Esri', maxZoom: 18 }).addTo(resultMap);
      L.tileLayer(tileConfig.url, tileConfig.options).addTo(resultMap);
    } else {
      L.tileLayer(tileConfig.url, tileConfig.options).addTo(resultMap);
    }

    return resultMap;
  }

  /**
   * Show the result on the result map: actual location, guess, and polyline.
   */
  function showResult(actualLat, actualLng, guessLat, guessLng) {
    if (!resultMap) initResultMap();

    // Clear previous layers
    resultLayers.forEach((layer) => resultMap.removeLayer(layer));
    resultLayers = [];

    // Actual location marker
    const actualMarker = L.marker([actualLat, actualLng], { icon: actualIcon }).addTo(resultMap);
    actualMarker.bindPopup('📍 Правильное место').openPopup();
    resultLayers.push(actualMarker);

    // Guess marker
    const guessMarkerResult = L.marker([guessLat, guessLng], { icon: makeGuessIcon(Player.getColor()) }).addTo(resultMap);
    guessMarkerResult.bindPopup('🎯 Твоя догадка');
    resultLayers.push(guessMarkerResult);

    // Polyline connecting the two
    const polyline = L.polyline(
      [[actualLat, actualLng], [guessLat, guessLng]],
      { color: '#e94560', weight: 3, dashArray: '8, 8', opacity: 0.8 }
    ).addTo(resultMap);
    resultLayers.push(polyline);

    // Fit bounds to show both points
    const bounds = L.latLngBounds(
      [actualLat, actualLng],
      [guessLat, guessLng]
    ).pad(0.3);
    resultMap.fitBounds(bounds);
  }

  /**
   * Plot every player's guess on the result map as a labelled marker.
   * Call AFTER showResult() — skips the current player (already shown by showResult).
   * @param {Array}  results    - [{nickname, color, guess:{lat,lng}, score, distance}, ...]
   * @param {string} myNickname - Current player's nickname
   */
  function showMultiplayerGuesses(results, myNickname) {
    if (!resultMap) return;

    for (const result of results) {
      if (result.nickname === myNickname) continue;
      if (!result.guess) continue;

      const { lat, lng } = result.guess;
      const color = result.color || '#f39c12';

      const icon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="width:14px;height:14px;background:${color};border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.5);"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

      const dist = result.distance != null
        ? Scoring.formatDistance(result.distance)
        : '—';
      const marker = L.marker([lat, lng], { icon })
        .bindTooltip(
          `<strong>${result.nickname}</strong><br>+${result.score.toLocaleString()} · ${dist}`,
          { permanent: false, direction: 'top', offset: [0, -8] }
        )
        .addTo(resultMap);
      resultLayers.push(marker);
    }
  }

  /* ── Live player markers on minimap (dev.players mode) ── */
  const _liveMarkers = new Map(); // nickname → L.Marker

  function _makeLiveIcon(color) {
    return L.divIcon({
      className: 'custom-marker',
      html: `<div style="width:10px;height:10px;background:${color || '#f39c12'};border:2px solid #fff;border-radius:50%;opacity:0.85;"></div>`,
      iconSize: [10, 10],
      iconAnchor: [5, 5],
    });
  }

  function updateLiveMarker(nickname, color, lat, lng) {
    if (!miniMap) return;
    if (_liveMarkers.has(nickname)) {
      _liveMarkers.get(nickname).setLatLng([lat, lng]);
    } else {
      const m = L.marker([lat, lng], { icon: _makeLiveIcon(color), interactive: false })
        .bindTooltip(nickname, { permanent: false, direction: 'top' })
        .addTo(miniMap);
      _liveMarkers.set(nickname, m);
    }
  }

  function clearLiveMarkers() {
    _liveMarkers.forEach(m => { if (miniMap) miniMap.removeLayer(m); });
    _liveMarkers.clear();
  }

  let _devTargetMarker = null;
  function showDevTarget(lat, lng) {
    if (!miniMap) return;
    if (_devTargetMarker) miniMap.removeLayer(_devTargetMarker);
    const icon = L.divIcon({
      className: 'custom-marker',
      html: `<div style="width:14px;height:14px;background:#ff0;border:3px solid #333;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.6);"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
    _devTargetMarker = L.marker([lat, lng], { icon, interactive: false })
      .bindTooltip('🎯 Цель', { permanent: true, direction: 'top', offset: [0, -8] })
      .addTo(miniMap);
    miniMap.setView([lat, lng], miniMap.getZoom());
  }

  function clearDevTarget() {
    if (_devTargetMarker && miniMap) { miniMap.removeLayer(_devTargetMarker); }
    _devTargetMarker = null;
  }

  /** Invalidate map sizes (call after showing/hiding containers) */
  function invalidateAll() {
    setTimeout(() => {
      miniMap?.invalidateSize();
      resultMap?.invalidateSize();
    }, 100);
  }

  /** Invalidate only the result map (called when result screen is shown) */
  function invalidateResultMap() {
    resultMap?.invalidateSize();
  }

  return {
    initMiniMap,
    resetMiniMap,
    clearGuessMarker,
    initResultMap,
    showResult,
    showMultiplayerGuesses,
    updateLiveMarker,
    clearLiveMarkers,
    showDevTarget,
    clearDevTarget,
    invalidateAll,
    invalidateResultMap,
  };
})();
