const ELEV = (() => {
  const rows = DATA.ELEV.split(';').map(r => r.split(',').map(Number));
  const G = rows.length;
  const out = rows.map(r => r.slice());
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    let s = 0, w = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const jj = clamp(j + dj, 0, G - 1), ii = clamp(i + di, 0, G - 1);
      const k = (di === 0 ? 2 : 1) * (dj === 0 ? 2 : 1);
      s += rows[jj][ii] * k; w += k;
    }
    out[j][i] = s / w;
  }
  return out;
})();
const EG = ELEV.length, EEXT = 850, ESTEP = 1700 / (EG - 1);

function elevAt(i, j) { return ELEV[clamp(j, 0, EG - 1)][clamp(i, 0, EG - 1)]; }
function cubicI(p0, p1, p2, p3, t) { return p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0))); }
function elevBicubic(x, z) {
  const fx = (x + EEXT) / ESTEP, fz = (z + EEXT) / ESTEP;
  const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
  const r0 = cubicI(elevAt(ix - 1, iz - 1), elevAt(ix, iz - 1), elevAt(ix + 1, iz - 1), elevAt(ix + 2, iz - 1), tx);
  const r1 = cubicI(elevAt(ix - 1, iz), elevAt(ix, iz), elevAt(ix + 1, iz), elevAt(ix + 2, iz), tx);
  const r2 = cubicI(elevAt(ix - 1, iz + 1), elevAt(ix, iz + 1), elevAt(ix + 1, iz + 1), elevAt(ix + 2, iz + 1), tx);
  const r3 = cubicI(elevAt(ix - 1, iz + 2), elevAt(ix, iz + 2), elevAt(ix + 1, iz + 2), elevAt(ix + 2, iz + 2), tx);
  return cubicI(r0, r1, r2, r3, tz);
}

function baseHeight(x, z) {
  let h = elevBicubic(x, z);
  const dx = x - DATA.P.gwonje[0], dz = z - DATA.P.gwonje[1];
  h += 15 * Math.exp(-(dx * dx + dz * dz) / (100 * 100));
  h += (fbm2(x * 0.016 + 7.3, z * 0.016 - 3.1, 3) - 0.5) * 2.2;
  return h;
}

const SUMMIT = { x: -3041, z: 10316 };
function regionalH(x, z) {
  const dx = (x - SUMMIT.x) / 2.1, dz = z - SUMMIT.z;
  const r = Math.sqrt(dx * dx + dz * dz) / 1000;
  let e = r < 17.5 ? 1900 * Math.pow(1 - r / 17.5, 1.95) : -(r - 17.5) * 70;
  const rr = Math.hypot(x - SUMMIT.x, z - SUMMIT.z);
  e += 120 * Math.exp(-((rr / 1500) ** 2)) - 150 * Math.exp(-((rr / 260) ** 4));
  return e - 240;
}
const OREUMS = [];
(() => {
  const r = mulberry32(42);
  let tries = 0;
  while (OREUMS.length < 52 && tries++ < 800) {
    const a = r() * TAU, d = 1500 + r() * 12500;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.hypot(x - SUMMIT.x, z - SUMMIT.z) < 2600) continue;
    if (regionalH(x, z) < -215) continue;
    OREUMS.push({ x, z, h: 30 + r() * 100, r: 190 + r() * 380, crater: r() < 0.45 });
  }
})();
function oreumH(x, z) {
  let s = 0;
  for (const o of OREUMS) {
    const dx = x - o.x, dz = z - o.z, d2 = dx * dx + dz * dz;
    if (d2 > o.r * o.r) continue;
    const t = Math.sqrt(d2) / o.r;
    let h = o.h * Math.pow(1 - t * t, 1.4);
    if (o.crater) h -= o.h * 0.35 * Math.exp(-((t / 0.28) ** 2));
    s += h;
  }
  return s;
}
function outerH(x, z) {
  const qx = clamp(x, -EEXT, EEXT), qz = clamp(z, -EEXT, EEXT);
  const d = Math.hypot(x - qx, z - qz);
  const corr = baseHeight(qx, qz) - regionalH(qx, qz);
  let h = regionalH(x, z) + corr * Math.exp(-d / 1400) + oreumH(x, z) * smooth(0, 700, d);
  if (h < -238) h = -238 - (-238 - h) * 1.8;
  return h;
}

const TN = IS_MOBILE ? 240 : 340;
const TEXT = 850, TD = 1700 / TN, TW = TN + 1;
const TH = new Float32Array(TW * TW), TH0 = new Float32Array(TW * TW);
for (let j = 0; j < TW; j++) for (let i = 0; i < TW; i++) TH0[j * TW + i] = baseHeight(-TEXT + i * TD, -TEXT + j * TD);
TH.set(TH0);

function H(x, z) {
  if (x > -TEXT && x < TEXT && z > -TEXT && z < TEXT) {
    const fx = (x + TEXT) / TD, fz = (z + TEXT) / TD;
    const i = Math.min(Math.floor(fx), TN - 1), j = Math.min(Math.floor(fz), TN - 1);
    const tx = fx - i, tz = fz - j, k = j * TW + i;
    return (TH[k] * (1 - tx) + TH[k + 1] * tx) * (1 - tz) + (TH[k + TW] * (1 - tx) + TH[k + TW + 1] * tx) * tz;
  }
  return outerH(x, z);
}

