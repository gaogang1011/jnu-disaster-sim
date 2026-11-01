const PED_MAX = IS_MOBILE ? 150 : 260;
const pedGeo = (() => {
  const body = new THREE.CylinderGeometry(0.26, 0.32, 1.05, 6).translate(0, 0.72, 0);
  const head = new THREE.SphereGeometry(0.2, 7, 6).translate(0, 1.42, 0);
  return mergeGeos([body, head]);
})();
const pedMesh = new THREE.InstancedMesh(pedGeo, new THREE.MeshStandardMaterial({ roughness: 0.85, vertexColors: false }), PED_MAX);
pedMesh.castShadow = true;
pedMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(PED_MAX * 3), 3);
scene.add(pedMesh);
const PED = [];
const pedPal = ['#d8534f', '#4f7fd8', '#e0a33a', '#48a071', '#8a5bbf', '#d96fa0', '#3fb2c4', '#c96a3a', '#e8e3dc', '#424852'].map(C);

function walkableNear(x, z) {
  const c = classAt(x, z);
  return c === CLS.open || c === CLS.road || c === CLS.grass;
}
function placePeds() {
  const r = mulberry32(55);
  let tries = 0;
  while (PED.length < PED_MAX && tries++ < 6000) {
    const x = rand(-470, 440), z = rand(-560, 540);
    if (!pointInPoly(x, z, DATA.campus)) continue;
    const c = classAt(x, z);
    if (c !== CLS.open && c !== CLS.road && c !== CLS.grass && c !== CLS.sport) continue;
    let near = false;
    for (const s of segsNear(x, z, 6)) if (segDist(s, x, z) < 2.2) { near = true; break; }
    if (near) continue;
    const col = pedPal[Math.floor(r() * pedPal.length)];
    PED.push({ x, z, y: H(x, z), dir: r() * TAU, spd: 0, panic: 0, phase: r() * TAU,
      tx: x + rand(-40, 40), tz: z + rand(-40, 40), col, bob: 0, alive: 1, idle: rand(0, 3) });
  }
  PED.forEach((p, i) => pedMesh.setColorAt(i, tmpC.copy(p.col)));
  pedMesh.count = PED.length;
  pedMesh.instanceColor.needsUpdate = true;
}

const THREATS = [];
function addThreat(x, z, r, strength, ttl) { THREATS.push({ x, z, r, strength, ttl }); }
function updateThreats(dt) {
  for (let i = THREATS.length - 1; i >= 0; i--) { THREATS[i].ttl -= dt; if (THREATS[i].ttl <= 0) THREATS.splice(i, 1); }
}

