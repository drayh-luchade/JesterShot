'use strict';
/* ---------- Projectiles: wrinkled pea geometry, tinted per weapon ---------- */
function makePeaGeometry(r, darkHex, lightHex) {
  const g = new THREE.IcosahedronGeometry(r, 3);
  const pos = g.attributes.position, colors = new Float32Array(pos.count * 3);
  const dark = new THREE.Color(darkHex), light = new THREE.Color(lightHex), c = new THREE.Color();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const w = 1 + 0.05 * Math.sin(v.x * 11 + 1.3) * Math.sin(v.y * 9 + 0.7) * Math.sin(v.z * 13)
                + 0.03 * Math.sin(v.x * 23 + v.y * 19 + v.z * 17);
    pos.setXYZ(i, v.x * r * w, v.y * r * w, v.z * r * w);
    c.copy(dark).lerp(light, Math.min(1, Math.max(0, (w - 0.92) / 0.16)));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}
Object.entries(WEAPONS).forEach(([id, w], i) => {
  w.id = id; w.num = i + 1;
  if (w.pearl) {                                                      // boba: a smooth, glossy tapioca pearl rather than a wrinkled pea
    w.geo = new THREE.SphereGeometry(w.radius, 24, 16);
    w.mat = new THREE.MeshPhongMaterial({ color: 0x2b1a12, specular: 0x9a8070, shininess: 70 });
  } else w.geo = makePeaGeometry(w.radius, w.dark, w.light);
});
const shotMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const shots = [];
const blasts = [];
function removeShot(p) { scene.remove(p.mesh); world.removeBody(p.body); if (p.body.weapon.bounces) p.mesh.material.dispose(); else if (p.mesh.isGroup) disposeModel(p.mesh); }
function clearShots() { while (shots.length) removeShot(shots.pop()); }
function updateShots() {
  const now = performance.now();
  for (const p of shots) {
    p.mesh.position.copy(p.body.position); p.mesh.quaternion.copy(p.body.quaternion);
    const w = p.body.weapon;                                          // a bouncy pea that has settled still pops after a while
    if (w.bounces && !p.body.exploded && now - p.body.born > 8000) { p.body.exploded = true; blasts.push({ body: p.body, ex: w.burst }); }
    if (w.slime && !p.body.done && now - p.body.born > 6000) { p.body.done = true; slimeKills.push(p.body); }   // flew off somewhere
  }
}

/* Projectile collision listener: missiles detonate; other shots give the block an extra off-centre shock. */
function onShotHit(shot, e) {
  const w = shot.weapon;
  if (w.explosion) {
    if (!shot.exploded) { shot.exploded = true; blasts.push({ body: shot, ex: w.explosion }); }
    return;                                                           // handled after the step
  }
  if (w.bounces) {                                                    // bouncy pea: counts its bounces, then bursts
    const now = performance.now();
    if (now - (shot.lastBounce || 0) > 90) {                          // one touch can raise several contacts at once: count it once
      shot.lastBounce = now;
      shot.bounceCount = (shot.bounceCount || 0) + 1;
      if (shot.bounceCount > w.bounces) {                             // it has bounced `bounces` times: the next touch pops it
        if (!shot.exploded) { shot.exploded = true; blasts.push({ body: shot, ex: w.burst }); }
      } else if (shot.mesh) shot.mesh.material.emissive.setRGB(0.18 * shot.bounceCount, 0.14 * shot.bounceCount, 0);   // glows hotter each bounce
    }
  }
  if (w.slime) {                                                      // boba: no weight, no push; it just reports what it touched
    if (shot.done) return;
    if (e.body.block) { shot.done = true; slimeHits.push({ shot, block: e.body.block }); }
    else if (e.body.isGround) { shot.done = true; groundHits.push({ shot }); }                     // the table or the floor: it sticks / skids there
    else if (e.body.mass === 0) { shot.done = true; slimeKills.push(shot); }                        // a wall or the ceiling
    return;
  }
  if (w.burstOnFloor && e.body.isGround) {                            // giant watermelon: pops when it hits the table or the floor hard enough
    if (!shot.exploded && Math.abs(e.contact.getImpactVelocityAlongNormal()) > 3) { shot.exploded = true; melonBursts.push({ shot, onTable: e.body === tableBody }); }
    return;
  }
  if (w.boomerang) {                                                  // bananarang: a measured shove along its direction of travel
    const tgt = e.body;
    if (tgt.mass > 0) {
      const c = e.contact, r = c.bi === tgt ? c.ri : c.rj, v = shot.velocity;
      tgt.wakeUp();
      tgt.applyImpulse(new CANNON.Vec3(v.x, Math.max(0, v.y) + 1.5, v.z).scale(tgt.mass * 0.28), r.clone());
    }
    return;
  }
  if (!e.body.block) return;
  const c = e.contact, impact = Math.abs(c.getImpactVelocityAlongNormal());
  if (impact < 2) return;
  const sgn = c.bi === shot ? 1 : -1, travel = shot.velocity.unit();
  const dir = new CANNON.Vec3(c.ni.x * sgn + travel.x, c.ni.y * sgn + travel.y, c.ni.z * sgn + travel.z);
  dir.normalize();
  const r = c.bi === e.body ? c.ri : c.rj;
  e.body.applyImpulse(dir.scale(impact * shot.mass * 0.25), r.clone());
}
