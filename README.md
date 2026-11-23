# Interactive Engineering Graphics & Projection Studio

Buildless HTML, CSS and modular JavaScript. Three.js 0.170.0 and OrbitControls load from jsDelivr. No npm installation or build is required.

## Run

From this folder run `node server.js`, then open http://127.0.0.1:4173. Alternatively serve `dist/` using any static HTTP server. Opening `index.html` directly using `file://` is not supported by browser ES module security rules. Internet access is required for the 3D CDN imports; 2D drafting and exports operate independently.

Run `npm test` for the mathematical regression suite.

## Capabilities

- Seven convex solids, editable dimensions, true axis inclinations, axial rotation, orbit/pan/zoom and camera presets.
- First-angle FV/TV and selectable right/left side view; projectors, depth-transfer miter, hidden edges, centerlines, vertex labels and projected overall dimensions.
- Ellipse, parabola and one hyperbola branch using focus/directrix eccentricity; cycloid and circle involute; animated construction, discrete steps, selectable point, tangent and normal.
- A3/A4 landscape SVG and 300 dpi PNG exports with physical dimensions, border, automatic scale, title, student, date and projection symbol.
- Browser-local parameter persistence, keyboard-accessible controls, mobile layout and reduced dependency failure mode.

## Geometry conventions

X is the XY reference line, Y is height above HP, Z is depth in front of VP. The unit axis is `(sqrt(1-sin²α-sin²β), sin α, sin β)`. True inclinations satisfy α+β≤90° in the positive octant. The most recently changed angle is honored and the other is reduced when necessary. Roll turns the cross section about that axis. A rigid translation leaves a 15 mm clearance from HP and VP. Orientation is not a physical resting-on-an-edge construction.

FV maps to `(x,-y)`, TV to `(x,z)` below XY. Right-side view looks along -X, maps to `(-z,-y)` and sits to the left of FV; left-side view maps to `(z,-y)` to its right. Face normals determine edge visibility for these convex solids. Coincident labels are combined. Circular profiles use 180 segments (2° sampling); smooth outlines are tessellated approximations, not an analytic CAD kernel. The 3D model uses the same vertices and faces as drafting.

Dimensions are projected bounding extents in model millimetres, not true lengths of inclined edges. Sheet scale is uniform, calculated from the viewport-to-paper conversion and printed numerically in the title block. Print SVG at 100% to preserve scale. The small first-angle symbol is omitted for curve-only sheets.

Conic points satisfy PF=e·PD. The hyperbola shows the branch nearer the designated focus; it is intentionally truncated at hyperbolic parameter ±1.8. The parabola is displayed over y=±2.5d. Tangents are numerical central differences (one-sided at endpoints); the cycloid cusp uses the limiting direction. Construction animation reveals the locus rather than simulating manual compass operations.

## Structure

`dist/index.html`, `styles.css`, `app.js`: interface, validation and state.
`dist/js/geometry.js`: pure convex solid math.
`dist/js/drafting.js`: SVG line conventions, dimensions and view layout.
`dist/js/renderer3d.js`: Three.js scene and camera controls.
`dist/js/curves.js`: curve mathematics and construction graphics.
`dist/js/export.js`: vector and raster engineering sheet export.

No backend, account collection, analytics, or remote persistence. All student/title values are XML-escaped during export. Do not treat this educational visualization as manufacturing-grade CAD. Browser/device performance should be profiled before promising 60 fps on student hardware.

## Reference

First-angle view layout: https://www.mcgill.ca/engineeringdesign/step-step-design-process/basics-graphics-communication/projections-and-views
Three.js controls: https://threejs.org/docs/pages/OrbitControls.html
