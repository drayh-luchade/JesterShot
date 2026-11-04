'use strict';
/* ---------- Block shapes: each modelled inside the unit cube [-0.5, 0.5]^3, then scaled per block ---------- */
const boxLines = () => {                         // the 12 cube edges, each split into SEG pieces so they can bend when dented
  const out = [];
  for (let a = 0; a < 3; a++) for (const s1 of [-0.5, 0.5]) for (const s2 of [-0.5, 0.5]) {
    const L = [];
    for (let t = 0; t <= SEG; t++) { const v = [0, 0, 0]; v[a] = -0.5 + t / SEG; v[(a + 1) % 3] = s1; v[(a + 2) % 3] = s2; L.push(v); }
    out.push(L);
  }
  return out;
};
const lineSegs = lines => { const o = []; for (const L of lines) for (let i = 0; i + 1 < L.length; i++) o.push(...L[i], ...L[i + 1]); return o; };
const ringLine = (r, y, n = 24) => Array.from({ length: n + 1 }, (_, i) => [r * Math.cos(i / n * Math.PI * 2), y, r * Math.sin(i / n * Math.PI * 2)]);
const ringPts = (r, y, n) => ringLine(r, y, n).slice(0, n);
const boxBuild = () => ({ geo: new THREE.BoxGeometry(1, 1, 1, SEG, SEG, SEG), lines: boxLines() });
function squeezedBuild(both) {                   // a box whose top collapses to a ridge (prism) or a point (pyramid)
  const geo = new THREE.BoxGeometry(1, 1, 1, SEG, SEG, SEG), lines = boxLines(), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = 0.5 - p.getY(i); p.setX(i, p.getX(i) * k); if (both) p.setZ(i, p.getZ(i) * k); }
  for (const L of lines) for (const v of L) { const k = 0.5 - v[1]; v[0] *= k; if (both) v[2] *= k; }
  return { geo, lines };
}
const latheGeo = prof => new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 24);
function cylinderBuild() {
  const prof = [[0, -0.5], [1 / 6, -0.5], [1 / 3, -0.5], [0.5, -0.5]];
  for (let i = 1; i < SEG; i++) prof.push([0.5, -0.5 + i / SEG]);
  prof.push([0.5, 0.5], [1 / 3, 0.5], [1 / 6, 0.5], [0, 0.5]);
  const lines = [ringLine(0.5, -0.5), ringLine(0.5, 0.5)];
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2, L = [];
    for (let t = 0; t <= SEG; t++) L.push([0.5 * Math.cos(a), -0.5 + t / SEG, 0.5 * Math.sin(a)]);
    lines.push(L);
  }
  return { geo: latheGeo(prof), lines };
}
function domeBuild() {
  const prof = [[0, -0.5], [1 / 6, -0.5], [1 / 3, -0.5], [0.5, -0.5]];
  for (let i = 1; i <= 12; i++) { const th = i / 12 * Math.PI / 2; prof.push([0.5 * Math.cos(th), -0.5 + Math.sin(th)]); }
  const lines = [ringLine(0.5, -0.5)];
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2, L = [];
    for (let i = 0; i <= 12; i++) { const th = i / 12 * Math.PI / 2; L.push([0.5 * Math.cos(th) * Math.cos(a), -0.5 + Math.sin(th), 0.5 * Math.cos(th) * Math.sin(a)]); }
    lines.push(L);
  }
  return { geo: latheGeo(prof), lines };
}
/* dims = block size relative to the chosen "size"; hull = convex points for physics (boxes use a plain Box shape); massK = shell-area correction */
const SHAPES = {
  cube:      { name: 'Cube',       dims: [1, 1, 1],     massK: 1.0,  build: boxBuild },
  cylinder:  { name: 'Cylinder',   dims: [1, 1, 1],     massK: 0.8,  build: cylinderBuild, hull: [...ringPts(0.5, -0.5, 14), ...ringPts(0.5, 0.5, 14)] },
  dome:      { name: 'Dome',       dims: [1, 0.5, 1],   massK: 0.6,  build: domeBuild,
               hull: [...ringPts(0.5, -0.5, 12), ...ringPts(0.412, 0.065, 12), ...ringPts(0.227, 0.391, 12), [0, 0.5, 0]] },
  triangle:  { name: 'Triangle',   dims: [1, 0.8, 1.6], massK: 0.7,  build: () => squeezedBuild(false),
               hull: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5], [0, 0.5, -0.5], [0, 0.5, 0.5]] },
  pyramid:   { name: 'Pyramid',    dims: [1, 1, 1],     massK: 0.55, build: () => squeezedBuild(true),
               hull: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5], [0, 0.5, 0]] },
  slabLong:  { name: 'Long slab',  dims: [3.5, 0.3, 1], massK: 1.0,  build: boxBuild },
  slabShort: { name: 'Short slab', dims: [1.5, 0.3, 1], massK: 1.0,  build: boxBuild },
};
const ghostGeos = {};
const shapeGhostGeo = key => ghostGeos[key] || (ghostGeos[key] = SHAPES[key].build().geo);

