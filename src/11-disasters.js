const DIRT = C('#5b4a38'), LEAF = C('#3b5a2c'), BARK = C('#4a3a2b');
const ROAR = { v: 0 };
const ACTIVE = { jets: 0 };
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
    if (k > 0.15 && s.state !== 2) {
      const n = Math.min(16, 3 + Math.floor(k * 14));
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
  killPedsAround(x, z, R * 0.55);
  addThreat(x, z, R * 4.5, 1.6, 9);
  for (const ci of carsNear(x, z, R * 0.85)) {
    const c = CARS[ci];
    killCar(ci);
    for (let q = 0; q < 5; q++) spawnDebris(c.x, c.y + 1, c.z, rand(-8, 8) + (c.x - x) * 0.4, rand(8, 22), rand(-8, 8) + (c.z - z) * 0.4, rand(0.4, 1.2), c.col);
    later(rand(0.1, 0.5), () => { fireball(c.x, c.y + 1, c.z, 4, 0.6); sprayBurst(c.x, c.y + 1, c.z, 14, 16, 8, [1, 0.6, 0.2]); });
  }
  if (Math.hypot(windmill.x - x, windmill.z - z) < R * 1.4) breakWindmill(new V3(windmill.x - x, 0, windmill.z - z));
}

function explosion(x, z, R, power, opts) {
  opts = opts || {};
  const y = H(x, z);
  fireball(x, y + R * 0.12, z, R * 0.55, 0.75 + R / 90);
  shockwave(x, y, z, R * 2.8, 0.9 + R / 70, C('#fff4dc'), 0.9);
  shockwave(x, y, z, R * 1.5, 1.7, C('#ff9a4a'), 0.45);
  flashLight(new V3(x, y + R * 0.5, z), C('#ffad60'), 14, R * 10, 0.9);
  screenFlash(clamp(R * 2 / (camDist(x, y, z) + 40), 0, 0.55));
  const nf = Math.floor(R * 4 * FX_BUDGET.fire);
  for (let i = 0; i < nf; i++) {
    const a = Math.random() * TAU, s = rand(0, 1);
    emitFlame(x + Math.cos(a) * R * 0.2 * s, y + rand(0, R * 0.3), z + Math.sin(a) * R * 0.2 * s, Math.cos(a) * rand(6, 34) * (R / 30), rand(5, 26) * (R / 30), Math.sin(a) * rand(6, 34) * (R / 30), rand(3, 9) * Math.max(0.6, R / 26));
  }
  for (let i = 0; i < R * 2.5 * FX_BUDGET.spark; i++) {
    const a = Math.random() * TAU, s = rand(8, 46);
    emitSpark(x, y + 2, z, Math.cos(a) * s, rand(14, 60), Math.sin(a) * s, null, rand(1.2, 3), rand(1, 2.4));
  }
  for (let i = 0; i < Math.min(70, R * 1.1); i++) {
    const a = Math.random() * TAU, s = rand(6, 34);
    spawnDebris(x + Math.cos(a) * R * 0.15, y + 1, z + Math.sin(a) * R * 0.15, Math.cos(a) * s, rand(14, 42), Math.sin(a) * s, rand(0.4, 1.8), DIRT);
  }
  for (let i = 0; i < R * 1.4 * FX_BUDGET.smoke; i++) {
    const a = Math.random() * TAU, s = rand(2, 14) * R / 30;
    emitSmoke(x + Math.cos(a) * R * 0.3, y + rand(0, R * 0.5), z + Math.sin(a) * R * 0.3, Math.cos(a) * s, rand(4, 16), Math.sin(a) * s, R * rand(0.12, 0.26), 0.16, 0.14, 0.12, rand(6, 11), 0.65);
  }
  if (R > 34) mushroom(x, y, z, R);
  dustRing(x, y, z, R * 1.9, Math.min(90, R * 1.3));
  deformCrater(x, z, R * 0.34, R * (opts.depth || 0.13));
  markScorch(x, z, R * 0.95, 1);
  shakeFrom(x, y, z, R * 0.09);
  sfx.boom(x, y, z, Math.min(1.6, R / 45));
  blast(x, z, R, power, opts);
  S.events++;
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
function plasmaTrail(scale, smokeK) {
  return (p, dt) => {
    const v = p.vel, sp = v.length() || 1;
    const n = Math.floor((10 + scale * 6) * FX_BUDGET.fire * Math.min(1, dt * 60) + Math.random());
    for (let i = 0; i < n; i++) {
      const b = rand(0, 1);
      firePool.spawn({ x: p.pos.x - v.x * dt * b + rand(-1, 1) * scale, y: p.pos.y - v.y * dt * b + rand(-1, 1) * scale, z: p.pos.z - v.z * dt * b + rand(-1, 1) * scale,
        vx: -v.x * 0.05 + rand(-3, 3), vy: -v.y * 0.05 + rand(-3, 3), vz: -v.z * 0.05 + rand(-3, 3),
        r: 1, g: rand(0.45, 0.85), b: rand(0.15, 0.45), life: rand(0.25, 0.7), s0: scale * rand(2.2, 4.2), s1: scale * 0.6, a: 1, grav: 0, drag: 1.5, wind: 0 });
    }
    if (Math.random() < smokeK) emitSmoke(p.pos.x, p.pos.y, p.pos.z, -v.x * 0.02, 0, -v.z * 0.02, scale * 2.2, 0.42, 0.4, 0.4, rand(5, 9), 0.5);
  };
}

function bombMesh() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: C('#4b524f'), roughness: 0.55, metalness: 0.5 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 2.6, 12).rotateX(Math.PI / 2), mat);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8, 0, TAU, 0, Math.PI / 2).rotateX(Math.PI / 2).translate(0, 0, 1.3), mat);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 12).rotateX(-Math.PI / 2).translate(0, 0, -1.75), mat);
  g.add(body, nose, tail);
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 0.7), mat);
    fin.position.set(0, 0, -1.85);
    const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2; fin.position.y = 0.45; arm.add(fin);
    g.add(arm);
  }
  g.scale.setScalar(1.5);
  g.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return g;
}
function jetMesh() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: C('#7d858b'), roughness: 0.45, metalness: 0.55 });
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 15, 12).rotateZ(Math.PI / 2), mat);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4, 12).rotateZ(-Math.PI / 2).translate(9.5, 0, 0), mat);
  const ws = new THREE.Shape([new THREE.Vector2(3, 0), new THREE.Vector2(-4, 8), new THREE.Vector2(-6, 8), new THREE.Vector2(-5, 0), new THREE.Vector2(-6, -8), new THREE.Vector2(-4, -8)]);
  const wing = new THREE.Mesh(new THREE.ExtrudeGeometry(ws, { depth: 0.25, bevelEnabled: false }).rotateX(Math.PI / 2), mat);
  const fs = new THREE.Shape([new THREE.Vector2(-3.5, 0), new THREE.Vector2(-7, 4.2), new THREE.Vector2(-8.2, 4.2), new THREE.Vector2(-7.5, 0)]);
  const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(fs, { depth: 0.2, bevelEnabled: false }).translate(0, 0.5, -0.1), mat);
  const can = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 8).scale(2.4, 0.8, 0.9).translate(4.5, 0.75, 0), new THREE.MeshStandardMaterial({ color: C('#1c2530'), roughness: 0.1, metalness: 0.8 }));
  const glow = glowMesh(C('#ffb46a'), 1.1, 0.9); glow.position.set(-7.8, 0, 0);
  g.add(fus, nose, wing, fin, can, glow);
  g.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return g;
}