const tPos = new Float32Array(TW * TW * 3), tNor = new Float32Array(TW * TW * 3), tUv = new Float32Array(TW * TW * 2);
for (let j = 0; j < TW; j++) for (let i = 0; i < TW; i++) {
  const k = j * TW + i;
  tPos[k * 3] = -TEXT + i * TD; tPos[k * 3 + 1] = TH[k]; tPos[k * 3 + 2] = -TEXT + j * TD;
  tUv[k * 2] = i / TN; tUv[k * 2 + 1] = 1 - j / TN;
}
function computeTerrainNormals(i0, j0, i1, j1) {
  i0 = clamp(i0, 0, TN); i1 = clamp(i1, 0, TN); j0 = clamp(j0, 0, TN); j1 = clamp(j1, 0, TN);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const k = j * TW + i;
    const hl = TH[j * TW + Math.max(i - 1, 0)], hr = TH[j * TW + Math.min(i + 1, TN)];
    const hu = TH[Math.max(j - 1, 0) * TW + i], hd = TH[Math.min(j + 1, TN) * TW + i];
    let nx = hl - hr, ny = 2 * TD, nz = hu - hd;
    const l = Math.hypot(nx, ny, nz);
    tNor[k * 3] = nx / l; tNor[k * 3 + 1] = ny / l; tNor[k * 3 + 2] = nz / l;
  }
}
computeTerrainNormals(0, 0, TN, TN);
const tIdx = new Uint32Array(TN * TN * 6);
{
  let p = 0;
  for (let j = 0; j < TN; j++) for (let i = 0; i < TN; i++) {
    const a = j * TW + i, b = a + 1, c = a + TW, d = c + 1;
    tIdx[p++] = a; tIdx[p++] = c; tIdx[p++] = b;
    tIdx[p++] = b; tIdx[p++] = c; tIdx[p++] = d;
  }
}
const terrGeo = new THREE.BufferGeometry();
terrGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
terrGeo.setAttribute('normal', new THREE.BufferAttribute(tNor, 3));
terrGeo.setAttribute('uv', new THREE.BufferAttribute(tUv, 2));
terrGeo.setIndex(new THREE.BufferAttribute(tIdx, 1));
terrGeo.computeBoundingSphere();

const GRES = IS_MOBILE ? 1536 : 2048;
const GSC = GRES / 1700;
const GC = document.createElement('canvas'); GC.width = GC.height = GRES;
const gctx = GC.getContext('2d');
const GC0 = document.createElement('canvas'); GC0.width = GC0.height = GRES;
const groundTex = new THREE.CanvasTexture(GC);
groundTex.encoding = THREE.sRGBEncoding;
groundTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
let groundDirty = false, groundTimer = 0;

