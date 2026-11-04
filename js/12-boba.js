'use strict';
/* ---------- Boba: pea-sized slime pearls. They stick to paper (or the table), glide or skid a little, and leave a dark trail ---------- */
// A shot has no collision response, so it can never punch a block or roll away. On first touch it is re-homed onto the surface
// (a raycast gives the exact spot). On a block it creeps downhill, re-projected onto the real dented sheet each frame, stamping slime,
// puckering the paper, and adding to the block's slime load. Every pearl also carries a tiny weight, applied to its block each
// physics substep at a point a little out from the paper, so a patch of pearls adds real load and real leverage: enough of them sway
// and tip a structure. On the table a shallow shot skids a short way and stops; a steep one just sticks. Nothing slides off the table.
const SLICK = { craft: 1, canvas: 0.55, fiber: 0.7, lined: 1.5, sticky: 0.25 };       // how fast a pearl glides on each paper (keyed by texture name)
const PEARL = {
  stick: 1.0, glide: 0.3, capBase: 4, capPerArea: 0.35, speed: 0.55, maxPearls: 80,   // slime load per pearl / per unit glided; block capacity = capBase + capPerArea * face area
  mass: 0.3, lever: 1.5, ramp: 0.4,        // weight of one pearl; how far out from the paper its weight acts (a bead overhangs); seconds to take full effect
  skidAngle: 1.2, skidMin: 2, skidFactor: 0.45, skidMax: 9, skidDecel: 10,   // table skid: slides if tangential speed > 1.2 x normal speed; ends within a few units
};
const slimeKills = [], slimeHits = [], groundHits = [], pearls = [], spots = [], slimeList = [];
const SLIME_MAX = 2500;
const tableAnchor = { isAnchor: true, dead: false, mesh: ground }, floorAnchor = { isAnchor: true, dead: false, mesh: floor };   // decals on static surfaces
const slimeMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 14), new THREE.MeshPhongMaterial({
  color: 0xffffff, specular: 0x665544, shininess: 90, transparent: true, opacity: 0.92,
  polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, depthWrite: false,
}), SLIME_MAX);
slimeMesh.frustumCulled = false;
slimeMesh.count = 0;
scene.add(slimeMesh);
const slimeRay = new THREE.Raycaster();
const _Z = new THREE.Vector3(0, 0, 1);

