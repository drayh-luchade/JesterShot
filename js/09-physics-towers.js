'use strict';
/* ---------- Physics ---------- */
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;
world.solver.iterations = 20;
const paperMat = new CANNON.Material('paper');
const surf = new Map([[paperMat, { f: 0.6, r: 0.03 }]]);     // ground + projectiles use paperMat
for (const [k, p] of Object.entries(PAPER)) { p.phys = new CANNON.Material(k); surf.set(p.phys, { f: p.friction, r: p.bounce }); }
const mats = [...surf.keys()];
for (let i = 0; i < mats.length; i++) for (let j = i; j < mats.length; j++) {
  const a = surf.get(mats[i]), c = surf.get(mats[j]);
  world.addContactMaterial(new CANNON.ContactMaterial(mats[i], mats[j], {
    friction: Math.sqrt(a.f * c.f), restitution: Math.max(a.r, c.r),
  }));
}
const bouncyMat = new CANNON.Material('bouncy');                  // the bouncy pea: lively against everything, itself included
for (const m of [...mats, bouncyMat]) world.addContactMaterial(new CANNON.ContactMaterial(bouncyMat, m, { friction: 0.3, restitution: 0.88 }));
const slickMat = new CANNON.Material('slick');                    // a slime-soaked block: almost frictionless, so it slides off its stack
for (const m of [...mats, bouncyMat, slickMat]) world.addContactMaterial(new CANNON.ContactMaterial(slickMat, m, { friction: 0.03, restitution: 0 }));
// Tabletop is a finite static box (top at y = 0); the floor, walls and ceiling are planes so nothing escapes the room.
const tableBody = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(TABLE.w / 2, 0.6, TABLE.d / 2)), material: paperMat });
tableBody.position.set(0, -0.6, 0);
tableBody.isGround = true;
world.addBody(tableBody);
function addPlane(nx, ny, nz, px, py, pz) {
  const b = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: paperMat });
  b.quaternion.setFromVectors(new CANNON.Vec3(0, 0, 1), new CANNON.Vec3(nx, ny, nz));
  b.position.set(px, py, pz);
  world.addBody(b);
  return b;
}
addPlane(0, 1, 0, 0, FLOOR_Y, 0).isGround = true;                  // floor: blocks that fall off the table still count as floored
addPlane(0, -1, 0, 0, FLOOR_Y + ROOM.h, 0);
addPlane(1, 0, 0, -ROOM.w / 2, 0, 0); addPlane(-1, 0, 0, ROOM.w / 2, 0, 0);
addPlane(0, 0, 1, 0, 0, -ROOM.d / 2); addPlane(0, 0, -1, 0, 0, ROOM.d / 2);

/* ---------- Towers: several generated towers + one user-built "workshop" ---------- */
const towers = [];
const START_TOWERS = [['craft', [0, 0]], ['lined', [-26, -10]], ['canvas', [26, -16]], ['fiber', [-14, 24]], ['sticky', [30, 22]]];
let seedCounter = 7;
function spawnTower(paper = 'craft', origin = null) {
  for (let tries = 0; tries < 40 && !origin; tries++) {          // find a spot at least 11 units from other towers
    const c = [(Math.random() - 0.5) * (TABLE.w - 24), (Math.random() - 0.5) * (TABLE.d - 24)];
    if (towers.every(t => t === workshop || Math.hypot(t.opts.origin[0] - c[0], t.opts.origin[1] - c[1]) > 11)) origin = c;
  }
  origin = origin || [(Math.random() - 0.5) * (TABLE.w - 24), (Math.random() - 0.5) * (TABLE.d - 24)];
  seedCounter = (seedCounter * 31 + 11) % 100000;
  const t = new PaperBuilding({
    floors: 4 + (seedCounter % 5), size: 3 + (seedCounter % 3) * 0.3, seed: seedCounter, paper, origin,
  }, world, paperMat);
  t.onScore = (...a) => addScore(...a);   // wrapper: addScore lives in a later file
  scene.add(t);
  towers.push(t);
  return t;
}
const workshop = new PaperBuilding({ empty: true }, world, paperMat);
workshop.onScore = (...a) => addScore(...a);   // wrapper: addScore lives in a later file
scene.add(workshop);
towers.push(workshop);
function clearBoard() {                                              // remove every tower, structure, block and shot
  for (const t of [...towers]) {
    if (t === workshop) { t.rebuild(); continue; }
    t.dispose(); scene.remove(t); towers.splice(towers.indexOf(t), 1);
  }
  props.slice().forEach(removeProp);
  clearShots();
  clearHover();
  clearTableSlime();
  resetScore();
}
function resetScene() {                                               // back to the five starting towers
  clearBoard();
  START_TOWERS.forEach(([p, o]) => spawnTower(p, o));
  refreshDisturbed();
}
START_TOWERS.forEach(([p, o]) => spawnTower(p, o));