const TERR_U = {
  uWater: { value: new THREE.Vector2(-999, -999) },
  uMarker: { value: new THREE.Vector4(0, 0, 0, 0) },
  uMarker2: { value: new THREE.Vector4(0, 0, 0, 0) },
  uMarkerCol: { value: C('#ffb347') },
  uTargets: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
  uQuake: { value: new THREE.Vector4(0, 0, 0, 0) },
  uQuakeK: { value: new THREE.Vector4(260, 70, 400, 0) },
  uTime: { value: 0 }
};
const terrMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.96, metalness: 0 });
terrMat.onBeforeCompile = sh => {
  Object.assign(sh.uniforms, TERR_U);
  sh.vertexShader = 'uniform vec4 uQuake; uniform vec4 uQuakeK; varying vec3 vWPos;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    vec4 wp0 = modelMatrix * vec4(transformed, 1.0);
    if (uQuake.z > 0.0) {
      float qd = distance(wp0.xz, uQuake.xy);
      float front = uQuake.w * uQuakeK.x;
      float env = exp(-qd / uQuakeK.z) * smoothstep(front + 50.0, front - 30.0, qd);
      transformed.y += uQuake.z * env * sin((qd - front) * 6.2831 / uQuakeK.y);
    }
    vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
  sh.fragmentShader = 'uniform vec2 uWater; uniform vec4 uMarker; uniform vec4 uMarker2; uniform vec3 uMarkerCol; uniform vec4 uTargets[4]; uniform float uTime; varying vec3 vWPos;\n' +
    sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
    if (vWPos.y < uWater.y && vWPos.z < uWater.x) {
      float wd = uWater.y - vWPos.y;
      diffuseColor.rgb *= mix(1.0, 0.5, smoothstep(0.0, 1.2, wd));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.13, 0.09), 0.35 * smoothstep(0.0, 2.0, wd));
    }
    if (uMarker.w > 0.0) {
      float md = distance(vWPos.xz, uMarker.xy);
      float mw = max(1.1, uMarker.z * 0.022);
      float ring = 1.0 - smoothstep(mw * 0.45, mw * 1.15, abs(md - uMarker.z));
      float fill = (1.0 - smoothstep(uMarker.z - mw, uMarker.z, md)) * 0.12;
      diffuseColor.rgb = mix(diffuseColor.rgb, uMarkerCol, clamp(ring * 0.95 + fill, 0.0, 1.0) * uMarker.w);
    }
    if (uMarker2.w > 0.0) {
      float md2 = distance(vWPos.xz, uMarker2.xy);
      float ang = atan(vWPos.z - uMarker2.y, vWPos.x - uMarker2.x);
      float dash = step(0.5, fract(ang * uMarker2.z / 14.0));
      float mw2 = max(0.9, uMarker2.z * 0.012);
      float ring2 = (1.0 - smoothstep(mw2 * 0.45, mw2 * 1.15, abs(md2 - uMarker2.z))) * dash;
      diffuseColor.rgb = mix(diffuseColor.rgb, uMarkerCol, ring2 * 0.75 * uMarker2.w);
    }
    for (int ti = 0; ti < 4; ti++) {
      vec4 tg = uTargets[ti];
      if (tg.w > 0.0) {
        float td = distance(vWPos.xz, tg.xy);
        float pulse = 0.5 + 0.5 * sin(uTime * 11.0 + float(ti));
        float tr = tg.z * (0.55 + 0.45 * pulse);
        float trw = max(1.0, tg.z * 0.04);
        float tring = 1.0 - smoothstep(trw * 0.5, trw * 1.3, abs(td - tr));
        float tcross = (1.0 - smoothstep(0.6, 1.4, min(abs(vWPos.x - tg.x), abs(vWPos.z - tg.y)))) * (1.0 - smoothstep(tg.z * 0.25, tg.z * 0.35, td));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.12, 0.05), clamp(tring + tcross, 0.0, 1.0) * tg.w);
      }
    }`);
};
const terrain = new THREE.Mesh(terrGeo, terrMat);
terrain.receiveShadow = true;
scene.add(terrain);

{
  const sk = [];
  const edges = [];
  for (let i = 0; i < TW; i++) edges.push([i, 0]);
  for (let j = 0; j < TW; j++) edges.push([TN, j]);
  for (let i = TN; i >= 0; i--) edges.push([i, TN]);
  for (let j = TN; j >= 0; j--) edges.push([0, j]);
  const pos = [], uv = [], idx = [];
  edges.forEach(([i, j], n) => {
    const k = j * TW + i;
    pos.push(tPos[k * 3], tPos[k * 3 + 1], tPos[k * 3 + 2], tPos[k * 3], tPos[k * 3 + 1] - 45, tPos[k * 3 + 2]);
    uv.push(i / TN, 1 - j / TN, i / TN, 1 - j / TN);
    if (n > 0) { const a = (n - 1) * 2, b = n * 2; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const skirt = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: C('#4c5236'), side: THREE.DoubleSide }));
  scene.add(skirt);
  sk.push(skirt);
}

function outerAxis() {
  const inner = [];
  for (let v = -850; v <= 850.001; v += 25) inner.push(v);
  const pos = [];
  let d = 24, p = 850;
  while (p < 26000) { p += d; d *= 1.06; pos.push(p); }
  return [...pos.map(v => -v).reverse(), ...inner, ...pos];
}
function outerColor(x, z, h, out) {
  const e = h + 240;
  const n1 = fbm2(x * 0.0009 + 11, z * 0.0009 - 4, 4), n2 = vnoise2(x * 0.004, z * 0.004);
  let c;
  if (e < 4) c = [0.42, 0.40, 0.36];
  else if (e > 1820) c = [0.42, 0.39, 0.33];
  else if (e > 1350) c = n1 > 0.5 ? [0.50, 0.36, 0.20] : [0.46, 0.42, 0.25];
  else if (e > 520) c = n2 > 0.6 ? [0.24, 0.30, 0.17] : [0.17, 0.25, 0.14];
  else {
    const urban = z < -1500 && e < 250 && Math.abs(x) < 11000 ? smooth(0.42, 0.62, n1 + (250 - e) / 500) : 0;
    const farm = n2 > 0.55 ? [0.40, 0.40, 0.24] : n2 > 0.3 ? [0.30, 0.36, 0.18] : [0.24, 0.31, 0.16];
    c = [lerp(farm[0], 0.44, urban), lerp(farm[1], 0.42, urban), lerp(farm[2], 0.40, urban)];
  }
  const s = 0.86 + n2 * 0.2;
  out[0] = c[0] * c[0] * s; out[1] = c[1] * c[1] * s; out[2] = c[2] * c[2] * s;
}
const outer = (() => {
  const ax = outerAxis(), n = ax.length;
  const pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3);
  const tmp = [0, 0, 0];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = ax[i], z = ax[j], k = (j * n + i) * 3;
    const inside = Math.abs(x) < 849.9 && Math.abs(z) < 849.9;
    const onEdge = !inside && Math.abs(x) <= 850.01 && Math.abs(z) <= 850.01;
    const h = inside ? baseHeight(x, z) - 10 : onEdge ? baseHeight(x, z) - 0.3 : outerH(x, z);
    pos[k] = x; pos[k + 1] = h; pos[k + 2] = z;
    outerColor(x, z, h, tmp);
    col[k] = tmp[0]; col[k + 1] = tmp[1]; col[k + 2] = tmp[2];
  }
  const idx = [];
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.receiveShadow = false;
  scene.add(m);
  return m;
})();

const seaMat = new THREE.MeshStandardMaterial({ color: C('#1d3e56'), roughness: 0.25, metalness: 0.1 });
const sea = new THREE.Mesh(new THREE.PlaneGeometry(200000, 200000), seaMat);
sea.rotation.x = -Math.PI / 2;
sea.position.y = -240;
scene.add(sea);

const CITY_U = { uNight: { value: 0 }, uFogC: { value: scene.fog.color }, uFogD: { value: 0.00005 } };
const cityLights = (() => {
  const r = mulberry32(77);
  const pos = [], col = [], sz = [];
  let tries = 0;
  while (pos.length < 5200 * 3 && tries++ < 60000) {
    const x = (r() - 0.5) * 20000, z = -1400 - r() * 6600;
    const e = outerH(x, z) + 240;
    if (e < 3 || e > 240) continue;
    const dens = fbm2(x * 0.0011 + 3, z * 0.0011, 3) + (240 - e) / 420;
    if (r() > smooth(0.5, 0.85, dens)) continue;
    pos.push(x, outerH(x, z) + 4, z);
    const w = r();
    const c = w < 0.6 ? [1, 0.72, 0.42] : w < 0.85 ? [1, 0.9, 0.75] : [0.75, 0.85, 1];
    col.push(c[0], c[1], c[2]);
    sz.push(1.2 + r() * 2.2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(sz, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: CITY_U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec3 aColor; attribute float aSize; uniform float uNight; uniform float uFogD; varying vec3 vC; varying float vA;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = -mv.z; vC = aColor; vA = uNight * exp(-uFogD * uFogD * d * d * 0.35);
        gl_PointSize = aSize; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC * 1.6, a); }`
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  scene.add(p);
  return p;
})();

