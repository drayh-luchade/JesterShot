'use strict';
/* ---------- Builder: paper palette, ghost block, place / remove ---------- */
const BUILD_SIZES = [1, 1.5, 2, 3];
const FIGHT_HINT = 'Hold left-click + drag: look · WASD: move · Space / E / ↑: up · C / Q / ↓: down · Shift: fast · Right-click: fire · 1-4 or wheel: weapon · B: build mode · F: shove · [ ]: strength';
const BUILD_HINT = 'Build mode — drag a tile, shape or village structure onto the table · size chips / wheel · R: rotate · G: new variation · T: next item · Right-click: place · X: delete the structure under the cursor (Shift+X: one block) · B: back';
const paperBtns = {}, sizeBtns = [], shapeBtns = {};
const mouse = new THREE.Vector2();
let overCanvas = false;
const drag = { active: false };
const tileRow = document.createElement('div'), shapeRow = document.createElement('div'), structRow = document.createElement('div'), sizeRow = document.createElement('div');
tileRow.className = shapeRow.className = structRow.className = sizeRow.className = 'row';
$('palette').append(tileRow, shapeRow, structRow, sizeRow);

function moveCard(e) { const c = $('dragCard'); c.style.left = e.clientX + 14 + 'px'; c.style.top = e.clientY + 14 + 'px'; }
function startDrag(e) {                                           // begin dragging the currently selected paper + shape + size
  e.preventDefault();
  drag.active = true;
  $('dragCard').textContent = (game.item === 'struct' ? STRUCTURES[game.struct].label : `${PAPER[game.paper].name} ${SHAPES[game.shape].name}`) + ` · size ${BUILD_SIZES[game.sizeIdx]}`;
  $('dragCard').style.display = 'block';
  moveCard(e);
}
function endDrag() { drag.active = false; $('dragCard').style.display = 'none'; }
function updatePointer(e) {
  mouse.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  overCanvas = document.elementFromPoint(e.clientX, e.clientY) === dom;
}
Object.entries(PAPER).forEach(([id, p], i) => {
  const btn = document.createElement('button');
  btn.className = 'weapon';
  btn.innerHTML = `<span class="key">${i + 1}</span><b><i class="sw" style="background:#${p.colors[0].toString(16).padStart(6, '0')}"></i>${p.name}</b><small>${p.note}</small>`;
  btn.addEventListener('pointerdown', e => {                         // press a tile and drag it onto the table
    if (e.button !== 0) return;
    setPaper(id);
    startDrag(e);
  });
  tileRow.appendChild(btn);
  paperBtns[id] = btn;
});
BUILD_SIZES.forEach((sz, i) => {
  const chip = document.createElement('button');
  chip.className = 'chip';
  chip.textContent = `Size ${sz}`;
  chip.addEventListener('click', () => setSizeIdx(i));
  sizeRow.appendChild(chip);
  sizeBtns.push(chip);
});
Object.entries(SHAPES).forEach(([id, sh]) => {                    // shape chips: click to select, or press and drag onto the table
  const chip = document.createElement('button');
  chip.className = 'chip';
  chip.textContent = sh.name;
  chip.style.touchAction = 'none';
  chip.addEventListener('pointerdown', e => { if (e.button !== 0) return; setShape(id); startDrag(e); });
  shapeRow.appendChild(chip);
  shapeBtns[id] = chip;
});
const structBtns = {};
Object.entries(STRUCTURES).forEach(([id, st]) => {                    // village structures: click to select, or press and drag onto the table
  const chip = document.createElement('button');
  chip.className = 'chip struct';
  chip.textContent = st.label;
  chip.style.touchAction = 'none';
  chip.addEventListener('pointerdown', e => { if (e.button !== 0) return; setStruct(id); startDrag(e); });
  structRow.appendChild(chip);
  structBtns[id] = chip;
});
const delChip = document.createElement('button');
delChip.className = 'chip del';
delChip.textContent = 'Delete tool (X)';
delChip.addEventListener('click', () => setDeleting(!game.deleting));
structRow.appendChild(delChip);
function refreshItemUI() {
  for (const k in shapeBtns) shapeBtns[k].classList.toggle('active', !game.deleting && game.item === 'shape' && k === game.shape);
  for (const k in structBtns) structBtns[k].classList.toggle('active', !game.deleting && game.item === 'struct' && k === game.struct);
  delChip.classList.toggle('active', game.deleting);
  $('placeInfo').style.display = game.mode === 'build' ? 'block' : 'none';
}
function setShape(id) { game.shape = id; game.item = 'shape'; game.deleting = false; refreshItemUI(); }
function setStruct(id) { game.struct = id; game.item = 'struct'; game.deleting = false; refreshItemUI(); }
function setDeleting(on) { game.deleting = on; if (!on) clearHover(); refreshItemUI(); }
window.addEventListener('pointermove', e => { updatePointer(e); if (drag.active) moveCard(e); });
window.addEventListener('pointerup', e => {
  if (e.button !== 0 || !drag.active) return;
  endDrag();
  updatePointer(e);
  if (overCanvas && game.mode === 'build') { updateGhost(); placeBlock(); }   // dropped on the table = place it there
});
window.addEventListener('keydown', e => { if (e.code === 'Escape') endDrag(); });

