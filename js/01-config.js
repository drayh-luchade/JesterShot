'use strict';

/* ---------- Tunables ---------- */
const TABLE = { w: 160, d: 110, h: 26 };          // stainless prep table, top surface at y = 0
const ROOM = { w: 900, d: 700, h: 340 };         // the free space: bounded by the shelf fronts, the ceiling and the floor
const SHELF_D = 45;                               // depth of the shelving that lines the walls (outside ROOM)
const FLOOR_Y = -TABLE.h;
const MAX_SHOTS = 24;                      // tri-shot throws three at a time
const MOVE_DIST = 1.0, MOVE_ANGLE = 0.5;   // "moved significantly": 1 unit of travel or ~29 degrees of tilt
const PTS_MOVED = 50, PTS_GROUND = 100;
const WEAPONS = {
  banana: { name: 'Bananarang', tag: 'loops in from the side', radius: 0.6, mass: 0, speed: 18, cooldown: 900, boomerang: true, model: 'banana', modelScale: 7,
            dark: 0xd8c25a, light: 0xf2e27a, stripe: '#d8c25a', gunScale: 1.4 },
  algae:  { name: 'Algae Ball', tag: 'explosive · like a missile', radius: 0.42, mass: 2.5, speed: 62, cooldown: 1400, model: 'algae', modelScale: 1.95,
            dark: 0x4a6a3a, light: 0x93a889, stripe: '#4f7a3a', gunScale: 1.4,
            explosion: { radius: 9, impulse: 85, dent: 22, color: 0x8fd16a } },
  watermelon: { name: 'Giant Watermelon', tag: 'heavy · shards cut paper', radius: 0.9, mass: 16, speed: 24, cooldown: 1100, model: 'watermelon', modelScale: 0.85, burstOnFloor: true,
                dark: 0x2f7d32, light: 0x7bc47f, stripe: '#2f7d32', gunScale: 2.2 },
  takoyaki:   { name: 'Takoyaki', tag: 'sticky sauce · glides', radius: 0.26, mass: 0.4, speed: 20, cooldown: 160, slime: true, model: 'takoyaki', modelScale: 15.5, slimeColor: 0x4a2410,
                dark: 0x6b3a1a, light: 0xb87a3a, stripe: '#b5651d', gunScale: 1.8 },
  mushroom:   { name: 'Shroom Spike', tag: 'pierces 5 sheets · leaves holes', radius: 0.3, mass: 0.6, speed: 70, cooldown: 450, model: 'mushroom', modelScale: 2.2,
                pierce: 5,          // sheets of paper it can cross before it stops (a hollow block = 2 sheets: in and out)
                hole: 0.5,          // hole radius in world units (scaled by the paper's tearSize, capped for small blocks)
                wear: 0.04,         // damage added to a block per sheet pierced
                nudge: 0.04,        // tiny shove per sheet, as a share of its momentum (0 = none)
                spin: 16,           // rad/s about its own length (cosmetic)
                dark: 0x9a2a2a, light: 0xd9534f, stripe: '#c0392b', gunScale: 1.2 },
};

/* Paper types. density = mass multiplier, dent = dent depth, tear = tear-threshold multiplier (higher = harder to rip),
   tearSize = hole size, fragile = how fast damage slumps the block, friction/bounce = contact surface. */