function launchBomb(x, z) {
  const P = S.power;
  const R = 14 + P * 4.2, power = 90 + P * 24;
  const n = P >= 8 ? 3 : P >= 5 ? 2 : 1;
  const ang = Math.random() * TAU, dx = Math.cos(ang), dz = Math.sin(ang);
  const gy = H(x, z), alt = gy + 360, speed = 210;
  const jet = jetMesh();
  scene.add(jet);
  const fallT = 3.4, lead = speed * fallT * 0.55;
  const spacing = R * 0.95;
  const drops = [];
  for (let k = 0; k < n; k++) {
    const off = (k - (n - 1) / 2) * spacing;
    const tx = x + dx * off, tz = z + dz * off;
    drops.push({ tx, tz, rel: off - lead, done: false, tg: claimTarget(tx, tz, R * 0.85) });
  }
  let s = Math.min(...drops.map(d => d.rel)) - 760, released = 0, whistled = false;
  ACTIVE.jets++;
  const fn = dt => {
    s += speed * dt;
    const px = x + dx * s, pz = z + dz * s;
    jet.position.set(px, alt, pz);
    jet.rotation.set(0, -ang, Math.sin(S.time * 0.8) * 0.05);
    const d = camDist(px, alt, pz);
    ROAR.v = Math.max(ROAR.v, clamp(1 - d / 1600, 0, 1) * 0.55);
    if (Math.random() < 0.9) {
      for (const side of [-1, 1]) smokePool.spawn({ x: px - dx * 8 - dz * side * 0.6, y: alt, z: pz - dz * 8 + dx * side * 0.6, vx: 0, vy: 0, vz: 0, r: 0.95, g: 0.96, b: 0.98, life: rand(6, 9), s0: 1.2, s1: 7, a: 0.45, grav: 0, drag: 0, wind: 0.5 });
      emitFlame(px - dx * 8.4, alt, pz - dz * 8.4, -dx * 30, 0, -dz * 30, 1.6);
    }
    for (const dr of drops) {
      if (dr.done || s < dr.rel) continue;
      dr.done = true; released++;
      if (!whistled) { whistled = true; sfx.whistle(fallT); }
      const start = new V3(px, alt - 2, pz);
      const tgy = H(dr.tx, dr.tz);
      const proj = makeFaller({
        start, end: new V3(dr.tx, tgy, dr.tz), dur: fallT, ease: 1.7, mesh: bombMesh(), target: dr.tg,
        trail: (p) => { if (Math.random() < 0.5) emitSmoke(p.pos.x, p.pos.y + 1, p.pos.z, 0, 0, 0, 0.8, 0.8, 0.8, 0.8, 1.2, 0.25); },
        onImpact: () => { explosion(dr.tx, dr.tz, R, power); if (CAM.get && CAM.get() === proj.pos) camFocus(dr.tx, tgy + 15, dr.tz, 3.5, 300); }
      });
      if (released === Math.ceil(n / 2)) camFollow(() => proj.pos, 140);
    }
    if (s > 2300) { scene.remove(jet); ACTIVE.jets--; return false; }
    return true;
  };
  fn.dispose = () => { scene.remove(jet); ACTIVE.jets = 0; };
  addEffect(fn);
  camFocus(x, gy + 40, z, 2.6, 560);
  logEvent(`폭격기 진입 · 폭탄 ${n}발`, 'warn');
}

