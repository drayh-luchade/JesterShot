'use strict';
/* ---------- Corner & edge damage: a crushed corner sags, and whatever it was holding up leans that way ---------- */
// A hit near a corner or edge of a box-shaped block (cubes and slabs) is shared out to the nearby corners of the block (b.cd, 0..1.2).
// Each damaged TOP corner sinks and pulls inward; each damaged BOTTOM corner lifts off its support. The block's collision box is swapped for
// a convex hull of its 8 (moved) corners, and the paper is warped to match, so what sits on it slides toward the sunk corner and the block
// itself can tip onto it. Hits in the middle of a face don't count: only the part near an edge/corner does.
const CORNER = {
  k: 1.2,          // how fast corners fail: share of a hit's severity (sev/45 * paper fragility) that lands on a corner it is right on top of
  sigma2: 0.3,     // reach of a hit, as squared distance in block units (0.3 = corners and the edges between them, not face centres)
  floor: 0.2,      // ignore the faint tail of a hit, so face-centre impacts leave corners alone
  sagFrac: 0.6,    // a fully failed top corner sinks by this fraction of the block's narrowest width (never more than 55% of its height)
  inward: 0.25,    // ...and moves toward the block's centre by this share of the sink
  lift: 0.4,       // a fully failed bottom corner rises by this share of the sink (it stops holding the block up)
  ease: 5,         // how quickly it gives way (per second)
  minLoad: 0.5,    // falls and stack-weight don't count, only real hits (shots, blasts)
};

PaperBuilding.prototype.cornerDamage = function (b, c, sev, load = 1) {
  if (b.dead || load < CORNER.minLoad || !b.body) return;
  if (!b.cornerHull && !(b.body.shapes[0] instanceof CANNON.Box)) return;       // cylinders, pyramids, domes... keep their own shape
  const cd = b.cd || (b.cd = new Float32Array(8));
  const gain = sev / 45 * b.paper.fragile * CORNER.k;
  const u = [c.x + 0.5, c.y + 0.5, c.z + 0.5];
  let hit = false;
  for (let v = 0; v < 8; v++) {                                                 // vertex v: bit0 = +x, bit1 = +y, bit2 = +z
    const dx = u[0] - (v & 1), dy = u[1] - ((v >> 1) & 1), dz = u[2] - ((v >> 2) & 1);
    const w = (Math.exp(-(dx * dx + dy * dy + dz * dz) / CORNER.sigma2) - CORNER.floor) / (1 - CORNER.floor);
    if (w > 0) { cd[v] = Math.min(1.2, cd[v] + gain * w); hit = true; }
  }
  if (hit) this.blocks.forEach(x => x.body.wakeUp());
};

/** Ease a block's corners toward their damaged positions; rebuild its collision hull and warp its paper by the change. */
PaperBuilding.prototype._cornerStep = function (b, dt, force) {
  const cs = b.cs || (b.cs = new Float32Array(24)), cd = b.cd, hgt = b.sy * b.curY;
  const maxSag = Math.min(CORNER.sagFrac * Math.min(b.sx, b.sz), 0.55 * hgt), t = Math.min(1, dt * CORNER.ease);
  const d = new Float32Array(24);
  let moved = false;
  for (let v = 0; v < 8; v++) {
    const s = Math.min(1, cd[v]) * maxSag, top = (v >> 1) & 1;
    const tx = ((v & 1) ? -1 : 1) * CORNER.inward * s * (top ? 1 : 0.5);
    const tz = ((v >> 2) & 1 ? -1 : 1) * CORNER.inward * s * (top ? 1 : 0.5);
    const ty = top ? -s : CORNER.lift * s;
    const tgt = [tx, ty, tz];
    for (let a = 0; a < 3; a++) {
      const dv = (tgt[a] - cs[v * 3 + a]) * t;
      if (Math.abs(dv) > 1e-5) { d[v * 3 + a] = dv; cs[v * 3 + a] += dv; moved = true; }
    }
  }
  if (!moved && !force) return;
  if (moved) b.sheet.warp(d, b.mesh.scale, b.windows);
  const V = [];
  for (let v = 0; v < 8; v++) V.push([((v & 1) - 0.5) * b.sx + cs[v * 3], (((v >> 1) & 1) - 0.5) * hgt + cs[v * 3 + 1], (((v >> 2) & 1) - 0.5) * b.sz + cs[v * 3 + 2]]);
  const verts = V.map(p => new CANNON.Vec3(p[0], p[1], p[2]));
  const shape = new CANNON.ConvexPolyhedron({ vertices: verts, faces: hullFaces(V).map(f => f.slice()) });
  if (!shape.faceNormals || !shape.faceNormals.length) shape.computeNormals();
  if (shape.faceNormals[0].dot(verts[shape.faces[0][0]]) < 0) { shape.faces.forEach(f => f.reverse()); shape.computeNormals(); }
  const body = b.body, old = body.shapes[0];
  body.removeShape(old); body.addShape(shape);
  b.cornerHull = true;
  body.updateBoundingRadius(); body.aabbNeedsUpdate = true;
  if (moved) this.blocks.forEach(x => x.body.wakeUp());                         // a sagging corner has no velocity of its own, so wake what rests on it
};

/** Warp the paper by per-corner displacements d (x,y,z in world units for each of the 8 corners), blended trilinearly through the block. */
Sheet.prototype.warp = function (d, S, windows) {
  const blend = (p, out) => {
    const ux = Math.min(1, Math.max(0, p.x + 0.5)), uy = Math.min(1, Math.max(0, p.y + 0.5)), uz = Math.min(1, Math.max(0, p.z + 0.5));
    let ox = 0, oy = 0, oz = 0;
    for (let v = 0; v < 8; v++) {
      const w = ((v & 1) ? ux : 1 - ux) * ((v & 2) ? uy : 1 - uy) * ((v & 4) ? uz : 1 - uz);
      ox += d[v * 3] * w; oy += d[v * 3 + 1] * w; oz += d[v * 3 + 2] * w;
    }
    out.set(ox / S.x, oy / S.y, oz / S.z);
  };
  const p = new THREE.Vector3(), o = new THREE.Vector3();
  for (const attr of [this.geo.attributes.position, this.edgeGeo.attributes.position]) {
    for (let i = 0; i < attr.count; i++) {
      p.fromBufferAttribute(attr, i); blend(p, o);
      attr.setXYZ(i, p.x + o.x, p.y + o.y, p.z + o.z);
    }
    attr.needsUpdate = true;
  }
  for (const w of windows || []) { blend(w.position, o); w.position.add(o); }       // windows ride the paper
  this.geo.computeVertexNormals(); this.geo.computeBoundingSphere(); this.geo.computeBoundingBox();
};
