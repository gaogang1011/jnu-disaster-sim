const FLOOR_H = 3.7, BAY = 3.6;
function mkCanvas(n) { const c = document.createElement('canvas'); c.width = c.height = n; return c; }
const LIT_COLS = ['#ffd49a', '#ffe6bf', '#fff2dc', '#dfe9ff', '#ffc57a', '#f7dcae'];

function facadeSet(style, seed) {
  const N = 512, T = 128, rng = mulberry32(seed);
  const ca = mkCanvas(N), ce = mkCanvas(N), cr = mkCanvas(N);
  const A = ca.getContext('2d'), E = ce.getContext('2d'), R = cr.getContext('2d');
  E.fillStyle = '#000'; E.fillRect(0, 0, N, N);
  R.fillStyle = 'rgb(228,228,228)'; R.fillRect(0, 0, N, N);
  const wall = { punched: '#dcdbd8', ribbon: '#d5d5d2', brick: '#9a5a43', curtain: '#33404b', stone: '#e3dfd5', dorm: '#e1ddd3', basalt: '#4a4846', house: '#dfdbd3' }[style];
  A.fillStyle = wall; A.fillRect(0, 0, N, N);
  for (let i = 0; i < 2600; i++) {
    A.fillStyle = rng() < 0.5 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.04)';
    A.fillRect(rng() * N, rng() * N, 2 + rng() * 7, 2 + rng() * 7);
  }
  if (style === 'brick') {
    for (let y = 0; y < N; y += 8) {
      A.fillStyle = 'rgba(205,190,170,0.55)'; A.fillRect(0, y, N, 1.5);
      for (let x = (y / 8) % 2 ? 0 : 10; x < N; x += 20) { A.fillRect(x, y, 1.5, 8); }
      for (let x = 0; x < N; x += 20) { A.fillStyle = `rgba(${rng() < 0.5 ? '60,20,10' : '200,120,90'},${0.08 + rng() * 0.1})`; A.fillRect(x + ((y / 8) % 2 ? 0 : 10), y + 1.5, 18.5, 6.5); }
    }
  }
  if (style === 'basalt') {
    for (let i = 0; i < 900; i++) {
      const x = rng() * N, y = rng() * N, w = 10 + rng() * 22, h = 7 + rng() * 12;
      A.fillStyle = `rgb(${58 + rng() * 26},${56 + rng() * 24},${54 + rng() * 22})`;
      A.beginPath(); A.ellipse(x, y, w / 2, h / 2, rng() * 0.5, 0, TAU); A.fill();
      A.strokeStyle = 'rgba(25,24,23,0.6)'; A.lineWidth = 1.2; A.stroke();
    }
  }
  if (style === 'stone') {
    A.strokeStyle = 'rgba(150,145,135,0.5)'; A.lineWidth = 1;
    for (let y = 0; y < N; y += 32) { A.beginPath(); A.moveTo(0, y); A.lineTo(N, y); A.stroke(); }
    for (let x = 0; x < N; x += 64) { A.beginPath(); A.moveTo(x, 0); A.lineTo(x, N); A.stroke(); }
  }
  const glass = (x, y, w, h) => {
    const g = A.createLinearGradient(x, y, x + w * 0.7, y + h);
    const b = rng() < 0.3 ? 34 : 26;
    g.addColorStop(0, `rgb(${b + 34},${b + 44},${b + 54})`);
    g.addColorStop(0.5, `rgb(${b},${b + 10},${b + 20})`);
    g.addColorStop(1, `rgb(${b - 8},${b},${b + 6})`);
    A.fillStyle = g; A.fillRect(x, y, w, h);
    if (rng() < 0.32) { A.fillStyle = 'rgba(222,212,188,0.8)'; A.fillRect(x, y, w, h * (0.2 + rng() * 0.55)); }
    R.fillStyle = 'rgb(38,38,38)'; R.fillRect(x, y, w, h);
  };
  const light = (x, y, w, h, p) => {
    if (rng() < p) {
      E.fillStyle = LIT_COLS[Math.floor(rng() * LIT_COLS.length)];
      E.globalAlpha = 0.55 + rng() * 0.45;
      E.fillRect(x, y, w, h);
      E.globalAlpha = 1;
    }
  };
  const frame = (x, y, w, h, c, t) => { A.strokeStyle = c; A.lineWidth = t; A.strokeRect(x, y, w, h); R.strokeStyle = 'rgb(150,150,150)'; R.lineWidth = t; R.strokeRect(x, y, w, h); };
  for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
    const ox = tx * T, oy = ty * T;
    if (style === 'punched') {
      glass(ox + 22, oy + 24, 84, 68); frame(ox + 22, oy + 24, 84, 68, '#c9c8c4', 4);
      A.fillStyle = '#b9b8b3'; A.fillRect(ox + 18, oy + 94, 92, 5);
      light(ox + 22, oy + 24, 84, 68, 0.5);
    } else if (style === 'ribbon') {
      glass(ox, oy + 28, T, 64);
      A.fillStyle = '#5b6064'; for (let m = 0; m < 4; m++) A.fillRect(ox + m * 32, oy + 28, 3, 64);
      A.fillStyle = '#bdbdba'; A.fillRect(ox, oy + 122, T, 6);
      light(ox, oy + 28, 64, 64, 0.45); light(ox + 64, oy + 28, 64, 64, 0.45);
    } else if (style === 'brick') {
      glass(ox + 26, oy + 26, 76, 64); frame(ox + 26, oy + 26, 76, 64, '#ebe6dd', 5);
      A.fillStyle = '#cfcac0'; A.fillRect(ox + 22, oy + 92, 84, 6);
      light(ox + 26, oy + 26, 76, 64, 0.5);
    } else if (style === 'curtain') {
      for (let py = 0; py < 2; py++) for (let px = 0; px < 2; px++) { glass(ox + px * 64, oy + py * 58, 64, 58); light(ox + px * 64, oy + py * 58, 64, 58, 0.5); }
      A.fillStyle = '#6a7076';
      A.fillRect(ox, oy, 4, T); A.fillRect(ox + 62, oy, 4, T); A.fillRect(ox, oy + 56, T, 3);
      A.fillStyle = '#262b30'; A.fillRect(ox, oy + 116, T, 12);
      R.fillStyle = 'rgb(120,120,120)'; R.fillRect(ox, oy + 116, T, 12);
    } else if (style === 'stone') {
      glass(ox + 34, oy + 14, 60, 88); frame(ox + 34, oy + 14, 60, 88, '#55595c', 4);
      light(ox + 34, oy + 14, 60, 88, 0.45);
    } else if (style === 'dorm') {
      glass(ox + 12, oy + 28, 46, 60); glass(ox + 70, oy + 28, 46, 60);
      frame(ox + 12, oy + 28, 46, 60, '#f1eee8', 3); frame(ox + 70, oy + 28, 46, 60, '#f1eee8', 3);
      A.fillStyle = 'rgba(70,72,75,0.55)'; for (let x = 0; x < T; x += 6) A.fillRect(ox + x, oy + 90, 1.5, 14);
      A.fillStyle = '#f3f0ea'; A.fillRect(ox, oy + 88, T, 3); A.fillRect(ox, oy + 104, T, 10);
      if (rng() < 0.4) { A.fillStyle = '#cfcfcb'; A.fillRect(ox + 54, oy + 94, 14, 9); }
      light(ox + 12, oy + 28, 46, 60, 0.62); light(ox + 70, oy + 28, 46, 60, 0.62);
    } else if (style === 'basalt') {
      glass(ox + 46, oy + 28, 36, 54); frame(ox + 46, oy + 28, 36, 54, '#2a2928', 4);
      light(ox + 46, oy + 28, 36, 54, 0.35);
    } else {
      glass(ox + 30, oy + 32, 68, 52); frame(ox + 30, oy + 32, 68, 52, '#f4f1ea', 4);
      light(ox + 30, oy + 32, 68, 52, 0.55);
    }
  }
  for (let i = 0; i < 40; i++) {
    const x = rng() * N, w = 2 + rng() * 6;
    const g = A.createLinearGradient(0, 0, 0, N);
    g.addColorStop(0, 'rgba(40,36,30,0.07)'); g.addColorStop(1, 'rgba(40,36,30,0)');
    A.fillStyle = g; A.fillRect(x, 0, w, N * (0.3 + rng() * 0.7));
  }
  const mk = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(0.25, 0.25);
    t.anisotropy = 4;
    if (srgb) t.encoding = THREE.sRGBEncoding;
    return t;
  };
  return { map: mk(ca, true), emissiveMap: mk(ce, true), roughnessMap: mk(cr, false) };
}