function satelliteMesh() {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: C('#c99a3c'), roughness: 0.35, metalness: 0.9, emissive: C('#ff5a1a'), emissiveIntensity: 0.6 });
  const panelM = new THREE.MeshStandardMaterial({ color: C('#1f3d78'), roughness: 0.3, metalness: 0.6, emissive: C('#ff4a10'), emissiveIntensity: 0.3 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.2, 4.4), gold);
  const p1 = new THREE.Mesh(new THREE.BoxGeometry(9, 0.15, 3), panelM); p1.position.x = 6.4;
  const p2 = p1.clone(); p2.position.x = -6.4;
  const dish = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 8, 0, TAU, 0, 1.0).translate(0, -1.2, 0).rotateX(Math.PI / 2).translate(0, 0, 3.1), gold);
  g.add(body, p1, p2, dish);
  g.userData.panels = [p1, p2];
  return g;
}
function launchSatellite(x, z) {
  const P = S.power;
  const R = 26 + P * 5.5, power = 160 + P * 34;
  const gy = H(x, z);
  const ang = Math.random() * TAU;
  const start = new V3(x - Math.cos(ang) * 2800, gy + 1400, z - Math.sin(ang) * 2800);
  const end = new V3(x, gy, z);
  const holder = new THREE.Group();
  const sat = satelliteMesh();
  holder.add(sat);
  const sheath = glowMesh(C('#ff8a3a'), 1, 0.55);
  sheath.scale.set(7, 7, 16); sheath.position.z = -6;
  const core = glowMesh(C('#fff0d0'), 4.5, 0.8);
  holder.add(sheath, core);
  const tg = claimTarget(x, z, R * 0.9);
  let broke = false;
  const proj = makeFaller({
    start, end, dur: 6.2, ease: 1, mesh: holder, target: tg,
    trail: plasmaTrail(2.4, 0.9),
    onStep: (p, dt, k) => {
      sat.rotation.x += dt * 1.7; sat.rotation.y += dt * 2.3;
      sheath.material.opacity = 0.45 + 0.15 * Math.sin(S.time * 40);
      ROAR.v = Math.max(ROAR.v, clamp(1 - camDist(p.pos.x, p.pos.y, p.pos.z) / 1800, 0, 1));
      if (!broke && k > 0.55) {
        broke = true;
        for (const pn of sat.userData.panels) sat.remove(pn);
        logEvent('위성 기체 분해 · 파편 낙하', 'warn');
        for (let f = 0; f < 3; f++) {
          const fx = x + rand(-1, 1) * (60 + P * 8), fz = z + rand(-1, 1) * (60 + P * 8);
          const fg = new THREE.Group();
          const chunk = new THREE.Mesh(new THREE.BoxGeometry(rand(2, 4), 0.3, rand(2, 3)), new THREE.MeshStandardMaterial({ color: C('#28417a'), emissive: C('#ff5a1a'), emissiveIntensity: 0.8 }));
          fg.add(chunk, glowMesh(C('#ffb070'), 2.2, 0.7));
          makeFaller({ start: p.pos.clone(), end: new V3(fx, H(fx, fz), fz), dur: (1 - k) * 6.2 + rand(0.2, 0.9), ease: 1.15, mesh: fg, spin: new V3(rand(2, 6), rand(2, 6), rand(2, 6)),
            trail: plasmaTrail(0.8, 0.4), onImpact: () => explosion(fx, fz, R * 0.32, power * 0.5, { depth: 0.08 }) });
        }
        sprayBurst(p.pos.x, p.pos.y, p.pos.z, 40, 6, 30, [1, 0.7, 0.3]);
      }
    },
    onImpact: () => {
      explosion(x, z, R, power, { depth: 0.2 });
      later(0.15, () => { for (let i = 0; i < 26; i++) { const a = Math.random() * TAU; spawnDebris(x, gy + 2, z, Math.cos(a) * rand(20, 50), rand(18, 46), Math.sin(a) * rand(20, 50), rand(0.6, 2), C('#a07c32')); } });
      logEvent(`위성 충돌 · 충격 반경 ${Math.round(R)}m`, 'crit');
      camFocus(x, gy + 20, z, 4, 420);
    }
  });
  camFollow(() => proj.pos, 230);
  logEvent('위성 궤도 이탈 · 대기권 재진입', 'warn');
}

