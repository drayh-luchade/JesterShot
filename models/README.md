# Models

Each file here registers one model into `window.MODEL_DATA.<key>` (a plain script, loaded by `<script>` tags in `index.html`).
`js/03-model-loader.js` turns every entry into a THREE geometry + material at startup (`MODELS[key]`), and
`instantiateModel(key, scale)` makes a tintable copy. These files are big base64 blobs: **don't attach them to Claude unless the model itself is the problem.**

## Format of one entry
| field | what it is |
|---|---|
| `pos` | base64 of Float32 xyz triples (the glb node transform already applied) |
| `uv`  | base64 of Float32 uv pairs |
| `idx` | base64 of Uint16 triangle indices (so max 65,535 vertices per model) |
| `w`, `h` | texture size in pixels |
| `pal` | base64 of 16 RGB colours (48 bytes) |
| `px`  | base64 of 4-bit palette indices, two pixels per byte (low nibble first), `w*h/2` bytes |

## Adding a model
1. Create `models/<key>.js`:
   `window.MODEL_DATA = window.MODEL_DATA || {}; window.MODEL_DATA.<key> = { "pos": "...", "uv": "...", "idx": "...", "w": 128, "h": 128, "pal": "...", "px": "..." };`
2. Add `<script src="models/<key>.js"></script>` in `index.html`, with the other model lines.
3. Use it, either as:
   - **a weapon**: in `js/01-config.js`, add `model: '<key>', modelScale: N` to its `WEAPONS` entry;
   - **a prop / building piece**: in `js/04-structures.js`, add its size to `MODEL_DIMS` (`<key>: [x, y, z]`, unscaled bounding box), then use `M('<key>', scale, x, z)` inside a structure, or add a menu entry next to `cow` / `calf` / `herd`.

Models that fail to build are skipped with a console warning (`model failed to build: <key>`), and props fall back to a grey box.
