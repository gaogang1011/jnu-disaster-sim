const DIRT = C('#5b4a38'), LEAF = C('#3b5a2c'), BARK = C('#4a3a2b');
const ROAR = { v: 0 };
const TGT = [null, null, null, null];
function claimTarget(x, z, r) {
  for (let i = 0; i < 4; i++) if (!TGT[i]) { TGT[i] = 1; TERR_U.uTargets.value[i].set(x, z, r, 1); return i; }
  return -1;
}
function releaseTarget(i) { if (i < 0) return; TGT[i] = null; TERR_U.uTargets.value[i].w = 0; }

const CAM = { mode: 'free', get: null, until: 0, dist: 0 };
function camFollow(get, dist) { if (!S.track) return; CAM.mode = 'follow'; CAM.get = get; CAM.dist = dist || 320; }
function camFocus(x, y, z, hold, dist) {
  if (!S.track) return;
  const p = new V3(x, y, z);
  CAM.mode = 'focus'; CAM.get = () => p; CAM.until = S.real + (hold || 3); CAM.dist = dist || 0;
}
function camRelease() { CAM.mode = 'free'; CAM.get = null; }

function camDist(x, y, z) { return camera.position.distanceTo(tmpV.set(x, y, z)); }
function shakeFrom(x, y, z, k) { addShake(clamp(k * 260 / (camDist(x, y, z) + 120), 0, 2.4)); }

function blast(x, z, R, power, opts) {
  opts = opts || {};
  const y = H(x, z);
  let hitSegs = 0;
  for (const s of segsNear(x, z, R)) {
    const d = segDist(s, x, z);
    if (d > R) continue;
    const k = 1 - d / R;
    const dir = new V3(s.cx - x, 0, s.cz - z);
    if (dir.lengthSq() < 0.01) dir.set(rand(-1, 1), 0, rand(-1, 1));
    dir.normalize();
    s.swayX += dir.z * 0.04 * k; s.swayZ -= dir.x * 0.04 * k;
    damageSeg(s, power * Math.pow(k, 0.85) * rand(0.85, 1.2), dir, 'blast');
    if (opts.ignite !== false && k > 0.3 && Math.random() < 0.8 * k) igniteSeg(s, hitSegs > 0);
    if (k > 0.3) {
      const n = Math.min(6, 1 + Math.floor(k * 5));
      for (let i = 0; i < n; i++) {
        randomFacadePoint(s, fpt);
        spawnDebris(fpt.x, fpt.y, fpt.z, dir.x * rand(6, 26) * k + fpt.nx * 4, rand(3, 14), dir.z * rand(6, 26) * k + fpt.nz * 4, rand(0.35, 1.3), s.wallMat.color);
      }
    }
    hitSegs++;
  }
  for (const i of treesNear(x, z, R * 1.35)) {
    const dx = T.x[i] - x, dz = T.z[i] - z, d = Math.hypot(dx, dz), k = 1 - d / (R * 1.35);
    if (d < R * 0.32) {
      destroyTree(i);
      for (let q = 0; q < 2; q++) spawnDebris(T.x[i], T.y[i] + 3, T.z[i], (dx / (d || 1)) * rand(10, 30), rand(8, 24), (dz / (d || 1)) * rand(10, 30), rand(0.4, 1.1), q ? BARK : LEAF);
    } else if (d < R * 0.75) {
      tipTree(i, dx, dz, rand(1.1, 1.5));
      if (opts.ignite !== false && Math.random() < 0.55 * k) igniteTree(i);
    } else tipTree(i, dx, dz, rand(0.1, 0.45) * k * 2);
  }
  addThreat(x, z, R * 4.5, 1.6, 9);
  for (const ci of carsNear(x, z, R * 0.85)) {
    const c = CARS[ci];
    killCar(ci);
  }
  if (Math.hypot(windmill.x - x, windmill.z - z) < R * 1.4) breakWindmill(new V3(windmill.x - x, 0, windmill.z - z));
}

