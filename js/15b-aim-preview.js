'use strict';
/* ---------- Aim distance + dashed flight preview ---------- */
// Aim distance is NOT strength. Strength (power) scales how fast the shot leaves the muzzle. Aim distance is how far along the crosshair line the
// shot is aimed to ARRIVE: the launch angle is worked out so the shot passes through that point (allowing for gravity). "Auto" aims at whatever
// the crosshair touches, as before. Set it nearer to drop a shot short of something, or farther to lob over it; the dashed line shows where it goes.
game.range = null;                                                      // null = auto; otherwise a distance in world units from the camera
const RANGE = { min: 3, max: 200 };
const byId = id => document.getElementById(id);                         // ($ lives in a later file, so it isn't available while this one loads)

function aimTarget() {                                                  // the point fireWeapon() aims through
  if (game.range == null) return centerTarget();
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  return raycaster.ray.at(game.range, new THREE.Vector3());
}
function setRange(v) {                                                  // v = null for auto
  if (v == null) game.range = null;
  else {
    game.range = Math.min(RANGE.max, Math.max(RANGE.min, v));
    byId('ds').value = game.range;
  }
  byId('dsAuto').classList.toggle('on', game.range == null);
}
function nudgeRange(dir, fast) {                                        // keyboard: from auto, start at what the crosshair is touching now
  if (game.range == null) { camera.rotation.set(pitch, yaw, 0); camera.updateMatrixWorld(true); game.range = camera.position.distanceTo(centerTarget()); }
  setRange(game.range + dir * (fast ? 8 : 2) * Math.max(1, game.range / 40));
}
byId('ds').addEventListener('input', () => setRange(+byId('ds').value));
byId('dsAuto').addEventListener('click', () => setRange(null));
setRange(null);
window.addEventListener('keydown', e => {
  if (e.code === 'Minus' || e.code === 'NumpadSubtract') nudgeRange(-1, e.shiftKey);
  if (e.code === 'Equal' || e.code === 'NumpadAdd') nudgeRange(1, e.shiftKey);
  if (e.code === 'Backslash') setRange(null);
});

/* ----- the dashed line, the landing ring, and little rings where a piercing shot goes through paper ----- */
const AIM_STEPS = 600, AIM_H = 1 / 120;                                  // up to 5 s of flight, in the physics step
const aimGeo = new THREE.BufferGeometry();
aimGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(AIM_STEPS * 3 + 3), 3));
const aimLine = new THREE.Line(aimGeo, new THREE.LineDashedMaterial({ color: 0xfff1b8, dashSize: 0.8, gapSize: 0.5, transparent: true, opacity: 0.9, fog: false, depthWrite: false }));
aimLine.frustumCulled = false; aimLine.renderOrder = 5; aimLine.visible = false; scene.add(aimLine);
const ringGeo = new THREE.RingGeometry(0.3, 0.5, 24);
const mkRing = (color, op) => { const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: op, depthTest: false, fog: false })); m.renderOrder = 6; m.visible = false; scene.add(m); return m; };
const aimHit = mkRing(0xffd24a, 0.95), aimMarks = Array.from({ length: 6 }, () => mkRing(0xff8a65, 0.8));
const aimPoint = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), new THREE.MeshBasicMaterial({ color: 0x6fd0ff, depthTest: false, transparent: true, opacity: 0.9, fog: false }));
aimPoint.renderOrder = 6; aimPoint.visible = false; scene.add(aimPoint);   // shows the chosen aim distance when it isn't auto

const _ap = new THREE.Vector3(), _av = new THREE.Vector3(), _aq = new THREE.Vector3(), _ad = new THREE.Vector3(), _an = new THREE.Vector3();
const aimRay = new THREE.Raycaster();
function placeRing(m, point, normal) { m.position.copy(point).addScaledVector(normal, 0.05); m.lookAt(_an.copy(point).add(normal)); m.visible = true; }
function segPointDist2(a, b, p) {                                       // squared distance from point p to segment a-b
  _ad.copy(b).sub(a); const l2 = _ad.lengthSq();
  const t = l2 ? Math.max(0, Math.min(1, _an.copy(p).sub(a).dot(_ad) / l2)) : 0;
  return _an.copy(a).addScaledVector(_ad, t).distanceToSquared(p);
}

