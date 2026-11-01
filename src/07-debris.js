const DEBRIS_MAX = IS_MOBILE ? 900 : 1800;
const chunkGeo = new THREE.BoxGeometry(1, 1, 1);
const debrisMesh = new THREE.InstancedMesh(chunkGeo, new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, vertexColors: false }), DEBRIS_MAX);
debrisMesh.castShadow = true;
debrisMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(DEBRIS_MAX * 3), 3);
debrisMesh.count = DEBRIS_MAX;
scene.add(debrisMesh);
const DB = {
  px: new Float32Array(DEBRIS_MAX), py: new Float32Array(DEBRIS_MAX), pz: new Float32Array(DEBRIS_MAX),
  vx: new Float32Array(DEBRIS_MAX), vy: new Float32Array(DEBRIS_MAX), vz: new Float32Array(DEBRIS_MAX),
  qx: new Float32Array(DEBRIS_MAX), qy: new Float32Array(DEBRIS_MAX), qz: new Float32Array(DEBRIS_MAX), qw: new Float32Array(DEBRIS_MAX),
  ax: new Float32Array(DEBRIS_MAX), ay: new Float32Array(DEBRIS_MAX), az: new Float32Array(DEBRIS_MAX),
  sx: new Float32Array(DEBRIS_MAX), sy: new Float32Array(DEBRIS_MAX), sz: new Float32Array(DEBRIS_MAX),
  life: new Float32Array(DEBRIS_MAX), rest: new Uint8Array(DEBRIS_MAX), active: new Uint8Array(DEBRIS_MAX)
};
let dbCur = 0;
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
for (let i = 0; i < DEBRIS_MAX; i++) debrisMesh.setMatrixAt(i, HIDE);
debrisMesh.instanceMatrix.needsUpdate = true;

function spawnDebris(x, y, z, vx, vy, vz, s, color) {
  const i = dbCur; dbCur = (dbCur + 1) % DEBRIS_MAX;
  DB.px[i] = x; DB.py[i] = y; DB.pz[i] = z;
  DB.vx[i] = vx; DB.vy[i] = vy; DB.vz[i] = vz;
  DB.ax[i] = rand(-7, 7); DB.ay[i] = rand(-7, 7); DB.az[i] = rand(-7, 7);
  DB.sx[i] = s * rand(0.6, 1.3); DB.sy[i] = s * rand(0.4, 1); DB.sz[i] = s * rand(0.6, 1.3);
  DB.qx[i] = 0; DB.qy[i] = 0; DB.qz[i] = 0; DB.qw[i] = 1;
  DB.life[i] = rand(9, 15); DB.rest[i] = 0; DB.active[i] = 1;
  const c = color || RUBBLE;
  const v = 0.7 + Math.random() * 0.3;
  debrisMesh.instanceColor.setXYZ(i, c.r * v, c.g * v, c.b * v);
  debrisMesh.instanceColor.needsUpdate = true;
}

const dq = new THREE.Quaternion(), dspin = new THREE.Quaternion(), de = new THREE.Euler();
function updateDebris(dt) {
  let any = false;
  const sdt = Math.min(dt, 0.033);
  for (let i = 0; i < DEBRIS_MAX; i++) {
    if (!DB.active[i]) continue;
    any = true;
    DB.life[i] -= dt;
    if (DB.life[i] <= 0) { DB.active[i] = 0; debrisMesh.setMatrixAt(i, HIDE); continue; }
    if (!DB.rest[i]) {
      DB.vy[i] -= 42 * sdt;
      DB.px[i] += DB.vx[i] * sdt; DB.py[i] += DB.vy[i] * sdt; DB.pz[i] += DB.vz[i] * sdt;
      const gh = H(DB.px[i], DB.pz[i]) + DB.sy[i] * 0.4;
      if (DB.py[i] <= gh) {
        DB.py[i] = gh;
        if (DB.vy[i] < -14 && Math.random() < 0.3) { dustRing(DB.px[i], gh, DB.pz[i], 2.5, 3); }
        DB.vy[i] = -DB.vy[i] * 0.28;
        DB.vx[i] *= 0.62; DB.vz[i] *= 0.62;
        DB.ax[i] *= 0.5; DB.ay[i] *= 0.5; DB.az[i] *= 0.5;
        if (DB.vx[i] * DB.vx[i] + DB.vy[i] * DB.vy[i] + DB.vz[i] * DB.vz[i] < 0.6) { DB.rest[i] = 1; DB.vy[i] = 0; }
      }
      de.set(DB.ax[i] * sdt, DB.ay[i] * sdt, DB.az[i] * sdt);
      dspin.setFromEuler(de);
      dq.set(DB.qx[i], DB.qy[i], DB.qz[i], DB.qw[i]).premultiply(dspin);
      DB.qx[i] = dq.x; DB.qy[i] = dq.y; DB.qz[i] = dq.z; DB.qw[i] = dq.w;
      tmpM.compose(tmpV.set(DB.px[i], DB.py[i], DB.pz[i]), dq, tmpV2.set(DB.sx[i], DB.sy[i], DB.sz[i]));
      debrisMesh.setMatrixAt(i, tmpM);
    } else if (DB.life[i] < 2.5) {
      const s = DB.life[i] / 2.5;
      dq.set(DB.qx[i], DB.qy[i], DB.qz[i], DB.qw[i]);
      tmpM.compose(tmpV.set(DB.px[i], DB.py[i], DB.pz[i]), dq, tmpV2.set(DB.sx[i] * s, DB.sy[i] * s, DB.sz[i] * s));
      debrisMesh.setMatrixAt(i, tmpM);
    }
  }
  if (any) debrisMesh.instanceMatrix.needsUpdate = true;
}
function clearDebris() {
  for (let i = 0; i < DEBRIS_MAX; i++) { DB.active[i] = 0; debrisMesh.setMatrixAt(i, HIDE); }
  debrisMesh.instanceMatrix.needsUpdate = true;
  dbCur = 0;
}
