#!/usr/bin/env python3
"""Bake a .glb (single mesh, one texture) into models/<key>.js in the game's model format.

    python3 tools/glb_to_model.py path/to/thing.glb key [--center]

 - node transforms (matrix or TRS, parents included) are applied to the positions
 - UVs are kept as they are (RepeatWrapping is set by the loader, so UVs outside 0..1 are fine)
 - the texture is reduced to a 16-colour palette (exact if it already has <= 16 colours), packed 4 bits per pixel
 - --center moves the model so the middle of its bounding box is at the origin (use it for projectiles)
Needs: Pillow (pip install pillow). Max 65,535 vertices per model.
"""
import sys, json, struct, io, base64, math
from PIL import Image

def mat_mul(a, b):                      # 4x4 column-major
    return [sum(a[k*4 + r] * b[c*4 + k] for k in range(4)) for c in range(4) for r in range(4)]
def node_matrix(n):
    if 'matrix' in n: return n['matrix']
    t = n.get('translation', [0, 0, 0]); q = n.get('rotation', [0, 0, 0, 1]); s = n.get('scale', [1, 1, 1])
    x, y, z, w = q
    r = [1-2*(y*y+z*z), 2*(x*y+z*w), 2*(x*z-y*w), 0,  2*(x*y-z*w), 1-2*(x*x+z*z), 2*(y*z+x*w), 0,  2*(x*z+y*w), 2*(y*z-x*w), 1-2*(x*x+y*y), 0,  0, 0, 0, 1]
    for c in range(3):
        for k in range(3): r[c*4 + k] *= s[c]
    r[12:15] = t
    return r

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if len(args) != 2: sys.exit(__doc__)
    src, key = args; center = '--center' in sys.argv
    d = open(src, 'rb').read()
    assert d[:4] == b'glTF', 'not a .glb'
    jl = struct.unpack('<I', d[12:16])[0]
    j = json.loads(d[20:20 + jl]); bin_ = d[20 + jl + 8:]
    acc, bv = j['accessors'], j['bufferViews']
    def read(i):
        a = acc[i]; v = bv[a['bufferView']]
        ncomp = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        fmt = {5126: 'f', 5123: 'H', 5125: 'I', 5121: 'B'}[a['componentType']]
        stride = v.get('byteStride') or struct.calcsize(fmt) * ncomp
        o = v.get('byteOffset', 0) + a.get('byteOffset', 0)
        return [struct.unpack_from('<' + fmt * ncomp, bin_, o + k * stride) for k in range(a['count'])]
    # world matrix of the mesh node
    parent = {c: i for i, n in enumerate(j['nodes']) for c in n.get('children', [])}
    ni = next(i for i, n in enumerate(j['nodes']) if 'mesh' in n)
    M = node_matrix(j['nodes'][ni]); p = parent.get(ni)
    while p is not None: M = mat_mul(node_matrix(j['nodes'][p]), M); p = parent.get(p)
    prim = j['meshes'][j['nodes'][ni]['mesh']]['primitives'][0]
    pos = [(M[0]*x + M[4]*y + M[8]*z + M[12], M[1]*x + M[5]*y + M[9]*z + M[13], M[2]*x + M[6]*y + M[10]*z + M[14])
           for x, y, z in read(prim['attributes']['POSITION'])]
    uv = read(prim['attributes']['TEXCOORD_0']); idx = [i[0] for i in read(prim['indices'])]
    assert len(pos) < 65536, 'too many vertices for Uint16 indices'
    if det3(M) < 0: idx = [i for t in range(0, len(idx), 3) for i in (idx[t], idx[t+2], idx[t+1])]   # mirrored node: keep winding outward
    if center:
        c = [(min(p[a] for p in pos) + max(p[a] for p in pos)) / 2 for a in range(3)]
        pos = [(x - c[0], y - c[1], z - c[2]) for x, y, z in pos]
    # texture
    mat = j['materials'][prim['material']]['pbrMetallicRoughness']['baseColorTexture']['index']
    img = j['images'][j['textures'][mat]['source']]; v = bv[img['bufferView']]
    im = Image.open(io.BytesIO(bin_[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']])).convert('RGB')
    w, h = im.size
    cols = sorted(set(im.getdata()))
    if len(cols) <= 16: pal = cols + [(0, 0, 0)] * (16 - len(cols)); look = {c: i for i, c in enumerate(cols)}; ids = [look[c] for c in im.getdata()]
    else:
        q = im.quantize(16, method=Image.Quantize.MEDIANCUT); raw = q.getpalette()[:48]
        pal = [tuple(raw[i*3:i*3+3]) for i in range(16)]; ids = list(q.getdata())
    assert w * h % 2 == 0
    px = bytes((ids[i] & 15) | ((ids[i + 1] & 15) << 4) for i in range(0, w * h, 2))     # even pixel = low nibble
    b64 = lambda b: base64.b64encode(b).decode()
    out = {'pos': b64(struct.pack('<%df' % (len(pos) * 3), *[c for p in pos for c in p])),
           'uv': b64(struct.pack('<%df' % (len(uv) * 2), *[c for u in uv for c in u])),
           'idx': b64(struct.pack('<%dH' % len(idx), *idx)), 'w': w, 'h': h,
           'pal': b64(bytes(c for p in pal for c in p)), 'px': b64(px)}
    xs = [[p[a] for p in pos] for a in range(3)]
    print('%s: %d verts, %d tris, texture %dx%d (%d colours)' % (key, len(pos), len(idx) // 3, w, h, len(cols)))
    print('bounding box size (x y z): %.3f %.3f %.3f' % tuple(max(a) - min(a) for a in xs))
    open('models/%s.js' % key, 'w').write('window.MODEL_DATA = window.MODEL_DATA || {};\nwindow.MODEL_DATA.%s = %s;\n' % (key, json.dumps(out)))
    print('wrote models/%s.js  (now add its <script> tag to index.html)' % key)

def det3(M):
    a, b, c, d, e, f, g, h, i = M[0], M[4], M[8], M[1], M[5], M[9], M[2], M[6], M[10]
    return a*(e*i - f*h) - b*(d*i - f*g) + c*(d*h - e*g)

main()
