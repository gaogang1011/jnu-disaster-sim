const ROUTE_CELL = 40;

function buildWalkGraph(roads, opts) {
  const o = Object.assign({ step: 25, link: 8 }, opts);
  const x = [], z = [], adj = [], edges = [], key = new Map();
  const node = (px, pz) => {
    const k = Math.round(px) + ',' + Math.round(pz);
    let id = key.get(k);
    if (id === undefined) {
      id = x.length; key.set(k, id);
      x.push(Math.round(px)); z.push(Math.round(pz)); adj.push([]);
    }
    return id;
  };
  const has = (a, b) => adj[a].some(t => t.to === b);
  const link = (a, b) => {
    if (a === b || has(a, b)) return;
    const len = Math.hypot(x[a] - x[b], z[a] - z[b]);
    const e = edges.length;
    edges.push({ a, b, len, mx: (x[a] + x[b]) / 2, mz: (z[a] + z[b]) / 2 });
    adj[a].push({ to: b, e }); adj[b].push({ to: a, e });
  };
  for (const [, pts] of roads) {
    let prev = -1;
    for (let i = 0; i < pts.length; i++) {
      if (i > 0) {
        const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
        const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / o.step));
        for (let k = 1; k < n; k++) {
          const id = node(ax + (bx - ax) * k / n, az + (bz - az) * k / n);
          link(prev, id); prev = id;
        }
      }
      const id = node(pts[i][0], pts[i][1]);
      if (prev >= 0) link(prev, id);
      prev = id;
    }
  }
  const grid = new Map();
  const cellKey = (cx, cz) => cx + ',' + cz;
  for (let i = 0; i < x.length; i++) {
    const k = cellKey(Math.floor(x[i] / ROUTE_CELL), Math.floor(z[i] / ROUTE_CELL));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  const g = { x, z, adj, edges, grid, n: x.length };
  for (let i = 0; i < g.n; i++) for (const j of nodesWithin(g, x[i], z[i], o.link)) if (j > i) link(i, j);
  return g;
}

function nodesWithin(g, px, pz, r) {
  const out = [];
  const c0 = Math.floor((px - r) / ROUTE_CELL), c1 = Math.floor((px + r) / ROUTE_CELL);
  const d0 = Math.floor((pz - r) / ROUTE_CELL), d1 = Math.floor((pz + r) / ROUTE_CELL);
  for (let cz = d0; cz <= d1; cz++) for (let cx = c0; cx <= c1; cx++) {
    const cell = g.grid.get(cx + ',' + cz);
    if (!cell) continue;
    for (const i of cell) if (Math.hypot(g.x[i] - px, g.z[i] - pz) <= r) out.push(i);
  }
  return out;
}

function nearestNodes(g, px, pz, k, maxR) {
  let r = 40, found = [];
  while (r <= (maxR || 2000)) {
    found = nodesWithin(g, px, pz, r);
    if (found.length >= k) break;
    r *= 2;
  }
  return found.map(i => ({ i, d: Math.hypot(g.x[i] - px, g.z[i] - pz) })).sort((a, b) => a.d - b.d).slice(0, k);
}

function graphComponents(g) {
  const comp = new Int32Array(g.n).fill(-1);
  const sizes = [];
  for (let s = 0; s < g.n; s++) {
    if (comp[s] >= 0) continue;
    const id = sizes.length, stack = [s];
    comp[s] = id;
    let size = 0;
    while (stack.length) {
      const v = stack.pop(); size++;
      for (const { to } of g.adj[v]) if (comp[to] < 0) { comp[to] = id; stack.push(to); }
    }
    sizes.push(size);
  }
  return { comp, sizes };
}

function shelterSources(g, shelters, k) {
  const out = [];
  shelters.forEach((s, si) => {
    let near = nearestNodes(g, s.x, s.z, k || 4, 2000).filter(q => q.d <= Math.max(60, (s.r || 0) + 30));
    if (!near.length) near = nearestNodes(g, s.x, s.z, 1, 4000);
    for (const q of near) out.push({ node: q.i, cost: q.d, shelter: si });
  });
  return out;
}

function routeToShelters(g, sources, edgeCost) {
  const dist = new Float64Array(g.n).fill(Infinity);
  const next = new Int32Array(g.n).fill(-1);
  const shelter = new Int32Array(g.n).fill(-1);
  const heap = new MinHeap();
  for (const s of sources) {
    if (s.cost < dist[s.node]) { dist[s.node] = s.cost; shelter[s.node] = s.shelter; next[s.node] = -1; heap.push(s.cost, s.node); }
  }
  while (heap.size) {
    const [d, v] = heap.pop();
    if (d > dist[v]) continue;
    for (const { to, e } of g.adj[v]) {
      const c = edgeCost ? edgeCost(e) : g.edges[e].len;
      if (!(c < Infinity)) continue;
      const nd = d + c;
      if (nd < dist[to]) { dist[to] = nd; next[to] = v; shelter[to] = shelter[v]; heap.push(nd, to); }
    }
  }
  return { dist, next, shelter };
}

function pathFrom(route, start) {
  const out = [];
  let v = start, guard = 0;
  while (v >= 0 && guard++ < 100000) { out.push(v); v = route.next[v]; }
  return out;
}

function entryNode(g, route, px, pz, detour) {
  const k = detour || 1.2;
  let best = -1, bc = Infinity;
  for (const r of [60, 140, 320, 900]) {
    for (const i of nodesWithin(g, px, pz, r)) {
      if (!(route.dist[i] < Infinity)) continue;
      const c = Math.hypot(g.x[i] - px, g.z[i] - pz) * k + route.dist[i];
      if (c < bc) { bc = c; best = i; }
    }
    if (best >= 0) break;
  }
  return best;
}
