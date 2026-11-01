const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const damp = (k, dt) => 1 - Math.exp(-k * dt);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const NOISE_P = (() => {
  const r = mulberry32(1337);
  const perm = [];
  for (let i = 0; i < 256; i++) perm.push(i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
  }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  return p;
})();

function vnoise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = NOISE_P[(NOISE_P[xi & 255] + yi) & 255] / 255;
  const b = NOISE_P[(NOISE_P[(xi + 1) & 255] + yi) & 255] / 255;
  const c = NOISE_P[(NOISE_P[xi & 255] + yi + 1) & 255] / 255;
  const d = NOISE_P[(NOISE_P[(xi + 1) & 255] + yi + 1) & 255] / 255;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

function fbm2(x, y, oct) {
  let s = 0, amp = 0.5, f = 1, n = 0;
  const o = oct || 4;
  for (let i = 0; i < o; i++) {
    s += amp * vnoise2(x * f, y * f);
    n += amp; amp *= 0.5; f *= 2.03;
  }
  return s / n;
}

function polyArea(p) {
  let a = 0;
  for (let i = 0, n = p.length; i < n; i++) {
    const q = p[i], r = p[(i + 1) % n];
    a += q[0] * r[1] - r[0] * q[1];
  }
  return a / 2;
}

function polyCentroid(p) {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0, n = p.length; i < n; i++) {
    const q = p[i], r = p[(i + 1) % n];
    const cr = q[0] * r[1] - r[0] * q[1];
    a += cr; cx += (q[0] + r[0]) * cr; cz += (q[1] + r[1]) * cr;
  }
  if (Math.abs(a) < 1e-6) {
    let sx = 0, sz = 0;
    for (const q of p) { sx += q[0]; sz += q[1]; }
    return [sx / p.length, sz / p.length];
  }
  a *= 0.5;
  return [cx / (6 * a), cz / (6 * a)];
}

function polyBBox(p) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const q of p) {
    if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0];
    if (q[1] < z0) z0 = q[1]; if (q[1] > z1) z1 = q[1];
  }
  return { x0, z0, x1, z1, w: x1 - x0, h: z1 - z0 };
}

function pointInPoly(x, z, p) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const xi = p[i][0], zi = p[i][1], xj = p[j][0], zj = p[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

function distToPoly(x, z, p) {
  if (pointInPoly(x, z, p)) return 0;
  let m = Infinity;
  for (let i = 0, n = p.length; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n];
    const d = distToSeg(x, z, a[0], a[1], b[0], b[1]);
    if (d < m) m = d;
  }
  return m;
}

function cleanPoly(p) {
  const out = [];
  for (const q of p) {
    const l = out[out.length - 1];
    if (!l || Math.hypot(l[0] - q[0], l[1] - q[1]) > 0.05) out.push(q);
  }
  while (out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 0.05) out.pop();
  return out;
}

function splitByLine(poly, k, c) {
  for (const q of poly) if (Math.abs(q[k] - c) < 1e-4) { c += 0.0137; break; }
  const n = poly.length;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    pts.push({ p: a, inter: false });
    const da = a[k] - c, db = b[k] - c;
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      pts.push({ p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], inter: true });
    }
  }
  const inters = [];
  pts.forEach((q, i) => { if (q.inter) inters.push(i); });
  if (inters.length < 2 || inters.length % 2) return [poly];
  const o = 1 - k;
  inters.sort((i, j) => pts[i].p[o] - pts[j].p[o]);
  const partner = new Map();
  for (let i = 0; i + 1 < inters.length; i += 2) {
    partner.set(inters[i], inters[i + 1]);
    partner.set(inters[i + 1], inters[i]);
  }
  const used = new Array(pts.length).fill(false);
  const res = [];
  for (let s = 0; s < pts.length; s++) {
    if (used[s] || pts[s].inter) continue;
    const piece = [];
    let i = s, guard = 0, ok = true;
    do {
      used[i] = true;
      piece.push(pts[i].p);
      if (pts[i].inter) {
        const j = partner.get(i);
        if (j === undefined) { ok = false; break; }
        used[j] = true;
        piece.push(pts[j].p);
        i = (j + 1) % pts.length;
      } else {
        i = (i + 1) % pts.length;
      }
      if (++guard > pts.length * 3) { ok = false; break; }
    } while (i !== s);
    if (!ok) return [poly];
    res.push(piece);
  }
  return res;
}

function segmentPolygon(poly, cell) {
  const bb = polyBBox(poly);
  const nx = Math.max(1, Math.round(bb.w / cell));
  const nz = Math.max(1, Math.round(bb.h / cell));
  let pieces = [poly];
  for (let i = 1; i < nx; i++) {
    const c = bb.x0 + (bb.w * i) / nx;
    pieces = pieces.flatMap(p => splitByLine(p, 0, c));
  }
  for (let j = 1; j < nz; j++) {
    const c = bb.z0 + (bb.h * j) / nz;
    pieces = pieces.flatMap(p => splitByLine(p, 1, c));
  }
  pieces = pieces.map(cleanPoly).filter(p => p.length >= 3 && Math.abs(polyArea(p)) > 6);
  const total = Math.abs(polyArea(poly));
  const sum = pieces.reduce((s, p) => s + Math.abs(polyArea(p)), 0);
  if (!pieces.length || Math.abs(sum - total) > total * 0.03) return [poly];
  return pieces;
}

function polyline(points, step) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.floor(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(b[1] - a[1], b[0] - a[0])]);
    }
  }
  return out;
}

class MinHeap {
  constructor() { this.a = []; }
  push(k, v) {
    const a = this.a; a.push([k, v]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      const t = a[p]; a[p] = a[i]; a[i] = t; i = p;
    }
  }
  pop() {
    const a = this.a;
    if (!a.length) return null;
    const top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        const t = a[m]; a[m] = a[i]; a[i] = t; i = m;
      }
    }
    return top;
  }
  get size() { return this.a.length; }
}
