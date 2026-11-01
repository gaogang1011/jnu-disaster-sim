const EV_K = 10;
const EV_WALK = 1.4;
const EV_N = IS_MOBILE ? 180 : 320;
const EV_LIMIT = 180;
const EV_REROUTE = 1.5;
const EV = { IDLE: 0, WAIT: 1, MOVE: 2, DONE: 3, STUCK: 4, CARRIED: 5 };
const EV_STATE_COL = [null, C('#8fb3d9'), C('#ffc533'), C('#3fd07f'), C('#ff4b3a'), C('#5fd0ff')];
const EV_IDLE_DOT = C('#e6eef2');
const EV_CLOTHES = ['#d8534f', '#4f7fd8', '#e0a33a', '#48a071', '#8a5bbf', '#d96fa0', '#3fb2c4', '#c96a3a', '#e8e3dc', '#424852'].map(C);
const FIRE_CELL = 10, FIRE_N = Math.ceil(1700 / FIRE_CELL);

const EVAC = {
  graph: null, nh: null, edgeH: null, edgeSegs: null, route: null, cost: null, occ: null, flow: null, cap: null,
  shelters: [], active: false, kindId: null, kind: null, run: null, results: [], routeT: 0, flowT: 0,
  fireNear: new Uint8Array(FIRE_N * FIRE_N), firePts: [], n: 0
};
const A = {};

const evPersonGeo = mergeGeos([
  new THREE.CylinderGeometry(0.26, 0.32, 1.05, 6).translate(0, 0.72, 0),
  new THREE.SphereGeometry(0.2, 7, 6).translate(0, 1.42, 0)
]);
const evMesh = new THREE.InstancedMesh(evPersonGeo, new THREE.MeshStandardMaterial({ roughness: 0.8, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0.18 }), EV_N);
evMesh.castShadow = true;
evMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(EV_N * 3), 3);
evMesh.frustumCulled = false;
scene.add(evMesh);