function worldCtx(ctx, s) { ctx.setTransform(s, 0, 0, s, 850 * s, 850 * s); }
function pathPoly(ctx, p) { ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.closePath(); }
function pathLine(ctx, p) { ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]); }

const ROAD_W = { secondary: 13, tertiary: 11, residential: 7, service: 6.5, aisle: 5.5, footway: 2.6, steps: 3.4, path: 2.2 };
const CAR_ROADS = new Set(['secondary', 'tertiary', 'residential', 'service']);

const PARCELS = [], WINDBREAKS = [];
(() => {
  const r = mulberry32(9);
  const NX = 26, NZ = 30, SX = 1700 / NX, SZ = 1700 / NZ;
  const P = [];
  for (let j = 0; j <= NZ; j++) {
    P.push([]);
    for (let i = 0; i <= NX; i++) {
      const edge = i === 0 || j === 0 || i === NX || j === NZ;
      P[j].push([-850 + i * SX + (edge ? 0 : (r() - 0.5) * SX * 0.45), -850 + j * SZ + (edge ? 0 : (r() - 0.5) * SZ * 0.45)]);
    }
  }
  const pal = ['#6f7d3f', '#7d8a4a', '#8b7a52', '#9a8a5e', '#5f7436', '#a49d74', '#86703f', '#6a7a45', '#b2a47a', '#768a3a'];
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const q = [P[j][i], P[j][i + 1], P[j + 1][i + 1], P[j + 1][i]];
    const c = polyCentroid(q);
    if (pointInPoly(c[0], c[1], DATA.campus)) continue;
    if (r() < 0.35) {
      const m1 = [(q[0][0] + q[1][0]) / 2, (q[0][1] + q[1][1]) / 2], m2 = [(q[3][0] + q[2][0]) / 2, (q[3][1] + q[2][1]) / 2];
      PARCELS.push({ p: [q[0], m1, m2, q[3]], c: pick(pal) }, { p: [m1, q[1], q[2], m2], c: pick(pal) });
    } else PARCELS.push({ p: q, c: pal[Math.floor(r() * pal.length)] });
    if (r() < 0.22) WINDBREAKS.push([q[0], q[1]]);
    if (r() < 0.16) WINDBREAKS.push([q[1], q[2]]);
  }
})();

function canopy(ctx, poly, base, pal, dens, rng) {
  ctx.save();
  pathPoly(ctx, poly);
  ctx.clip();
  ctx.fillStyle = base;
  ctx.fill();
  const bb = polyBBox(poly);
  const n = Math.min(26000, Math.floor((bb.w * bb.h) / dens));
  for (let i = 0; i < n; i++) {
    const x = bb.x0 + rng() * bb.w, z = bb.z0 + rng() * bb.h;
    const rad = 1.4 + rng() * 2.6;
    ctx.fillStyle = 'rgba(12,18,10,0.35)';
    ctx.beginPath(); ctx.arc(x + 0.5, z - 0.9, rad, 0, TAU); ctx.fill();
    ctx.fillStyle = pal[Math.floor(rng() * pal.length)];
    ctx.beginPath(); ctx.arc(x, z, rad, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function lawn(ctx, poly, base, rng, stripes) {
  ctx.save();
  pathPoly(ctx, poly);
  ctx.clip();
  ctx.fillStyle = base;
  ctx.fill();
  const bb = polyBBox(poly);
  const n = Math.floor((bb.w * bb.h) / 260);
  for (let i = 0; i < n; i++) {
    const x = bb.x0 + rng() * bb.w, z = bb.z0 + rng() * bb.h;
    ctx.fillStyle = rng() < 0.5 ? 'rgba(255,255,220,0.05)' : 'rgba(20,30,0,0.06)';
    ctx.beginPath(); ctx.ellipse(x, z, 4 + rng() * 10, 3 + rng() * 7, rng() * 3, 0, TAU); ctx.fill();
  }
  if (stripes) {
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let x = bb.x0; x < bb.x1; x += 10) ctx.fillRect(x, bb.z0, 5, bb.h);
  }
  ctx.restore();
}

function polyAxis(poly) {
  let best = 0, ang = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > best) { best = l; ang = Math.atan2(b[1] - a[1], b[0] - a[0]); }
  }
  return ang;
}

