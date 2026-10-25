// Runs recipe text against the helpers in shapes.js. No DOM, so it runs in the browser and in Node tests.
//
// runRecipe(text, palette) returns the finished Model, or throws a RecipeError with a plain-words
// message and a `line` number (1-based, counted in the recipe text) when it can be worked out.
//
// The recipe only sees the helpers (and standard JavaScript such as Math and loops); names that
// would reach the page (window, document, fetch...) are hidden. This guards against accidents,
// it is not a security sandbox: only run recipes you trust.

import { makeHelpers } from "./shapes.js";
import { RecipeError } from "./model.js";

const HIDDEN = ["window", "document", "globalThis", "self", "fetch", "XMLHttpRequest", "localStorage", "sessionStorage", "location", "process", "require"];
const SOURCE = "recipe.js"; // name given to the recipe so it shows up in stack traces

// First "recipe.js:LINE" in an error's stack (a line of the generated function), or null.
function stackLine(error) {
  const m = /recipe\.js:(\d+)/.exec(String(error && error.stack));
  return m ? Number(m[1]) : null;
}

// Lines that new Function() puts in front of the body. Engines differ (V8 uses 2), so measure once
// by throwing from line 1 of a probe function.
let headerLines = null;
function measureHeader() {
  if (headerLines === null) {
    headerLines = 2;
    try {
      new Function(`throw new Error("probe")\n//# sourceURL=${SOURCE}`)();
    } catch (e) {
      const line = stackLine(e);
      if (line !== null) headerLines = line - 1;
    }
  }
  return headerLines;
}

export function runRecipe(text, palette) {
  const { helpers, getModel } = makeHelpers(palette);
  const names = [...Object.keys(helpers), ...HIDDEN];
  const values = [...Object.values(helpers), ...HIDDEN.map(() => undefined)];
  // "use strict" sits on the same line as the recipe's first line so line numbers stay right.
  const body = (src) => `"use strict";${src}\n//# sourceURL=${SOURCE}`;

  let fn;
  try {
    fn = new Function(...names, body(text));
  } catch (e) {
    throw new RecipeError(`Syntax error: ${e.message}`, syntaxErrorLine(text, names, e.message));
  }

  try {
    fn(...values);
  } catch (e) {
    // Errors from helpers are already plain words; other errors (typos like bx(...)) use JavaScript's message.
    const line = stackLine(e);
    const recipeLine = line === null ? null : line - measureHeader();
    if (e instanceof RecipeError) {
      e.line = recipeLine;
      throw e;
    }
    throw new RecipeError(`${e.name}: ${e.message}`, recipeLine);
  }

  const model = getModel();
  if (!model) throw new RecipeError("The recipe never started a model. Begin with model(width, height, depth, scale).");
  return model;
}

// Syntax errors come without a line number in V8, so find it: the first line where the
// recipe-so-far already fails with the same message as the whole recipe.
function syntaxErrorLine(text, names, message) {
  const lines = text.split("\n");
  for (let n = 1; n <= lines.length; n++) {
    try {
      new Function(...names, `"use strict";${lines.slice(0, n).join("\n")}`);
    } catch (e) {
      if (e.message === message) return n;
    }
  }
  return lines.length;
}
