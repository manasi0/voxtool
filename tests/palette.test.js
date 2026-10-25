import test from "node:test";
import assert from "node:assert/strict";
import { palette } from "./helpers.js";
import { hexToRgba } from "../src/model.js";

test("palette.json has valid hex colours and fits in a .vox palette", () => {
  const entries = Object.entries(palette);
  assert.equal(entries.length, 35);
  assert.ok(entries.length <= 255);
  for (const [name, hex] of entries) {
    assert.match(name, /^[a-z0-9_]+$/);
    assert.match(hex, /^#[0-9A-Fa-f]{6}$/, name);
  }
  assert.deepEqual(Object.keys(palette).slice(0, 3), ["wall", "wall_shade", "wood"]);
  assert.deepEqual(hexToRgba(palette.wall), [0xb8, 0xb6, 0xb0, 255]);
});
