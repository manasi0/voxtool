// Turns the current model into a small JSON-able object (for localStorage) and back. No DOM.
// The voxels travel as a .vox file in base64, so there is only one voxel format to get right.

import { Model } from "./model.js";
import { readVox, writeVox } from "./vox_io.js";

export function encodeState(model, recipe) {
  const bytes = writeVox(model.toVoxData());
  let binary = "";
  for (let k = 0; k < bytes.length; k += 0x8000) binary += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
  return {
    recipe,
    scale: model.scale,
    // true when the colours are the names from palette.json (false for a model opened from a .vox file)
    named: !model.names[0].startsWith("colour_"),
    vox: btoa(binary),
  };
}

// Returns { model, recipe }. `palette` is palette.json, used to restore colour names.
export function decodeState(state, palette) {
  const binary = atob(state.vox);
  const bytes = new Uint8Array(binary.length);
  for (let k = 0; k < binary.length; k++) bytes[k] = binary.charCodeAt(k);
  const data = readVox(bytes);
  const model = Model.fromVoxData(data, state.scale, state.named ? palette : null);
  return { model, recipe: state.recipe || "" };
}
