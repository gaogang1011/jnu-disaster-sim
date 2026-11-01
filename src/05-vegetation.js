const TREE_MAX = IS_MOBILE ? 4200 : 7600;
const T = {
  n: 0,
  x: new Float32Array(TREE_MAX), z: new Float32Array(TREE_MAX), y: new Float32Array(TREE_MAX), s: new Float32Array(TREE_MAX),
  rot: new Float32Array(TREE_MAX), sp: new Uint8Array(TREE_MAX), st: new Uint8Array(TREE_MAX), fuel: new Float32Array(TREE_MAX),
  burnT: new Float32Array(TREE_MAX), tilt: new Float32Array(TREE_MAX), tiltT: new Float32Array(TREE_MAX),
  tdx: new Float32Array(TREE_MAX), tdz: new Float32Array(TREE_MAX), wet: new Float32Array(TREE_MAX), idx: new Uint16Array(TREE_MAX),
  col: new Float32Array(TREE_MAX * 3), lean: new Uint8Array(TREE_MAX)
};
const TREE_U = { uWind: { value: new THREE.Vector2() }, uTime: { value: 0 }, uGust: { value: 0 } };

function mergeGeos(list) {
  const geos = list.map(g => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

const conCrownGeo = mergeGeos([
  new THREE.ConeGeometry(2.6, 6.4, 8).translate(0, 4.6, 0),
  new THREE.ConeGeometry(1.95, 5, 8).translate(0, 7.5, 0),
  new THREE.ConeGeometry(1.2, 3.6, 8).translate(0, 10.1, 0)
]);
const conTrunkGeo = new THREE.CylinderGeometry(0.2, 0.34, 3.4, 6).translate(0, 1.7, 0);
const brCrownGeo = (() => {
  const g = new THREE.IcosahedronGeometry(3.3, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.82 + 0.36 * vnoise2(x * 0.9 + z * 0.3 + 5, y * 0.9 - z * 0.5 + 9);
    p.setXYZ(i, x * k, y * k * 0.82, z * k);
  }
  g.computeVertexNormals();
  g.translate(0, 5.7, 0);
  return g;
})();
const brTrunkGeo = new THREE.CylinderGeometry(0.26, 0.4, 4.4, 6).translate(0, 2.2, 0);

function swayMaterial(color) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0 });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, TREE_U);
    sh.vertexShader = 'uniform vec2 uWind; uniform float uTime; uniform float uGust;\n' + sh.vertexShader.replace('#include <project_vertex>', `
      vec4 mvPosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
        float hgt = max(mvPosition.y - instanceMatrix[3].y, 0.0);
        float ph = dot(instanceMatrix[3].xz, vec2(0.071, 0.113));
        vec2 sw = uWind * 0.0016 * (0.7 + 0.3 * sin(uTime * 1.3 + ph)) + vec2(sin(uTime * 2.1 + ph), cos(uTime * 1.7 + ph * 1.3)) * (0.0012 + uGust * 0.012);
        mvPosition.xz += sw * hgt * hgt * 0.35;
      #endif
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;`);
  };
  return m;
}
const crownMat = swayMaterial(new THREE.Color(1, 1, 1));
const trunkMat = swayMaterial(C('#4a3a2b'));
let conCrown, conTrunk, brCrown, brTrunk;
const TREE_GRID = new Map();
const TG = 10;
function gridKey(x, z) { return Math.floor((x + 900) / TG) + Math.floor((z + 900) / TG) * 200; }

