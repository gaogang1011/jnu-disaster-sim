const $ = s => document.querySelector(s);
const ui = {
  modes: $('#modes'), power: $('#power'), powerOut: $('#powerOut'), info: $('#modeInfo'), desc: $('#modeDesc'),
  log: $('#log'), hint: $('#hint'), tip: $('#tip'), labels: $('#labels'), loader: $('#loader'), loadBar: $('#loadBar'), loadMsg: $('#loadMsg'),
  sDamage: $('#sDamage'), sDamageBar: $('#sDamageBar'), sCollapsed: $('#sCollapsed'), sFire: $('#sFire'), sTrees: $('#sTrees'), sPeople: $('#sPeople'), sCars: $('#sCars'), sDamaged: $('#sDamaged'),
  clock: $('#clock'), active: $('#activeList')
};

const LOG = [];
function fmtTime(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; }
function logEvent(msg, level, bname) {
  const last = LOG[0];
  if (last && last.msg === msg && S.time - last.t < 2) return;
  LOG.unshift({ msg, level: level || 'info', t: S.time });
  if (LOG.length > 60) LOG.length = 60;
  const li = document.createElement('li');
  li.className = 'lv-' + (level || 'info');
  li.innerHTML = `<span class="t">${fmtTime(S.time)}</span><span class="m"></span>`;
  li.querySelector('.m').textContent = msg;
  const empty = ui.log.querySelector('.empty');
  if (empty) empty.remove();
  ui.log.prepend(li);
  while (ui.log.children.length > 40) ui.log.lastChild.remove();
}

function buildModeButtons() {
  ui.modes.innerHTML = '';
  for (const [id, d] of Object.entries(DISASTERS)) {
    const b = document.createElement('button');
    b.className = 'mode'; b.dataset.mode = id; b.id = 'mode-' + id;
    b.setAttribute('aria-pressed', String(id === S.mode));
    b.innerHTML = `<span class="k">${d.key}</span><span class="n">${d.name}</span>`;
    ui.modes.appendChild(b);
  }
}
function setMode(m) {
  S.mode = m;
  document.querySelectorAll('.mode').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  refreshModeInfo();
}
function refreshModeInfo() {
  const d = DISASTERS[S.mode], P = S.power;
  ui.powerOut.textContent = P;
  ui.info.textContent = d.info(P);
  ui.desc.textContent = d.desc;
  const verb = d.radius(P) > 0 ? '지도를 클릭해 위치를 정하세요' : '지도 아무 곳이나 클릭하면 시작됩니다';
  ui.hint.innerHTML = `<b>${d.name}</b><span>${verb}</span><span class="sub">드래그 회전 · 우클릭 이동 · 휠 확대</span>`;
}
ui.modes.addEventListener('click', e => { const b = e.target.closest('.mode'); if (b) setMode(b.dataset.mode); });
ui.power.addEventListener('input', () => { S.power = +ui.power.value; refreshModeInfo(); });
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  for (const [id, d] of Object.entries(DISASTERS)) if (e.key === d.key) setMode(id);
});

function bindToggle(id, key, onChange) {
  const el = $(id);
  const sync = () => el.setAttribute('aria-pressed', String(!!S[key]));
  el.addEventListener('click', () => { S[key] = !S[key]; sync(); if (onChange) onChange(S[key]); });
  sync();
}
S.respond = true; S.labels = true;
bindToggle('#tSlow', 'slowmo');
bindToggle('#tTrack', 'track', v => { if (!v) camRelease(); });
bindToggle('#tRespond', 'respond', v => { if (!v) clearTrucks(); });
bindToggle('#tSound', 'sound', v => { sfx.init(); sfx.setEnabled(v); });
bindToggle('#tLabels', 'labels', v => { ui.labels.hidden = !v; });
document.querySelectorAll('[data-tod]').forEach(b => b.addEventListener('click', () => {
  setTOD(b.dataset.tod);
  document.querySelectorAll('[data-tod]').forEach(o => o.setAttribute('aria-pressed', String(o === b)));
}));
$('#reset').addEventListener('click', resetAll);

