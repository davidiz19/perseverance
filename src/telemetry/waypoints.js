// Provider: NASA/JPL MMGIS drive history of Perseverance (one point per drive).
const URL = 'https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json';
// Same NASA file saved 2026-11-25 (through sol 2022), used only if the live one can't be reached.
const SNAPSHOT = { url: '/data/M20_waypoints.json', date: '25 nov 2026' };
export const LANDING = Date.UTC(2021, 1, 18, 20, 55); // Jezero touchdown, sol 0
export const SOL_MS = 88775244;
export const solToDate = (sol) => new Date(LANDING + sol * SOL_MS);

export function waypointsProvider() {
  let cache;
  const get = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });
  // ?datos=copia skips the live request (used by npm run check: NASA returns 403 to headless Chrome)
  const live = new URLSearchParams(location.search).get('datos') !== 'copia';
  const load = () => (cache ??= (live ? get(URL) : Promise.reject(new Error('modo copia'))).then((j) => { provider.origin = 'en vivo'; return j; })
    .catch((e) => {
      console.warn(`[telemetría] NASA en vivo no respondió (${e.message}); uso la copia del ${SNAPSHOT.date}`);
      provider.origin = `copia ${SNAPSHOT.date}`;
      return get(SNAPSHOT.url);
    })
    .then((j) => j.features.map((f) => f.properties)));
  const field = { distance: 'dist_total_m', elevation: 'elev_geoid', tilt: 'tilt' };
  const provider = {
    origin: '',
    name: 'NASA/JPL · historial de manejos (MMGIS)',
    metadata: [
      { key: 'distance', name: 'Distancia recorrida', unit: 'km', digits: 2,
        meaning: (v) => `Percy ha manejado ${v.toLocaleString('es', { maximumFractionDigits: 1 })} km por Jezero: más de ${Math.floor(v / 0.105)} campos de fútbol, a un ritmo de caracol.` },
      { key: 'elevation', name: 'Altura del terreno', unit: 'm', digits: 0,
        meaning: (v, first) => `Está ${Math.round(v - first)} m más alto que donde aterrizó: subió del fondo del cráter al borde.` },
      { key: 'tilt', name: 'Inclinación', unit: '°', digits: 1,
        meaning: (v) => v < 5 ? 'Casi plano en su última parada.' : v < 15 ? `Inclinado ${v.toLocaleString('es', { maximumFractionDigits: 1 })}°, como una calle empinada.` : `Inclinado ${v.toLocaleString('es', { maximumFractionDigits: 1 })}°: una ladera seria; el límite seguro ronda los 30°.` },
    ],
    supportsRequest: (k) => k in field,
    async request(k) {
      let rows = await load();
      // mid-drive localizations carry dist_total_m = 0 (no total computed): skip them for distance
      if (k === 'distance') rows = rows.filter((p, i) => i === 0 || p.dist_total_m > 0);
      return rows.map((p) => ({ t: solToDate(p.sol), sol: p.sol,
        value: k === 'distance' ? p[field[k]] / 1000 : p[field[k]] }));
    },
  };
  return provider;
}
