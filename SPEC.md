# VoxTool: spec

A small **web** tool for making voxel props for **Drop Not Allowed** (Godot 4.7).
Everything runs in the browser: write a recipe or edit by hand, preview in 3D, download a `.vox`.
Output must open in **MagicaVoxel**, which is where props are exported to OBJ for Godot.

This repo is separate from the game. Nothing here is ever copied into the game project.

## Ground rules

- **Runs entirely in the browser.** The user installs nothing on their PC. No Python, no Node, no `.bat` files for the user.
- **Hosted on GitHub Pages**, served straight from the `main` branch root. **No build step**: plain HTML, CSS and JavaScript ES modules.
- three.js and OrbitControls are **vendored** into `vendor/` (copied files, pinned version), not loaded from a CDN, so the page keeps working if a CDN changes.
- No backend, no online APIs, no AI calls from the page.
- Node may be used **only by Claude Code** for automated tests (`node --test`), never needed by the user.
- Keep code simple and commented; the user reads and edits recipes by hand.
- Work in phases. Finish and test one phase, commit and push, then stop and summarise.

## Folder layout

```
voxtool/
├─ SPEC.md
├─ README.md
├─ index.html              the app
├─ style.css
├─ palette.json            shared palette
├─ src/
│  ├─ vox_io.js            .vox read/write (no DOM, testable in Node)
│  ├─ model.js             voxel model: size, scale, set/get/clear
│  ├─ shapes.js            helper functions used by recipes
│  ├─ recipe_runner.js     runs recipe text against the helpers
│  ├─ view.js              three.js scene, camera, rendering
│  └─ editor.js            tools, undo/redo, UI wiring
├─ recipes/
│  ├─ index.json           list of built-in recipes (name, file)
│  └─ clock_in.js
├─ vendor/                 three.module.js, OrbitControls.js
└─ tests/                  node --test files for vox_io, model, shapes, recipe_runner
```

`src/vox_io.js`, `model.js`, `shapes.js` and `recipe_runner.js` must not touch the DOM, so they run in both the browser and Node tests.

## Palette (`palette.json`)

Named colours, all Diffuse in MagicaVoxel. Names are what recipes and the editor use.
Index order in the .vox palette follows this list, starting at index 1.

| name | hex |
|---|---|
| wall | #B8B6B0 |
| wall_shade | #9E9C96 |
| wood | #6A5442 |
| wood_shade | #58463A |
| roof_metal | #3A3F42 |
| roof_seam | #30353A |
| flat_roof | #4A4C4E |
| flat_roof_shade | #3E4042 |
| vent | #5A5D60 |
| frame | #8C8A86 |
| glass_dark | #1E2329 |
| glass_lit | #C9B98A |
| glass_lit_shade | #A8986E |
| staff_door | #3F5A6E |
| staff_door_shade | #344A5A |
| door_dark | #2E3034 |
| concrete | #5A5752 |
| concrete_shade | #4A4743 |
| plinth | #4F4D49 |
| pipe | #5F6366 |
| safety_yellow | #A88F2A |
| safety_yellow_worn | #8A7624 |
| bay_door | #4E5257 |
| bay_door_slat | #43474C |
| rubber | #1E1E1E |
| asphalt | #2F2F30 |
| asphalt_shade | #262627 |
| rust | #6E5040 |
| sign | #D8D6CF |
| sign_text | #2A2A2A |
| lamp | #E8E6DF |
| floor_concrete | #4A4844 |
| drone_white | #E6E6E2 |
| drone_white_shade | #C8C8C4 |
| status_green | #3E8A4A |

Rule: a shade is one step darker of the same hue, never a different hue.
Users add colours by editing this file on GitHub; nothing else should need to change.

## Coordinates and scale

- Recipes and the editor use **Godot axes**: x = right, y = up, z = toward the viewer (front).
- `vox_io.js` converts to MagicaVoxel's Z-up on write and back on read. Test this both ways.
- Each model has a size (max 256 per axis) and a **scale** in metres per voxel (default `0.025`).
- The status bar shows real size in metres and the uniform scale to use on the imported mesh in Godot.

## Recipe format

A recipe is plain JavaScript text that calls helpers. Example:

