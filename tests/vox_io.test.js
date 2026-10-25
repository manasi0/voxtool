import test from "node:test";
import assert from "node:assert/strict";
import { writeVox, readVox } from "../src/vox_io.js";
import { build } from "./helpers.js";

const sortV = (v) => [...v].sort((a, b) => a.x - b.x || a.y - b.y || a.z - b.z);

test("file layout: header, MAIN, SIZE, XYZI, RGBA", () => {
  const bytes = writeVox(build('model(3,4,5); box(0,0,0,1,1,1,"wall")').toVoxData());
  const dv = new DataView(bytes.buffer);
  const tag = (at) => String.fromCharCode(...bytes.slice(at, at + 4));
  assert.equal(tag(0), "VOX ");
  assert.equal(dv.getUint32(4, true), 150);
  assert.equal(tag(8), "MAIN");
  assert.equal(dv.getUint32(12, true), 0);                      // MAIN has no content
  assert.equal(dv.getUint32(16, true), bytes.length - 20);      // children size covers the rest
  assert.equal(tag(20), "SIZE");
  // MagicaVoxel size is x, y (depth), z (height)
  assert.deepEqual([dv.getUint32(32, true), dv.getUint32(36, true), dv.getUint32(40, true)], [3, 5, 4]);
  assert.equal(tag(44), "XYZI");
  assert.equal(tag(44 + 12 + 8), "RGBA");
});

test("axes: Godot y (up) becomes MagicaVoxel z, Godot z (front) becomes MagicaVoxel -y", () => {
  // w=2 h=3 d=4, voxel at x=1 y=2 z=3
  const bytes = writeVox({ w: 2, h: 3, d: 4, voxels: [{ x: 1, y: 2, z: 3, i: 5 }], palette: [] });
  // XYZI content starts after header(8) MAIN(12) SIZE(24) XYZI header(12) + count(4)
  const at = 8 + 12 + 24 + 12 + 4;
  assert.deepEqual([...bytes.slice(at, at + 4)], [1, 4 - 1 - 3, 2, 5]); // x, y, z, index
});

test("write -> read round trip keeps size, voxels, colours and axes", () => {
  const model = build(`
    model(7, 9, 5, 0.025);
    box(0, 0, 0, 7, 2, 5, "concrete");
    box(3, 2, 1, 1, 6, 1, "status_green");   // asymmetric on every axis
    box(6, 8, 4, 1, 1, 1, "sign");
    cylinder(1, 2, 1, 1, 3, "pipe", "z");
  `);
  const data = model.toVoxData();
  const back = readVox(writeVox(data));
  assert.deepEqual([back.w, back.h, back.d], [7, 9, 5]);
  assert.equal(back.voxels.length, model.count());
  assert.deepEqual(sortV(back.voxels), sortV(data.voxels));
  assert.equal(back.version, 150);
  assert.equal(back.modelCount, 1);
  // colours: palette index -> rgba matches palette.json
  assert.deepEqual(back.palette[model.colourIndex("status_green")], [0x3e, 0x8a, 0x4a, 255]);
  assert.deepEqual(back.palette[model.colourIndex("sign")], [0xd8, 0xd6, 0xcf, 255]);
});

test("unused palette slots are neutral grey and index 0 is not used", () => {
  const back = readVox(writeVox(build('model(1,1,1); box(0,0,0,1,1,1,"wall")').toVoxData()));
  assert.deepEqual(back.palette[36], [128, 128, 128, 255]);
  assert.deepEqual(back.palette[255], [128, 128, 128, 255]);
  assert.equal(back.voxels[0].i, 1);
});

test("max size 256 per axis round trips", () => {
  const data = { w: 256, h: 256, d: 256, voxels: [{ x: 255, y: 255, z: 255, i: 1 }, { x: 0, y: 0, z: 0, i: 2 }], palette: [] };
  const back = readVox(writeVox(data));
  assert.deepEqual(sortV(back.voxels), sortV(data.voxels));
});

