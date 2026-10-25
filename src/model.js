// Voxel model. No DOM, so it runs in the browser and in Node tests.
//
// Coordinates are Godot axes: x = right, y = up, z = toward the viewer.
// Each voxel stores a palette index: 0 = empty, 1.. = position in palette.json.

export const MAX_SIZE = 256;

// Error type for anything the user can fix in a recipe. `line` is filled in by recipe_runner.js.
export class RecipeError extends Error {
  constructor(message, line = null) {
    super(message);
    this.name = "RecipeError";
    this.line = line;
  }
}

export class Model {
  // palette: object of { name: "#RRGGBB" }, in order (index 1 is the first entry).
  constructor(w, h, d, scale, palette) {
    for (const [label, v] of [["width", w], ["height", h], ["depth", d]]) {
      if (!Number.isInteger(v) || v < 1 || v > MAX_SIZE) {
        throw new RecipeError(`Model ${label} must be a whole number from 1 to ${MAX_SIZE} (got ${v}).`);
      }
    }
    if (typeof scale !== "number" || !(scale > 0)) {
      throw new RecipeError(`Model scale must be a number above 0 (got ${scale}).`);
    }
    this.w = w;
    this.h = h;
    this.d = d;
    this.scale = scale; // metres per voxel
    this.palette = palette;
    this.names = Object.keys(palette);
    this.nameToIndex = new Map(this.names.map((n, i) => [n, i + 1]));
    this.data = new Uint8Array(w * h * d);
  }

  // Palette index for a colour name; throws a plain-words error if the name is unknown.
  colourIndex(name) {
    const i = this.nameToIndex.get(name);
    if (i === undefined) {
      throw new RecipeError(`Unknown colour "${name}". Colour names come from palette.json.`);
    }
    return i;
  }

  inBounds(x, y, z) {
    return x >= 0 && y >= 0 && z >= 0 && x < this.w && y < this.h && z < this.d;
  }

  offset(x, y, z) {
    return x + this.w * (y + this.h * z);
  }

  // Palette index at a position, 0 if empty or outside the model.
  get(x, y, z) {
    return this.inBounds(x, y, z) ? this.data[this.offset(x, y, z)] : 0;
  }

  set(x, y, z, index) {
    if (!this.inBounds(x, y, z)) throw new RangeError(`Voxel ${x},${y},${z} is outside the model.`);
    this.data[this.offset(x, y, z)] = index;
  }

  clear(x, y, z) {
    this.set(x, y, z, 0);
  }

  count() {
    let n = 0;
    for (const v of this.data) if (v !== 0) n++;
    return n;
  }

  forEachVoxel(callback) {
    for (let z = 0; z < this.d; z++)
      for (let y = 0; y < this.h; y++)
        for (let x = 0; x < this.w; x++) {
          const i = this.data[this.offset(x, y, z)];
          if (i !== 0) callback(x, y, z, i);
        }
  }

  // Builds a model from vox_io.readVox output. A .vox carries its own colours (not palette.json),
  // so the model gets a palette of 255 entries named colour_1 .. colour_255, in file order.
  // Pass `named` (palette.json) to keep colour names for files this tool wrote; indices match its order.
  static fromVoxData(data, scale = 0.025, named = null) {
    const palette = {};
    if (named) Object.assign(palette, named);
    else for (let i = 1; i <= 255; i++) palette[`colour_${i}`] = rgbaToHex(data.palette[i]);
    const model = new Model(data.w, data.h, data.d, scale, palette);
    for (const v of data.voxels) model.set(v.x, v.y, v.z, v.i);
    return model;
  }

  // Real-world size in metres.
  sizeMetres() {
    return { x: this.w * this.scale, y: this.h * this.scale, z: this.d * this.scale };
  }

  // Plain data for vox_io.writeVox (palette entries are [r, g, b, a], index 0 unused).
  toVoxData() {
    const voxels = [];
    this.forEachVoxel((x, y, z, i) => voxels.push({ x, y, z, i }));
    const palette = [[0, 0, 0, 0]];
    for (const hex of Object.values(this.palette)) palette.push(hexToRgba(hex));
    return { w: this.w, h: this.h, d: this.d, voxels, palette };
  }
}

export function hexToRgba(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Bad colour "${hex}" (expected #RRGGBB).`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

export function rgbaToHex([r, g, b]) {
  return "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase();
}
