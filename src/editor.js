// Page wiring: recipe box, Run, file open/download, edit tools, undo/redo, palette, slice, autosave, help.
// The logic that doesn't need a browser lives in edit.js (document + undo), pick.js (mouse picking)
// and autosave.js (saving to localStorage), so it can be tested in Node.

import { runRecipe } from "./recipe_runner.js";
import { Model } from "./model.js";
import { readVox, writeVox } from "./vox_io.js";
import { Doc } from "./edit.js";
import { pickVoxel, targetCell, planeCell } from "./pick.js";
import { encodeState, decodeState } from "./autosave.js";
import { createView } from "./view.js";

const $ = (id) => document.getElementById(id);
const recipeBox = $("recipe");
const recipeList = $("recipe-list");
const downloadButton = $("download");
const undoButton = $("undo");
const redoButton = $("redo");
const sizeBox = $("size");
const godotBox = $("godot");
const cursorBox = $("cursor");
const autosaveBox = $("autosave");
const scaleInput = $("scale");
const colourList = $("colour-list");
const fileInput = $("file");
const errorBox = $("error");
const sliceInput = $("slice");
const sliceLabel = $("slice-label");
const extrudeInput = $("extrude");
const mirrorInput = $("mirror");
const newDialog = $("new-dialog");
const helpDialog = $("help-dialog");

const AUTOSAVE_KEY = "voxtool.autosave.v1";
const GREY_HEX = "#808080"; // unused palette slots in a .vox file

const view = createView($("view"));
const doc = new Doc();
let palette = null;
let colour = 1;          // current palette index
let tool = "add";
let fileName = "model";  // download name
let drag = null;         // the stroke or box in progress
let shownModel = null;   // model the palette list was built for

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url} (${response.status}).`);
  return response.text();
}

function showError(message) {
  errorBox.textContent = message;
}

// ---- drawing the page ----

// Slice limit: the highest y layer that is shown/editable, or null when every layer is.
function sliceLimit() {
  const v = Number(sliceInput.value);
  return v >= doc.model.h - 1 ? null : v;
}

let renderQueued = false;
// Redraws on the next animation frame, so a fast drag redraws once per frame at most.
function refresh({ resetCamera = false } = {}) {
  if (resetCamera) refresh.reset = true;
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    const model = doc.model;
    if (!model) return;
    if (shownModel !== model) onNewModel(model);
    view.show(model, { maxY: sliceLimit(), reset: refresh.reset });
    refresh.reset = false;
    updateStatus();
    undoButton.disabled = !doc.canUndo();
    redoButton.disabled = !doc.canRedo();
  });
}

// The model object changed (recipe, open, New, undo of one of those): reset slice and palette list.
function onNewModel(model) {
  const previous = shownModel;
  shownModel = model;
  downloadButton.disabled = false;
  scaleInput.value = model.scale;
  if (!previous || previous.h !== model.h || sliceInput.max !== String(model.h - 1)) {
    sliceInput.max = model.h - 1;
    sliceInput.value = model.h - 1;
  }
  if (colour > model.names.length) colour = 1;
  renderPalette();
  updateSliceLabel();
}

function updateSliceLabel() {
  const limit = sliceLimit();
  sliceLabel.textContent = limit === null ? "all layers" : `layers 0 to ${limit} (y)`;
}

function updateStatus() {
  const model = doc.model;
  const m = model.sizeMetres();
  sizeBox.textContent =
    `${model.w} x ${model.h} x ${model.d} voxels, ${model.count()} filled | ` +
    `${m.x.toFixed(3)} x ${m.y.toFixed(3)} x ${m.z.toFixed(3)} m`;
  godotBox.textContent = `Godot import scale: ${model.scale}`;
}

// Palette sidebar: swatch + name for every colour of the model. A model opened from a .vox file has
// unnamed colours, so those show their hex code, and unused grey filler slots are left out.
function renderPalette() {
  const model = doc.model;
  const used = new Set();
  model.forEachVoxel((x, y, z, i) => used.add(i));
  colourList.replaceChildren();
  model.names.forEach((name, k) => {
    const i = k + 1;
    const hex = model.palette[name];
    const foreign = name.startsWith("colour_");
    if (foreign && hex === GREY_HEX && !used.has(i)) return;
    const li = document.createElement("li");
    li.dataset.index = i;
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = hex;
    const label = document.createElement("span");
    label.textContent = foreign ? hex : name;
    li.append(swatch, label);
    li.addEventListener("click", () => setColour(i));
    colourList.append(li);
  });
  highlightColour();
}

function setColour(i) {
  colour = i;
  highlightColour();
}

function highlightColour() {
  for (const li of colourList.children) li.classList.toggle("current", Number(li.dataset.index) === colour);
}

function setTool(name) {
  cancelDrag();
  tool = name;
  for (const b of document.querySelectorAll("[data-tool]")) b.classList.toggle("active", b.dataset.tool === name);
  view.setLeftOrbit(name === "orbit");
  view.canvas.style.cursor = name === "orbit" ? "grab" : "crosshair";
  view.setHover(null);
}

// ---- model changes ----

function changed() {
  refresh();
  scheduleAutosave();
}

// Builds the model from the recipe text. One undo step. On error the previous model stays.
function run() {
  showError("");
  let built;
  try {
    built = runRecipe(recipeBox.value, palette);
  } catch (e) {
    showError((e.line ? `Line ${e.line}: ` : "") + e.message);
    return;
  }
  doc.replaceModel(built);
  refresh({ resetCamera: true });
  scheduleAutosave();
}

function undo() {
  if (doc.undo()) changed();
}
function redo() {
  if (doc.redo()) changed();
}

// Opens a .vox file chosen with the button or dropped on the page. One undo step.
async function openFile(file) {
  showError("");
  try {
    const data = readVox(await file.arrayBuffer());
    const old = doc.model;
    const model = Model.fromVoxData(data, old ? old.scale : 0.025);
    fileName = file.name.replace(/\.vox$/i, "");
    if (old) doc.replaceModel(model); else doc.reset(model);
    refresh({ resetCamera: true });
    scheduleAutosave();
    if (data.modelCount > 1) showError(`This file has ${data.modelCount} models; only the first is shown.`);
  } catch (e) {
    showError(`Could not open ${file.name}: ${e.message}`);
  }
}

function download() {
  if (!doc.model) return;
  const blob = new Blob([writeVox(doc.model.toVoxData())], { type: "application/octet-stream" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${fileName}.vox`;
  link.click();
  URL.revokeObjectURL(link.href);
}

