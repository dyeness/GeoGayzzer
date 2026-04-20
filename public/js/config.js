/**
 * Config — loads API tokens from the server.
 * Other modules await GameConfig.ready before accessing tokens.
 */

const GameConfig = (() => {
  let _config = null;
  let _readyPromise = null;

  /** Fetch the configuration from the server */
  async function load() {
    try {
      const res = await fetch('/api/config');
      if (!res.ok) throw new Error(`Config fetch failed: ${res.status}`);
      _config = await res.json();
    } catch (err) {
      console.error('Failed to load config:', err);
      _config = {};
    }
  }

  // Start loading immediately
  _readyPromise = load();

  return {
    /** Resolves when config is loaded */
    ready: _readyPromise,

    /** Get Mapillary access token */
    get mapillaryToken() {
      return _config?.mapillaryToken ?? '';
    },
  };
})();
