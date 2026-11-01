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