const evDotPos = new Float32Array(EV_N * 3), evDotCol = new Float32Array(EV_N * 3);
const evDotGeo = new THREE.BufferGeometry();
evDotGeo.setAttribute('position', new THREE.BufferAttribute(evDotPos, 3).setUsage(THREE.DynamicDrawUsage));
evDotGeo.setAttribute('aColor', new THREE.BufferAttribute(evDotCol, 3).setUsage(THREE.DynamicDrawUsage));
const evDots = new THREE.Points(evDotGeo, new THREE.ShaderMaterial({
  uniforms: { uPx: { value: Math.min(window.devicePixelRatio || 1, 2) } },
  transparent: true, depthWrite: false,
  vertexShader: `attribute vec3 aColor; uniform float uPx; varying vec3 vC; varying float vS;
    void main(){ vC = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = -mv.z;
      vS = clamp(1600.0 / d, 4.0, 9.0) * uPx; gl_PointSize = vS; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `varying vec3 vC; varying float vS;
    void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; if (r > 1.0) discard;
      vec3 c = r > 0.68 ? vec3(0.04) : vC; gl_FragColor = vec4(c, 1.0); }`
}));
evDots.frustumCulled = false;
evDots.renderOrder = 9;
scene.add(evDots);

let evLines = null, evLineCol = null;
const evBeaconGeo = new THREE.CylinderGeometry(1.1, 1.1, 1, 12, 1, true).translate(0, 0.5, 0);
const evRingGeo = new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2);
const EV_OPEN_COL = C('#3fd07f'), EV_SHUT_COL = C('#7b8288');

function evacInit() {
  const g = buildWalkGraph(DATA.R);
  EVAC.graph = g;
  EVAC.nh = Float32Array.from(g.x.map((x, i) => H(x, g.z[i])));
  EVAC.edgeH = Float32Array.from(g.edges.map(e => H(e.mx, e.mz)));
  EVAC.cost = new Float64Array(g.edges.length);
  EVAC.occ = new Int16Array(g.edges.length);
  EVAC.flow = new Float32Array(g.edges.length);
  EVAC.cap = Float32Array.from(g.edges.map(e => Math.max(4, e.len / 3)));
  EVAC.edgeSegs = g.edges.map(e => segsNear(e.mx, e.mz, 14).filter(s => segDist(s, e.mx, e.mz) < 10));
  buildShelters();
  placeEvacuees();
  buildRouteLines();
}

function buildShelters() {
  const labels = document.getElementById('labels');
  for (const def of SHELTERS) {
    const s = { def, id: def.id, name: def.name, kinds: def.kinds, enabled: true, open: true, reason: '', count: 0 };
    if (def.building) {
      const b = BLD.find(q => q.name === def.building);
      s.b = b; s.x = b.cx; s.z = b.cz; s.r = Math.sqrt(b.area / Math.PI); s.y = b.yTop;
    } else {
      s.x = def.x; s.z = def.z; s.r = def.r; s.y = H(def.x, def.z);
    }
    const mat = new THREE.MeshBasicMaterial({ color: EV_OPEN_COL.clone(), transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const beacon = new THREE.Mesh(evBeaconGeo, mat);
    beacon.position.set(s.x, s.y, s.z);
    beacon.scale.set(def.building ? 2.2 : 1.6, def.building ? 26 : 34, def.building ? 2.2 : 1.6);
    const g = new THREE.Group();
    g.add(beacon);
    if (!def.building) {
      const ring = new THREE.Mesh(evRingGeo, mat);
      ring.position.set(s.x, s.y + 0.6, s.z);
      ring.scale.setScalar(s.r);
      g.add(ring);
    }
    g.visible = false;
    scene.add(g);
    s.group = g; s.mat = mat;
    const el = document.createElement('div');
    el.className = 'lbl shelter';
    el.hidden = true;
    labels.appendChild(el);
    s.el = el;
    EVAC.shelters.push(s);
  }
}

function placeEvacuees() {
  const r = mulberry32(77);
  const n = EV_N;
  for (const k of ['x', 'z', 'hx', 'hz', 'y', 'delay', 'tEnd', 'spd', 'tx', 'tz', 'sx', 'sz', 'bob']) A[k] = new Float32Array(n);
  for (const k of ['node', 'edge', 'shelter']) A[k] = new Int32Array(n).fill(-1);
  A.st = new Uint8Array(n); A.exposed = new Uint8Array(n); A.final = new Uint8Array(n); A.why = new Uint8Array(n);
  A.everStuck = new Uint8Array(n); A.stuckSince = new Float32Array(n); A.stuckT = new Float32Array(n);
  A.rescued = new Uint8Array(n); A.rescueWait = new Float32Array(n); A.rescuer = new Int32Array(n).fill(-1);
  A.col = [];
  const blds = BLD.filter(b => b.style !== 'house' && pointInPoly(b.cx, b.cz, DATA.campus));
  const total = blds.reduce((s, b) => s + b.area, 0);
  const g = EVAC.graph;
  const campusNodes = [];
  for (let i = 0; i < g.n; i++) if (pointInPoly(g.x[i], g.z[i], DATA.campus)) campusNodes.push(i);
  let i = 0, guard = 0;
  while (i < n && guard++ < n * 40) {
    let x, z;
    if (r() < 0.85) {
      let pick = r() * total, b = blds[0];
      for (const q of blds) { pick -= q.area; if (pick <= 0) { b = q; break; } }
      const p = b.poly, k = Math.floor(r() * p.length), a = p[k], c = p[(k + 1) % p.length], t = r();
      x = a[0] + (c[0] - a[0]) * t; z = a[1] + (c[1] - a[1]) * t;
      let nx = c[1] - a[1], nz = -(c[0] - a[0]);
      const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      if (pointInPoly(x + nx, z + nz, p)) { nx = -nx; nz = -nz; }
      x += nx * 2.5; z += nz * 2.5;
    } else {
      const v = campusNodes[Math.floor(r() * campusNodes.length)];
      x = g.x[v] + (r() - 0.5) * 6; z = g.z[v] + (r() - 0.5) * 6;
    }
    if (classAt(x, z) === CLS.building || classAt(x, z) === CLS.water) continue;
    A.hx[i] = A.x[i] = x; A.hz[i] = A.z[i] = z; A.y[i] = H(x, z);
    A.spd[i] = 0.82 + r() * 0.36;
    A.bob[i] = r() * TAU;
    A.col.push(EV_CLOTHES[Math.floor(r() * EV_CLOTHES.length)]);
    i++;
  }
  EVAC.n = i;
  evMesh.count = i;
  evDotGeo.setDrawRange(0, i);
  for (let k = 0; k < i; k++) { A.st[k] = EV.IDLE; drawPerson(k, true); }
  evMesh.instanceMatrix.needsUpdate = true;
  evMesh.instanceColor.needsUpdate = true;
}

function buildRouteLines() {
  const g = EVAC.graph, m = g.edges.length, W = 1.6;
  const pos = new Float32Array(m * 12), idx = [];
  evLineCol = new Float32Array(m * 12);
  g.edges.forEach((e, k) => {
    const ax = g.x[e.a], az = g.z[e.a], bx = g.x[e.b], bz = g.z[e.b];
    const l = Math.hypot(bx - ax, bz - az) || 1, nx = -(bz - az) / l * W, nz = (bx - ax) / l * W;
    const ya = EVAC.nh[e.a] + 1.3, yb = EVAC.nh[e.b] + 1.3;
    pos.set([ax + nx, ya, az + nz, ax - nx, ya, az - nz, bx + nx, yb, bz + nz, bx - nx, yb, bz - nz], k * 12);
    const o = k * 4;
    idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(evLineCol, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(idx);
  evLines = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  evLines.renderOrder = 4;
  evLines.frustumCulled = false;
  evLines.visible = false;
  scene.add(evLines);
}

const evM = new THREE.Matrix4(), evQ = new THREE.Quaternion(), evS = new V3(), evP = new V3(), evE = new THREE.Euler();
function drawPerson(i, colorToo) {
  const st = A.st[i];
  const hide = st === EV.CARRIED || st === EV.DONE && A.shelter[i] >= 0 && EVAC.shelters[A.shelter[i]].b;
  const crouch = st === EV.WAIT && EVAC.kindId === 'quake' && quakeShaking();
  evE.set(0, A.bob[i], 0);
  evQ.setFromEuler(evE);
  const k = hide ? 0.0001 : 1.6;
  evS.set(k, crouch ? k * 0.55 : k, k);
  const bounce = st === EV.MOVE ? Math.abs(Math.sin(S.time * 9 + A.bob[i])) * 0.25 : 0;
  evP.set(A.x[i], A.y[i] + bounce, A.z[i]);
  evM.compose(evP, evQ, evS);
  evMesh.setMatrixAt(i, evM);
  evDotPos[i * 3] = A.x[i]; evDotPos[i * 3 + 1] = hide && st !== EV.CARRIED ? -9999 : A.y[i] + 4.5; evDotPos[i * 3 + 2] = A.z[i];
  if (colorToo) {
    const c = st === EV.IDLE ? EV_IDLE_DOT : EV_STATE_COL[st];
    evMesh.setColorAt(i, st === EV.IDLE ? A.col[i] : c);
    evDotCol[i * 3] = c.r; evDotCol[i * 3 + 1] = c.g; evDotCol[i * 3 + 2] = c.b;
    evDotGeo.attributes.aColor.needsUpdate = true;
  }
  evDotGeo.attributes.position.needsUpdate = true;
}

function quakeShaking() { return QUAKES.some(q => !q.after && q.t < q.dur - 1.2); }

function waterDepthAt(x, z, h) {
  if (!FLOOD.on || z > FLOOD.front) return 0;
  return Math.max(0, FLOOD.level - (h === undefined ? H(x, z) : h));
}

function rebuildFireField() {
  const f = EVAC.fireNear;
  f.fill(0);
  const pts = [];
  for (const s of SEGS) if (s.fire === 1) pts.push(s.cx, s.cz, s.r * 0.9);
  for (const i of burningTrees) pts.push(T.x[i], T.z[i], 2);
  EVAC.firePts = pts;
  for (let p = 0; p < pts.length; p += 3) {
    const x = pts[p], z = pts[p + 1], r0 = pts[p + 2];
    const R = r0 + 40, c0 = Math.floor((x - R + 850) / FIRE_CELL), c1 = Math.floor((x + R + 850) / FIRE_CELL);
    const d0 = Math.floor((z - R + 850) / FIRE_CELL), d1 = Math.floor((z + R + 850) / FIRE_CELL);
    for (let cz = Math.max(0, d0); cz <= Math.min(FIRE_N - 1, d1); cz++) for (let cx = Math.max(0, c0); cx <= Math.min(FIRE_N - 1, c1); cx++) {
      const px = cx * FIRE_CELL - 850 + FIRE_CELL / 2, pz = cz * FIRE_CELL - 850 + FIRE_CELL / 2;
      const d = Math.hypot(px - x, pz - z) - r0;
      const v = d < 12 ? 3 : d < 15 ? 2 : d < 40 ? 1 : 0;
      const k = cz * FIRE_N + cx;
      if (v > f[k]) f[k] = v;
    }
  }
}
function fireLevelAt(x, z) {
  const cx = Math.floor((x + 850) / FIRE_CELL), cz = Math.floor((z + 850) / FIRE_CELL);
  if (cx < 0 || cz < 0 || cx >= FIRE_N || cz >= FIRE_N) return 0;
  return EVAC.fireNear[cz * FIRE_N + cx];
}
function fireDistance(x, z) {
  let m = Infinity;
  const p = EVAC.firePts;
  for (let k = 0; k < p.length; k += 3) m = Math.min(m, Math.hypot(p[k] - x, p[k + 1] - z) - p[k + 2]);
  return m;
}

function updateShelterStatus() {
  for (const s of EVAC.shelters) {
    let reason = '';
    if (!s.enabled) reason = '사용 안 함';
    else if (s.b) {
      const info = buildingInfo(s.b);
      if (info.burning) reason = '화재';
      else if (info.risk >= 3) reason = '붕괴 위험';
      else if (info.flood >= 0.5) reason = '침수';
    } else {
      if (waterDepthAt(s.x, s.z) > 0.1) reason = '침수';
      else if (fireDistance(s.x, s.z) < 60) reason = '불이 가까움';
    }
    s.reason = reason;
    s.open = !reason;
  }
}

function computeEdgeCosts() {
  const g = EVAC.graph, cost = EVAC.cost;
  const quakeMode = EVAC.kindId === 'quake';
  for (let e = 0; e < g.edges.length; e++) {
    const ed = g.edges[e];
    let c = ed.len;
    const w = waterDepthAt(ed.mx, ed.mz, EVAC.edgeH[e]);
    if (w > 0.3) { cost[e] = Infinity; continue; }
    if (w > 0.1) c *= 4;
    const f = fireLevelAt(ed.mx, ed.mz);
    if (f >= 2) { cost[e] = Infinity; continue; }
    if (f === 1) c *= 3;
    let risk = 0;
    for (const s of EVAC.edgeSegs[e]) if (s.risk > risk) risk = s.risk;
    if (risk >= 3) c *= quakeMode ? 5 : 2.5;
    else if (risk >= 2) c *= quakeMode ? 2.5 : 1.5;
    cost[e] = c;
  }
}

function reroute() {
  if (!EVAC.active) return;
  rebuildFireField();
  updateShelterStatus();
  computeEdgeCosts();
  const usable = EVAC.shelters.filter(s => s.kinds.includes(EVAC.kind) && s.open);
  const src = shelterSources(EVAC.graph, usable, 4).map(q => ({ node: q.node, cost: q.cost, shelter: EVAC.shelters.indexOf(usable[q.shelter]) }));
  EVAC.route = routeToShelters(EVAC.graph, src, e => EVAC.cost[e]);
  for (let i = 0; i < EVAC.n; i++) {
    if (A.st[i] === EV.DONE) {
      const s = EVAC.shelters[A.shelter[i]];
      if (!s.open || !s.kinds.includes(EVAC.kind)) { A.st[i] = EV.MOVE; A.final[i] = 0; enterGraph(i); drawPerson(i, true); }
    } else if (A.st[i] === EV.MOVE || (A.st[i] === EV.STUCK && A.why[i] === 2)) {
      if (A.final[i]) {
        const s = EVAC.shelters[A.shelter[i]];
        if (!s.open) { A.final[i] = 0; enterGraph(i); }
      } else if (A.node[i] < 0 || !(EVAC.route.dist[A.node[i]] < Infinity)) enterGraph(i);
    }
  }
  paintRouteLines();
}

function setStuck(i, why) {
  A.st[i] = EV.STUCK; A.why[i] = why;
  A.everStuck[i] = 1; A.stuckSince[i] = S.time;
}
function clearStuck(i) {
  if (A.st[i] === EV.STUCK) A.stuckT[i] += S.time - A.stuckSince[i];
  A.why[i] = 0;
}

function enterGraph(i) {
  const v = entryNode(EVAC.graph, EVAC.route, A.x[i], A.z[i]);
  A.edge[i] = -1;
  if (v < 0) {
    A.node[i] = -1;
    if (A.st[i] !== EV.STUCK) { setStuck(i, 2); drawPerson(i, true); }
    return;
  }
  if (A.st[i] === EV.STUCK && A.why[i] === 2) { clearStuck(i); A.st[i] = EV.MOVE; drawPerson(i, true); }
  A.node[i] = v;
  A.tx[i] = EVAC.graph.x[v]; A.tz[i] = EVAC.graph.z[v];
}

function edgeBetween(a, b) {
  for (const t of EVAC.graph.adj[a]) if (t.to === b) return t.e;
  return -1;
}

function paintRouteLines() {
  if (!evLines) return;
  const g = EVAC.graph, col = evLineCol, r = EVAC.route;
  let maxFlow = 1;
  for (let e = 0; e < g.edges.length; e++) if (EVAC.flow[e] > maxFlow) maxFlow = EVAC.flow[e];
  for (let e = 0; e < g.edges.length; e++) {
    const ed = g.edges[e];
    let cr = 0, cg = 0, cb = 0;
    if (EVAC.cost[e] === Infinity) { cr = 0.75; cg = 0.06; cb = 0.04; }
    else if (r && (r.next[ed.a] === ed.b || r.next[ed.b] === ed.a)) {
      const f = Math.min(1, EVAC.flow[e] / Math.max(8, maxFlow * 0.6));
      cr = lerp(0.1, 1, f); cg = lerp(0.6, 0.3, f * f); cb = lerp(0.35, 0.02, f);
      if (EVAC.flow[e] === 0) { cr *= 0.45; cg *= 0.45; cb *= 0.45; }
    }
    for (let v = 0; v < 4; v++) { col[e * 12 + v * 3] = cr; col[e * 12 + v * 3 + 1] = cg; col[e * 12 + v * 3 + 2] = cb; }
  }
  evLines.geometry.attributes.color.needsUpdate = true;
}

function evacBegin(id) {
  const d = DISASTERS[id];
  if (!d || !EVAC.graph) return;
  if (EVAC.active && EVAC.run) finishRun('중단');
  EVAC.active = true;
  EVAC.kindId = id;
  EVAC.kind = d.shelter;
  const usable = EVAC.shelters.filter(s => s.kinds.includes(d.shelter) && s.enabled);
  EVAC.run = { id, name: d.name, power: S.power, info: d.info(S.power), start: S.time, shelters: usable.length, done: false };
  EVAC.flow.fill(0);
  for (const s of EVAC.shelters) s.count = 0;
  for (let i = 0; i < EVAC.n; i++) {
    A.st[i] = EV.WAIT;
    A.delay[i] = rand(0.5, 3.5);
    A.exposed[i] = 0; A.final[i] = 0; A.why[i] = 0; A.shelter[i] = -1; A.node[i] = -1; A.edge[i] = -1; A.tEnd[i] = 0;
    A.everStuck[i] = 0; A.stuckT[i] = 0; A.rescued[i] = 0; A.rescueWait[i] = 0; A.rescuer[i] = -1;
    drawPerson(i, true);
  }
  resetRescue();
  evMesh.instanceColor.needsUpdate = true;
  EVAC.routeT = 0;
  reroute();
  const kindName = SHELTER_KIND_NAME[d.shelter];
  logEvent(`대피 시작 · 목적지 ${kindName}, 대피소 ${usable.length}곳`, 'warn');
  if (typeof onEvacChange === 'function') onEvacChange();
}

function finishRun(status) {
  const run = EVAC.run;
  if (!run || run.done) return;
  run.done = true;
  const m = evacMetrics();
  const row = Object.assign({ status, at: S.time }, run, m);
  EVAC.results.push(row);
  if (status === '완료') logEvent(`대피 종료 · 완료율 ${Math.round(m.pct)}%, 평균 ${fmtReal(m.avg)}, 최대 ${fmtReal(m.max)}`, m.stuck ? 'warn' : 'ok');
  if (typeof onEvacChange === 'function') onEvacChange();
}

function evacMetrics() {
  let done = 0, moving = 0, stuck = 0, exposed = 0, wait = 0, sum = 0, max = 0, ever = 0, stuckSum = 0, carried = 0, rescued = 0, rescueSum = 0;
  const start = EVAC.run ? EVAC.run.start : S.time;
  for (let i = 0; i < EVAC.n; i++) {
    const st = A.st[i];
    if (st === EV.DONE) { done++; const t = (A.tEnd[i] - start) * EV_K; sum += t; if (t > max) max = t; }
    else if (st === EV.MOVE) moving++;
    else if (st === EV.STUCK) stuck++;
    else if (st === EV.WAIT) wait++;
    else if (st === EV.CARRIED) carried++;
    if (A.exposed[i]) exposed++;
    if (A.rescued[i]) { rescued++; rescueSum += A.rescueWait[i]; }
    if (A.everStuck[i]) { ever++; stuckSum += A.stuckT[i] + (st === EV.STUCK ? S.time - A.stuckSince[i] : 0); }
  }
  return {
    total: EVAC.n, done, moving, stuck, wait, exposed, ever, stuckAvg: ever ? stuckSum / ever * EV_K : 0,
    carried, rescued, rescueAvg: rescued ? rescueSum / rescued * EV_K : 0,
    pct: EVAC.n ? done / EVAC.n * 100 : 0, avg: done ? sum / done : 0, max, elapsed: (S.time - start) * EV_K
  };
}

function fmtReal(sec) {
  if (!(sec > 0)) return '-';
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return m ? `${m}분 ${String(s).padStart(2, '0')}초` : `${s}초`;
}

function updateEvacuation(dt) {
  if (!EVAC.graph) return;
  if (!EVAC.active) {
    for (let i = 0; i < EVAC.n; i++) drawPerson(i, false);
    evMesh.instanceMatrix.needsUpdate = true;
    return;
  }
  EVAC.routeT -= dt;
  if (EVAC.routeT <= 0) { EVAC.routeT = EV_REROUTE; reroute(); }
  const g = EVAC.graph, route = EVAC.route, occ = EVAC.occ;
  occ.fill(0);
  for (let i = 0; i < EVAC.n; i++) if (A.st[i] === EV.MOVE && A.edge[i] >= 0) occ[A.edge[i]]++;
  const shaking = EVAC.kindId === 'quake' && quakeShaking();
  let colorDirty = false;
  for (let i = 0; i < EVAC.n; i++) {
    const st = A.st[i];
    if (st === EV.WAIT) {
      if (!shaking) A.delay[i] -= dt;
      if (A.delay[i] <= 0) { A.st[i] = EV.MOVE; enterGraph(i); colorDirty = true; }
    } else if (st === EV.MOVE) {
      const e = A.edge[i];
      let f = 1;
      if (e >= 0 && occ[e] > EVAC.cap[e]) f = Math.max(0.3, EVAC.cap[e] / occ[e]);
      let step = EV_WALK * EV_K * A.spd[i] * f * dt;
      let hops = 0;
      while (step > 0 && A.st[i] === EV.MOVE && hops++ < 64) {
        const dx = A.tx[i] - A.x[i], dz = A.tz[i] - A.z[i], d = Math.hypot(dx, dz);
        if (d > step) { A.x[i] += dx / d * step; A.z[i] += dz / d * step; A.bob[i] = Math.atan2(dx, dz); step = 0; break; }
        A.x[i] = A.tx[i]; A.z[i] = A.tz[i]; step -= d;
        if (A.final[i]) {
          A.st[i] = EV.DONE; A.tEnd[i] = S.time; A.edge[i] = -1;
          colorDirty = true;
          break;
        }
        const v = A.node[i];
        if (v < 0) break;
        const nx = route.next[v];
        if (nx < 0) {
          const si = route.shelter[v], s = EVAC.shelters[si];
          A.shelter[i] = si; A.final[i] = 1; A.edge[i] = -1;
          const a = Math.random() * TAU, rr = s.b ? 0 : Math.sqrt(Math.random()) * s.r * 0.8;
          A.tx[i] = s.x + Math.cos(a) * rr; A.tz[i] = s.z + Math.sin(a) * rr;
        } else {
          const ne = edgeBetween(v, nx);
          if (ne >= 0 && ne !== A.edge[i]) EVAC.flow[ne] += 1;
          A.edge[i] = ne; A.node[i] = nx;
          A.tx[i] = g.x[nx]; A.tz[i] = g.z[nx];
        }
      }
      A.y[i] = H(A.x[i], A.z[i]);
      const w = waterDepthAt(A.x[i], A.z[i], A.y[i]);
      if (w > 0.2 || fireLevelAt(A.x[i], A.z[i]) >= 3) A.exposed[i] = 1;
      if (w > 0.5) { setStuck(i, 1); colorDirty = true; }
    } else if (st === EV.STUCK && A.why[i] === 1) {
      if (waterDepthAt(A.x[i], A.z[i], A.y[i]) < 0.2) { clearStuck(i); A.st[i] = EV.MOVE; enterGraph(i); colorDirty = true; }
    }
    drawPerson(i, colorDirty);
    if (colorDirty) { evMesh.instanceColor.needsUpdate = true; colorDirty = false; }
  }
  evMesh.instanceMatrix.needsUpdate = true;
  for (const s of EVAC.shelters) s.count = 0;
  for (let i = 0; i < EVAC.n; i++) if (A.st[i] === EV.DONE && A.shelter[i] >= 0) EVAC.shelters[A.shelter[i]].count++;
  EVAC.flowT -= dt;
  if (EVAC.flowT <= 0) { EVAC.flowT = 0.5; paintRouteLines(); }
  const m = evacMetrics();
  if (!EVAC.run.done && m.wait === 0 && m.moving === 0 && m.carried === 0 && !(m.stuck && rescueBusy())) finishRun('완료');
  else if (!EVAC.run.done && S.time - EVAC.run.start > EV_LIMIT) finishRun('시간 초과');
  updateShelterVisuals();
}

function updateShelterVisuals() {
  const show = EVAC.active || EVAC.preview;
  const kind = EVAC.active ? EVAC.kind : EVAC.previewKind;
  for (const s of EVAC.shelters) {
    const on = show && s.kinds.includes(kind);
    s.group.visible = on;
    if (!on) continue;
    s.mat.color.copy(s.open || !EVAC.active ? EV_OPEN_COL : EV_SHUT_COL);
    s.mat.opacity = (s.open || !EVAC.active ? 0.32 : 0.14) * (s.enabled ? 1 : 0.4) + 0.06 * Math.sin(S.real * 3);
  }
  if (evLines) evLines.visible = EVAC.active && S.routeView;
}

function updateEvacLabels(w, h, proj) {
  const kind = EVAC.active ? EVAC.kind : EVAC.previewKind;
  for (const s of EVAC.shelters) {
    const on = S.labels && (EVAC.active || EVAC.preview) && s.kinds.includes(kind);
    if (!on) { if (!s.el.hidden) s.el.hidden = true; continue; }
    proj.set(s.x, s.y + (s.b ? 30 : 36), s.z).project(camera);
    if (proj.z > 1 || Math.abs(proj.x) > 1.05 || Math.abs(proj.y) > 1.05) { s.el.hidden = true; continue; }
    s.el.hidden = false;
    const txt = EVAC.active ? `${s.name} · ${s.count}명${s.open ? '' : ' · 닫힘'}` : s.name;
    if (s.el.textContent !== txt) s.el.textContent = txt;
    s.el.dataset.open = s.open || !EVAC.active ? '1' : '0';
    s.el.style.transform = `translate(${((proj.x + 1) / 2) * w}px, ${((1 - proj.y) / 2) * h}px) translate(-50%, -100%)`;
  }
}

function resetEvacuation() {
  if (EVAC.active && EVAC.run && !EVAC.run.done) EVAC.run.done = true;
  EVAC.active = false; EVAC.run = null; EVAC.route = null; EVAC.kindId = null; EVAC.kind = null;
  EVAC.flow.fill(0);
  EVAC.fireNear.fill(0); EVAC.firePts = [];
  for (const s of EVAC.shelters) { s.count = 0; s.open = true; s.reason = ''; }
  for (let i = 0; i < EVAC.n; i++) {
    A.x[i] = A.hx[i]; A.z[i] = A.hz[i]; A.y[i] = H(A.x[i], A.z[i]);
    A.st[i] = EV.IDLE; A.exposed[i] = 0; A.final[i] = 0; A.node[i] = -1; A.edge[i] = -1; A.shelter[i] = -1;
    A.everStuck[i] = 0; A.stuckT[i] = 0; A.why[i] = 0; A.rescued[i] = 0; A.rescueWait[i] = 0; A.rescuer[i] = -1;
    drawPerson(i, true);
  }
  evMesh.instanceMatrix.needsUpdate = true;
  evMesh.instanceColor.needsUpdate = true;
  if (evLines) evLines.visible = false;
  resetRescue();
  if (typeof onEvacChange === 'function') onEvacChange();
}
