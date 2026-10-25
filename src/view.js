// three.js preview: scene, camera, orbit controls, grid, and one InstancedMesh per colour.
// Uses Godot axes directly (x right, y up, z toward the viewer), in metres.

import * as THREE from "three";
import { OrbitControls } from "../vendor/OrbitControls.js";

export function createView(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14171c);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x303038, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(2, 4, 3);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  // Left button belongs to the edit tools; right button orbits, middle pans. The Orbit tool gives the left button back.
  controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
  renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
  function setLeftOrbit(on) {
    controls.mouseButtons.LEFT = on ? THREE.MOUSE.ROTATE : null;
  }

  // Hover outline and box-fill preview. They live outside `content` so redrawing the model keeps them.
  const hoverBox = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    new THREE.LineBasicMaterial({ color: 0xffd34d, depthTest: false })
  );
  hoverBox.renderOrder = 2;
  hoverBox.visible = false;
  scene.add(hoverBox);
  const previewBox = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.35, depthWrite: false })
  );
  previewBox.visible = false;
  scene.add(previewBox);

  // Puts a unit box over the cells min..max (inclusive, voxel coordinates), or hides it when min is null.
  function placeBox(box, min, max, scale) {
    box.visible = !!min;
    if (!min) return;
    box.scale.set((max[0] - min[0] + 1) * scale * 1.01, (max[1] - min[1] + 1) * scale * 1.01, (max[2] - min[2] + 1) * scale * 1.01);
    box.position.set((min[0] + max[0] + 1) / 2 * scale, (min[1] + max[1] + 1) / 2 * scale, (min[2] + max[2] + 1) / 2 * scale);
  }

  // Ray under a mouse position, in voxel units (metres divided by scale), for src/pick.js.
  const raycaster = new THREE.Raycaster();
  function ray(clientX, clientY, scale) {
    const r = renderer.domElement.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), camera);
    const o = raycaster.ray.origin, d = raycaster.ray.direction;
    return { origin: { x: o.x / scale, y: o.y / scale, z: o.z / scale }, dir: { x: d.x, y: d.y, z: d.z } };
  }

  let content = null; // everything belonging to the current model, replaced on each show()

  function resize() {
    const { clientWidth: w, clientHeight: h } = container;
    renderer.setSize(w, h);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  function clearContent() {
    if (!content) return;
    scene.remove(content);
    content.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    content = null;
  }

  // Draws a Model (see src/model.js). maxY hides every voxel above that layer (slice view; null = show all).
  // The camera only jumps back to the default view when `reset` is true (a new model), not after each edit.
  function show(model, { maxY = null, reset = false } = {}) {
    clearContent();
    const at = (x, y, z) => (maxY !== null && y > maxY ? 0 : model.get(x, y, z));
    content = new THREE.Group();
    const s = model.scale;
    const width = model.w * s, height = model.h * s, depth = model.d * s;

    // Group voxels by colour, then make one InstancedMesh for each colour.
    const byColour = new Map();
    model.forEachVoxel((x, y, z, i) => {
      if (maxY !== null && y > maxY) return;
      // Skip voxels buried inside the model: all six neighbours filled means no face can be seen.
      if (at(x - 1, y, z) && at(x + 1, y, z) && at(x, y - 1, z) &&
          at(x, y + 1, z) && at(x, y, z - 1) && at(x, y, z + 1)) return;
      if (!byColour.has(i)) byColour.set(i, []);
      byColour.get(i).push(x, y, z);
    });
    const geometry = new THREE.BoxGeometry(s, s, s);
    const matrix = new THREE.Matrix4();
    for (const [i, coords] of byColour) {
      const material = new THREE.MeshLambertMaterial({ color: new THREE.Color(Object.values(model.palette)[i - 1]) });
      const mesh = new THREE.InstancedMesh(geometry, material, coords.length / 3);
      for (let k = 0; k < coords.length; k += 3) {
        matrix.setPosition((coords[k] + 0.5) * s, (coords[k + 1] + 0.5) * s, (coords[k + 2] + 0.5) * s);
        mesh.setMatrixAt(k / 3, matrix);
      }
      content.add(mesh);
    }

    // Grid on the floor (y = 0), a little larger than the model, plus a thin bounding box.
    const gridSize = Math.max(width, depth) * 2 + 0.2;
    const grid = new THREE.GridHelper(gridSize, Math.round(gridSize / (s * 4)), 0x555a64, 0x2a2e36);
    grid.position.set(width / 2, 0, depth / 2);
    content.add(grid);
    const box = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(width, height, depth)),
      new THREE.LineBasicMaterial({ color: 0x6a7080 })
    );
    box.position.set(width / 2, height / 2, depth / 2);
    content.add(box);
    scene.add(content);

    if (reset) {
      centre.set(width / 2, height / 2, depth / 2);
      distance = Math.max(width, height, depth) * 2.4 + 0.1;
      setView("reset");
    }
  }

  // Aim the camera at the model's centre from a named direction (Godot axes: front = +z, side = +x, top = +y).
  const directions = {
    reset: [0.7, 0.5, 1],
    front: [0, 0, 1],
    side: [1, 0, 0],
    top: [0, 1, 0.0001], // tiny z offset: looking straight down has no defined "up" otherwise
  };
  const centre = new THREE.Vector3();
  let distance = 1;
  function setView(name) {
    controls.target.copy(centre);
    camera.position.copy(centre).add(new THREE.Vector3(...directions[name]).normalize().multiplyScalar(distance));
    controls.update();
  }

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });

  return {
    show, setView, setLeftOrbit, ray,
    canvas: renderer.domElement,
    setHover: (min, max, scale) => placeBox(hoverBox, min, max, scale),
    setPreview: (min, max, scale) => placeBox(previewBox, min, max, scale),
  };
}
