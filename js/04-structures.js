'use strict';
/* ---------- Preset structures: a little medieval village built from the shapes above (no people, no animals) ---------- */
let structSeq = 0;
const COL = { stone: 0xcfc9bb, dstone: 0x9d998f, plaster: 0xf1e7d3, timber: 0x7a5232, thatch: 0xcaa75a, tile: 0xb5533c, slate: 0x56626f,
              green: 0x7fa05a, soil: 0x8a6a45, hay: 0xe0c068, dark: 0x3a3631, wood: 0x8a5a33 };
const ROLE_PAPER = { roof: 'craft', timber: 'craft', stone: 'canvas', ground: 'fiber', accent: 'sticky' };   // 'wall' parts use the paper you picked
const pk = (r, a) => a[Math.floor(r() * a.length)];
const P = (shape, w, h, d, x, y, z, role, color, yaw = 0) => ({ shape, dims: [w, h, d], pos: [x, y, z], role, color, yaw });   // pos = part centre; y up from the ground

// Bounding boxes of the glb models in metres (width, height, length), measured after each file's own node transform. All are centred on their origin.
// The cow and calf stand upright (y up) and face +z.
const MODEL_DIMS = { cow: [0.678, 1.475, 2.446], calf: [0.265, 0.575, 0.957], banana: [0.042, 0.136, 0.152], algae: [0.46, 0.46, 0.46] };
/** A glb model as a structure part: a solid prop with a box collider, not paper. pos.y is its centre, so it stands on the surface. */
const M = (model, scale, x, z, yaw = 2) => {                          // yaw is in quarter turns: 2 turns the +z-facing models to face -z, like the rest of the village
  const d = MODEL_DIMS[model].map(v => v * scale);
  return { shape: 'model', model, scale, dims: d, pos: [x, d[1] / 2, z], role: 'model', color: 0xffffff, yaw };
};