const FACADES = {};
['punched', 'ribbon', 'brick', 'curtain', 'stone', 'dorm', 'basalt', 'house'].forEach((s, i) => { FACADES[s] = facadeSet(s, 100 + i * 17); });
const roofTex = (() => {
  const c = mkCanvas(256), A = c.getContext('2d'), r = mulberry32(3);
  A.fillStyle = '#8e8d88'; A.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3000; i++) { A.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'; A.fillRect(r() * 256, r() * 256, 1 + r() * 4, 1 + r() * 4); }
  A.strokeStyle = 'rgba(60,60,58,0.35)'; A.lineWidth = 1;
  for (let x = 0; x < 256; x += 64) { A.beginPath(); A.moveTo(x, 0); A.lineTo(x, 256); A.stroke(); A.beginPath(); A.moveTo(0, x); A.lineTo(256, x); A.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 16, 1 / 16); t.encoding = THREE.sRGBEncoding;
  return t;
})();

const STYLE_TINTS = {
  punched: ['#ece7dd', '#e2dacb', '#e8e5df', '#d8d2c7'], ribbon: ['#e1e0da', '#e6e0d4', '#d4d8d9'], brick: ['#ffffff', '#f2e8e2'],
  curtain: ['#ffffff', '#e8f0f5'], stone: ['#f2eee6'], dorm: ['#f1e8d8', '#ebe3d4', '#f3efe7'], basalt: ['#ffffff'], house: ['#f1ebe1', '#e6dccc', '#f4f1eb', '#dccfbb']
};
const STRUCT = { punched: 1, ribbon: 0.95, brick: 1.05, curtain: 0.8, stone: 1.15, dorm: 0.95, basalt: 1.3, house: 0.6 };
const SOOT = C('#2a2522'), ROOF_BASE = C('#ffffff'), RUBBLE = C('#5d5751');