function paintGround() {
  const ctx = gctx, rng = mulberry32(5);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#6e7646';
  ctx.fillRect(0, 0, GRES, GRES);
  worldCtx(ctx, GSC);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const pc of PARCELS) {
    pathPoly(ctx, pc.p);
    ctx.fillStyle = pc.c; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(40,30,10,0.12)'; ctx.lineWidth = 0.6;
    const ang = rng() * Math.PI, bb = polyBBox(pc.p), cx = (bb.x0 + bb.x1) / 2, cz = (bb.z0 + bb.z1) / 2;
    ctx.translate(cx, cz); ctx.rotate(ang);
    for (let o = -90; o < 90; o += 3.2) { ctx.beginPath(); ctx.moveTo(-90, o); ctx.lineTo(90, o); ctx.stroke(); }
    ctx.restore();
    pathPoly(ctx, pc.p);
    ctx.strokeStyle = '#3d3a35'; ctx.lineWidth = 1.1; ctx.stroke();
  }
  const villages = [[-740, -200, 120], [-760, 570, 110], [-650, 805, 130], [-200, 712, 70], [-395, 805, 60], [790, 470, 90], [-830, 270, 50]];
  for (const [x, z, r] of villages) {
    const g = ctx.createRadialGradient(x, z, 0, x, z, r);
    g.addColorStop(0, 'rgba(140,134,118,0.85)'); g.addColorStop(0.7, 'rgba(140,134,118,0.55)'); g.addColorStop(1, 'rgba(140,134,118,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, z, r, 0, TAU); ctx.fill();
  }
  const woodPal = ['#2d4326', '#364f2c', '#3f5a30', '#2a3d24', '#46613a'];
  lawn(ctx, DATA.campus, '#6b7d44', rng, false);
  for (const [kind, , p] of DATA.A) {
    if (kind === 'polytech') lawn(ctx, p, '#6e7f46', rng, false);
  }
  for (const [kind, , p] of DATA.A) {
    if (kind === 'wood') canopy(ctx, p, '#253820', woodPal, 7, rng);
    else if (kind === 'forest') canopy(ctx, p, '#2a4023', woodPal, 6.5, rng);
  }
  for (const [kind, , p] of DATA.A) {
    if (kind === 'grass') lawn(ctx, p, '#76904a', rng, true);
    else if (kind === 'park') lawn(ctx, p, '#6f8a47', rng, false);
    else if (kind === 'golf') {
      lawn(ctx, p, '#7aa04c', rng, true);
      ctx.fillStyle = '#d6c79a';
      const c = polyCentroid(p);
      ctx.beginPath(); ctx.ellipse(c[0] - 30, c[1] + 10, 9, 5, 0.4, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(c[0] + 25, c[1] - 25, 7, 4, -0.3, 0, TAU); ctx.fill();
      ctx.fillStyle = '#8cba5a'; ctx.beginPath(); ctx.ellipse(c[0], c[1] + 40, 14, 10, 0, 0, TAU); ctx.fill();
    } else if (kind === 'school') { pathPoly(ctx, p); ctx.fillStyle = '#b4a888'; ctx.fill(); }
    else if (kind === 'fitness') { pathPoly(ctx, p); ctx.fillStyle = '#c2ac84'; ctx.fill(); }
  }
  for (const [kind, , p] of DATA.A) {
    if (kind !== 'parking') continue;
    pathPoly(ctx, p); ctx.fillStyle = '#4a4c4f'; ctx.fill();
    ctx.save(); pathPoly(ctx, p); ctx.clip();
    const ang = polyAxis(p), c = polyCentroid(p);
    ctx.translate(c[0], c[1]); ctx.rotate(ang);
    ctx.strokeStyle = 'rgba(235,235,230,0.8)'; ctx.lineWidth = 0.14;
    for (let row = -120; row < 120; row += 16) {
      for (let x = -150; x < 150; x += 2.5) {
        ctx.beginPath(); ctx.moveTo(x, row); ctx.lineTo(x, row + 5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, row + 11); ctx.lineTo(x, row + 16); ctx.stroke();
      }
    }
    ctx.restore();
  }
  for (const [kind, , p] of DATA.A) {
    if (kind === 'track') {
      pathPoly(ctx, p); ctx.fillStyle = '#a4573e'; ctx.fill();
      const c = polyCentroid(p);
      ctx.strokeStyle = 'rgba(245,240,235,0.7)'; ctx.lineWidth = 0.12;
      for (let k = 1; k <= 7; k++) {
        const s = 1 - k * 0.016;
        ctx.beginPath();
        p.forEach((q, i) => { const x = c[0] + (q[0] - c[0]) * s, z = c[1] + (q[1] - c[1]) * s; if (i) ctx.lineTo(x, z); else ctx.moveTo(x, z); });
        ctx.closePath(); ctx.stroke();
      }
    }
  }
  for (const [kind, , p] of DATA.A) {
    if (kind === 'pitch') {
      ctx.save(); pathPoly(ctx, p); ctx.clip();
      const bb = polyBBox(p);
      for (let z = bb.z0, k = 0; z < bb.z1; z += 6, k++) { ctx.fillStyle = k % 2 ? '#5f8f3c' : '#6b9b45'; ctx.fillRect(bb.x0 - 2, z, bb.w + 4, 6); }
      ctx.restore();
      const x0 = bb.x0 + 1.5, x1 = bb.x1 - 1.5, z0 = bb.z0 + 1.5, z1 = bb.z1 - 1.5, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      ctx.strokeStyle = 'rgba(250,250,245,0.92)'; ctx.lineWidth = 0.18;
      ctx.strokeRect(x0, z0, x1 - x0, z1 - z0);
      ctx.beginPath(); ctx.moveTo(x0, cz); ctx.lineTo(x1, cz); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cz, 9.15, 0, TAU); ctx.stroke();
      ctx.strokeRect(cx - 20.15, z0, 40.3, 16.5); ctx.strokeRect(cx - 20.15, z1 - 16.5, 40.3, 16.5);
      ctx.strokeRect(cx - 9.15, z0, 18.3, 5.5); ctx.strokeRect(cx - 9.15, z1 - 5.5, 18.3, 5.5);
    } else if (kind === 'tennis') {
      pathPoly(ctx, p); ctx.fillStyle = '#2f6a57'; ctx.fill();
      const bb = polyBBox(p);
      ctx.strokeStyle = 'rgba(240,245,245,0.9)'; ctx.lineWidth = 0.12;
      for (let cxi = 0; cxi < 4; cxi++) for (let czi = 0; czi < 2; czi++) {
        const w = 10.97, l = 23.77;
        const x = bb.x0 + 4 + cxi * (w + 4.5), z = bb.z0 + 6 + czi * (l + 12);
        ctx.fillStyle = '#3c7d63'; ctx.fillRect(x, z, w, l);
        ctx.strokeRect(x, z, w, l); ctx.strokeRect(x + 1.37, z, w - 2.74, l);
        ctx.beginPath(); ctx.moveTo(x, z + l / 2); ctx.lineTo(x + w, z + l / 2); ctx.stroke();
      }
    } else if (kind === 'water') {
      pathPoly(ctx, p); ctx.fillStyle = '#6d6a58'; ctx.lineWidth = 1.2; ctx.strokeStyle = '#6d6a58'; ctx.stroke();
      ctx.fillStyle = '#2f5866'; ctx.fill();
    }
  }
  const order = ['path', 'footway', 'steps', 'aisle', 'service', 'residential', 'tertiary', 'secondary'];
  for (const pass of [0, 1, 2]) {
    for (const t of order) {
      for (const [type, pts] of DATA.R) {
        if (type !== t) continue;
        const w = ROAD_W[type] || 5;
        pathLine(ctx, pts);
        if (pass === 0) {
          if (type === 'path' || type === 'footway' || type === 'steps') continue;
          ctx.strokeStyle = '#9b988f'; ctx.lineWidth = w + 1.4; ctx.stroke();
        } else if (pass === 1) {
          ctx.strokeStyle = type === 'path' ? '#8c7a5a' : type === 'footway' ? '#bdb19b' : type === 'steps' ? '#aaa59b' : type === 'aisle' ? '#505255' : '#4a4c50';
          ctx.lineWidth = w; ctx.stroke();
        } else {
          if (type === 'tertiary' || type === 'secondary') {
            ctx.setLineDash([]); ctx.strokeStyle = '#d6b23e'; ctx.lineWidth = 0.38; ctx.stroke();
          } else if (type === 'service' || type === 'residential') {
            ctx.setLineDash([2.5, 6]); ctx.strokeStyle = 'rgba(235,235,230,0.55)'; ctx.lineWidth = 0.14; ctx.stroke();
          } else if (type === 'steps') {
            ctx.setLineDash([0.25, 0.35]); ctx.strokeStyle = 'rgba(80,78,72,0.6)'; ctx.lineWidth = w * 0.9; ctx.stroke();
          }
          ctx.setLineDash([]);
        }
      }
    }
  }
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 4.5 * GSC;
  for (const [, , p] of DATA.B) {
    const c = polyCentroid(p);
    pathPoly(ctx, p.map(q => [c[0] + (q[0] - c[0]) * 1.03 + 0.4, c[1] + (q[1] - c[1]) * 1.03 - 0.6]));
    ctx.fillStyle = 'rgba(30,30,28,0.65)'; ctx.fill();
  }
  ctx.restore();
  for (const [, , p] of DATA.B) {
    const c = polyCentroid(p);
    pathPoly(ctx, p.map(q => [c[0] + (q[0] - c[0]) * 1.06, c[1] + (q[1] - c[1]) * 1.06]));
    ctx.fillStyle = '#8f8c84'; ctx.fill();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const img = ctx.getImageData(0, 0, GRES, GRES), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = 0.9 + Math.random() * 0.17;
    d[i] *= n; d[i + 1] *= n; d[i + 2] *= n;
  }
  ctx.putImageData(img, 0, 0);
  const g2 = GC0.getContext('2d');
  g2.drawImage(GC, 0, 0);
  groundTex.needsUpdate = true;
}

