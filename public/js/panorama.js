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
    // Suppress non-fatal viewer errors (e.g. "Param z must be a number" for non-spherical tiles)
    viewer.on('error', (e) => {
      console.warn('[Mapillary viewer]', e?.message ?? e);
    });
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
   * Sequential search for a Mapillary image near lat/lng.
   * Pass 1: panoramic images only (is_pano=true).
   * Pass 2: any image (viewer handles flat images gracefully).
   * Uses limit=1 to avoid Mapillary rate-limit 500 errors.
   */
  async function findImage(lat, lng) {
    const deltas = [0.003, 0.007, 0.02, 0.04];

    async function trySearch(delta, extraParams = {}) {
      const bbox = [lng - delta, lat - delta, lng + delta, lat + delta].join(',');
      const params = new URLSearchParams({ bbox, limit: '1', ...extraParams });
      try {
        const res = await fetchWithTimeout(`/api/mapillary/images?${params}`, 6000);
        if (!res.ok) return null;
        const data = await res.json();
        if (!data?.data?.length) return null;
        const img = data.data[0];
        const coords = img.geometry?.coordinates;   // no computed_geometry \u2014 reduces server load
        if (!coords) return null;
        return { id: img.id, lat: coords[1], lng: coords[0] };
      } catch { return null; }
    }

    // Pass 1: panoramic only
    for (const delta of deltas) {
      const r = await trySearch(delta, { is_pano: 'true' });
      if (r) return r;
      await new Promise(res => setTimeout(res, 120));
    }
    // Pass 2: any image
    for (const delta of deltas) {
      const r = await trySearch(delta, {});
      if (r) return r;
      await new Promise(res => setTimeout(res, 120));
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

    try {
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

          // Success — clean up UI state
          const el = document.getElementById('panorama-container');
          if (el) el.style.filter = '';  // ALWAYS remove blur on success
          
          try {
            viewer.resize();
          } catch (e) {
            console.warn('viewer.resize() failed:', e.message);
          }
          
          const compass = document.getElementById('compass');
          if (compass) compass.classList.remove('hidden');
          
          UI.showPanoramaLoading(false);

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
    } finally {
      // CRITICAL: Ensure blur filter is removed even on early return or cancellation
      if (myGen === _loadGen) {
        const el = document.getElementById('panorama-container');
        if (el && el.style.filter) {
          el.style.filter = '';
        }
      }
    }
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

    try {
      GameState.set('mapillaryImageId', imageId);

      for (let attempt = 1; attempt <= 3; attempt++) {
        if (myGen !== _loadGen) return null;
        try {
          await Promise.race([viewer.moveTo(imageId), timeout(MOVETO_TIMEOUT_MS)]);
          if (myGen !== _loadGen) return null;

          // Success — clean up UI state
          const el = document.getElementById('panorama-container');
          if (el) el.style.filter = '';  // ALWAYS remove blur on success
          
          try {
            viewer.resize();
          } catch (e) {
            console.warn('viewer.resize() failed:', e.message);
          }
          
          const compass = document.getElementById('compass');
          if (compass) compass.classList.remove('hidden');
          
          UI.showPanoramaLoading(false);

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
    } finally {
      // CRITICAL: Ensure blur filter is removed even on early return or cancellation
      if (myGen === _loadGen) {
        const el = document.getElementById('panorama-container');
        if (el && el.style.filter) {
          el.style.filter = '';
        }
      }
    }
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

  /**
   * Block panorama interaction for `ms` milliseconds at round start.
   * Shows a transparent overlay (cursor:not-allowed) for the duration.
   */
  function lockInteraction(ms = 1500) {
    const el = document.getElementById('panorama-lock');
    if (!el) return;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), ms);
  }

  return { init, reset, loadLocation, loadById, findImage, destroy, lockInteraction };
})();
