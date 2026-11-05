'use strict';
/* ---------- ModelSheet: a Katamari model as a deformable skin, with the same interface as Sheet ---------- */
// The model is fitted into the unit cube (so every Sheet operation works on it unchanged: dents, tears, crumpling, corner sag), cut into
// smaller triangles so a dent can bend it smoothly, and "un-welded" (every triangle owns its 3 vertices) so it keeps its hard, faceted
// look when the normals are recomputed. Displacements depend only on position, so triangles that touch still move together: no cracks.

/** Split edges longer than maxEdge (world units) until none are, sharing each cut between both neighbours so nothing cracks. */
function tessellateModel(P, U, I, dims, maxEdge, maxTris) {
  let pos = Array.from(P), uv = Array.from(U), idx = Array.from(I);
  const len = (a, b) => Math.hypot((pos[a * 3] - pos[b * 3]) * dims[0], (pos[a * 3 + 1] - pos[b * 3 + 1]) * dims[1], (pos[a * 3 + 2] - pos[b * 3 + 2]) * dims[2]);
  for (let pass = 0; pass < 10; pass++) {
    const plan = [];                                                       // per triangle: bit0 = edge a-b is cut, bit1 = b-c, bit2 = c-a
    let projected = 0, any = false;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      const m = (len(a, b) > maxEdge ? 1 : 0) | (len(b, c) > maxEdge ? 2 : 0) | (len(c, a) > maxEdge ? 4 : 0);
      plan.push(m); projected += m === 0 ? 1 : (m === 7 ? 4 : (m & (m - 1)) === 0 ? 2 : 3); any = any || m !== 0;
    }
    if (!any || projected > maxTris) break;                                 // done, or the next round would make too many triangles
    const cut = new Map(), mid = (a, b) => {                               // the new vertex halfway along edge a-b (created once, shared)
      const key = a < b ? a + '_' + b : b + '_' + a;
      let m = cut.get(key);
      if (m === undefined) {
        m = pos.length / 3; cut.set(key, m);
        for (let k = 0; k < 3; k++) pos.push((pos[a * 3 + k] + pos[b * 3 + k]) / 2);
        for (let k = 0; k < 2; k++) uv.push((uv[a * 2 + k] + uv[b * 2 + k]) / 2);
      }
      return m;
    };
    const out = [];
    for (let t = 0, q = 0; t < idx.length; t += 3, q++) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2], m = plan[q], s0 = m & 1, s1 = m & 2, s2 = m & 4;
      if (!m) { out.push(a, b, c); continue; }
      const m0 = s0 ? mid(a, b) : -1, m1 = s1 ? mid(b, c) : -1, m2 = s2 ? mid(c, a) : -1;
      if (m === 7) out.push(a, m0, m2,  m0, b, m1,  m2, m1, c,  m0, m1, m2);
      else if ((m & (m - 1)) === 0) {
        if (s0) out.push(a, m0, c,  m0, b, c); else if (s1) out.push(b, m1, a,  m1, c, a); else out.push(c, m2, b,  m2, a, b);
      } else {
        if (s0 && s1) out.push(m0, b, m1,  a, m0, m1,  a, m1, c);
        else if (s1 && s2) out.push(m1, c, m2,  a, b, m1,  a, m1, m2);
        else out.push(m2, a, m0,  m0, b, c,  m0, c, m2);
      }
    }
    idx = out;
  }
  const n = idx.length, pos2 = new Float32Array(n * 3), uv2 = new Float32Array(n * 2);   // un-weld
  for (let i = 0; i < n; i++) {
    pos2.set(pos.slice(idx[i] * 3, idx[i] * 3 + 3), i * 3); uv2.set(uv.slice(idx[i] * 2, idx[i] * 2 + 2), i * 2);
  }
  return { pos: pos2, uv: uv2 };
}

class ModelSheet extends Sheet {
  constructor(key, outerMat, innerMat, edgeMat, worldDims) {
    super(outerMat, innerMat, edgeMat, 'cube');                    // builds a box we immediately swap out, so the Sheet methods all just work
    const src = MODELS[key].geo, sp = src.attributes.position, su = src.attributes.uv, si = src.index.array, md = MODELS[key].dims;
    src.computeBoundingBox();
    const c = src.boundingBox.getCenter(new THREE.Vector3()), P = new Float32Array(sp.count * 3);
    for (let i = 0; i < sp.count; i++) {                           // into the unit cube: -0.5..0.5 on every axis
      P[i * 3] = (sp.getX(i) - c.x) / md[0]; P[i * 3 + 1] = (sp.getY(i) - c.y) / md[1]; P[i * 3 + 2] = (sp.getZ(i) - c.z) / md[2];
    }
    let area = 0;                                                  // pick a cut length that keeps the triangle count sane (~9000 max)
    for (let t = 0; t < si.length; t += 3) {
      const a = si[t] * 3, b = si[t + 1] * 3, d = si[t + 2] * 3;
      const ux = (P[b] - P[a]) * worldDims[0], uy = (P[b + 1] - P[a + 1]) * worldDims[1], uz = (P[b + 2] - P[a + 2]) * worldDims[2];
      const vx = (P[d] - P[a]) * worldDims[0], vy = (P[d + 1] - P[a + 1]) * worldDims[1], vz = (P[d + 2] - P[a + 2]) * worldDims[2];
      area += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    }
    const maxEdge = Math.max(0.45, Math.sqrt(area / (0.4 * 9000)));
    const t = tessellateModel(P, Array.from(su.array), si, worldDims, maxEdge, 12000);   // (it stops before a round would pass 12000 triangles)
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(t.pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(t.uv, 2));
    const seq = new Uint32Array(t.pos.length / 3); for (let i = 0; i < seq.length; i++) seq[i] = i;
    geo.setIndex(new THREE.BufferAttribute(seq, 1));
    geo.computeVertexNormals(); geo.computeBoundingSphere(); geo.computeBoundingBox();
    this.geo.dispose(); this.edgeGeo.dispose();
    this.geo = geo; this.outer.geometry = geo; this.inner.geometry = geo;
    this.edgeGeo = new THREE.BufferGeometry(); this.edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
    this.edges.geometry = this.edgeGeo; this.edges.visible = false;     // no ink outline on a textured model
    this.inner.castShadow = false;
  }
}
