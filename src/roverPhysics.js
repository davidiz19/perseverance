// Perseverance driving physics.
// - Splits the single "Wheels_objs" mesh into 6 wheels (3 per side) that spin and steer.
// - Kinematics like the real rover: 6-wheel drive, 4 corner wheels steer (Ackermann),
//   turn-in-place when stopped; each wheel spins at its own ground speed.
// - Rocker-bogie: body height, pitch and roll come from the 6 wheel contact points,
//   with the differential averaging left/right rockers.
// - Longitudinal dynamics: motor force limited, Mars gravity on slopes (3.71 m/s²),
//   rolling resistance in sand, and slip that grows on steep slopes.
import * as THREE from 'three';

const G_MARS = 3.71;           // m/s²
const MASS = 1025;             // kg
const WHEEL_RADIUS_REAL = 0.2625; // 52.5 cm diameter
const MAX_SPEED = 4;           // m/s — real top speed is 0.042 m/s; sped up ~100x to be playable
const MAX_TURN = 0.6;          // rad/s yaw when turning in place
const ROLLING = 0.08;          // rolling-resistance coefficient on loose sand
const MAX_SLOPE = 30 * Math.PI / 180; // NASA design limit

/** Split the fused wheel mesh into 6 spinnable wheels, re-parented under `rover`. */
export function splitWheels(model, rover) {
  const src = model.getObjectByName('Wheels_objs');
  if (!src) throw new Error('Wheels_objs no está en el modelo');
  rover.updateMatrixWorld(true);
  const toRover = new THREE.Matrix4().copy(rover.matrixWorld).invert();
  const meshes = [];
  src.traverse((o) => { if (o.isMesh) meshes.push(o); });

  // Bake every triangle into rover space and tag it with a wheel (side × front/mid/rear).
  const parts = []; // { mesh, geo(non-indexed, rover space) }
  const centroids = [];
  for (const m of meshes) {
    const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toRover, m.matrixWorld));
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i += 3) {
      centroids.push({ part: parts.length, tri: i / 3,
        x: (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, z: (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3 });
    }
    parts.push({ mesh: m, geo });
  }
  // 1-D k-means on z (3 axles), side by sign of x
  const zs = centroids.map((c) => c.z);
  let k = [Math.min(...zs), (Math.min(...zs) + Math.max(...zs)) / 2, Math.max(...zs)];
  for (let it = 0; it < 12; it++) {
    const sum = [0, 0, 0], n = [0, 0, 0];
    for (const c of centroids) { const j = nearest(k, c.z); sum[j] += c.z; n[j]++; }
    k = k.map((v, j) => (n[j] ? sum[j] / n[j] : v));
  }
  const wheels = [];
  for (const side of [-1, 1]) for (let axle = 0; axle < 3; axle++) {
    const sel = centroids.filter((c) => Math.sign(c.x || 1) === side && nearest(k, c.z) === axle);
    const geos = parts.map(() => []);
    for (const c of sel) geos[c.part].push(c.tri);
    const box = new THREE.Box3(), tmp = new THREE.Vector3();
    const subs = geos.map((tris, pi) => {
      if (!tris.length) return null;
      const s = parts[pi].geo, out = new THREE.BufferGeometry();
      for (const name of Object.keys(s.attributes)) {
        const a = s.attributes[name], arr = new a.array.constructor(tris.length * 3 * a.itemSize);
        tris.forEach((t, j) => arr.set(a.array.subarray(t * 3 * a.itemSize, (t * 3 + 3) * a.itemSize), j * 3 * a.itemSize));
        out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize, a.normalized));
      }
      const pp = out.attributes.position;
      for (let i = 0; i < pp.count; i++) box.expandByPoint(tmp.fromBufferAttribute(pp, i));
      return { geo: out, material: parts[pi].mesh.material };
    }).filter(Boolean);
    const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const steer = new THREE.Group(); steer.position.copy(center);           // yaw (corner steering)
    const spin = new THREE.Group(); steer.add(spin);                         // roll about axle (X)
    for (const s of subs) {
      s.geo.translate(-center.x, -center.y, -center.z);
      const mesh = new THREE.Mesh(s.geo, s.material); mesh.castShadow = mesh.receiveShadow = true;
      spin.add(mesh);
    }
    rover.add(steer);
    wheels.push({ side, axle, steer, spin, x: center.x, z: center.z, rest: center.clone(),
      radius: Math.max(size.y, size.z) / 2 || WHEEL_RADIUS_REAL, corner: axle !== 1 });
    if (!subs.length) throw new Error(`rueda vacía (lado ${side}, eje ${axle})`);
  }
  for (const m of meshes) m.visible = false;
  // name axles: front is −z (k sorted ascending since it started at min, mid, max)
  for (const w of wheels) w.pos = ['front', 'mid', 'rear'][w.axle];
  return wheels;
}
const nearest = (k, z) => k.reduce((b, v, j) => (Math.abs(z - v) < Math.abs(z - k[b]) ? j : b), 0);