const CRES = 680, CSC = CRES / 1700;
const CLS = { open: 0, forest: 1, grass: 2, road: 3, building: 4, parking: 5, water: 6, sport: 7, village: 8, field: 9 };
let CLASS = null;
function paintClass() {
  const cv = document.createElement('canvas'); cv.width = cv.height = CRES;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgb(0,0,0)'; ctx.fillRect(0, 0, CRES, CRES);
  worldCtx(ctx, CSC);
  const col = { open: 'rgb(255,255,255)', forest: 'rgb(0,255,0)', grass: 'rgb(0,120,0)', road: 'rgb(255,0,0)', building: 'rgb(0,0,255)', parking: 'rgb(255,255,0)', water: 'rgb(0,255,255)', sport: 'rgb(255,0,255)', village: 'rgb(128,128,128)' };
  for (const [kind, , p] of DATA.A) if (kind === 'wood') { pathPoly(ctx, p); ctx.fillStyle = col.forest; ctx.fill(); }
  const villages = [[-740, -200, 100], [-760, 570, 95], [-650, 805, 110], [-200, 712, 60], [-395, 805, 50], [790, 470, 80], [-830, 270, 40]];
  for (const [x, z, r] of villages) { ctx.fillStyle = col.village; ctx.beginPath(); ctx.arc(x, z, r, 0, TAU); ctx.fill(); }
  pathPoly(ctx, DATA.campus); ctx.fillStyle = col.open; ctx.fill();
  for (const [kind, , p] of DATA.A) {
    const c = kind === 'wood' || kind === 'forest' ? col.forest : kind === 'grass' || kind === 'park' || kind === 'polytech' ? col.grass : kind === 'parking' ? col.parking : kind === 'water' ? col.water : (kind === 'track' || kind === 'pitch' || kind === 'tennis' || kind === 'golf' || kind === 'school' || kind === 'fitness') ? col.sport : null;
    if (!c) continue;
    pathPoly(ctx, p); ctx.fillStyle = c; ctx.fill();
  }
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const [type, pts] of DATA.R) { pathLine(ctx, pts); ctx.strokeStyle = col.road; ctx.lineWidth = (ROAD_W[type] || 5) + 3; ctx.stroke(); }
  for (const [, , p] of DATA.B) { pathPoly(ctx, p); ctx.fillStyle = col.building; ctx.fill(); ctx.strokeStyle = col.building; ctx.lineWidth = 4; ctx.stroke(); }
  const d = ctx.getImageData(0, 0, CRES, CRES).data;
  CLASS = new Uint8Array(CRES * CRES);
  for (let i = 0; i < CRES * CRES; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    let c = CLS.field;
    if (r > 200 && g > 200 && b > 200) c = CLS.open;
    else if (r > 200 && g > 200 && b < 80) c = CLS.parking;
    else if (r > 200 && g < 80 && b > 200) c = CLS.sport;
    else if (r < 80 && g > 200 && b > 200) c = CLS.water;
    else if (r > 170 && g < 90 && b < 90) c = CLS.road;
    else if (b > 170 && r < 90 && g < 90) c = CLS.building;
    else if (g > 200 && r < 90 && b < 90) c = CLS.forest;
    else if (g > 90 && g < 170 && r < 60 && b < 60) c = CLS.grass;
    else if (r > 100 && r < 160 && Math.abs(r - g) < 20 && Math.abs(r - b) < 20) c = CLS.village;
    else if (r < 40 && g < 40 && b < 40) c = CLS.field;
    else c = CLS.road;
    CLASS[i] = c;
  }
}
function classAt(x, z) {
  const i = Math.floor((x + 850) * CSC), j = Math.floor((z + 850) * CSC);
  if (i < 0 || j < 0 || i >= CRES || j >= CRES) return CLS.field;
  return CLASS[j * CRES + i];
}

