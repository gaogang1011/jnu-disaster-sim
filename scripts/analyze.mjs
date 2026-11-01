import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import vm from 'node:vm';

const root = fileURLToPath(new URL('..', import.meta.url));
const ctx = vm.createContext({});
vm.runInContext(['00-data.js', '00-guides.js', '01-util.js', '02-route.js'].map(f => readFileSync(join(root, 'src', f), 'utf8')).join('\n') +
  '\nglobalThis.out = { DATA, SHELTERS, SHELTER_KIND_NAME, pointInPoly, polyArea, polyCentroid, buildWalkGraph, shelterSources, routeToShelters, entryNode };', ctx);
const R = ctx.out;
const WALK = 1.4;

const graph = R.buildWalkGraph(R.DATA.R);
const houses = ['주택', '상가', '편의점', '식당', '민가', '마을회관', 'KBS', '제일조은빌'];
const buildings = R.DATA.B
  .filter(([n, , p]) => !houses.some(h => n.includes(h)) && R.pointInPoly(...R.polyCentroid(p), R.DATA.campus))
  .map(([name, , poly]) => {
    const exits = [];
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k], c = poly[(k + 1) % poly.length];
      exits.push([(a[0] + c[0]) / 2, (a[1] + c[1]) / 2]);
    }
    return { name, area: Math.abs(R.polyArea(poly)), exits };
  });

function scenario(label, kind, keep) {
  const list = R.SHELTERS.filter(s => s.kinds.includes(kind) && keep(s)).map(s => {
    if (!s.building) return s;
    const b = R.DATA.B.find(q => q[0] === s.building);
    const [x, z] = R.polyCentroid(b[2]);
    return { ...s, x, z, r: Math.sqrt(Math.abs(R.polyArea(b[2])) / Math.PI) };
  });
  const route = R.routeToShelters(graph, R.shelterSources(graph, list, 4));
  const rows = [];
  for (const b of buildings) {
    let best = Infinity, sh = -1;
    for (const [x, z] of b.exits) {
      const v = R.entryNode(graph, route, x, z);
      if (v < 0) continue;
      const d = Math.hypot(graph.x[v] - x, graph.z[v] - z) * 1.2 + route.dist[v];
      if (d < best) { best = d; sh = route.shelter[v]; }
    }
    rows.push({ name: b.name, area: b.area, d: best, shelter: sh >= 0 ? list[sh].name : '-' });
  }
  const ok = rows.filter(r => r.d < Infinity);
  const wsum = ok.reduce((s, r) => s + r.area, 0);
  const avg = ok.reduce((s, r) => s + r.d * r.area, 0) / wsum;
  const far = ok.reduce((a, r) => (r.d > a.d ? r : a), ok[0]);
  const load = {};
  for (const r of ok) load[r.shelter] = (load[r.shelter] || 0) + r.area;
  const busiest = Object.entries(load).sort((a, b) => b[1] - a[1])[0];
  return { label, kind, n: list.length, reach: ok.length, total: rows.length, avg, max: far.d, far: far.name, busiest: busiest[0], share: busiest[1] / wsum };
}

const mmss = s => `${Math.floor(s / 60)}분 ${String(Math.round(s % 60)).padStart(2, '0')}초`;
const cases = [
  scenario('옥외 대피소 5곳 모두', 'open', () => true),
  scenario('대운동장 사용 불가', 'open', s => s.id !== 'stadium'),
  scenario('중앙 잔디광장 사용 불가', 'open', s => s.id !== 'lawn'),
  scenario('대운동장 한 곳만', 'open', s => s.id === 'stadium'),
  scenario('고지대 4곳 모두', 'high', () => true),
  scenario('생활관 광장 사용 불가', 'high', s => s.id !== 'dormplaza'),
  scenario('실내 대피소 8곳 모두', 'indoor', () => true),
  scenario('중앙도서관·학생회관 사용 불가', 'indoor', s => s.id !== 'clib' && s.id !== 'union')
];

const lines = [
  '| 대피 방식 | 조건 | 대피소 | 도달 건물 | 평균 거리 | 평균 도보 시간 | 가장 먼 건물 (거리) | 가장 붐비는 대피소 (면적 비중) |',
  '|---|---|---:|---:|---:|---:|---|---|'
];
for (const c of cases) {
  lines.push(`| ${R.SHELTER_KIND_NAME[c.kind]} | ${c.label} | ${c.n}곳 | ${c.reach}/${c.total} | ${Math.round(c.avg)}m | ${mmss(c.avg / WALK)} | ${c.far} (${Math.round(c.max)}m, ${mmss(c.max / WALK)}) | ${c.busiest} (${Math.round(c.share * 100)}%) |`);
}
const md = `# 대피소 구성별 대피 거리 분석

\`npm run analyze\`로 다시 만들 수 있습니다. 캠퍼스 안 건물 ${buildings.length}동의 출입구(외곽선 각 변의 가운데)에서 OSM 보행 그래프를 따라
가장 가까운 대피소까지의 최단 거리를 구하고, 건물 면적으로 가중 평균했습니다. 도보 속도는 ${WALK}m/s입니다.
혼잡과 침수·화재 같은 위험은 반영하지 않은 **최단 거리 기준**이므로, 실제 대피 시간은 시뮬레이터 결과처럼 더 길어집니다.

${lines.join('\n')}
`;
mkdirSync(join(root, 'docs'), { recursive: true });
writeFileSync(join(root, 'docs', 'ANALYSIS.md'), md);
console.log(md);
