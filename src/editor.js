// Page wiring: recipe box, Run, recipe dropdown, Open .vox (picker or drag-and-drop), view buttons,
// scale box, colour list, Download .vox, errors, 3D view.
// (Editing tools and undo arrive in phase 3.)

import { runRecipe } from "./recipe_runner.js";
import { Model } from "./model.js";
import { readVox, writeVox } from "./vox_io.js";
import { createView } from "./view.js";

const recipeBox = document.getElementById("recipe");
const recipeList = document.getElementById("recipe-list");
const runButton = document.getElementById("run");
const downloadButton = document.getElementById("download");
const sizeBox = document.getElementById("size");
const godotBox = document.getElementById("godot");
const scaleInput = document.getElementById("scale");
const colourList = document.getElementById("colour-list");
const fileInput = document.getElementById("file");
const errorBox = document.getElementById("error");

const view = createView(document.getElementById("view"));
let palette = null;
let model = null;       // the last successfully built model
let fileName = "model"; // download name, taken from the chosen recipe

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url} (${response.status}).`);
  return response.text();
}

function showError(message) {
  errorBox.textContent = message;
}

// Builds the model from the recipe text and shows it. On error the previous model stays on screen.
function run() {
  showError("");
  try {
    model = runRecipe(recipeBox.value, palette);
  } catch (e) {
    const where = e.line ? `Line ${e.line}: ` : "";
    showError(where + e.message);
    return;
  }
  show();
}

// Draws the current model and refreshes the status bar and colour list.
function show() {
  view.show(model);
  downloadButton.disabled = false;
  scaleInput.value = model.scale;
  updateStatus();

  // Colour list: only colours actually used, with voxel counts.
  const counts = new Map();
  model.forEachVoxel((x, y, z, i) => counts.set(i, (counts.get(i) || 0) + 1));
  colourList.replaceChildren();
  for (const [i, n] of [...counts].sort((a, b) => a[0] - b[0])) {
    const hex = model.palette[model.names[i - 1]];
    const name = model.names[i - 1].startsWith("colour_") ? hex : model.names[i - 1]; // .vox colours have no names
    const li = document.createElement("li");
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = hex;
    const label = document.createElement("span");
    label.textContent = name;
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = n;
    li.append(swatch, label, count);
    colourList.append(li);
  }
}

function updateStatus() {
  const m = model.sizeMetres();
  sizeBox.textContent =
    `${model.w} x ${model.h} x ${model.d} voxels, ${model.count()} filled | ` +
    `${m.x.toFixed(3)} x ${m.y.toFixed(3)} x ${m.z.toFixed(3)} m`;
  godotBox.textContent = `Godot import scale: ${model.scale}`;
}

// Scale box: changes the real size only (voxels stay the same), and is used when saving/importing.
scaleInput.addEventListener("change", () => {
  const value = parseFloat(scaleInput.value);
  if (!(value > 0) || !model) { if (model) scaleInput.value = model.scale; return; }
  model.scale = value;
  view.show(model);
  updateStatus();
});

// Opens a .vox file chosen with the button or dropped on the page.
async function openFile(file) {
  showError("");
  try {
    const data = readVox(await file.arrayBuffer());
    model = Model.fromVoxData(data, model ? model.scale : 0.025);
    fileName = file.name.replace(/\.vox$/i, "");
    show();
    if (data.modelCount > 1) showError(`This file has ${data.modelCount} models; only the first is shown.`);
  } catch (e) {
    showError(`Could not open ${file.name}: ${e.message}`);
  }
}

function download() {
  if (!model) return;
  const blob = new Blob([writeVox(model.toVoxData())], { type: "application/octet-stream" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${fileName}.vox`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function loadRecipe(file) {
  fileName = file.replace(/\.js$/, "");
  recipeBox.value = await fetchText(`recipes/${file}`);
  run();
}

async function start() {
  try {
    palette = JSON.parse(await fetchText("palette.json"));
    const recipes = JSON.parse(await fetchText("recipes/index.json"));
    for (const r of recipes) recipeList.add(new Option(r.name, r.file));
    recipeList.addEventListener("change", () => loadRecipe(recipeList.value).catch((e) => showError(e.message)));
    if (recipes.length) await loadRecipe(recipes[0].file);
  } catch (e) {
    showError(`${e.message}\n(If you opened index.html straight from disk, use the GitHub Pages address instead: the page needs to load its files over http.)`);
  }
}

document.getElementById("open").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) openFile(fileInput.files[0]);
  fileInput.value = ""; // so picking the same file again still fires
});
for (const button of document.querySelectorAll("[data-view]")) {
  button.addEventListener("click", () => view.setView(button.dataset.view));
}

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

runButton.addEventListener("click", run);
downloadButton.addEventListener("click", download);
// Ctrl+Enter inside the recipe box runs it.
recipeBox.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
});
start();
