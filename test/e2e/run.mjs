import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('playwright가 필요합니다: npm install && npx playwright install chromium');
  process.exit(1);
}

const root = fileURLToPath(new URL('../..', import.meta.url));
const shotDir = join(root, 'docs', 'screenshots');
const takeShots = process.argv.includes('--shots');
const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
if (takeShots) mkdirSync(shotDir, { recursive: true });

const CASES = [
  { mode: 'quake', at: 26, expect: '지진 발생', kind: 'open', risk: true, arrive: true },
  { mode: 'tsunami', at: 10, expect: '지진해일 경보', kind: 'high', flood: true },
  { mode: 'rain', at: 16, expect: '호우 경보', kind: 'high', flood: true },
  { mode: 'typhoon', at: 12, expect: '태풍 상륙', kind: 'indoor', arrive: true },
  { mode: 'fire', at: 8, expect: '화재 발생', kind: 'open', burning: true },
  { mode: 'volcano', at: 12, expect: '한라산 분화', kind: 'indoor' }
].filter(c => !only.length || only.includes(c.mode));

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.route(/^https?:/, r => r.abort());

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};
const shot = name => page.screenshot({ path: join(shotDir, `${name}.jpg`), type: 'jpeg', quality: 82, timeout: 300000 });
const simWait = async sec => {
  const start = await page.evaluate(() => window.__sim.S.time);
  await page.waitForFunction(t => window.__sim.S.time >= t, start + sec, { timeout: 1800000, polling: 1000 });
};

const url = pathToFileURL(join(root, 'index.html')).href + '?test&quality=low';
const t0 = Date.now();
await page.goto(url);
await page.waitForFunction(() => document.body.dataset.ready === '1' || /오류|WebGL/.test(document.getElementById('loadMsg').textContent), null, { timeout: 300000 });
const ready = await page.evaluate(() => document.body.dataset.ready === '1');
check('페이지 로드와 초기화', ready, `${((Date.now() - t0) / 1000).toFixed(1)}초`);
if (!ready) {
  console.log(await page.$eval('#loadMsg', e => e.textContent));
  await browser.close();
  process.exit(1);
}
const base = await page.evaluate(() => ({ b: window.__sim.BLD.length, n: window.__sim.EVAC.graph.n, people: window.__sim.EVAC.n, sh: window.__sim.EVAC.shelters.length }));
check('건물 84동·보행 그래프·대피소 15곳 생성', base.b === 84 && base.n > 1000 && base.sh === 15 && base.people > 100, `노드 ${base.n}, 표본 ${base.people}명`);
if (takeShots) await shot('overview');

const box = await page.$eval('#view canvas', c => { const r = c.getBoundingClientRect(); return { x: r.left + r.width * 0.6, y: r.top + r.height * 0.55 }; });
await page.mouse.click(box.x, box.y);
await page.waitForTimeout(800);
check('지도 클릭으로 지진과 대피 시작', await page.evaluate(() => window.__sim.LOG.some(l => l.msg.includes('지진 발생')) && window.__sim.EVAC.active && window.__sim.EVAC.kind === 'open'));

const target = await page.evaluate(() => { const b = window.__sim.BLD.find(q => q.name === '학생회관'); return { x: b.cx, z: b.cz }; });
for (const c of CASES) {
  await page.evaluate(([mode, x, z]) => {
    const s = window.__sim;
    s.resetAll();
    s.S.power = 7;
    s.setMode(mode);
    s.DISASTERS[mode].run(x, z);
  }, [c.mode, target.x, target.z]);
  await simWait(c.at);
  const st = await page.evaluate(() => {
    const s = window.__sim, m = s.evacMetrics();
    const risky = s.BLD.filter(b => s.buildingInfo(b).risk > 0).length;
    const flooded = s.SEGS.filter(g => g.flood > 0.05).length;
    const burning = s.SEGS.filter(g => g.fire === 1).length;
    const kinds = [];
    for (let i = 0; i < s.EVAC.n; i++) if (s.A.st[i] === s.EV.DONE) kinds.push(...s.EVAC.shelters[s.A.shelter[i]].kinds);
    return { log: s.LOG.map(l => l.msg), kind: s.EVAC.kind, m, risky, flooded, burning, kinds };
  });
  const parts = [`로그 "${c.expect}"`, `대피 방식 ${st.kind}`, `이동·도착 ${st.m.moving + st.m.done}/${st.m.total}`];
  let ok = st.log.some(m => m.includes(c.expect)) && st.kind === c.kind && st.m.moving + st.m.done > 0;
  if (c.risk) { ok = ok && st.risky > 0; parts.push(`위험 건물 ${st.risky}`); }
  if (c.flood) { ok = ok && st.flooded > 0; parts.push(`침수 구역 ${st.flooded}`); }
  if (c.burning) { ok = ok && st.burning > 0; parts.push(`화재 구역 ${st.burning}`); }
  if (c.arrive) {
    ok = ok && st.m.done > 0 && st.kinds.every(k => k === c.kind || c.kind === 'open' && k === 'high' || c.kind === 'high' && k === 'open');
    parts.push(`도착 ${st.m.done}명, 평균 ${Math.round(st.m.avg)}초`);
  }
  check(`재난: ${c.mode}`, ok, parts.join(', '));
  if (takeShots) await shot(c.mode);
}