```js
model(10, 14, 5, 0.025);             // size x, y, z and metres per voxel
box(0, 0, 0, 10, 14, 4, "roof_metal");
box(1, 6, 4, 8, 6, 1, "frame");
box(2, 7, 4, 6, 4, 1, "glass_dark");
box(3, 2, 4, 4, 1, 1, "sign");
box(8, 12, 4, 1, 1, 1, "status_green");
```

Helpers (colours are palette names):
- `model(w, h, d, scale)` starts a new model
- `box(x, y, z, w, h, d, colour)`
- `hollow_box(x, y, z, w, h, d, colour, wall = 1)`
- `cylinder(x, y, z, radius, length, colour, axis = "y")`
- `line(x1, y1, z1, x2, y2, z2, colour)`
- `remove(x, y, z, w, h, d)` to cut holes
- `paint(x, y, z, w, h, d, colour)` recolours only existing voxels
- `mirror_x()` mirrors the left half onto the right
- Loops and variables are allowed (it's JavaScript).

Errors (unknown colour, out of bounds, syntax) are shown under the recipe box in plain words with the line number.
The recipe runner exposes only these helpers to the recipe (run it with `new Function` and pass the helpers in; no access to the page).

## Phase 1: core + recipe page

- `palette.json`, `src/vox_io.js`, `src/model.js`, `src/shapes.js`, `src/recipe_runner.js`.
- `vox_io.js`: write MagicaVoxel `.vox` (version 150 or 200): `MAIN`, `SIZE`, `XYZI`, `RGBA`. Palette index 0 = empty; fill unused slots with a neutral grey. Read `.vox` back too (including files saved by MagicaVoxel, which may contain extra chunks to skip).
- `index.html`, minimal for now: a recipe text box, a **Run** button, a recipe dropdown filled from `recipes/index.json`, a **Download .vox** button, an error area, and a simple three.js preview (orbit, grid).
- `recipes/clock_in.js`: wall-mounted staff clock-in machine, about 0.25 × 0.35 × 0.12 m at scale 0.025. Body `roof_metal`, front screen `glass_dark` with a 1-voxel `frame` border, card slot `sign`, small `status_green` light, wall bracket on the back.
- Tests (`node --test`): write → read round trip (same voxels, colours, axes); every helper; unknown colour error; out-of-bounds error; recipe syntax error reported with a line number.
- README: how to enable GitHub Pages (Settings > Pages > Deploy from a branch > `main` / root) and the page URL format.

## Phase 2: viewer

- Open a `.vox` by file picker or drag-and-drop onto the page.
- Render with one `InstancedMesh` per colour (or a greedy mesh), flat `MeshLambertMaterial`, hemisphere + directional light, dark background close to the game's night look.
- Orbit camera, reset view, front / side / top view buttons.
- Grid floor and a thin bounding box.
- Status bar: size in voxels and metres, scale input (default 0.025), Godot import scale.
- Layout works on a laptop screen: recipe panel left, 3D view centre, palette right.

## Phase 3: editor

- New model (enter size and scale).
- Tools: **Add**, **Erase**, **Paint**, **Eyedropper**, **Box fill** (drag a rectangle on the current face, extrude by a number field).
- Palette sidebar from `palette.json`, name + swatch, current colour highlighted.
- Mirror X toggle.
- Slice view: slider hides everything above a chosen y, to edit inner layers.
- Undo / redo (Ctrl+Z / Ctrl+Y), at least 100 steps. Running a recipe is one undo step.
- Hover highlight shows which voxel or face will be edited.
- Save `.vox` (download), palette indices matching `palette.json`.
- **Autosave** the current model and recipe text to `localStorage` (wrap in try/catch; the page must work without it). A "New" button clears it.
- Help panel (?) listing shortcuts and recipe helpers.

## Phase 4: nice to have (only if asked)

- Export a PNG preview.
- Copy current model as a recipe (list of boxes) so hand edits can be saved as text.
- Several models open as tabs.

## Done means

- Tests pass in Node.
- The GitHub Pages URL loads the app with no console errors.
- A `.vox` downloaded from the app opens correctly in MagicaVoxel, and a `.vox` saved by MagicaVoxel opens correctly in the app.
- README explains: pick or paste a recipe, Run, edit by hand, Download .vox.
