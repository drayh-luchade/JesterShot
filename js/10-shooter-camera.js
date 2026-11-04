'use strict';
/* ---------- Shooters are bamboo tubes, open at the muzzle ---------- */
const strawCache = {};
function strawMaterial(color) {                                    // (name kept) bamboo: fibres + dark nodes
  if (!strawCache[color]) {
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 256;
    const g = cv.getContext('2d'), r = mulberry32(7);
    g.fillStyle = color; g.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 46; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,.09)' : 'rgba(255,255,255,.08)'; g.fillRect(r() * 64, 0, 1 + r() * 2, 256); }
    for (const y of [58, 182]) {                                    // nodes
      g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(0, y - 9, 64, 4);
      g.fillStyle = 'rgba(45,32,10,.7)'; g.fillRect(0, y - 4, 64, 8);
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, y + 4, 64, 6);
    }
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    strawCache[color] = new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide, fog: false });
  }
  return strawCache[color];
}
const gun = new THREE.Group();
const gunBarrelGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.9, 16, 1, true);   // open-ended tube
gunBarrelGeo.rotateX(-Math.PI / 2);
gunBarrelGeo.translate(0, 0, -0.45);
const gunMat = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, fog: false });
const gunBarrel = new THREE.Mesh(gunBarrelGeo, strawMaterial('#8fa64a'));
gun.add(gunBarrel);
gun.position.set(0.42, -0.34, -0.8);
gun.traverse(o => { o.frustumCulled = false; });
camera.add(gun);
const MUZZLE = new THREE.Vector3(0, 0, -0.9);

/* ---------- Free-fly camera: hold left mouse to look, WASD to move ---------- */
camera.position.set(30, 12, 50);
let yaw = 0, pitch = 0;
{
  const d = new THREE.Vector3(0, 4, 0).sub(camera.position);
  yaw = Math.atan2(-d.x, -d.z);
  pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
}
const keys = new Set();
window.addEventListener('keydown', e => {
  keys.add(e.code);
  if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyF' && !e.repeat) towers.forEach(t => t.shove(1.2));
  if (e.code === 'KeyB' && !e.repeat) setMode(game.mode === 'build' ? 'fight' : 'build');
  if (e.code === 'KeyX' && game.mode === 'build') removeTargeted(e.shiftKey);
  if (e.code === 'KeyG' && game.mode === 'build') game.seed = (game.seed * 1103515245 + 12345) & 0x7fffffff;
  if (e.code === 'KeyR' && game.mode === 'build') game.yaw = (game.yaw + 1) % 4;
  if (e.code === 'KeyT' && game.mode === 'build') {                    // cycle shapes, then structures
    const all = [...Object.keys(SHAPES).map(k => ['shape', k]), ...Object.keys(STRUCTURES).map(k => ['struct', k])];
    const cur = game.item === 'shape' ? game.shape : game.struct, i = all.findIndex(([t, k]) => t === game.item && k === cur);
    const [t, k] = all[(i + 1) % all.length];
    if (t === 'shape') setShape(k); else setStruct(k);
  }
  if (e.code === 'BracketLeft') setPower(game.power - 0.25);
  if (e.code === 'BracketRight') setPower(game.power + 0.25);
  if (e.code === 'Comma') setSpread(game.spread - 0.01);
  if (e.code === 'Period') setSpread(game.spread + 0.01);
  const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].indexOf(e.code);
  if (n >= 0 && game.mode === 'build') { if (n < Object.keys(PAPER).length) setPaper(Object.keys(PAPER)[n]); }
  else if (n >= 0 && n < Object.keys(WEAPONS).length) setWeapon(Object.keys(WEAPONS)[n]);
});
window.addEventListener('keyup', e => { keys.delete(e.code); if (e.code === 'Space') e.preventDefault(); });
window.addEventListener('blur', () => { keys.clear(); });
const padBtns = [...document.querySelectorAll('.pb')];             // on-screen pad: each button holds the same key as the keyboard
for (const b of padBtns) {
  const code = b.dataset.k;
  b.addEventListener('pointerdown', e => { e.preventDefault(); keys.add(code); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => keys.delete(code));
}
function updatePad() {                                                // light up pad buttons when their keys are down
  for (const b of padBtns) b.classList.toggle('on', keys.has(b.dataset.k) || (b.dataset.alt || '').split(' ').some(c => c && keys.has(c)));
}

function moveCamera(dt) {
  camera.rotation.set(pitch, yaw, 0);
  const reach = Math.max(1, camera.position.length() / 60);          // fly faster the farther you are from the table
  const sp = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 60 : 16) * reach * dt;
  const cp = Math.cos(pitch);
  const fwd = new THREE.Vector3(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  if (keys.has('KeyW')) camera.position.addScaledVector(fwd, sp);
  if (keys.has('KeyS')) camera.position.addScaledVector(fwd, -sp);
  if (keys.has('KeyD') || keys.has('ArrowRight')) camera.position.addScaledVector(right, sp);
  if (keys.has('KeyA') || keys.has('ArrowLeft')) camera.position.addScaledVector(right, -sp);
  if (keys.has('Space') || keys.has('KeyE') || keys.has('ArrowUp') || keys.has('PageUp')) camera.position.y += sp;
  if (keys.has('KeyC') || keys.has('KeyQ') || keys.has('ArrowDown') || keys.has('PageDown')) camera.position.y -= sp;
  const P = camera.position;                                          // stay inside the room
  P.x = Math.max(-ROOM.w / 2 + 2, Math.min(ROOM.w / 2 - 2, P.x));
  P.z = Math.max(-ROOM.d / 2 + 2, Math.min(ROOM.d / 2 - 2, P.z));
  P.y = Math.max(FLOOR_Y + 1, Math.min(FLOOR_Y + ROOM.h - 2, P.y));
}

let looking = false, lastX = 0, lastY = 0;
dom.addEventListener('contextmenu', e => e.preventDefault());
dom.addEventListener('pointerdown', e => {
  if (e.button === 2) { primaryDown(); return; }                         // right click = shoot
  if (e.button !== 0) return;
  looking = true; lastX = e.clientX; lastY = e.clientY;
  dom.setPointerCapture(e.pointerId);
  dom.classList.add('looking');
});
dom.addEventListener('pointermove', e => {
  if (!looking) return;
  yaw -= (e.clientX - lastX) * 0.0035;
  pitch = Math.max(-1.55, Math.min(1.55, pitch - (e.clientY - lastY) * 0.0035));
  lastX = e.clientX; lastY = e.clientY;
});
const stopLook = () => { looking = false; dom.classList.remove('looking'); };
dom.addEventListener('pointerup', e => { if (e.button === 0) stopLook(); });
window.addEventListener('pointerup', e => { if (e.button === 2) primaryUp(); });
dom.addEventListener('pointercancel', stopLook);

/* ---------- Game state ---------- */
const game = { mode: 'fight', weapon: 'banana', paper: 'craft', sizeIdx: 2, score: 0, power: 1, spread: 0.02, shape: 'cube', yaw: 0, item: 'shape', struct: 'cottage', seed: 7, deleting: false,
               lastFire: { banana: 0, algae: 0, watermelon: 0, takoyaki: 0 } };
