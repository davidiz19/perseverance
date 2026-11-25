import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ---------- noise ----------
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}
function fbm(x, y, o = 5) { let f = 0, a = 0.5; for (let i = 0; i < o; i++) { f += a * vnoise(x, y); x *= 2.03; y *= 2.03; a *= 0.5; } return f; }
function height(x, z) {
  const wx = x + fbm(x * 0.01, z * 0.01, 3) * 40;
  const ridge = 1 - Math.abs(Math.sin(wx * 0.045 + z * 0.012)); // sharp dune crests
  const dunes = Math.pow(ridge, 1.6) * 6;
  const big = fbm(x * 0.003, z * 0.003, 4) * 28;
  const fine = fbm(x * 0.15, z * 0.15, 3) * 0.25;
  const far = Math.max(0, -z - 250) * 0.12 * (0.6 + fbm(x * 0.006, 3.3, 3)); // distant mesas
  return dunes + big + fine + far;
}

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const dust = new THREE.Color('#b97a48');
scene.fog = new THREE.FogExp2(dust, 0.0032);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 4000);
camera.position.set(0, height(0, 40) + 6, 40);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, height(0, 0) + 4, -20);
controls.enableDamping = true; controls.autoRotate = true; controls.autoRotateSpeed = 0.15;
controls.maxPolarAngle = Math.PI * 0.49;

// ---------- sun ----------
const sunDir = new THREE.Vector3(-0.55, 0.16, -1).normalize();
const sun = new THREE.DirectionalLight('#ffd2a0', 3.2);
sun.position.copy(sunDir).multiplyScalar(200);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -120, right: 120, top: 120, bottom: -120, near: 1, far: 600 });
sun.shadow.radius = 4; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight('#f0b88a', '#8a4a2a', 1.6));

// ---------- sky ----------
const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 64, 32), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { sunDir: { value: sunDir } },
  vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform vec3 sunDir; varying vec3 vDir;
    void main(){
      vec3 d = normalize(vDir); float h = d.y;
      vec3 zenith = vec3(0.10,0.035,0.012), mid = vec3(0.36,0.15,0.05), horizon = vec3(0.62,0.33,0.15);
      vec3 col = mix(horizon, mid, smoothstep(0.0,0.25,h)); col = mix(col, zenith, smoothstep(0.25,0.9,h));
      float c = max(dot(d, sunDir), 0.);
      col = mix(col, vec3(0.35,0.48,0.65), pow(c, 90.)*0.45);   // blue Martian sunset halo
      col += vec3(1.,0.8,0.55) * pow(c, 400.)*0.8;
      col += vec3(1.,0.97,0.9) * smoothstep(0.9996,0.9999,c)*4.;  // sun disk
      col = mix(col, vec3(0.55,0.28,0.12), smoothstep(0.05,-0.05,h));
      gl_FragColor = vec4(col,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
}));
scene.add(sky);

// ---------- terrain ----------
const SIZE = 1400, SEG = 320;
const tg = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG); tg.rotateX(-Math.PI / 2);
const tp = tg.attributes.position, cols = new Float32Array(tp.count * 3);
const cA = new THREE.Color('#a8492a'), cB = new THREE.Color('#d08a55'), cC = new THREE.Color('#6e2f1c'), tmp = new THREE.Color();
for (let i = 0; i < tp.count; i++) {
  const x = tp.getX(i), z = tp.getZ(i), y = height(x, z); tp.setY(i, y);
  const n = fbm(x * 0.02 + 7, z * 0.02, 3) * 0.5 + 0.5;
  tmp.copy(cA).lerp(cB, THREE.MathUtils.clamp(n * 0.8 + y * 0.01, 0, 1)).lerp(cC, THREE.MathUtils.clamp(fbm(x * 0.05, z * 0.05 + 9, 2), 0, 0.5));
  cols.set([tmp.r, tmp.g, tmp.b], i * 3);
}
tg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
tg.computeVertexNormals();
const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
terrain.receiveShadow = true; terrain.castShadow = true;
scene.add(terrain);

// ---------- rocks ----------
const rg = new THREE.IcosahedronGeometry(1, 3), rp = rg.attributes.position, v = new THREE.Vector3();
for (let i = 0; i < rp.count; i++) {
  v.fromBufferAttribute(rp, i);
  const k = 1 + fbm(v.x * 1.7 + 3, v.y * 1.7 + v.z, 4) * 0.45;
  v.multiplyScalar(k); v.y *= 0.65; rp.setXYZ(i, v.x, v.y, v.z);
}
rg.computeVertexNormals();
const ROCKS = 700;
const rocks = new THREE.InstancedMesh(rg, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, flatShading: true }), ROCKS);
rocks.castShadow = rocks.receiveShadow = true;
const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < ROCKS; i++) {
  const r = 14 + Math.pow(rnd(), 0.7) * 220, a = rnd() * Math.PI * 2;
  const x = Math.cos(a) * r, z = Math.sin(a) * r - 10;
  const s = 0.15 + Math.pow(rnd(), 5) * 3.5 * Math.min(1, r / 40);
  pos.set(x, height(x, z) + s * 0.15, z);
  q.setFromEuler(new THREE.Euler(rnd() * 0.5, rnd() * 6.28, rnd() * 0.5));
  sc.set(s * (0.8 + rnd() * 0.6), s, s * (0.8 + rnd() * 0.6));
  rocks.setMatrixAt(i, m.compose(pos, q, sc));
  rocks.setColorAt(i, tmp.set('#8a4a30').offsetHSL(0, 0, (rnd() - 0.5) * 0.12));
}
scene.add(rocks);

// ---------- moons (Phobos & Deimos) ----------
function moon(r, irregular, dir, dist) {
  const g = new THREE.IcosahedronGeometry(r, 4), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const k = 1 + fbm(v.x * 2 + 5, v.y * 2 + v.z * 2, 4) * irregular - Math.max(0, fbm(v.x * 6, v.z * 6 + v.y, 2)) * 0.12;
    v.multiplyScalar(r * k); v.x *= 1.25; p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#d8c8b8', roughness: 1, emissive: '#c9b8a8', emissiveIntensity: 0.35, fog: false }));
  mesh.position.copy(dir.normalize()).multiplyScalar(dist);
  scene.add(mesh); return mesh;
}
const phobos = moon(16, 0.3, new THREE.Vector3(0.34, 0.15, -1), 1400);
const deimos = moon(9, 0.15, new THREE.Vector3(0.12, 0.11, -1), 1500);

// ---------- floating dust ----------
const DN = 4000, dpos = new Float32Array(DN * 3);
for (let i = 0; i < DN; i++) dpos.set([(rnd() - 0.5) * 300, rnd() * 40, (rnd() - 0.5) * 300 - 40], i * 3);
const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
const dust_pts = new THREE.Points(dg, new THREE.PointsMaterial({ color: '#e8b890', size: 0.25, transparent: true, opacity: 0.5, depthWrite: false }));
scene.add(dust_pts);

// ---------- loop ----------
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const t = clock.getElapsedTime();
  dust_pts.position.x = (t * 1.5) % 40 - 20; dust_pts.position.y = Math.sin(t * 0.3) * 0.5;
  phobos.rotation.y = t * 0.02; deimos.rotation.y = t * 0.01;
  controls.update();
  renderer.render(scene, camera);
});
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