function resetAll() {
  resetHazards();
  resetGround();
  resetBuildings();
  resetTrees();
  resetAgents();
  resetWindmill();
  clearDebris();
  clearPools();
  clearEffects();
  updateHeightTex();
  S.shake = 0; overlayFlash.v = 0;
  LOG.length = 0;
  ui.log.innerHTML = '<li class="empty">캠퍼스를 복구했습니다. 재난을 골라 지도를 클릭하세요.</li>';
  updateStats(true);
}

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function setNDC(e) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
}
function groundAt(e) {
  setNDC(e);
  const p = pickGround(raycaster.ray);
  if (!p || Math.abs(p.x) > 845 || Math.abs(p.z) > 845) return null;
  return p;
}
let down = null, hoverT = 0, lastMove = null;
const cv = renderer.domElement;
cv.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now(), b: e.button }; sfx.init(); });
cv.addEventListener('pointermove', e => { lastMove = e; });
cv.addEventListener('pointerleave', () => { lastMove = null; TERR_U.uMarker.value.w = 0; TERR_U.uMarker2.value.w = 0; ui.tip.hidden = true; });
cv.addEventListener('pointerup', e => {
  if (!down || down.b !== 0) { down = null; return; }
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dur = performance.now() - down.t;
  down = null;
  if (moved > 7 || dur > 700) return;
  const d = DISASTERS[S.mode];
  const p = groundAt(e);
  if (!p && d.radius(S.power) > 0) return;
  d.run(p ? p.x : 0, p ? p.z : 0);
  updateStats(true);
});
controls.addEventListener('start', () => { if (CAM.mode !== 'free' || FLY) { CAM.mode = 'free'; FLY = null; } });

function updateHover(dt) {
  hoverT -= dt;
  if (!lastMove || hoverT > 0) return;
  hoverT = 0.07;
  const e = lastMove;
  if (e.pointerType !== 'mouse') return;
  const d = DISASTERS[S.mode], r = d.radius(S.power);
  const p = groundAt(e);
  if (p && r > 0) {
    if (d.ring2) { TERR_U.uMarker2.value.set(p.x, p.z, r, 1); TERR_U.uMarker.value.set(p.x, p.z, Math.max(6, r * 0.08), 1); }
    else { TERR_U.uMarker.value.set(p.x, p.z, r, 1); TERR_U.uMarker2.value.w = 0; }
  } else { TERR_U.uMarker.value.w = 0; TERR_U.uMarker2.value.w = 0; }
  setNDC(e);
  const hit = raycaster.intersectObjects(SEG_MESHES, false)[0];
  if (hit) {
    const b = hit.object.userData.seg.b;
    const info = buildingInfo(b);
    ui.tip.hidden = false;
    ui.tip.querySelector('.bn').textContent = b.name;
    const st = ui.tip.querySelector('.st');
    st.textContent = info.state;
    st.dataset.s = info.state;
    ui.tip.querySelector('.meta').textContent = `${b.levels}층 · 구조 건전도 ${Math.round(info.integrity * 100)}%`;
    ui.tip.querySelector('.bar i').style.width = Math.round(info.integrity * 100) + '%';
    const vr = view.getBoundingClientRect();
    const x = Math.min(e.clientX - vr.left + 16, vr.width - 230), y = Math.min(e.clientY - vr.top + 18, vr.height - 90);
    ui.tip.style.transform = `translate(${x}px, ${y}px)`;
  } else ui.tip.hidden = true;
}

const LABELS = [];
function buildLabels() {
  const want = ['본관', '중앙도서관', '학생회관', '아라뮤즈홀', '제주대학교 박물관', '체육관', '의과대학', '공과대학 4호관', '학생생활관 6호관 E동', '인문대학 1호관', '해양과학대학 1호관', '사범대학 1호관'];
  for (const n of want) {
    const b = BLD.find(q => q.name === n);
    if (b) LABELS.push({ name: n.replace('제주대학교 ', ''), x: b.cx, y: b.yTop + 6, z: b.cz, b });
  }
  const P = DATA.P;
  LABELS.push({ name: '대운동장', x: P.stadium[0], y: H(P.stadium[0], P.stadium[1]) + 6, z: P.stadium[1], place: true });
  LABELS.push({ name: '권제오름', x: P.gwonje[0], y: H(P.gwonje[0], P.gwonje[1]) + 22, z: P.gwonje[1], place: true });
  LABELS.push({ name: '정문', x: P.mainGate[0], y: H(P.mainGate[0], P.mainGate[1]) + 6, z: P.mainGate[1], place: true });
  LABELS.push({ name: '풍력발전기', x: P.windmill[0], y: H(P.windmill[0], P.windmill[1]) + 38, z: P.windmill[1], place: true });
  LABELS.push({ name: '한라산', x: SUMMIT.x, y: outerH(SUMMIT.x, SUMMIT.z) + 250, z: SUMMIT.z, place: true, far: true });
  for (const l of LABELS) {
    const el = document.createElement('div');
    el.className = 'lbl' + (l.place ? ' place' : '');
    el.textContent = l.name;
    ui.labels.appendChild(el);
    l.el = el;
  }
}
const lv = new V3();
function updateLabels() {
  if (!S.labels) return;
  const w = view.clientWidth, h = view.clientHeight;
  for (const l of LABELS) {
    lv.set(l.x, l.y, l.z);
    const d = camera.position.distanceTo(lv);
    lv.project(camera);
    const vis = lv.z < 1 && Math.abs(lv.x) < 1.05 && Math.abs(lv.y) < 1.05 && (l.far || d < 1500);
    if (!vis) { if (!l.el.hidden) l.el.hidden = true; continue; }
    l.el.hidden = false;
    let dead = false;
    if (l.b) { const st = buildingInfo(l.b).state; dead = st === '붕괴'; l.el.dataset.s = st; }
    l.el.style.transform = `translate(${((lv.x + 1) / 2) * w}px, ${((1 - lv.y) / 2) * h}px) translate(-50%, -100%)`;
    l.el.style.opacity = l.far ? 0.9 : clamp(1.25 - d / 1300, 0.35, 1) * (dead ? 0.55 : 1);
  }
}

