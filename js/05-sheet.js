'use strict';
/* ---------- Sheet: a hollow, deformable paper shell in unit-cube space ---------- */
class Sheet {
  constructor(outerMat, innerMat, edgeMat, shape = 'cube') {
    const def = SHAPES[shape].build();
    this.geo = def.geo;
    this.outer = new THREE.Mesh(this.geo, outerMat);                // outside of the paper
    this.inner = new THREE.Mesh(this.geo, innerMat);                // back faces = visible interior through tears
    this.outer.castShadow = this.outer.receiveShadow = true;
    this.edgeGeo = new THREE.BufferGeometry();
    this.edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(lineSegs(def.lines), 3));
    this.edges = new THREE.LineSegments(this.edgeGeo, edgeMat);
  }

  _displace(attr, h) {
    const v = new THREE.Vector3(), d = new THREE.Vector3();
    for (let i = 0; i < attr.count; i++) {
      v.fromBufferAttribute(attr, i);
      if (dentDelta(v, h, d)) attr.setXYZ(i, v.x + d.x, v.y + d.y, v.z + d.z);
    }
    attr.needsUpdate = true;
  }

  dent(h, tearRadius, windows) {
    this._displace(this.geo.attributes.position, h);
    this._displace(this.edgeGeo.attributes.position, h);

    const d = new THREE.Vector3();
    for (const w of windows) {                                      // windows ride the paper and crinkle with it
      const f = dentDelta(w.position, h, d);
      if (!f) continue;
      w.position.add(d);
      w.rotation.x += hash3(w.position.x, w.position.y, w.position.z, 3.1) * f * 1.4;
      w.rotation.z += hash3(w.position.x, w.position.y, w.position.z, 4.3) * f * 1.4;
    }
    if (tearRadius > 0) this._tear(h, tearRadius, windows);

    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
    this.geo.computeBoundingBox();
  }

  /** Rip out triangles around the impact (ragged edge), exposing the hollow interior. */
  _tear(h, radius, windows) {
    const pos = this.geo.attributes.position, idx = this.geo.index.array, keep = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let t = 0; t < idx.length; t += 3) {
      a.fromBufferAttribute(pos, idx[t]); b.fromBufferAttribute(pos, idx[t + 1]); c.fromBufferAttribute(pos, idx[t + 2]);
      const cx = (a.x + b.x + c.x) / 3, cy = (a.y + b.y + c.y) / 3, cz = (a.z + b.z + c.z) / 3;
      const dx = (cx - h.c.x) * h.S.x, dy = (cy - h.c.y) * h.S.y, dz = (cz - h.c.z) * h.S.z;
      const r = radius * (0.7 + 0.3 * (hash3(cx, cy, cz, 5.1) + 1));
      if (dx * dx + dy * dy + dz * dz > r * r) keep.push(idx[t], idx[t + 1], idx[t + 2]);
    }
    this.geo.setIndex(keep);
    this.geo.clearGroups();
    for (const w of windows) {
      const dx = (w.position.x - h.c.x) * h.S.x, dy = (w.position.y - h.c.y) * h.S.y, dz = (w.position.z - h.c.z) * h.S.z;
      if (dx * dx + dy * dy + dz * dz < radius * radius) w.visible = false;
    }
  }

  /** Fold the top `zone` of the shell down by (prevH - newH). The lower part keeps its absolute size; the top accordions,
   *  with ripples that bulge outward, instead of the whole block squashing like a pancake. */
  crumple(prevH, newH, zone) {
    const dh = prevH - newH, Y0 = prevH - zone, bulgeK = 0.9 * dh / zone;
    const remap = attr => {
      for (let i = 0; i < attr.count; i++) {
        const x = attr.getX(i), y = attr.getY(i), z = attr.getZ(i), Y = (y + 0.5) * prevH;   // Y = height above the block's bottom, world units
        if (Y > Y0) {
          const t = (Y - Y0) / zone, wave = 0.5 + 0.5 * Math.sin(t * Math.PI * 3);
          const f = 1 + bulgeK * (0.35 + 0.65 * wave) * Math.sin(Math.min(1, t) * Math.PI);
          attr.setXYZ(i, x * f, (Y - dh * t) / newH - 0.5, z * f);
        } else attr.setY(i, Y / newH - 0.5);
      }
      attr.needsUpdate = true;
    };
    remap(this.geo.attributes.position);
    remap(this.edgeGeo.attributes.position);
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
    this.geo.computeBoundingBox();
  }

  dispose() { this.geo.dispose(); this.edgeGeo.dispose(); }
}