/** Follow one shot's path like fireWeapon + the physics would, and stop where it hits something (a piercing shot goes on through `pierce` sheets). */
function aimPath(w, muzzle, target, speed) {
  const pos = aimGeo.attributes.position.array, marks = [];
  let n = 0, end = null;
  const push = p => { pos[n * 3] = p.x; pos[n * 3 + 1] = p.y; pos[n * 3 + 2] = p.z; n++; };
  if (w.boomerang) {                                                    // the bananarang's loop (no collisions are previewed)
    const bn = bananaParams(w, muzzle, target, speed);
    for (let i = 0; i <= 90; i++) push(bananaPos(bn, bn.T * i / 90, _aq));
    return { n, end: null, marks };
  }
  const t = muzzle.distanceTo(target) / speed, adj = target.clone(); adj.y += 0.5 * 9.82 * t * t;    // same gravity compensation as fireWeapon
  const dir = adj.sub(muzzle).normalize();
  _ap.copy(muzzle).addScaledVector(dir, 0.4 + w.radius); _av.copy(dir).multiplyScalar(speed);
  const g = world.gravity.y, damp = Math.pow(1 - 0.01, AIM_H);           // the shot body's linearDamping
  const cands = [];                                                      // blocks near the path are worth a ray test; ground and floor always
  for (const tw of towers) for (const b of tw.blocks) if (b.body) {
    const S = b.mesh.scale; cands.push({ b, c: b.body.position, r: 0.5 * Math.hypot(S.x, S.y, S.z) + 0.6 });
  }
  const bpos = new THREE.Vector3(), a = new THREE.Vector3(), layers = w.pierce || 0;
  push(_ap);
  let left = layers;
  for (let step = 0; step < AIM_STEPS && !end; step += 3) {              // 3 physics steps per chord
    a.copy(_ap);
    for (let k = 0; k < 3; k++) { _av.multiplyScalar(damp); _av.y += g * AIM_H; _ap.addScaledVector(_av, AIM_H); }
    const len = a.distanceTo(_ap); if (len < 1e-6) break;
    const list = [ground, floor];
    for (const cd of cands) {
      bpos.set(cd.c.x, cd.c.y, cd.c.z);
      if (segPointDist2(a, _ap, bpos) < cd.r * cd.r) { cd.b.mesh.updateMatrixWorld(true); list.push(cd.b.mesh.children[0]); if (layers) list.push(cd.b.mesh.children[1]); }
    }
    _aq.copy(_ap).sub(a).normalize(); aimRay.set(a, _aq); aimRay.far = len;
    const hits = aimRay.intersectObjects(list, false);
    let stopped = false;
    for (const h of hits) {
      const nrm = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
      if (h.object === ground || h.object === floor || !layers) { push(h.point); end = { point: h.point.clone(), normal: nrm }; stopped = true; break; }
      if (nrm.dot(_aq) > 0) nrm.negate();
      marks.push({ point: h.point.clone(), normal: nrm });
      if (--left <= 0) { push(h.point); end = { point: h.point.clone(), normal: nrm }; stopped = true; break; }
    }
    if (stopped) break;
    push(_ap);
  }
  return { n, end, marks };
}

let aimFrame = 0, aimLabel = '';
function updateAimPreview() {
  const on = game.mode === 'fight';
  aimLine.visible = on; if (!on) { aimHit.visible = false; aimPoint.visible = false; aimMarks.forEach(m => m.visible = false); return; }
  if ((aimFrame++ & 1) && !game._aimDirty) return;                       // every other frame is plenty
  camera.rotation.set(pitch, yaw, 0); camera.updateMatrixWorld(true);
  const w = WEAPONS[game.weapon], muzzle = gun.localToWorld(MUZZLE.clone()), speed = w.speed * game.power;
  const target = aimTarget();
  const r = aimPath(w, muzzle, target, speed);
  aimGeo.setDrawRange(0, r.n); aimGeo.attributes.position.needsUpdate = true; aimLine.computeLineDistances();
  aimMarks.forEach((m, i) => { if (r.marks[i]) placeRing(m, r.marks[i].point, r.marks[i].normal); else m.visible = false; });
  if (r.end) placeRing(aimHit, r.end.point, r.end.normal); else aimHit.visible = false;
  aimPoint.visible = game.range != null; if (aimPoint.visible) { aimPoint.position.copy(target); aimPoint.rotation.y += 0.05; }
  const dist = camera.position.distanceTo(target);
  if (game.range == null) byId('ds').value = Math.min(RANGE.max, Math.max(RANGE.min, dist));      // slider follows the crosshair while auto
  const label = game.range == null ? `Auto · ${dist.toFixed(0)}` : dist.toFixed(0);
  if (label !== aimLabel) { aimLabel = label; byId('dsVal').textContent = label; }
}
