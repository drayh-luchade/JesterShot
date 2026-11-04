'use strict';
/* ---------- Giant watermelon: heavy like the cannon ball, but it bursts when it hits the table or the floor ---------- */
// Landing hard on the table or floor pops it: a short wet shockwave (a shove and a dent for anything close), a big red splat painted onto the
// surface, and a spray of flesh, rind and seed chunks that arc out, bounce, settle, and finally shrink away.
const melonBursts = [], chunks = [], UP = new THREE.Vector3(0, 1, 0);
const MELON = { flesh: [0xd6293e, 0xe8465a, 0xff6b81], rind: 0x2f7d32, pale: 0xe9f3d8, seed: 0x1a1210 };
const chunkKinds = {
  flesh: { geo: new THREE.IcosahedronGeometry(0.3, 0), rad: 0.25, mats: MELON.flesh.map(c => new THREE.MeshLambertMaterial({ color: c, flatShading: true })) },
  rind:  { geo: new THREE.BoxGeometry(0.55, 0.14, 0.32), rad: 0.1, mats: [new THREE.MeshLambertMaterial({ color: MELON.rind, flatShading: true })] },
  seed:  { geo: new THREE.SphereGeometry(0.07, 6, 4), rad: 0.07, mats: [new THREE.MeshLambertMaterial({ color: MELON.seed })] },
};
const MAX_CHUNKS = 220;
// Shards are not just confetti: while one is still flying it can hit paper. sev feeds the same dent/tear system as every other impact
// (dents start at MIN_SEV, holes at TEAR_SEV); load = how much it weakens/slumps the block (1 = like a pea); push = share of its own weight handed to the block as an impulse; spent = it splats and is gone.
const SHARD = {
  grace: 0.05,                                   // seconds after the burst before shards can hurt (so they don't double up with the shockwave)
  flesh: { sevPerSpeed: 1.0,  push: 0.9, mass: 0.35, load: 0.6 },
  rind:  { sevPerSpeed: 1.35, push: 1.0, mass: 0.25, load: 0.8 },   // hard, flat, sharp-edged: the nastiest
  seed:  { sevPerSpeed: 0.6,  push: 0.8, mass: 0.05, load: 0.3 },   // too small to do much
};
function processMelon() {                                              // runs right after each physics step
  while (melonBursts.length) {
    const { shot, onTable } = melonBursts.pop(), i = shots.findIndex(s => s.body === shot);
    if (i < 0) continue;
    const pos = shot.position.clone(), speed = shot.velocity.length();
    explode(new CANNON.Vec3(pos.x, (onTable ? 0 : FLOOR_Y) + 0.4, pos.z), { radius: 5.5, impulse: 40, dent: 10, noFlash: true }, shot);
    removeShot(shots.splice(i, 1)[0]);
    melonBurst(pos, speed, onTable);
  }
}
function melonBurst(p, speed, onTable) {
  const surf = onTable ? 0 : FLOOR_Y, anchor = onTable ? tableAnchor : floorAnchor;
  ground.updateMatrixWorld(true); floor.updateMatrixWorld(true);
  const R = Math.min(2.8, 1.1 + speed * 0.06);
  for (let k = 0; k < 18; k++) {                                       // the splat: red and pink, with green rind and pale flecks
    const a = Math.random() * 6.283, d = Math.pow(Math.random(), 0.7) * R, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
    if (onTable && (Math.abs(x) > TABLE.w / 2 - 0.2 || Math.abs(z) > TABLE.d / 2 - 0.2)) continue;          // not past the table edge
    const col = k % 6 === 0 ? MELON.rind : k % 5 === 0 ? MELON.pale : MELON.flesh[k % 3];
    addSlime(anchor, new THREE.Vector3(x, surf, z), UP, 0.18 + Math.random() * 0.5 * (1 - d / (R + 0.2)) + 0.08, col);
  }
  const count = 20 + Math.floor(Math.random() * 8);
  for (let k = 0; k < count; k++) {                                    // the spray
    const r = Math.random(), kind = r < 0.55 ? 'flesh' : r < 0.85 ? 'rind' : 'seed', ck = chunkKinds[kind];
    const mat = ck.mats[Math.floor(Math.random() * ck.mats.length)], mesh = new THREE.Mesh(ck.geo, mat);
    mesh.castShadow = true;
    mesh.position.set(p.x, surf + 0.6, p.z);
    mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    scene.add(mesh);
    const a = Math.random() * 6.283, s = 1.6 + Math.random() * (2.4 + speed * 0.05);
    chunks.push({ mesh, vel: new THREE.Vector3(Math.cos(a) * s, 2.5 + Math.random() * 4, Math.sin(a) * s),
                  spin: new THREE.Vector3((Math.random() - 0.5) * 12, 0, (Math.random() - 0.5) * 12), rad: ck.rad,
                  kind, col: kind === 'rind' ? MELON.rind : kind === 'seed' ? MELON.seed : mat.color.getHex(), age: 0, life: 7 + Math.random() * 4, settled: false, splatted: false });
    if (chunks.length > MAX_CHUNKS) scene.remove(chunks.shift().mesh);
  }
}
/** A flying shard against every paper block: if it is inside a block's box (grown by the shard's radius) it dents, shoves and splats it. Returns true when spent. */
const _sp = new CANNON.Vec3(), _sl = new CANNON.Vec3();
function shardHitsBlock(c) {
  const m = c.mesh.position, sp = c.vel.length();
  if (sp < 1.2) return false;                                         // a lazy tumble does nothing
  const cfg = SHARD[c.kind];
  _sp.set(m.x, m.y, m.z);
  for (const t of towers) {
    for (const b of t.blocks) {
      const body = b.body;
      if (!body) continue;
      const S = b.mesh.scale, reach = Math.max(S.x, S.y, S.z) * 0.87 + c.rad;   // bounding sphere: cheap reject
      const dx = _sp.x - body.position.x, dy = _sp.y - body.position.y, dz = _sp.z - body.position.z;
      if (dx * dx + dy * dy + dz * dz > reach * reach) continue;
      _sl.set(dx, dy, dz); body.quaternion.inverse().vmult(_sl, _sl);              // shard position in block-local axes
      if (Math.abs(_sl.x) > S.x / 2 + c.rad || Math.abs(_sl.y) > S.y / 2 + c.rad || Math.abs(_sl.z) > S.z / 2 + c.rad) continue;
      const dir = new CANNON.Vec3(c.vel.x, c.vel.y, c.vel.z); dir.normalize();
      body.wakeUp();
      body.applyImpulse(dir.scale(sp * cfg.mass * cfg.push), new CANNON.Vec3(dx, dy, dz));
      t.pending.push({ block: b, point: _sp.clone(), dir, sev: sp * cfg.sevPerSpeed, load: cfg.load });
      addSlime(b, new THREE.Vector3(m.x, m.y, m.z), new THREE.Vector3(-dir.x, -dir.y, -dir.z), 0.12 + Math.random() * 0.12, c.col);
      return true;
    }
  }
  return false;
}
function updateChunks(dt) {
  for (let i = chunks.length - 1; i >= 0; i--) {
    const c = chunks[i];
    c.age += dt;
    if (c.age > c.life) {                                              // shrink away
      const f = 1 - (c.age - c.life) / 0.6;
      if (f <= 0) { scene.remove(c.mesh); chunks.splice(i, 1); continue; }
      c.mesh.scale.setScalar(f);
    }
    if (c.settled) continue;
    c.vel.y -= 9.82 * dt;
    c.mesh.position.addScaledVector(c.vel, dt);
    c.mesh.rotation.x += c.spin.x * dt; c.mesh.rotation.z += c.spin.z * dt;
    if (c.age > SHARD.grace && shardHitsBlock(c)) { scene.remove(c.mesh); chunks.splice(i, 1); continue; }
    const m = c.mesh.position, overTable = Math.abs(m.x) < TABLE.w / 2 && Math.abs(m.z) < TABLE.d / 2 && m.y > -2;
    const surf = overTable ? 0 : FLOOR_Y;                              // over the table: its top; past the edge: all the way down to the floor
    if (m.y <= surf + c.rad) {
      m.y = surf + c.rad;
      if (!c.splatted) { c.splatted = true; addSlime(surf === 0 ? tableAnchor : floorAnchor, new THREE.Vector3(m.x, surf, m.z), UP, 0.12 + Math.random() * 0.14, c.col); }
      if (Math.abs(c.vel.y) > 1.6) { c.vel.y *= -0.32; c.vel.x *= 0.6; c.vel.z *= 0.6; c.spin.multiplyScalar(0.5); }
      else c.settled = true;
    }
  }
}
