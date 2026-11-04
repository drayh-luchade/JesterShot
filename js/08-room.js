'use strict';
/* ---------- Back room of a Japanese convenience store: white tile with blue grout, steel shelving, fluorescent ceiling ---------- */
// Only the table is interactive. The shelving and everything on it is scenery: no physics, never picked, never hit.
function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h, mulberry32(w * 31 + h));
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
const tiled = (tex, rx, ry) => { const t = tex.clone(); t.needsUpdate = true; t.repeat.set(rx, ry); return t; };
const mk = (geo, mat, x, y, z, parent = scene, cast = true) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; parent.add(m);
  return m;
};
const bx = (w, h, d, mat, x, y, z, parent, cast) => mk(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent, cast);

const texTile = canvasTex(256, 256, (g, w, h, r) => {                  // 4 x 4 white tiles on blue grout (30 units a tile on the floor, 15 on the walls)
  g.fillStyle = '#3f80c9'; g.fillRect(0, 0, w, h);
  const cell = w / 4, gap = 5;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const x = i * cell + gap / 2, y = j * cell + gap / 2, s = cell - gap, v = 246 + Math.floor(r() * 8);
    g.fillStyle = `rgb(${v},${v + 1},${Math.min(255, v + 3)})`; g.fillRect(x, y, s, s);
    g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect(x, y, s, 3); g.fillRect(x, y, 3, s);                    // bevelled edge catching the light
    g.fillStyle = 'rgba(40,60,90,.12)'; g.fillRect(x, y + s - 3, s, 3); g.fillRect(x + s - 3, y, 3, s);
    for (let k = 0; k < 6; k++) { g.fillStyle = `rgba(90,100,110,${0.03 + r() * 0.05})`; g.fillRect(x + r() * s, y + r() * s, 2 + r() * 6, 1 + r() * 3); }   // scuffs
  }
});
const texCeil = canvasTex(128, 128, (g, w, h, r) => {
  g.fillStyle = '#eef0f2'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(90,100,110,${0.04 + r() * 0.08})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
  g.strokeStyle = '#aeb6be'; g.lineWidth = 4; g.strokeRect(0, 0, w, h);                                       // the drop-ceiling grid
});
const texSteel = canvasTex(256, 64, (g, w, h, r) => {
  g.fillStyle = '#c9ced3'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 140; i++) { g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${0.08 + r() * 0.2})` : `rgba(60,70,80,${0.05 + r() * 0.1})`; g.fillRect(0, r() * h, w, 0.6 + r() * 1.6); }
});
const texBox = canvasTex(128, 128, (g, w, h, r) => {                   // a cardboard carton with tape and a shipping label
  g.fillStyle = '#e4d3b4'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(120,90,50,${0.03 + r() * 0.07})`; g.fillRect(0, r() * h, w, 1 + r() * 2); }
  g.fillStyle = 'rgba(190,150,90,.85)'; g.fillRect(0, 54, w, 14);
  g.fillStyle = '#fbfbf8'; g.fillRect(14, 78, 62, 36); g.fillStyle = '#2d3a4a';
  for (let k = 0; k < 4; k++) g.fillRect(20, 84 + k * 8, 30 + r() * 38, 3);
  g.fillStyle = '#d23b3b'; g.fillRect(84, 82, 28, 10);
});
function labelTex(w, h, bg, fg, jp, en) {                              // a sign: Japanese on top, English underneath
  return canvasTex(w, h, g => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 ${Math.round(h * 0.34)}px "Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP","Meiryo",sans-serif`; g.fillText(jp, w / 2, h * 0.36);
    g.font = `600 ${Math.round(h * 0.2)}px Arial, sans-serif`; g.fillText(en, w / 2, h * 0.74);
  });
}
const texClock = canvasTex(128, 128, g => {
  g.fillStyle = '#f8f8f6'; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill();
  g.strokeStyle = '#333'; g.lineWidth = 5; g.stroke(); g.lineCap = 'round';
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.lineWidth = 3; g.beginPath(); g.moveTo(64 + Math.sin(a) * 50, 64 - Math.cos(a) * 50); g.lineTo(64 + Math.sin(a) * 56, 64 - Math.cos(a) * 56); g.stroke(); }
  g.lineWidth = 5; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.sin(0.3) * 28, 64 - Math.cos(0.3) * 28); g.stroke();
  g.lineWidth = 3; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.sin(2.1) * 42, 64 - Math.cos(2.1) * 42); g.stroke();
});
const texDoor = canvasTex(128, 256, g => {
  g.fillStyle = '#eef0f2'; g.fillRect(0, 0, 128, 256);
  g.fillStyle = '#a9c6de'; g.fillRect(34, 24, 60, 80);                                                        // the little wired-glass window
  g.strokeStyle = '#9aa3ab'; g.lineWidth = 4; g.strokeRect(34, 24, 60, 80); g.strokeRect(12, 176, 104, 68);
});

const steelMat = new THREE.MeshLambertMaterial({ map: texSteel, color: 0xe4e9ee });
const railMat = new THREE.MeshLambertMaterial({ color: 0x3f80c9 });

/* The table: a stainless prep table. Its top surface is y = 0, and `ground` is the raycast / placement target. */
const ground = new THREE.Mesh(new THREE.BoxGeometry(TABLE.w, 1.6, TABLE.d), new THREE.MeshLambertMaterial({ map: tiled(texSteel, 3, 2), color: 0xe4e9ee }));
ground.position.y = -0.8;
ground.castShadow = ground.receiveShadow = true;
scene.add(ground);
{
  const legH = TABLE.h - 1.6;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(3.2, legH, 3.2, steelMat, sx * (TABLE.w / 2 - 5), -1.6 - legH / 2, sz * (TABLE.d / 2 - 5), scene, true);
  for (const sz of [-1, 1]) bx(TABLE.w - 10, 6, 1.4, steelMat, 0, -4.6, sz * (TABLE.d / 2 - 5), scene, true);        // apron
  for (const sx of [-1, 1]) bx(1.4, 6, TABLE.d - 10, steelMat, sx * (TABLE.w / 2 - 5), -4.6, 0, scene, true);
  bx(TABLE.w - 12, 1.2, TABLE.d - 12, steelMat, 0, -TABLE.h + 10, 0, scene, true);                                  // lower shelf
}

/* The room shell. ROOM is the free space; the walls sit one shelf-depth beyond it. */
const HALLW = ROOM.w + 2 * SHELF_D, HALLD = ROOM.d + 2 * SHELF_D, CEIL_Y = FLOOR_Y + ROOM.h;
const floor = mk(new THREE.PlaneGeometry(HALLW, HALLD), new THREE.MeshLambertMaterial({ map: tiled(texTile, HALLW / 120, HALLD / 120) }), 0, FLOOR_Y, 0, scene, false);
floor.rotation.x = -Math.PI / 2;
const ceiling = mk(new THREE.PlaneGeometry(HALLW, HALLD), new THREE.MeshLambertMaterial({ map: tiled(texCeil, HALLW / 60, HALLD / 60) }), 0, CEIL_Y, 0, scene, false);
ceiling.rotation.x = Math.PI / 2;
function wallRun(len, x, z, rotY) {                                    // a wall facing into the room: white tile with blue grout up to 160, a blue rail, then pale paint
  const g = new THREE.Group(), LH = 160;
  g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g);
  mk(new THREE.PlaneGeometry(len, LH), new THREE.MeshLambertMaterial({ map: tiled(texTile, len / 60, LH / 60) }), 0, FLOOR_Y + LH / 2, 0, g, false);
  bx(len, 5, 1.5, railMat, 0, FLOOR_Y + LH, 0.5, g, false);
  mk(new THREE.PlaneGeometry(len, ROOM.h - LH), new THREE.MeshLambertMaterial({ color: 0xe9eef3 }), 0, FLOOR_Y + LH + (ROOM.h - LH) / 2, 0, g, false);
  return g;
}
wallRun(HALLW, 0, -HALLD / 2, 0);
wallRun(HALLW, 0, HALLD / 2, Math.PI);
wallRun(HALLD, -HALLW / 2, 0, Math.PI / 2);
const rightWall = wallRun(HALLD, HALLW / 2, 0, -Math.PI / 2);
{ /* the staff door in the gap in the right-hand shelving, with a clock and two notices above it */
  const g = rightWall, y0 = FLOOR_Y, frame = new THREE.MeshLambertMaterial({ color: 0x9aa3ab });
  bx(95, 210, 4, new THREE.MeshLambertMaterial({ map: texDoor }), 0, y0 + 105, 2, g, false);
  for (const sx of [-1, 1]) bx(3, 214, 7, frame, sx * 49, y0 + 107, 3.5, g, false);
  bx(101, 4, 7, frame, 0, y0 + 212, 3.5, g, false);
  bx(3, 16, 5, steelMat, 34, y0 + 100, 6, g, false);
  mk(new THREE.PlaneGeometry(64, 24), new THREE.MeshBasicMaterial({ map: labelTex(256, 96, '#c92a2a', '#ffffff', 'スタッフ専用', 'STAFF ONLY') }), 0, y0 + 150, 4.15, g, false);
  mk(new THREE.PlaneGeometry(44, 44), new THREE.MeshBasicMaterial({ map: texClock, transparent: true, alphaTest: 0.4 }), 0, y0 + 292, 1, g, false);
  for (const sx of [-1, 1]) mk(new THREE.PlaneGeometry(30, 40), new THREE.MeshBasicMaterial({ map: labelTex(120, 160, '#fffdf2', '#2a4f8f', '検品表', 'CHECKLIST') }), sx * 72, y0 + 286, 1, g, false);
}
{ /* hanging aisle signs above the two free-standing aisles */
  const signs = [['お茶・飲料', 'DRINKS', '#2f6fb3'], ['お菓子', 'SNACKS', '#d9534f'], ['日用品', 'SUPPLIES', '#3a9a5b'],
                 ['冷凍食品', 'FROZEN', '#e8a33a'], ['弁当・パン', 'BENTO', '#7a5bb0'], ['在庫', 'STOCK', '#2d8f9b']];
  let k = 0;
  for (const ax of [-250, 250]) for (const z of [-180, 0, 180]) {
    const [jp, en, col] = signs[k++];
    mk(new THREE.PlaneGeometry(100, 38), new THREE.MeshBasicMaterial({ map: labelTex(256, 96, col, '#ffffff', jp, en), side: THREE.DoubleSide }), ax, CEIL_Y - 45, z, scene, false).rotation.y = Math.PI / 2;
    for (const dz of [-38, 38]) bx(1, 26, 1, steelMat, ax, CEIL_Y - 13, z + dz, scene, false);
  }
}

/* Shelving, stock and ceiling lights: each is one instanced draw call. */
/** Shelving layout for the back room: metal frames and stock as plain boxes / cylinders in world units (y measured up from the floor).
 *  Units line the four walls (outside the free space `room`, depth D) and form two free-standing aisles. All of it is scenery. */
function konbiniLayout(rand, room, D) {
  const W = 120, H = 232, LV = [8, 68, 128, 188];        // unit width and height; top surfaces of the four shelf boards
  const frames = [], boxes = [], bottles = [];
  const palette = [0xc9a46c, 0xb8925a, 0xd9b98a, 0xe9e0cf, 0xcfd8e3, 0xf4d35e, 0xe07a5f, 0x81b29a, 0x7aa6d8];
  const pick = () => palette[Math.floor(rand() * palette.length)];
  function unit(cx, cz, ang) {                           // centred at (cx, cz); its open front faces direction ang (0 = +z, PI/2 = +x)
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const put = (lx, ly, lz, sx, sy, sz) => ({ x: cx + lx * ca + lz * sa, y: ly, z: cz - lx * sa + lz * ca, sx, sy, sz, rot: ang });
    for (const px of [-W / 2 + 1.5, W / 2 - 1.5]) for (const pz of [-D / 2 + 1.5, D / 2 - 1.5]) frames.push(put(px, H / 2, pz, 3, H, 3));   // posts
    for (const y of [...LV.map(v => v - 1.25), H]) frames.push(put(0, y, 0, W, 2.5, D));                                                   // boards; the last is the top cap
    for (const lv of LV) {
      const clear = Math.min(52, H - 1.25 - lv - 0.5);   // free height above this board
      if (rand() < 0.22) {                               // a level of bottles: a tight grid of cylinders
        const bh = 20 + rand() * 6, col = pick();
        for (let i = 0; i < 14; i++) for (let j = 0; j < 4; j++) { const b = put(-W / 2 + 6 + i * 8, lv + bh / 2, -D / 2 + 6 + j * 8, 3.2, bh, 3.2); b.color = col; bottles.push(b); }
        continue;
      }
      let x = -W / 2 + 3;
      while (x < W / 2 - 14) {                           // boxes side by side until the board is full
        const w = Math.min(14 + rand() * 18, W / 2 - 2 - x), d = 16 + rand() * (D - 22), h = 14 + rand() * (clear - 14);
        const b = put(x + w / 2, lv + h / 2, -D / 2 + 3 + d / 2, w, h, d);
        b.color = pick();
        boxes.push(b);
        x += w + 1.5;
      }
    }
  }
  const nW = Math.floor(room.w / W), nD = Math.floor(room.d / W);
  for (let i = 0; i < nW; i++) { const x = (i - (nW - 1) / 2) * W; unit(x, -room.d / 2 - D / 2, 0); unit(x, room.d / 2 + D / 2, Math.PI); }                                   // back and front walls
  for (let j = 0; j < nD; j++) { const z = (j - (nD - 1) / 2) * W; unit(-room.w / 2 - D / 2, z, Math.PI / 2); if (j !== 2) unit(room.w / 2 + D / 2, z, -Math.PI / 2); }    // side walls, with a gap for the door
  for (const ax of [-250, 250]) for (let j = 0; j < 5; j++) { const z = (j - 2) * W; unit(ax + D / 2, z, Math.PI / 2); unit(ax - D / 2, z, -Math.PI / 2); }           // two free-standing aisles, back to back
  return { frames, boxes, bottles };
}

function instanced(geo, mat, list, colored) {
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
  list.forEach((it, i) => {
    q.setFromAxisAngle(up, it.rot || 0); p.set(it.x, it.y + FLOOR_Y, it.z); s.set(it.sx, it.sy, it.sz);
    mesh.setMatrixAt(i, m4.compose(p, q, s));
    if (colored) mesh.setColorAt(i, c.setHex(it.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;                                          // an instanced mesh's bounds would be the unit shape's, so don't cull it
  scene.add(mesh);
  return mesh;
}
{
  const KL = konbiniLayout(mulberry32(2024), ROOM, SHELF_D), unitBox = new THREE.BoxGeometry(1, 1, 1);
  instanced(unitBox, new THREE.MeshLambertMaterial({ map: texSteel, color: 0xdde3e8 }), KL.frames, false);
  instanced(unitBox, new THREE.MeshLambertMaterial({ map: texBox }), KL.boxes, true);
  instanced(new THREE.CylinderGeometry(0.5, 0.5, 1, 10), new THREE.MeshLambertMaterial({ color: 0xffffff }), KL.bottles, true);
  const lights = [];
  for (const x of [-360, -180, 0, 180, 360]) for (const z of [-240, -80, 80, 240]) lights.push({ x, y: ROOM.h - 1, z, sx: 110, sy: 2, sz: 24 });
  instanced(unitBox, new THREE.MeshBasicMaterial({ color: 0xffffff }), lights, false);                  // fluorescent panels
}