function buildingSpec(name, lv, area) {
  const has = s => name.includes(s);
  let levels = lv || 0, style = 'punched', h = 0;
  if (has('생활관')) { style = 'dorm'; levels = lv || (has('6호관') ? 9 : has('5호관') ? 8 : has('4호관') ? 7 : has('2호관') ? 6 : 5); }
  else if (has('인재양성관')) { style = 'dorm'; levels = 5; }
  else if (has('도서관')) { style = 'curtain'; levels = has('디지털') ? 4 : 5; }
  else if (has('아라뮤즈홀')) { style = 'curtain'; h = 21; }
  else if (has('체육관')) { style = 'ribbon'; h = 17; }
  else if (has('박물관')) { style = 'basalt'; h = 10; levels = 2; }
  else if (has('본관')) { style = 'stone'; levels = 5; }
  else if (has('공과대학')) { style = has('부설공장') ? 'ribbon' : 'brick'; levels = has('부설공장') ? 2 : 5; if (has('부설공장')) h = 10; }
  else if (has('카카오')) { style = 'curtain'; levels = 4; }
  else if (has('야외음악당')) { style = 'stone'; h = 7; }
  else if (has('제일조은빌')) { style = 'house'; levels = 4; }
  else if (['주택', '상가', '편의점', '식당', '민가', '마을회관', 'KBS'].some(has)) { style = 'house'; levels = lv || 2; }
  else {
    style = ['punched', 'ribbon', 'brick', 'punched', 'stone'][hashStr(name) % 5];
    levels = lv || (area > 2600 ? 5 : area > 1300 ? 4 : 3);
  }
  if (has('의과대학')) levels = 6;
  if (has('공동실험실습관') || has('친환경') || has('원자력') || has('감귤')) levels = lv || 3;
  if (has('음악관') || has('조소') || has('골프') || has('미술관') || has('게스트하우스') || has('효담')) levels = 3;
  if (has('부속 건물') || has('관리동')) levels = 2;
  const height = h || levels * FLOOR_H + 1.4;
  return { levels: levels || Math.max(1, Math.round(height / FLOOR_H)), height, style };
}

