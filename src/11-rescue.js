const RESCUE_TEAMS = 3;
const RESCUE_DELAY = 30;
const RESCUE_SPEED = 4;
const RESCUE_WORK = 6;
const RESCUE_CAP = 6;
const RESCUE_PICK_R = 30;
const RESCUE_CHECK = 6;
const RESCUE_SEARCH = 12;
const RESCUE = { called: false, callT: 0, arrived: false, teams: [], base: null, delay: RESCUE_DELAY, fireOut: 0, treeOut: 0, checks: 0, checked: new Set() };

const rescueBodyGeo = mergeGeos([
  new THREE.BoxGeometry(2.4, 1.1, 5.2).translate(0, 0.75, 0),
  new THREE.BoxGeometry(2.2, 0.9, 2.2).translate(0, 1.7, -0.9)
]);
const rescueMat = new THREE.MeshStandardMaterial({ color: C('#ff7a1a'), roughness: 0.5, metalness: 0.2 });
const rescueStripeMat = new THREE.MeshStandardMaterial({ color: C('#f4f4ef'), roughness: 0.6 });
const rescueLampMat = new THREE.MeshStandardMaterial({ color: C('#ff2a2a'), emissive: C('#ff2a2a'), emissiveIntensity: 2 });

function makeRescueTeam(k) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(rescueBodyGeo, rescueMat);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.46, 0.25, 5.25).translate(0, 0.95, 0), rescueStripeMat);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.3, 0.5).translate(0, 2.3, -0.9), rescueLampMat);
  body.castShadow = true;
  g.add(body, stripe, lamp);
  g.scale.setScalar(1.8);
  g.visible = false;
  scene.add(g);
  const el = document.createElement('div');
  el.className = 'lbl rescue';
  el.hidden = true;
  document.getElementById('labels').appendChild(el);
  return { k, g, el, x: 0, z: 0, y: 0, state: 'standby', target: -1, carry: [], workT: 0, tx: 0, tz: 0, dest: -1, trips: 0, check: null };
}

function rescueInit() {
  for (let k = 0; k < RESCUE_TEAMS; k++) RESCUE.teams.push(makeRescueTeam(k));
}

function josaRo(word) {
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  if (c < 0 || c > 11171) return '로';
  const jong = c % 28;
  return jong === 0 || jong === 8 ? '로' : '으로';
}

function rescueEnabled() { return !!S.respond; }

function surfaceY(x, z) {
  const h = H(x, z);
  return Math.max(h, FLOOD.on && z < FLOOD.front ? FLOOD.level : -Infinity);
}

function rescueBase() {
  const gates = [DATA.P.mainGate, DATA.P.backGate];
  let best = gates[0], bw = Infinity;
  for (const [x, z] of gates) {
    const w = waterDepthAt(x, z) + fireDistancePenalty(x, z);
    if (w < bw) { bw = w; best = [x, z]; }
  }
  return best;
}
function fireDistancePenalty(x, z) { return fireDistance(x, z) < 60 ? 100 : 0; }

function callRescue() {
  if (RESCUE.called || !rescueEnabled()) return;
  RESCUE.called = true;
  RESCUE.callT = S.time;
  logEvent(`119 신고 접수 · 소방차와 구조대 ${RESCUE_TEAMS}팀 출동, 약 ${Math.round(RESCUE.delay * EV_K / 60)}분 뒤 도착`, 'warn');
}

function rescueBusy() {
  if (!rescueEnabled() || !RESCUE.called) return false;
  if (!RESCUE.arrived) return true;
  return RESCUE.teams.some(t => t.state === 'toVictim' || t.state === 'working' || t.state === 'toShelter');
}

function hasFreeVictim() {
  for (let i = 0; i < EVAC.n; i++) if (A.st[i] === EV.STUCK && A.rescuer[i] < 0) return true;
  return false;
}

function claimCheck(t) {
  let best = null, bs = -Infinity;
  const taken = new Set(RESCUE.teams.map(q => q.check));
  for (const b of BLD) {
    if (RESCUE.checked.has(b) || taken.has(b)) continue;
    const info = buildingInfo(b);
    if (info.risk < 2) continue;
    const score = info.risk * 1000 - Math.hypot(b.cx - t.x, b.cz - t.z);
    if (score > bs) { bs = score; best = b; }
  }
  if (!best) return false;
  const dx = t.x - best.cx, dz = t.z - best.cz, d = Math.hypot(dx, dz) || 1;
  const r = Math.sqrt(best.area / Math.PI) + 8;
  t.check = best; t.state = 'toCheck';
  t.tx = best.cx + dx / d * r; t.tz = best.cz + dz / d * r;
  return true;
}