await page.evaluate(() => {
  const s = window.__sim;
  s.resetAll();
  for (const sh of s.EVAC.shelters) sh.enabled = sh.id === 'union';
  s.S.power = 4;
  s.setMode('typhoon');
  s.DISASTERS.typhoon.run(0, 0);
});
await simWait(8);
const only1 = await page.evaluate(() => {
  const s = window.__sim, ids = new Set();
  for (let i = 0; i < s.EVAC.n; i++) if (s.A.st[i] === s.EV.DONE) ids.add(s.EVAC.shelters[s.A.shelter[i]].id);
  for (const sh of s.EVAC.shelters) sh.enabled = true;
  return { ids: [...ids], done: s.evacMetrics().done };
});
const row = await page.evaluate(() => { window.__sim.finishRun('완료'); return [...document.querySelectorAll('#results tbody tr')].map(r => r.textContent); });
check('실행 기록표에 결과가 쌓임', row.length >= 1 && row[row.length - 1].includes('태풍 4') && row[row.length - 1].includes('1곳'), row[row.length - 1]);
check('대피소를 끄면 남은 대피소로만 대피', only1.done > 0 && only1.ids.length === 1 && only1.ids[0] === 'union', `도착 ${only1.done}명 → ${only1.ids.join(',')}`);

const rs = await page.evaluate(() => {
  const s = window.__sim;
  s.resetAll();
  s.S.power = 9;
  s.setMode('tsunami');
  s.DISASTERS.tsunami.run(0, 0);
  const t0 = s.S.time;
  for (let k = 0; k < 900; k++) {
    s.S.time += 0.1;
    updateHazards(0.1); updateBuildings(0.1); updateEvacuation(0.1); updateRescue(0.1);
    if (s.RESCUE.teams.some(t => t.state === 'toShelter')) break;
  }
  const m = s.evacMetrics();
  const cam = s.RESCUE.teams.find(t => t.state === 'toShelter') || s.RESCUE.teams[0];
  camRelease();
  s.controls.target.set(cam.x, cam.y, cam.z);
  s.camera.position.set(cam.x + 160, cam.y + 170, cam.z - 220);
  return { t: Math.round((s.S.time - t0) * 10), ever: m.ever, rescued: m.rescued, carried: m.carried, wait: Math.round(m.rescueAvg), arrived: s.RESCUE.arrived, log: s.LOG.some(l => l.msg.includes('119 구조 요청')) };
});
check('고립자 기록과 구조대 구조', rs.log && rs.arrived && rs.ever > 0 && rs.rescued > 0, `고립 경험 ${rs.ever}명, 구조 ${rs.rescued}명, 평균 구조 대기 ${rs.wait}초 (재난 후 ${Math.round(rs.t / 60)}분)`);
await page.waitForTimeout(1500);
if (takeShots) await shot('rescue');

await page.click('.preset[data-k="1"]');
await page.waitForTimeout(800);
check('시나리오 버튼 (야간 지진해일)', await page.evaluate(() => window.__sim.S.mode === 'tsunami' && window.__sim.S.tod === 'night' && window.__sim.EVAC.kind === 'high' && document.querySelector('#guide h3').textContent.includes('지진해일')));

await page.evaluate(() => { window.__sim.resetAll(); window.__sim.setTOD('day', true); });
check('초기화', await page.evaluate(() => window.__sim.SEGS.every(g => g.risk === 0 && g.hp === g.maxHp && !g.fire) && !window.__sim.EVAC.active));
check('실행 중 스크립트 오류 없음', errors.length === 0, errors.slice(0, 3).join(' / '));

await browser.close();
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} 통과`);
process.exit(failed ? 1 : 0);