function setPaper(id) {
  if (game.deleting) setDeleting(false);
  game.paper = id;
  for (const k in paperBtns) paperBtns[k].classList.toggle('active', k === id);
}
function setSizeIdx(i) {
  game.sizeIdx = i;
  sizeBtns.forEach((b, j) => b.classList.toggle('active', j === i));
}
function setSize(step) { setSizeIdx((game.sizeIdx + step + BUILD_SIZES.length) % BUILD_SIZES.length); }
const ghostMat = new THREE.MeshBasicMaterial({ color: 0x88cc88, transparent: true, opacity: 0.45, depthWrite: false });
const ghost = new THREE.Mesh(shapeGhostGeo('cube'), ghostMat);
ghost.visible = false;
scene.add(ghost);
let ghostSpot = null;

/** Size of the selected block in world units (x/z swapped when rotated 90 degrees). */
function blockDims() {
  const s = BUILD_SIZES[game.sizeIdx], d = SHAPES[game.shape].dims.map(v => v * s);
  return game.yaw % 2 ? [d[2], d[1], d[0]] : d;
}
/** Where the selected block would go: against whatever face the cursor hits; invalid if it overlaps a block. */
function placement(d) {
  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObjects(pickTargets(), false)[0];
  if (!hit) return null;
  const h = d.map(v => v / 2);
  const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
  const p = hit.point.clone().addScaledVector(n, Math.abs(n.x) * h[0] + Math.abs(n.y) * h[1] + Math.abs(n.z) * h[2]);
  if (Math.abs(n.y) > 0.7) { p.x = Math.round(p.x * 4) / 4; p.z = Math.round(p.z * 4) / 4; }   // snap when stacking
  if (hit.object === ground) p.y = h[1];
  const m = h.map(v => v - Math.min(0.25, v * 0.4));                    // slightly shrunk so touching blocks aren't "overlapping"
  let valid = true;
  for (const b of [...towers.flatMap(t => t.blocks), ...props]) {
    b.body.updateAABB();
    const a = b.body.aabb;
    if (a.lowerBound.x < p.x + m[0] && a.upperBound.x > p.x - m[0] && a.lowerBound.y < p.y + m[1] && a.upperBound.y > p.y - m[1] &&
        a.lowerBound.z < p.z + m[2] && a.upperBound.z > p.z - m[2]) { valid = false; break; }
  }
  return { pos: p, valid };
}

