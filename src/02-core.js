const PARAMS = new URLSearchParams(location.search);
const TEST_MODE = PARAMS.has('test');
const QUALITY = PARAMS.get('quality');
const IS_MOBILE = QUALITY === 'low' || (QUALITY !== 'high' && (window.matchMedia('(max-width: 760px)').matches || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)));
const HAS_POST = typeof THREE.EffectComposer === 'function' && typeof THREE.UnrealBloomPass === 'function' && typeof THREE.ShaderPass === 'function';
const view = document.getElementById('view');

const renderer = new THREE.WebGLRenderer({ antialias: !HAS_POST, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, IS_MOBILE ? 1.25 : 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.outputEncoding = HAS_POST ? THREE.LinearEncoding : THREE.sRGBEncoding;
view.appendChild(renderer.domElement);

function C(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }
const V3 = THREE.Vector3;
const tmpV = new V3(), tmpV2 = new V3(), tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4(), tmpE = new THREE.Euler();
const UP = new V3(0, 1, 0);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(C('#b9c9d6'), 0.00005);

const camera = new THREE.PerspectiveCamera(42, 1, 3, 70000);
camera.position.set(400, 340, -800);
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.set(-50, 55, -60);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.488;
controls.minDistance = 25;
controls.maxDistance = 5200;
controls.screenSpacePanning = false;
controls.rotateSpeed = 0.6;
controls.zoomSpeed = 1.1;
controls.panSpeed = 0.9;

const S = {
  time: 0, real: 0, timeScale: 1, slowmo: false,
  storm: 0, stormT: 0, ash: 0, ashT: 0, flash: 0,
  wind: new THREE.Vector2(1.6, 2.2), windT: new THREE.Vector2(1.6, 2.2), gust: 0,
  night: 0, tod: 'day', sound: true, track: true, power: 5, mode: 'bomb',
  shake: 0, events: 0
};

const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.castShadow = true;
sun.shadow.mapSize.set(IS_MOBILE ? 2048 : 4096, IS_MOBILE ? 2048 : 4096);
Object.assign(sun.shadow.camera, { left: -760, right: 760, top: 760, bottom: -760, near: 40, far: 4200 });
sun.shadow.bias = -0.00035;
sun.shadow.normalBias = 0.8;
sun.target.position.set(0, 60, 0);
scene.add(sun, sun.target);

const LIGHTS = [];
for (let i = 0; i < 6; i++) {
  const l = new THREE.PointLight(0xff8a3a, 0, 260, 2);
  l.position.set(0, -5000, 0);
  scene.add(l);
  LIGHTS.push(l);
}
let flashSlot = 0;
const flashes = [];
function flashLight(pos, color, intensity, dist, dur) {
  const l = LIGHTS[3 + (flashSlot++ % 2)];
  l.position.copy(pos);
  l.color.copy(color);
  l.distance = dist;
  const f = flashes.find(q => q.l === l);
  if (f) { f.t = 0; f.dur = dur; f.i = intensity; }
  else flashes.push({ l, t: 0, dur, i: intensity });
  l.intensity = intensity;
}
function updateFlashes(dt) {
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i];
    f.t += dt;
    const k = Math.max(0, 1 - f.t / f.dur);
    f.l.intensity = f.i * k * k;
    if (k <= 0) { f.l.intensity = 0; flashes.splice(i, 1); }
  }
}

const GLSL_NOISE = `
float hash3(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash3(i+vec3(0.,0.,0.)),hash3(i+vec3(1.,0.,0.)),f.x), mix(hash3(i+vec3(0.,1.,0.)),hash3(i+vec3(1.,1.,0.)),f.x),f.y),
             mix(mix(hash3(i+vec3(0.,0.,1.)),hash3(i+vec3(1.,0.,1.)),f.x), mix(hash3(i+vec3(0.,1.,1.)),hash3(i+vec3(1.,1.,1.)),f.x),f.y), f.z); }
float fbm(vec3 p){ float s = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.02; a *= 0.5; } return s / 0.9375; }
`;