export class RoverDynamics {
  constructor(rover, wheels, groundY) {
    Object.assign(this, { rover, wheels, groundY });
    this.heading = 0; this.speed = 0; this.yawRate = 0;
    this.pitch = 0; this.roll = 0; this.slip = 0;
    this.track = Math.max(...wheels.map((w) => Math.abs(w.x))) * 2;
    this.wheelbase = Math.max(...wheels.map((w) => w.z)) - Math.min(...wheels.map((w) => w.z));
    this.contacts = wheels.map(() => new THREE.Vector3());
    this._q = new THREE.Quaternion(); this._e = new THREE.Euler(0, 0, 0, 'YXZ');
  }

  update(dt, throttle, steerInput) {
    const { rover, wheels } = this;
    // --- longitudinal: motor force vs gravity on slope + rolling resistance
    const slopeAccel = -G_MARS * Math.sin(this.pitch);       // pitch>0 = nose up → slows
    const motor = throttle * 1.6;                             // m/s² available from the 6 motors
    const resist = ROLLING * G_MARS * Math.cos(this.pitch) * Math.sign(this.speed);
    let a = motor + slopeAccel - resist;
    if (!throttle) a -= this.speed * 2.5;                     // motors brake when released
    this.speed = THREE.MathUtils.clamp(this.speed + a * dt, -MAX_SPEED * 0.5, MAX_SPEED);
    if (!throttle && Math.abs(this.speed) < 0.05) this.speed = 0;
    // slip in loose sand grows with slope; over the design limit the wheels mostly dig in
    this.slip = THREE.MathUtils.clamp((Math.abs(this.pitch) / MAX_SLOPE) ** 2, 0, 0.9);
    const groundSpeed = this.speed * (1 - this.slip);

    // --- steering: Ackermann while moving, point turn when stopped
    const pointTurn = Math.abs(this.speed) < 0.15 && steerInput !== 0 && !throttle;
    const targetYaw = pointTurn ? steerInput * MAX_TURN
      : steerInput * Math.min(MAX_TURN, Math.abs(groundSpeed) / 3.5) * Math.sign(groundSpeed || 1);
    this.yawRate = THREE.MathUtils.lerp(this.yawRate, targetYaw, 1 - Math.exp(-4 * dt));
    this.heading += this.yawRate * dt;

    rover.position.x -= Math.sin(this.heading) * groundSpeed * dt;
    rover.position.z -= Math.cos(this.heading) * groundSpeed * dt;

    // --- per-wheel steer angle and spin from its own velocity (v + ω × r)
    for (const w of wheels) {
      // wheel velocity in rover frame = forward (0,0,−v) + ω×r, with ω about +Y: (ω·z, 0, −ω·x)
      const vxl = this.yawRate * w.z;
      const vzl = -groundSpeed - this.yawRate * w.x;
      let ang = 0;
      if (w.corner) {
        ang = Math.atan2(-vxl, -vzl);
        if (Math.abs(vzl) < 1e-4 && Math.abs(vxl) < 1e-4) ang = 0;
        if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI; // drive backwards instead
      }
      w.steer.rotation.y = THREE.MathUtils.lerp(w.steer.rotation.y, ang, 1 - Math.exp(-8 * dt));
      // speed along the wheel's rolling direction
      const dirx = -Math.sin(w.steer.rotation.y), dirz = -Math.cos(w.steer.rotation.y);
      const roll = (vxl * dirx + vzl * dirz) / (1 - this.slip || 1); // wheels spin faster than ground when slipping
      w.spin.rotation.x -= (roll * dt) / w.radius;
    }

    // --- rocker-bogie attitude from the 6 contact points
    const ch = Math.cos(this.heading), sh = Math.sin(this.heading);
    let sum = 0, front = 0, rear = 0, left = 0, right = 0, nf = 0, nr = 0;
    wheels.forEach((w, i) => {
      const x = rover.position.x + ch * w.x + sh * w.z, z = rover.position.z - sh * w.x + ch * w.z;
      const y = this.groundY(x, z); this.contacts[i].set(x, y, z); sum += y;
      if (w.pos === 'front') { front += y; nf++; } else if (w.pos === 'rear') { rear += y; nr++; }
      if (w.side < 0) left += y; else right += y;
    });
    const pitch = Math.atan2(front / nf - rear / nr, this.wheelbase);   // nose up positive
    const roll = Math.atan2(left / 3 - right / 3, this.track);          // left side up positive
    const k = 1 - Math.exp(-10 * dt);
    this.pitch = THREE.MathUtils.lerp(this.pitch, pitch, k);
    this.roll = THREE.MathUtils.lerp(this.roll, roll, k);
    rover.position.y = THREE.MathUtils.lerp(rover.position.y, sum / 6, k);
    this._e.set(this.pitch, this.heading, -this.roll);
    rover.quaternion.setFromEuler(this._e);
  }

  /** World positions under the rear wheels, for ruts. */
  rearContacts() {
    return this.wheels.map((w, i) => (w.pos === 'rear' ? this.contacts[i] : null)).filter(Boolean);
  }
}