function dropCheck(t) { t.check = null; t.state = 'idle'; }

function nearestOpenShelter(x, z) {
  let best = -1, bd = Infinity;
  EVAC.shelters.forEach((s, si) => {
    if (!s.kinds.includes(EVAC.kind) || !s.open) return;
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < bd) { bd = d; best = si; }
  });
  return best;
}

function claimVictim(t) {
  let best = -1, bd = Infinity;
  for (let i = 0; i < EVAC.n; i++) {
    if (A.st[i] !== EV.STUCK || A.rescuer[i] >= 0) continue;
    const d = Math.hypot(A.x[i] - t.x, A.z[i] - t.z);
    if (d < bd) { bd = d; best = i; }
  }
  if (best < 0) return false;
  A.rescuer[best] = t.k;
  t.target = best; t.state = 'toVictim';
  t.tx = A.x[best]; t.tz = A.z[best];
  return true;
}

function moveTeam(t, dt) {
  const dx = t.tx - t.x, dz = t.tz - t.z, d = Math.hypot(dx, dz);
  const step = RESCUE_SPEED * EV_K * dt;
  if (d <= step) { t.x = t.tx; t.z = t.tz; return true; }
  t.x += dx / d * step; t.z += dz / d * step;
  t.g.rotation.y = Math.atan2(dx, dz);
  return false;
}

function updateRescue(dt) {
  if (!EVAC.active || !EVAC.run) return;
  if (!rescueEnabled()) {
    for (const t of RESCUE.teams) if (t.state !== 'standby') releaseTeam(t, true);
    return;
  }
  if (!RESCUE.called) callRescue();
  if (RESCUE.called && !RESCUE.arrived && S.time >= RESCUE.callT + RESCUE.delay) {
    RESCUE.arrived = true;
    const [bx, bz] = rescueBase();
    RESCUE.base = [bx, bz];
    RESCUE.teams.forEach((t, k) => { t.x = bx + (k - 1) * 8; t.z = bz; t.g.visible = true; t.state = 'idle'; });
    logEvent(`소방차·구조대 도착 (${bz === DATA.P.backGate[1] ? '후문' : '정문'})`, 'ok');
  }
  if (!RESCUE.arrived) return;
  for (const t of RESCUE.teams) {
    if (t.state === 'idle' || t.state === 'standby') {
      if (claimVictim(t) || claimCheck(t)) continue;
      t.state = 'standby';
    } else if (t.state === 'toCheck') {
      if (hasFreeVictim()) { dropCheck(t); claimVictim(t); continue; }
      if (moveTeam(t, dt)) { t.state = 'checking'; t.workT = RESCUE_CHECK; }
    } else if (t.state === 'checking') {
      t.workT -= dt;
      if (t.workT <= 0) {
        RESCUE.checked.add(t.check);
        RESCUE.checks++;
        logEvent(`구조대 ${t.k + 1}팀 · ${t.check.name} 안전 점검, 출입 통제`, 'info', t.check.name);
        dropCheck(t);
      }
    } else if (t.state === 'toVictim') {
      const i = t.target;
      if (A.st[i] !== EV.STUCK) { A.rescuer[i] = -1; t.target = -1; t.state = 'idle'; continue; }
      t.tx = A.x[i]; t.tz = A.z[i];
      if (moveTeam(t, dt)) { t.state = 'working'; t.workT = A.why[i] === 3 ? RESCUE_SEARCH : RESCUE_WORK; }
    } else if (t.state === 'working') {
      t.workT -= dt;
      if (t.workT <= 0) pickUp(t);
    } else if (t.state === 'toShelter') {
      const s = EVAC.shelters[t.dest];
      if (!s || !s.open) {
        t.dest = nearestOpenShelter(t.x, t.z);
        if (t.dest < 0) { t.tx = RESCUE.base[0]; t.tz = RESCUE.base[1]; }
        else { t.tx = EVAC.shelters[t.dest].x; t.tz = EVAC.shelters[t.dest].z; }
      }
      for (const i of t.carry) { A.x[i] = t.x; A.z[i] = t.z; A.y[i] = t.y + 2; }
      if (moveTeam(t, dt)) dropOff(t);
    }
    t.y = surfaceY(t.x, t.z);
    t.g.position.set(t.x, t.y, t.z);
  }
  rescueLampMat.emissiveIntensity = 1 + 1.5 * (Math.sin(S.real * 12) > 0 ? 1 : 0);
}

