// Shared by the tests: loads palette.json and builds models through the recipe runner.
import { readFileSync } from "node:fs";
import { runRecipe } from "../src/recipe_runner.js";

export const palette = JSON.parse(readFileSync(new URL("../palette.json", import.meta.url), "utf8"));
export const build = (recipe) => runRecipe(recipe, palette);

// All voxels as "x,y,z=colourName" strings, sorted, for easy comparison.
export function dump(model) {
  const out = [];
  model.forEachVoxel((x, y, z, i) => out.push(`${x},${y},${z}=${model.names[i - 1]}`));
  return out.sort();
}
