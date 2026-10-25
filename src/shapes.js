// Helper functions that recipes call. No DOM, so it runs in the browser and in Node tests.
//
// makeHelpers(palette) returns the helpers a recipe can use. Colours are palette names.
// Every helper checks its numbers and explains problems in plain words (RecipeError).

import { Model, RecipeError } from "./model.js";

export function makeHelpers(palette) {
  let current = null; // the model started by model(...)

  const need = (fn) => {
    if (!current) throw new RecipeError(`${fn}() needs a model first. Start the recipe with model(width, height, depth, scale).`);
    return current;
  };

  // All arguments must be whole numbers.
  const whole = (fn, labels, values) => {
    labels.forEach((label, k) => {
      if (!Number.isInteger(values[k])) throw new RecipeError(`${fn}(): ${label} must be a whole number (got ${values[k]}).`);
    });
  };

  // The box must be at least 1 voxel in each direction and fit inside the model.
  const checkBox = (fn, m, x, y, z, w, h, d) => {
    whole(fn, ["x", "y", "z", "w", "h", "d"], [x, y, z, w, h, d]);
    if (w < 1 || h < 1 || d < 1) throw new RecipeError(`${fn}(): w, h and d must be at least 1 (got ${w}, ${h}, ${d}).`);
    if (x < 0 || y < 0 || z < 0 || x + w > m.w || y + h > m.h || z + d > m.d) {
      throw new RecipeError(
        `${fn}(): the box goes outside the model. It covers x ${x}..${x + w - 1}, y ${y}..${y + h - 1}, z ${z}..${z + d - 1}, ` +
        `but the model is only ${m.w} x ${m.h} x ${m.d} (valid 0..${m.w - 1}, 0..${m.h - 1}, 0..${m.d - 1}).`
      );
    }
  };

  const fillBox = (m, x, y, z, w, h, d, index) => {
    for (let k = z; k < z + d; k++)
      for (let j = y; j < y + h; j++)
        for (let i = x; i < x + w; i++) m.set(i, j, k, index);
  };

  const helpers = {
    // Starts a new model. Size is in voxels (max 256), scale is metres per voxel.
    model(w, h, d, scale = 0.025) {
      current = new Model(w, h, d, scale, palette);
    },

    box(x, y, z, w, h, d, colour) {
      const m = need("box");
      const index = m.colourIndex(colour);
      checkBox("box", m, x, y, z, w, h, d);
      fillBox(m, x, y, z, w, h, d, index);
    },

    // A box shell: the outer `wall` voxels are coloured, the inside is emptied.
    hollow_box(x, y, z, w, h, d, colour, wall = 1) {
      const m = need("hollow_box");
      const index = m.colourIndex(colour);
      checkBox("hollow_box", m, x, y, z, w, h, d);
      whole("hollow_box", ["wall"], [wall]);
      if (wall < 1) throw new RecipeError(`hollow_box(): wall must be at least 1 (got ${wall}).`);
      for (let k = z; k < z + d; k++)
        for (let j = y; j < y + h; j++)
          for (let i = x; i < x + w; i++) {
            const edge = Math.min(i - x, x + w - 1 - i, j - y, y + h - 1 - j, k - z, z + d - 1 - k);
            m.set(i, j, k, edge < wall ? index : 0);
          }
    },

    // (x, y, z) is the lowest corner of the cylinder's bounding box. The round part is
    // 2 * radius voxels across (rounded up) and `length` voxels long along `axis` ("x", "y" or "z").
    cylinder(x, y, z, radius, length, colour, axis = "y") {
      const m = need("cylinder");
      const index = m.colourIndex(colour);
      if (!["x", "y", "z"].includes(axis)) throw new RecipeError(`cylinder(): axis must be "x", "y" or "z" (got "${axis}").`);
      if (typeof radius !== "number" || !(radius > 0)) throw new RecipeError(`cylinder(): radius must be a number above 0 (got ${radius}).`);
      whole("cylinder", ["x", "y", "z", "length"], [x, y, z, length]);
      const across = Math.ceil(radius * 2);
      const size = { x: across, y: across, z: across };
      size[axis] = length;
      checkBox("cylinder", m, x, y, z, size.x, size.y, size.z);
      // Compare each voxel centre with the circle centre, in the two axes that are not `axis`.
      const [p, q] = ["x", "y", "z"].filter((a) => a !== axis);
      const origin = { x, y, z };
      for (let k = 0; k < size.z; k++)
        for (let j = 0; j < size.y; j++)
          for (let i = 0; i < size.x; i++) {
            const local = { x: i, y: j, z: k };
            const dp = local[p] + 0.5 - radius;
            const dq = local[q] + 0.5 - radius;
            if (dp * dp + dq * dq <= radius * radius) m.set(origin.x + i, origin.y + j, origin.z + k, index);
          }
    },

    // A straight line of single voxels between two points (both must be inside the model).
    line(x1, y1, z1, x2, y2, z2, colour) {
      const m = need("line");
      const index = m.colourIndex(colour);
      whole("line", ["x1", "y1", "z1", "x2", "y2", "z2"], [x1, y1, z1, x2, y2, z2]);
      for (const [px, py, pz] of [[x1, y1, z1], [x2, y2, z2]]) {
        if (!m.inBounds(px, py, pz)) {
          throw new RecipeError(`line(): the point ${px}, ${py}, ${pz} is outside the model (${m.w} x ${m.h} x ${m.d}).`);
        }
      }
      const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), Math.abs(z2 - z1));
      for (let s = 0; s <= steps; s++) {
        const t = steps === 0 ? 0 : s / steps;
        m.set(Math.round(x1 + (x2 - x1) * t), Math.round(y1 + (y2 - y1) * t), Math.round(z1 + (z2 - z1) * t), index);
      }
    },

    // Cuts a hole: empties every voxel in the box.
    remove(x, y, z, w, h, d) {
      const m = need("remove");
      checkBox("remove", m, x, y, z, w, h, d);
      fillBox(m, x, y, z, w, h, d, 0);
    },

    // Recolours only the voxels that already exist in the box; empty space stays empty.
    paint(x, y, z, w, h, d, colour) {
      const m = need("paint");
      const index = m.colourIndex(colour);
      checkBox("paint", m, x, y, z, w, h, d);
      for (let k = z; k < z + d; k++)
        for (let j = y; j < y + h; j++)
          for (let i = x; i < x + w; i++) if (m.get(i, j, k) !== 0) m.set(i, j, k, index);
    },

    // Copies the left half onto the right half, flipped. The middle column of an odd width is left alone.
    mirror_x() {
      const m = need("mirror_x");
      for (let k = 0; k < m.d; k++)
        for (let j = 0; j < m.h; j++)
          for (let i = 0; i < Math.floor(m.w / 2); i++) m.set(m.w - 1 - i, j, k, m.get(i, j, k));
    },
  };

  return { helpers, getModel: () => current };
}