function placeTrees() {
  const r = mulberry32(21);
  const cand = [];
  const step = 6.3;
  for (let z = -845; z < 845; z += step) for (let x = -845; x < 845; x += step) {
    const px = x + (r() - 0.5) * step * 0.9, pz = z + (r() - 0.5) * step * 0.9;
    const c = classAt(px, pz);
    let p = 0;
    if (c === CLS.forest) p = 0.86;
    else if (c === CLS.open) p = 0.045;
    else if (c === CLS.grass) p = 0.05;
    else if (c === CLS.village) p = 0.07;
    else if (c === CLS.field) p = 0.004;
    if (r() < p) cand.push({ x: px, z: pz, sp: c === CLS.forest ? (r() < 0.62 ? 0 : 1) : (r() < 0.3 ? 0 : 1), kind: c === CLS.forest ? 'forest' : 'open' });
  }
  for (const [type, pts] of DATA.R) {
    if (type !== 'service' && type !== 'tertiary') continue;
    const w = ROAD_W[type];
    for (const [x, z, a] of polyline(pts, 11)) {
      for (const side of [-1, 1]) {
        const ox = x + Math.cos(a + Math.PI / 2) * side * (w / 2 + 2.7), oz = z + Math.sin(a + Math.PI / 2) * side * (w / 2 + 2.7);
        const c = classAt(ox, oz);
        if (c === CLS.road || c === CLS.building || c === CLS.parking || c === CLS.sport || c === CLS.water) continue;
        if (type !== 'tertiary' && !pointInPoly(ox, oz, DATA.campus)) continue;
        if (r() < 0.72) cand.push({ x: ox, z: oz, sp: 1, kind: 'road' });
      }
    }
  }
  for (const [a, b] of WINDBREAKS) {
    for (const [x, z] of polyline([a, b], 4.4)) {
      const c = classAt(x, z);
      if (c === CLS.road || c === CLS.building || c === CLS.water) continue;
      cand.push({ x: x + (r() - 0.5), z: z + (r() - 0.5), sp: 0, kind: 'wind' });
    }
  }
  const inC = [], outC = [];
  for (const c of cand) (pointInPoly(c.x, c.z, DATA.campus) ? inC : outC).push(c);
  for (const list of [inC, outC]) for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = list[i]; list[i] = list[j]; list[j] = t; }
  const chosen = inC.slice(0, TREE_MAX).concat(outC.slice(0, Math.max(0, TREE_MAX - inC.length)));
  const conPal = ['#2c4a2c', '#335230', '#294428', '#3a5734'].map(C);
  const brPal = ['#4a6a35', '#557838', '#3f5f2f', '#5d7a3c', '#4d6b33'].map(C);
  const autPal = ['#8c7a30', '#a2672b', '#7d5a28', '#9a8a3a', '#b0602a'].map(C);
  const windPal = ['#263d27', '#2a4229'].map(C);
  let nc = 0, nb = 0;
  chosen.forEach((c, i) => {
    T.x[i] = c.x; T.z[i] = c.z; T.y[i] = H(c.x, c.z) - 0.2;
    T.sp[i] = c.sp;
    T.rot[i] = r() * TAU;
    T.s[i] = c.kind === 'wind' ? 0.95 + r() * 0.35 : c.sp === 0 ? 0.7 + r() * 0.55 : 0.7 + r() * 0.5;
    T.idx[i] = c.sp === 0 ? nc++ : nb++;
    let col;
    if (c.kind === 'wind') col = windPal[Math.floor(r() * windPal.length)];
    else if (c.sp === 0) col = conPal[Math.floor(r() * conPal.length)];
    else if (r() < (c.kind === 'road' ? 0.42 : 0.12)) col = autPal[Math.floor(r() * autPal.length)];
    else col = brPal[Math.floor(r() * brPal.length)];
    const v = 0.85 + r() * 0.3;
    T.col[i * 3] = col.r * v; T.col[i * 3 + 1] = col.g * v; T.col[i * 3 + 2] = col.b * v;
  });
  T.n = chosen.length;
  conCrown = new THREE.InstancedMesh(conCrownGeo, crownMat, Math.max(1, nc));
  conTrunk = new THREE.InstancedMesh(conTrunkGeo, trunkMat, Math.max(1, nc));
  brCrown = new THREE.InstancedMesh(brCrownGeo, crownMat, Math.max(1, nb));
  brTrunk = new THREE.InstancedMesh(brTrunkGeo, trunkMat, Math.max(1, nb));
  for (const m of [conCrown, conTrunk, brCrown, brTrunk]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); }
  for (let i = 0; i < T.n; i++) {
    setTreeInst(i);
    setTreeColor(i, T.col[i * 3], T.col[i * 3 + 1], T.col[i * 3 + 2]);
    const k = gridKey(T.x[i], T.z[i]);
    let cell = TREE_GRID.get(k);
    if (!cell) TREE_GRID.set(k, (cell = []));
    cell.push(i);
  }
  for (const m of [conCrown, conTrunk, brCrown, brTrunk]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
}

