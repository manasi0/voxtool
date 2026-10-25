// MagicaVoxel .vox reader/writer. No DOM, so it runs in the browser and in Node tests.
//
// Plain data shape used for both directions:
//   { w, h, d,                       size in voxels, Godot axes (x right, y up, z toward viewer)
//     voxels: [{ x, y, z, i }],      i = palette index 1..255
//     palette: [[r,g,b,a], ...] }    256 entries; palette[i] is the colour of index i, palette[0] unused
//
// MagicaVoxel is Z-up (X right, Y into the screen, Z up). Conversion, both ways:
//   mv.x = x,   mv.y = (d - 1) - z,   mv.z = y
// so the Godot front (+z) faces MagicaVoxel's front view, and handedness is kept.
//
// File layout: "VOX " + version, then chunks (id, content size, children size, content, children).
// In the RGBA chunk, entry k (0-based) is the colour of palette index k + 1.

const VERSION = 150;
const GREY = [128, 128, 128, 255]; // fills unused palette slots

export function writeVox(data) {
  const { w, h, d, voxels, palette } = data;
  for (const v of voxels) {
    if (v.x < 0 || v.y < 0 || v.z < 0 || v.x >= w || v.y >= h || v.z >= d) {
      throw new Error(`Voxel ${v.x},${v.y},${v.z} is outside the ${w}x${h}x${d} model.`);
    }
    if (!(v.i >= 1 && v.i <= 255)) throw new Error(`Palette index ${v.i} must be 1 to 255.`);
  }

  const sizeContent = 12;
  const xyziContent = 4 + voxels.length * 4;
  const rgbaContent = 256 * 4;
  const chunk = (content) => 12 + content;
  const childrenSize = chunk(sizeContent) + chunk(xyziContent) + chunk(rgbaContent);
  const total = 8 + chunk(0) + childrenSize;

  const buf = new ArrayBuffer(total);
  const dv = new DataView(buf);
  const bytes = new Uint8Array(buf);
  let p = 0;
  const u32 = (n) => { dv.setUint32(p, n, true); p += 4; };
  const id = (s) => { for (const c of s) bytes[p++] = c.charCodeAt(0); };
  const header = (name, content, children) => { id(name); u32(content); u32(children); };

  id("VOX "); u32(VERSION);
  header("MAIN", 0, childrenSize);

  header("SIZE", sizeContent, 0);
  u32(w); u32(d); u32(h); // MagicaVoxel x, y, z

  header("XYZI", xyziContent, 0);
  u32(voxels.length);
  for (const v of voxels) {
    bytes[p++] = v.x;
    bytes[p++] = d - 1 - v.z;
    bytes[p++] = v.y;
    bytes[p++] = v.i;
  }

  header("RGBA", rgbaContent, 0);
  for (let k = 0; k < 256; k++) {
    const c = (k + 1 <= 255 && palette[k + 1]) || GREY;
    bytes[p++] = c[0]; bytes[p++] = c[1]; bytes[p++] = c[2]; bytes[p++] = c[3];
  }
  return bytes;
}

// Reads the first model in the file. Chunks we don't need (scene graph, materials, layers...) are skipped.
// Returns the plain data shape above plus `modelCount` (MagicaVoxel can store several models).
export function readVox(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const str = (at) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);

  if (bytes.length < 20 || str(0) !== "VOX ") throw new Error("This is not a .vox file.");
  const version = dv.getUint32(4, true);
  if (str(8) !== "MAIN") throw new Error("The .vox file has no MAIN chunk.");

  let size = null, firstVoxels = null, rgba = null, modelCount = 0;

  // Walk every chunk after MAIN's header. Children are laid out flat after MAIN's own content,
  // so a flat walk finds SIZE/XYZI/RGBA even inside the scene-graph chunks MagicaVoxel adds.
  let p = 8 + 12 + dv.getUint32(12, true); // skip MAIN header and any MAIN content
  while (p + 12 <= bytes.length) {
    const name = str(p);
    const content = dv.getUint32(p + 4, true);
    const at = p + 12;
    if (at + content > bytes.length) throw new Error(`The .vox file is cut off inside a ${name} chunk.`);

    if (name === "SIZE") {
      if (modelCount === 0) size = { x: dv.getUint32(at, true), y: dv.getUint32(at + 4, true), z: dv.getUint32(at + 8, true) };
    } else if (name === "XYZI") {
      if (modelCount === 0) {
        const n = dv.getUint32(at, true);
        firstVoxels = [];
        for (let k = 0; k < n; k++) {
          const q = at + 4 + k * 4;
          firstVoxels.push({ x: bytes[q], y: bytes[q + 1], z: bytes[q + 2], i: bytes[q + 3] });
        }
      }
      modelCount++;
    } else if (name === "RGBA") {
      rgba = [];
      for (let k = 0; k < 256; k++) rgba.push([bytes[at + k * 4], bytes[at + k * 4 + 1], bytes[at + k * 4 + 2], bytes[at + k * 4 + 3]]);
    }
    p = at + content; // children (if any) start right here, so they are walked as ordinary chunks
  }

  if (!size || !firstVoxels) throw new Error("The .vox file has no model (SIZE/XYZI) in it.");

  // Back to Godot axes (inverse of the write conversion).
  const w = size.x, h = size.z, d = size.y;
  const voxels = firstVoxels.map((v) => ({ x: v.x, y: v.z, z: d - 1 - v.y, i: v.i }));

  const palette = [[0, 0, 0, 0]];
  for (let k = 1; k <= 255; k++) palette.push(rgba ? rgba[k - 1] : GREY);
  return { w, h, d, voxels, palette, version, modelCount };
}
