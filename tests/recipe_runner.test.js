import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build, dump } from "./helpers.js";
import { RecipeError } from "../src/model.js";

function failure(recipe) {
  try {
    build(recipe);
  } catch (e) {
    assert.ok(e instanceof RecipeError, `expected RecipeError, got ${e}`);
    return e;
  }
  assert.fail("recipe should have failed");
}

test("unknown colour is reported with its line", () => {
  const e = failure('model(4,4,4)\n\nbox(0,0,0,1,1,1,"hot_pink")');
  assert.match(e.message, /Unknown colour "hot_pink"/);
  assert.equal(e.line, 3);
});

test("out of bounds is reported with its line", () => {
  const e = failure('model(4,4,4)\nbox(0,0,0,1,1,1,"wall")\nbox(3,0,0,2,1,1,"wall")');
  assert.match(e.message, /outside the model/);
  assert.equal(e.line, 3);
});

test("line and cylinder out of bounds", () => {
  assert.match(failure('model(4,4,4)\nline(0,0,0,9,0,0,"wall")').message, /outside the model/);
  assert.match(failure('model(4,4,4)\ncylinder(0,0,0,3,2,"wall")').message, /outside the model/);
});

test("syntax error is reported with a line number", () => {
  const e = failure('model(4,4,4)\nbox(0,0,0,1,1,1,"wall")\nbox(1,1,1,1,1,1,"wall"\nbox(2,2,2,1,1,1,"wall")');
  assert.match(e.message, /Syntax error/);
  assert.equal(e.line, 3);
});

test("a typo'd helper name is reported with its line", () => {
  const e = failure("model(4,4,4)\n\n\nbx(0,0,0,1,1,1)");
  assert.match(e.message, /bx is not defined/);
  assert.equal(e.line, 4);
});

test("a recipe that never calls model() is an error", () => {
  assert.match(failure("// nothing here").message, /never started a model/);
});

test("recipes cannot reach the page", () => {
  // The page names exist inside the recipe but are undefined, so using them fails.
  assert.match(failure("model(2,2,2)\ndocument.title = 'x'").message, /undefined/);
  assert.match(failure("model(2,2,2)\nwindow.x = 1").message, /undefined/);
  assert.match(failure("model(2,2,2)\nfetch('x')").message, /not a function|undefined/);
  assert.equal(build("model(2,2,2); box(0,0,0,1,1,1,'wall')").count(), 1); // single quotes fine
});

test("clock_in.js builds a 10 x 14 x 5 model at scale 0.025", () => {
  const text = readFileSync(new URL("../recipes/clock_in.js", import.meta.url), "utf8");
  const m = build(text);
  assert.deepEqual([m.w, m.h, m.d, m.scale], [10, 14, 5, 0.025]);
  const d = dump(m);
  assert.ok(d.includes("8,12,4=status_green"));
  assert.ok(d.includes("3,2,4=sign"));
  assert.ok(d.includes("5,9,4=glass_dark"));
  assert.ok(d.includes("1,6,4=frame"));
  assert.ok(d.includes("2,5,0=frame")); // wall bracket on the back
  assert.ok(d.includes("0,0,2=roof_metal"));
});

test("every built-in recipe in recipes/index.json builds", () => {
  const list = JSON.parse(readFileSync(new URL("../recipes/index.json", import.meta.url), "utf8"));
  assert.ok(list.length >= 1);
  for (const { name, file } of list) {
    assert.ok(name);
    assert.ok(build(readFileSync(new URL(`../recipes/${file}`, import.meta.url), "utf8")).count() > 0, file);
  }
});
