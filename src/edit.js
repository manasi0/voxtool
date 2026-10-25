// Editing document: the current model plus undo/redo. No DOM, so it runs in the browser and in Node tests.
//
// Every change goes through a "stroke": beginStroke() ... setCell() many times ... endStroke().
// One stroke is one undo step (a mouse drag, a box fill). Replacing the whole model (running a recipe,
// opening a file, New) is also one step, stored as before/after model objects.

export const UNDO_LIMIT = 200; // spec asks for at least 100

export class Doc {
  constructor(model = null) {
    this.model = model;
    this.mirror = false; // Mirror X toggle: every edit is repeated at the mirrored x
    this.undoStack = [];
    this.redoStack = [];
    this.stroke = null;  // Map of offset -> [before, after] while a stroke is open
  }

  canUndo() { return this.undoStack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }

  // Start over with a new model and no history (used for New and for restoring autosave).
  reset(model) {
    this.model = model;
    this.undoStack = [];
    this.redoStack = [];
    this.stroke = null;
  }

  // Swap in a whole new model as one undo step.
  replaceModel(model) {
    if (this.model) this.push({ before: this.model, after: model });
    this.model = model;
  }

  beginStroke() {
    this.stroke = new Map();
  }

  // Sets one voxel (index 0 erases) and its mirror if Mirror X is on. Out-of-bounds cells are ignored.
  // onlyFilled: leave empty cells alone (Paint recolours, it never adds).
  setCell(x, y, z, index, onlyFilled = false) {
    this.put(x, y, z, index, onlyFilled);
    if (this.mirror) this.put(this.model.w - 1 - x, y, z, index, onlyFilled);
  }

  put(x, y, z, index, onlyFilled) {
    const m = this.model;
    if (!m.inBounds(x, y, z)) return;
    const at = m.offset(x, y, z);
    const before = m.data[at];
    if (before === index || (onlyFilled && before === 0)) return;
    m.data[at] = index;
    if (!this.stroke) throw new Error("setCell() called outside beginStroke()/endStroke().");
    const seen = this.stroke.get(at);
    if (seen) seen[1] = index; else this.stroke.set(at, [before, index]);
  }

  // Fills (or with index 0 clears) the box x0..x1, y0..y1, z0..z1 (inclusive, any order) as its own stroke.
  fillBox(x0, y0, z0, x1, y1, z1, index) {
    this.beginStroke();
    for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.setCell(x, y, z, index);
    return this.endStroke();
  }

  // Closes the stroke. Returns true if anything actually changed.
  endStroke() {
    const stroke = this.stroke;
    this.stroke = null;
    if (!stroke) return false;
    const cells = [];
    for (const [at, [before, after]] of stroke) if (before !== after) cells.push([at, before, after]);
    if (!cells.length) return false;
    this.push({ cells, model: this.model });
    return true;
  }

  push(step) {
    this.undoStack.push(step);
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  undo() {
    const step = this.undoStack.pop();
    if (!step) return false;
    this.apply(step, true);
    this.redoStack.push(step);
    return true;
  }

  redo() {
    const step = this.redoStack.pop();
    if (!step) return false;
    this.apply(step, false);
    this.undoStack.push(step);
    return true;
  }

  apply(step, backwards) {
    if (step.cells) {
      for (const [at, before, after] of step.cells) step.model.data[at] = backwards ? before : after;
      this.model = step.model;
    } else {
      this.model = backwards ? step.before : step.after;
    }
  }
}