function processSlime() {                                             // runs right after each physics step
  while (slimeKills.length) {                                         // flew off, or hit a wall / the ceiling
    const sh = slimeKills.pop(), i = shots.findIndex(s => s.body === sh);
    if (i >= 0) removeShot(shots.splice(i, 1)[0]);
  }
  while (groundHits.length) {                                         // hit the table or the floor
    const { shot } = groundHits.pop(), i = shots.findIndex(s => s.body === shot);
    if (i < 0) continue;
    const rec = shots.splice(i, 1)[0];
    world.removeBody(shot);
    if (!attachToGround(rec.mesh, shot)) scene.remove(rec.mesh);
  }
  while (slimeHits.length) {                                          // hit a block
    const { shot, block } = slimeHits.pop(), i = shots.findIndex(s => s.body === shot);
    if (i < 0) continue;
    const rec = shots.splice(i, 1)[0];
    world.removeBody(shot);
    if (block.dead || !block.body || !attachPearl(rec.mesh, block, shot)) scene.remove(rec.mesh);
  }
}
function shotRay(shot, objects) {                                     // back up along the shot's path, then find the first surface it crosses
  const vel = new THREE.Vector3(shot.velocity.x, shot.velocity.y, shot.velocity.z), speed = vel.length();
  const dir = speed > 1e-3 ? vel.clone().divideScalar(speed) : new THREE.Vector3(0, -1, 0);
  const sp = new THREE.Vector3(shot.position.x, shot.position.y, shot.position.z);
  slimeRay.set(sp.clone().addScaledVector(dir, -1.2), dir);
  slimeRay.far = 3 + speed * 0.02;
  return { hit: slimeRay.intersectObjects(objects, false)[0], vel, speed };
}
function attachPearl(mesh, block, shot) {
  const m = block.mesh;
  m.position.copy(block.body.position); m.quaternion.copy(block.body.quaternion); m.updateMatrixWorld(true);
  const { hit } = shotRay(shot, [block.sheet.outer]);
  if (!hit) return false;                                             // grazed past a corner, or through a tear
  startPearlOnBlock(mesh, block, hit.point, hit.face.normal.clone().transformDirection(m.matrixWorld), shot.weapon.slimeColor);
  return true;
}
function startPearlOnBlock(mesh, block, point, n, col = 0x120a06) {
  const m = block.mesh;
  m.updateMatrixWorld(true);
  pearls.push({ mesh, block, local: m.worldToLocal(point.clone()), nl: n.clone().applyQuaternion(m.quaternion.clone().conjugate()),
                state: 'glide', v: 0, age: 0, sinceDecal: 0, sinceDent: 0, col });
  mesh.scale.set(1.15, 1.15, 0.6);                                    // squashed flat against the paper
  mesh.position.copy(point).addScaledVector(n, 0.1);
  mesh.quaternion.setFromUnitVectors(_Z, n);
  if (pearls.length > PEARL.maxPearls) scene.remove(pearls.shift().mesh);   // oldest pearl drops away; its slime stays
  addSlime(block, point, n, 0.16, col);
  crumpleAt(block, point, n, 2.2);                                    // the splat itself puckers the sheet a little
  slimeLoad(block, PEARL.stick, n);
}
function attachToGround(mesh, shot) {
  ground.updateMatrixWorld(true); floor.updateMatrixWorld(true);
  const { hit, vel } = shotRay(shot, [ground, floor]);
  if (!hit) return false;
  const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
  const anchor = hit.object === ground ? tableAnchor : floorAnchor;
  const vn = Math.abs(vel.dot(n)), tang = vel.clone().addScaledVector(n, -vel.dot(n)), vt = tang.length();
  const skid = n.y > 0.7 && vt > PEARL.skidMin && vt > vn * PEARL.skidAngle;      // a shallow shot skids; a steep one sticks where it lands
  spots.push({ mesh, anchor, pos: hit.point.clone(), n, dir: skid ? tang.divideScalar(vt) : null,
               speed: skid ? Math.min(vt * PEARL.skidFactor, PEARL.skidMax) : 0, state: skid ? 'skid' : 'rest', sinceDecal: 0, col: shot.weapon.slimeColor || 0x120a06 });
  mesh.scale.set(1.15, 1.15, 0.6);
  mesh.position.copy(hit.point).addScaledVector(n, 0.09);
  mesh.quaternion.setFromUnitVectors(_Z, n);
  if (spots.length > PEARL.maxPearls) scene.remove(spots.shift().mesh);
  addSlime(anchor, hit.point, n, 0.18, shot.weapon.slimeColor);
  return true;
}
function dripToTable(p, wp) {                                         // a pearl that glides off the bottom of a block standing on the table lands there
  if (wp.y > 0.9 || Math.abs(wp.x) > TABLE.w / 2 - 0.3 || Math.abs(wp.z) > TABLE.d / 2 - 0.3) return false;
  const n = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(wp.x, 0, wp.z);
  p.mesh.position.copy(pos).addScaledVector(n, 0.09);
  p.mesh.quaternion.setFromUnitVectors(_Z, n);
  spots.push({ mesh: p.mesh, anchor: tableAnchor, pos, n, dir: null, speed: 0, state: 'rest', sinceDecal: 0, col: p.col });
  if (spots.length > PEARL.maxPearls) scene.remove(spots.shift().mesh);
  addSlime(tableAnchor, pos, n, 0.15, p.col);
  return true;
}
function addSlime(b, wp, n, size, col = 0x120a06) {                  // one decal, stored in its surface's own frame so it travels with it
  if (slimeList.length >= SLIME_MAX) slimeList.shift();
  slimeList.push({ b, p: b.mesh.worldToLocal(wp.clone()), nl: n.clone().applyQuaternion(b.mesh.quaternion.clone().conjugate()), s: size, col });
}
function crumpleAt(b, wp, n, sev) {                                   // a small dent: lots of them along a trail make a wrinkled, weakened streak
  b.owner.pending.push({ block: b, point: new CANNON.Vec3(wp.x, wp.y, wp.z), dir: new CANNON.Vec3(-n.x, -n.y, -n.z), sev, load: 0 });
}
function slimeLoad(b, amount, n) {
  if (b.failed) return;
  b.slime = (b.slime || 0) + amount * b.paper.fragile;
  b.slimeN = (b.slimeN || new THREE.Vector3()).addScaledVector(n, amount);          // weighted direction of the slimed face
  const area = Math.max(b.sx * b.sy, b.sy * b.sz, b.sx * b.sz);
  const cap = PEARL.capBase + PEARL.capPerArea * area, frac = Math.min(1, b.slime / cap);
  b.crush = Math.max(b.crush, 0.25 + 0.45 * frac);                    // the soaked sheet sags as it weakens
  const cr = Math.min(1, Math.max(0, (b.crush - 0.25) / 0.75));
  const maxLoss = Math.min(CRUSH.maxFrac * b.sy, CRUSH.widthK * Math.min(b.sx, b.sz));
  b.targetY = Math.min(b.targetY, 1 - cr * maxLoss / b.sy);
  b.body.wakeUp();
  if (b.slime >= cap) failBlock(b);
}
function failBlock(b) {                                               // soaked through: it tears, goes slippery and slides off its stack
  b.failed = true;
  b.body.material = slickMat;
  const n = b.slimeN ? b.slimeN.clone() : new THREE.Vector3(0, 0, 1);
  n.y = 0;
  if (n.lengthSq() < 1e-4) n.set(Math.random() - 0.5, 0, Math.random() - 0.5);
  n.normalize();
  const k = b.body.mass * 1.1;
  b.body.applyImpulse(new CANNON.Vec3(n.x * k, 0.15 * k, n.z * k));
  const half = Math.min(b.sx, b.sz) / 2;
  b.owner.pending.push({ block: b, point: b.body.position.vadd(new CANNON.Vec3(n.x * half, 0, n.z * half)),
                         dir: new CANNON.Vec3(-n.x, 0, -n.z), sev: 13, load: 0.5 });
  b.owner.blocks.forEach(x => x.body.wakeUp());
}
function updatePearls(dt) {
  for (let i = pearls.length - 1; i >= 0; i--) {
    const p = pearls[i], b = p.block;
    if (b.dead || !b.body) { scene.remove(p.mesh); pearls.splice(i, 1); continue; }
    const m = b.mesh;
    m.updateMatrixWorld(true);
    const n = p.nl.clone().applyQuaternion(m.quaternion);             // the surface normal turns with the block
    let wp = m.localToWorld(p.local.clone());
    if (p.state === 'glide') {
      const gt = new THREE.Vector3(0, -1, 0).addScaledVector(n, n.y);  // gravity projected onto the surface: g - n (g.n)
      const len = gt.length();
      if (-n.y > 0.65) p.state = 'drip';                              // an underside: it simply drips off
      else if (len < 0.2) p.state = 'rest';                           // a flat top: it stays as a blob
      else {
        p.v = Math.min(p.v + dt * 0.9, PEARL.speed * (SLICK[b.paper.tex] || 1) * len);   // viscous: eases up to a slow crawl
        const step = p.v * dt;
        gt.multiplyScalar(1 / len);
        slimeRay.set(wp.clone().addScaledVector(gt, step).addScaledVector(n, 0.5), n.clone().negate());   // re-project onto the real sheet
        slimeRay.far = 1.4;
        const hit = slimeRay.intersectObject(b.sheet.outer, false)[0];
        if (!hit) p.state = 'drip';                                   // ran off an edge, or into a tear
        else {
          const hn = hit.face.normal.clone().transformDirection(m.matrixWorld);
          wp = hit.point.clone();
          p.local.copy(m.worldToLocal(hit.point.clone()));
          p.nl.copy(hn.clone().applyQuaternion(m.quaternion.clone().conjugate()));
          n.copy(hn);
          p.sinceDecal += step; p.sinceDent += step;
          if (p.sinceDecal > 0.14) { p.sinceDecal = 0; addSlime(b, wp, n, 0.08 + Math.random() * 0.05, p.col); }
          if (p.sinceDent > 0.6) { p.sinceDent = 0; crumpleAt(b, wp, n, 1.4); }
          slimeLoad(b, step * PEARL.glide, n);
        }
      }
    }
    if (p.state === 'drip') { if (!dripToTable(p, wp)) scene.remove(p.mesh); pearls.splice(i, 1); continue; }
    p.mesh.position.copy(wp).addScaledVector(n, 0.1);
    p.mesh.quaternion.setFromUnitVectors(_Z, n);
  }
}
function updateSpots(dt) {                                            // pearls on the table / floor: skid a little, then stop. Never slide off.
  for (let i = spots.length - 1; i >= 0; i--) {
    const p = spots[i];
    if (p.state !== 'skid') continue;
    const step = p.speed * dt, all = towers.flatMap(t => t.blocks).filter(b => !b.dead);
    slimeRay.set(p.pos.clone().addScaledVector(p.n, 0.25), p.dir);
    slimeRay.far = step + 0.4;
    const hit = slimeRay.intersectObjects(all.map(b => b.sheet.outer), false)[0];
    if (hit) {                                                        // slid into a structure: it sticks to that instead
      const blk = all.find(b => b.sheet.outer === hit.object);
      spots.splice(i, 1);
      if (blk) startPearlOnBlock(p.mesh, blk, hit.point, hit.face.normal.clone().transformDirection(hit.object.matrixWorld), p.col);
      else scene.remove(p.mesh);
      continue;
    }
    const next = p.pos.clone().addScaledVector(p.dir, step);
    const onTable = p.anchor === tableAnchor, hx = (onTable ? TABLE.w : ROOM.w) / 2, hz = (onTable ? TABLE.d : ROOM.d) / 2;
    if (Math.abs(next.x) > hx - 0.3 || Math.abs(next.z) > hz - 0.3) { p.state = 'rest'; continue; }   // stops at the edge
    p.pos.copy(next);
    p.speed -= PEARL.skidDecel * dt;
    p.sinceDecal += step;
    if (p.sinceDecal > 0.12) { p.sinceDecal = 0; addSlime(p.anchor, p.pos, p.n, 0.1 + Math.random() * 0.04, p.col); }
    p.mesh.position.copy(p.pos).addScaledVector(p.n, 0.09);
    if (p.speed <= 0.05) p.state = 'rest';
  }
}
function clearTableSlime() {                                          // Clear board / Rebuild wipes the table and floor too
  for (const p of spots) scene.remove(p.mesh);
  spots.length = 0;
  for (const c of chunks) scene.remove(c.mesh);                        // melon chunks too
  chunks.length = 0;
  for (let i = slimeList.length - 1; i >= 0; i--) if (slimeList[i].b.isAnchor) slimeList.splice(i, 1);
}
world.addEventListener('preStep', () => {                             // before every physics substep: each pearl adds its tiny weight to its block
  const dt = world.dt > 0 ? world.dt : 1 / 120, f = new CANNON.Vec3(), v = new CANNON.Vec3(), nw = new CANNON.Vec3();
  for (const p of pearls) {
    const b = p.block, bb = b.body;
    if (b.dead || !bb) continue;
    p.age += dt;
    f.set(0, -PEARL.mass * Math.min(1, p.age / PEARL.ramp) * 9.82, 0);
    const S = b.mesh.scale;
    v.set(p.local.x * S.x, p.local.y * S.y, p.local.z * S.z);         // pearl offset from the block's centre...
    bb.quaternion.vmult(v, v);                                        // ...in world axes
    nw.set(p.nl.x, p.nl.y, p.nl.z);
    bb.quaternion.vmult(nw, nw);
    v.x += nw.x * PEARL.lever; v.y += nw.y * PEARL.lever; v.z += nw.z * PEARL.lever;   // the bead hangs a little out from the paper: that's the leverage
    bb.applyForce(f, v);
  }
});
const _m4 = new THREE.Matrix4(), _q4 = new THREE.Quaternion(), _p3 = new THREE.Vector3(), _s3 = new THREE.Vector3(), _n3 = new THREE.Vector3(), _c3 = new THREE.Color();
let slimeFrame = 0;
function updateSlime() {                                              // place every decal on its surface's current position
  slimeFrame++;
  let w = 0;
  for (let r = 0; r < slimeList.length; r++) if (!slimeList[r].b.dead) slimeList[w++] = slimeList[r];
  slimeList.length = w;
  for (let i = 0; i < w; i++) {
    const s = slimeList[i], b = s.b;
    if (b._mw !== slimeFrame) { b.mesh.updateMatrixWorld(true); b._mw = slimeFrame; }
    _p3.copy(s.p).applyMatrix4(b.mesh.matrixWorld);
    _n3.copy(s.nl).applyQuaternion(b.mesh.quaternion);
    _p3.addScaledVector(_n3, 0.035);
    _q4.setFromUnitVectors(_Z, _n3);
    _s3.set(s.s, s.s, 1);
    slimeMesh.setMatrixAt(i, _m4.compose(_p3, _q4, _s3));
    slimeMesh.setColorAt(i, _c3.setHex(s.col));
  }
  slimeMesh.count = w;
  slimeMesh.instanceMatrix.needsUpdate = true;
  if (slimeMesh.instanceColor) slimeMesh.instanceColor.needsUpdate = true;
}