function updatePeds(dt) {
  const substep = Math.min(dt, 0.05);
  for (let i = 0; i < PED.length; i++) {
    const p = PED[i];
    if (!p.alive) continue;
    let fx = 0, fz = 0, maxThreat = 0;
    for (const th of THREATS) {
      const dx = p.x - th.x, dz = p.z - th.z, d = Math.hypot(dx, dz) || 1;
      if (d < th.r) { const w = th.strength * (1 - d / th.r); fx += (dx / d) * w; fz += (dz / d) * w; maxThreat = Math.max(maxThreat, 1 - d / th.r); }
    }
    const wl = waterLevel();
    if (wl > -900 && p.y < wl + 0.3) { const g = DATA.P.gwonje; const dx = g[0] - p.x, dz = g[1] - p.z, d = Math.hypot(dx, dz) || 1; fx += (dx / d) * 1.5; fz += (dz / d) * 1.5; maxThreat = Math.max(maxThreat, 0.6); }
    p.panic = Math.max(maxThreat, p.panic - dt * 0.4);
    if (p.panic > 0.05) {
      let a = Math.atan2(fz, fx);
      a += (vnoise2(p.x * 0.1 + S.time, p.z * 0.1) - 0.5) * 0.8;
      p.dir = a;
      p.spd = lerp(p.spd, 7 + p.panic * 6, damp(5, dt));
    } else {
      p.idle -= dt;
      const dtx = p.tx - p.x, dtz = p.tz - p.z, dd = Math.hypot(dtx, dtz);
      if (dd < 3 || p.idle < 0) {
        p.idle = rand(1, 4);
        const na = p.dir + rand(-1.6, 1.6);
        p.tx = clamp(p.x + Math.cos(na) * rand(15, 45), -480, 450);
        p.tz = clamp(p.z + Math.sin(na) * rand(15, 45), -570, 545);
      }
      const want = Math.atan2(p.tz - p.z, p.tx - p.x);
      let da = want - p.dir; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
      p.dir += da * damp(4, dt);
      p.spd = lerp(p.spd, 1.5, damp(2, dt));
    }
    const nx = p.x + Math.cos(p.dir) * p.spd * substep, nz = p.z + Math.sin(p.dir) * p.spd * substep;
    let blocked = false;
    if (p.panic < 0.3) { const c = classAt(nx, nz); if (c === CLS.building || c === CLS.water) blocked = true; }
    if (!blocked && nx > -485 && nx < 455 && nz > -575 && nz < 550) { p.x = nx; p.z = nz; }
    else p.dir += 2.2;
    p.y = H(p.x, p.z);
    p.bob += p.spd * substep * 3;
    const lean = p.panic > 0.3 ? 0.18 : 0;
    tmpE.set(lean * Math.cos(p.dir), -p.dir + Math.PI / 2, lean * Math.sin(p.dir));
    tmpQ.setFromEuler(tmpE);
    const bob = Math.abs(Math.sin(p.bob)) * 0.08 * Math.min(1, p.spd);
    tmpM.compose(tmpV.set(p.x, p.y + bob, p.z), tmpQ, tmpV2.set(1, 1 + bob * 0.2, 1));
    pedMesh.setMatrixAt(i, tmpM);
  }
  pedMesh.instanceMatrix.needsUpdate = true;
}
function killPedsAround(x, z, r) {
  for (let i = 0; i < PED.length; i++) {
    const p = PED[i];
    if (p.alive && Math.hypot(p.x - x, p.z - z) < r) { p.alive = 0; pedMesh.setMatrixAt(i, HIDE); }
  }
  pedMesh.instanceMatrix.needsUpdate = true;
}
function resetPeds() {
  const r = mulberry32(55);
  for (const p of PED) { p.alive = 1; p.panic = 0; p.spd = 0; p.y = H(p.x, p.z); }
  PED.forEach((p, i) => pedMesh.setMatrixAt(i, tmpM.compose(tmpV.set(p.x, p.y, p.z), tmpQ.setFromAxisAngle(UP, -p.dir), tmpV2.set(1, 1, 1))));
  pedMesh.instanceMatrix.needsUpdate = true;
}

