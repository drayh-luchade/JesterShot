'use strict';
/* ---------- Katamari models, baked into this file as plain vertex + texture data (no loader script, no image decoding) ---------- */
// Each entry holds positions, UVs and triangle indices (the glb's own node transform already applied) plus its 16-colour texture as a
// palette and packed 4-bit pixels. Everything is rebuilt synchronously from typed arrays, so it works in any viewer.
function b64ToBuffer(b64) { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; }
const MODELS = {};                                                    // key -> { geo, mat, dims, cutout }
for (const [key, d] of Object.entries(window.MODEL_DATA || {})) {
  try {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b64ToBuffer(d.pos)), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(b64ToBuffer(d.uv)), 2));
    geo.setIndex(new THREE.BufferAttribute(new Uint16Array(b64ToBuffer(d.idx)), 1));
    geo.computeVertexNormals();
    const pal = new Uint8Array(b64ToBuffer(d.pal)), px = new Uint8Array(b64ToBuffer(d.px)), rgba = new Uint8Array(d.w * d.h * 4);
    const pala = d.pala ? new Uint8Array(b64ToBuffer(d.pala)) : null;      // optional: per palette colour, 255 solid / 0 see-through (windows, lattices, fences)
    for (let i = 0; i < d.w * d.h; i++) {                              // unpack two 4-bit palette indices per byte into RGBA
      const n = (px[i >> 1] >> ((i & 1) ? 4 : 0)) & 15;
      rgba[i * 4] = pal[n * 3]; rgba[i * 4 + 1] = pal[n * 3 + 1]; rgba[i * 4 + 2] = pal[n * 3 + 2]; rgba[i * 4 + 3] = pala ? pala[n] : 255;
    }
    const tex = new THREE.DataTexture(rgba, d.w, d.h, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;                      // glTF's default; the algae ball's UVs run past 1
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    MODELS[key] = { geo, mat: new THREE.MeshLambertMaterial({ map: tex, flatShading: true, alphaTest: pala ? 0.5 : 0 }),
                    dims: [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z], cutout: !!pala };   // dims: bounding box in the model's own units
  } catch (err) { console.warn('model failed to build:', key, err); }
}
/** A fresh, independently tintable copy of a model at the given scale, or null if it didn't build. */
function instantiateModel(key, scale = 1, cast = true) {
  const src = MODELS[key];
  if (!src) return null;
  const mesh = new THREE.Mesh(src.geo, src.mat.clone()), g = new THREE.Group();
  mesh.scale.setScalar(scale); mesh.castShadow = cast; mesh.receiveShadow = true;
  g.add(mesh);
  return g;
}
function disposeModel(g) { g.traverse(o => { if (o.isMesh && o.material) o.material.dispose(); }); }