function markScorch(x, z, r, k) {
  if (Math.abs(x) > 850 || Math.abs(z) > 850) return;
  const ctx = gctx;
  worldCtx(ctx, GSC);
  const g = ctx.createRadialGradient(x, z, 0, x, z, r);
  g.addColorStop(0, `rgba(14,11,9,${0.92 * k})`);
  g.addColorStop(0.5, `rgba(26,20,15,${0.7 * k})`);
  g.addColorStop(1, 'rgba(30,24,18,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, z, r, 0, TAU); ctx.fill();
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * TAU, d = r * (0.6 + Math.random() * 0.7);
    ctx.strokeStyle = `rgba(20,16,12,${0.35 * k})`;
    ctx.lineWidth = 0.4 + Math.random() * 1.2;
    ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 0.3, z + Math.sin(a) * r * 0.3); ctx.lineTo(x + Math.cos(a) * d, z + Math.sin(a) * d); ctx.stroke();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  groundDirty = true;
}
function markBurnt(x, z, r) {
  if (Math.abs(x) > 850 || Math.abs(z) > 850) return;
  const ctx = gctx;
  worldCtx(ctx, GSC);
  const g = ctx.createRadialGradient(x, z, 0, x, z, r);
  g.addColorStop(0, 'rgba(22,18,14,0.75)'); g.addColorStop(1, 'rgba(40,32,24,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, z, r, 0, TAU); ctx.fill();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  groundDirty = true;
}
function markWet(x, z, r) {
  if (Math.abs(x) > 850 || Math.abs(z) > 850) return;
  const ctx = gctx;
  worldCtx(ctx, GSC);
  const g = ctx.createRadialGradient(x, z, 0, x, z, r);
  g.addColorStop(0, 'rgba(20,28,30,0.35)'); g.addColorStop(1, 'rgba(20,28,30,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, z, r, 0, TAU); ctx.fill();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  groundDirty = true;
}
function markCrack(x, z, len, ang) {
  const ctx = gctx;
  worldCtx(ctx, GSC);
  const draw = (sx, sz, a, l, w, depth) => {
    let px = sx, pz = sz;
    ctx.strokeStyle = 'rgba(16,12,10,0.9)';
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(px, pz);
    const n = Math.max(3, Math.floor(l / 6));
    for (let i = 0; i < n; i++) {
      a += (Math.random() - 0.5) * 0.7;
      px += Math.cos(a) * l / n; pz += Math.sin(a) * l / n;
      ctx.lineTo(px, pz);
      if (depth < 2 && Math.random() < 0.18) { ctx.stroke(); draw(px, pz, a + (Math.random() < 0.5 ? 1 : -1) * (0.5 + Math.random() * 0.6), l * 0.35, w * 0.55, depth + 1); ctx.strokeStyle = 'rgba(16,12,10,0.9)'; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(px, pz); }
    }
    ctx.stroke();
  };
  draw(x, z, ang, len, 1.6, 0);
  draw(x, z, ang + Math.PI, len * 0.8, 1.4, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  groundDirty = true;
}
function markAsh(alpha) {
  gctx.setTransform(1, 0, 0, 1, 0, 0);
  gctx.fillStyle = `rgba(128,122,114,${alpha})`;
  gctx.fillRect(0, 0, GRES, GRES);
  groundDirty = true;
}
function resetGround() {
  gctx.setTransform(1, 0, 0, 1, 0, 0);
  gctx.drawImage(GC0, 0, 0);
  groundTex.needsUpdate = true;
  TH.set(TH0);
  for (let k = 0; k < TW * TW; k++) tPos[k * 3 + 1] = TH[k];
  computeTerrainNormals(0, 0, TN, TN);
  terrPending = { a: 0, b: TW * TW * 3 };
  heightTexDirty = true;
}

let terrPending = null;
function flushTerrain() {
  if (!terrPending) return;
  const pa = terrGeo.attributes.position, na = terrGeo.attributes.normal;
  pa.updateRange.offset = terrPending.a; pa.updateRange.count = terrPending.b - terrPending.a;
  na.updateRange.offset = terrPending.a; na.updateRange.count = terrPending.b - terrPending.a;
  pa.needsUpdate = true; na.needsUpdate = true;
  terrPending = null;
}

function deformCrater(x, z, r, depth) {
  if (Math.abs(x) > 840 || Math.abs(z) > 840) return;
  const R = r * 1.5;
  const i0 = clamp(Math.floor((x - R + TEXT) / TD), 1, TN - 1), i1 = clamp(Math.ceil((x + R + TEXT) / TD), 1, TN - 1);
  const j0 = clamp(Math.floor((z - R + TEXT) / TD), 1, TN - 1), j1 = clamp(Math.ceil((z + R + TEXT) / TD), 1, TN - 1);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const px = -TEXT + i * TD, pz = -TEXT + j * TD, d = Math.hypot(px - x, pz - z), k = j * TW + i;
    if (d < r) TH[k] -= depth * Math.pow(1 - (d / r) * (d / r), 1.5) * (0.85 + Math.random() * 0.3);
    else if (d < R) TH[k] += depth * 0.2 * Math.sin((Math.PI * (d - r)) / (R - r));
    tPos[k * 3 + 1] = TH[k];
  }
  computeTerrainNormals(i0 - 1, j0 - 1, i1 + 1, j1 + 1);
  const a = Math.max(0, (j0 - 2) * TW * 3), b = Math.min(TW * TW * 3, (j1 + 3) * TW * 3);
  terrPending = terrPending ? { a: Math.min(terrPending.a, a), b: Math.max(terrPending.b, b) } : { a, b };
  heightTexDirty = true;
}

const HT_RES = 256;
const htData = new Float32Array(HT_RES * HT_RES * 4);
const heightTex = new THREE.DataTexture(htData, HT_RES, HT_RES, THREE.RGBAFormat, THREE.FloatType);
heightTex.minFilter = THREE.NearestFilter; heightTex.magFilter = THREE.NearestFilter;
let heightTexDirty = true;
function updateHeightTex() {
  for (let j = 0; j < HT_RES; j++) for (let i = 0; i < HT_RES; i++) {
    const x = -850 + (i + 0.5) * 1700 / HT_RES, z = -850 + (j + 0.5) * 1700 / HT_RES;
    htData[(j * HT_RES + i) * 4] = H(x, z);
  }
  heightTex.needsUpdate = true;
  heightTexDirty = false;
}

const pickRay = new THREE.Ray();
function pickGround(ray) {
  const o = ray.origin, d = ray.direction;
  let t = 0, prev = 0;
  for (let i = 0; i < 700; i++) {
    const px = o.x + d.x * t, py = o.y + d.y * t, pz = o.z + d.z * t;
    const h = H(px, pz);
    if (py < h) {
      let a = prev, b = t;
      for (let k = 0; k < 14; k++) {
        const m = (a + b) / 2;
        if (o.y + d.y * m < H(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m;
      }
      return new V3(o.x + d.x * b, o.y + d.y * b, o.z + d.z * b);
    }
    prev = t;
    t += Math.max(1.2, (py - h) * 0.45);
    if (t > 40000) break;
  }
  return null;
}
