// Provider: one-way light time Earth→Mars, computed live from JPL's
// approximate Keplerian elements (Standish, valid 1800–2050, J2000 ecliptic).
import { LANDING } from './waypoints.js';
const AU_KM = 149597870.7, C_KMS = 299792.458, D2R = Math.PI / 180;
const EL = { // a, e, I, L, varpi, Omega and their rates per century
  earth: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0, 0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0],
  mars: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891, 0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
};
function helio(body, T) {
  const e0 = EL[body], el = e0.slice(0, 6).map((v, i) => v + e0[i + 6] * T);
  const [a, e, I, L, w, O] = el, om = w - O;
  let M = ((L - w) % 360 + 540) % 360 - 180, E = M * D2R;
  for (let i = 0; i < 6; i++) E -= (E - e * Math.sin(E) - M * D2R) / (1 - e * Math.cos(E));
  const x = a * (Math.cos(E) - e), y = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const [co, so, cO, sO, cI, sI] = [om, om, O, O, I, I].map((d, i) => (i % 2 ? Math.sin : Math.cos)(d * D2R));
  return [(co * cO - so * sO * cI) * x + (-so * cO - co * sO * cI) * y,
          (co * sO + so * cO * cI) * x + (-so * sO + co * cO * cI) * y,
          so * sI * x + co * sI * y];
}
export function lightMinutes(date) {
  const T = (date.getTime() / 86400000 + 2440587.5 - 2451545) / 36525;
  const a = helio('earth', T), b = helio('mars', T);
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * AU_KM / C_KMS / 60;
}
export function lightTimeProvider() {
  return {
    name: 'Cálculo en vivo · órbitas JPL (Standish)',
    metadata: [{ key: 'lightTime', name: 'Tiempo de luz Tierra–Marte', unit: 'min', digits: 2,
      meaning: (v) => `Una orden enviada ahora tarda ${v.toLocaleString('es', { maximumFractionDigits: 1 })} min en llegar a Percy; por eso maneja solo.` }],
    supportsRequest: (k) => k === 'lightTime',
    async request() {
      const out = [];
      for (let t = LANDING; t <= Date.now(); t += 86400000 * 3) out.push({ t: new Date(t), value: lightMinutes(new Date(t)) });
      out.push({ t: new Date(), value: lightMinutes(new Date()) });
      return out;
    },
    supportsSubscribe: (k) => k === 'lightTime',
    subscribe(k, cb) {
      const tick = () => cb({ t: new Date(), value: lightMinutes(new Date()) });
      tick(); const id = setInterval(tick, 1000);
      return () => clearInterval(id);
    },
  };
}
