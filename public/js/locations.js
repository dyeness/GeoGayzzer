/**
 * Locations — diverse global coordinates for the game.
 * Each location has lat/lng and metadata for the results screen.
 */

const Locations = (() => {
  const ALL = [
    { lat: 48.8584, lng: 2.2945,    name: 'Eiffel Tower',        country: 'Франция' },
    { lat: 40.7580, lng: -73.9855,  name: 'Times Square',        country: 'США' },
    { lat: 35.6595, lng: 139.7004,  name: 'Shibuya Crossing',    country: 'Япония' },
    { lat: 51.5007, lng: -0.1246,   name: 'Big Ben',             country: 'Великобритания' },
    { lat: 41.8902, lng: 12.4922,   name: 'Colosseum',           country: 'Италия' },
    { lat: -33.8568, lng: 151.2153, name: 'Sydney Opera House',  country: 'Австралия' },
    { lat: -22.9711, lng: -43.1822, name: 'Copacabana Beach',    country: 'Бразилия' },
    { lat: 55.7539, lng: 37.6208,   name: 'Red Square',          country: 'Россия' },
    { lat: 29.9792, lng: 31.1342,   name: 'Pyramids of Giza',    country: 'Египет' },
    { lat: 41.4036, lng: 2.1744,    name: 'Sagrada Familia',     country: 'Испания' },
    { lat: 41.0086, lng: 28.9802,   name: 'Hagia Sophia',        country: 'Турция' },
    { lat: 13.7500, lng: 100.4913,  name: 'Grand Palace',        country: 'Таиланд' },
    { lat: 52.5163, lng: 13.3777,   name: 'Brandenburg Gate',    country: 'Германия' },
    { lat: -34.6037, lng: -58.3816, name: 'Obelisco',            country: 'Аргентина' },
    { lat: 52.3731, lng: 4.8932,    name: 'Dam Square',          country: 'Нидерланды' },
    { lat: 25.1972, lng: 55.2744,   name: 'Burj Khalifa',        country: 'ОАЭ' },
    { lat: 37.8199, lng: -122.4783, name: 'Golden Gate Bridge',  country: 'США' },
    { lat: 50.0875, lng: 14.4213,   name: 'Old Town Square',     country: 'Чехия' },
    { lat: 1.2814,  lng: 103.8585,  name: 'Marina Bay',          country: 'Сингапур' },
    { lat: 37.9715, lng: 23.7267,   name: 'Acropolis',           country: 'Греция' },
  ];

  /**
   * Pick `count` random locations from the pool.
   * Uses Fisher-Yates shuffle for unbiased selection.
   */
  function pickRandom(count = 5) {
    const pool = [...ALL];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count);
  }

  return { ALL, pickRandom };
})();