// ---- autosave (localStorage may be missing or full: the page works without it) ----

let autosaveTimer = null;
function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(autosave, 500);
}

function autosave() {
  if (!doc.model) return;
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ ...encodeState(doc.model, recipeBox.value), fileName }));
    autosaveBox.textContent = "";
  } catch (e) {
    autosaveBox.textContent = "Autosave unavailable";
  }
}

// Returns true if a saved model was restored.
function restoreAutosave() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return false;
    const state = JSON.parse(raw);
    const { model, recipe } = decodeState(state, palette);
    recipeBox.value = recipe;
    fileName = state.fileName || "model";
    recipeList.selectedIndex = -1; // the text is the user's own now
    doc.reset(model);
    refresh({ resetCamera: true });
    return true;
  } catch (e) {
    return false; // missing, blocked or damaged: start fresh
  }
}

// ---- New ----

function openNewDialog() {
  $("new-error").textContent = "";
  newDialog.showModal();
}

$("new-form").addEventListener("submit", (e) => {
  if (e.submitter && e.submitter.value !== "ok") return; // Cancel just closes the dialog
  const [w, h, d, scale] = ["new-w", "new-h", "new-d", "new-scale"].map((id) => Number($(id).value));
  let model;
  try {
    model = new Model(w, h, d, scale, palette);
  } catch (err) {
    e.preventDefault();
    $("new-error").textContent = err.message;
    return;
  }
  if ((doc.model && doc.model.count() > 0 || recipeBox.value.trim()) &&
      !confirm("Start a new model? This clears the current model and recipe text (and the autosave).")) {
    e.preventDefault();
    return;
  }
  try { localStorage.removeItem(AUTOSAVE_KEY); } catch (err) { /* no storage: nothing to clear */ }
  recipeBox.value = "";
  recipeList.selectedIndex = -1;
  fileName = "model";
  showError("");
  doc.reset(model);
  refresh({ resetCamera: true });
  scheduleAutosave();
});

// ---- mouse tools ----

// The cell Add/Box fill would build on and the voxel Erase/Paint/Eyedropper would touch under the mouse.
function pickAt(event) {
  const model = doc.model;
  const { origin, dir } = view.ray(event.clientX, event.clientY, model.scale);
  return { hit: pickVoxel(model, origin, dir, sliceLimit()), origin, dir };
}