const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), taxis = new V3();
let treeDirty = false, treeColDirty = false;
function setTreeInst(i) {
  const s = T.s[i];
  qa.setFromAxisAngle(UP, T.rot[i]);
  if (T.tilt[i] > 0.001) { taxis.set(T.tdz[i], 0, -T.tdx[i]).normalize(); qb.setFromAxisAngle(taxis, T.tilt[i]); qa.premultiply(qb); }
  const gone = T.st[i] === 3;
  const wind = T.sp[i] === 0 ? 0.85 : 1;
  tmpM.compose(tmpV.set(T.x[i], T.y[i], T.z[i]), qa, gone ? tmpV2.set(0.0001, 0.0001, 0.0001) : tmpV2.set(s, s, s));
  (T.sp[i] === 0 ? conTrunk : brTrunk).setMatrixAt(T.idx[i], tmpM);
  const burnt = T.st[i] === 2;
  tmpM.compose(tmpV, qa, gone ? tmpV2.set(0.0001, 0.0001, 0.0001) : burnt ? tmpV2.set(s * 0.7 * wind, s * 0.62, s * 0.7 * wind) : tmpV2.set(s * wind, s, s * wind));
  (T.sp[i] === 0 ? conCrown : brCrown).setMatrixAt(T.idx[i], tmpM);
  treeDirty = true;
}
const tcol = new THREE.Color();
function setTreeColor(i, r, g, b) {
  tcol.setRGB(r, g, b);
  (T.sp[i] === 0 ? conCrown : brCrown).setColorAt(T.idx[i], tcol);
  treeColDirty = true;
}

function treesNear(x, z, r) {
  const out = [];
  const g0 = Math.floor((x - r + 900) / TG), g1 = Math.floor((x + r + 900) / TG);
  const h0 = Math.floor((z - r + 900) / TG), h1 = Math.floor((z + r + 900) / TG);
  const r2 = r * r;
  for (let gj = h0; gj <= h1; gj++) for (let gi = g0; gi <= g1; gi++) {
    const cell = TREE_GRID.get(gi + gj * 200);
    if (!cell) continue;
    for (const i of cell) { const dx = T.x[i] - x, dz = T.z[i] - z; if (dx * dx + dz * dz < r2) out.push(i); }
  }
  return out;
}

const burningTrees = new Set();
function igniteTree(i) {
  if (T.st[i] !== 0 || T.wet[i] > 0) return false;
  T.st[i] = 1;
  T.fuel[i] = 7 + Math.random() * 7;
  T.burnT[i] = 0;
  burningTrees.add(i);
  return true;
}
function tipTree(i, dx, dz, amount) {
  if (T.st[i] === 3) return;
  const l = Math.hypot(dx, dz) || 1;
  const a = amount === undefined ? rand(1.2, 1.5) : amount;
  if (a <= T.tiltT[i]) return;
  T.tdx[i] = dx / l; T.tdz[i] = dz / l;
  T.tiltT[i] = a;
  tippingSet.add(i);
}
function destroyTree(i) {
  if (T.st[i] === 3) return;
  T.st[i] = 3;
  burningTrees.delete(i);
  setTreeInst(i);
}
const tippingSet = new Set();
let burntMarks = [];

