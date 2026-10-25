import test from "node:test";
import assert from "node:assert/strict";
import { Model, RecipeError } from "../src/model.js";
import { palette, build } from "./helpers.js";
import { readVox, writeVox } from "../src/vox_io.js";

test("set / get / clear / count", () => {
  const m = new Model(3, 4, 5, 0.025, palette);
  assert.equal(m.count(), 0);
  m.set(2, 3, 4, 7);
  assert.equal(m.get(2, 3, 4), 7);
  assert.equal(m.count(), 1);
  m.clear(2, 3, 4);
  assert.equal(m.get(2, 3, 4), 0);
  assert.equal(m.count(), 0);
});

test("get outside the model is empty, set outside throws", () => {
  const m = new Model(2, 2, 2, 0.025, palette);
  assert.equal(m.get(-1, 0, 0), 0);
  assert.equal(m.get(2, 0, 0), 0);
  assert.throws(() => m.set(2, 0, 0, 1), RangeError);
});

test("size limits and scale are checked", () => {
  assert.throws(() => new Model(257, 1, 1, 0.025, palette), RecipeError);
  assert.throws(() => new Model(0, 1, 1, 0.025, palette), RecipeError);
  assert.throws(() => new Model(1.5, 1, 1, 0.025, palette), RecipeError);
  assert.throws(() => new Model(1, 1, 1, 0, palette), RecipeError);
  assert.doesNotThrow(() => new Model(256, 256, 256, 0.025, palette));
});

test("palette index follows palette.json order starting at 1", () => {
  const m = new Model(1, 1, 1, 0.025, palette);
  assert.equal(m.colourIndex("wall"), 1);
  assert.equal(m.colourIndex("wall_shade"), 2);
  assert.equal(m.colourIndex("status_green"), 35);
  assert.throws(() => m.colourIndex("pink"), /Unknown colour "pink"/);
});

test("size in metres", () => {
  const m = new Model(10, 14, 5, 0.025, palette);
  const s = m.sizeMetres();
  assert.ok(Math.abs(s.x - 0.25) < 1e-9 && Math.abs(s.y - 0.35) < 1e-9 && Math.abs(s.z - 0.125) < 1e-9);
});

test("fromVoxData rebuilds a model from a written .vox, keeping voxels, colours and size", () => {
  const original = build('model(4, 3, 2, 0.05); box(0,0,0,2,1,1,"wall"); box(3,2,1,1,1,1,"status_green");');
  const loaded = Model.fromVoxData(readVox(writeVox(original.toVoxData())));
  assert.deepEqual([loaded.w, loaded.h, loaded.d], [4, 3, 2]);
  assert.equal(loaded.count(), original.count());
  const colourOf = (m, x, y, z) => m.palette[m.names[m.get(x, y, z) - 1]];
  assert.equal(colourOf(loaded, 1, 0, 0), palette.wall);
  assert.equal(colourOf(loaded, 3, 2, 1), palette.status_green);
  assert.equal(loaded.get(2, 0, 0), 0);
  // Saving the loaded model again gives the same file.
  assert.deepEqual(writeVox(loaded.toVoxData()), writeVox(original.toVoxData()));
});
