const https = require('https');
const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '..', 'geo_cache.json');

// ── Cache laden ──────────────────────────────────────────────────────────────

let cache = {};

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      console.log(`  🗺 GeoCache: ${Object.keys(cache).length} Städte geladen`);
    }
  } catch {
    cache = {};
  }
}

function saveCache() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
  } catch (e) {
    console.log('  ⚠ GeoCache: Speichern fehlgeschlagen:', e.message);
  }
}

// ── Einzelne Stadt geocodieren ───────────────────────────────────────────────

function geocodeCity(city) {
  return new Promise((resolve) => {
    const cityClean = city.replace(/\s+bei\s+\w+/i, '').trim();
    const query = encodeURIComponent(cityClean + ', Germany');
    const path = `/search?q=${query}&format=json&limit=1&countrycodes=de`;

    const req = https.get(
      {
        hostname: 'nominatim.openstreetmap.org',
        path,
        headers: {
          'User-Agent': 'ThesisRadar/1.0 (private job search tool)',
          Accept: 'application/json',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json[0]) {
              resolve([parseFloat(json[0].lat), parseFloat(json[0].lon)]);
            } else {
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        });
        res.on('error', () => resolve(null));
      },
    );

    req.setTimeout(8000, () => {
      req.destroy();
      resolve(null);
    });
    req.on('error', () => resolve(null));
  });
}

// ── Alle Städte aus Jobs geocodieren ────────────────────────────────────────

async function geocodeAllCities(jobs) {
  loadCache();

  // Einzigartige Städte die noch nicht im Cache sind
  const cities = [...new Set(jobs.map((j) => j.city).filter(Boolean))].filter((c) => !cache[c]);

  if (cities.length === 0) {
    console.log('  🗺 GeoCache: Alle Städte bereits im Cache');
    return;
  }

  console.log(`  🗺 GeoCache: ${cities.length} neue Städte geocodieren...`);

  for (const city of cities) {
    const coords = await geocodeCity(city);
    if (coords) {
      cache[city] = coords;
      console.log(`    ✓ ${city}: ${coords}`);
    } else {
      cache[city] = null; // null = nicht gefunden, nicht nochmal versuchen
      console.log(`    ✗ ${city}: nicht gefunden`);
    }
    // Nominatim Rate-Limit: 1 req/sec
    await new Promise((r) => setTimeout(r, 1100));
  }

  saveCache();
  console.log(`  🗺 GeoCache: ${Object.keys(cache).filter((k) => cache[k]).length} Städte mit Koordinaten`);
}

// ── Koordinaten abrufen ──────────────────────────────────────────────────────

function getCoords(city) {
  if (!city) return null;
  return cache[city] || null;
}

function getAllCoords() {
  return cache;
}

// Cache beim Import laden
loadCache();

module.exports = {geocodeAllCities, getCoords, getAllCoords, loadCache};
