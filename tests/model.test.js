import test from "node:test";
import assert from "node:assert/strict";
import { Model, RecipeError } from "../src/model.js";
import { palette } from "./helpers.js";

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
