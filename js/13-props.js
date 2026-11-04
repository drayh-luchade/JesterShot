'use strict';
/* ---------- Props: solid model objects (the cows and calves). Not paper: they don't dent or tear, but they can be shoved, toppled and blasted. ---------- */
const props = [];
function addProp(pt, structId, name) {
  const mesh = instantiateModel(pt.model, pt.scale) || new THREE.Mesh(new THREE.BoxGeometry(...pt.dims), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
  mesh.position.set(pt.x, pt.y, pt.z);
  scene.add(mesh);
  const d = pt.dims, body = new CANNON.Body({
    mass: Math.max(1, d[0] * d[1] * d[2] * 1.1), shape: new CANNON.Box(new CANNON.Vec3(d[0] / 2, d[1] / 2, d[2] / 2)), material: paperMat,
    linearDamping: 0.05, angularDamping: 0.1, allowSleep: true, sleepSpeedLimit: 0.15, sleepTimeLimit: 0.6,
  });
  body.position.set(pt.x, pt.y, pt.z);
  body.quaternion.setFromEuler(0, pt.yaw, 0);
  mesh.quaternion.copy(body.quaternion);
  world.addBody(body);
  const p = { mesh, body, name, struct: structId, dead: false, moved: false, touched: false, armTimer: 1.2, restPos: null, restQuat: null };
  body.prop = p;
  props.push(p);
  return p;
}
function removeProp(p) {
  if (p.dead) return;
  p.dead = true;
  world.removeBody(p.body);
  scene.remove(p.mesh);
  disposeModel(p.mesh);
  const i = props.indexOf(p);
  if (i >= 0) props.splice(i, 1);
}
function tintProp(p, on) { p.mesh.traverse(o => { if (o.isMesh && o.material && o.material.emissive) o.material.emissive.setHex(on ? 0x771515 : 0x000000); }); }
function updateProps(dt) {                                            // sync meshes, and score a prop that has been toppled or knocked off the table
  for (const p of props) {
    p.mesh.position.copy(p.body.position); p.mesh.quaternion.copy(p.body.quaternion);
    if (p.armTimer > 0) {
      if ((p.armTimer -= dt) <= 0) { p.restPos = p.body.position.clone(); p.restQuat = p.body.quaternion.clone(); }
      continue;
    }
    if (!p.moved) {
      const dq = p.body.quaternion.mult(p.restQuat.inverse()), ang = 2 * Math.acos(Math.min(1, Math.abs(dq.w)));
      if (p.body.position.distanceTo(p.restPos) > MOVE_DIST || ang > MOVE_ANGLE) { p.moved = true; addScore(PTS_MOVED, 'Toppled'); refreshDisturbed(); }
    }
    if (!p.touched && p.body.position.y < -1.5) { p.touched = true; addScore(PTS_GROUND, 'Floored'); refreshDisturbed(); }
  }
}