const carBodyGeo = mergeGeos([
  new THREE.BoxGeometry(1.9, 0.75, 4.3).translate(0, 0.72, 0),
  new THREE.BoxGeometry(1.7, 0.66, 2.1).translate(0, 1.33, -0.25)
]);
const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 8).rotateZ(Math.PI / 2);
const CAR_MAX = IS_MOBILE ? 26 : 48;
const carMesh = new THREE.InstancedMesh(carBodyGeo, new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.5, vertexColors: false }), CAR_MAX);
carMesh.castShadow = true;
carMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAR_MAX * 3), 3);
const carGlass = new THREE.InstancedMesh(new THREE.BoxGeometry(1.72, 0.6, 2.0).translate(0, 1.34, -0.25), new THREE.MeshStandardMaterial({ color: C('#1a2630'), roughness: 0.2, metalness: 0.4 }), CAR_MAX);
scene.add(carMesh, carGlass);
const CARS = [];
const carPal = ['#d9dde0', '#2a2d31', '#9aa0a6', '#b5362f', '#27558f', '#d4d7da', '#3a6b4a', '#1c1f22'].map(C);
const CARPATHS = [];
function buildCarPaths() {
  for (const [type, pts] of DATA.R) {
    if (!CAR_ROADS.has(type)) continue;
    if (pts.length < 2) continue;
    let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (len < 40) continue;
    CARPATHS.push({ pts, len, w: ROAD_W[type] });
  }
}
function placeCars() {
  const r = mulberry32(88);
  for (let i = 0; i < CAR_MAX; i++) {
    const path = CARPATHS[Math.floor(r() * CARPATHS.length)];
    const col = carPal[Math.floor(r() * carPal.length)];
    CARS.push({ path, s: r() * path.len, spd: rand(6, 13), dir: r() < 0.5 ? 1 : -1, col, lane: (r() < 0.5 ? 1 : -1) * path.w * 0.25, panic: 0, stop: 0, x: 0, z: 0, ang: 0, alive: 1 });
    carMesh.setColorAt(i, tmpC.copy(col));
    carGlass.setColorAt(i, tmpC.setRGB(0.1, 0.15, 0.19));
  }
  carMesh.count = carGlass.count = CARS.length;
  carMesh.instanceColor.needsUpdate = true;
}
function pathAt(path, s) {
  s = ((s % path.len) + path.len) % path.len;
  let acc = 0;
  for (let i = 1; i < path.pts.length; i++) {
    const a = path.pts[i - 1], b = path.pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc + l >= s) {
      const t = (s - acc) / l;
      return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, ang: Math.atan2(b[1] - a[1], b[0] - a[0]) };
    }
    acc += l;
  }
  const a = path.pts[path.pts.length - 1];
  return { x: a[0], z: a[1], ang: 0 };
}
function updateCars(dt) {
  for (let i = 0; i < CARS.length; i++) {
    const c = CARS[i];
    if (!c.alive) continue;
    let threat = 0;
    for (const th of THREATS) { const d = Math.hypot(c.x - th.x, c.z - th.z); if (d < th.r) threat = Math.max(threat, (1 - d / th.r) * th.strength); }
    c.panic = Math.max(threat, c.panic - dt * 0.3);
    const wl = waterLevel();
    const drowning = wl > -900 && c.z > -200 && H(c.x, c.z) < wl;
    if (drowning) { c.stop = 1; }
    const target = c.panic > 0.4 ? c.spd * 2.2 : c.stop > 0.5 ? 0 : c.spd;
    c.cur = lerp(c.cur || c.spd, target, damp(2, dt));
    c.s += c.dir * c.cur * dt;
    const p = pathAt(c.path, c.s);
    const nrm = p.ang + Math.PI / 2;
    c.x = p.x + Math.cos(nrm) * c.lane; c.z = p.z + Math.sin(nrm) * c.lane;
    c.ang = p.ang + (c.dir < 0 ? Math.PI : 0);
    c.y = H(c.x, c.z);
    tmpE.set(0, -c.ang + Math.PI / 2, c.panic > 0.5 ? Math.sin(S.time * 20 + i) * 0.04 : 0);
    tmpQ.setFromEuler(tmpE);
    tmpM.compose(tmpV.set(c.x, c.y + 0.1, c.z), tmpQ, tmpV2.set(1, 1, 1));
    carMesh.setMatrixAt(i, tmpM);
    carGlass.setMatrixAt(i, tmpM);
  }
  carMesh.instanceMatrix.needsUpdate = true;
  carGlass.instanceMatrix.needsUpdate = true;
}
function killCar(i) { CARS[i].alive = 0; carMesh.setMatrixAt(i, HIDE); carGlass.setMatrixAt(i, HIDE); carMesh.instanceMatrix.needsUpdate = true; carGlass.instanceMatrix.needsUpdate = true; }
function carsNear(x, z, r) { const o = []; for (let i = 0; i < CARS.length; i++) if (CARS[i].alive && Math.hypot(CARS[i].x - x, CARS[i].z - z) < r) o.push(i); return o; }
function resetCars() { for (let i = 0; i < CARS.length; i++) { CARS[i].alive = 1; CARS[i].panic = 0; CARS[i].stop = 0; } }