/* ---- preset structures: a see-through ghost of every part, placed on any upward-facing surface ---- */
const structGhost = new THREE.Group();
structGhost.visible = false;
scene.add(structGhost);
let structKey = '', curStruct = null;
function structure() {                                                  // what would be placed right now (cached per selection / variation / size)
  const k = BUILD_SIZES[game.sizeIdx] / 2, key = `${game.struct}|${game.seed}|${k}`;
  if (key !== structKey) {
    structKey = key;
    curStruct = buildStructure(game.struct, game.seed, k);
    structGhost.clear();
    for (const p of curStruct.parts) {
      if (p.shape === 'model') {                                       // show the actual model, tinted by the ghost colour
        const g = instantiateModel(p.model, 1, false);
        if (g) {
          const md = MODELS[p.model].dims; g.children[0].scale.set(p.dims[0] / md[0], p.dims[1] / md[1], p.dims[2] / md[2]);   // fit the part's box
          g.traverse(o => { if (o.isMesh) { o.material.dispose(); o.material = ghostMat; } });
          g.position.set(...p.pos); g.rotation.y = p.yaw * Math.PI / 2;
          structGhost.add(g);
          continue;
        }
      }
      const m = new THREE.Mesh(shapeGhostGeo(p.shape === 'model' ? 'cube' : p.shape), ghostMat);   // (box while a model is still loading)
      m.scale.set(...p.dims); m.position.set(...p.pos); m.rotation.y = p.yaw * Math.PI / 2;
      structGhost.add(m);
    }
  }
  return curStruct;
}
function structPlacement(st) {
  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObjects(pickTargets(), false)[0];
  if (!hit) return null;
  const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
  if (n.y < 0.7) return null;                                           // needs an upward-facing surface
  const onTable = hit.object === ground, p = hit.point.clone();
  p.x = Math.round(p.x * 4) / 4; p.z = Math.round(p.z * 4) / 4;
  if (onTable) p.y = 0;
  const b = st.bounds, cs = [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]].map(([x, z]) => rotXZ(x, z, game.yaw));
  const x0 = p.x + Math.min(...cs.map(c => c[0])), x1 = p.x + Math.max(...cs.map(c => c[0]));
  const z0 = p.z + Math.min(...cs.map(c => c[1])), z1 = p.z + Math.max(...cs.map(c => c[1]));
  let valid = !(STRUCTURES[game.struct].groundOnly && !onTable);
  if (onTable && (x0 < -TABLE.w / 2 + 0.5 || x1 > TABLE.w / 2 - 0.5 || z0 < -TABLE.d / 2 + 0.5 || z1 > TABLE.d / 2 - 0.5)) valid = false;   // must fit on the table
  const y0 = p.y + 0.3, y1 = p.y + b.h;
  for (const bl of valid ? [...towers.flatMap(t => t.blocks), ...props] : []) {
    bl.body.updateAABB();
    const a = bl.body.aabb;
    if (a.lowerBound.x < x1 - 0.2 && a.upperBound.x > x0 + 0.2 && a.lowerBound.y < y1 && a.upperBound.y > y0 &&
        a.lowerBound.z < z1 - 0.2 && a.upperBound.z > z0 + 0.2) { valid = false; break; }
  }
  return { pos: p, valid };
}
function infoText(t) { const e = $('placeInfo'); if (e.textContent !== t) e.textContent = t; }
let toastTimer = 0;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
}

/* ---- delete tool: hover highlights the whole structure under the cursor ---- */
let hoverBlocks = [], hoverProps = [];
function underCursor() {                                                // the block or prop under the pointer, whichever is nearer
  raycaster.setFromCamera(mouse, camera);
  const bh = raycaster.intersectObjects(pickTargets(), false)[0];
  const block = bh && towers.flatMap(t => t.blocks).find(x => x.mesh.children[0] === bh.object);
  const meshes = props.map(p => p.mesh), ph = raycaster.intersectObjects(meshes, true)[0];
  if (ph) {
    let o = ph.object;
    while (o && !meshes.includes(o)) o = o.parent;
    const prop = o && props.find(p => p.mesh === o);
    if (prop && (!block || ph.distance < bh.distance)) return { kind: 'prop', p: prop };
  }
  return block ? { kind: 'block', b: block } : null;
}
function groupFor(it) {                                                 // everything that belongs to the same structure
  if (it.kind === 'prop') { const id = it.p.struct; return { blocks: workshop.blocks.filter(x => x.struct === id), props: props.filter(x => x.struct === id) }; }
  const b = it.b;
  if (b.owner === workshop) return b.struct ? { blocks: workshop.blocks.filter(x => x.struct === b.struct), props: props.filter(x => x.struct === b.struct) } : { blocks: [b], props: [] };
  return { blocks: b.owner.blocks.slice(), props: [] };                 // a generated tower counts as one structure
}
function clearHover() {
  for (const b of hoverBlocks) b.sheet.outer.material.emissive.setHex(0x000000);
  for (const p of hoverProps) tintProp(p, false);
  hoverBlocks = []; hoverProps = [];
}
function updateHover() {
  const it = overCanvas ? underCursor() : null, g = it ? groupFor(it) : { blocks: [], props: [] };
  if (g.blocks.length === hoverBlocks.length && g.props.length === hoverProps.length &&
      g.blocks.every((x, i) => x === hoverBlocks[i]) && g.props.every((x, i) => x === hoverProps[i])) return;
  clearHover();
  hoverBlocks = g.blocks; hoverProps = g.props;
  for (const x of g.blocks) x.sheet.outer.material.emissive.setHex(0x771515);
  for (const p of g.props) tintProp(p, true);
}
function removeTargeted(single = false) {
  const it = underCursor();
  if (!it) return;
  clearHover();
  if (it.kind === 'prop') {
    const g = single ? { blocks: [], props: [it.p] } : groupFor(it);
    g.blocks.forEach(x => workshop.removeBlock(x)); g.props.forEach(removeProp);
  } else if (single) it.b.owner.removeBlock(it.b);
  else if (it.b.owner === workshop) { const g = groupFor(it); g.blocks.forEach(x => workshop.removeBlock(x)); g.props.forEach(removeProp); }
  else { const t = it.b.owner; t.dispose(); scene.remove(t); towers.splice(towers.indexOf(t), 1); }
  refreshDisturbed();
}

