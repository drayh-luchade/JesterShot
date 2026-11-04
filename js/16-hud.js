'use strict';
/* ---------- HUD: weapon selector + score ---------- */
const $ = id => document.getElementById(id);
const scoreEl = $('scoreVal'), distEl = $('disturbed'), popsEl = $('pops');
const weaponBtns = {};
for (const w of Object.values(WEAPONS)) {
  const btn = document.createElement('button');
  btn.className = 'weapon';
  btn.innerHTML = `<span class="key">${w.num}</span><b>${w.name}</b><small>${w.tag}</small><i class="cd"></i>`;
  btn.addEventListener('click', () => setWeapon(w.id));
  $('weapons').appendChild(btn);
  weaponBtns[w.id] = btn;
}
const gunExtras = [-1, 1].map(sg => {                                // the tri-shot is three straws bundled together
  const m = new THREE.Mesh(gunBarrelGeo, gunBarrel.material);
  m.position.set(sg * 0.06, -0.03, 0);
  m.rotation.y = sg * 0.035;
  m.visible = false; m.frustumCulled = false;
  gun.add(m);
  return m;
});
function setWeapon(id) {
  game.weapon = id;
  const w = WEAPONS[id], tri = !!w.volley;
  for (const k in weaponBtns) weaponBtns[k].classList.toggle('active', k === id);
  gunBarrel.scale.set(w.gunScale, w.gunScale, 1);
  gunBarrel.material = strawMaterial(w.stripe);
  gunBarrel.position.y = tri ? 0.04 : 0;                             // top of the triangle when bundled
  for (const m of gunExtras) { m.visible = tri; m.material = gunBarrel.material; m.scale.copy(gunBarrel.scale); }
  $('spreadRow').style.display = tri ? 'block' : 'none';
}
function setSpread(v) {                                              // tri-shot concentration: 0 = parallel peas, higher = wider fan
  game.spread = Math.min(0.1, Math.max(0, Math.round(v * 200) / 200));
  $('sp').value = game.spread;
  $('spVal').textContent = game.spread === 0 ? 'parallel' : `±${(game.spread * 180 / Math.PI).toFixed(1)}°`;
  spreadVisual();
}
function spreadVisual() {                                             // the bundled straws splay by the same proportion
  gunExtras.forEach((m, i) => { m.rotation.y = (i ? -1 : 1) * game.spread * 0.6; });
}
function setPower(v) {
  game.power = Math.min(3, Math.max(0.5, v));
  $('pw').value = game.power;
  $('pwVal').textContent = `×${game.power.toFixed(2)}`;
}
function cycleWeapon(step) {
  const ids = Object.keys(WEAPONS);
  setWeapon(ids[(ids.indexOf(game.weapon) + step + ids.length) % ids.length]);
}
dom.addEventListener('wheel', e => {
  e.preventDefault();
  const step = Math.sign(e.deltaY) || 1;
  if (game.mode === 'build') setSize(step); else cycleWeapon(step);
}, { passive: false });

function refreshDisturbed() {
  const all = [...towers.flatMap(t => t.blocks), ...props], n = all.filter(b => b.moved || b.touched).length;
  distEl.textContent = `${n} / ${all.length} blocks disturbed`;
}
function addScore(pts, label) {
  game.score += pts;
  scoreEl.textContent = game.score.toLocaleString();
  refreshDisturbed();
  scoreEl.classList.remove('bump'); void scoreEl.offsetWidth; scoreEl.classList.add('bump');
  const pop = document.createElement('div');
  pop.className = 'pop';
  pop.textContent = `+${pts} ${label}`;
  popsEl.appendChild(pop);
  setTimeout(() => pop.remove(), 1200);
}
function resetScore() {
  game.score = 0;
  scoreEl.textContent = '0';
  refreshDisturbed();
}
function updateHUD() {                                              // cooldown bars shrink as each weapon reloads
  const now = performance.now();
  for (const w of Object.values(WEAPONS)) {
    const left = 1 - Math.min(1, (now - game.lastFire[w.id]) / w.cooldown);
    weaponBtns[w.id].lastChild.style.transform = `scaleX(${left})`;
  }
}
