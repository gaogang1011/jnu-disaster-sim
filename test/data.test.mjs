import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const load = f => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const ctx = vm.createContext({});
vm.runInContext(load('00-data.js') + '\n' + load('01-util.js') +
  '\nglobalThis.out = { DATA, polyArea, polyCentroid, pointInPoly, segmentPolygon, distToPoly };', ctx);
const { DATA, polyArea, polyCentroid, pointInPoly, segmentPolygon, distToPoly } = ctx.out;

test('건물 데이터가 모두 유효한 다각형이다', () => {
  assert.equal(DATA.B.length, 84);
  for (const [name, levels, poly] of DATA.B) {
    assert.ok(typeof name === 'string' && name.length > 0);
    assert.ok(Number.isInteger(levels) && levels >= 0);
    assert.ok(poly.length >= 3, `${name} 꼭짓점 부족`);
    assert.ok(Math.abs(polyArea(poly)) > 10, `${name} 면적이 0에 가까움`);
    for (const [x, z] of poly) assert.ok(Number.isFinite(x) && Number.isFinite(z));
  }
});

test('주요 건물이 캠퍼스 경계 안에 있다', () => {
  for (const n of ['본관', '중앙도서관', '학생회관', '아라뮤즈홀', '체육관', '의과대학']) {
    const b = DATA.B.find(q => q[0] === n);
    assert.ok(b, `${n} 없음`);
    const [cx, cz] = polyCentroid(b[2]);
    assert.ok(pointInPoly(cx, cz, DATA.campus), `${n}이 캠퍼스 밖`);
  }
});

test('고도 격자가 41×41 숫자 격자다', () => {
  const rows = DATA.ELEV.split(';').map(r => r.split(',').map(Number));
  assert.equal(rows.length, 41);
  for (const r of rows) {
    assert.equal(r.length, 41);
    for (const v of r) assert.ok(Number.isFinite(v) && v >= 0 && v < 400);
  }
});

test('도로와 구역, 주요 지점이 채워져 있다', () => {
  assert.ok(DATA.R.length > 100);
  assert.ok(DATA.A.some(a => a[0] === 'track'));
  for (const k of ['mainGate', 'backGate', 'gwonje', 'windmill', 'stadium']) assert.equal(DATA.P[k].length, 2);
});

test('건물 분할은 면적을 보존한다', () => {
  for (const [name, , poly] of DATA.B) {
    const total = Math.abs(polyArea(poly));
    if (total < 520) continue;
    const sum = segmentPolygon(poly, 26).reduce((s, p) => s + Math.abs(polyArea(p)), 0);
    assert.ok(Math.abs(sum - total) <= total * 0.03, `${name} 분할 면적 오차`);
  }
});

test('점-다각형 거리 계산', () => {
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10]];
  assert.equal(distToPoly(5, 5, sq), 0);
  assert.equal(distToPoly(15, 5, sq), 5);
});

const g = vm.createContext({});
vm.runInContext(load('00-data.js') + '\n' + load('00-guides.js') + '\n' + load('01-util.js') +
  '\nglobalThis.out = { DATA, SHELTERS, GUIDES, GUIDE_SOURCES, typhoonClass, pointInPoly, distToPoly };', g);
const G = g.out;

test('옥외·고지대 대피소는 캠퍼스 안의 빈 땅에 있다', () => {
  for (const s of G.SHELTERS.filter(q => !q.building)) {
    assert.ok(G.pointInPoly(s.x, s.z, G.DATA.campus), `${s.name} 캠퍼스 밖`);
    for (const [name, , poly] of G.DATA.B) assert.ok(G.distToPoly(s.x, s.z, poly) > 4, `${s.name}이 ${name} 안에 있음`);
  }
});

test('실내 대피소는 실제 건물 이름과 연결된다', () => {
  for (const s of G.SHELTERS.filter(q => q.building)) assert.ok(G.DATA.B.some(b => b[0] === s.building), `${s.building} 없음`);
});

test('대피 방식마다 대피소가 3곳 이상 있다', () => {
  for (const k of ['open', 'high', 'indoor']) assert.ok(G.SHELTERS.filter(s => s.kinds.includes(k)).length >= 3, k);
});

test('행동요령은 재난 6종 모두 있고 출처가 연결된다', () => {
  for (const k of ['quake', 'tsunami', 'rain', 'typhoon', 'fire', 'volcano']) {
    const gd = G.GUIDES[k];
    assert.ok(gd && gd.steps.length >= 3, k);
    for (const s of gd.sources) assert.ok(G.GUIDE_SOURCES[s]?.url.startsWith('https://'), `${k} 출처 ${s}`);
  }
});

test('태풍 강도는 기상청 기준으로 분류된다', () => {
  assert.equal(G.typhoonClass(24.9), '약');
  assert.equal(G.typhoonClass(25), '중');
  assert.equal(G.typhoonClass(33), '강');
  assert.equal(G.typhoonClass(44), '매우 강');
  assert.equal(G.typhoonClass(54), '초강력');
});