const PAPER = {
  craft:  { name: 'Craft',  note: 'baseline',      tex: 'craft',  colors: [0xc9a26b, 0xd9b98a, 0xe0745c, 0x6fa8a0, 0xf0c75e],
            density: 1.0, dent: 1.0, tear: 1.0, tearSize: 1.0, fragile: 1.0, friction: 0.6, bounce: 0.03 },
  canvas: { name: 'Canvas', note: 'tough · heavy', tex: 'canvas', colors: [0xe8dfc8, 0xcfc3a5],
            density: 2.4, dent: 0.5, tear: 2.2, tearSize: 0.6, fragile: 0.55, friction: 0.8, bounce: 0.12 },
  fiber:  { name: 'Fibrous', note: 'rips easily',  tex: 'fiber',  colors: [0xf1ead9, 0xe6dcc3, 0xd8e0cf],
            density: 0.8, dent: 1.0, tear: 0.5, tearSize: 1.6, fragile: 1.0, friction: 0.7, bounce: 0.02 },
  lined:  { name: 'Lined',  note: 'flimsy · light', tex: 'lined',  colors: [0xffffff, 0xf4f7ff],
            density: 0.6, dent: 1.4, tear: 0.8, tearSize: 1.1, fragile: 1.6, friction: 0.4, bounce: 0.02 },
  sticky: { name: 'Sticky', note: 'grippy',        tex: 'sticky', colors: [0xffe45c, 0xffd93d, 0xff9ec4, 0x8fe0a8],
            density: 1.1, dent: 0.9, tear: 1.4, tearSize: 0.8, fragile: 0.8, friction: 1.6, bounce: 0.0 },
};
const paperTex = {};
function getTex(kind) { return paperTex[kind] || (paperTex[kind] = makePaperTexture(kind)); }
function makePaperTexture(kind) {              // grey/white procedural patterns; the block colour tints them
  const N = 128, cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d'), rnd = mulberry32(kind.length * 977);
  g.fillStyle = '#fff'; g.fillRect(0, 0, N, N);
  const fibres = (n, a, len) => {
    for (let i = 0; i < n; i++) {
      const x = rnd() * N, y = rnd() * N, t = rnd() * 6.28, l = len * rnd();
      g.strokeStyle = `rgba(80,60,40,${a * rnd()})`; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(t) * l, y + Math.sin(t) * l); g.stroke();
    }
  };
  if (kind === 'craft') fibres(500, 0.18, 5);
  else if (kind === 'fiber') fibres(900, 0.3, 16);
  else if (kind === 'canvas') {
    g.strokeStyle = 'rgba(90,75,50,.22)'; g.lineWidth = 1.5;
    for (let i = 0; i < N; i += 4) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, N); g.moveTo(0, i); g.lineTo(N, i); g.stroke(); }
    fibres(150, 0.12, 3);
  } else if (kind === 'lined') {
    g.strokeStyle = 'rgba(70,120,220,.55)'; g.lineWidth = 1.5;
    for (let y = 10; y < N; y += 12) { g.beginPath(); g.moveTo(0, y); g.lineTo(N, y); g.stroke(); }
    g.strokeStyle = 'rgba(220,70,70,.6)'; g.beginPath(); g.moveTo(18, 0); g.lineTo(18, N); g.stroke();
  } else if (kind === 'sticky') {
    g.fillStyle = 'rgba(0,0,0,.09)'; g.fillRect(0, 0, N, 14);        // adhesive strip
    fibres(60, 0.05, 6);
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
const MIN_SEV = 3.5;     // impacts weaker than this leave no mark
const CRUSH = {
  stackLoad: 0.12,   // a block pressed by another block takes this share of a direct hit's flattening (so a hit on the roof doesn't pancake the walls)
  ground: 0.2,       // same for landing on the floor
  maxFrac: 0.55,     // a block never loses more than this fraction of its height...
  widthK: 0.5,       // ...nor more than this multiple of its narrowest width, so tall columns fold near the top rather than telescoping
  zone: 1.4,         // how far down from the top the folds reach, as a multiple of the narrowest width
};
const TEAR_SEV = 9;      // impacts stronger than this rip a hole in the sheet
const SEG = 8;           // sheet subdivisions per block edge (dent resolution)

/* ---------- Helpers ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Position-based noise in [-1, 1]: identical for coincident vertices, so seams never split.
function hash3(x, y, z, k) {
  const s = Math.sin(x * 12.9898 * k + y * 78.233 + z * 37.719) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}
/**
 * Dent displacement (in unit-cube coords) for point p. h = { c, dir, depth, crumple, R, S }.
 * Distances are measured in world units (via block scale S). Returns falloff weight, 0 if outside.
 */
function dentDelta(p, h, out) {
  const dx = (p.x - h.c.x) * h.S.x, dy = (p.y - h.c.y) * h.S.y, dz = (p.z - h.c.z) * h.S.z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d >= h.R) return 0;
  const f = (1 - d / h.R) ** 2;
  const a = h.depth * f, k = h.crumple * f;
  out.set(
    (h.dir.x * a + hash3(p.x, p.y, p.z, 1.0) * k) / h.S.x,
    (h.dir.y * a + hash3(p.x, p.y, p.z, 1.7) * k) / h.S.y,
    (h.dir.z * a + hash3(p.x, p.y, p.z, 2.3) * k) / h.S.z
  );
  return f;
}
