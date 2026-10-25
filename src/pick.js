// Mouse picking against the voxel grid. No DOM, so it runs in the browser and in Node tests.
//
// Rays are in voxel units (metres divided by the model scale), Godot axes, with voxel (x,y,z) covering
// x..x+1, y..y+1, z..z+1. `maxY` is the slice limit: voxels above it count as empty (null = no limit).

// Walks the ray through the grid. Returns
//   { x, y, z }   the voxel hit (or, for a ground hit, the empty cell on the floor under the ray)
//   { nx, ny, nz } the face normal (unit vector pointing out of the face that was hit)
//   { ground }    true when no voxel was hit and the ray reached the floor (y = 0) instead
// or null if nothing was hit.
export function pickVoxel(model, origin, dir, maxY = null) {
  const top = maxY === null ? model.h - 1 : Math.min(maxY, model.h - 1);
  const size = [model.w, top + 1, model.d];
  const o = [origin.x, origin.y, origin.z];
  const d = [dir.x, dir.y, dir.z];

  // Clip the ray to the box 0..size (slab method) to find where it enters.
  let tMin = 0, tMax = Infinity, enterAxis = -1, enterSign = 0;
  for (let a = 0; a < 3; a++) {
    if (d[a] === 0) {
      if (o[a] < 0 || o[a] > size[a]) return null;
      continue;
    }
    let t1 = (0 - o[a]) / d[a], t2 = (size[a] - o[a]) / d[a];
    let sign = -1; // entering through the low face means the face normal points to -axis
    if (t1 > t2) { [t1, t2] = [t2, t1]; sign = 1; }
    if (t1 > tMin) { tMin = t1; enterAxis = a; enterSign = sign; }
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }

  const t0 = tMin + 1e-9;
  const cell = [0, 1, 2].map((a) => Math.min(size[a] - 1, Math.max(0, Math.floor(o[a] + d[a] * t0))));
  const step = d.map((v) => (v > 0 ? 1 : -1));
  const tNext = [0, 1, 2].map((a) => (d[a] === 0 ? Infinity : ((d[a] > 0 ? cell[a] + 1 : cell[a]) - o[a]) / d[a]));
  const tDelta = d.map((v) => (v === 0 ? Infinity : Math.abs(1 / v)));
  const normal = [0, 0, 0];
  if (enterAxis >= 0) normal[enterAxis] = enterSign; // face we entered the box through (0 if the origin is inside)

  for (;;) {
    if (model.get(cell[0], cell[1], cell[2])) {
      return { x: cell[0], y: cell[1], z: cell[2], nx: normal[0], ny: normal[1], nz: normal[2], ground: false };
    }
    // Step to the neighbouring cell the ray reaches first.
    const a = tNext[0] < tNext[1] ? (tNext[0] < tNext[2] ? 0 : 2) : (tNext[1] < tNext[2] ? 1 : 2);
    if (tNext[a] > tMax) break;
    cell[a] += step[a];
    tNext[a] += tDelta[a];
    normal.fill(0);
    normal[a] = -step[a];
    if (cell[a] < 0 || cell[a] >= size[a]) break;
  }

  // Nothing solid: if the ray goes down through the floor inside the footprint, hit the floor.
  if (d[1] < 0 && o[1] > 0) {
    const t = -o[1] / d[1];
    const x = Math.floor(o[0] + d[0] * t), z = Math.floor(o[2] + d[2] * t);
    if (x >= 0 && x < model.w && z >= 0 && z < model.d) return { x, y: 0, z, nx: 0, ny: 1, nz: 0, ground: true };
  }
  return null;
}

// The empty cell next to the face that pickVoxel returned: where Add puts a voxel.
// (For a ground hit the cell is the floor cell itself.)
export function targetCell(hit) {
  return hit.ground ? { x: hit.x, y: hit.y, z: hit.z } : { x: hit.x + hit.nx, y: hit.y + hit.ny, z: hit.z + hit.nz };
}

// For Box fill: where a ray crosses the plane of the face being drawn on. `axis` is 0/1/2 (x/y/z) and
// `plane` the plane's coordinate in voxel units. Returns the cell [x,y,z] on that plane (its `axis`
// coordinate is left at the layer index given), clamped into the model, or null if the ray is parallel.
// With clamp = false it returns null instead when the crossing is outside the model.
export function planeCell(model, origin, dir, axis, plane, layer, clamp = true) {
  const o = [origin.x, origin.y, origin.z], d = [dir.x, dir.y, dir.z];
  if (Math.abs(d[axis]) < 1e-9) return null;
  const t = (plane - o[axis]) / d[axis];
  if (t < 0) return null;
  const size = [model.w, model.h, model.d];
  const cell = [0, 1, 2].map((a) => (a === axis ? layer : Math.floor(o[a] + d[a] * t)));
  for (let a = 0; a < 3; a++) {
    if (a === axis) continue;
    if (!clamp && (cell[a] < 0 || cell[a] >= size[a])) return null;
    cell[a] = Math.min(size[a] - 1, Math.max(0, cell[a]));
  }
  return cell;
}
