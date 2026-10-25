# VoxTool

A small web tool for making voxel props for **Drop Not Allowed**. Write a recipe (or pick a built-in one), preview it in 3D, and download a `.vox` file that opens in MagicaVoxel. Everything runs in the browser; nothing to install. See `SPEC.md` for the full plan (this is **Phase 1**).

## Using it

1. Open the page (see below).
2. **Pick** a recipe from the dropdown, or **paste** your own into the text box.
3. Press **Run** (or Ctrl+Enter in the box). The model appears on the right; drag to orbit, scroll to zoom. Mistakes are shown under the box with a line number.
4. **Edit by hand** and Run again as often as you like.
5. Press **Download .vox**, then open it in MagicaVoxel.

### Recipe helpers

Colours are names from `palette.json`. Axes are Godot's: x = right, y = up, z = toward the viewer.

```js
model(w, h, d, scale)                          // start; size in voxels (max 256), scale = metres per voxel (default 0.025)
box(x, y, z, w, h, d, "colour")
hollow_box(x, y, z, w, h, d, "colour", wall)   // wall thickness, default 1
cylinder(x, y, z, radius, length, "colour", "y")  // x,y,z = lowest corner; axis "x", "y" or "z"
line(x1, y1, z1, x2, y2, z2, "colour")
remove(x, y, z, w, h, d)                       // cut a hole
paint(x, y, z, w, h, d, "colour")              // recolour existing voxels only
mirror_x()                                     // copy left half onto the right
```

Loops and variables are normal JavaScript. See `recipes/clock_in.js` for an example.

To add a built-in recipe, put a `.js` file in `recipes/` and add its name to `recipes/index.json`.
To add a colour, edit `palette.json` (add new colours at the **end** so existing palette indices don't move).

## Turning on GitHub Pages

1. Push to `main`.
2. On GitHub: **Settings > Pages > Build and deployment > Source: Deploy from a branch**.
3. Branch: **`main`**, folder: **`/ (root)`**, then Save.
4. After a minute the site is at `https://<your-github-name>.github.io/voxtool/`.

There is no build step; the files in the repo are served as they are.

## Files

- `src/vox_io.js` read/write `.vox` (converts between Godot Y-up and MagicaVoxel Z-up)
- `src/model.js`, `src/shapes.js`, `src/recipe_runner.js` the model and recipe helpers (no DOM)
- `src/view.js`, `src/editor.js` the page
- `vendor/` three.js and OrbitControls, copied in (pinned version, see `vendor/README.md`)
- `tests/` automated tests, run by Claude Code with `node --test` (you never need Node)
