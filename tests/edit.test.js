import test from "node:test";
import assert from "node:assert/strict";
import { Doc, UNDO_LIMIT } from "../src/edit.js";
import { pickVoxel, targetCell, planeCell } from "../src/pick.js";
import { encodeState, decodeState } from "../src/autosave.js";
import { writeVox, readVox } from "../src/vox_io.js";
import { Model } from "../src/model.js";
import { build, dump, palette } from "./helpers.js";

const empty = (w = 6, h = 6, d = 6) => new Model(w, h, d, 0.025, palette);

test("a stroke is one undo step, and redo puts it back", () => {
  const doc = new Doc(empty());
  doc.beginStroke();
  doc.setCell(1, 1, 1, 3);
  doc.setCell(2, 1, 1, 3);
  doc.setCell(1, 1, 1, 4); // same cell twice in one stroke
  assert.equal(doc.endStroke(), true);
  assert.equal(doc.undoStack.length, 1);
  assert.equal(doc.model.count(), 2);
  doc.undo();
  assert.equal(doc.model.count(), 0);
  doc.redo();
  assert.deepEqual(dump(doc.model), ["1,1,1=" + doc.model.names[3], "2,1,1=" + doc.model.names[2]]);
});

test("a stroke that changes nothing leaves no undo step", () => {
  const doc = new Doc(empty());
  doc.beginStroke();
  doc.setCell(1, 1, 1, 0);
  assert.equal(doc.endStroke(), false);
  assert.equal(doc.canUndo(), false);
});

test("a new edit clears redo", () => {
  const doc = new Doc(empty());
  doc.fillBox(0, 0, 0, 0, 0, 0, 1);
  doc.undo();
  assert.equal(doc.canRedo(), true);
  doc.fillBox(1, 1, 1, 1, 1, 1, 1);
  assert.equal(doc.canRedo(), false);
});

test("undo keeps at least 100 steps", () => {
  assert.ok(UNDO_LIMIT >= 100);
  const doc = new Doc(empty(20, 1, 20));
  for (let k = 0; k < 150; k++) doc.fillBox(k % 20, 0, Math.floor(k / 20), k % 20, 0, Math.floor(k / 20), 1);
  assert.equal(doc.model.count(), 150);
  for (let k = 0; k < 150; k++) assert.ok(doc.undo());
  assert.equal(doc.model.count(), 0);
});

test("history is capped at UNDO_LIMIT", () => {
  const doc = new Doc(empty(1, 1, 1));
  for (let k = 0; k < UNDO_LIMIT + 20; k++) doc.fillBox(0, 0, 0, 0, 0, 0, (k % 2) + 1);
  assert.equal(doc.undoStack.length, UNDO_LIMIT);
});

test("mirror x repeats every edit at the mirrored x", () => {
  const doc = new Doc(empty(6, 3, 3));
  doc.mirror = true;
  doc.fillBox(0, 0, 0, 1, 0, 0, 2);
  assert.equal(doc.model.count(), 4);
  assert.equal(doc.model.get(5, 0, 0), 2);
  assert.equal(doc.model.get(4, 0, 0), 2);
  doc.fillBox(5, 0, 0, 5, 0, 0, 0); // erase the mirrored side; the left goes too
  assert.equal(doc.model.get(0, 0, 0), 0);
  doc.undo();
  assert.equal(doc.model.count(), 4);
});

test("mirror x on an odd width leaves the centre column alone (one voxel)", () => {
  const doc = new Doc(empty(5, 1, 1));
  doc.mirror = true;
  doc.fillBox(2, 0, 0, 2, 0, 0, 1);
  assert.equal(doc.model.count(), 1);
});

test("fillBox accepts corners in any order and ignores cells outside the model", () => {
  const doc = new Doc(empty(3, 3, 3));
  doc.fillBox(2, 2, 2, 1, 1, 1, 1);
  assert.equal(doc.model.count(), 8);
  doc.fillBox(2, 2, 2, 4, 4, 4, 1); // mostly outside: only (2,2,2) is in the model, and it is already filled
  assert.equal(doc.model.count(), 8);
});