function impact(x, z, R, power, opts) {
  opts = opts || {};
  const y = H(x, z);
  fireball(x, y + R * 0.1, z, R * 0.4, 0.6 + R / 120);
  shockwave(x, y, z, R * 1.6, 0.9, C('#ffd9b0'), 0.5);
  flashLight(new V3(x, y + R * 0.5, z), C('#ff9a50'), 8, R * 8, 0.7);
  for (let i = 0; i < R * 2.5 * FX_BUDGET.fire; i++) {
    const a = Math.random() * TAU;
    emitFlame(x, y + rand(0, R * 0.2), z, Math.cos(a) * rand(4, 16), rand(4, 14), Math.sin(a) * rand(4, 16), rand(2, 5));
  }
  for (let i = 0; i < Math.min(24, R); i++) {
    const a = Math.random() * TAU, sp = rand(5, 18);
    spawnDebris(x, y + 1, z, Math.cos(a) * sp, rand(8, 22), Math.sin(a) * sp, rand(0.3, 1), DIRT);
  }
  for (let i = 0; i < R * FX_BUDGET.smoke; i++) {
    const a = Math.random() * TAU, sp = rand(2, 8);
    emitSmoke(x, y + rand(0, R * 0.4), z, Math.cos(a) * sp, rand(3, 9), Math.sin(a) * sp, R * rand(0.15, 0.3), 0.18, 0.16, 0.14, rand(5, 9), 0.6);
  }
  dustRing(x, y, z, R * 1.4, Math.min(40, R));
  deformCrater(x, z, R * 0.3, R * (opts.depth || 0.12));
  markScorch(x, z, R * 0.8, 0.9);
  shakeFrom(x, y, z, R * 0.05);
  sfx.boom(x, y, z, Math.min(1, R / 40));
  blast(x, z, R, power, opts);
}

const PROJ = [];
function makeFaller(o) {
  const p = {
    pos: o.start.clone(), prev: o.start.clone(), vel: new V3(), start: o.start, end: o.end, dur: o.dur, t: 0,
    ease: o.ease || 1, arc: o.arc || 0, mesh: o.mesh, spin: o.spin || null, trail: o.trail, onImpact: o.onImpact,
    target: o.target === undefined ? -1 : o.target, onStep: o.onStep, data: o.data || {}
  };
  if (p.mesh) { p.mesh.position.copy(p.pos); scene.add(p.mesh); }
  PROJ.push(p);
  return p;
}
function updateProjectiles(dt) {
  for (let i = PROJ.length - 1; i >= 0; i--) {
    const p = PROJ[i];
    p.t += dt;
    const k = Math.min(1, p.t / p.dur);
    p.prev.copy(p.pos);
    p.pos.x = lerp(p.start.x, p.end.x, k);
    p.pos.z = lerp(p.start.z, p.end.z, k);
    p.pos.y = lerp(p.start.y, p.end.y, Math.pow(k, p.ease)) + p.arc * 4 * k * (1 - k);
    if (dt > 0) p.vel.subVectors(p.pos, p.prev).divideScalar(dt);
    if (p.mesh) {
      p.mesh.position.copy(p.pos);
      if (p.spin) { p.mesh.rotation.x += p.spin.x * dt; p.mesh.rotation.y += p.spin.y * dt; p.mesh.rotation.z += p.spin.z * dt; }
      else if (p.vel.lengthSq() > 0.01) p.mesh.lookAt(tmpV.copy(p.pos).add(p.vel));
    }
    if (p.trail) p.trail(p, dt);
    if (p.onStep) p.onStep(p, dt, k);
    if (k >= 1) {
      if (p.mesh) { scene.remove(p.mesh); p.mesh.traverse(m => { if (m.geometry && !m.userData.shared) m.geometry.dispose(); }); }
      releaseTarget(p.target);
      PROJ.splice(i, 1);
      p.onImpact(p);
    }
  }
}

