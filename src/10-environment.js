const WATER_U = {
  uLevel: { value: -999 }, uFront: { value: -900 }, uCrest: { value: 0 }, uTime: { value: 0 },
  uHeight: { value: heightTex }, uSunDir: { value: sunDir }, uSunCol: { value: sun.color },
  uSky: { value: skyUniforms.uHor.value }, uFogC: { value: scene.fog.color }, uFogD: { value: 0.00005 }, uNight: { value: 0 }, uFlow: { value: 1 }
};
const waterMat = new THREE.ShaderMaterial({
  uniforms: WATER_U, transparent: true, depthWrite: true,
  vertexShader: `
    uniform float uLevel, uFront, uCrest, uTime;
    varying vec3 vW; varying float vCrest;
    void main(){
      vec4 w = modelMatrix * vec4(position, 1.0);
      float dz = w.z - uFront;
      float dc = dz + 16.0;
      float crest = uCrest * exp(-dc * dc / 700.0);
      float behind = smoothstep(10.0, -60.0, dz);
      float waves = (sin(w.x * 0.11 + uTime * 1.7) * 0.18 + sin(w.z * 0.07 - uTime * 2.3) * 0.22 + sin((w.x + w.z) * 0.21 + uTime * 3.1) * 0.08) * (0.4 + behind);
      w.y = uLevel + waves + crest;
      vCrest = crest / max(uCrest, 0.001);
      vW = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: `
    uniform sampler2D uHeight; uniform float uFront, uTime, uNight, uFogD, uFlow; uniform vec3 uSunDir, uSunCol, uSky, uFogC;
    varying vec3 vW; varying float vCrest;
    float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
    void main(){
      if (vW.z > uFront + 4.0) discard;
      vec2 uv = (vW.xz + 850.0) / 1700.0;
      float th = texture2D(uHeight, uv).r;
      float depth = vW.y - th;
      if (depth < -0.6) discard;
      vec2 flow = vec2(0.0, uTime * 6.0 * uFlow);
      float n1 = vn(vW.xz * 0.12 - flow * 0.12), n2 = vn(vW.xz * 0.43 + vec2(uTime * 0.7, -uTime * 1.9 * uFlow));
      vec3 nrm = normalize(vec3((n1 - 0.5) * 0.5 + (n2 - 0.5) * 0.25, 1.0, (n2 - 0.5) * 0.5));
      vec3 V = normalize(cameraPosition - vW);
      float fres = pow(1.0 - max(dot(V, nrm), 0.0), 4.0);
      vec3 shallow = vec3(0.36, 0.33, 0.24), deep = vec3(0.07, 0.13, 0.15);
      vec3 col = mix(shallow, deep, smoothstep(0.0, 6.0, depth));
      col *= 0.55 + 0.45 * max(dot(nrm, normalize(uSunDir)), 0.0);
      col = mix(col, uSky * 0.9, fres * 0.6);
      vec3 H = normalize(normalize(uSunDir) + V);
      col += uSunCol * pow(max(dot(nrm, H), 0.0), 140.0) * 1.6 * (1.0 - uNight * 0.7);
      float foam = smoothstep(0.9, 0.0, depth) * (0.5 + 0.5 * n2);
      foam += smoothstep(0.35, 0.9, vCrest) * (0.55 + 0.45 * n1);
      foam += smoothstep(40.0, 0.0, uFront - vW.z) * smoothstep(0.45, 0.8, n2) * 0.8;
      col = mix(col, vec3(0.86, 0.87, 0.84) * (1.0 - uNight * 0.75), clamp(foam, 0.0, 1.0));
      col *= 1.0 - uNight * 0.6;
      float d = length(cameraPosition - vW);
      col = mix(uFogC, col, exp(-uFogD * uFogD * d * d));
      float a = clamp(0.62 + smoothstep(0.0, 3.0, depth) * 0.3 + foam * 0.2, 0.0, 0.95) * smoothstep(-0.6, 0.15, depth);
      gl_FragColor = vec4(col, a);
    }`
});
const waterMesh = new THREE.Mesh(new THREE.PlaneGeometry(3400, 3400, IS_MOBILE ? 180 : 280, IS_MOBILE ? 180 : 280).rotateX(-Math.PI / 2), waterMat);
waterMesh.visible = false;
waterMesh.frustumCulled = false;
waterMesh.renderOrder = 3;
scene.add(waterMesh);

const FLOOD = { on: false, phase: '', level: -999, target: 0, front: -900, speed: 0, crest: 0, t: 0, hit: new Set() };
function waterLevel() { return FLOOD.on ? FLOOD.level : -999; }
function waterAt(x, z) { return FLOOD.on && z < FLOOD.front ? FLOOD.level - H(x, z) : -1; }

const RAIN_N = IS_MOBILE ? 2600 : 5200;
const rainPos = new Float32Array(RAIN_N * 6), rainSeed = new Float32Array(RAIN_N * 3);
for (let i = 0; i < RAIN_N; i++) { rainSeed[i * 3] = rand(-1, 1); rainSeed[i * 3 + 1] = Math.random(); rainSeed[i * 3 + 2] = rand(-1, 1); }
const rainGeo = new THREE.BufferGeometry();
const rainAttr = new THREE.BufferAttribute(rainPos, 3).setUsage(THREE.DynamicDrawUsage);
rainGeo.setAttribute('position', rainAttr);
const rainMat = new THREE.LineBasicMaterial({ color: C('#c5cfd8'), transparent: true, opacity: 0, depthWrite: false, fog: true });
const rain = new THREE.LineSegments(rainGeo, rainMat);
rain.frustumCulled = false;
rain.renderOrder = 7;
scene.add(rain);
let rainPhase = 0;
function updateRain(dt) {
  const k = S.storm;
  rain.visible = k > 0.03;
  if (!rain.visible) return;
  rainMat.opacity = 0.42 * k * (1 - S.night * 0.4);
  const fall = 62;
  rainPhase += dt * fall / 220;
  const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
  const fwd = tmpV2.subVectors(controls.target, camera.position).setY(0).normalize();
  const bx = cx + fwd.x * 140, bz = cz + fwd.z * 140;
  const wx = S.wind.x * 0.028, wz = S.wind.y * 0.028;
  const n = Math.floor(RAIN_N * Math.min(1, k * 1.3));
  for (let i = 0; i < RAIN_N; i++) {
    const j = i * 6;
    if (i >= n) { rainPos[j + 1] = -9999; rainPos[j + 4] = -9999; continue; }
    const ph = (rainSeed[i * 3 + 1] + rainPhase) % 1;
    const y = cy + 120 - ph * 220;
    const x = bx + rainSeed[i * 3] * 210 + (1 - ph) * wx * 220, z = bz + rainSeed[i * 3 + 2] * 210 + (1 - ph) * wz * 220;
    rainPos[j] = x; rainPos[j + 1] = y; rainPos[j + 2] = z;
    rainPos[j + 3] = x - wx * 3.2; rainPos[j + 4] = y + 3.2; rainPos[j + 5] = z - wz * 3.2;
  }
  rainAttr.needsUpdate = true;
}

const boltMat = new THREE.MeshBasicMaterial({ color: C('#dfe8ff'), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
function lightningBolt(x, z, strike) {
  const gy = H(x, z);
  const top = new V3(x + rand(-80, 80), gy + 700, z + rand(-80, 80));
  const pts = [top.clone()];
  const n = 22;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const p = new V3(lerp(top.x, x, t), lerp(top.y, gy, t), lerp(top.z, z, t));
    if (i < n) { p.x += rand(-1, 1) * 26 * (1 - t * 0.6); p.z += rand(-1, 1) * 26 * (1 - t * 0.6); }
    pts.push(p);
  }
  const group = new THREE.Group();
  const mk = (arr, r) => {
    const curve = new THREE.CatmullRomCurve3(arr, false, 'centripetal', 0);
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, arr.length * 3, r, 4, false), boltMat);
    m.frustumCulled = false;
    group.add(m);
  };
  mk(pts, 1.5);
  for (let b = 0; b < 4; b++) {
    const s = 3 + Math.floor(Math.random() * 12);
    const br = [pts[s].clone()];
    const dir = new V3(rand(-1, 1), -0.8, rand(-1, 1)).normalize();
    for (let i = 1; i < 6; i++) br.push(br[i - 1].clone().addScaledVector(dir, rand(18, 34)).add(new V3(rand(-8, 8), 0, rand(-8, 8))));
    mk(br, 0.7);
  }
  scene.add(group);
  S.flash = Math.max(S.flash, 1);
  flashLight(new V3(x, gy + 30, z), C('#c8d6ff'), 9, 700, 0.35);
  let t = 0;
  const fn = dt => {
    t += dt;
    group.visible = t < 0.08 || (t > 0.13 && t < 0.22) || (t > 0.27 && t < 0.33);
    if (t > 0.4) { fn.dispose(); return false; }
    return true;
  };
  fn.dispose = () => { scene.remove(group); group.children.forEach(m => m.geometry.dispose()); };
  addEffect(fn);
  if (strike) {
    sprayBurst(x, gy + 1, z, 30, 14, 10, [1, 0.85, 0.6]);
    for (let i = 0; i < 18; i++) emitSpark(x, gy + 2, z, rand(-12, 12), rand(6, 20), rand(-12, 12), [0.8, 0.85, 1], rand(0.4, 1), 1.6);
  }
  sfx.thunder(x, gy + 100, z);
}

const VOLC = { on: false, t: 0, dur: 0, glow: 0, x: SUMMIT.x, z: SUMMIT.z, y: 0 };
VOLC.y = outerH(SUMMIT.x, SUMMIT.z) + 30;
function updateVolcano(dt) {
  const L = LIGHTS[5];
  if (!VOLC.on && VOLC.glow < 0.01) { L.intensity = 0; return; }
  VOLC.t += dt;
  const active = VOLC.on && VOLC.t < VOLC.dur;
  VOLC.glow = lerp(VOLC.glow, active ? 1 : 0, damp(active ? 2 : 0.3, dt));
  L.position.set(VOLC.x, VOLC.y + 300, VOLC.z);
  L.color.setRGB(1, 0.42, 0.12);
  L.distance = 9000; L.decay = 1;
  L.intensity = VOLC.glow * (6 + Math.sin(S.time * 9) * 1.5);
  if (active) {
    const k = Math.min(1, VOLC.t / 3);
    for (let i = 0; i < 7 * k; i++) {
      const a = Math.random() * TAU, r = rand(0, 120);
      smokePool.spawn({ x: VOLC.x + Math.cos(a) * r, y: VOLC.y + rand(0, 200), z: VOLC.z + Math.sin(a) * r,
        vx: rand(-20, 20), vy: rand(120, 260) * k, vz: rand(-20, 20), r: 0.12, g: 0.1, b: 0.09, life: rand(16, 26), s0: rand(280, 460), s1: rand(1100, 2000), a: 0.88, grav: -2, drag: 0.12, wind: 3, spin: rand(-0.2, 0.2) });
    }
    for (let i = 0; i < 10 * k * FX_BUDGET.fire; i++) {
      firePool.spawn({ x: VOLC.x + rand(-60, 60), y: VOLC.y, z: VOLC.z + rand(-60, 60), vx: rand(-90, 90), vy: rand(150, 330), vz: rand(-90, 90),
        r: 1, g: rand(0.25, 0.55), b: 0.04, life: rand(2, 4.5), s0: rand(70, 140), s1: 30, a: 1, grav: -80, drag: 0.05, wind: 0 });
    }
    if (Math.random() < dt * 1.5) lightningVolc();
  }
  if (VOLC.on && VOLC.t >= VOLC.dur) VOLC.on = false;
}
function lightningVolc() {
  const pts = [];
  const top = new V3(VOLC.x + rand(-300, 300), VOLC.y + rand(900, 1700), VOLC.z + rand(-300, 300));
  let p = top.clone();
  for (let i = 0; i < 12; i++) { pts.push(p.clone()); p.add(new V3(rand(-120, 120), -rand(60, 130), rand(-120, 120))); }
  const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0), 36, 9, 4, false), boltMat);
  m.frustumCulled = false;
  scene.add(m);
  let t = 0;
  const fn = dt => { t += dt; m.visible = t < 0.07 || (t > 0.12 && t < 0.2); if (t > 0.3) { fn.dispose(); return false; } return true; };
  fn.dispose = () => { scene.remove(m); m.geometry.dispose(); };
  addEffect(fn);
}

let groundT = 0, htT = 0, gustPhase = 0;
function updateEnvironment(dt) {
  gustPhase += dt;
  const ws = S.windT.length();
  S.gust = clamp((vnoise2(gustPhase * 0.6, 3.1) - 0.35) * 2, 0, 1) * Math.min(1, ws / 20);
  const g = 1 + S.gust * 0.7;
  S.wind.x = lerp(S.wind.x, S.windT.x * g, damp(0.8, dt));
  S.wind.y = lerp(S.wind.y, S.windT.y * g, damp(0.8, dt));
  WATER_U.uTime.value = S.time;
  WATER_U.uFogD.value = scene.fog.density;
  WATER_U.uNight.value = S.night;
  TERR_U.uTime.value = S.time;
  CITY_U.uNight.value = smooth(0.15, 0.7, S.night);
  CITY_U.uFogD.value = scene.fog.density;
  updateRain(dt);
  updateVolcano(dt);
  if (S.ash > 0.05) {
    const n = Math.floor(S.ash * 26 * FX_BUDGET.smoke);
    const cx = controls.target.x, cz = controls.target.z;
    const rad = 120 + camera.position.distanceTo(controls.target) * 0.5;
    for (let i = 0; i < n; i++) emitAsh(cx + rand(-rad, rad), camera.position.y + rand(20, 160), cz + rand(-rad, rad), rand(-1, 1), rand(-9, -5), rand(-1, 1), rand(0.4, 1.1), rand(7, 12));
  }
  groundT -= dt; htT -= dt;
  if (groundDirty && groundT <= 0) { groundTex.needsUpdate = true; groundDirty = false; groundT = 0.18; }
  if (heightTexDirty && htT <= 0) { updateHeightTex(); htT = 0.5; }
  flushTerrain();
}