function launchMeteors(x, z) {
  const P = S.power;
  const n = 5 + P * 2;
  const ang = Math.random() * TAU;
  const spread = 90 + P * 16;
  logEvent(`유성우 · 운석 ${n}개 접근`, 'warn');
  camFocus(x, H(x, z) + 60, z, 6, 760);
  for (let i = 0; i < n; i++) {
    later(i * rand(0.25, 0.6) + rand(0, 0.3), () => {
      const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * spread;
      const tx = x + Math.cos(a) * r, tz = z + Math.sin(a) * r, gy = H(tx, tz);
      const big = Math.random() < 0.18;
      const R = (big ? 22 : 9) + P * (big ? 2.6 : 1.1) + rand(0, 6);
      const start = new V3(tx - Math.cos(ang) * 1900 + rand(-120, 120), gy + 1700, tz - Math.sin(ang) * 1900 + rand(-120, 120));
      const g = new THREE.Group();
      const rock = new THREE.Mesh(rockGeo(big ? 2.6 : 1.4, i * 3.1), new THREE.MeshStandardMaterial({ color: C('#3a302a'), emissive: C('#ff5a10'), emissiveIntensity: 1.2, roughness: 1 }));
      g.add(rock, glowMesh(C('#ffcf8a'), big ? 5 : 3, 0.85));
      const tg = big ? claimTarget(tx, tz, R * 0.9) : -1;
      makeFaller({ start, end: new V3(tx, gy, tz), dur: rand(2.4, 3.2), mesh: g, target: tg, trail: plasmaTrail(big ? 1.8 : 1, 0.7),
        onStep: (p, dt) => { rock.rotation.x += dt * 4; rock.rotation.z += dt * 3; },
        onImpact: () => explosion(tx, tz, R, 60 + R * 4.2, { depth: 0.22 }) });
    });
  }
}

