'use strict';
/* ---------- Preset structures: a little medieval village built from the shapes above (no people, no animals) ---------- */
let structSeq = 0;
const COL = { stone: 0xcfc9bb, dstone: 0x9d998f, plaster: 0xf1e7d3, timber: 0x7a5232, thatch: 0xcaa75a, tile: 0xb5533c, slate: 0x56626f,
              green: 0x7fa05a, soil: 0x8a6a45, hay: 0xe0c068, dark: 0x3a3631, wood: 0x8a5a33 };
const ROLE_PAPER = { roof: 'craft', timber: 'craft', stone: 'canvas', ground: 'fiber', accent: 'sticky' };   // 'wall' parts use the paper you picked
const pk = (r, a) => a[Math.floor(r() * a.length)];
const P = (shape, w, h, d, x, y, z, role, color, yaw = 0) => ({ shape, dims: [w, h, d], pos: [x, y, z], role, color, yaw });   // pos = part centre; y up from the ground

// Katamari buildings. Each is ONE deformable block: a box body wearing the model as its skin (see ModelSheet), so it dents, tears, sags at a
// damaged corner and topples like the paper towers do. dims = [width, height, depth] in game units; the model is stretched to fit,
// so a wall can be made thicker than the original. role 'wall' = it uses whichever paper you picked (for strength and weight).
// pos.y is the centre, so it stands on the surface. yaw 2 turns the models to face -z, like the rest of the village.
const B = (model, w, h, d, x = 0, z = 0, yaw = 2) => ({ shape: 'model', model, dims: [w, h, d], pos: [x, h / 2, z], role: 'wall', color: 0xffffff, yaw });

const STRUCTURES = {
  tower: { label: 'Random tower', groundOnly: true, special: 'tower',
    build: () => ({ name: 'Random tower', parts: [P('cube', 3.6, 14, 3.6, 0, 7, 0, 'wall', 0xffffff)] }) },   // ghost only; a real generated tower is spawned
  wall:     { label: 'Wall section',   build: () => ({ name: 'Wall section',   parts: [B('wallLong', 12, 5, 1.0)] }) },
  arch:     { label: 'Park entrance',  build: () => ({ name: 'Park entrance',  parts: [B('parkEntrance', 8, 8.9, 1.0)] }) },
  mootHall: { label: 'Bathhouse',      build: () => ({ name: 'Bathhouse',      parts: [B('bathhouse', 10.8, 6.6, 11.7)] }) },
  cottage:  { label: 'Farmhouse',      build: () => ({ name: 'Farmhouse',      parts: [B('farmhouse', 5.6, 5.2, 7.5)] }) },
  servants: { label: 'Teahouse',       build: () => ({ name: 'Teahouse',       parts: [B('teahouse', 7.3, 6.6, 6.4)] }) },
  silo:     { label: 'Silo',           build: () => ({ name: 'Silo',           parts: [B('silo', 4.5, 9, 4.5)] }) },
  store:    { label: 'Shop', build: r => {                                           // bookstore or café
    const kind = pk(r, ['Bookstore', 'Café']);
    return { name: `Shop — ${kind}`, parts: [kind === 'Bookstore' ? B('bookstore', 7.9, 6.6, 4.5) : B('cafe', 6.1, 6.5, 6.0)] };
  } },
  farm:     { label: 'Windmill',       build: () => ({ name: 'Windmill',       parts: [B('windmill', 9, 11.2, 2.4)] }) },
  castle:   { label: 'Japanese castle', build: () => ({ name: 'Japanese castle', parts: [B('castle', 17.2, 28, 13.9)] }) },
  lighthouse:     { label: 'Lighthouse',      build: () => ({ name: 'Lighthouse',      parts: [B('lighthouse', 4.3, 10.2, 3.5)] }) },
  tallLighthouse: { label: 'Tall lighthouse', build: () => ({ name: 'Tall lighthouse', parts: [B('tallLighthouse', 3.9, 16.4, 2.5)] }) },
  radioTower:     { label: 'Radio tower',     build: () => ({ name: 'Radio tower',     parts: [B('radioTower', 2.5, 10.6, 2.6)] }) },
};
/** Instantiate a structure: scale it and measure its footprint (local, unrotated coordinates). */
function buildStructure(key, seed, k) {
  const out = STRUCTURES[key].build(mulberry32(seed));
  const parts = out.parts.map(p => ({ ...p, dims: p.dims.map(v => v * k), pos: p.pos.map(v => v * k) }));
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, h = 0;
  for (const p of parts) {
    const odd = p.yaw % 2, hx = (odd ? p.dims[2] : p.dims[0]) / 2, hz = (odd ? p.dims[0] : p.dims[2]) / 2;
    x0 = Math.min(x0, p.pos[0] - hx); x1 = Math.max(x1, p.pos[0] + hx);
    z0 = Math.min(z0, p.pos[2] - hz); z1 = Math.max(z1, p.pos[2] + hz);
    h = Math.max(h, p.pos[1] + p.dims[1] / 2);
  }
  return { ...out, parts, bounds: { x0, x1, z0, z1, h } };
}
const rotXZ = (x, z, q) => { const a = q * Math.PI / 2, c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a)); return [x * c + z * s, -x * s + z * c]; };
