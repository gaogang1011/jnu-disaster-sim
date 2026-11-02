const THREATS = [];
function addThreat(x, z, r, strength, ttl) { THREATS.push({ x, z, r, strength, ttl }); }
function updateThreats(dt) {
  for (let i = THREATS.length - 1; i >= 0; i--) { THREATS[i].ttl -= dt; if (THREATS[i].ttl <= 0) THREATS.splice(i, 1); }
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
function spawnTruck(targetSeg) {
  if (TRUCKS.length >= 4) return;
  const entry = RESCUE.base || DATA.P.mainGate;
  const g = new THREE.Group();
  const body = new THREE.Mesh(truckGeo, truckMat); body.castShadow = true;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.0, 2.2).translate(0, 2.0, -3), new THREE.MeshStandardMaterial({ color: C('#1a2630'), roughness: 0.2, metalness: 0.5 }));
  const beacon = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.5).translate(0, 2.55, -3), new THREE.MeshStandardMaterial({ color: C('#ff2a2a'), emissive: C('#ff2a2a'), emissiveIntensity: 2 }));
  g.add(body, cab, beacon);
  g.position.set(entry[0], H(entry[0], entry[1]), entry[1]);
  scene.add(g);
  TRUCKS.push({ g, beacon, target: targetSeg, x: entry[0], z: entry[1], ang: 0, state: 'drive', life: 90 });
}
function nearestFire(x, z) {
  let best = null, bd = Infinity;
  for (const s of SEGS) if (s.fire === 1) { const d = Math.hypot(s.cx - x, s.cz - z); if (d < bd) { bd = d; best = { seg: s, x: s.cx, z: s.cz, d: s.r + 8 }; } }
  for (const i of burningTrees) { const d = Math.hypot(T.x[i] - x, T.z[i] - z) + 40; if (d < bd) { bd = d; best = { tree: i, x: T.x[i], z: T.z[i], d: 10 }; } }
  return best;
}
function fireTargetLive(f) { return f && (f.seg ? f.seg.fire === 1 : T.st[f.tree] === 1); }
function douseTrees(x, z, dt) {
  for (const j of treesNear(x, z, 22)) {
    T.wet[j] = Math.max(T.wet[j], 6);
    if (T.st[j] === 1 && Math.random() < dt * 3) {
      T.st[j] = 2; burningTrees.delete(j); setTreeInst(j);
      RESCUE.treeOut++;
    }
  }
}
function updateTrucks(dt) {
  const anyFire = burningTrees.size > 0 || SEGS.some(s => s.fire === 1);
  if (anyFire && S.respond && RESCUE.arrived && TRUCKS.length < 3 && Math.random() < dt * 0.6) {
    const f = nearestFire(RESCUE.base[0], RESCUE.base[1]);
    if (f) spawnTruck(f);
  }
  for (let i = TRUCKS.length - 1; i >= 0; i--) {
    const t = TRUCKS[i];
    t.life -= dt;
    t.beacon.material.emissiveIntensity = 1.5 + 1.5 * Math.sin(S.time * 14);
    if (!fireTargetLive(t.target)) t.target = nearestFire(t.x, t.z);
    if (!t.target || t.life <= 0) { scene.remove(t.g); TRUCKS.splice(i, 1); continue; }
    const f = t.target;
    const ox = t.x - f.x, oz = t.z - f.z, ol = Math.hypot(ox, oz) || 1;
    const tgt = { x: f.x + ox / ol * f.d, z: f.z + oz / ol * f.d };
    const dx = tgt.x - t.x, dz = tgt.z - t.z, d = Math.hypot(dx, dz);
    if (d > 3) {
      const want = Math.atan2(dz, dx);
      let da = want - t.ang; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
      t.ang += da * damp(4, dt);
      const spd = Math.min(d / dt, RESCUE_SPEED * EV_K);
      t.x += Math.cos(t.ang) * spd * dt; t.z += Math.sin(t.ang) * spd * dt;
      t.state = 'drive';
    } else {
      t.state = 'spray';
      t.ang = Math.atan2(f.z - t.z, f.x - t.x);
    }
    t.g.position.set(t.x, H(t.x, t.z) + 0.1, t.z);
    t.g.rotation.y = -t.ang - Math.PI / 2;
    if (t.state !== 'spray') continue;
    const from = new V3(t.x + Math.cos(t.ang) * 4, H(t.x, t.z) + 3, t.z + Math.sin(t.ang) * 4);
    const ty = f.seg ? f.seg.b.yGround + 6 : T.y[f.tree] + 5;
    for (let k = 0; k < 3; k++) {
      const aim = new V3(f.x - from.x, ty - from.y, f.z - from.z).normalize();
      firePool.spawn({ x: from.x, y: from.y, z: from.z, vx: aim.x * 22 + rand(-2, 2), vy: aim.y * 22 + rand(4, 8), vz: aim.z * 22 + rand(-2, 2),
        r: 0.6, g: 0.8, b: 0.95, life: 0.9, s0: 1.2, s1: 2.6, a: 0.5, grav: -20, drag: 0.4, wind: 0.2, kind: 1 });
    }
    douseTrees(f.x, f.z, dt);
    if (f.seg) {
      const s = f.seg;
      s.hp = Math.min(s.maxHp, s.hp + dt * 9);
      s.wet = 2;
      s.fuel -= dt * 10;
      if (Math.random() < dt * 8) emitSmoke(s.cx + rand(-3, 3), s.b.yGround + 4, s.cz + rand(-3, 3), 0, 3, 0, 5, 0.7, 0.7, 0.72, 2, 0.4);
      if (s.fuel <= 0 || s.hp > s.maxHp * 0.6) { s.fire = 0; s.fuel = 0; refreshSeg(s); RESCUE.fireOut++; logEvent(`소방차 · ${s.b.name} 화재 진압`, 'ok', s.b.name); t.target = null; }
    }
  }
}
function clearTrucks() { for (const t of TRUCKS) scene.remove(t.g); TRUCKS.length = 0; }

function initAgents() { buildCarPaths(); placeCars(); }
function updateAgents(dt) {
  updateThreats(dt);
  updateCars(dt);
  updateTrucks(dt);
}
function resetAgents() { resetCars(); clearTrucks(); THREATS.length = 0; }