const QUAKES = [];
function startQuake(x, z, P, after) {
  const q = { x, z, P, t: 0, dur: 6 + P * 0.75, amp: 0.15 + P * 0.17, scale: 170 + P * 42, after: !!after, crackT: 0, treeT: 0 };
  QUAKES.push(q);
  const M = 4.2 + P * 0.44;
  for (let i = 0; i < 3 + Math.floor(P / 2); i++) markCrack(x + rand(-12, 12), z + rand(-12, 12), 30 + P * 12, Math.random() * TAU);
  addThreat(x, z, q.scale * 2.2, 0.55, q.dur);
  logEvent(`${after ? '여진' : '지진'} 발생 · 규모 ${M.toFixed(1)}`, after ? 'warn' : 'crit');
  sfx.boom(x, H(x, z) - 20, z, 0.6);
  if (!after) camFocus(x, H(x, z) + 30, z, 3, 700);
}
function updateQuakes(dt) {
  let best = null, camK = 0;
  for (const s of SEGS) if (s.state === 0) { s.qx = 0; s.qz = 0; }
  for (let qi = QUAKES.length - 1; qi >= 0; qi--) {
    const q = QUAKES[qi];
    q.t += dt;
    const env = smooth(0, 1.2, q.t) * (1 - smooth(q.dur - 2.6, q.dur, q.t)) * (0.78 + 0.22 * Math.sin(q.t * 7.1) * Math.sin(q.t * 2.3));
    if (!best || q.amp * env > best.a) best = { q, a: q.amp * env };
    const front = q.t * 260;
    const dmgK = 1 + q.P * q.P * 0.55;
    for (const s of SEGS) {
      if (s.state !== 0) continue;
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
  for (const s of SEGS) if (s.state === 0 && (s.qx || s.qz)) { s.swayX = s.qx; s.swayZ = s.qz; }
  if (best && best.a > 0.005) {
    TERR_U.uQuake.value.set(best.q.x, best.q.z, best.a, best.q.t);
    TERR_U.uQuakeK.value.set(260, 70, best.q.scale * 1.6, 0);
  } else TERR_U.uQuake.value.z = 0;
  if (camK > 0) addShake(camK * 0.9);
  S.quakeK = camK;
}

function startFlood() {
  const P = S.power;
  if (FLOOD.on) { logEvent('이미 해일이 진행 중입니다', 'warn'); return; }
  Object.assign(FLOOD, { on: true, phase: 'surge', level: 33 + P * 3.8, front: -1150, speed: 52 + P * 4, crest: 4 + P * 1.3, t: 0, P });
  FLOOD.hit.clear();
  WATER_U.uFlow.value = 1;
  waterMesh.visible = true;
  logEvent(`해일 경보 · 정문 기준 수위 ${Math.round(FLOOD.level - H(DATA.P.mainGate[0], DATA.P.mainGate[1]))}m`, 'crit');
  camFocus(-60, 40, -420, 7, 900);
}
function updateFlood(dt) {
  const F = FLOOD;
  if (!F.on) { TERR_U.uWater.value.set(-999, -999); return; }
  F.t += dt;
  if (F.phase === 'surge') {
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
    if (F.t > 6) { F.phase = 'recede'; F.t = 0; WATER_U.uFlow.value = -0.6; logEvent('물이 빠지기 시작', 'ok'); }
  } else {
    F.level -= dt * (2.2 + F.P * 0.5);
    if (F.level < -5) {
      F.on = false; waterMesh.visible = false; F.level = -999;
      TERR_U.uWater.value.set(-999, -999);
      logEvent('해일 종료', 'ok');
      return;
    }
  }
  WATER_U.uLevel.value = F.level;
  WATER_U.uFront.value = F.front;
  WATER_U.uCrest.value = F.phase === 'surge' ? F.crest : Math.max(0, WATER_U.uCrest.value - dt * 2);
  TERR_U.uWater.value.set(F.front, F.level);
  for (const s of SEGS) {
    if (s.cz > F.front) continue;
    const dep = F.level - s.b.yGround;
    if (dep <= 0) continue;
    if (s.fire === 1) { s.fire = 0; s.fuel = 0; }
    s.wet = 8;
    if (!F.hit.has(s) && F.phase === 'surge') {
      F.hit.add(s);
      const hit = Math.min(dep, 14) * (10 + F.P * 2.6) * (s.b.style === 'house' ? 1.7 : 1);
      damageSeg(s, hit, new V3(0, 0, 1), 'flood');
      for (let i = 0; i < 8; i++) { randomFacadePoint(s, fpt); emitSmoke(fpt.x, F.level + 1, fpt.z, rand(-3, 3), rand(5, 12), rand(2, 8), rand(4, 8), 0.86, 0.88, 0.88, rand(1, 2), 0.55); }
    }
    if (F.phase !== 'recede') damageSeg(s, dt * Math.min(dep, 10) * 0.9, new V3(0, 0, 1), 'flood');
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
    for (let i = 0; i < PED.length; i++) {
      const p = PED[i];
      if (p.alive && p.z < F.front && F.level - p.y > 1.6) { p.alive = 0; pedMesh.setMatrixAt(i, HIDE); }
    }
  }
  if (F.phase !== 'recede' && Math.random() < dt * 2) markWet(rand(-850, 850), Math.min(F.front, 850) - rand(0, 300), 40);
}

const TYPH = { on: false, t: 0, dur: 0, x: 0, z: 0, boltT: 0, roofT: 0, treeT: 0, P: 5 };
function startTyphoon(x, z) {
  const P = S.power;
  const a = rand(-2.2, -0.9);
  const sp = 12 + P * 3.2;
  Object.assign(TYPH, { on: true, t: 0, dur: 32 + P * 3, x, z, boltT: 2, roofT: 0, treeT: 0, P, sp, dir: a });
  S.stormT = 1;
  S.windT.set(Math.cos(a) * sp, Math.sin(a) * sp);
  logEvent(`태풍 상륙 · 최대 풍속 ${Math.round(sp * 1.7)}m/s`, 'crit');
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
    if (id !== undefined && s.state === 0) {
      const r = roofBoxData[id];
      r.gone = true;
      tmpM.makeScale(0, 0, 0); roofBoxes.setMatrixAt(id, tmpM); roofBoxes.instanceMatrix.needsUpdate = true;
      spawnDebris(r.x, r.y + 1, r.z, S.wind.x * 0.8, rand(6, 14), S.wind.y * 0.8, Math.max(r.sx, r.sz) * 0.6, C('#b9bab6'));
    }
  }
  for (const s of SEGS) {
    if (s.state !== 0) continue;
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
    for (const s of segsNear(bx, bz, 60)) if (s.state === 0 && s.b.yTop > th) { th = s.b.yTop; tall = s; }
    if (tall && Math.random() < 0.6) { bx = tall.cx; bz = tall.cz; }
    lightningBolt(bx, bz, true);
    if (tall && Math.random() < 0.6) { damageSeg(tall, tall.maxHp * 0.12, null, 'lightning'); if (Math.random() < 0.35 && igniteSeg(tall, true)) logEvent(`${tall.b.name} 낙뢰 화재`, 'fire', tall.b.name); }
    else { const near = treesNear(bx, bz, 12); if (near.length) { const i = near[0]; tipTree(i, rand(-1, 1), rand(-1, 1), 1.4); igniteTree(i); } }
  }
  if (Y.t >= Y.dur) {
    Y.on = false; S.stormT = 0; S.windT.set(1.6, 2.2);
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
        explosion(tx, tz, R, 50 + R * 4, { depth: 0.18 });
        for (const i of treesNear(tx, tz, R * 1.4)) igniteTree(i);
        for (let k2 = 0; k2 < 10; k2++) emitSpark(tx, gy + 1, tz, rand(-14, 14), rand(10, 28), rand(-14, 14), [1, 0.45, 0.1], rand(1.5, 3), 2.2);
      } });
  }
  if (Math.random() < dt * 0.5) markAsh(0.012);
}