function makeUVGen(g0, pcx, pcz) {
  return {
    generateTopUV(geo, v, a, b, c) {
      return [new THREE.Vector2(v[a * 3], v[a * 3 + 1]), new THREE.Vector2(v[b * 3], v[b * 3 + 1]), new THREE.Vector2(v[c * 3], v[c * 3 + 1])];
    },
    generateSideWallUV(geo, v, a, b, c, d) {
      const ax = v[a * 3] + pcx, ay = v[a * 3 + 1] - pcz, az = v[a * 3 + 2];
      const bx = v[b * 3] + pcx, by = v[b * 3 + 1] - pcz, bz = v[b * 3 + 2];
      const cz = v[c * 3 + 2], dz = v[d * 3 + 2];
      let dx = bx - ax, dy = by - ay;
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const ua = (ax * dx + ay * dy) / BAY, ub = (bx * dx + by * dy) / BAY;
      return [new THREE.Vector2(ua, (az - g0) / FLOOR_H), new THREE.Vector2(ub, (bz - g0) / FLOOR_H), new THREE.Vector2(ub, (cz - g0) / FLOOR_H), new THREE.Vector2(ua, (dz - g0) / FLOOR_H)];
    }
  };
}

const BLD = [], SEGS = [], SEG_MESHES = [];
const ROOFBOX_MAX = 900;
const roofBoxes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: C('#b9bab6'), roughness: 0.7, metalness: 0.2 }), ROOFBOX_MAX);
roofBoxes.castShadow = true; roofBoxes.receiveShadow = true;
roofBoxes.count = 0;
scene.add(roofBoxes);
const roofBoxData = [];

function addRoofBox(seg, x, y, z, sx, sy, sz, rot) {
  if (roofBoxes.count >= ROOFBOX_MAX) return;
  const id = roofBoxes.count++;
  tmpQ.setFromAxisAngle(UP, rot);
  tmpM.compose(tmpV.set(x, y + sy / 2, z), tmpQ, tmpV2.set(sx, sy, sz));
  roofBoxes.setMatrixAt(id, tmpM);
  roofBoxData.push({ x, y, z, sx, sy, sz, rot });
  seg.roofIds.push(id);
}

function buildCampus() {
  DATA.B.forEach(([name, lv, poly], bi) => {
    const area = Math.abs(polyArea(poly));
    const sp = buildingSpec(name, lv, area);
    let gMin = Infinity, gSum = 0, n = 0;
    for (const q of poly) { const h = H(q[0], q[1]); if (h < gMin) gMin = h; gSum += h; n++; }
    const c = polyCentroid(poly);
    const hc = H(c[0], c[1]); gSum += hc * 2; n += 2; if (hc < gMin) gMin = hc;
    const yGround = gSum / n, yBottom = gMin - 2.5, yTop = yGround + sp.height;
    const tints = STYLE_TINTS[sp.style];
    const tint = C(tints[hashStr(name + bi) % tints.length]);
    const b = { id: bi, name, levels: sp.levels, height: sp.height, style: sp.style, poly, cx: c[0], cz: c[1], area, yGround, yBottom, yTop, segs: [], tint, axis: polyAxis(poly) };
    const pieces = area > 520 ? segmentPolygon(poly, 26) : [poly];
    for (const piece of pieces) makeSegment(b, piece);
    for (const s of b.segs) for (const t of b.segs) if (s !== t && Math.hypot(s.cx - t.cx, s.cz - t.cz) < 42) s.nb.push(t);
    BLD.push(b);
  });
  roofBoxes.instanceMatrix.needsUpdate = true;
}

