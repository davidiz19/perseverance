// Mission-control HUD: a view over the TelemetryAPI. It only knows keys;
// names, units, providers and meanings come from each provider's metadata.
import { TelemetryAPI } from './telemetry/api.js';
import { waypointsProvider } from './telemetry/waypoints.js';
import { lightTimeProvider } from './telemetry/lightTime.js';

const css = `
#mc{position:fixed;right:max(16px,env(safe-area-inset-right));top:16px;width:min(380px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;
  font:13px/1.4 ui-monospace,"SF Mono",Menlo,Consolas,monospace;color:#f6e6d6;
  background:linear-gradient(180deg,rgba(40,18,10,.72),rgba(30,14,8,.6));backdrop-filter:blur(8px);
  border:1px solid rgba(255,190,140,.25);border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.35);transition:opacity .25s,transform .25s}
#mc.off{opacity:0;transform:translateX(20px);pointer-events:none}
#mc header{display:flex;justify-content:space-between;align-items:baseline;padding:10px 14px;border-bottom:1px solid rgba(255,190,140,.18)}
#mc h1{margin:0;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#ffcf9a}
#mc .hint{font-size:11px;color:#c9a88f}
#mc .hint b{border:1px solid #c9a88f;border-radius:3px;padding:0 4px;color:#ffe0c0}
#mc .card{padding:8px 14px;border-bottom:1px solid rgba(255,190,140,.12)}
#mc .row{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
#mc .name{color:#e8c6aa;font-size:12px}
#mc .val{font-size:20px;font-variant-numeric:tabular-nums;color:#fff}
#mc .val small{font-size:12px;color:#e8c6aa;margin-left:3px}
#mc canvas{display:block;width:100%;height:40px;margin:4px 0 3px}
#mc .mean{margin:0;color:#f1d9c4;font-family:system-ui,sans-serif;font-size:12.5px}
#mc .src{font-size:10.5px;color:#a8876f;margin-top:3px}
#mc .live{display:inline-block;width:6px;height:6px;border-radius:50%;background:#7fe08a;margin-right:5px;animation:mcp 1s infinite alternate}
@keyframes mcp{to{opacity:.3}}
#mc [data-state=error] .val{color:#ff8a7a;font-size:14px}
#mc-tip{position:fixed;left:16px;bottom:16px;font:12px ui-monospace,monospace;color:#f6e6d6;background:rgba(30,14,8,.55);padding:6px 10px;border-radius:6px}
`;

function sparkline(canvas, pts, color) {
  const dpr = devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const g = canvas.getContext('2d'); g.scale(dpr, dpr);
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  let lo = Infinity, hi = -Infinity; for (const p of pts) { lo = Math.min(lo, p.value); hi = Math.max(hi, p.value); }
  const pad = (hi - lo) * 0.1 || 1, X = (t) => ((t - t0) / (t1 - t0 || 1)) * (w - 6) + 3, Y = (v) => h - 12 - ((v - lo + pad) / (hi - lo + 2 * pad)) * (h - 16);
  g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo : g.moveTo).call(g, X(p.t), Y(p.value)));
  g.strokeStyle = color; g.lineWidth = 1.5; g.stroke();
  g.lineTo(X(t1), h - 12); g.lineTo(X(t0), h - 12); g.closePath(); g.fillStyle = color + '22'; g.fill();
  const last = pts[pts.length - 1]; g.fillStyle = '#fff'; g.beginPath(); g.arc(X(last.t), Y(last.value), 2.5, 0, 7); g.fill();
  g.fillStyle = '#a8876f'; g.font = '10px ui-monospace,monospace';
  g.fillText(new Date(t0).getFullYear(), 2, h - 1); const end = 'hoy'; g.fillText(end, w - g.measureText(end).width - 2, h - 1);
}

export function createMissionControl() {
  const telemetry = new TelemetryAPI();
  telemetry.addProvider(waypointsProvider());
  telemetry.addProvider(lightTimeProvider());
  window.telemetry = telemetry; // handy from the console

  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));
  const panel = document.createElement('section'); panel.id = 'mc';
  panel.innerHTML = `<header><h1>Control de misión · Percy</h1><span class="hint"><b>T</b> ocultar</span></header>`;
  document.body.append(panel);
  const tip = Object.assign(document.createElement('div'), { id: 'mc-tip', innerHTML: 'WASD manejar · ratón mirar · T control de misión' });
  document.body.append(tip);

  const colors = { distance: '#ffb070', elevation: '#9fd0ff', tilt: '#ffd76a', lightTime: '#c6a0ff' };
  for (const key of ['distance', 'elevation', 'tilt', 'lightTime']) {
    const m = telemetry.getMetadata(key);
    const card = document.createElement('article'); card.className = 'card';
    card.dataset.telemetry = key; card.dataset.state = 'loading';
    card.innerHTML = `<div class="row"><span class="name">${m.name}</span><span class="val">…</span></div>
      <canvas aria-label="${m.name} durante toda la misión"></canvas><p class="mean">Cargando…</p>
      <div class="src">${m.provider}</div>`;
    panel.append(card);
    const val = card.querySelector('.val'), mean = card.querySelector('.mean'), cv = card.querySelector('canvas');
    let history = [];
    const show = (v) => {
      val.innerHTML = `${v.toLocaleString('es', { minimumFractionDigits: m.digits, maximumFractionDigits: m.digits })}<small>${m.unit}</small>`;
      card.dataset.value = v;
      mean.textContent = m.meaning(v, history[0]?.value);
    };
    telemetry.request(key).then((h) => {
      history = h; sparkline(cv, h, colors[key]);
      const last = h[h.length - 1];
      show(last.value);
      if (last.sol != null) card.querySelector('.src').textContent = `${m.provider} · sol ${last.sol} · ${m.source.origin}`;
      card.dataset.state = 'ready';
      if (key === 'lightTime') {
        card.querySelector('.src').innerHTML = `<span class="live"></span>${m.provider}`;
        telemetry.subscribe(key, (d) => show(d.value));
      }
    }).catch((e) => {
      card.dataset.state = 'error'; val.textContent = 'sin datos'; mean.textContent = e.message;
      console.error(`[telemetría] ${key}:`, e);
    });
  }

  addEventListener('keydown', (e) => {
    if (e.code === 'KeyT' && !e.repeat) {
      const off = panel.classList.toggle('off');
      panel.setAttribute('aria-hidden', off);
    }
  });
  return telemetry;
}