// Description of the face a drag works on: which axis, the plane's position and the layer of cells in front of it.
function faceOf(hit) {
  const n = [hit.nx, hit.ny, hit.nz];
  const axis = hit.ground ? 1 : n.findIndex((v) => v !== 0);
  const sign = hit.ground ? 1 : n[axis];
  const cell = [hit.x, hit.y, hit.z];
  const layerCell = hit.ground ? cell : cell.map((v, a) => (a === axis ? v + sign : v));
  const plane = hit.ground ? 0 : cell[axis] + (sign > 0 ? 1 : 0);
  return { axis, sign, plane, layer: layerCell[axis], start: layerCell, hitCell: cell };
}

// One edit by the current tool at a cell [x, y, z] (Add / Erase / Paint). Cells above the slice are off limits.
function applyTool(cell) {
  const model = doc.model;
  const [x, y, z] = cell;
  const limit = sliceLimit();
  if (!model.inBounds(x, y, z) || (limit !== null && y > limit)) return;
  if (tool === "add") doc.setCell(x, y, z, colour);
  else if (tool === "erase") doc.setCell(x, y, z, 0);
  else if (tool === "paint") doc.setCell(x, y, z, colour, true);
}

// The box Box fill would make for a drag from drag.start to `end` (both [x,y,z] on the face layer), clipped to the model.
function boxRegion(end) {
  const { axis, sign, start } = drag.face;
  const n = Math.max(1, Math.floor(Number(extrudeInput.value)) || 1);
  const min = [0, 1, 2].map((a) => Math.min(start[a], end[a]));
  const max = [0, 1, 2].map((a) => Math.max(start[a], end[a]));
  min[axis] = max[axis] = start[axis];
  if (sign > 0) max[axis] = start[axis] + n - 1; else min[axis] = start[axis] - n + 1;
  const limit = sliceLimit();
  const size = [doc.model.w, limit === null ? doc.model.h : limit + 1, doc.model.d];
  for (let a = 0; a < 3; a++) {
    min[a] = Math.max(0, min[a]);
    max[a] = Math.min(size[a] - 1, max[a]);
    if (min[a] > max[a]) return null;
  }
  return { min, max };
}

function cancelDrag() {
  if (!drag) return;
  if (drag.kind === "stroke") { doc.endStroke(); changed(); } // keep what was painted so far, as one step
  drag = null;
  view.setPreview(null);
}

view.canvas.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || tool === "orbit" || !doc.model) return;
  const { hit } = pickAt(e);
  if (!hit) return;

  if (tool === "eyedropper") {
    if (!hit.ground) setColour(doc.model.get(hit.x, hit.y, hit.z));
    return;
  }
  const face = faceOf(hit);
  if (tool === "box") {
    if (!doc.model.inBounds(...face.start)) return; // the face is on the model's edge: nothing to build on
    drag = { kind: "box", face, end: face.start };
    view.setHover(null);
    const region = boxRegion(face.start);
    if (region) view.setPreview(region.min, region.max, doc.model.scale);
  } else {
    if (!hit.ground && tool !== "add") face.layer = face.hitCell[face.axis]; // Erase/Paint work on the hit voxel's layer
    drag = { kind: "stroke", face, last: "" };
    doc.beginStroke();
    const first = tool === "add" ? face.start : face.hitCell;
    drag.last = first.join();
    applyTool(first);
    refresh();
  }
  view.canvas.setPointerCapture(e.pointerId);
});

view.canvas.addEventListener("pointermove", (e) => {
  if (!doc.model) return;
  if (!drag) return hover(e);
  const { origin, dir } = pickAt(e);
  const { axis, plane, layer } = drag.face;
  if (drag.kind === "box") {
    const end = planeCell(doc.model, origin, dir, axis, plane, layer);
    if (!end) return;
    drag.end = end;
    const region = boxRegion(end);
    view.setPreview(region && region.min, region && region.max, doc.model.scale);
  } else {
    // Strokes stay on the plane of the first face, so a drag paints a flat patch.
    const cell = planeCell(doc.model, origin, dir, axis, plane, drag.face.layer, false);
    if (!cell || cell.join() === drag.last) return;
    drag.last = cell.join();
    applyTool(cell);
    refresh();
  }
});

function hover(e) {
  const { hit } = pickAt(e);
  if (!hit || tool === "orbit") {
    view.setHover(null);
    cursorBox.textContent = "";
    return;
  }
  const cell = tool === "add" || tool === "box" ? targetCell(hit) : (hit.ground ? null : [hit.x, hit.y, hit.z]);
  if (!cell) {
    view.setHover(null);
    return;
  }
  const c = Array.isArray(cell) ? cell : [cell.x, cell.y, cell.z];
  view.setHover(c, c, doc.model.scale);
  cursorBox.textContent = `x ${c[0]}  y ${c[1]}  z ${c[2]}`;
}