function makeSegment(b, piece) {
  const pc = polyCentroid(piece);
  const shape = new THREE.Shape(piece.map(([x, z]) => new THREE.Vector2(x - pc[0], -(z - pc[1]))));
  const total = b.yTop - b.yBottom, g0 = b.yGround - b.yBottom;
  let geo;
  try {
    geo = new THREE.ExtrudeGeometry(shape, { depth: total, bevelEnabled: false, UVGenerator: makeUVGen(g0, pc[0], pc[1]) });
  } catch (e) { return; }
  geo.rotateX(-Math.PI / 2);
  const f = FACADES[b.style];
  const wallMat = new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.emissiveMap, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0, roughnessMap: f.roughnessMap, roughness: 1, metalness: 0.05, color: b.tint.clone(), });
  const roofMat = new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.92, metalness: 0, color: ROOF_BASE.clone() });
  const mesh = new THREE.Mesh(geo, [roofMat, wallMat]);
  mesh.position.set(pc[0], b.yBottom, pc[1]);
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
  const area = Math.abs(polyArea(piece));
  const maxHp = 100 * (0.75 + Math.sqrt(area) / 45) * STRUCT[b.style];
  const seg = {
    b, mesh, wallMat, roofMat, poly: piece, cx: pc[0], cz: pc[1], area, r: Math.sqrt(area / Math.PI),
    maxHp, hp: maxHp, state: 0, fire: 0, fuel: 0, burnT: 0, powered: 1, soot: 0,
    tiltX: 0, tiltZ: 0, swayX: 0, swayZ: 0, colT: 0, colDur: 2.5, colDir: new V3(), targetScale: 0.15,
    roofIds: [], nb: [], wet: 0, flick: Math.random() * 10, quakeDmg: 0
  };
  mesh.userData.seg = seg;
  b.segs.push(seg); SEGS.push(seg); SEG_MESHES.push(mesh);
  const rr = mulberry32(hashStr(b.name) + b.segs.length);
  const nBox = clamp(Math.floor(area / 380), 0, 4);
  const bb = polyBBox(piece);
  for (let i = 0, tries = 0; i < nBox && tries < 40; tries++) {
    const x = bb.x0 + rr() * bb.w, z = bb.z0 + rr() * bb.h;
    if (!pointInPoly(x, z, piece)) continue;
    let edge = Infinity;
    for (let k = 0; k < piece.length; k++) { const a = piece[k], c2 = piece[(k + 1) % piece.length]; edge = Math.min(edge, distToSeg(x, z, a[0], a[1], c2[0], c2[1])); }
    if (edge < 3) continue;
    const big = i === 0 && b.segs.length === 1 && area > 250;
    if (big) addRoofBox(seg, x, b.yTop, z, 4.5, 3.2, 4.5, b.axis);
    else addRoofBox(seg, x, b.yTop, z, 2 + rr() * 1.4, 1.2 + rr() * 0.6, 1.4 + rr() * 1, b.axis);
    i++;
  }
}

function segState(seg) {
  if (seg.state === 2) return '붕괴';
  if (seg.state === 1) return '붕괴 중';
  if (seg.fire === 1) return '화재';
  if (seg.fire === 2) return '전소';
  if (seg.hp < seg.maxHp * 0.999) return '손상';
  return '정상';
}
function buildingInfo(b) {
  let hp = 0, tot = 0, burning = 0, col = 0, dmg = 0;
  for (const s of b.segs) {
    tot += s.area;
    hp += s.area * (s.state === 2 ? 0 : Math.max(0, s.hp) / s.maxHp);
    if (s.fire === 1) burning++;
    if (s.state >= 1) col += s.area;
    if (s.hp < s.maxHp * 0.999 || s.fire) dmg++;
  }
  const integrity = tot ? hp / tot : 1;
  let state = '정상';
  if (col / tot > 0.5) state = '붕괴';
  else if (col > 0) state = '부분 붕괴';
  else if (burning) state = '화재';
  else if (dmg) state = '손상';
  return { integrity, state, burning };
}

function refreshSeg(seg) {
  const k = 1 - Math.max(seg.hp, 0) / seg.maxHp;
  const soot = Math.max(seg.soot, k * 0.5);
  if (seg.state === 2) {
    seg.wallMat.color.copy(seg.b.tint).lerp(RUBBLE, 0.75).lerp(SOOT, seg.soot * 0.6);
    seg.roofMat.color.copy(RUBBLE).lerp(SOOT, seg.soot * 0.5);
  } else {
    seg.wallMat.color.copy(seg.b.tint).lerp(SOOT, soot);
    seg.roofMat.color.copy(ROOF_BASE).lerp(SOOT, soot * 0.9);
  }
  if (k > 0.3) seg.powered = 0;
  if (k > 0.45 && !seg.tilted) {
    seg.tilted = true;
    seg.tiltX = rand(-0.025, 0.025); seg.tiltZ = rand(-0.025, 0.025);
  }
}