test("an empty model round trips", () => {
  const back = readVox(writeVox(build("model(2,2,2)").toVoxData()));
  assert.equal(back.voxels.length, 0);
  assert.deepEqual([back.w, back.h, back.d], [2, 2, 2]);
});

test("reader skips extra chunks like a MagicaVoxel-saved file has", () => {
  // Build a file the way MagicaVoxel 0.99 does: PACK first, then SIZE/XYZI, then scene graph + materials after RGBA.
  const parts = [];
  const u32 = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return [...b]; };
  const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
  const chunk = (name, content) => [...ascii(name), ...u32(content.length), ...u32(0), ...content];
  const rgba = []; for (let k = 0; k < 256; k++) rgba.push(k, 2 * (k % 100), 3, 255);
  parts.push(chunk("PACK", u32(1)));
  parts.push(chunk("SIZE", [...u32(4), ...u32(6), ...u32(8)]));                 // x=4 y=6 z=8
  parts.push(chunk("XYZI", [...u32(2), 1, 2, 3, 9, 0, 5, 7, 255]));            // (1,2,3)=9  (0,5,7)=255
  parts.push(chunk("RGBA", rgba));
  parts.push(chunk("nTRN", [1, 2, 3, 4, 5, 6, 7, 8]));
  parts.push(chunk("nSHP", [9, 9, 9]));
  parts.push(chunk("MATL", [1, 1, 1, 1]));
  parts.push(chunk("LAYR", [0, 0]));
  parts.push(chunk("rOBJ", [0, 0, 0]));
  const body = parts.flat();
  const file = new Uint8Array([...ascii("VOX "), ...u32(200), ...ascii("MAIN"), ...u32(0), ...u32(body.length), ...body]);

  const r = readVox(file);
  assert.deepEqual([r.w, r.h, r.d], [4, 8, 6]);           // godot w=mv x, h=mv z, d=mv y
  assert.equal(r.version, 200);
  assert.deepEqual(sortV(r.voxels), sortV([
    { x: 1, y: 3, z: 6 - 1 - 2, i: 9 },
    { x: 0, y: 7, z: 6 - 1 - 5, i: 255 },
  ]));
  assert.deepEqual(r.palette[1], [0, 0, 3, 255]);          // file RGBA entry 0 is palette index 1
  assert.deepEqual(r.palette[9], [8, 16, 3, 255]);
});

test("only the first model is read when a file holds several", () => {
  const model = build('model(2,2,2); box(0,0,0,1,1,1,"wall")');
  const one = writeVox(model.toVoxData());
  // Splice a second SIZE+XYZI pair in before RGBA.
  const second = writeVox({ w: 3, h: 3, d: 3, voxels: [{ x: 2, y: 2, z: 2, i: 1 }], palette: [] });
  const sizeXyzi = second.slice(20, 20 + 24 + 12 + 4 + 4);
  const rgbaAt = one.length - (12 + 1024);
  const merged = new Uint8Array(one.length + sizeXyzi.length);
  merged.set(one.slice(0, rgbaAt), 0);
  merged.set(sizeXyzi, rgbaAt);
  merged.set(one.slice(rgbaAt), rgbaAt + sizeXyzi.length);
  const r = readVox(merged);
  assert.equal(r.modelCount, 2);
  assert.deepEqual([r.w, r.h, r.d], [2, 2, 2]);
  assert.equal(r.voxels.length, 1);
});

test("bad input gives readable errors", () => {
  assert.throws(() => readVox(new Uint8Array(30)), /not a .vox file/);
  const good = writeVox(build('model(2,2,2); box(0,0,0,2,2,2,"wall")').toVoxData());
  assert.throws(() => readVox(good.slice(0, 40)), /cut off/);
  assert.throws(() => writeVox({ w: 2, h: 2, d: 2, voxels: [{ x: 2, y: 0, z: 0, i: 1 }], palette: [] }), /outside/);
  assert.throws(() => writeVox({ w: 2, h: 2, d: 2, voxels: [{ x: 0, y: 0, z: 0, i: 0 }], palette: [] }), /index/);
});