const TRUCKS = [];
const truckGeo = mergeGeos([
  new THREE.BoxGeometry(2.3, 1.5, 7).translate(0, 1.5, 0.3),
  new THREE.BoxGeometry(2.2, 1.6, 2.4).translate(0, 1.5, -3)
]);
const truckMat = new THREE.MeshStandardMaterial({ color: C('#c62f24'), roughness: 0.45, metalness: 0.35 });
let fireFightActive = false;
function spawnTruck(targetSeg) {
  if (TRUCKS.length >= 4) return;
  const entry = DATA.P.mainGate;
  const g = new THREE.Group();
  const body = new THREE.Mesh(truckGeo, truckMat); body.castShadow = true;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.0, 2.2).translate(0, 2.0, -3), new THREE.MeshStandardMaterial({ color: C('#1a2630'), roughness: 0.2, metalness: 0.5 }));
  const beacon = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.5).translate(0, 2.55, -3), new THREE.MeshStandardMaterial({ color: C('#ff2a2a'), emissive: C('#ff2a2a'), emissiveIntensity: 2 }));
  g.add(body, cab, beacon);
  g.position.set(entry[0], H(entry[0], entry[1]), entry[1]);
  scene.add(g);
  TRUCKS.push({ g, beacon, target: targetSeg, x: entry[0], z: entry[1], ang: 0, state: 'drive', spraycd: 0, life: 70 });
}
function nearestFire(x, z) {
  let best = null, bd = Infinity;
  for (const s of SEGS) if (s.fire === 1) { const d = Math.hypot(s.cx - x, s.cz - z); if (d < bd) { bd = d; best = s; } }
  return best;
}
function updateTrucks(dt) {
  const anyFire = burningTrees.size > 0 || SEGS.some(s => s.fire === 1);
  if (anyFire && S.respond && TRUCKS.length < 3 && Math.random() < dt * 0.4) {
    const f = nearestFire(DATA.P.mainGate[0], DATA.P.mainGate[1]);
    if (f) spawnTruck(f);
  }
  for (let i = TRUCKS.length - 1; i >= 0; i--) {
    const t = TRUCKS[i];
    t.life -= dt;
    t.beacon.material.emissiveIntensity = 1.5 + 1.5 * Math.sin(S.time * 14);
    if (!t.target || t.target.fire !== 1) t.target = nearestFire(t.x, t.z);
    if ((!t.target && !burningTrees.size) || t.life <= 0) {
      scene.remove(t.g); TRUCKS.splice(i, 1); continue;
    }
    const tgt = t.target ? { x: t.target.cx + t.target.r + 8, z: t.target.cz } : (() => { const j = [...burningTrees][0]; return { x: T.x[j] + 10, z: T.z[j] }; })();
    const dx = tgt.x - t.x, dz = tgt.z - t.z, d = Math.hypot(dx, dz);
    if (d > 12) {
      const want = Math.atan2(dz, dx);
      let da = want - t.ang; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
      t.ang += da * damp(3, dt);
      const spd = 16;
      t.x += Math.cos(t.ang) * spd * dt; t.z += Math.sin(t.ang) * spd * dt;
      t.state = 'drive';
    } else {
      t.state = 'spray';
    }
    t.g.position.set(t.x, H(t.x, t.z) + 0.1, t.z);
    t.g.rotation.y = -t.ang - Math.PI / 2;
    if (t.state === 'spray' && t.target) {
      const s = t.target;
      const from = new V3(t.x + Math.cos(t.ang) * 4, H(t.x, t.z) + 3, t.z + Math.sin(t.ang) * 4);
      for (let k = 0; k < 3; k++) {
        const aim = new V3(s.cx - from.x, s.b.yGround + 6 - from.y, s.cz - from.z).normalize();
        firePool.spawn({ x: from.x, y: from.y, z: from.z, vx: aim.x * 22 + rand(-2, 2), vy: aim.y * 22 + rand(4, 8), vz: aim.z * 22 + rand(-2, 2),
          r: 0.6, g: 0.8, b: 0.95, life: 0.9, s0: 1.2, s1: 2.6, a: 0.5, grav: -20, drag: 0.4, wind: 0.2, kind: 1 });
      }
      s.hp = Math.min(s.maxHp, s.hp + dt * 9);
      s.wet = 2;
      s.fuel -= dt * 10;
      if (Math.random() < dt * 8) emitSmoke(s.cx + rand(-3, 3), s.b.yGround + 4, s.cz + rand(-3, 3), 0, 3, 0, 5, 0.7, 0.7, 0.72, 2, 0.4);
      if (s.fuel <= 0 || s.hp > s.maxHp * 0.6) { s.fire = 0; s.fuel = 0; refreshSeg(s); logEvent(`${s.b.name} 화재 진압`, 'ok', s.b.name); t.target = null; }
    }
  }
}
function clearTrucks() { for (const t of TRUCKS) scene.remove(t.g); TRUCKS.length = 0; }

function initAgents() { placePeds(); buildCarPaths(); placeCars(); }
function updateAgents(dt) {
  updateThreats(dt);
  updatePeds(dt);
  updateCars(dt);
  updateTrucks(dt);
}
function resetAgents() { resetPeds(); resetCars(); clearTrucks(); THREATS.length = 0; }
