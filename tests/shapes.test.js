import test from "node:test";
import assert from "node:assert/strict";
import { build, dump } from "./helpers.js";

test("box fills exactly its volume", () => {
  const m = build('model(5,5,5); box(1,2,3,2,2,2,"wall")');
  assert.equal(m.count(), 8);
  assert.equal(m.get(1, 2, 3), 1);
  assert.equal(m.get(2, 3, 4), 1);
  assert.equal(m.get(3, 3, 4), 0);
});

test("model() default scale is 0.025", () => {
  assert.equal(build("model(2,2,2)").scale, 0.025);
  assert.equal(build("model(2,2,2,0.05)").scale, 0.05);
});

test("hollow_box leaves the inside empty and honours wall thickness", () => {
  const m = build('model(5,5,5); hollow_box(0,0,0,5,5,5,"wood")');
  assert.equal(m.count(), 125 - 27);
  assert.equal(m.get(2, 2, 2), 0);
  const thick = build('model(6,6,6); hollow_box(0,0,0,6,6,6,"wood",2)');
  assert.equal(thick.count(), 216 - 8);
});

test("hollow_box clears what was inside", () => {
  const m = build('model(5,5,5); box(0,0,0,5,5,5,"wall"); hollow_box(0,0,0,5,5,5,"wood")');
  assert.equal(m.get(2, 2, 2), 0);
  assert.equal(m.get(0, 0, 0), m.colourIndex("wood"));
});

test("cylinder along each axis", () => {
  const y = build('model(6,6,6); cylinder(1,0,1,2,3,"pipe")');
  assert.equal(y.count(), 12 * 3); // radius 2 -> 4x4 minus 4 corners = 12 per layer
  assert.equal(y.get(1, 0, 1), 0); // corner of the bounding box is empty
  assert.equal(y.get(2, 1, 2), y.colourIndex("pipe"));
  assert.equal(y.get(2, 3, 2), 0); // length is 3
  const x = build('model(6,6,6); cylinder(0,1,1,2,4,"pipe","x")');
  assert.equal(x.count(), 12 * 4);
  assert.equal(x.get(3, 2, 2), x.colourIndex("pipe"));
  assert.equal(x.get(0, 1, 1), 0);
  const z = build('model(6,6,6); cylinder(1,1,0,2,5,"pipe","z")');
  assert.equal(z.count(), 12 * 5);
  assert.equal(z.get(2, 2, 4), z.colourIndex("pipe"));
});

test("cylinder rejects a bad axis", () => {
  assert.throws(() => build('model(6,6,6); cylinder(0,0,0,2,3,"pipe","q")'), /axis/);
});

test("line draws a straight run including both ends", () => {
  const m = build('model(6,6,6); line(0,0,0,5,0,0,"rust")');
  assert.equal(m.count(), 6);
  const diag = build('model(6,6,6); line(0,0,0,5,5,5,"rust")');
  assert.deepEqual(dump(diag), ["0,0,0=rust", "1,1,1=rust", "2,2,2=rust", "3,3,3=rust", "4,4,4=rust", "5,5,5=rust"]);
  assert.equal(build('model(3,3,3); line(1,1,1,1,1,1,"rust")').count(), 1);
});

test("remove cuts a hole", () => {
  const m = build('model(4,4,4); box(0,0,0,4,4,4,"wall"); remove(1,1,1,2,2,2)');
  assert.equal(m.count(), 64 - 8);
  assert.equal(m.get(1, 1, 1), 0);
  assert.equal(m.get(0, 0, 0), 1);
});

test("paint recolours only existing voxels", () => {
  const m = build('model(4,4,4); box(0,0,0,2,2,2,"wall"); paint(0,0,0,4,4,4,"rust")');
  assert.equal(m.count(), 8);
  assert.equal(m.get(1, 1, 1), m.colourIndex("rust"));
  assert.equal(m.get(3, 3, 3), 0);
});

test("mirror_x copies the left half onto the right", () => {
  const m = build('model(6,2,2); box(0,0,0,1,1,1,"wall"); box(2,1,1,1,1,1,"rust"); mirror_x()');
  assert.equal(m.get(5, 0, 0), m.colourIndex("wall"));
  assert.equal(m.get(3, 1, 1), m.colourIndex("rust"));
  assert.equal(m.count(), 4);
});

test("mirror_x on an odd width leaves the middle column and replaces the right half", () => {
  const m = build('model(5,1,1); box(2,0,0,1,1,1,"wood"); box(4,0,0,1,1,1,"rust"); box(0,0,0,1,1,1,"wall"); mirror_x()');
  assert.equal(m.get(2, 0, 0), m.colourIndex("wood"));
  assert.equal(m.get(4, 0, 0), m.colourIndex("wall")); // old right side overwritten
});

test("loops and variables work in recipes", () => {
  const m = build('model(10,1,1); for (let i = 0; i < 10; i += 2) box(i,0,0,1,1,1,"wall");');
  assert.equal(m.count(), 5);
});

test("helpers need model() first", () => {
  assert.throws(() => build('box(0,0,0,1,1,1,"wall")'), /needs a model first/);
});

test("non-integer and zero sizes are rejected", () => {
  assert.throws(() => build('model(4,4,4); box(0.5,0,0,1,1,1,"wall")'), /whole number/);
  assert.throws(() => build('model(4,4,4); box(0,0,0,0,1,1,"wall")'), /at least 1/);
});