function updateGhost() {
  if (game.deleting) {
    ghost.visible = structGhost.visible = false; ghostSpot = null;
    infoText('Delete tool — right-click a structure to remove it · Shift+X: a single block');
    updateHover();
    return;
  }
  clearHover();
  if (game.item === 'struct') {
    ghost.visible = false;
    const st = structure();
    infoText(`${st.name} · R: rotate · G: new variation`);
    ghostSpot = overCanvas ? structPlacement(st) : null;
    structGhost.visible = !!ghostSpot;
    if (!ghostSpot) return;
    structGhost.position.copy(ghostSpot.pos);
    structGhost.rotation.y = game.yaw * Math.PI / 2;
    ghostMat.color.setHex(ghostSpot.valid ? 0x88cc88 : 0xdd5544);
    return;
  }
  structGhost.visible = false;
  infoText(`${SHAPES[game.shape].name} · R: rotate`);
  ghostSpot = overCanvas ? placement(blockDims()) : null;
  ghost.visible = !!ghostSpot;
  if (!ghostSpot) return;
  const s = BUILD_SIZES[game.sizeIdx];
  ghost.geometry = shapeGhostGeo(game.shape);
  ghost.position.copy(ghostSpot.pos);
  ghost.rotation.y = game.yaw * Math.PI / 2;
  ghost.scale.set(...SHAPES[game.shape].dims.map(v => v * s));
  ghostMat.color.setHex(ghostSpot.valid ? 0x88cc88 : 0xdd5544);
}
function placeBlock() {
  if (!ghostSpot || !ghostSpot.valid) return;
  const p = ghostSpot.pos;
  if (game.item === 'struct') {
    const st = structure(), q = game.yaw;
    if (STRUCTURES[game.struct].special === 'tower') spawnTower(game.paper, [p.x, p.z]);       // a real generated tower
    else {
      const mapped = st.parts.map(pt => {
        const [rx, rz] = rotXZ(pt.pos[0], pt.pos[2], q);
        return { shape: pt.shape, model: pt.model, scale: pt.scale, dims: pt.dims, x: p.x + rx, y: p.y + pt.pos[1], z: p.z + rz, yaw: (pt.yaw + q) * Math.PI / 2,
                 paper: pt.role === 'wall' ? game.paper : ROLE_PAPER[pt.role], color: pt.color };
      });
      workshop.addStructure(mapped, st.name);                           // model parts are deformable blocks too (see ModelSheet)
    }
    toast(`Placed: ${st.name}`);
    game.seed = (game.seed * 1103515245 + 12345) & 0x7fffffff;           // the next copy gets a new variation
  } else {
    workshop.addBlockAt(game.shape, BUILD_SIZES[game.sizeIdx], p.x, p.y, p.z, game.paper, game.yaw);
  }
  refreshDisturbed();
}
function primaryDown() {
  if (game.mode === 'build') return game.deleting ? removeTargeted(false) : placeBlock();
  fireWeapon();
}
function primaryUp() {}                                              // nothing to release any more (the on-screen Fire button still calls it)
function setMode(m) {
  game.mode = m;
  $('cross').style.display = m === 'build' ? 'none' : '';
  $('weapons').classList.toggle('off', m === 'build');
  $('palette').classList.toggle('on', m === 'build');
  gun.visible = m !== 'build';
  ghost.visible = false;
  structGhost.visible = false;
  if (m !== 'build') { game.deleting = false; clearHover(); }
  refreshItemUI();
  $('mode').textContent = m === 'build' ? 'Exit build (B)' : 'Build (B)';
  $('hint').textContent = m === 'build' ? BUILD_HINT : FIGHT_HINT;
}
$('pw').addEventListener('input', () => setPower(+$('pw').value));
$('pw').addEventListener('pointerup', () => $('pw').blur());       // keep WASD / Space working after dragging
$('sp').addEventListener('input', () => setSpread(+$('sp').value));
$('sp').addEventListener('pointerup', () => $('sp').blur());
setPower(1);
setSpread(0.02);
setWeapon('banana'); setPaper('craft'); setSize(0); setShape('cube'); setMode('fight');
refreshDisturbed();