const STRUCTURES = {
  tower: { label: 'Random tower', groundOnly: true, special: 'tower',
    build: () => ({ name: 'Random tower', parts: [P('cube', 3.6, 14, 3.6, 0, 7, 0, 'wall', 0xffffff)] }) },   // ghost only; a real generated tower is spawned
  wall: { label: 'Wall section', build: r => {
    const c = pk(r, [COL.stone, COL.dstone, COL.plaster]);
    const parts = [P('cube', 6, 4, 1.2, -3, 2, 0, 'wall', c), P('cube', 6, 4, 1.2, 3, 2, 0, 'wall', c)];
    for (const x of [-5.2, -1.75, 1.75, 5.2]) parts.push(P('cube', 1.6, 1.2, 1.2, x, 4.6, 0, 'stone', COL.dstone));   // merlons
    return { name: 'Wall section', parts };
  } },
  arch: { label: 'Arch', build: r => {
    const c = pk(r, [COL.stone, COL.plaster, COL.dstone]);
    return { name: 'Arch', parts: [
      P('cube', 1.8, 5.5, 1.8, -2.4, 2.75, 0, 'wall', c), P('cube', 1.8, 5.5, 1.8, 2.4, 2.75, 0, 'wall', c),
      P('cube', 6.6, 1, 1.8, 0, 6, 0, 'stone', COL.dstone), P('triangle', 3.4, 1.4, 1.8, 0, 7.2, 0, 'stone', COL.dstone)] };
  } },
  mootHall: { label: 'Moot hall', build: r => {                          // the village meeting hall (a civic "chapel")
    const c = pk(r, [COL.plaster, COL.stone]), roof = pk(r, [COL.tile, COL.slate]);
    return { name: 'Moot hall', parts: [
      P('cube', 7, 5, 10, 0, 2.5, 1, 'wall', c), P('triangle', 7, 3, 10, 0, 6.5, 1, 'roof', roof),
      P('cube', 3.2, 9, 3.2, 0, 4.5, -5.6, 'wall', c), P('pyramid', 3.8, 4, 3.8, 0, 11, -5.6, 'roof', roof),
      P('cube', 3.4, 0.5, 1.2, 0, 0.25, -7.8, 'stone', COL.dstone)] };
  } },
  cottage: { label: 'Cottage', build: r => {
    const w = 5.4 + r() * 1.4, d = 4.4 + r() * 1.2, h = 3.2;
    const c = pk(r, [COL.plaster, COL.stone, COL.wood]), roof = pk(r, [COL.thatch, COL.tile, COL.slate]);
    return { name: 'Cottage', parts: [
      P('cube', w, h, d, 0, h / 2, 0, 'wall', c), P('triangle', w, 2.4, d, 0, h + 1.2, 0, 'roof', roof),
      P('cube', 0.9, 5, 1.1, w / 2 + 0.45, 2.5, 0, 'stone', COL.dstone),
      P('cube', 1.2, 2.1, 0.5, 0, 1.05, -d / 2 - 0.25, 'timber', COL.timber)] };
  } },
  granary: { label: 'Granary', build: r => {                            // raised on posts, with steps
    const c = pk(r, [COL.wood, COL.plaster]), roof = pk(r, [COL.thatch, COL.tile]), parts = [];
    for (const x of [-2.3, 2.3]) for (const z of [-2.3, 2.3]) parts.push(P('cylinder', 0.9, 1.6, 0.9, x, 0.8, z, 'timber', COL.timber));
    parts.push(P('cube', 6, 0.4, 6, 0, 1.8, 0, 'timber', COL.timber), P('cube', 5.4, 3, 5.4, 0, 3.5, 0, 'wall', c),
               P('pyramid', 6.4, 2.6, 6.4, 0, 6.3, 0, 'roof', roof),
               P('cube', 1.6, 0.9, 1.2, 0, 0.45, -3.6, 'timber', COL.timber), P('cube', 1.6, 0.45, 1.2, 0, 0.225, -4.8, 'timber', COL.timber));
    return { name: 'Granary', parts };
  } },
  silo: { label: 'Silo', build: r => {
    const c = pk(r, [COL.stone, COL.wood, COL.dstone]);
    return { name: 'Silo', parts: [P('cylinder', 4, 3.6, 4, 0, 1.8, 0, 'wall', c), P('cylinder', 4, 3.6, 4, 0, 5.4, 0, 'wall', c),
                                    P('dome', 4, 2.2, 4, 0, 8.3, 0, 'roof', pk(r, [COL.slate, COL.tile]))] };
  } },
  store: { label: 'Store', build: r => {                                // bakery, tavern, blacksmith, shoesmith, hat store or grocer
    const kind = pk(r, ['Bakery', 'Tavern', 'Blacksmith', 'Shoesmith', 'Hat store', 'Grocer']);
    const cfg = {
      'Bakery':     { w: 7,   d: 5.6, h: 3.8, wall: COL.plaster, roof: COL.tile,  awn: 0xf6b6c4 },
      'Tavern':     { w: 8,   d: 6,   h: 5.8, wall: COL.wood,    roof: COL.slate, awn: 0xa8433a },
      'Blacksmith': { w: 7,   d: 6,   h: 3.8, wall: COL.dstone,  roof: COL.slate, awn: COL.dark },
      'Shoesmith':  { w: 5.4, d: 4.6, h: 3.4, wall: COL.stone,   roof: COL.tile,  awn: 0x6f93c9 },
      'Hat store':  { w: 4.8, d: 4.8, h: 4.6, wall: COL.plaster, roof: null,      awn: 0x9b7fc1 },
      'Grocer':     { w: 8.4, d: 5.2, h: 3.5, wall: COL.stone,   roof: COL.thatch, awn: 0x6faa5c },
    }[kind];
    const { w, d, h } = cfg, fz = -(d / 2 + 0.7);                      // fz = just in front of the shop
    const parts = [P('cube', w, h, d, 0, h / 2, 0, 'wall', cfg.wall)];
    if (cfg.roof) parts.push(P('triangle', w, 2.6, d, 0, h + 1.3, 0, 'roof', cfg.roof));
    parts.push(P('cylinder', 0.4, 2.9, 0.4, -(w / 2 - 0.6), 1.45, -(d / 2 + 1.5), 'timber', COL.timber),     // awning on two posts
               P('cylinder', 0.4, 2.9, 0.4, w / 2 - 0.6, 1.45, -(d / 2 + 1.5), 'timber', COL.timber),
               P('cube', w - 0.2, 0.25, 1.6, 0, 3.025, -(d / 2 + 0.8), 'accent', cfg.awn));
    if (kind === 'Bakery') parts.push(P('cylinder', 1.6, 5.2, 1.6, w / 2 + 0.8, 2.6, 0.6, 'stone', COL.dstone),
                                      P('cube', 0.9, 0.7, 0.9, -1.6, 0.35, fz, 'timber', COL.wood), P('cube', 0.9, 0.7, 0.9, 1.6, 0.35, fz, 'timber', COL.wood));
    if (kind === 'Tavern') parts.push(P('cylinder', 0.4, 3.6, 0.4, -(w / 2 + 1.2), 1.8, -(d / 2 - 0.4), 'timber', COL.timber),
                                      P('cube', 1.8, 1.2, 0.3, -(w / 2 + 1.2), 4.2, -(d / 2 - 0.4), 'accent', 0xe0b050),
                                      P('cylinder', 1.1, 1.3, 1.1, w / 2 + 0.65, 0.65, -(d / 2 - 0.8), 'timber', COL.wood),
                                      P('cylinder', 1.1, 1.3, 1.1, w / 2 + 0.65, 0.65, -(d / 2 - 2.2), 'timber', COL.wood));
    if (kind === 'Blacksmith') parts.push(P('cube', 1.8, h + 3.2, 1.8, w / 2 + 0.9, (h + 3.2) / 2, 0, 'stone', COL.dstone),
                                          P('cube', 1, 0.9, 1, 0, 0.45, -(d / 2 + 0.9), 'stone', COL.dark), P('pyramid', 1.4, 0.9, 1.4, 2, 0.45, -(d / 2 + 0.9), 'stone', COL.dark));
    if (kind === 'Shoesmith') parts.push(P('cube', 0.8, 0.6, 1.1, -1.4, 0.3, fz, 'accent', 0xd9b38c), P('cube', 0.8, 0.6, 1.1, -0.5, 0.3, fz, 'accent', 0xb98a5a),
                                         P('cube', 0.8, 0.6, 1.1, -0.95, 0.9, fz, 'accent', 0xe3c9a8));
    if (kind === 'Hat store') parts.push(P('cube', w + 0.6, 0.4, d + 0.6, 0, h + 0.2, 0, 'timber', COL.timber),   // flat roof carrying a giant hat
                                         P('cylinder', 4.4, 0.25, 4.4, 0, h + 0.525, 0, 'accent', 0x4a3a5a), P('dome', 3, 1.8, 3, 0, h + 1.55, 0, 'accent', 0x4a3a5a));
    if (kind === 'Grocer') parts.push(P('cube', 1, 1, 1, -2.4, 0.5, fz, 'timber', COL.wood), P('cube', 1, 1, 1, -1.3, 0.5, fz, 'timber', COL.wood),
                                      P('cube', 1, 1, 1, -1.85, 1.5, fz, 'timber', COL.wood), P('cylinder', 1.1, 1.3, 1.1, 2.4, 0.65, fz, 'timber', COL.wood));
    return { name: `Store — ${kind}`, parts };
  } },
  well: { label: 'Village well', build: r => ({ name: 'Village well', parts: [
    P('cylinder', 3.2, 1.5, 3.2, 0, 0.75, 0, 'stone', pk(r, [COL.dstone, COL.stone])),
    P('cube', 0.45, 3, 0.45, -1.15, 3.0, 0, 'timber', COL.timber), P('cube', 0.45, 3, 0.45, 1.15, 3.0, 0, 'timber', COL.timber),
    P('triangle', 3.2, 1.2, 2.2, 0, 5.1, 0, 'roof', pk(r, [COL.tile, COL.thatch, COL.slate])),
    P('cylinder', 0.9, 0.8, 0.9, 0, 1.9, 1.0, 'timber', COL.wood)] }) },
  farm: { label: 'Farm', build: r => {
    const wallC = pk(r, [COL.wood, COL.plaster]), roofC = pk(r, [COL.tile, COL.thatch]);
    const parts = [P('cube', 13, 0.3, 9.5, 0, 0.15, 0, 'ground', COL.soil)];
    for (const z of [-2.8, 0, 2.8]) parts.push(P('cube', 11, 0.5, 1.1, 0, 0.55, z, 'ground', COL.green));       // crop rows
    parts.push(P('cube', 7, 4.2, 5, 0, 2.1, 7.25, 'wall', wallC), P('triangle', 7, 2.8, 5, 0, 5.6, 7.25, 'roof', roofC),   // barn
               P('cube', 4.2, 3, 3.6, -8.6, 1.5, 0, 'wall', COL.plaster), P('triangle', 4.2, 2.2, 3.6, -8.6, 4.1, 0, 'roof', roofC));   // farmhouse
    for (const [x, y, z] of [[4.2, 0.5, 6.6], [4.2, 0.5, 8.0], [4.2, 1.5, 7.3]]) parts.push(P('cube', 1.2, 1, 1.2, x, y, z, 'accent', COL.hay));
    parts.push(M('cow', 1.15, -6.0, 7.6), M('calf', 1.4, -4.2, 7.2));          // a cow and her calf beside the barn
    return { name: 'Farm', parts };
  } },
  cow:  { label: 'Dairy cow', build: () => ({ name: 'Dairy cow', parts: [M('cow', 1.15, 0, 0)] }) },
  calf: { label: 'Calf', build: () => ({ name: 'Calf', parts: [M('calf', 1.4, 0, 0)] }) },
  herd: { label: 'Cow herd', build: () => ({ name: 'Cow herd', parts: [M('cow', 1.15, -2.6, 0.3), M('calf', 1.4, 0, -0.2), M('cow', 1.15, 2.6, 0.2)] }) },
  castle: { label: 'Castle', build: r => {
    const c = pk(r, [COL.stone, COL.dstone]), roof = pk(r, [COL.slate, COL.tile]), H = 5, T = 1.4, parts = [];
    parts.push(P('cube', 8.8, H, T, -4.4, H / 2, -11, 'wall', c), P('cube', 8.8, H, T, 4.4, H / 2, -11, 'wall', c),
               P('cube', T, H, 8.8, -11, H / 2, -4.4, 'wall', c), P('cube', T, H, 8.8, -11, H / 2, 4.4, 'wall', c),
               P('cube', T, H, 8.8, 11, H / 2, -4.4, 'wall', c), P('cube', T, H, 8.8, 11, H / 2, 4.4, 'wall', c),
               P('cube', 5.2, H, T, -6.2, H / 2, 11, 'wall', c), P('cube', 5.2, H, T, 6.2, H / 2, 11, 'wall', c));   // south wall, gate gap between
    parts.push(P('cube', 2.2, 6.4, 2.2, -2.5, 3.2, 11, 'stone', COL.dstone), P('cube', 2.2, 6.4, 2.2, 2.5, 3.2, 11, 'stone', COL.dstone),
               P('cube', 4.6, 1, 2.2, 0, 6.9, 11, 'stone', COL.dstone));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      parts.push(P('cylinder', 4.4, 8, 4.4, sx * 11, 4, sz * 11, 'stone', c));
      parts.push(P(r() < 0.5 ? 'pyramid' : 'dome', 5, 3.2, 5, sx * 11, 9.6, sz * 11, 'roof', roof));
    }
    parts.push(P('cube', 8, 9, 8, 0, 4.5, -4, 'wall', c), P('pyramid', 9, 4, 9, 0, 11, -4, 'roof', roof));
    return { name: 'Castle', parts };
  } },
  servants: { label: "Servants' quarters", build: r => {
    const c = pk(r, [COL.plaster, COL.stone]), roof = pk(r, [COL.slate, COL.tile]);
    const parts = [P('cube', 12, 3.2, 4.4, 0, 1.6, 0, 'wall', c), P('triangle', 4.4, 2, 12, 0, 4.2, 0, 'roof', roof, 1)];   // ridge runs along the length
    for (const x of [-3.5, 3.5]) parts.push(P('cube', 0.9, 5.2, 0.9, x, 2.6, 2.65, 'stone', COL.dstone));
    for (const x of [-3.5, 0, 3.5]) parts.push(P('cube', 1, 2, 0.5, x, 1, -2.45, 'timber', COL.timber));
    return { name: "Servants' quarters", parts };
  } },
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
