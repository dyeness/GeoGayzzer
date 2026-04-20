/**
 * Scoring — Haversine distance formula and score calculation.
 */

const Scoring = (() => {
  const EARTH_RADIUS_KM = 6371;
  const MAX_POINTS = 5000;

  /** Convert degrees to radians */
  function toRad(deg) {
    return (deg * Math.PI) / 180;
  }

  /**
   * Calculate the great-circle distance between two points (km).
   * Uses the Haversine formula.
   */
  function haversine(lat1, lng1, lat2, lng2) {
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_KM * c;
  }

  /**
   * Calculate score based on distance.
   * 0 km → 5000 pts, drops exponentially.
   * Decay constant of 2000 km means ~1839 pts at 2000 km.
   */
  function calculateScore(distanceKm) {
    const score = MAX_POINTS * Math.exp(-distanceKm / 2000);
    return Math.round(score);
  }

  /**
   * Format distance for display.
   * < 1 km → meters, otherwise km with 1 decimal.
   */
  function formatDistance(km) {
    if (km < 1) {
      return `${Math.round(km * 1000)} м`;
    }
    return `${km.toFixed(1)} км`;
  }

  /**
   * Get a rating string based on total score (out of 25000).
   */
  function getRating(totalScore) {
    if (totalScore >= 24000) return '🌟 Легенда';
    if (totalScore >= 20000) return '🏆 Эксперт';
    if (totalScore >= 15000) return '🎯 Продвинутый';
    if (totalScore >= 10000) return '📍 Средний';
    if (totalScore >= 5000)  return '🗺️ Новичок';
    return '🌱 Начинающий';
  }

  return { haversine, calculateScore, formatDistance, getRating, MAX_POINTS };
})();