test("running a recipe is one undo step and undo returns the earlier model, edits included", () => {
  const doc = new Doc(build('model(3,3,3); box(0,0,0,3,1,3,"wall")'));
  doc.fillBox(1, 2, 1, 1, 2, 1, doc.model.colourIndex("sign"));
  const before = dump(doc.model);
  doc.replaceModel(build('model(2,2,2); box(0,0,0,2,2,2,"rust")'));
  assert.equal(doc.model.count(), 8);
  assert.equal(doc.undoStack.length, 2);
  doc.undo();
  assert.deepEqual(dump(doc.model), before);
  doc.undo();
  assert.equal(doc.model.count(), 9);
  doc.redo(); doc.redo();
  assert.equal(doc.model.count(), 8);
});

test("edits made after undoing a replace undo cleanly", () => {
  const first = build('model(3,3,3); box(0,0,0,3,1,3,"wall")');
  const doc = new Doc(first);
  doc.replaceModel(build('model(2,2,2)'));
  doc.undo();
  assert.equal(doc.model, first);
  doc.fillBox(0, 1, 0, 0, 1, 0, 1);
  assert.equal(doc.model.count(), 10);
  doc.undo();
  assert.equal(doc.model.count(), 9);
});

// ---- picking ----

const ray = (ox, oy, oz, dx, dy, dz) => [{ x: ox, y: oy, z: oz }, { x: dx, y: dy, z: dz }];

test("pick: front face of a voxel gives +z normal and the cell in front of it", () => {
  const m = empty();
  m.set(2, 2, 2, 1);
  const hit = pickVoxel(m, ...ray(2.5, 2.5, 20, 0, 0, -1));
  assert.deepEqual([hit.x, hit.y, hit.z, hit.nx, hit.ny, hit.nz], [2, 2, 2, 0, 0, 1]);
  assert.deepEqual(targetCell(hit), { x: 2, y: 2, z: 3 });
});

test("pick: every face direction", () => {
  const m = empty();
  m.set(3, 3, 3, 1);
  const cases = [
    [[3.5, 3.5, -10], [0, 0, 1], [0, 0, -1]],
    [[-10, 3.5, 3.5], [1, 0, 0], [-1, 0, 0]],
    [[20, 3.5, 3.5], [-1, 0, 0], [1, 0, 0]],
    [[3.5, 20, 3.5], [0, -1, 0], [0, 1, 0]],
    [[3.5, -5, 3.5], [0, 1, 0], [0, -1, 0]],
  ];
  for (const [o, d, n] of cases) {
    const hit = pickVoxel(m, ...ray(...o, ...d));
    assert.deepEqual([hit.x, hit.y, hit.z, hit.nx, hit.ny, hit.nz], [3, 3, 3, ...n], JSON.stringify(o));
  }
});

test("pick: an angled ray hits the first voxel along the way", () => {
  const m = empty();
  m.set(1, 1, 1, 1);
  m.set(4, 4, 4, 1);
  const hit = pickVoxel(m, ...ray(10, 10, 10, -1, -1, -1)); // along the diagonal: (4,4,4) first
  assert.deepEqual([hit.x, hit.y, hit.z], [4, 4, 4]);
});

test("pick: ray starting inside the model", () => {
  const m = empty();
  m.set(4, 2, 2, 1);
  const hit = pickVoxel(m, ...ray(1.5, 2.5, 2.5, 1, 0, 0));
  assert.deepEqual([hit.x, hit.nx], [4, -1]);
});

test("pick: empty model hits the floor; a miss outside the footprint gives null", () => {
  const m = empty();
  const hit = pickVoxel(m, ...ray(2.5, 10, 3.5, 0, -1, 0));
  assert.deepEqual([hit.ground, hit.x, hit.y, hit.z], [true, 2, 0, 3]);
  assert.deepEqual(targetCell(hit), { x: 2, y: 0, z: 3 });
  assert.equal(pickVoxel(m, ...ray(50, 10, 3.5, 0, -1, 0)), null);
  assert.equal(pickVoxel(m, ...ray(50, 10, 3.5, 0, 1, 0)), null);
});

