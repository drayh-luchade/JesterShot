'use strict';
/* ---------- Explosions (missile) ---------- */
const flashGeo = new THREE.SphereGeometry(1, 16, 12);
const flashes = [];
function spawnFlash(p, radius, color = 0xffb347) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(flashGeo, mat);
  mesh.position.set(p.x, p.y, p.z);
  mesh.scale.setScalar(0.3);
  scene.add(mesh);
  flashes.push({ mesh, mat, t: 0, radius });
}
function updateFlashes(dt) {
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i], k = (f.t += dt) / 0.4;
    if (k >= 1) { scene.remove(f.mesh); f.mat.dispose(); flashes.splice(i, 1); continue; }
    f.mesh.scale.setScalar(0.3 + f.radius * 0.7 * (1 - (1 - k) * (1 - k)));
    f.mat.opacity = 0.85 * (1 - k);
  }
}

/** Radial impulse with linear falloff on every dynamic body in range, plus a queued dent on blocks. */
function explode(center, ex, skip) {
  const k = (skip && skip.power) || 1, R = ex.radius * Math.sqrt(k);
  for (const b of world.bodies) {
    if (b.mass === 0 || b === skip) continue;
    const dx = b.position.x - center.x, dy = b.position.y - center.y, dz = b.position.z - center.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > R) continue;
    const f = 1 - d / R;
    const dir = d > 1e-3 ? new CANNON.Vec3(dx / d, dy / d + 0.35, dz / d) : new CANNON.Vec3(0, 1, 0);
    dir.normalize();
    b.wakeUp();
    b.applyImpulse(dir.scale(ex.impulse * f * k), new CANNON.Vec3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8));
    if (b.block) {
      const S = b.block.mesh.scale;
      b.block.owner.pending.push({
        block: b.block, dir, sev: ex.dent * f * k,
        point: b.position.vsub(dir.scale(Math.min(S.x, S.y, S.z) / 2)),   // face nearest the blast
      });
    }
  }
  if (!ex.noFlash) spawnFlash(center, R, ex.color);
}
function processBlasts() {
  while (blasts.length) {
    const { body, ex } = blasts.pop();
    explode(body.position.clone(), ex, body);
    const i = shots.findIndex(s => s.body === body);
    if (i >= 0) removeShot(shots.splice(i, 1)[0]);
  }
}

/* ---------- Aiming + firing (crosshair at screen centre) ---------- */
const raycaster = new THREE.Raycaster();
function pickTargets() {                                            // outer sheet mesh of every block + the ground
  const t = towers.flatMap(x => x.blocks.map(b => b.mesh.children[0]));
  t.push(ground, floor);
  return t;
}
function centerTarget() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hit = raycaster.intersectObjects(pickTargets(), false)[0];
  return hit ? hit.point.clone() : raycaster.ray.at(90, new THREE.Vector3());
}

function fireWeapon() {
  const w = WEAPONS[game.weapon], now = performance.now();
  if (now - game.lastFire[w.id] < w.cooldown) return;
  game.lastFire[w.id] = now;
  camera.rotation.set(pitch, yaw, 0);
  camera.updateMatrixWorld(true);
  const target = centerTarget();
  const muzzle = gun.localToWorld(MUZZLE.clone());
  const speed = w.speed * game.power;
  if (w.boomerang) { launchBanana(w, muzzle, target, speed); return; }

  const t = muzzle.distanceTo(target) / speed;                       // cancel gravity drop over the flight time
  const adj = target.clone();
  adj.y += 0.5 * 9.82 * t * t;
  const dir = adj.sub(muzzle).normalize();

  // Tri-shot throws a triangle of three peas (one up, two low) that fans out; every other weapon fires one.
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  const pattern = w.volley ? [[0, 0.5], [-1, -0.5], [1, -0.5]] : [[0, 0]], sp = w.volley ? game.spread : 0;
  for (const [ox, oy] of pattern) {
    const d = dir.clone().addScaledVector(right, ox * sp).addScaledVector(up, oy * sp).normalize();
    const start = muzzle.clone().addScaledVector(d, 0.4 + w.radius);
    if (w.volley) start.addScaledVector(right, ox * 0.5).addScaledVector(up, oy * 0.5);    // keep the three peas from overlapping at launch
    launchShot(w, start, d, speed);
  }
}
function launchShot(w, start, dir, speed) {
  const body = new CANNON.Body({
    mass: w.mass, shape: new CANNON.Sphere(w.radius), material: w.bouncy ? bouncyMat : paperMat,
    linearDamping: 0.01, angularDamping: 0.2,
    allowSleep: true, sleepSpeedLimit: 0.2, sleepTimeLimit: 0.8,
  });
  body.isPea = true;                                                 // "is a projectile" (see PaperBuilding._onHit)
  if (w.slime) body.collisionResponse = false;                       // boba reports touches but never pushes anything
  body.weapon = w;
  body.power = game.power;                                           // missiles scale their blast with it
  body.position.set(start.x, start.y, start.z);
  world.addBody(body);
  const J = speed * w.mass;                                          // impulse = m * v
  body.applyImpulse(new CANNON.Vec3(dir.x * J, dir.y * J, dir.z * J));
  body.angularVelocity.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
  body.addEventListener('collide', e => onShotHit(body, e));

  const modelMesh = w.model && instantiateModel(w.model, w.modelScale);          // the Katamari model, once it has loaded
  const mesh = modelMesh || new THREE.Mesh(w.geo, w.bouncy ? shotMat.clone() : (w.mat || shotMat));
  mesh.castShadow = true;
  scene.add(mesh);
  body.mesh = mesh;
  body.born = performance.now();
  shots.push({ mesh, body });
  if (shots.length > MAX_SHOTS) removeShot(shots.shift());
}

