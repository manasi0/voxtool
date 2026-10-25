# vendor/

Copied unmodified from the npm package `three@0.170.0` (MIT licence, see `LICENSE-three`):

- `three.module.js`  from `build/three.module.js`
- `OrbitControls.js` from `examples/jsm/controls/OrbitControls.js`

`OrbitControls.js` imports the bare name `"three"`; `index.html` has an import map that points that name at `./vendor/three.module.js`.
To upgrade, replace both files from the same three.js version and update this note.
