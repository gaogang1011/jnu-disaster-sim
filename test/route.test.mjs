import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const load = f => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const ctx = vm.createContext({});
vm.runInContext(['00-data.js', '00-guides.js', '01-util.js', '02-route.js'].map(load).join('\n') +
  '\nglobalThis.out = { DATA, SHELTERS, pointInPoly, buildWalkGraph, graphComponents, shelterSources, routeToShelters, pathFrom, entryNode, nearestNodes };', ctx);
const R = ctx.out;
const graph = R.buildWalkGraph(R.DATA.R);
const campusNodes = [...Array(graph.n).keys()].filter(i => R.pointInPoly(graph.x[i], graph.z[i], R.DATA.campus));
const sheltersOf = kind => R.SHELTERS.filter(s => s.kinds.includes(kind) && !s.building);

test('보행 그래프가 만들어지고 간선이 25m 이하로 나뉜다', () => {
  assert.ok(graph.n > 500, `노드 ${graph.n}`);
  assert.ok(graph.edges.length >= graph.n - 1);
  const long = graph.edges.filter(e => e.len > 26 && e.len > 8.5).length;
  assert.equal(long, 0, `25m 넘는 간선 ${long}개`);
});

test('캠퍼스 안 노드 대부분이 하나로 연결된다', () => {
  const { comp, sizes } = R.graphComponents(graph);
  const big = sizes.indexOf(Math.max(...sizes));
  const inBig = campusNodes.filter(i => comp[i] === big).length;
  assert.ok(inBig / campusNodes.length > 0.9, `${inBig}/${campusNodes.length}`);
});

for (const kind of ['open', 'high']) {
  test(`${kind} 대피소까지 캠퍼스 노드 90% 이상이 도달한다`, () => {
    const route = R.routeToShelters(graph, R.shelterSources(graph, sheltersOf(kind)));
    const ok = campusNodes.filter(i => route.dist[i] < Infinity).length;
    assert.ok(ok / campusNodes.length > 0.9, `${ok}/${campusNodes.length}`);
  });
}

test('경로를 따라가면 대피소 연결 노드에서 끝나고 거리가 줄어든다', () => {
  const sh = sheltersOf('open');
  const route = R.routeToShelters(graph, R.shelterSources(graph, sh));
  const start = R.entryNode(graph, route, 0, 400);
  assert.ok(start >= 0);
  const path = R.pathFrom(route, start);
  for (let k = 1; k < path.length; k++) assert.ok(route.dist[path[k]] < route.dist[path[k - 1]]);
  const end = path[path.length - 1];
  assert.equal(route.next[end], -1);
  const s = sh[route.shelter[end]];
  assert.ok(Math.hypot(graph.x[end] - s.x, graph.z[end] - s.z) < 120);
});

test('통행 불가 간선은 피해 간다', () => {
  const sh = sheltersOf('open');
  const src = R.shelterSources(graph, sh);
  const free = R.routeToShelters(graph, src);
  const start = R.entryNode(graph, free, 0, 400);
  const path = R.pathFrom(free, start);
  const mid = path[Math.floor(path.length / 2)];
  const bx = graph.x[mid], bz = graph.z[mid];
  const isBlocked = e => Math.hypot(graph.edges[e].mx - bx, graph.edges[e].mz - bz) < 15;
  assert.ok(graph.adj[mid].some(({ e }) => isBlocked(e)), '막을 간선이 없음');
  const blocked = R.routeToShelters(graph, src, e => isBlocked(e) ? Infinity : graph.edges[e].len);
  const p2 = R.pathFrom(blocked, start);
  for (let k = 1; k < p2.length; k++) {
    const used = graph.adj[p2[k - 1]].filter(t => t.to === p2[k]).map(t => t.e);
    assert.ok(used.some(e => !isBlocked(e)), '막힌 간선을 지나감');
  }
  assert.ok(blocked.dist[start] >= free.dist[start]);
});
