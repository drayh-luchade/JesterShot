'use strict';
/* ---------- Piercing shot (Shroom Spike): flies straight through paper, leaving a hole in every sheet it crosses ---------- */
// The shot's physics body doesn't collide (collisionResponse = false), so nothing deflects it. Instead, each frame we cast a ray along the
// stretch it just flew and look for paper sheets: a hit on a block's OUTER mesh is a sheet it entered through, a hit on the INNER mesh is a
// sheet it left through. Each of those costs one "layer" (WEAPONS.mushroom.pierce) and tears a hole there; when the layers run out it stops.
// A block is a hollow box, so going clean through one costs 2 layers. The table, floor, walls and props stop it at once.
for (const id of Object.keys(WEAPONS)) if (!(id in game.lastFire)) game.lastFire[id] = 0;   // cooldown slot for any weapon added later

const pierceRay = new THREE.Raycaster();
const _pFrom = new THREE.Vector3(), _pDir = new THREE.Vector3(), _pSeg = new THREE.Vector3();

function initPierceShot(body, dir) {                                  // called from launchShot
  const w = body.weapon;
  body.collisionResponse = false;                                     // reports touches, never pushes or bounces
  body.linearDamping = 0; body.angularDamping = 0;
  body.quaternion.setFromVectors(new CANNON.Vec3(0, 1, 0), new CANNON.Vec3(dir.x, dir.y, dir.z));    // cap first, stem trailing
  body.angularVelocity.set(dir.x * w.spin, dir.y * w.spin, dir.z * w.spin);                          // spins about its own length
  body.pierce = { left: w.pierce, dead: false, prev: new THREE.Vector3(body.position.x, body.position.y, body.position.z) };
}

function pierceContact(shot, e) {                                     // collide listener (see onShotHit)
  const o = e.body, st = shot.pierce;
  if (!st || st.dead || o.block || o.isPea) return;                   // paper is handled by the ray test; other shots just pass
  st.dead = true; slimeKills.push(shot);                              // table, floor, wall, ceiling or a prop: it stops here
}

/** Tear a hole through one sheet of a block at world point `pt`, travelling along `dir`. */
function pierceHole(b, pt, dir, w, speed) {
  const body = b.body, S = b.mesh.scale, inv = body.quaternion.inverse();
  const rel = new CANNON.Vec3(pt.x - body.position.x, pt.y - body.position.y, pt.z - body.position.z);
  const pl = inv.vmult(rel), dl = inv.vmult(new CANNON.Vec3(dir.x, dir.y, dir.z)); dl.normalize();
  const size = Math.cbrt(S.x * S.y * S.z), hole = Math.min(w.hole * b.paper.tearSize, 0.4 * Math.min(S.x, S.y, S.z));
  const h = { c: new THREE.Vector3(pl.x / S.x, pl.y / S.y, pl.z / S.z), dir: new THREE.Vector3(dl.x, dl.y, dl.z),
              depth: 0.05 * Math.min(1, size / 3), crumple: 0.03, R: hole * 1.8, S };      // a little puckering round the hole
  b.sheet.dent(h, hole, b.windows);
  b.owner.cornerDamage(b, h.c, w.corner, 1);                           // a hole near an edge or corner makes it sag
  b.damage += w.wear;
  body.wakeUp();
  if (w.nudge) body.applyImpulse(new CANNON.Vec3(dir.x, dir.y, dir.z).scale(speed * w.mass * w.nudge), rel);   // a small shiver, not a shove
}

function updatePierce() {                                             // runs every frame from updateShots
  const now = performance.now();
  for (const s of shots.slice()) {
    const body = s.body, st = body.pierce;
    if (!st || st.dead) continue;
    const cur = body.position;
    if (now - body.born > 6000 || cur.y < FLOOR_Y - 5 || cur.y > ROOM.h || Math.abs(cur.x) > ROOM.w || Math.abs(cur.z) > ROOM.d) {
      st.dead = true; slimeKills.push(body); continue;
    }
    _pSeg.set(cur.x - st.prev.x, cur.y - st.prev.y, cur.z - st.prev.z);
    const dist = _pSeg.length();
    if (dist < 1e-4) continue;
    _pFrom.copy(st.prev); _pDir.copy(_pSeg).divideScalar(dist); st.prev.set(cur.x, cur.y, cur.z);
    const meshes = [], info = new Map();                                // only blocks near this stretch of flight
    for (const t of towers) for (const b of t.blocks) {
      if (!b.body) continue;
      const bp = b.body.position, S = b.mesh.scale;
      _pSeg.set(bp.x - _pFrom.x, bp.y - _pFrom.y, bp.z - _pFrom.z);
      const along = Math.max(0, Math.min(dist, _pSeg.dot(_pDir))), reach = Math.max(S.x, S.y, S.z) * 0.9 + 0.5;
      if (_pSeg.addScaledVector(_pDir, -along).lengthSq() > reach * reach) continue;
      b.mesh.updateMatrixWorld(true);
      meshes.push(b.mesh.children[0], b.mesh.children[1]);
      info.set(b.mesh.children[0], b); info.set(b.mesh.children[1], b);
    }
    if (!meshes.length) continue;
    pierceRay.set(_pFrom, _pDir); pierceRay.near = 0; pierceRay.far = dist;
    const speed = body.velocity.length(), w = body.weapon;
    for (const hit of pierceRay.intersectObjects(meshes, false)) {      // nearest first
      pierceHole(info.get(hit.object), hit.point, _pDir, w, speed);
      if (--st.left <= 0) { st.dead = true; slimeKills.push(body); break; }       // out of layers: stops in the last sheet
    }
  }
}