/** Brute-force convex hull faces for a small point set: returns index loops, counter-clockwise seen from outside. */
function hullFaces(V) {
  const n = V.length, faces = [], seen = new Set();
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const c = V.reduce((s, v) => [s[0] + v[0] / n, s[1] + v[1] / n, s[2] + v[2] / n], [0, 0, 0]);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
    let nr = cross(sub(V[j], V[i]), sub(V[k], V[i]));
    const len = Math.hypot(nr[0], nr[1], nr[2]);
    if (len < 1e-9) continue;
    nr = nr.map(x => x / len);
    const d = dot(nr, V[i]), on = [];
    let pos = 0, neg = 0;
    for (let m = 0; m < n; m++) { const s = dot(nr, V[m]) - d; if (s > 1e-6) pos++; else if (s < -1e-6) neg++; else on.push(m); }
    if ((pos && neg) || on.length < 3) continue;                      // not a supporting plane
    const key = on.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    if (dot(nr, sub(V[i], c)) < 0) nr = nr.map(x => -x);               // make the normal point outward
    const fc = on.reduce((s, m) => [s[0] + V[m][0] / on.length, s[1] + V[m][1] / on.length, s[2] + V[m][2] / on.length], [0, 0, 0]);
    let u = sub(V[on[0]], fc); const ul = Math.hypot(u[0], u[1], u[2]); u = u.map(x => x / ul);
    const w = cross(nr, u);
    const ang = m => { const q = sub(V[m], fc); return Math.atan2(dot(q, w), dot(q, u)); };
    on.sort((a, b) => ang(a) - ang(b));
    faces.push(on);
  }
  return faces;
}
const hullCache = {};
function makePhysShape(b) {
  const def = SHAPES[b.shape];
  if (!def.hull) return new CANNON.Box(new CANNON.Vec3(b.sx / 2, b.sy / 2, b.sz / 2));
  const faces = hullCache[b.shape] || (hullCache[b.shape] = hullFaces(def.hull));
  const verts = def.hull.map(v => new CANNON.Vec3(v[0] * b.sx, v[1] * b.sy, v[2] * b.sz));
  const shape = new CANNON.ConvexPolyhedron({ vertices: verts, faces: faces.map(f => f.slice()) });
  if (!shape.faceNormals || !shape.faceNormals.length) shape.computeNormals();
  if (shape.faceNormals[0].dot(verts[shape.faces[0][0]]) < 0) {         // winding convention differs between libraries: flip if needed
    shape.faces.forEach(f => f.reverse());
    shape.computeNormals();
  }
  shape.baseVerts = verts.map(v => v.clone());                          // so slumping can rescale heights later
  return shape;
}