let FLY = null;
function camFly(pos, tgt, dur) { FLY = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: tgt, t: 0, dur }; }
const shakeOff = new V3(), camOff = new V3();
function updateCamera(rdt) {
  camera.position.sub(shakeOff);
  if (FLY) {
    FLY.t += rdt;
    const k = smooth(0, 1, FLY.t / FLY.dur);
    camera.position.lerpVectors(FLY.p0, FLY.p1, k);
    controls.target.lerpVectors(FLY.t0, FLY.t1, k);
    if (FLY.t >= FLY.dur) FLY = null;
  } else if (CAM.mode !== 'free' && CAM.get) {
    const g = CAM.get();
    camOff.subVectors(camera.position, controls.target);
    const k = damp(CAM.mode === 'follow' ? 4 : 2.2, rdt);
    controls.target.lerp(g, k);
    if (CAM.dist) {
      const L = camOff.length();
      camOff.setLength(lerp(L, CAM.dist, damp(1.4, rdt)));
      if (camOff.y < CAM.dist * 0.28) camOff.y = lerp(camOff.y, CAM.dist * 0.28, damp(2, rdt));
    }
    camera.position.copy(controls.target).add(camOff);
    if (CAM.mode === 'focus' && S.real > CAM.until) camRelease();
  }
  controls.update();
  const minY = H(camera.position.x, camera.position.z) + 6;
  if (camera.position.y < minY) camera.position.y = minY;
  S.shake = Math.min(S.shake, 3) * Math.exp(-rdt * 4.5);
  const sk = S.shake * (S.slowmo ? 0.5 : 1) * Math.min(1, camera.position.distanceTo(controls.target) / 300 + 0.3);
  shakeOff.set(Math.sin(S.real * 61) + Math.sin(S.real * 37), Math.sin(S.real * 53) * 0.8, Math.sin(S.real * 47) + Math.sin(S.real * 29)).multiplyScalar(sk);
  camera.position.add(shakeOff);
}

let statT = 0;
function updateStats(force) {
  statT -= 1 / 60;
  if (!force && statT > 0) return;
  statT = 0.3;
  let tot = 0, ok = 0, col = 0, dmg = 0, fireB = 0;
  for (const b of BLD) {
    if (b.style === 'house' || !pointInPoly(b.cx, b.cz, DATA.campus)) continue;
    const i = buildingInfo(b);
    tot += b.area; ok += b.area * i.integrity;
    if (i.state === '붕괴' || i.state === '부분 붕괴') col++;
    else if (i.state !== '정상') dmg++;
    if (i.burning) fireB++;
  }
  let treeDown = 0;
  for (let i = 0; i < T.n; i++) if (T.st[i] >= 2 || T.tilt[i] > 0.9) treeDown++;
  const dead = PED.reduce((a, p) => a + (p.alive ? 0 : 1), 0);
  const cars = CARS.reduce((a, c) => a + (c.alive ? 0 : 1), 0);
  const dmgPct = tot ? (1 - ok / tot) * 100 : 0;
  ui.sDamage.textContent = dmgPct < 10 && dmgPct > 0 ? dmgPct.toFixed(1) : Math.round(dmgPct);
  ui.sDamageBar.style.width = Math.min(100, dmgPct) + '%';
  ui.sDamageBar.dataset.level = dmgPct > 40 ? 'crit' : dmgPct > 10 ? 'warn' : 'ok';
  ui.sCollapsed.textContent = col;
  ui.sDamaged.textContent = dmg;
  ui.sFire.textContent = fireB + (burningTrees.size ? ` / ${burningTrees.size}` : '');
  ui.sTrees.textContent = treeDown;
  ui.sPeople.textContent = dead;
  ui.sCars.textContent = cars;
  const act = [];
  if (ACTIVE.jets) act.push('폭격기 접근');
  if (PROJ.length) act.push(`낙하체 ${PROJ.length}`);
  if (QUAKES.length) act.push('지진');
  if (FLOOD.on) act.push('해일');
  if (TYPH.on) act.push('태풍');
  if (TORN.length) act.push('토네이도');
  if (VOLC.on || VBOMB.on) act.push('분화');
  if (fireB || burningTrees.size) act.push('화재');
  if (TRUCKS.length) act.push(`소방차 ${TRUCKS.length}`);
  ui.active.textContent = act.length ? act.join(' · ') : '평상시';
  ui.active.dataset.on = act.length ? '1' : '0';
  ui.clock.textContent = fmtTime(S.time);
}