const dmgListeners = [];
function damageSeg(seg, amount, dir, cause) {
  if (seg.state !== 0 || amount <= 0) return;
  seg.hp -= amount;
  if (seg.hp <= 0) collapseSeg(seg, dir || new V3(rand(-1, 1), 0, rand(-1, 1)).normalize(), cause);
  else refreshSeg(seg);
  for (const f of dmgListeners) f(seg);
}

function collapseSeg(seg, dir, cause) {
  if (seg.state !== 0) return;
  seg.state = 1;
  seg.hp = 0;
  seg.powered = 0;
  seg.colT = 0;
  seg.colDur = 1.6 + Math.min(2.2, (seg.b.yTop - seg.b.yGround) / 12);
  seg.colDir.copy(dir).setY(0);
  if (seg.colDir.lengthSq() < 0.01) seg.colDir.set(rand(-1, 1), 0, rand(-1, 1));
  seg.colDir.normalize();
  const total = seg.b.yTop - seg.b.yBottom, g0 = seg.b.yGround - seg.b.yBottom;
  seg.targetScale = clamp((g0 + 2.2) / total, 0.05, 0.6);
  seg.debrisAcc = 0;
  for (const id of seg.roofIds) { tmpM.makeScale(0, 0, 0); roofBoxes.setMatrixAt(id, tmpM); }
  roofBoxes.instanceMatrix.needsUpdate = true;
  dustRing(seg.cx, seg.b.yGround, seg.cz, seg.r * 1.4, Math.min(70, 20 + seg.area / 25));
  if (typeof sfx !== 'undefined') sfx.collapse(seg.cx, seg.b.yGround, seg.cz, Math.min(1, seg.area / 900));
  logEvent(`${seg.b.name} ${seg.b.segs.length > 1 ? '일부 ' : ''}붕괴`, 'crit', seg.b.name);
  later(0.9, () => {
    for (const n of seg.nb) if (n.state === 0) damageSeg(n, n.maxHp * rand(0.12, 0.4), seg.colDir, 'progressive');
  });
}

function igniteSeg(seg, quiet) {
  if (seg.fire !== 0) return false;
  if (seg.wet > 0) return false;
  seg.fire = 1;
  seg.fuel = 26 + Math.sqrt(seg.area) * 1.3;
  seg.burnT = 0;
  if (!quiet) logEvent(`${seg.b.name} 화재 발생`, 'fire', seg.b.name);
  return true;
}

function randomFacadePoint(seg, out) {
  const p = seg.poly, n = p.length;
  const i = Math.floor(Math.random() * n), a = p[i], c = p[(i + 1) % n];
  const t = Math.random();
  const x = a[0] + (c[0] - a[0]) * t, z = a[1] + (c[1] - a[1]) * t;
  let nx = c[1] - a[1], nz = -(c[0] - a[0]);
  const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
  if (pointInPoly(x + nx * 1.5, z + nz * 1.5, p)) { nx = -nx; nz = -nz; }
  const top = seg.state === 2 ? seg.b.yGround + 2 : seg.b.yGround + (seg.b.yTop - seg.b.yGround) * seg.mesh.scale.y;
  out.set(x + nx * 0.6, lerp(seg.b.yGround + 1, top - 0.5, Math.random()), z + nz * 0.6);
  out.nx = nx; out.nz = nz;
  return out;
}