function updateTrees(dt) {
  TREE_U.uTime.value = S.time;
  TREE_U.uWind.value.copy(S.wind);
  TREE_U.uGust.value = S.gust;
  for (const i of tippingSet) {
    const d = T.tiltT[i] - T.tilt[i];
    T.tilt[i] += d * damp(T.tiltT[i] > 1 ? 3.5 : 6, dt) + Math.sign(d) * dt * 0.4;
    if (Math.abs(T.tiltT[i] - T.tilt[i]) < 0.01) { T.tilt[i] = T.tiltT[i]; tippingSet.delete(i); }
    setTreeInst(i);
  }
  const nb = burningTrees.size;
  const emitP = Math.min(1, 260 / Math.max(1, nb)) * FX_BUDGET.fire;
  for (const i of burningTrees) {
    T.burnT[i] += dt;
    T.fuel[i] -= dt * (T.wet[i] > 0 ? 5 : 1) * (S.storm > 0.4 ? 2.2 : 1);
    const k = Math.min(1, T.burnT[i] / 3);
    if (Math.random() < emitP) {
      const h = T.s[i] * (T.sp[i] === 0 ? 10 : 7.5);
      const n = Math.floor(dt * 30 * k + Math.random());
      for (let q = 0; q < n; q++) emitFlame(T.x[i] + rand(-1.5, 1.5) * T.s[i], T.y[i] + h * rand(0.25, 0.95), T.z[i] + rand(-1.5, 1.5) * T.s[i], S.wind.x * 0.3, rand(2, 5), S.wind.y * 0.3, rand(1.6, 3.6) * T.s[i]);
      if (Math.random() < dt * 2.5 * FX_BUDGET.smoke) emitSmoke(T.x[i], T.y[i] + h, T.z[i], S.wind.x * 0.7, rand(4, 7), S.wind.y * 0.7, rand(4, 8), 0.1, 0.095, 0.09, rand(5, 9), 0.6);
    }
    const ci = i * 3, cb = Math.min(1, T.burnT[i] / 8);
    setTreeColor(i, lerp(T.col[ci], 0.025, cb), lerp(T.col[ci + 1], 0.02, cb), lerp(T.col[ci + 2], 0.018, cb));
    if (T.fuel[i] <= 0) {
      T.st[i] = 2;
      burningTrees.delete(i);
      setTreeColor(i, 0.02, 0.018, 0.016);
      setTreeInst(i);
      burntMarks.push(i);
    }
  }
  for (let i = 0; i < T.n; i++) if (T.wet[i] > 0) T.wet[i] -= dt;
  if (burntMarks.length > 20 || (burntMarks.length && Math.random() < dt * 2)) {
    for (const i of burntMarks) markBurnt(T.x[i], T.z[i], 4 + T.s[i] * 3);
    burntMarks = [];
  }
  if (treeDirty) { for (const m of [conCrown, conTrunk, brCrown, brTrunk]) m.instanceMatrix.needsUpdate = true; treeDirty = false; }
  if (treeColDirty) { for (const m of [conCrown, brCrown]) if (m.instanceColor) m.instanceColor.needsUpdate = true; treeColDirty = false; }
}

function spreadTreeFire() {
  if (!burningTrees.size) return;
  const P = S.firePower || 5;
  const R = 6.5 + P * 0.55 + S.wind.length() * 0.25;
  const wl = S.wind.length() || 1, wx = S.wind.x / wl, wz = S.wind.y / wl, wk = Math.min(1, S.wind.length() / 8);
  const rainK = S.storm > 0.4 ? 0.18 : 1;
  const list = [...burningTrees];
  const sample = list.length > 500 ? list.filter(() => Math.random() < 500 / list.length) : list;
  const scale = list.length / sample.length;
  for (const i of sample) {
    if (T.burnT[i] < 1.5) continue;
    const near = treesNear(T.x[i], T.z[i], R * (1 + wk * 0.6));
    for (const j of near) {
      if (T.st[j] !== 0) continue;
      const dx = T.x[j] - T.x[i], dz = T.z[j] - T.z[i], d = Math.hypot(dx, dz) || 1;
      const align = (dx * wx + dz * wz) / d;
      const reach = R * (1 + wk * 0.6 * align);
      if (d > reach) continue;
      const p = 0.11 * (1 - d / reach) * (0.6 + P * 0.08) * (1 + align * wk * 0.8) * rainK * Math.min(2, scale);
      if (Math.random() < p) igniteTree(j);
    }
    if (Math.random() < 0.05 * rainK) {
      for (const s of segsNear(T.x[i], T.z[i], 10)) if (segDist(s, T.x[i], T.z[i]) < 6 && Math.random() < 0.25) igniteSeg(s);
    }
  }
}