test("pick: slice limit hides voxels above maxY", () => {
  const m = empty();
  m.set(2, 4, 2, 1);
  m.set(2, 1, 2, 1);
  assert.equal(pickVoxel(m, ...ray(2.5, 20, 2.5, 0, -1, 0)).y, 4);
  const hit = pickVoxel(m, ...ray(2.5, 20, 2.5, 0, -1, 0), 2);
  assert.deepEqual([hit.y, hit.ny], [1, 1]);
  assert.deepEqual(targetCell(hit), { x: 2, y: 2, z: 2 });
});

test("planeCell: finds the cell where the ray crosses the face plane, clamped into the model", () => {
  const m = empty();
  // top face layer y=3 (plane at y=3 when the face normal points up from voxel y=2)
  assert.deepEqual(planeCell(m, ...ray(1.5, 10, 4.5, 0, -1, 0), 1, 3, 3), [1, 3, 4]);
  assert.deepEqual(planeCell(m, ...ray(-9, 10, 40, 0, -1, 0), 1, 3, 3), [0, 3, 5]);
  assert.equal(planeCell(m, ...ray(1, 1, 1, 1, 0, 0), 1, 3, 3), null);
});

// ---- autosave ----

test("autosave: palette.json model survives encode/decode with names, scale and recipe", () => {
  const m = build('model(5,6,7,0.05); box(0,0,0,2,3,4,"wood"); box(4,5,6,1,1,1,"status_green")');
  const state = JSON.parse(JSON.stringify(encodeState(m, "my recipe")));
  const back = decodeState(state, palette);
  assert.equal(back.recipe, "my recipe");
  assert.equal(back.model.scale, 0.05);
  assert.deepEqual(dump(back.model), dump(m));
});

test("autosave: a model opened from a .vox keeps its own colours", () => {
  const file = writeVox({ w: 2, h: 2, d: 2, voxels: [{ x: 1, y: 1, z: 0, i: 7 }], palette: [[0, 0, 0, 0], ...Array(255).fill([10, 20, 30, 255])] });
  const m = Model.fromVoxData(readVox(file), 0.1);
  const back = decodeState(JSON.parse(JSON.stringify(encodeState(m, ""))), palette).model;
  assert.equal(back.names[0], "colour_1");
  assert.equal(back.palette.colour_7, "#0A141E");
  assert.deepEqual(dump(back), dump(m));
});

test("saving an edited model: palette indices follow palette.json", () => {
  const doc = new Doc(new Model(4, 4, 4, 0.025, palette));
  doc.fillBox(0, 0, 0, 0, 0, 0, doc.model.colourIndex("status_green"));
  const back = readVox(writeVox(doc.model.toVoxData()));
  assert.equal(back.voxels[0].i, 35);
  assert.deepEqual(back.palette[35], [0x3e, 0x8a, 0x4a, 255]);
  assert.deepEqual(back.palette[1], [0xb8, 0xb6, 0xb0, 255]);
});

test("paint (onlyFilled) recolours existing voxels and never adds, mirror included", () => {
  const doc = new Doc(empty(4, 1, 1));
  doc.mirror = true;
  doc.fillBox(0, 0, 0, 0, 0, 0, 1); // fills x=0 and x=3
  doc.beginStroke();
  doc.setCell(1, 0, 0, 2, true);    // empty: stays empty (and so does its mirror)
  doc.setCell(0, 0, 0, 2, true);    // filled: recoloured, and the mirror too
  doc.endStroke();
  assert.deepEqual([0, 1, 2, 3].map((x) => doc.model.get(x, 0, 0)), [2, 0, 0, 2]);
});

test("planeCell with clamp=false is null outside the model", () => {
  const m = empty();
  assert.equal(planeCell(m, ...ray(-9, 10, 4.5, 0, -1, 0), 1, 3, 3, false), null);
  assert.deepEqual(planeCell(m, ...ray(1.5, 10, 4.5, 0, -1, 0), 1, 3, 3, false), [1, 3, 4]);
});