const fpt = new V3();
function updateBuildings(dt) {
  const night = S.night;
  for (const seg of SEGS) {
    const m = seg.mesh;
    if (seg.state === 1) {
      seg.colT += dt;
      const p = Math.min(1, seg.colT / seg.colDur), e = p * p;
      m.scale.y = lerp(1, seg.targetScale, e);
      m.rotation.x = seg.tiltX + seg.colDir.z * 0.1 * e;
      m.rotation.z = seg.tiltZ - seg.colDir.x * 0.1 * e;
      seg.debrisAcc += dt * Math.min(30, 6 + seg.area / 40);
      while (seg.debrisAcc > 1) {
        seg.debrisAcc--;
        randomFacadePoint(seg, fpt);
        spawnDebris(fpt.x, fpt.y, fpt.z, fpt.nx * rand(1, 6) + seg.colDir.x * rand(0, 5), rand(-2, 4), fpt.nz * rand(1, 6) + seg.colDir.z * rand(0, 5), rand(0.6, 2.4), seg.wallMat.color);
      }
      if (Math.random() < dt * 14) {
        randomFacadePoint(seg, fpt);
        emitSmoke(fpt.x, seg.b.yGround + rand(0, 6), fpt.z, fpt.nx * rand(3, 9), rand(1, 4), fpt.nz * rand(3, 9), rand(6, 14), 0.62, 0.58, 0.52, rand(4, 8), 0.6);
      }
      if (p >= 1) {
        seg.state = 2;
        m.rotation.x = seg.tiltX + seg.colDir.z * 0.05;
        m.rotation.z = seg.tiltZ - seg.colDir.x * 0.05;
        refreshSeg(seg);
        for (let i = 0; i < Math.min(26, 6 + seg.area / 60); i++) {
          const x = seg.cx + rand(-1, 1) * seg.r, z = seg.cz + rand(-1, 1) * seg.r;
          spawnDebris(x, seg.b.yGround + rand(2, 6), z, rand(-2, 2), 0, rand(-2, 2), rand(1.2, 3.4), seg.wallMat.color);
        }
      }
    } else if (seg.state === 0) {
      m.rotation.x = seg.tiltX + seg.swayX;
      m.rotation.z = seg.tiltZ + seg.swayZ;
    }
    seg.swayX *= Math.exp(-dt * 4); seg.swayZ *= Math.exp(-dt * 4);
    if (seg.wet > 0) seg.wet -= dt;
    if (seg.fire === 1) {
      seg.burnT += dt;
      seg.fuel -= dt * (seg.wet > 0 ? 6 : 1) * (S.storm > 0.4 ? 2.5 : 1);
      const big = Math.min(1, seg.burnT / 6);
      const rate = (8 + seg.area / 50) * (0.4 + big * 0.6) * FX_BUDGET.fire;
      let n = Math.floor(rate * dt + Math.random());
      while (n-- > 0) {
        randomFacadePoint(seg, fpt);
        emitFlame(fpt.x, fpt.y, fpt.z, fpt.nx * 1.5, rand(2, 5), fpt.nz * 1.5, rand(2.2, 4.8));
      }
      if (seg.burnT > 4 && Math.random() < dt * 6 * big) {
        const x = seg.cx + rand(-0.6, 0.6) * seg.r, z = seg.cz + rand(-0.6, 0.6) * seg.r;
        const top = seg.state === 2 ? seg.b.yGround + 2 : seg.b.yGround + (seg.b.yTop - seg.b.yGround) * m.scale.y;
        emitFlame(x, top + 0.5, z, 0, rand(3, 7), 0, rand(4, 8));
      }
      if (Math.random() < dt * (3 + seg.area / 300) * FX_BUDGET.smoke) {
        const top = seg.b.yGround + (seg.b.yTop - seg.b.yGround) * m.scale.y;
        emitSmoke(seg.cx + rand(-0.5, 0.5) * seg.r, top + 2, seg.cz + rand(-0.5, 0.5) * seg.r, S.wind.x * 0.6, rand(5, 9), S.wind.y * 0.6, rand(6, 12), 0.09, 0.085, 0.08, rand(7, 12), 0.75);
      }
      seg.soot = Math.min(0.9, seg.soot + dt * 0.02);
      if (seg.state === 0) damageSeg(seg, dt * (1.0 + big * 1.6), null, 'fire');
      if (seg.fuel <= 0) { seg.fire = 2; seg.soot = Math.max(seg.soot, 0.8); seg.powered = 0; refreshSeg(seg); }
      const fl = 0.75 + 0.25 * Math.sin(S.time * 17 + seg.flick) * Math.sin(S.time * 7.3 + seg.flick * 2);
      seg.wallMat.emissive.setRGB(1, 0.42, 0.12);
      seg.wallMat.emissiveIntensity = (1.4 + night * 1.8) * fl * big;
    } else {
      seg.wallMat.emissive.setRGB(1, 1, 1);
      seg.wallMat.emissiveIntensity = night * 1.35 * seg.powered * (seg.state === 0 ? 1 : 0);
    }
  }
}