function resetTrees() {
  burningTrees.clear(); tippingSet.clear(); burntMarks = [];
  for (let i = 0; i < T.n; i++) {
    T.st[i] = 0; T.fuel[i] = 0; T.burnT[i] = 0; T.tilt[i] = 0; T.tiltT[i] = 0; T.wet[i] = 0;
    T.y[i] = H(T.x[i], T.z[i]) - 0.2;
    setTreeInst(i);
    setTreeColor(i, T.col[i * 3], T.col[i * 3 + 1], T.col[i * 3 + 2]);
  }
}

let lampMesh, lampHead, lampGlow;
const LAMPS = [];
const LAMP_U = { uNight: { value: 0 }, uScale: POINT_SCALE };
function placeLamps() {
  const r = mulberry32(31);
  for (const [type, pts] of DATA.R) {
    if (type !== 'service' && type !== 'tertiary') continue;
    const w = ROAD_W[type];
    let k = 0;
    for (const [x, z, a] of polyline(pts, 30)) {
      if (!pointInPoly(x, z, DATA.campus) && type !== 'tertiary') continue;
      const side = k++ % 2 ? 1 : -1;
      const ox = x + Math.cos(a + Math.PI / 2) * side * (w / 2 + 0.8), oz = z + Math.sin(a + Math.PI / 2) * side * (w / 2 + 0.8);
      if (classAt(ox, oz) === CLS.building) continue;
      LAMPS.push({ x: ox, z: oz, y: H(ox, oz), a: a + (side > 0 ? -Math.PI / 2 : Math.PI / 2) });
      if (LAMPS.length > 420) break;
    }
  }
  const n = LAMPS.length;
  lampMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.12, 7.5, 6).translate(0, 3.75, 0), new THREE.MeshStandardMaterial({ color: C('#5c6266'), roughness: 0.6, metalness: 0.4 }), n);
  const headMat = new THREE.MeshStandardMaterial({ color: C('#d9d9d4'), emissive: C('#ffd59a'), emissiveIntensity: 0, roughness: 0.5 });
  lampHead = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.22, 0.45).translate(0.5, 7.5, 0), headMat, n);
  const gp = new Float32Array(n * 3);
  LAMPS.forEach((l, i) => {
    tmpQ.setFromAxisAngle(UP, -l.a);
    tmpM.compose(tmpV.set(l.x, l.y, l.z), tmpQ, tmpV2.set(1, 1, 1));
    lampMesh.setMatrixAt(i, tmpM);
    lampHead.setMatrixAt(i, tmpM);
    gp[i * 3] = l.x + Math.cos(l.a) * 1.0; gp[i * 3 + 1] = l.y + 7.3; gp[i * 3 + 2] = l.z + Math.sin(l.a) * 1.0;
  });
  lampMesh.castShadow = true;
  scene.add(lampMesh, lampHead);
  lampHead.userData.mat = headMat;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(gp, 3));
  lampGlow = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: LAMP_U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float uScale; uniform float uNight; varying float vA; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vA = uNight; gl_PointSize = 6.0 * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = pow(max(0.0, 1.0 - d * 2.0), 2.6) * vA * 0.5; if (a < 0.005) discard; gl_FragColor = vec4(vec3(1.0, 0.78, 0.48) * 1.6, a); }`
  }));
  lampGlow.frustumCulled = false;
  scene.add(lampGlow);
}
function updateLamps() {
  const on = smooth(0.2, 0.6, S.night);
  LAMP_U.uNight.value = on;
  if (lampHead) lampHead.userData.mat.emissiveIntensity = on * 2.2;
}
