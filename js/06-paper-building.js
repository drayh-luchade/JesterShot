'use strict';
/* ---------- PaperBuilding: hollow paper blocks, each with a rigid body ---------- */
class PaperBuilding extends THREE.Group {
  constructor(opts = {}, world = null, physMaterial = null) {
    super();
    this.opts = Object.assign({
      floors: 6, size: 3.2, taper: 0.9, seed: 1,
      thickness: 0.05, density: 1.4,   // shell mass = surface area * thickness * density (so: light!)
      paper: 'craft',        // key of PAPER, or 'mixed'
      origin: [0, 0],        // world x/z of the tower centre
      jitter: true,          // small random yaw/tilt per block (hand-made look)
      empty: false,          // true = no generated blocks (used for the user's workshop)
    }, opts);
    this.world = world;
    this.physMaterial = physMaterial;
    this.blocks = [];
    this.pending = [];   // dents queued by collision listeners, applied after world.step()
    this.height = 0;
    this.onScore = null;   // (points, label) => void
    this._geometries = [];
    this._materials = [];
    this.build();
  }

  build() {
    const { floors, size, taper, seed, origin, jitter, empty } = this.opts;
    const rand = mulberry32(seed);
    this.edgeMat = new THREE.LineBasicMaterial({ color: 0x4a4036 });
    this._materials.push(this.edgeMat);
    const keys = Object.keys(PAPER);
    const pick = () => this.opts.paper === 'mixed' ? keys[Math.floor(rand() * keys.length)] : this.opts.paper;
    // Hand-made imperfection: up to ~4.6 degrees of yaw and a barely-there tilt per block.
    const wobble = () => jitter ? [(rand() - 0.5) * 0.02, (rand() - 0.5) * 0.16, (rand() - 0.5) * 0.02] : [0, 0, 0];

    let y = 0, scale = size;
    for (let i = 0; !empty && i < floors; i++) {
      const paper = pick(), cols = PAPER[paper].colors;
      const h = size * (0.7 + rand() * 0.5);
      const ox = origin[0] + (rand() - 0.5) * 0.15 * size, oz = origin[1] + (rand() - 0.5) * 0.15 * size;
      this._addBlock(scale, h, scale, ox, y + h / 2, oz, paper, cols[Math.floor(rand() * cols.length)], true, rand, wobble(), rand() < 0.22 ? 'cylinder' : 'cube');
      y += h;
      scale *= taper - rand() * 0.08;
    }
    if (!empty) {
      const capShape = ['pyramid', 'dome', 'triangle'][Math.floor(rand() * 3)];
      const capPaper = this.opts.paper === 'mixed' ? 'craft' : this.opts.paper;
      const capH = size * (capShape === 'dome' ? 0.35 : 0.55), capW = scale * (capShape === 'triangle' ? 0.8 : 0.7);
      this._addBlock(capW, capH, capShape === 'triangle' ? capW * 1.5 : capW, origin[0], y + capH / 2, origin[1], capPaper, 0xd9674a, false, rand, wobble(), capShape);
      y += capH;
    }
    this.height = y;
    this.armed = empty;    // generated towers start scoring once settled; an empty workshop has nothing to wait for
    this.armTimer = 1.2;
    if (this.world) this.blocks.forEach(b => this._createBody(b));
  }

  _addBlock(sx, sy, sz, x, y, z, paper, color, windows, rand, rot = [0, 0, 0], shape = 'cube') {
    const outerMat = new THREE.MeshLambertMaterial({
      color, flatShading: true, map: getTex(PAPER[paper].tex), shadowSide: THREE.DoubleSide,
    });
    const innerMat = new THREE.MeshLambertMaterial({
      color: new THREE.Color(color).multiplyScalar(0.55), flatShading: true, side: THREE.BackSide,
    });
    this._materials.push(outerMat, innerMat);

    const sheet = new Sheet(outerMat, innerMat, this.edgeMat, shape);
    const mesh = new THREE.Group();
    mesh.add(sheet.outer, sheet.inner, sheet.edges);        // children[0] must stay the outer mesh (raycasting)
    mesh.scale.set(sx, sy, sz);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rot[0], rot[1], rot[2]);
    const wins = [];
    this.add(mesh);

