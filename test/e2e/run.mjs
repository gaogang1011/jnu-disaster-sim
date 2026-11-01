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
  { mode: 'bomb', at: 9, expect: '폭격기 진입', damage: true },
  { mode: 'satellite', at: 7, expect: '위성 충돌', damage: true },
  { mode: 'meteor', at: 6, expect: '유성우', damage: true },
  { mode: 'quake', at: 5, expect: '지진 발생', damage: true },
  { mode: 'flood', at: 12, expect: '해일 경보' },
  { mode: 'fire', at: 10, expect: '화재 발생', burning: true },
  { mode: 'typhoon', at: 8, expect: '태풍 상륙' },
  { mode: 'tornado', at: 6, expect: '토네이도 발생', damage: true },
  { mode: 'volcano', at: 13, expect: '한라산 분화' }
].filter(c => !only.length || only.includes(c.mode));

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.route(/^https?:/, r => r.abort());

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
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
check('건물 84동 생성', await page.evaluate(() => window.__sim.BLD.length === 84));
const shot = name => page.screenshot({ path: join(shotDir, `${name}.jpg`), type: 'jpeg', quality: 82, timeout: 300000 });
if (takeShots) await shot('overview');

const simWait = async sec => {
  const start = await page.evaluate(() => window.__sim.S.time);
  await page.waitForFunction(t => window.__sim.S.time >= t, start + sec, { timeout: 900000, polling: 500 });
};

const box = await page.$eval('#view canvas', c => { const r = c.getBoundingClientRect(); return { x: r.left + r.width * 0.6, y: r.top + r.height * 0.55 }; });
await page.mouse.click(box.x, box.y);
await page.waitForTimeout(500);
check('지도 클릭으로 재난 실행', await page.evaluate(() => window.__sim.LOG.some(l => l.msg.includes('폭격기 진입'))));

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
    const s = window.__sim;
    const damaged = s.SEGS.filter(g => g.hp < g.maxHp - 0.01 || g.state > 0).length;
    const burning = s.SEGS.filter(g => g.fire === 1).length;
    return { log: s.LOG.map(l => l.msg), damaged, burning };
  });
  const parts = [`로그 "${c.expect}"`];
  let ok = st.log.some(m => m.includes(c.expect));
  if (c.damage) { ok = ok && st.damaged > 0; parts.push(`손상 구역 ${st.damaged}`); }
  if (c.burning) { ok = ok && (st.burning > 0 || st.log.some(m => m.includes('화재'))); parts.push(`화재 구역 ${st.burning}`); }
  check(`재난: ${c.mode}`, ok, parts.join(', '));
  if (takeShots) await shot(c.mode);
}

await page.evaluate(() => window.__sim.resetAll());
check('캠퍼스 복구', await page.evaluate(() => window.__sim.SEGS.every(g => g.state === 0 && g.hp === g.maxHp)));
check('실행 중 스크립트 오류 없음', errors.length === 0, errors.slice(0, 3).join(' / '));

await browser.close();
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} 통과`);
process.exit(failed ? 1 : 0);
