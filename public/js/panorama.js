/**
 * Panorama — Mapillary street-level viewer integration.
 * findImage() returns actual image coordinates so the game
 * can bind the target point to the real panorama position.
 */

const Panorama = (() => {
  let viewer = null;
  let _loadGen = 0;  // incremented on every new load; stale callbacks abort when gen mismatches
  const container = 'panorama-container';
  const FETCH_TIMEOUT_MS = 8000;
  const MOVETO_TIMEOUT_MS = 12000;

  /** Initialize the Mapillary viewer */
  function init(token) {
    if (viewer) return;
    viewer = new mapillary.Viewer({
      accessToken: token,
      container,
      component: {
        cover: false,
        bearing: false,
        // Disable image-to-image navigation arrows and sequence strip
        direction: false,
        sequence: false,
        // Disable keyboard navigation (arrow keys would jump to another image)
        keyboard: false,
      },
    });
    window.addEventListener('resize', () => viewer?.resize());
    viewer.on('bearing', (e) => updateCompass(e.bearing));
  }

  /** fetch with AbortController timeout */
  async function fetchWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  /** Rotate the on-screen compass to match the viewer's bearing (0°=North, clockwise). */
  function updateCompass(bearing) {
    const face = document.getElementById('compass-face');
    if (face) face.style.transform = `rotate(${-bearing}deg)`;
  }

  /**
   * Search for a Mapillary panoramic image near the given coordinates.
   * SEQUENTIAL: tries bboxes from smallest to largest, stops on first result.
   * limit=10 avoids "Please reduce data" rate-limit errors from Mapillary.
   * @returns {{ id: string, lat: number, lng: number } | null}
   */
  async function findImage(lat, lng) {
    // (2*delta)^2 must stay ≤ 0.010 sq° (Mapillary limit). Max safe delta = 0.04.
    const deltas = [0.005, 0.01, 0.025, 0.04];

    for (const delta of deltas) {
      const bbox = [lng - delta, lat - delta, lng + delta, lat + delta].join(',');
      const params = new URLSearchParams({ bbox, limit: '10', is_pano: 'true' });

      try {
        const res = await fetchWithTimeout(`/api/mapillary/images?${params}`, 5000);
        if (!res.ok) continue;
        const data = await res.json();
        if (!data?.data?.length) continue;

        let closest = null, minDist = Infinity;
        for (const img of data.data) {
          const coords = img.computed_geometry?.coordinates ?? img.geometry?.coordinates;
          if (!coords) continue;
          const [imgLng, imgLat] = coords;
          const d = Scoring.haversine(lat, lng, imgLat, imgLng);
          if (d < minDist) { minDist = d; closest = { id: img.id, lat: imgLat, lng: imgLng }; }
        }
        if (closest) return closest;
      } catch (err) {
        if (err.name !== 'AbortError') console.warn(`findImage delta=${delta}:`, err.message);
      }
    }
    return null;
  }

  /** Promise that rejects after `ms` milliseconds */
  function timeout(ms) {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error('moveTo timeout')), ms)
    );
  }

  /**
   * Immediately cancel any in-flight load and blank the panorama.
   * Call this before starting a new round so the old image is hidden right away.
   */
  function reset() {
    _loadGen++;           // invalidate any running loadLocation
    _hideFallback();
    UI.showPanoramaLoading(true);
    // Remove the Mapillary image from DOM immediately so old street doesn't show
    GameState.set('mapillaryImageId', null);
    // Blur the container to visually hide the stale frame behind the loading overlay
    const el = document.getElementById('panorama-container');
    if (el) el.style.filter = 'blur(8px) brightness(0.3)';
    const compass = document.getElementById('compass');
    if (compass) compass.classList.add('hidden');
  }

  /**
   * Load a panorama for the given coordinates.
   * Uses a generation counter so stale calls (superseded by a newer round)
   * abort silently instead of overwriting the current panorama.
   * @returns {{ lat: number, lng: number } | null}
   */
  async function loadLocation(lat, lng) {
    const token = GameConfig.mapillaryToken;
    if (!token) {
      console.error('Mapillary token not available');
      return null;
    }

    init(token);
    const myGen = ++_loadGen;  // claim this generation

    _hideFallback();
    UI.showPanoramaLoading(true);

    const image = await findImage(lat, lng);

    // If a newer loadLocation started while we were searching, abort silently
    if (myGen !== _loadGen) return null;

    if (!image) {
      console.warn(`No Mapillary images found near ${lat}, ${lng}`);
      if (myGen === _loadGen) UI.showPanoramaLoading(false);
      return null;
    }

    GameState.set('mapillaryImageId', image.id);

    // Retry moveTo up to 3 times — Mapillary occasionally returns
    // "Service temporarily unavailable" on the first attempt
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (myGen !== _loadGen) return null;  // superseded

      try {
        await Promise.race([
          viewer.moveTo(image.id),
          timeout(MOVETO_TIMEOUT_MS),
        ]);

        if (myGen !== _loadGen) return null;  // superseded after moveTo

        UI.showPanoramaLoading(false);
        // Remove the blur we applied in reset()
        const el = document.getElementById('panorama-container');
        if (el) el.style.filter = '';
        viewer.resize();
        const compass = document.getElementById('compass');
        if (compass) compass.classList.remove('hidden');

        // Get the ACTUAL coordinates from the loaded image (moveTo may redirect
        // to a neighbouring image, so viewer.getImage() is authoritative)
        try {
          const loadedImg = await viewer.getImage();
          if (loadedImg) {
            const pt = loadedImg.lngLat ?? loadedImg.originalLngLat;
            if (pt) return { lat: pt.lat, lng: pt.lng };
          }
        } catch { /* fall through to estimated coords */ }
        return { lat: image.lat, lng: image.lng };

      } catch (err) {
        if (myGen !== _loadGen) return null;  // superseded during error
        console.warn(`moveTo attempt ${attempt}/3 failed: ${err.message}`);

        if (attempt < 3) {
          // Wait before retry, but bail if superseded during the wait
          await new Promise(r => setTimeout(r, 800 * attempt));
          if (myGen !== _loadGen) return null;  // superseded during sleep
        }
      }
    }

    // All 3 retries exhausted
    console.error('Failed to load Mapillary image after 3 attempts');
    if (myGen === _loadGen) UI.showPanoramaLoading(false);
    return null;
  }

  /**
   * Load a Mapillary panorama by a specific image ID (resolved server-side).
   * Skips the bbox search step so all multiplayer clients end up on the SAME image.
   * Falls back to loadLocation() if the ID fails after 3 retries.
   * @returns {{ lat: number, lng: number } | null}
   */
  async function loadById(imageId, fallbackLat, fallbackLng) {
    if (!imageId) return loadLocation(fallbackLat, fallbackLng);

    const token = GameConfig.mapillaryToken;
    if (!token) return null;

    init(token);
    const myGen = ++_loadGen;

    _hideFallback();
    UI.showPanoramaLoading(true);

    GameState.set('mapillaryImageId', imageId);

    for (let attempt = 1; attempt <= 3; attempt++) {
      if (myGen !== _loadGen) return null;
      try {
        await Promise.race([viewer.moveTo(imageId), timeout(MOVETO_TIMEOUT_MS)]);
        if (myGen !== _loadGen) return null;

        UI.showPanoramaLoading(false);
        const el = document.getElementById('panorama-container');
        if (el) el.style.filter = '';
        viewer.resize();
        const compass = document.getElementById('compass');
        if (compass) compass.classList.remove('hidden');

        try {
          const loadedImg = await viewer.getImage();
          if (loadedImg) {
            const pt = loadedImg.lngLat ?? loadedImg.originalLngLat;
            if (pt) return { lat: pt.lat, lng: pt.lng };
          }
        } catch {}
        return { lat: fallbackLat, lng: fallbackLng };

      } catch (err) {
        if (myGen !== _loadGen) return null;
        console.warn(`loadById attempt ${attempt}/3 failed: ${err.message}`);
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, 800 * attempt));
          if (myGen !== _loadGen) return null;
        }
      }
    }

    console.warn('loadById: all retries failed, falling back to location search');
    return loadLocation(fallbackLat, fallbackLng);
  }

  function _showFallback(lat, lng) {
    const el = document.getElementById('panorama-fallback');
    const coords = document.getElementById('fallback-coords');
    if (el) el.classList.remove('hidden');
    if (coords) coords.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }

  function _hideFallback() {
    const el = document.getElementById('panorama-fallback');
    if (el) el.classList.add('hidden');
  }

  /** Destroy the viewer (cleanup) */
  function destroy() {
    GameState.set('mapillaryImageId', null);
  }

  return { init, reset, loadLocation, loadById, findImage, destroy };
})();