const glowGeo = new THREE.SphereGeometry(1, 16, 12);
function glowMesh(color, r, op) {
  const m = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op || 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  m.scale.setScalar(r);
  m.userData.shared = true;
  return m;
}
function rockGeo(r, seed) {
  const g = new THREE.IcosahedronGeometry(r, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.75 + 0.5 * vnoise2(x * 1.7 + seed, y * 1.7 + z * 0.9 - seed);
    p.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}
const QUAKES = [];
function quakeMagnitude(P) { return 4.0 + P * 0.35; }
function startQuake(x, z, P, after) {
  const q = { x, z, P, t: 0, dur: 6 + P * 0.75, amp: 0.15 + P * 0.17, scale: 170 + P * 42, after: !!after, crackT: 0, treeT: 0 };
  QUAKES.push(q);
  const M = quakeMagnitude(P);
  for (let i = 0; i < 3 + Math.floor(P / 2); i++) markCrack(x + rand(-12, 12), z + rand(-12, 12), 30 + P * 12, Math.random() * TAU);
  addThreat(x, z, q.scale * 2.2, 0.55, q.dur);
  logEvent(`${after ? '여진' : '지진'} 발생 · 규모 ${M.toFixed(1)}`, after ? 'warn' : 'crit');
  sfx.boom(x, H(x, z) - 20, z, 0.6);
  if (!after) camFocus(x, H(x, z) + 30, z, 3, 700);
}
function updateQuakes(dt) {
  let best = null, camK = 0;
  for (const s of SEGS) { s.qx = 0; s.qz = 0; }
  for (let qi = QUAKES.length - 1; qi >= 0; qi--) {
    const q = QUAKES[qi];
    q.t += dt;
    const env = smooth(0, 1.2, q.t) * (1 - smooth(q.dur - 2.6, q.dur, q.t)) * (0.78 + 0.22 * Math.sin(q.t * 7.1) * Math.sin(q.t * 2.3));
    if (!best || q.amp * env > best.a) best = { q, a: q.amp * env };
    const front = q.t * 260;
    const dmgK = 1 + q.P * q.P * 0.28;
    for (const s of SEGS) {
      const d = Math.hypot(s.cx - q.x, s.cz - q.z);
      if (d > front) continue;
      const k = env * Math.exp(-d / q.scale);
      if (k < 0.02) continue;
      const hf = 0.7 + s.b.levels * 0.12;
      s.qx += Math.sin(S.time * (6 + s.flick * 0.3) + s.flick) * k * 0.022 * hf;
      s.qz += Math.cos(S.time * (5.3 + s.flick * 0.25) + s.flick * 1.7) * k * 0.022 * hf;
      damageSeg(s, dt * Math.pow(k, 1.5) * dmgK * hf, new V3(rand(-1, 1), 0, rand(-1, 1)), 'quake');
      if (k > 0.3 && Math.random() < dt * k * 2.2 * FX_BUDGET.smoke) {
        randomFacadePoint(s, fpt);
        emitSmoke(fpt.x, fpt.y, fpt.z, fpt.nx * 2, -1, fpt.nz * 2, rand(2, 4), 0.6, 0.57, 0.52, rand(2, 4), 0.5);
        spawnDebris(fpt.x, fpt.y, fpt.z, fpt.nx * rand(1, 3), 0, fpt.nz * rand(1, 3), rand(0.25, 0.7), s.wallMat.color);
      }
      if (s.hp < s.maxHp * 0.55 && Math.random() < dt * 0.012 * k * q.P) { if (igniteSeg(s, true)) logEvent(`${s.b.name} 가스 누출 화재`, 'fire', s.b.name); }
    }
    q.treeT -= dt;
    if (q.treeT <= 0) {
      q.treeT = 0.25;
      for (const i of treesNear(q.x, q.z, Math.min(front, q.scale * 2.2))) {
        if (Math.random() > 0.08) continue;
        const k = env * Math.exp(-Math.hypot(T.x[i] - q.x, T.z[i] - q.z) / q.scale);
        if (k > 0.55 && Math.random() < 0.25) tipTree(i, rand(-1, 1), rand(-1, 1), rand(1.2, 1.5));
        else tipTree(i, rand(-1, 1), rand(-1, 1), rand(0.05, 0.3) * k);
      }
    }
    q.crackT -= dt;
    if (q.crackT <= 0 && env > 0.4) {
      q.crackT = rand(0.3, 0.8) / (q.P / 5);
      const a = Math.random() * TAU, r = Math.min(front, q.scale * 1.4) * Math.sqrt(Math.random());
      markCrack(q.x + Math.cos(a) * r, q.z + Math.sin(a) * r, 10 + q.P * 4, Math.random() * TAU);
    }
    const wk = env * Math.exp(-Math.hypot(windmill.x - q.x, windmill.z - q.z) / q.scale);
    if (wk > 0.6 && !windmill.broken && Math.random() < dt) breakWindmill(new V3(rand(-1, 1), 0, rand(-1, 1)));
    const ck = env * Math.exp(-Math.hypot(controls.target.x - q.x, controls.target.z - q.z) / q.scale) * (0.3 + q.P * 0.1);
    camK = Math.max(camK, ck);
    if (q.t >= q.dur) {
      QUAKES.splice(qi, 1);
      logEvent(q.after ? '여진 종료' : '지진 종료', 'ok');
      if (!q.after && q.P >= 4) later(rand(3, 6), () => startQuake(q.x + rand(-140, 140), q.z + rand(-140, 140), q.P * 0.6, true));
    }
  }
  for (const s of SEGS) if (s.qx || s.qz) { s.swayX = s.qx; s.swayZ = s.qz; }
  if (best && best.a > 0.005) {
    TERR_U.uQuake.value.set(best.q.x, best.q.z, best.a, best.q.t);
    TERR_U.uQuakeK.value.set(260, 70, best.q.scale * 1.6, 0);
  } else TERR_U.uQuake.value.z = 0;
  if (camK > 0) addShake(camK * 0.9);
  S.quakeK = camK;
}

function gateLevel() { return H(DATA.P.mainGate[0], DATA.P.mainGate[1]); }
function tsunamiDepth(P) { return Math.max(1, P * 3.8 - 3.6); }
function rainDepth(P) { return 0.8 + P * 0.55; }
function rainRate(P) { return 30 + P * 12; }
function startTsunami() {
  const P = S.power;
  if (FLOOD.on) { logEvent('이미 물이 차 있습니다. 초기화 후 다시 실행하세요', 'warn'); return false; }
  Object.assign(FLOOD, { on: true, kind: 'tsunami', phase: 'surge', level: gateLevel() + tsunamiDepth(P), front: -1150, speed: 52 + P * 4, crest: 4 + P * 1.3, t: 0, P });
  FLOOD.hit.clear();
  WATER_U.uFlow.value = 1;
  waterMesh.visible = true;
  logEvent(`지진해일 경보 (가정) · 정문 기준 수위 ${Math.round(tsunamiDepth(P))}m`, 'crit');
  camFocus(-60, 40, -420, 7, 900);
  return true;
}
function startRain() {
  const P = S.power;
  if (FLOOD.on) { logEvent('이미 물이 차 있습니다. 초기화 후 다시 실행하세요', 'warn'); return false; }
  const g = gateLevel();
  Object.assign(FLOOD, { on: true, kind: 'rain', phase: 'rise', level: g - 3, target: g + rainDepth(P), front: 5000, speed: 0, crest: 0, t: 0, P });
  FLOOD.hit.clear();
  WATER_U.uFlow.value = 0.25;
  waterMesh.visible = true;
  S.stormT = 0.9;
  if (!TYPH.on) S.windT.set(4 + P * 0.6, 3 + P * 0.5);
  logEvent(`호우 경보 · 시간당 ${rainRate(P)}mm, 저지대 침수 시작`, 'crit');
  camFocus(-20, 40, -380, 4, 760);
  return true;
}
function updateFlood(dt) {
  const F = FLOOD;
  if (!F.on) {
    TERR_U.uWater.value.set(-999, -999);
    for (const s of SEGS) if (s.flood) { s.flood = 0; refreshSeg(s); }
    return;
  }
  F.t += dt;
  if (F.phase === 'rise') {
    F.level = Math.min(F.target, F.level + dt * (0.25 + F.P * 0.05));
    if (F.level >= F.target) { F.phase = 'hold'; F.t = 0; logEvent('침수 최고 수위 도달', 'warn'); }
  } else if (F.phase === 'surge') {
    F.front += F.speed * dt;
    if (F.front > 900) { F.phase = 'hold'; F.t = 0; logEvent('침수 최고 수위 도달', 'warn'); }
    for (let i = 0; i < 26 * FX_BUDGET.smoke; i++) {
      const sx = rand(-850, 850), dep = F.level - H(sx, F.front);
      if (dep < 0.5) continue;
      smokePool.spawn({ x: sx, y: F.level + F.crest * rand(0.6, 1.1), z: F.front - rand(0, 20), vx: rand(-2, 2), vy: rand(4, 11), vz: F.speed * 0.5,
        r: 0.88, g: 0.9, b: 0.9, life: rand(1.2, 2.4), s0: rand(4, 9), s1: rand(12, 22), a: 0.55, grav: -6, drag: 0.6, wind: 0.4, spin: rand(-1, 1) });
    }
    const fd = Math.abs(controls.target.z - F.front);
    ROAR.v = Math.max(ROAR.v, clamp(1 - fd / 900, 0, 1) * 0.8);
    if (fd < 200) addShake(0.15 * (1 - fd / 200) * (1 + F.P * 0.1));
  } else if (F.phase === 'hold') {
    if (F.t > (F.kind === 'rain' ? 14 : 8)) {
      F.phase = 'recede'; F.t = 0; WATER_U.uFlow.value = -0.6;
      if (F.kind === 'rain' && !TYPH.on) { S.stormT = 0; S.windT.set(1.6, 2.2); }
      logEvent('물이 빠지기 시작', 'ok');
    }
  } else {
    F.level -= dt * (F.kind === 'rain' ? 0.6 : 2.2 + F.P * 0.5);
    if (F.level < gateLevel() - 4) {
      F.on = false; waterMesh.visible = false; F.level = -999;
      TERR_U.uWater.value.set(-999, -999);
      logEvent(F.kind === 'rain' ? '침수 해소' : '지진해일 종료', 'ok');
      return;
    }
  }
  WATER_U.uLevel.value = F.level;
  WATER_U.uFront.value = F.front;
  WATER_U.uCrest.value = F.phase === 'surge' ? F.crest : Math.max(0, WATER_U.uCrest.value - dt * 2);
  TERR_U.uWater.value.set(F.front, F.level);
  for (const s of SEGS) {
    const dep = s.cz > F.front ? 0 : Math.max(0, F.level - s.b.yGround);
    const was = s.flood;
    s.flood = dep;
    if ((was > 0.1) !== (dep > 0.1) || (was >= 0.5) !== (dep >= 0.5)) refreshSeg(s);
    if (dep <= 0) continue;
    if (s.fire === 1) { s.fire = 0; s.fuel = 0; }
    s.wet = 8;
    if (!F.hit.has(s) && F.phase === 'surge') {
      F.hit.add(s);
      const hit = Math.min(dep, 14) * (10 + F.P * 2.6) * (s.b.style === 'house' ? 1.7 : 1);
      damageSeg(s, hit, new V3(0, 0, 1), 'flood');
      for (let i = 0; i < 8; i++) { randomFacadePoint(s, fpt); emitSmoke(fpt.x, F.level + 1, fpt.z, rand(-3, 3), rand(5, 12), rand(2, 8), rand(4, 8), 0.86, 0.88, 0.88, rand(1, 2), 0.55); }
    }
    if (F.phase !== 'recede') damageSeg(s, dt * Math.min(dep, 10) * (F.kind === 'rain' ? 0.35 : 0.9), new V3(0, 0, 1), 'flood');
  }
  if (F.phase === 'surge') {
    const band = [];
    for (let bx = -840; bx <= 840; bx += 36) for (const i of treesNear(bx, F.front - 8, 26)) band.push(i);
    for (const i of band) {
      if (Math.abs(T.z[i] - F.front) > 18 || T.st[i] === 3) continue;
      const dep = F.level - T.y[i];
      if (dep > 5 && Math.random() < 0.5) { destroyTree(i); spawnDebris(T.x[i], F.level, T.z[i], rand(-2, 2), 2, F.speed * 0.4, rand(0.6, 1.2), BARK); }
      else if (dep > 1.2) tipTree(i, rand(-0.3, 0.3), 1, rand(0.9, 1.5));
      if (dep > 0) T.wet[i] = 20;
    }
    for (let ci = 0; ci < CARS.length; ci++) {
      const c = CARS[ci];
      if (!c.alive || c.z > F.front) continue;
      if (F.level - c.y > 1.1) { killCar(ci); spawnDebris(c.x, F.level, c.z, rand(-3, 3), 3, F.speed * 0.5, 1.8, c.col); }
    }
  }
  if (F.kind === 'rain') {
    for (let ci = 0; ci < CARS.length; ci++) { const c = CARS[ci]; if (c.alive && F.level - c.y > 0.8) killCar(ci); }
  }
  if (F.phase !== 'recede' && F.kind === 'tsunami' && Math.random() < dt * 2) markWet(rand(-850, 850), Math.min(F.front, 850) - rand(0, 300), 40);
}

function typhoonWind(P) { return 22 + P * 3.5; }
const TYPH = { on: false, t: 0, dur: 0, x: 0, z: 0, boltT: 0, roofT: 0, treeT: 0, P: 5 };
function startTyphoon(x, z) {
  const P = S.power;
  const a = rand(-2.2, -0.9);
  const maxW = typhoonWind(P), sp = maxW / 1.7;
  Object.assign(TYPH, { on: true, t: 0, dur: 32 + P * 3, x, z, boltT: 2, roofT: 0, treeT: 0, P, sp, dir: a });
  S.stormT = 1;
  S.windT.set(Math.cos(a) * sp, Math.sin(a) * sp);
  logEvent(`태풍 상륙 · 최대풍속 ${Math.round(maxW)}m/s (강도 ${typhoonClass(maxW)})`, 'crit');
  camFocus(x, H(x, z) + 40, z, 3, 620);
}
function updateTyphoon(dt) {
  const Y = TYPH;
  if (!Y.on) return;
  Y.t += dt;
  const ws = S.wind.length();
  const k = smooth(0, 6, Y.t) * (1 - smooth(Y.dur - 6, Y.dur, Y.t));
  Y.treeT -= dt;
  if (Y.treeT <= 0) {
    Y.treeT = 0.2;
    const wl = ws || 1, wx = S.wind.x / wl, wz = S.wind.y / wl;
    const tries = Math.floor(30 * k * (Y.P / 5));
    for (let q = 0; q < tries; q++) {
      const i = Math.floor(Math.random() * T.n);
      if (T.st[i] === 3) continue;
      const e = Math.max(0, ws - 16) / 30;
      if (Math.random() < e * 0.35) { tipTree(i, wx, wz, rand(1.25, 1.5)); if (Math.random() < 0.3) spawnDebris(T.x[i], T.y[i] + 5, T.z[i], wx * ws * 0.6, rand(2, 6), wz * ws * 0.6, rand(0.3, 0.8), LEAF); }
      else tipTree(i, wx, wz, rand(0.1, 0.35) * Math.min(1, ws / 25));
    }
    for (let q = 0; q < 6 * k; q++) {
      const cx = controls.target.x + rand(-400, 400), cz = controls.target.z + rand(-400, 400);
      spawnDebris(cx, H(cx, cz) + rand(2, 12), cz, wx * ws * rand(0.5, 0.9), rand(1, 6), wz * ws * rand(0.5, 0.9), rand(0.15, 0.5), Math.random() < 0.5 ? LEAF : C('#8b8b86'));
    }
  }
  Y.roofT -= dt;
  if (Y.roofT <= 0 && ws > 22) {
    Y.roofT = rand(0.3, 1.2) * 30 / ws;
    const s = SEGS[Math.floor(Math.random() * SEGS.length)];
    const id = s.roofIds.find(r => roofBoxData[r] && !roofBoxData[r].gone);
    if (id !== undefined) {
      const r = roofBoxData[id];
      r.gone = true;
      tmpM.makeScale(0, 0, 0); roofBoxes.setMatrixAt(id, tmpM); roofBoxes.instanceMatrix.needsUpdate = true;
      spawnDebris(r.x, r.y + 1, r.z, S.wind.x * 0.8, rand(6, 14), S.wind.y * 0.8, Math.max(r.sx, r.sz) * 0.6, C('#b9bab6'));
    }
  }
  for (const s of SEGS) {
    const weak = s.b.style === 'house' ? 1.8 : 0.25;
    const e = Math.max(0, ws - 20);
    if (e > 0) damageSeg(s, dt * e * e * 0.012 * weak * k, new V3(S.wind.x, 0, S.wind.y).normalize(), 'wind');
    s.swayX += S.wind.y * 0.00003 * S.gust; s.swayZ -= S.wind.x * 0.00003 * S.gust;
  }
  if (ws > 32 && !windmill.broken && Math.random() < dt * 0.2) breakWindmill(new V3(S.wind.x, 0, S.wind.y));
  Y.boltT -= dt;
  if (Y.boltT <= 0 && k > 0.3) {
    Y.boltT = rand(1.2, 4) * (6 / (Y.P + 1));
    const a = Math.random() * TAU, r = rand(0, 480);
    let bx = controls.target.x + Math.cos(a) * r, bz = controls.target.z + Math.sin(a) * r;
    let tall = null, th = 0;
    for (const s of segsNear(bx, bz, 60)) if (s.b.yTop > th) { th = s.b.yTop; tall = s; }
    if (tall && Math.random() < 0.6) { bx = tall.cx; bz = tall.cz; }
    lightningBolt(bx, bz, true);
    if (tall && Math.random() < 0.6) { damageSeg(tall, tall.maxHp * 0.12, null, 'lightning'); if (Math.random() < 0.35 && igniteSeg(tall, true)) logEvent(`${tall.b.name} 낙뢰 화재`, 'fire', tall.b.name); }
    else { const near = treesNear(bx, bz, 12); if (near.length) { const i = near[0]; tipTree(i, rand(-1, 1), rand(-1, 1), 1.4); igniteTree(i); } }
  }
  if (Y.t >= Y.dur) {
    Y.on = false; if (!FLOOD.on || FLOOD.kind !== 'rain') S.stormT = 0; S.windT.set(1.6, 2.2);
    logEvent('태풍 소멸', 'ok');
  }
}

const VBOMB = { on: false, t: 0, x: 0, z: 0, acc: 0, P: 5 };
function startEruption(x, z) {
  const P = S.power;
  Object.assign(VOLC, { on: true, t: 0, dur: 40 + P * 3 });
  Object.assign(VBOMB, { on: true, t: 0, x, z, acc: 0, P, dur: 34 + P * 2.5 });
  S.ashT = 0.55 + P * 0.045;
  logEvent('한라산 분화 · 화산탄 낙하 경보', 'crit');
  const d = new V3(VOLC.x - x, 0, VOLC.z - z).normalize();
  CAM.mode = 'free';
  if (S.track) {
    const tgt = new V3(x + d.x * 260, H(x, z) + 170, z + d.z * 260);
    const pos = new V3(x - d.x * 760, H(x, z) + 210, z - d.z * 760);
    camFly(pos, tgt, 2.4);
  }
  addShake(0.6);
  later(0.6, () => sfx.boom(VOLC.x, VOLC.y, VOLC.z, 1.6));
}
function updateEruption(dt) {
  const B = VBOMB;
  if (!B.on) return;
  B.t += dt;
  if (B.t < 4) return;
  if (B.t > B.dur) { B.on = false; later(10, () => { if (!VOLC.on) S.ashT = 0.15; }); later(30, () => { if (!VOLC.on) S.ashT = 0; }); logEvent('화산 활동 진정', 'ok'); return; }
  if (Math.random() < dt * 0.3) addShake(0.25);
  B.acc += dt * (0.7 + B.P * 0.22);
  while (B.acc > 1) {
    B.acc--;
    const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * (140 + B.P * 22);
    const tx = B.x + Math.cos(a) * r, tz = B.z + Math.sin(a) * r, gy = H(tx, tz);
    const d = new V3(VOLC.x - tx, 0, VOLC.z - tz).normalize();
    const start = new V3(tx + d.x * 1500, gy + 1100, tz + d.z * 1500);
    const big = Math.random() < 0.2;
    const R = (big ? 16 : 7) + B.P * (big ? 1.8 : 0.8);
    const g = new THREE.Group();
    const rock = new THREE.Mesh(rockGeo(big ? 2.2 : 1.2, Math.random() * 9), new THREE.MeshStandardMaterial({ color: C('#2a2420'), emissive: C('#ff4a08'), emissiveIntensity: 1.6, roughness: 1 }));
    g.add(rock, glowMesh(C('#ff8a3a'), big ? 3.6 : 2, 0.7));
    makeFaller({ start, end: new V3(tx, gy, tz), dur: rand(3.2, 4.4), ease: 1.4, arc: rand(80, 200), mesh: g, target: big ? claimTarget(tx, tz, R * 0.9) : -1,
      trail: (p, dt2) => {
        if (Math.random() < 0.8) emitSmoke(p.pos.x, p.pos.y, p.pos.z, 0, 0, 0, big ? 4 : 2.4, 0.12, 0.1, 0.09, rand(3, 6), 0.6);
        if (Math.random() < 0.7) emitFlame(p.pos.x, p.pos.y, p.pos.z, 0, 0, 0, big ? 4 : 2.4);
      },
      onStep: (p, dt2) => { rock.rotation.x += dt2 * 3; rock.rotation.y += dt2 * 2; },
      onImpact: () => {
        impact(tx, tz, R, 40 + R * 3, { depth: 0.16 });
        for (const i of treesNear(tx, tz, R * 1.4)) igniteTree(i);
        for (let k2 = 0; k2 < 10; k2++) emitSpark(tx, gy + 1, tz, rand(-14, 14), rand(10, 28), rand(-14, 14), [1, 0.45, 0.1], rand(1.5, 3), 2.2);
      } });
  }
  if (Math.random() < dt * 0.5) markAsh(0.012);
}

function startFire(x, z) {
  const P = S.power;
  S.firePower = P;
  let n = 0;
  for (const s of segsNear(x, z, 10)) if (segDist(s, x, z) < 4) { if (igniteSeg(s)) n++; }
  for (const i of treesNear(x, z, 10 + P * 2.4)) if (igniteTree(i)) { n++; T.burnT[i] = 1.6; }
  if (!n) {
    const near = treesNear(x, z, 45);
    near.sort((a, b) => Math.hypot(T.x[a] - x, T.z[a] - z) - Math.hypot(T.x[b] - x, T.z[b] - z));
    for (const i of near.slice(0, 3)) igniteTree(i);
    if (!near.length) { const ss = segsNear(x, z, 40).sort((a, b) => segDist(a, x, z) - segDist(b, x, z)); if (ss[0]) igniteSeg(ss[0]); }
  }
  sprayBurst(x, H(x, z) + 1, z, 30, 12, 6, [1, 0.5, 0.15]);
  markBurnt(x, z, 6);
  if (!TYPH.on) S.windT.set(2 + P * 0.7, 2.6 + P * 0.8);
  for (let k = 0; k < 3 + P; k++) later(rand(0.5, 4), () => { const a = Math.random() * TAU, r = rand(8, 18 + P * 3); const near = treesNear(x + Math.cos(a) * r, z + Math.sin(a) * r, 8); if (near.length) igniteTree(near[0]); });
  logEvent('화재 발생 · 바람을 타고 확산 중', 'fire');
  camFocus(x, H(x, z) + 20, z, 2, 420);
}

let fireSpreadT = 0;
function updateHazards(dt) {
  updateProjectiles(dt);
  updateQuakes(dt);
  updateFlood(dt);
  updateTyphoon(dt);
  updateEruption(dt);
  fireSpreadT -= dt;
  if (fireSpreadT <= 0) { fireSpreadT = 0.35; spreadTreeFire(); spreadBuildingFire(); }
  let segFires = 0;
  for (const s of SEGS) if (s.fire === 1) segFires++;
  const totalFire = segFires * 4 + burningTrees.size;
  const fl = LIGHTS;
  if (totalFire > 0) {
    let k = 0;
    for (const s of SEGS) {
      if (s.fire !== 1 || k > 2) continue;
      if (Math.random() < 0.02 || !fl[k].userData.seg || fl[k].userData.seg.fire !== 1) fl[k].userData.seg = s;
      const ss = fl[k].userData.seg;
      fl[k].position.set(ss.cx, ss.b.yTop + 6, ss.cz);
      fl[k].color.setRGB(1, 0.5, 0.18);
      fl[k].distance = 160;
      fl[k].intensity = (2 + S.night * 4) * (0.8 + 0.2 * Math.sin(S.time * 13 + k));
      k++;
    }
    for (; k < 3; k++) fl[k].intensity = 0;
  } else for (let k = 0; k < 3; k++) fl[k].intensity = 0;
  sfx.ambience(totalFire, S.quakeK || 0);
  sfx.roarFor(ROAR.v);
  ROAR.v = 0;
  sfx.siren(TRUCKS.length > 0);
}

function resetHazards() {
  for (const p of PROJ) { if (p.mesh) scene.remove(p.mesh); releaseTarget(p.target); }
  PROJ.length = 0;
  QUAKES.length = 0;
  TERR_U.uQuake.value.set(0, 0, 0, 0);
  FLOOD.on = false; FLOOD.level = -999; waterMesh.visible = false; TERR_U.uWater.value.set(-999, -999);
  TYPH.on = false; VBOMB.on = false; VOLC.on = false; VOLC.glow = 0;
  S.stormT = 0; S.ashT = 0; S.windT.set(1.6, 2.2);
  for (let i = 0; i < 4; i++) releaseTarget(i);
  for (const l of LIGHTS) l.intensity = 0;
  for (const r of roofBoxData) r.gone = false;
  TIMERS.length = 0;
  camRelease();
}

const DISASTERS = {
  quake: { name: '지진', key: '1', guide: 'quake', shelter: 'open', desc: '클릭한 곳이 진앙입니다. 흔들림이 멈추면 넓은 옥외 공간으로 대피합니다', radius: P => 170 + P * 42, ring2: true, run: (x, z) => startQuake(x, z, S.power), info: P => `규모 ${quakeMagnitude(P).toFixed(1)} · 흔들림 ${Math.round(6 + P * 0.75)}초 · 여진 있음` },
  tsunami: { name: '지진해일', key: '2', guide: 'tsunami', shelter: 'high', desc: '북쪽 바다에서 해일이 밀려오는 가정 시나리오입니다. 고지대로 대피합니다', radius: () => 0, run: () => startTsunami(), info: P => `정문 기준 수위 ${Math.round(tsunamiDepth(P))}m · 파고 ${Math.round(4 + P * 1.3)}m (가정)` },
  rain: { name: '집중호우', key: '3', guide: 'rain', shelter: 'high', desc: '폭우로 정문 쪽 저지대부터 물이 찹니다. 고지대로 대피합니다', radius: () => 0, run: () => startRain(), info: P => `시간당 ${rainRate(P)}mm · 저지대 최대 침수 ${rainDepth(P).toFixed(1)}m` },
  typhoon: { name: '태풍', key: '4', guide: 'typhoon', shelter: 'indoor', desc: '강풍과 폭우, 낙뢰가 캠퍼스를 덮칩니다. 튼튼한 건물 안으로 대피합니다', radius: () => 0, run: startTyphoon, info: P => `최대풍속 ${Math.round(typhoonWind(P))}m/s · 기상청 강도 '${typhoonClass(typhoonWind(P))}'` },
  fire: { name: '화재', key: '5', guide: 'fire', shelter: 'open', desc: '불이 바람을 타고 숲과 건물로 번집니다. 불에서 먼 넓은 곳으로 대피합니다', radius: P => 10 + P * 2.4, run: startFire, info: P => `발화 범위 ${Math.round(10 + P * 2.4)}m · 풍속 ${(Math.hypot(2 + P * 0.7, 2.6 + P * 0.8)).toFixed(1)}m/s` },
  volcano: { name: '한라산 분화', key: '6', guide: 'volcano', shelter: 'indoor', desc: '한라산에서 화산탄과 화산재가 날아옵니다. 튼튼한 건물 안으로 대피합니다', radius: P => 140 + P * 22, ring2: true, run: startEruption, info: P => `화산탄 낙하 범위 ${Math.round(140 + P * 22)}m · ${Math.round(34 + P * 2.5)}초` }
};