let perfAvg = 16, perfT = 0;
function adaptBudget(rdt) {
  perfAvg = lerp(perfAvg, rdt * 1000, 0.05);
  perfT -= rdt;
  if (perfT > 0) return;
  perfT = 1;
  const b = perfAvg > 34 ? 0.45 : perfAvg > 24 ? 0.7 : 1;
  FX_BUDGET.fire = FX_BUDGET.smoke = FX_BUDGET.spark = b;
}

let last = performance.now();
function frame(now) {
  const rdt = Math.min(TEST_MODE ? 0.11 : 0.05, (now - last) / 1000);
  last = now;
  S.real += rdt;
  const dt = rdt * (S.slowmo ? 0.28 : 1);
  S.time += dt;
  adaptBudget(rdt);
  updateTimers();
  updateTOD(rdt);
  updateEnvironment(dt);
  updateHazards(dt);
  updateBuildings(dt);
  updateTrees(dt);
  updateLamps();
  updateWindmill(dt);
  updateAgents(dt);
  updateDebris(dt);
  updatePools(dt);
  updateEffects(dt);
  updateFlashes(dt);
  updateCamera(rdt);
  updateHover(rdt);
  updateLabels();
  updateStats();
  overlayFlash.v = Math.max(0, overlayFlash.v - rdt * 2.2);
  if (composer) {
    gradePass.uniforms.uFlash.value = overlayFlash.v;
    gradePass.uniforms.uVig.value = 0.32 + S.storm * 0.15 + S.ash * 0.2;
    composer.render();
  } else renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

const STEPS = [
  ['지형과 토지 이용 분석', () => paintClass()],
  ['지표 텍스처 그리기', () => paintGround()],
  [`건물 ${DATA.B.length}동 세우기`, () => buildCampus()],
  ['수목과 가로등 배치', () => { placeTrees(); placeLamps(); }],
  ['사람과 차량 배치', () => initAgents()],
  ['조명과 대기 계산', () => { setupComposer(); resize(); setTOD('day', true); updateTOD(1); updateHeightTex(); buildLabels(); }]
];
function boot(i) {
  if (i >= STEPS.length) {
    ui.loader.classList.add('done');
    document.body.dataset.ready = '1';
    setTimeout(() => { ui.loader.hidden = true; }, 700);
    logEvent('시뮬레이션 준비 완료', 'ok');
    updateStats(true);
    requestAnimationFrame(t => { last = t; frame(t); });
    return;
  }
  ui.loadMsg.textContent = STEPS[i][0];
  ui.loadBar.style.width = Math.round((i / STEPS.length) * 100) + '%';
  setTimeout(() => {
    try { STEPS[i][1](); } catch (err) { ui.loadMsg.textContent = '불러오기 실패: ' + err.message; console.error(err); return; }
    boot(i + 1);
  }, 30);
}

new ResizeObserver(resize).observe(view);
buildModeButtons();
S.track = true;
$('#tTrack').setAttribute('aria-pressed', 'true');
setMode('bomb');
resize();
boot(0);
if (TEST_MODE) window.__sim = { PROJ, TORN, VOLC, TYPH, LOG, SEGS, BLD, scene, camera, controls, renderer, FACADES, S, DISASTERS, T, PED, CARS, setMode, H, TERR_U, FLOOD, setTOD, resetAll, camFly };