    const rec = { mesh, sheet, windows: wins, body: null, sx, sy, sz, damage: 0, crush: 0, curY: 1, targetY: 1,
                  paper: PAPER[paper], owner: this, shape,
                  moved: false, touched: false, restPos: null, restQuat: null, grounded0: false };
    this.blocks.push(rec);
    return rec;
  }

  /* ----- Physics ----- */
  _createBody(b) {
    const { thickness, density } = this.opts;
    const area = 2 * (b.sx * b.sy + b.sy * b.sz + b.sx * b.sz);       // hollow shell, not a solid brick
    const body = new CANNON.Body({
      mass: area * thickness * density * b.paper.density * SHAPES[b.shape].massK,
      shape: makePhysShape(b),
      material: b.paper.phys,
      linearDamping: 0.03, angularDamping: 0.1,
      allowSleep: true, sleepSpeedLimit: 0.15, sleepTimeLimit: 0.6,
    });
    body.position.set(b.mesh.position.x, b.mesh.position.y, b.mesh.position.z);
    const q = b.mesh.quaternion;
    body.quaternion.set(q.x, q.y, q.z, q.w);                         // keeps the hand-made offsets
    body.block = b;
    body.addEventListener('collide', e => this._onHit(b, e));
    this.world.addBody(body);
    b.body = body;
  }

  /** Any hard-enough contact (pea, another block, the floor) queues a dent at the contact point. */
  _onHit(b, e) {
    const c = e.contact, other = e.body, mb = b.body.mass, mo = other.mass;
    // Touching the floor scores once per block (blocks that start on the floor score by moving instead).
    if (this.armed && other.isGround && !b.touched && !b.grounded0) {
      b.touched = true;
      this._award(PTS_GROUND, 'Floored');
    }
    if (other.weapon && (other.weapon.slime || other.weapon.pierce)) return;                  // boba does its own, gentler damage (see updatePearls)
    let sev = Math.abs(c.getImpactVelocityAlongNormal()) * (mo > 0 ? Math.sqrt(mo / (mo + mb)) : 1);
    if (!other.isPea) sev *= 0.6;                                    // falls & block-on-block are gentler than a pea
    if (sev < MIN_SEV) return;
    const isBi = c.bi === b.body, s = isBi ? -1 : 1;                 // contact normal points bi -> bj
    const dir = new CANNON.Vec3(c.ni.x * s, c.ni.y * s, c.ni.z * s);
    const r = isBi ? c.ri : c.rj;
    this.pending.push({ block: b, point: b.body.position.vadd(r), dir, sev, load: other.isPea ? 1 : (mo > 0 ? CRUSH.stackLoad : CRUSH.ground) });
  }

  /** Apply queued dents (never mutate geometry/shapes in the middle of a physics step). */
  flush() {
    while (this.pending.length) {
      const p = this.pending.pop();
      if (this.blocks.includes(p.block)) this._dent(p.block, p.point, p.dir, p.sev, p.load);
    }
  }

  _dent(b, point, dir, sev, load = 1) {
    const body = b.body, inv = body.quaternion.inverse(), S = b.mesh.scale;
    const pl = inv.vmult(point.vsub(body.position));                 // contact point in block-local axes
    const dl = inv.vmult(dir); dl.normalize();
    const P = b.paper;
    // Dent size is relative to the block, so a merlon, a cow and a tower block all crumple in the same proportion.
    const size = Math.cbrt(S.x * S.y * S.z), k = Math.min(1.6, Math.max(0.5, size / 3.2));
    const depth = Math.min(0.12 * sev * P.dent * k, 0.4 * Math.min(S.x, S.y, S.z));
    const h = {
      c: new THREE.Vector3(pl.x / S.x, pl.y / S.y, pl.z / S.z),
      dir: new THREE.Vector3(dl.x, dl.y, dl.z),
      depth, crumple: depth * 0.45, R: Math.max(0.6, (0.45 + 0.025 * sev) * size), S,
    };
    const T = TEAR_SEV * P.tear;
    const tear = sev > T ? (0.4 + (sev - T) * 0.05) * P.tearSize * k : 0;
    b.sheet.dent(h, tear, b.windows);

    // Folding down only comes from hits that land along the block's own axis, and only the block that was actually struck
    // takes the full amount. Stack load and falls (load < 1) mostly dent, instead of pancaking everything underneath.
    const gain = sev / 45 * P.fragile * load;
    b.damage += gain;
    b.crush += gain * (0.1 + 0.9 * dl.y * dl.y);
    const crush = Math.min(1, Math.max(0, (b.crush - 0.25) / 0.75));
    const maxLoss = Math.min(CRUSH.maxFrac * b.sy, CRUSH.widthK * Math.min(b.sx, b.sz));   // a tall column can't telescope
    b.targetY = Math.min(b.targetY, 1 - crush * maxLoss / b.sy);
    this.blocks.forEach(x => x.body.wakeUp());                       // so everything above reacts to the sag
  }

  /** Animate slumping: shrink mesh + collision box together, keeping the block's bottom face fixed. */
  update(dt) {
    if (!this.armed && (this.armTimer -= dt) <= 0) {
      for (const b of this.blocks) {
        if (b.restPos) continue;                                   // blocks already recorded keep their rest transform
        b.restPos = b.body.position.clone();
        b.restQuat = b.body.quaternion.clone();
        b.grounded0 = b.restPos.y - b.mesh.scale.y / 2 < 0.1;
      }
      this.armed = true;
    }
    for (const b of this.blocks) {
      if (Math.abs(b.curY - b.targetY) < 1e-3) continue;
      const prev = b.sy * b.curY;
      b.curY += (b.targetY - b.curY) * Math.min(1, dt * 5);
      const hgt = b.sy * b.curY, dh = prev - hgt;
      b.mesh.scale.y = hgt;
      b.sheet.crumple(prev, hgt, Math.min(prev, Math.max(dh * 2, Math.min(prev * 0.6, CRUSH.zone * Math.min(b.sx, b.sz)))));   // fold the top, keep the lower part intact
      const shape = b.body.shapes[0];
      if (shape.baseVerts) {                                         // convex shapes: rescale vertex heights
        shape.vertices.forEach((v, i) => { v.y = shape.baseVerts[i].y * b.curY; });
        shape.computeNormals();
        if (shape.computeEdges) shape.computeEdges();
        shape.updateBoundingSphereRadius();
        shape.worldVerticesNeedsUpdate = true; shape.worldFaceNormalsNeedsUpdate = true;
      } else {
        shape.halfExtents.y = hgt / 2;
        shape.updateConvexPolyhedronRepresentation();
        shape.updateBoundingSphereRadius();
      }
      b.body.updateBoundingRadius();
      b.body.updateMassProperties();
      b.body.aabbNeedsUpdate = true;
      const up = b.body.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
      b.body.position.x -= up.x * dh / 2;
      b.body.position.y -= up.y * dh / 2;
      b.body.position.z -= up.z * dh / 2;
      b.body.wakeUp();
    }
    this._checkMoved();
  }

  /** Score a block once when it has travelled or tilted far from its recorded resting transform. */
  _checkMoved() {
    if (!this.armed) return;
    for (const b of this.blocks) {
      if (b.moved) continue;
      const dq = b.body.quaternion.mult(b.restQuat.inverse());
      const ang = 2 * Math.acos(Math.min(1, Math.abs(dq.w)));
      if (b.body.position.distanceTo(b.restPos) > MOVE_DIST || ang > MOVE_ANGLE) {
        b.moved = true;
        this._award(PTS_MOVED, 'Toppled');
      }
    }
  }

  _award(pts, label) { if (this.onScore) this.onScore(pts, label); }

  /** Builder API: drop a user cube; scoring for new blocks starts a second after the last placement. */
  addBlockAt(shape, size, x, y, z, paper, yaw = 0) {
    const cols = PAPER[paper].colors, dm = SHAPES[shape].dims;
    const rec = this._addBlock(dm[0] * size, dm[1] * size, dm[2] * size, x, y, z, paper,
                               cols[Math.floor(Math.random() * cols.length)], false, null, [0, yaw * Math.PI / 2, 0], shape);
    this._createBody(rec);
    this.armed = false;
    this.armTimer = 1.0;
    return rec;
  }

  /** Place a whole preset: parts = [{shape, dims, x, y, z, yaw (radians), paper, color}], all in world coordinates. */
  addStructure(parts, name) {
    const id = ++structSeq;
    for (const pt of parts) {
      const rec = this._addBlock(pt.dims[0], pt.dims[1], pt.dims[2], pt.x, pt.y, pt.z, pt.paper, pt.color, false, null, [0, pt.yaw, 0], pt.shape);
      rec.struct = id; rec.structName = name;
      this._createBody(rec);
    }
    this.armed = false;
    this.armTimer = 1.0;
    return id;
  }

  removeBlock(b) {
    b.dead = true;
    this.world.removeBody(b.body);
    this.remove(b.mesh);
    b.sheet.dispose();
    const i = this.blocks.indexOf(b);
    if (i >= 0) this.blocks.splice(i, 1);
    this.blocks.forEach(x => x.body.wakeUp());
  }

  sync() {
    for (const b of this.blocks) {
      if (!b.body) continue;
      b.mesh.position.copy(b.body.position);
      b.mesh.quaternion.copy(b.body.quaternion);
    }
  }

  shove(strength = 1) {
    const dir = new CANNON.Vec3(Math.random() - 0.5, 0.1, Math.random() - 0.5);
    dir.normalize();
    this.blocks.forEach((b, i) => {
      b.body.wakeUp();
      const k = strength * b.body.mass * (1 + i * 0.6);
      b.body.applyImpulse(new CANNON.Vec3(dir.x * k, dir.y * k, dir.z * k));
    });
  }

  rebuild(newOpts = {}) {
    this.dispose();
    Object.assign(this.opts, newOpts);
    this.build();
  }

  dispose() {
    this.blocks.forEach(b => { b.dead = true; });
    if (this.world) this.blocks.forEach(b => b.body && this.world.removeBody(b.body));
    this.blocks.forEach(b => b.sheet.dispose());
    this.blocks.length = 0;
    this.pending.length = 0;
    this.clear();
    this._geometries.forEach(g => g.dispose());
    this._materials.forEach(m => m.dispose());
    this._geometries.length = 0;
    this._materials.length = 0;
  }
}
