// Percy's cameras: glowing hotspots on the real model parts. Click one → shutter,
// flash, and a real Perseverance raw image (NASA/JPL-Caltech) develops on screen.
// Photos were picked by hand from the NASA raw-images API and saved in /public/photos
// (NASA's CDN refuses some automated browsers, so they ship with the game).
import * as THREE from 'three';

const CAMS = [
  { part: 'Mastcam_Z_cams', key: 'mastcam', name: 'Mastcam-Z', what: 'los "ojos" con zoom en lo alto del mástil',
    nudge: [-0.16, 0.06, 0] }, // shares the mast head with Navcam: nudge apart so both are clickable
  { part: 'NavCams', key: 'navcam', name: 'Navcam', what: 'cámaras de navegación del mástil', nudge: [0.16, -0.02, 0] },
  { part: 'hazcams_front', key: 'hazcam', name: 'Hazcam frontal', what: 'ojo de pez que vigila obstáculos al frente' },
  { part: 'WATSON', key: 'watson', name: 'WATSON', what: 'lupa en la punta del brazo robótico' },
];

const css = `
#cam-tip{position:fixed;pointer-events:none;transform:translate(-50%,-140%);padding:4px 9px;border-radius:5px;
  font:12px ui-monospace,Menlo,monospace;color:#fff;background:rgba(30,14,8,.8);border:1px solid rgba(255,200,150,.35);white-space:nowrap}
#cam-tip small{display:block;color:#e8c6aa;font-family:system-ui,sans-serif}
#shutter{position:fixed;inset:0;pointer-events:none;z-index:20}
#shutter::before,#shutter::after{content:"";position:absolute;left:0;right:0;height:50%;background:#050302;transform:scaleY(0)}
#shutter::before{top:0;transform-origin:top}#shutter::after{bottom:0;transform-origin:bottom}
#shutter.snap::before,#shutter.snap::after{animation:shut .32s ease-in-out}
#shutter i{position:absolute;inset:0;background:#fff;opacity:0}
#shutter.snap i{animation:flash .7s ease-out .12s}
@keyframes shut{0%,100%{transform:scaleY(0)}45%,55%{transform:scaleY(1)}}
@keyframes flash{0%{opacity:.95}100%{opacity:0}}
#photo{position:fixed;inset:0;z-index:15;display:grid;place-items:center;background:rgba(10,4,2,.55);backdrop-filter:blur(3px)}
#photo figure{margin:0;max-width:min(92vw,1100px);background:#f4ece4;padding:12px 12px 10px;border-radius:4px;
  box-shadow:0 30px 80px rgba(0,0,0,.6);transform:rotate(-1deg);cursor:zoom-in;transition:transform .3s}
#photo figure.big{transform:none;max-width:98vw;cursor:zoom-out}
#photo img{display:block;max-width:100%;max-height:68vh;width:auto;margin:auto;background:#222}
#photo figure.big img{max-height:86vh}
#photo img.develop{animation:develop 3.2s ease-out both}
@keyframes develop{0%{filter:brightness(2.6) contrast(.25) saturate(0) blur(14px);opacity:.2}
  35%{filter:brightness(1.6) contrast(.55) saturate(.3) blur(6px);opacity:.8}100%{filter:none;opacity:1}}
#photo figcaption{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:8px;color:#3a2418;
  font:14px/1.35 system-ui,sans-serif}
#photo figcaption b{font:600 16px ui-monospace,Menlo,monospace}
#photo figcaption span{color:#6f5243;font-size:13px}
#photo .help{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);font:12px ui-monospace,monospace;color:#f6e6d6;
  background:rgba(30,14,8,.7);padding:6px 12px;border-radius:6px;opacity:0;transition:opacity .6s}
#photo .help.on{opacity:1}
#photo .count{font:12px ui-monospace,monospace;color:#6f5243}
`;

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.18, 'rgba(160,230,255,1)');
  r.addColorStop(0.3, 'rgba(90,200,255,.9)'); r.addColorStop(0.55, 'rgba(60,170,255,.3)'); r.addColorStop(1, 'rgba(80,190,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const daysAgo = (iso) => Math.max(0, Math.floor((Date.now() - Date.parse(iso + 'Z')) / 86400000));
const agoText = (d) => (d === 0 ? 'hoy' : d === 1 ? 'hace 1 día' : `hace ${d} días`);

export function setupCameras({ model, rover, camera, renderer, keys }) {
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));
  const tip = Object.assign(document.createElement('div'), { id: 'cam-tip', hidden: true });
  const shutter = Object.assign(document.createElement('div'), { id: 'shutter', innerHTML: '<i></i>' });
  document.body.append(tip, shutter);
  const photosReady = fetch('/photos/photos.json').then((r) => r.json());

  // --- hotspots on the real parts
  rover.updateMatrixWorld(true);
  const toRover = rover.matrixWorld.clone().invert(), tex = glowTexture(), dots = [];
  for (const c of CAMS) {
    const part = model.getObjectByName(c.part);
    if (!part) { console.warn(`cámara ${c.part} no está en el modelo`); continue; }
    const box = new THREE.Box3().setFromObject(part), center = box.getCenter(new THREE.Vector3()).applyMatrix4(toRover);
    if (c.nudge) center.add(new THREE.Vector3(...c.nudge));
    // fixed size on screen (sizeAttenuation off) so they stay findable from any distance
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true,
      sizeAttenuation: false, depthTest: false, depthWrite: false, toneMapped: false }));
    s.position.copy(center); s.scale.setScalar(0.04); s.renderOrder = 10; s.userData.cam = c;
    rover.add(s); dots.push(s);
  }

  // --- hover / click with raycaster
  // pick the dot whose on-screen center is nearest the cursor (dots can overlap in depth,
  // e.g. the front Hazcam sits right under the mast head when seen from behind)
  let hover = null, down = null, open = false;
  const v = new THREE.Vector3();
  const toScreen = (d) => { d.getWorldPosition(v).project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; };
  const pick = (e) => {
    let best = null, bestD = 16;
    for (const d of dots) { const p = toScreen(d), dist = Math.hypot(p.x - e.clientX, p.y - e.clientY); if (dist < bestD) { bestD = dist; best = d; } }
    return best;
  };
  const el = renderer.domElement;
  el.addEventListener('pointermove', (e) => {
    if (open) return;
    hover = pick(e);
    el.style.cursor = hover ? 'pointer' : '';
    tip.hidden = !hover;
    if (hover) {
      tip.innerHTML = `${hover.userData.cam.name}<small>${hover.userData.cam.what}</small>`;
      Object.assign(tip.style, { left: e.clientX + 'px', top: e.clientY + 'px' });
    }
  });
  el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  el.addEventListener('pointerup', (e) => {
    if (open || !down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return; // ignore orbit drags
    const hit = pick(e);
    if (hit) takePhoto(hit.userData.cam);
  });

  // --- viewer
  let viewer = null, list = [], idx = 0, cam = null;
  function render(first) {
    const p = list[idx], fig = viewer.querySelector('figure'), img = fig.querySelector('img');
    img.classList.remove('develop'); void img.offsetWidth;
    img.onload = () => { img.classList.add('develop'); viewer.dataset.loaded = 'true'; };
    viewer.dataset.loaded = 'false';
    img.src = p.file; img.alt = `${p.camera}, sol ${p.sol}: imagen real de Marte tomada por Perseverance`;
    viewer.dataset.camera = cam.key;
    fig.querySelector('figcaption').innerHTML = `<div><b>${p.camera}</b> · sol ${p.sol} · ${agoText(daysAgo(p.taken_utc))}
      <br><span>${p.instrument} · ${new Date(p.taken_utc + 'Z').toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })} · ${p.credit}</span></div>
      <span class="count">${idx + 1} / ${list.length}</span>`;
    if (first) setTimeout(() => viewer?.querySelector('.help').classList.add('on'), 3500);
  }
  async function takePhoto(c) {
    open = true; tip.hidden = true; el.style.cursor = '';
    for (const k in keys) keys[k] = false; // stop driving while looking
    shutter.classList.remove('snap'); void shutter.offsetWidth; shutter.classList.add('snap');
    const all = await photosReady;
    cam = c; list = all[c.key] ?? []; idx = 0;
    if (!list.length) { open = false; return console.error(`sin fotos para ${c.name}`); }
    viewer = document.createElement('div'); viewer.id = 'photo';
    viewer.innerHTML = `<figure><img><figcaption></figcaption></figure>
      <div class="help">clic: ampliar · ← → más fotos de ${c.name} · Esc: volver al juego</div>`;
    viewer.addEventListener('click', (e) => {
      if (e.target === viewer) return close();
      viewer.querySelector('figure').classList.toggle('big');
    });
    setTimeout(() => { document.body.append(viewer); render(true); }, 260); // appear behind the shutter
  }
  function close() { viewer?.remove(); viewer = null; open = false; }
  addEventListener('keydown', (e) => {
    if (!open) return;
    e.stopImmediatePropagation(); // the game ignores keys while a photo is open
    if (e.code === 'Escape') close();
    else if (viewer && (e.code === 'ArrowRight' || e.code === 'ArrowLeft')) {
      idx = (idx + (e.code === 'ArrowRight' ? 1 : list.length - 1)) % list.length; render(false);
    }
  }, true);

  // pulse
  const clock = new THREE.Clock();
  const tick = () => {
    const t = clock.getElapsedTime();
    dots.forEach((d, i) => d.scale.setScalar((d === hover ? 0.06 : 0.04) * (1 + 0.2 * Math.sin(t * 3 + i))));
  };
  // for npm run check
  window.percyCams = {
    list: dots.map((d) => ({ key: d.userData.cam.key, name: d.userData.cam.name, screen: () => toScreen(d) })),
  };
  return { tick, isOpen: () => open };
}