/* ---------- Bananarang: thrown from the shooter's side, it sweeps out through the crosshair and loops back round the other way ---------- */
// A kinematic body (it can push things but nothing pushes it) is driven along an ellipse: it starts at the muzzle heading sideways, swings out
// to the crosshair point, and curves back. It has no collision response; each touch instead gives a measured shove (see onShotHit), while the
// block's own listener applies the dent and tear. The curve of the banana is laid flat so it spins like a boomerang.
function launchBanana(w, muzzle, target, speed) {
  const O = muzzle.clone(), D = new THREE.Vector3(target.x - O.x, 0, target.z - O.z);
  let L = D.length();
  if (L < 8) { D.set(-Math.sin(yaw), 0, -Math.cos(yaw)); L = 30; } else D.divideScalar(L);
  L = Math.min(L, 80);
  const R = new THREE.Vector3(-D.z, 0, D.x);                           // the shooter's right-hand side
  const a = Math.min(16, Math.max(4, 0.32 * L)), dy = Math.max(-6, Math.min(8, target.y - O.y));
  const perim = 2 * Math.PI * Math.sqrt((a * a + (L / 2) * (L / 2)) / 2);
  const T = Math.min(5.5, Math.max(1.8, perim / speed));              // seconds for the whole loop
  const body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, shape: new CANNON.Sphere(w.radius) });
  body.isPea = true;                                                   // counts as a projectile for dents
  body.collisionResponse = false;
  body.weapon = w;
  body.banana = { O, D, R, L, a, dy, T, age: 0 };
  body.position.set(O.x, O.y, O.z);
  body.addEventListener('collide', e => onShotHit(body, e));
  world.addBody(body);
  body.born = performance.now();
  const mesh = new THREE.Group(), model = instantiateModel(w.model, w.modelScale);
  if (model) { model.children[0].rotation.z = Math.PI / 2; mesh.add(model); }       // model is curved in its y-z plane: turn it flat
  else mesh.add(new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.18, 8, 16, Math.PI), new THREE.MeshLambertMaterial({ color: 0xe8d35a })));
  mesh.position.copy(O);
  scene.add(mesh);
  body.mesh = mesh;
  shots.push({ mesh, body });
  if (shots.length > MAX_SHOTS) removeShot(shots.shift());
}
function steerBananas(dt) {                                           // runs before each physics step: put every bananarang on its curve
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i], bn = s.body.banana;
    if (!bn) continue;
    bn.age += dt;
    if (bn.age >= bn.T) { removeShot(shots.splice(i, 1)[0]); continue; }
    const th = 2 * Math.PI * bn.age / bn.T, c = Math.cos(th), sn = Math.sin(th), k = 2 * Math.PI / bn.T, half = bn.L / 2;
    s.body.position.set(bn.O.x + bn.D.x * half * (1 - c) + bn.R.x * bn.a * sn,
                        bn.O.y + bn.dy * (1 - c) / 2,
                        bn.O.z + bn.D.z * half * (1 - c) + bn.R.z * bn.a * sn);
    s.body.velocity.set((bn.D.x * half * sn + bn.R.x * bn.a * c) * k, (bn.dy / 2) * sn * k, (bn.D.z * half * sn + bn.R.z * bn.a * c) * k);
    s.body.quaternion.setFromEuler(0, th * 6, 0);                      // spins three full turns per loop
  }
}
