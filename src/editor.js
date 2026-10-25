// Page wiring for phase 1: recipe box, Run, recipe dropdown, Download .vox, errors, 3D preview.
// (Editing tools and undo arrive in phase 3.)

import { runRecipe } from "./recipe_runner.js";
import { writeVox } from "./vox_io.js";
import { createView } from "./view.js";

const recipeBox = document.getElementById("recipe");
const recipeList = document.getElementById("recipe-list");
const runButton = document.getElementById("run");
const downloadButton = document.getElementById("download");
const statusBox = document.getElementById("status");
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
  view.show(model);
  downloadButton.disabled = false;
  const m = model.sizeMetres();
  statusBox.textContent =
    `${model.w} x ${model.h} x ${model.d} voxels, ${model.count()} filled\n` +
    `${m.x.toFixed(3)} x ${m.y.toFixed(3)} x ${m.z.toFixed(3)} m at ${model.scale} m per voxel\n` +
    `Godot import scale: ${model.scale}`;
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

runButton.addEventListener("click", run);
downloadButton.addEventListener("click", download);
// Ctrl+Enter inside the recipe box runs it.
recipeBox.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
});
start();