view.canvas.addEventListener("pointerleave", () => {
  if (!drag) view.setHover(null);
});

function finishDrag() {
  if (!drag) return;
  if (drag.kind === "stroke") {
    doc.endStroke();
  } else {
    const region = boxRegion(drag.end);
    if (region) doc.fillBox(...region.min, ...region.max, colour);
  }
  drag = null;
  view.setPreview(null);
  changed();
}
view.canvas.addEventListener("pointerup", finishDrag);
view.canvas.addEventListener("pointercancel", finishDrag);

// ---- buttons, keys, drag-and-drop ----

function typing(target) {
  return target.tagName === "TEXTAREA" || target.tagName === "SELECT" ||
    (target.tagName === "INPUT" && target.type !== "range" && target.type !== "checkbox");
}

function nudgeSlice(by) {
  sliceInput.value = Math.min(Number(sliceInput.max), Math.max(0, Number(sliceInput.value) + by));
  updateSliceLabel();
  refresh();
}

window.addEventListener("keydown", (e) => {
  if (typing(e.target) || e.target.closest("dialog[open]")) return;
  const ctrl = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (ctrl && key === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (ctrl && key === "y") { e.preventDefault(); redo(); }
  else if (ctrl && key === "s") { e.preventDefault(); download(); }
  else if (ctrl || e.altKey) return;
  else if (key === "escape") cancelDrag();
  else if (key === "?") helpDialog.showModal();
  else if (key === "[") nudgeSlice(-1);
  else if (key === "]") nudgeSlice(1);
  else if (key === "m") { mirrorInput.checked = !mirrorInput.checked; doc.mirror = mirrorInput.checked; }
  else {
    const tools = { a: "add", e: "erase", p: "paint", i: "eyedropper", b: "box", o: "orbit" };
    if (tools[key]) setTool(tools[key]);
  }
});

for (const b of document.querySelectorAll("[data-tool]")) b.addEventListener("click", () => setTool(b.dataset.tool));
for (const b of document.querySelectorAll("[data-view]")) b.addEventListener("click", () => view.setView(b.dataset.view));
mirrorInput.addEventListener("change", () => { doc.mirror = mirrorInput.checked; });
sliceInput.addEventListener("input", () => { updateSliceLabel(); refresh(); });
undoButton.addEventListener("click", undo);
redoButton.addEventListener("click", redo);
$("new").addEventListener("click", openNewDialog);
$("help-button").addEventListener("click", () => helpDialog.showModal());
$("open").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) openFile(fileInput.files[0]);
  fileInput.value = ""; // so picking the same file again still fires
});
$("run").addEventListener("click", run);
downloadButton.addEventListener("click", download);
recipeBox.addEventListener("input", scheduleAutosave);
// Ctrl+Enter inside the recipe box runs it.
recipeBox.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
});

// Scale box: changes the real size only (voxels stay the same), and is used when saving/importing.
scaleInput.addEventListener("change", () => {
  const value = parseFloat(scaleInput.value);
  if (!doc.model) return;
  if (!(value > 0)) { scaleInput.value = doc.model.scale; return; }
  doc.model.scale = value;
  changed();
});

// Drag-and-drop anywhere on the page. dragenter/leave fire for every child, so count them.
let dragDepth = 0;
window.addEventListener("dragenter", (e) => { e.preventDefault(); dragDepth++; document.body.classList.add("dragging"); });
window.addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove("dragging"); } });
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => {
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove("dragging");
  const file = e.dataTransfer.files[0];
  if (file) openFile(file);
});

async function loadRecipe(file) {
  fileName = file.replace(/\.js$/, "");
  recipeBox.value = await fetchText(`recipes/${file}`);
  run();
}

async function start() {
  setTool("add");
  try {
    palette = JSON.parse(await fetchText("palette.json"));
    const recipes = JSON.parse(await fetchText("recipes/index.json"));
    for (const r of recipes) recipeList.add(new Option(r.name, r.file));
    recipeList.addEventListener("change", () => loadRecipe(recipeList.value).catch((e) => showError(e.message)));
    if (!restoreAutosave() && recipes.length) await loadRecipe(recipes[0].file);
  } catch (e) {
    showError(`${e.message}\n(If you opened index.html straight from disk, use the GitHub Pages address instead: the page needs to load its files over http.)`);
  }
}
start();
