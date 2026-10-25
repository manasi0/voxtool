// Wall-mounted staff clock-in machine, about 0.25 x 0.35 x 0.12 m at scale 0.025.
// Axes: x = right, y = up, z = toward the viewer (front). The back (z = 0) goes against the wall.
model(10, 14, 5, 0.025);

// Wall bracket on the back: two vertical bars
box(2, 3, 0, 2, 8, 1, "frame");
box(6, 3, 0, 2, 8, 1, "frame");

// Body
box(0, 0, 1, 10, 14, 3, "roof_metal");

// Front face (z = 4)
box(0, 0, 4, 10, 14, 1, "roof_metal");
box(1, 6, 4, 8, 6, 1, "frame");        // screen border, 1 voxel
box(2, 7, 4, 6, 4, 1, "glass_dark");   // screen
box(3, 2, 4, 4, 1, 1, "sign");         // card slot
box(8, 12, 4, 1, 1, 1, "status_green"); // status light
