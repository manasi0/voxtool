# VoxTool: spec

A small offline tool for making voxel props for **Drop Not Allowed** (Godot 4.7).
Two parts: a Python generator (recipe file → `.vox`) and a three.js editor (open, edit, save `.vox`).
Output must open in **MagicaVoxel**, which is where props are exported to OBJ for Godot.

This repo is separate from the game. Nothing here is ever copied into the game project.

## Ground rules

- Works fully offline after the first `npm install`. No CDNs, no online APIs, no AI calls.
- The user does not use the command line. Every action has a double-click `.bat` launcher (Windows).
- Python 3, standard library only (no pip packages). Use `unittest` for tests.
- Editor: Vite + vanilla JavaScript + three.js (npm). No framework.
- Keep code simple and commented; the user reads and edits recipes by hand.
- Work in phases. Finish and test one phase, then stop and summarise before the next.

## Folder layout

```
voxtool/
├─ SPEC.md
├─ palette.json            shared palette (generator + editor)
├─ generator/
│  ├─ voxgen.py            CLI: python voxgen.py recipes/clock_in.py
│  ├─ vox_io.py            .vox read/write
│  ├─ shapes.py            helper functions used by recipes
│  └─ tests/
├─ recipes/                one .py file per prop
├─ output/                 generated .vox files
├─ editor/                 Vite project
├─ make_vox.bat            drag a recipe onto it → .vox in output/
└─ start_editor.bat        starts the editor and opens the browser
```

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

Rule: a shade is one step darker of the same hue, never a different hue.
Users add colours by editing this file; nothing else should need to change.

## Coordinates and scale

- Recipes and the editor use **Godot axes**: x = right, y = up, z = toward the viewer (front).
- `vox_io.py` converts to MagicaVoxel's Z-up on write and back on read. Test this both ways.
- Each recipe sets `SIZE = (x, y, z)` (max 256 per axis) and `SCALE` (metres per voxel, e.g. `0.025`).
- After writing, `voxgen.py` prints the model's real size in metres and the uniform scale to use on the imported mesh in Godot.

## Phase 1: generator

`vox_io.py`
- Write MagicaVoxel `.vox` (version 150 or 200): `MAIN`, `SIZE`, `XYZI`, `RGBA` chunks.
- Palette index 0 = empty. Fill unused palette slots with a neutral grey.
- Read `.vox` back (used by tests and by `voxgen.py --info file.vox`).

`shapes.py`: a model object plus helpers. Colours are palette names.
- `box(x, y, z, w, h, d, colour)`
- `hollow_box(x, y, z, w, h, d, colour, wall=1)`
- `cylinder(x, y, z, radius, length, colour, axis="y")`
- `line(x1, y1, z1, x2, y2, z2, colour)`
- `remove(x, y, z, w, h, d)` to cut holes
- `paint(x, y, z, w, h, d, colour)` recolours only existing voxels
- `mirror_x()` mirrors the left half onto the right
- Clear errors for an unknown colour name or out-of-bounds shapes (say which line and why).

`voxgen.py`
- `python voxgen.py recipes/<name>.py` → `output/<name>.vox`
- `--info file.vox` prints size, voxel count and colours used.

`make_vox.bat`: drag a recipe onto it; it runs voxgen and keeps the window open to show the result or error.

Example recipe `recipes/clock_in.py` (wall-mounted staff clock-in machine, about 0.25 × 0.35 × 0.12 m):
body `roof_metal`, a front screen `glass_dark` with a 1-voxel `frame` border, a card slot `sign`, a small green status light (add `status_green` #3E8A4A to the palette), wall bracket on the back.

Tests: write → read round trip (same voxels, same colours, axes correct); every helper; bad colour name error; out-of-bounds error.
**Manual check for the user:** open `output/clock_in.vox` in MagicaVoxel; it must look upright, front facing the default camera, correct colours.

## Phase 2: viewer

- `start_editor.bat` runs the Vite dev server and opens the browser.
- Open a `.vox` by file picker or drag-and-drop.
- Render with one `InstancedMesh` per colour (or a merged greedy mesh), flat `MeshLambertMaterial`, simple hemisphere + directional light. Dark background close to the game's night look.
- Orbit camera (OrbitControls), reset view button, front / side / top view buttons.
- Grid floor and a thin bounding box. Status bar: size in voxels and in metres (scale input box, default 0.025).

## Phase 3: editor

- New model (enter size and scale).
- Tools: **Add**, **Erase**, **Paint**, **Eyedropper**, **Box fill** (drag a rectangle on the current face, extrude by a number field).
- Palette sidebar from `palette.json`, showing name + swatch; current colour highlighted.
- Mirror X toggle (edits apply to both sides).
- Slice view: slider to hide everything above a chosen y, so inner layers can be edited.
- Undo / redo (Ctrl+Z / Ctrl+Y), at least 100 steps.
- Save `.vox` (download), keeping palette indices the same as `palette.json`.
- Keyboard shortcuts shown in a small help panel (?).
- Hover highlight shows which voxel or face will be edited.

## Phase 4: nice to have (only if asked)

- Load a recipe's output and show which recipe made it.
- Export a PNG preview.
- Remember the last opened file and camera.

## Done means

- Tests pass.
- `make_vox.bat` and `start_editor.bat` work by double-click on Windows.
- A `.vox` saved by the editor opens correctly in MagicaVoxel, and a `.vox` from MagicaVoxel opens correctly in the editor.
- Short `README.md`: how to make a recipe, run it, open and edit in the editor.