function pickUp(t) {
  const i0 = t.target;
  const picked = [];
  for (let i = 0; i < EVAC.n && picked.length < RESCUE_CAP; i++) {
    if (A.st[i] !== EV.STUCK) continue;
    if (i !== i0 && (A.rescuer[i] >= 0 && A.rescuer[i] !== t.k)) continue;
    if (i !== i0 && Math.hypot(A.x[i] - A.x[i0], A.z[i] - A.z[i0]) > RESCUE_PICK_R) continue;
    picked.push(i);
  }
  if (!picked.includes(i0) && A.st[i0] === EV.STUCK) picked.unshift(i0);
  for (const i of picked) {
    A.rescueWait[i] = S.time - A.stuckSince[i];
    clearStuck(i);
    A.st[i] = EV.CARRIED; A.rescued[i] = 1; A.rescuer[i] = t.k;
    A.node[i] = -1; A.edge[i] = -1; A.final[i] = 0;
    drawPerson(i, true);
  }
  t.carry = picked;
  t.target = -1;
  t.dest = nearestOpenShelter(t.x, t.z);
  if (t.dest < 0) { t.tx = RESCUE.base[0]; t.tz = RESCUE.base[1]; }
  else { t.tx = EVAC.shelters[t.dest].x; t.tz = EVAC.shelters[t.dest].z; }
  t.state = 'toShelter';
  evMesh.instanceColor.needsUpdate = true;
}

function dropOff(t) {
  const si = t.dest;
  for (const i of t.carry) {
    A.st[i] = si >= 0 ? EV.DONE : EV.STUCK;
    if (si < 0) setStuck(i, 2);
    A.shelter[i] = si; A.tEnd[i] = S.time; A.rescuer[i] = -1;
    const a = Math.random() * TAU, r = si >= 0 && !EVAC.shelters[si].b ? Math.random() * EVAC.shelters[si].r * 0.6 : 0;
    A.x[i] = t.x + Math.cos(a) * r; A.z[i] = t.z + Math.sin(a) * r; A.y[i] = H(A.x[i], A.z[i]);
    drawPerson(i, true);
  }
  if (si >= 0 && t.carry.length) logEvent(`구조대 ${t.k + 1}팀 · ${t.carry.length}명 구조해 ${EVAC.shelters[si].name}${josaRo(EVAC.shelters[si].name)} 이송`, 'ok');
  t.trips++;
  t.carry = [];
  t.dest = -1;
  t.state = 'idle';
  evMesh.instanceColor.needsUpdate = true;
}

function releaseTeam(t, hide) {
  if (t.target >= 0) A.rescuer[t.target] = -1;
  t.check = null;
  for (const i of t.carry) { A.rescuer[i] = -1; setStuck(i, 2); drawPerson(i, true); }
  t.carry = []; t.target = -1; t.state = 'standby';
  if (hide) t.g.visible = false;
}

function updateRescueLabels(w, h, proj) {
  for (const t of RESCUE.teams) {
    const on = S.labels && t.g.visible && EVAC.active;
    if (!on) { if (!t.el.hidden) t.el.hidden = true; continue; }
    proj.set(t.x, t.y + 12, t.z).project(camera);
    if (proj.z > 1 || Math.abs(proj.x) > 1.05 || Math.abs(proj.y) > 1.05) { t.el.hidden = true; continue; }
    t.el.hidden = false;
    const what = { idle: '대기', standby: '대기', toVictim: '고립자에게 이동', working: t.target >= 0 && A.why[t.target] === 3 ? '건물 수색 중' : '구조 중', toCheck: '위험 건물로 이동', checking: '안전 점검 중', toShelter: `${t.carry.length}명 이송 중` }[t.state];
    const txt = `구조대 ${t.k + 1}팀 · ${what}`;
    if (t.el.textContent !== txt) t.el.textContent = txt;
    t.el.style.transform = `translate(${((proj.x + 1) / 2) * w}px, ${((1 - proj.y) / 2) * h}px) translate(-50%, -100%)`;
  }
}

function resetRescue() {
  RESCUE.called = false; RESCUE.arrived = false; RESCUE.base = null;
  RESCUE.fireOut = 0; RESCUE.treeOut = 0; RESCUE.checks = 0; RESCUE.checked.clear();
  for (const t of RESCUE.teams) {
    t.state = 'standby'; t.target = -1; t.carry = []; t.dest = -1; t.trips = 0; t.check = null;
    t.g.visible = false; t.el.hidden = true;
  }
}