const skyUniforms = {
  uTop: { value: C('#3f73b5') }, uHor: { value: C('#c4d6e6') }, uBot: { value: C('#8c9aa6') },
  uSunDir: { value: new V3(0, 1, 0) }, uSunCol: { value: C('#fff1de') },
  uNight: { value: 0 }, uStorm: { value: 0 }, uAsh: { value: 0 }, uFlash: { value: 0 }, uTime: { value: 0 }
};
const skyMat = new THREE.ShaderMaterial({
  uniforms: skyUniforms,
  side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
  fragmentShader: GLSL_NOISE + `
    uniform vec3 uTop, uHor, uBot, uSunDir, uSunCol; uniform float uNight, uStorm, uAsh, uFlash, uTime;
    varying vec3 vDir;
    void main(){
      vec3 d = normalize(vDir);
      float h = d.y;
      vec3 col = mix(uHor, uTop, pow(clamp(h, 0.0, 1.0), 0.5));
      col = mix(col, uBot, smoothstep(0.0, -0.2, h));
      float s = max(dot(d, normalize(uSunDir)), 0.0);
      float clear = 1.0 - max(uStorm, uAsh);
      col += uSunCol * (pow(s, 900.0) * 30.0 * clear * (1.0 - uNight * 0.6) + pow(s, 14.0) * 0.28 * clear);
      if (h > 0.0) {
        vec3 sp = floor(d * 380.0);
        float r = hash3(sp);
        float tw = 0.6 + 0.4 * sin(uTime * 2.7 + r * 60.0);
        col += vec3(step(0.9972, r)) * uNight * tw * clear * 0.9 * smoothstep(0.0, 0.25, h);
        vec2 uv = d.xz / (h + 0.08) * 1.6;
        float c = fbm(vec3(uv * 1.3 + vec2(uTime * 0.006, uTime * 0.002), uTime * 0.01));
        float cov = mix(0.58, 0.18, max(uStorm, uAsh * 0.8));
        float cl = smoothstep(cov, cov + 0.22, c);
        vec3 cloudLit = mix(vec3(1.0), uHor * 1.1 + uSunCol * 0.15, 0.35);
        vec3 cloudCol = mix(cloudLit, vec3(0.16, 0.17, 0.19), uStorm * 0.85);
        cloudCol = mix(cloudCol, vec3(0.18, 0.14, 0.12), uAsh * 0.9);
        cloudCol *= mix(1.0, 0.05, uNight);
        col = mix(col, cloudCol, cl * smoothstep(0.0, 0.2, h) * 0.9);
      }
      col = mix(col, vec3(0.32, 0.25, 0.2) * (1.0 - uNight * 0.7), uAsh * 0.55 * smoothstep(-0.1, 0.5, h + 0.1));
      col += uFlash * vec3(0.75, 0.8, 1.0);
      gl_FragColor = vec4(col, 1.0);
    }`
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(60000, 32, 16), skyMat);
sky.renderOrder = -10;
sky.frustumCulled = false;
scene.add(sky);


const TIMERS = [];
function later(delay, fn) { TIMERS.push({ t: S.time + delay, fn }); }
function updateTimers() {
  for (let i = TIMERS.length - 1; i >= 0; i--) {
    if (i >= TIMERS.length) continue;
    if (S.time >= TIMERS[i].t) { const f = TIMERS[i].fn; TIMERS.splice(i, 1); f(); }
  }
}

const TOD_PRESETS = {
  day: { elev: 41, az: 168, sun: '#fff0dc', sunI: 2.7, sky: '#c0d6ee', gnd: '#5d5440', hemiI: 1.15, top: '#3c70b4', hor: '#c7d8e7', bot: '#8b98a3', fog: '#bccbd8', fogD: 0.000048, exp: 1.0, night: 0, bS: 0.5, bT: 0.88, bR: 0.5 },
  dusk: { elev: 4.5, az: 252, sun: '#ffa463', sunI: 2.3, sky: '#8f8fb8', gnd: '#4a3a30', hemiI: 0.75, top: '#273a6c', hor: '#f29a62', bot: '#5c4c4a', fog: '#c6977c', fogD: 0.00006, exp: 1.08, night: 0.35, bS: 0.75, bT: 0.75, bR: 0.55 },
  night: { elev: 36, az: 128, sun: '#98aeff', sunI: 0.42, sky: '#2c3a5c', gnd: '#141414', hemiI: 0.5, top: '#03060f', hor: '#17213a', bot: '#080b12', fog: '#111a2c', fogD: 0.00007, exp: 1.2, night: 1, bS: 1.05, bT: 0.45, bR: 0.6 }
};
const todCur = {}, todTgt = {};
function todSnapshot(p) {
  return {
    elev: p.elev, az: p.az, sun: C(p.sun), sunI: p.sunI, sky: C(p.sky), gnd: C(p.gnd), hemiI: p.hemiI,
    top: C(p.top), hor: C(p.hor), bot: C(p.bot), fog: C(p.fog), fogD: p.fogD, exp: p.exp, night: p.night, bS: p.bS, bT: p.bT, bR: p.bR
  };
}
Object.assign(todCur, todSnapshot(TOD_PRESETS.day));
Object.assign(todTgt, todSnapshot(TOD_PRESETS.day));
function setTOD(name, instant) {
  S.tod = name;
  Object.assign(todTgt, todSnapshot(TOD_PRESETS[name]));
  if (instant) Object.assign(todCur, todSnapshot(TOD_PRESETS[name]));
}

const STORM_SKY = { top: C('#3e464f'), hor: C('#5f676f'), fog: C('#59626b') };
const ASH_SKY = { top: C('#2b2420'), hor: C('#6a5442'), fog: C('#4f4137'), sun: C('#ff8a4a') };
const tmpC = new THREE.Color(), tmpC2 = new THREE.Color();
const sunDir = new V3();
const todListeners = [];

function updateTOD(dt) {
  const k = damp(1.6, dt);
  for (const key of ['elev', 'az', 'sunI', 'hemiI', 'fogD', 'exp', 'night', 'bS', 'bT', 'bR']) todCur[key] = lerp(todCur[key], todTgt[key], k);
  for (const key of ['sun', 'sky', 'gnd', 'top', 'hor', 'bot', 'fog']) todCur[key].lerp(todTgt[key], k);
  S.storm = lerp(S.storm, S.stormT, damp(0.9, dt));
  S.ash = lerp(S.ash, S.ashT, damp(0.5, dt));
  S.flash = Math.max(0, S.flash - dt * 6);
  const st = S.storm, as = S.ash;
  const el = THREE.MathUtils.degToRad(todCur.elev), az = THREE.MathUtils.degToRad(todCur.az);
  sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)).normalize();
  sun.position.copy(sunDir).multiplyScalar(2400).add(sun.target.position);
  sun.color.copy(todCur.sun).lerp(ASH_SKY.sun, as * 0.6);
  sun.intensity = todCur.sunI * (1 - 0.82 * st) * (1 - 0.72 * as) + S.flash * 0.5;
  hemi.color.copy(todCur.sky).lerp(STORM_SKY.hor, st * 0.6).lerp(ASH_SKY.hor, as * 0.5);
  hemi.groundColor.copy(todCur.gnd);
  hemi.intensity = todCur.hemiI * (1 - 0.35 * st) * (1 - 0.3 * as) + S.flash * 2.2;
  skyUniforms.uTop.value.copy(todCur.top).lerp(STORM_SKY.top, st * 0.85 * (1 - todCur.night * 0.7)).lerp(ASH_SKY.top, as * 0.85);
  skyUniforms.uHor.value.copy(todCur.hor).lerp(STORM_SKY.hor, st * 0.85 * (1 - todCur.night * 0.7)).lerp(ASH_SKY.hor, as * 0.8);
  skyUniforms.uBot.value.copy(todCur.bot);
  skyUniforms.uSunDir.value.copy(sunDir);
  skyUniforms.uSunCol.value.copy(sun.color);
  skyUniforms.uNight.value = todCur.night;
  skyUniforms.uStorm.value = st;
  skyUniforms.uAsh.value = as;
  skyUniforms.uFlash.value = S.flash;
  skyUniforms.uTime.value = S.time;
  scene.fog.color.copy(todCur.fog).lerp(STORM_SKY.fog, st * 0.85 * (1 - todCur.night * 0.7)).lerp(ASH_SKY.fog, as * 0.85);
  scene.fog.density = todCur.fogD * (1 + st * 7 + as * 2.6);
  renderer.toneMappingExposure = todCur.exp * (1 - st * 0.08);
  S.night = Math.max(todCur.night, st * 0.55, as * 0.6);
  if (bloomPass) {
    bloomPass.strength = todCur.bS + S.flash * 0.6;
    bloomPass.threshold = todCur.bT;
    bloomPass.radius = todCur.bR;
  }
  for (const f of todListeners) f(dt);
}

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.3 }, uFlash: { value: 0 }, uFlashCol: { value: new THREE.Color(1, 0.96, 0.9) }, uSat: { value: 1.06 }, uTint: { value: new THREE.Color(1, 1, 1) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVig, uFlash, uSat; uniform vec3 uFlashCol, uTint; varying vec2 vUv;
    vec3 toSRGB(vec3 c){ c = max(c, vec3(0.0)); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb * uTint;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c = toSRGB(c);
      vec2 d = vUv - 0.5;
      c *= 1.0 - uVig * dot(d, d) * 1.7;
      c = mix(c, uFlashCol, clamp(uFlash, 0.0, 1.0));
      gl_FragColor = vec4(c, 1.0);
    }`
};

let composer = null, bloomPass = null, gradePass = null;
function setupComposer() {
  if (!HAS_POST) return;
  try {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat };
    let rt;
    if (renderer.capabilities.isWebGL2 && THREE.WebGLMultisampleRenderTarget) {
      rt = new THREE.WebGLMultisampleRenderTarget(size.x, size.y, opts);
      rt.samples = IS_MOBILE ? 2 : 4;
    } else {
      rt = new THREE.WebGLRenderTarget(size.x, size.y, opts);
    }
    composer = new THREE.EffectComposer(renderer, rt);
    composer.addPass(new THREE.RenderPass(scene, camera));
    bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.5, 0.5, 0.88);
    composer.addPass(bloomPass);
    gradePass = new THREE.ShaderPass(GradeShader);
    composer.addPass(gradePass);
  } catch (e) {
    console.warn('postprocessing disabled', e);
    composer = null; bloomPass = null; gradePass = null;
    renderer.outputEncoding = THREE.sRGBEncoding;
  }
}

const POINT_SCALE = { value: 600 };
function resize() {
  const w = view.clientWidth, h = view.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (composer) composer.setSize(w, h);
  POINT_SCALE.value = (h * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
}

const overlayFlash = { v: 0 };
function screenFlash(v) { overlayFlash.v = Math.max(overlayFlash.v, v); }
function addShake(v) { S.shake = Math.max(S.shake, v); }
