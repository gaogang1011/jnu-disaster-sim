const FX_BUDGET = { fire: 1, smoke: 1, spark: 1 };

function ptMaterial(blending, soft) {
  return new THREE.ShaderMaterial({
    uniforms: { uScale: POINT_SCALE, uFogC: { value: scene.fog.color }, uFogD: { value: scene.fog.density } },
    transparent: true, depthWrite: false, depthTest: true, blending,
    vertexShader: `
      attribute vec3 aColor; attribute float aSize; attribute float aAlpha; attribute float aRot;
      uniform float uScale; varying vec3 vColor; varying float vAlpha; varying float vRot; varying float vFog;
      uniform float uFogD;
      void main(){ vColor = aColor; vAlpha = aAlpha; vRot = aRot;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float d = -mv.z; vFog = exp(-uFogD * uFogD * d * d);
        gl_PointSize = aSize * uScale / max(d, 1.0);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `
      precision highp float;
      varying vec3 vColor; varying float vAlpha; varying float vRot; varying float vFog;
      uniform vec3 uFogC;
      void main(){
        vec2 pc = gl_PointCoord - 0.5;
        float c = cos(vRot), s = sin(vRot);
        vec2 p = vec2(c * pc.x - s * pc.y, s * pc.x + c * pc.y);
        float r = length(p);
        float a = ${soft ? 'smoothstep(0.5, 0.06, r)' : 'smoothstep(0.5, 0.12, r)'} * vAlpha;
        if (a < 0.004) discard;
        vec3 col = ${soft ? 'mix(uFogC, vColor, vFog)' : 'vColor'};
        gl_FragColor = vec4(col, a * ${soft ? '1.0' : 'vFog'});
      }`
  });
}

class Pool {
  constructor(max, blending, soft, order) {
    this.max = max; this.cur = 0; this.live = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.rot = new Float32Array(max);
    this.spin = new Float32Array(max);
    this.life = new Float32Array(max);
    this.max_life = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.wind = new Float32Array(max);
    this.kind = new Uint8Array(max);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    this.aRot = new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('aColor', this.aCol);
    g.setAttribute('aSize', this.aSize);
    g.setAttribute('aAlpha', this.aAlpha);
    g.setAttribute('aRot', this.aRot);
    g.setDrawRange(0, 0);
    g.boundingSphere = new THREE.Sphere(new V3(), 1e9);
    this.geo = g;
    this.points = new THREE.Points(g, ptMaterial(blending, soft));
    this.points.frustumCulled = false;
    this.points.renderOrder = order;
    scene.add(this.points);
  }
  spawn(o) {
    const i = this.cur; this.cur = (this.cur + 1) % this.max;
    const j = i * 3;
    this.pos[j] = o.x; this.pos[j + 1] = o.y; this.pos[j + 2] = o.z;
    this.vel[j] = o.vx; this.vel[j + 1] = o.vy; this.vel[j + 2] = o.vz;
    this.col[j] = o.r; this.col[j + 1] = o.g; this.col[j + 2] = o.b;
    this.life[i] = o.life; this.max_life[i] = o.life;
    this.s0[i] = o.s0; this.s1[i] = o.s1; this.a0[i] = o.a;
    this.grav[i] = o.grav || 0; this.drag[i] = o.drag || 0; this.wind[i] = o.wind || 0;
    this.rot[i] = Math.random() * TAU; this.spin[i] = o.spin || 0;
    this.kind[i] = o.kind || 0;
    this.size[i] = o.s0; this.alpha[i] = 0;
    if (i >= this.live) this.live = i + 1;
  }
  update(dt) {
    let hi = 0;
    const wx = S.wind.x, wz = S.wind.y;
    for (let i = 0; i < this.live; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.alpha[i] = 0; this.size[i] = 0; continue; }
      const j = i * 3;
      const t = 1 - this.life[i] / this.max_life[i];
      const dg = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[j] = this.vel[j] * dg + wx * this.wind[i] * dt;
      this.vel[j + 1] = this.vel[j + 1] * dg + this.grav[i] * dt;
      this.vel[j + 2] = this.vel[j + 2] * dg + wz * this.wind[i] * dt;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.kind[i] === 1) {
        const gh = H(this.pos[j], this.pos[j + 2]);
        if (this.pos[j + 1] < gh) { this.pos[j + 1] = gh; this.vel[j + 1] = 0; this.vel[j] *= 0.6; this.vel[j + 2] *= 0.6; this.wind[i] = 0.4; }
      }
      this.rot[i] += this.spin[i] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.alpha[i] = this.a0[i] * Math.min(1, (1 - t) * 2.2) * Math.min(1, t * 10 + 0.15);
      hi = i + 1;
    }
    this.live = hi;
    this.geo.setDrawRange(0, hi);
    if (hi) {
      this.aPos.updateRange.count = hi * 3; this.aCol.updateRange.count = hi * 3;
      this.aSize.updateRange.count = hi; this.aAlpha.updateRange.count = hi; this.aRot.updateRange.count = hi;
      this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = this.aAlpha.needsUpdate = this.aRot.needsUpdate = true;
    }
  }
  clear() { this.live = 0; this.cur = 0; this.life.fill(0); this.alpha.fill(0); this.geo.setDrawRange(0, 0); }
}

const firePool = new Pool(IS_MOBILE ? 7000 : 13000, THREE.AdditiveBlending, false, 6);
const smokePool = new Pool(IS_MOBILE ? 4200 : 8000, THREE.NormalBlending, true, 4);
const sparkPool = new Pool(IS_MOBILE ? 3000 : 6000, THREE.AdditiveBlending, false, 7);
const ashPool = new Pool(IS_MOBILE ? 3000 : 6000, THREE.NormalBlending, true, 5);
const POOLS = [firePool, smokePool, sparkPool, ashPool];

function emitFlame(x, y, z, vx, vy, vz, size) {
  const h = Math.random();
  firePool.spawn({ x, y, z, vx: vx + rand(-0.6, 0.6), vy, vz: vz + rand(-0.6, 0.6),
    r: 1, g: 0.32 + h * 0.5, b: h * h * 0.14, life: rand(0.45, 1.0), s0: size, s1: size * 0.3, a: 0.9, grav: 7, drag: 1.4, wind: 0.25, spin: rand(-2, 2) });
  if (Math.random() < 0.25) smokePool.spawn({ x, y: y + size * 0.3, z, vx: vx * 0.3, vy: vy * 0.7 + 1.5, vz: vz * 0.3,
    r: 0.14, g: 0.12, b: 0.1, life: rand(1.2, 2.4), s0: size * 0.7, s1: size * 2.4, a: 0.3, grav: 1.6, drag: 0.9, wind: 0.7, spin: rand(-0.6, 0.6) });
}
function emitSmoke(x, y, z, vx, vy, vz, size, r, g, b, life, a) {
  smokePool.spawn({ x, y, z, vx, vy, vz, r, g, b, life, s0: size, s1: size * rand(2.5, 4), a, grav: 1.2, drag: 0.8, wind: 1, spin: rand(-0.5, 0.5) });
}
function emitSpark(x, y, z, vx, vy, vz, col, life, size) {
  sparkPool.spawn({ x, y, z, vx, vy, vz, r: col ? col[0] : 1, g: col ? col[1] : 0.7, b: col ? col[2] : 0.3, life, s0: size || 1.4, s1: 0.2, a: 1, grav: -42, drag: 0.5, wind: 0.1, kind: 1 });
}
function emitAsh(x, y, z, vx, vy, vz, size, life) {
  ashPool.spawn({ x, y, z, vx, vy, vz, r: 0.1, g: 0.09, b: 0.085, life, s0: size, s1: size * 1.3, a: 0.5, grav: -3.5, drag: 0.6, wind: 1.2, spin: rand(-1, 1), kind: 1 });
}
function updatePools(dt) {
  firePool.material = firePool.points.material;
  for (const p of POOLS) {
    p.points.material.uniforms.uFogD.value = scene.fog.density;
    p.update(dt);
  }
}
function clearPools() { for (const p of POOLS) p.clear(); }

const ringGeo = new THREE.RingGeometry(0.55, 1, 60).rotateX(-Math.PI / 2);
const shockGeo = new THREE.SphereGeometry(1, 24, 16);
const EFFECTS = [];
function addEffect(fn) { EFFECTS.push(fn); }
function updateEffects(dt) {
  for (let i = EFFECTS.length - 1; i >= 0; i--) if (!EFFECTS[i](dt)) EFFECTS.splice(i, 1);
}
function clearEffects() {
  for (const fn of EFFECTS) if (fn.dispose) fn.dispose();
  EFFECTS.length = 0;
}

function shockwave(x, y, z, rMax, dur, color, opacity) {
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: color || C('#fff2d8'), transparent: true, opacity: opacity || 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.position.set(x, y + 1, z);
  m.renderOrder = 8;
  scene.add(m);
  let t = 0;
  const fn = dt => {
    t += dt; const k = t / dur;
    if (k >= 1) { scene.remove(m); m.material.dispose(); return false; }
    const r = rMax * (1 - Math.pow(1 - k, 2.5));
    m.scale.set(r, r, r);
    m.position.y = y + 1 + k * 4;
    m.material.opacity = (opacity || 0.8) * (1 - k) * (1 - k);
    return true;
  };
  fn.dispose = () => { scene.remove(m); m.material.dispose(); };
  addEffect(fn);
}

function fireball(x, y, z, R, dur) {
  const mat = new THREE.MeshBasicMaterial({ color: C('#ffd27a'), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  const m = new THREE.Mesh(shockGeo, mat);
  m.position.set(x, y, z);
  m.renderOrder = 9;
  scene.add(m);
  let t = 0;
  const fn = dt => {
    t += dt; const k = t / dur;
    if (k >= 1) { scene.remove(m); mat.dispose(); return false; }
    const r = R * (0.3 + 0.9 * Math.sqrt(k));
    m.scale.set(r, r * 1.05, r);
    m.position.y = y + k * R * 0.5;
    mat.color.setRGB(1, lerp(0.75, 0.2, k), lerp(0.4, 0.05, k));
    mat.opacity = 1 - k * k;
    return true;
  };
  fn.dispose = () => { scene.remove(m); mat.dispose(); };
  addEffect(fn);
}

function mushroom(x, y, z, R) {
  let t = 0, acc = 0, stem = 0;
  const fn = dt => {
    t += dt;
    acc += dt * 40;
    while (acc > 1 && t < 2.6) {
      acc--;
      const up = Math.min(1, t / 1.2);
      stem = 6 + up * R * 0.9;
      emitSmoke(x + rand(-1, 1) * R * 0.12, y + rand(0, stem), z + rand(-1, 1) * R * 0.12,
        rand(-2, 2), rand(6, 13) * (1 - up * 0.3), rand(-2, 2), R * 0.16, 0.2, 0.17, 0.14, rand(4, 7), 0.6);
      if (t > 0.8) {
        const a = Math.random() * TAU, rr = (t - 0.8) * R * 0.5;
        emitSmoke(x + Math.cos(a) * rr, y + stem + rand(-2, 3), z + Math.sin(a) * rr,
          Math.cos(a) * rr * 0.5, rand(1, 3), Math.sin(a) * rr * 0.5, R * 0.2, 0.22, 0.19, 0.16, rand(4, 8), 0.55);
      }
    }
    return t < 2.8;
  };
  addEffect(fn);
}

function dustRing(x, y, z, r, count) {
  for (let i = 0; i < count * FX_BUDGET.smoke; i++) {
    const a = Math.random() * TAU, spd = rand(4, 16);
    emitSmoke(x + Math.cos(a) * rand(0, r * 0.4), y + rand(0, 2), z + Math.sin(a) * rand(0, r * 0.4),
      Math.cos(a) * spd, rand(1, 5), Math.sin(a) * spd, rand(3, 6), 0.52, 0.48, 0.42, rand(2.5, 5), 0.55);
  }
  shockwave(x, y, z, r, 0.7, C('#ccc3b4'), 0.35);
}

function sprayBurst(x, y, z, n, up, spread, col) {
  for (let i = 0; i < n * FX_BUDGET.spark; i++) {
    const a = Math.random() * TAU, s = rand(0.3, 1) * spread;
    firePool.spawn({ x, y, z, vx: Math.cos(a) * s, vy: up * rand(0.4, 1), vz: Math.sin(a) * s,
      r: col[0], g: col[1], b: col[2], life: rand(0.5, 1.4), s0: rand(1.5, 3.5), s1: rand(2, 5), a: 0.7, grav: -14, drag: 0.8, wind: 0.6, kind: 1 });
  }
}