function spreadBuildingFire() {
  const wl = S.wind.length() || 1;
  for (const seg of SEGS) {
    if (seg.fire !== 1) continue;
    const p = S.storm > 0.4 ? 0.05 : 0.2;
    const k = Math.min(1, seg.burnT / 6);
    for (const n of seg.nb) if (n.fire === 0 && Math.random() < p * k) igniteSeg(n, true);
    if (seg.burnT > 3) {
      const near = treesNear(seg.cx, seg.cz, seg.r + 12 + wl * 0.8);
      for (const t of near) if (Math.random() < 0.14 * k) igniteTree(t);
      if (Math.random() < 0.1 * k) {
        for (const o of segsNear(seg.cx + S.wind.x * 2, seg.cz + S.wind.y * 2, 22)) {
          if (o.b === seg.b || o.fire !== 0) continue;
          if (segDist(o, seg.cx, seg.cz) < seg.r + 14 && Math.random() < 0.25) igniteSeg(o);
        }
      }
    }
  }
}

function resetBuildings() {
  for (const seg of SEGS) {
    Object.assign(seg, { hp: seg.maxHp, state: 0, fire: 0, fuel: 0, burnT: 0, powered: 1, soot: 0, tiltX: 0, tiltZ: 0, swayX: 0, swayZ: 0, colT: 0, wet: 0, tilted: false, quakeDmg: 0 });
    seg.mesh.scale.set(1, 1, 1);
    seg.mesh.rotation.set(0, 0, 0);
    seg.wallMat.color.copy(seg.b.tint);
    seg.roofMat.color.copy(ROOF_BASE);
    seg.wallMat.emissive.setRGB(1, 1, 1);
  }
  roofBoxData.forEach((r, id) => {
    tmpQ.setFromAxisAngle(UP, r.rot);
    tmpM.compose(tmpV.set(r.x, r.y + r.sy / 2, r.z), tmpQ, tmpV2.set(r.sx, r.sy, r.sz));
    roofBoxes.setMatrixAt(id, tmpM);
  });
  roofBoxes.instanceMatrix.needsUpdate = true;
}

function segsNear(x, z, r) {
  const out = [];
  for (const s of SEGS) if (Math.hypot(s.cx - x, s.cz - z) < r + s.r * 1.6) out.push(s);
  return out;
}
function segDist(seg, x, z) { return distToPoly(x, z, seg.poly); }

const windmill = (() => {
  const [x, z] = DATA.P.windmill;
  const y = H(x, z);
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const mat = new THREE.MeshStandardMaterial({ color: C('#eef0f1'), roughness: 0.5, metalness: 0.2 });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.4, 30, 14), mat);
  tower.position.y = 15; tower.castShadow = true;
  const nac = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 4.5), mat);
  nac.position.set(0, 30.5, 0); nac.castShadow = true;
  const rotor = new THREE.Group();
  rotor.position.set(0, 30.5, -2.6);
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.9, 13, 0.25), mat);
    blade.position.y = 6.5;
    const arm = new THREE.Group(); arm.rotation.z = (i * TAU) / 3; arm.add(blade);
    rotor.add(arm);
  }
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), mat);
  rotor.add(hub);
  g.add(tower, nac, rotor);
  scene.add(g);
  return { g, rotor, x, z, y, broken: false, fall: 0, fallDir: new V3(), spin: 0 };
})();
function updateWindmill(dt) {
  const w = windmill;
  if (w.broken) {
    if (w.fall < 1) {
      w.fall = Math.min(1, w.fall + dt * 0.7);
      const e = w.fall * w.fall;
      w.g.rotation.x = w.fallDir.z * 1.5 * e;
      w.g.rotation.z = -w.fallDir.x * 1.5 * e;
      if (w.fall >= 1) { dustRing(w.x + w.fallDir.x * 25, w.y, w.z + w.fallDir.z * 25, 12, 30); addShake(0.5); }
    }
    return;
  }
  const ws = S.wind.length();
  w.spin = lerp(w.spin, Math.min(6, 0.6 + ws * 0.12), damp(1, dt));
  w.rotor.rotation.z += w.spin * dt;
  w.g.rotation.y = Math.atan2(S.wind.x, S.wind.y);
}
function breakWindmill(dir) {
  if (windmill.broken) return;
  windmill.broken = true;
  windmill.fallDir.copy(dir).setY(0).normalize();
  windmill.g.rotation.y = 0;
  logEvent('풍력 발전기 쓰러짐', 'crit');
}
function resetWindmill() {
  windmill.broken = false; windmill.fall = 0; windmill.g.rotation.set(0, 0, 0);
}
