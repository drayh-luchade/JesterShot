'use strict';
/* ---------- UI buttons ---------- */
document.getElementById('rebuild').addEventListener('click', resetScene);
document.getElementById('clear').addEventListener('click', () => { clearBoard(); toast('Board cleared'); });
document.getElementById('mode').addEventListener('click', () => setMode(game.mode === 'build' ? 'fight' : 'build'));
document.getElementById('addTower').addEventListener('click', () => spawnTower(game.paper));
document.querySelectorAll('button').forEach(b => b.addEventListener('click', () => b.blur()));  // keep Space from re-clicking
document.getElementById('shove').addEventListener('click', () => towers.forEach(t => t.shove(1.2)));
const fireBtn = document.getElementById('fire');
fireBtn.addEventListener('pointerdown', primaryDown);
fireBtn.addEventListener('pointerup', primaryUp);
fireBtn.addEventListener('pointerleave', primaryUp);

/* ---------- Resize ---------- */
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ---------- Loop: move, step physics, apply dents, slump, sync, draw ---------- */
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  moveCamera(dt);
  steerBananas(dt);
  world.step(1 / 120, dt, 8);       // 120 Hz so fast missiles don't tunnel through thin blocks
  processBlasts();
  processMelon();
  processSlime();
  for (const t of towers) { t.flush(); t.update(dt); t.sync(); }
  if (game.mode === 'build') updateGhost();
  updateShots();
  updateProps(dt);
  updatePearls(dt);
  updateSpots(dt);
  updateSlime();
  updateFlashes(dt);
  updateChunks(dt);
  updateHUD();
  updatePad();
  renderer.render(scene, camera);
});