const TORN = [];
const funnelGeo = (() => {
  const g = new THREE.CylinderGeometry(1, 1, 1, 40, 32, true);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) + 0.5;
    const r = 0.08 + 0.92 * Math.pow(y, 2.1);
    p.setXYZ(i, p.getX(i) * r, y, p.getZ(i) * r);
  }
  g.computeVertexNormals();
  return g;
})();
function funnelMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uNight: { value: 0 }, uFogC: { value: scene.fog.color }, uFogD: { value: 0.0001 }, uDust: { value: C('#6e5e4a') } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `uniform float uTime; varying vec2 vUv; varying float vH; varying vec3 vW;
      void main(){ vUv = uv; vH = position.y; vec3 p = position;
        p.x += sin(p.y * 2.6 + uTime * 0.9) * 0.12 * p.y; p.z += cos(p.y * 2.1 + uTime * 0.7) * 0.1 * p.y;
        vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: GLSL_NOISE + `uniform float uTime, uNight, uFogD; uniform vec3 uFogC, uDust; varying vec2 vUv; varying float vH; varying vec3 vW;
      void main(){
        float a1 = fbm(vec3(vUv.x * 8.0 + uTime * 3.2 - vH * 6.0, vH * 7.0 - uTime * 0.6, uTime * 0.2));
        float a2 = fbm(vec3(vUv.x * 18.0 + uTime * 5.0, vH * 22.0, 3.0));
        float dens = smoothstep(0.32, 0.75, a1 * 0.75 + a2 * 0.35);
        float edge = smoothstep(0.0, 0.07, vH) * (1.0 - smoothstep(0.82, 1.0, vH) * 0.6);
        vec3 col = mix(uDust, vec3(0.52, 0.53, 0.55), smoothstep(0.0, 0.35, vH)) * (0.55 + 0.45 * a2);
        col *= 1.0 - uNight * 0.7;
        float d = length(cameraPosition - vW);
        col = mix(uFogC, col, exp(-uFogD * uFogD * d * d));
        gl_FragColor = vec4(col, dens * edge * 0.85);
      }`
  });
}
function startTornado(x, z) {
  const P = S.power;
  const r = 9 + P * 2.4;
  const mat = funnelMaterial();
  const mesh = new THREE.Mesh(funnelGeo, mat);
  const Hh = 420;
  mesh.scale.set(r * 6, Hh, r * 6);
  mesh.renderOrder = 5;
  mesh.frustumCulled = false;
  scene.add(mesh);
  const ang = Math.random() * TAU;
  const t = { x, z, r, P, mesh, mat, vx: Math.cos(ang) * (8 + P * 0.7), vz: Math.sin(ang) * (8 + P * 0.7), t: 0, life: 22 + P * 2, markT: 0, grow: 0 };
  TORN.push(t);
  S.stormT = Math.max(S.stormT, 0.55);
  logEvent(`토네이도 발생 · EF${Math.min(5, Math.round(P / 2))}`, 'crit');
  const fp = new V3();
  camFollow(() => fp.set(t.x, H(t.x, t.z) + 60, t.z), 420);
  CAM.tag = t;
}
function updateTornadoes(dt) {
  for (let ti = TORN.length - 1; ti >= 0; ti--) {
    const o = TORN[ti];
    o.t += dt;
    o.grow = Math.min(1, o.t / 3) * (1 - smooth(o.life - 3, o.life, o.t));
    const turn = (vnoise2(o.t * 0.2, ti * 7.7) - 0.5) * 1.6 * dt;
    const c = Math.cos(turn), s = Math.sin(turn);
    const vx = o.vx * c - o.vz * s, vz = o.vx * s + o.vz * c;
    o.vx = vx; o.vz = vz;
    if (Math.abs(o.x) > 780) o.vx = -Math.sign(o.x) * Math.abs(o.vx);
    if (Math.abs(o.z) > 780) o.vz = -Math.sign(o.z) * Math.abs(o.vz);
    o.x += o.vx * dt; o.z += o.vz * dt;
    const gy = H(o.x, o.z);
    const r = o.r * (0.3 + 0.7 * o.grow);
    o.mesh.position.set(o.x, gy - 4, o.z);
    o.mesh.scale.set(r * 6, 420 * (0.35 + 0.65 * Math.min(1, o.t / 2)), r * 6);
    o.mesh.rotation.y -= dt * 2.8;
    o.mat.uniforms.uTime.value = S.time;
    o.mat.uniforms.uNight.value = S.night;
    o.mat.uniforms.uFogD.value = scene.fog.density;
    const nd = Math.floor(18 * o.grow * FX_BUDGET.smoke);
    for (let i = 0; i < nd; i++) {
      const a = Math.random() * TAU, rr = rand(0.4, 2.2) * r, sp = rand(18, 34);
      smokePool.spawn({ x: o.x + Math.cos(a) * rr, y: gy + rand(0, 10), z: o.z + Math.sin(a) * rr,
        vx: -Math.sin(a) * sp + o.vx, vy: rand(6, 26), vz: Math.cos(a) * sp + o.vz, r: 0.42, g: 0.36, b: 0.29, life: rand(1, 2.4), s0: rand(4, 8), s1: rand(12, 24), a: 0.6, grav: 2, drag: 0.5, wind: 0.3, spin: rand(-3, 3) });
    }
    const R = r * 2.1;
    for (const seg of segsNear(o.x, o.z, R)) {
      const d = segDist(seg, o.x, o.z);
      if (d > R) continue;
      const k = 1 - d / R;
      damageSeg(seg, dt * (22 + o.P * 9) * k * o.grow * (seg.b.style === 'house' ? 2 : 1), new V3(o.vx, 0, o.vz).normalize(), 'tornado');
      if (Math.random() < dt * 6 * k && seg.state !== 2) {
        randomFacadePoint(seg, fpt);
        spawnDebris(fpt.x, fpt.y, fpt.z, (o.z - fpt.z) * 0.6 + rand(-6, 6), rand(14, 34), (fpt.x - o.x) * 0.6 + rand(-6, 6), rand(0.3, 1.2), seg.wallMat.color);
      }
      for (const id of seg.roofIds) { const rb = roofBoxData[id]; if (rb && !rb.gone && Math.random() < dt * 2 * k) { rb.gone = true; tmpM.makeScale(0, 0, 0); roofBoxes.setMatrixAt(id, tmpM); roofBoxes.instanceMatrix.needsUpdate = true; spawnDebris(rb.x, rb.y + 1, rb.z, rand(-10, 10), rand(20, 40), rand(-10, 10), Math.max(rb.sx, rb.sz) * 0.6, C('#b9bab6')); } }
    }
    for (const i of treesNear(o.x, o.z, r * 1.5)) {
      if (T.st[i] === 3) continue;
      const dx = T.x[i] - o.x, dz = T.z[i] - o.z;
      destroyTree(i);
      for (let q = 0; q < 3; q++) spawnDebris(T.x[i], T.y[i] + rand(1, 6), T.z[i], -dz * 1.2 + rand(-6, 6), rand(22, 46), dx * 1.2 + rand(-6, 6), rand(0.3, 1.1), q ? LEAF : BARK);
    }
    for (const i of treesNear(o.x, o.z, r * 4)) if (T.st[i] !== 3 && Math.random() < dt * 3) tipTree(i, -(T.z[i] - o.z), T.x[i] - o.x, rand(0.2, 0.7));
    for (const ci of carsNear(o.x, o.z, r * 1.4)) {
      const cc = CARS[ci];
      killCar(ci);
      for (let q = 0; q < 4; q++) spawnDebris(cc.x, cc.y + 1, cc.z, rand(-14, 14), rand(26, 44), rand(-14, 14), rand(0.6, 1.6), cc.col);
      logEvent('차량이 토네이도에 휩쓸림', 'warn');
    }
    killPedsAround(o.x, o.z, r * 0.9);
    addThreat(o.x, o.z, r * 9, 1.4, 1);
    if (Math.hypot(windmill.x - o.x, windmill.z - o.z) < r * 2.5) breakWindmill(new V3(o.vx, 0, o.vz));
    o.markT -= dt;
    if (o.markT <= 0) { o.markT = 0.15; markWet(o.x, o.z, r * 1.3); markWet(o.x, o.z, r * 0.7); }
    ROAR.v = Math.max(ROAR.v, clamp(1 - camDist(o.x, gy, o.z) / 1500, 0, 1) * o.grow);
    if (camDist(o.x, gy, o.z) < 500) addShake(0.12 * o.grow);
    if (o.t >= o.life) {
      scene.remove(o.mesh); o.mat.dispose();
      TORN.splice(ti, 1);
      if (CAM.mode === 'follow' && CAM.tag === o) camRelease();
      if (!TORN.length && !TYPH.on) S.stormT = 0;
      logEvent('토네이도 소멸', 'ok');
    }
  }
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
  updateTornadoes(dt);
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
  for (const o of TORN) { scene.remove(o.mesh); o.mat.dispose(); }
  TORN.length = 0;
  S.stormT = 0; S.ashT = 0; S.windT.set(1.6, 2.2);
  for (let i = 0; i < 4; i++) releaseTarget(i);
  for (const l of LIGHTS) l.intensity = 0;
  for (const r of roofBoxData) r.gone = false;
  TIMERS.length = 0;
  camRelease();
}

const DISASTERS = {
  bomb: { name: '폭탄 투하', key: '1', desc: '폭격기가 지나가며 클릭 지점에 폭탄을 떨어뜨립니다', radius: P => 14 + P * 4.2, run: launchBomb, info: P => `폭발 반경 ${Math.round(14 + P * 4.2)}m · 폭탄 ${P >= 8 ? 3 : P >= 5 ? 2 : 1}발` },
  satellite: { name: '위성 추락', key: '2', desc: '대기권에 재진입한 위성이 분해되며 충돌합니다', radius: P => 26 + P * 5.5, run: launchSatellite, info: P => `충돌 반경 ${Math.round(26 + P * 5.5)}m · 파편 3개` },
  meteor: { name: '유성우', key: '3', desc: '여러 개의 운석이 클릭 지점 주변에 쏟아집니다', radius: P => 90 + P * 16, ring2: true, run: launchMeteors, info: P => `운석 ${5 + P * 2}개 · 낙하 범위 ${Math.round(90 + P * 16)}m` },
  quake: { name: '지진', key: '4', desc: '클릭한 곳이 진앙, 지표파가 퍼지며 여진이 따라옵니다', radius: P => 170 + P * 42, ring2: true, run: (x, z) => startQuake(x, z, S.power), info: P => `규모 ${(4.2 + P * 0.44).toFixed(1)} · ${Math.round(6 + P * 0.75)}초 지속` },
  flood: { name: '해일', key: '5', desc: '북쪽 바다에서 해일이 밀려와 낮은 곳부터 잠깁니다', radius: () => 0, run: () => startFlood(), info: P => `정문 기준 수위 ${Math.max(1, Math.round(P * 3.8 - 3.6))}m · 파고 ${Math.round(4 + P * 1.3)}m` },
  fire: { name: '화재', key: '6', desc: '불이 바람을 타고 숲과 건물로 번집니다', radius: P => 10 + P * 2.4, run: startFire, info: P => `발화 범위 ${Math.round(10 + P * 2.4)}m · 바람 ${(Math.hypot(2 + P * 0.7, 2.6 + P * 0.8)).toFixed(1)}m/s` },
  typhoon: { name: '태풍', key: '7', desc: '폭우와 강풍, 낙뢰가 캠퍼스 전체를 덮칩니다', radius: () => 0, run: startTyphoon, info: P => `최대 풍속 ${Math.round((12 + P * 3.2) * 1.7)}m/s · ${Math.round(32 + P * 3)}초` },
  tornado: { name: '토네이도', key: '8', desc: '회오리가 이동하며 나무와 차량을 휩쓸어 갑니다', radius: P => 9 + P * 2.4, run: startTornado, info: P => `EF${Math.min(5, Math.round(P / 2))} · 깔때기 반경 ${Math.round(9 + P * 2.4)}m` },
  volcano: { name: '한라산 분화', key: '9', desc: '한라산이 분화해 화산탄과 화산재가 쏟아집니다', radius: P => 140 + P * 22, ring2: true, run: startEruption, info: P => `화산탄 낙하 범위 ${Math.round(140 + P * 22)}m · ${Math.round(34 + P * 2.5)}초` }
};
