import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSolid,
  axisDirection,
  dot,
  sub,
  viewEdges,
} from "../dist/js/geometry.js";
import { solidDrawing } from "../dist/js/drafting.js";
import { sheetSVG } from "../dist/js/export.js";
import {
  AUTOCAD_3D_ARCHITECTURE,
  VISUAL_STYLE_SPECS,
  mapVisualStyleConfig,
  computeCutPlaneBasis,
  computeSectionTrueShapeMetrics,
  resolveCameraPresetBasis,
  splitPolyhedronByPlane
} from "../dist/js/reaSpecMapper.js";
const state = {
  solid: "cube",
  size: 30,
  height: 70,
  alpha: 90,
  beta: 0,
  roll: 0,
  side: "right",
  construction: true,
  hidden: true,
  labels: true,
  dimensions: true,
};
test("true inclination axes remain unit length at boundary orientations", () => {
  for (let a = 0; a <= 90; a += 5)
    for (let b = 0; b <= 90 - a; b += 5) {
      const v = axisDirection(a, b);
      assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-12);
      assert.ok(Math.abs((Math.asin(v[1]) * 180) / Math.PI - a) < 1e-6);
      assert.ok(Math.abs((Math.asin(v[2]) * 180) / Math.PI - b) < 1e-6);
    }
});
test("all solids are closed convex manifolds with outward faces and positive plane clearance", () => {
  for (const solid of [
    "cube",
    "triPrism",
    "squarePrism",
    "pentPrism",
    "hexPrism",
    "triPyramid",
    "squarePyramid",
    "pentPyramid",
    "hexPyramid",
    "cylinder",
    "cone",
  ])
    for (const [alpha, beta] of [
      [0, 0],
      [90, 0],
      [0, 90],
      [40, 50],
      [37, 12],
    ]) {
      const m = buildSolid({ ...state, solid, alpha, beta });
      assert.ok(
        m.vertices.every(
          (p) =>
            p.every(Number.isFinite) && p[1] >= 14.999999 && p[2] >= 14.999999,
        ),
      );
      assert.ok(m.edges.every((e) => e.faces.length === 2));
      for (const f of m.faces)
        for (const p of m.vertices)
          assert.ok(dot(f.normal, sub(p, m.vertices[f.ids[0]])) < 1e-7);
      assert.equal(m.vertices.length - m.edges.length + m.faces.length, 2);
      const d = solidDrawing(m, { ...state, solid });
      assert.ok(!/NaN|Infinity/.test(d.body));
      assert.ok(d.scale > 0);
    }
});
test("cube preserves true edge lengths under rotation", () => {
  const m = buildSolid({ ...state, alpha: 43, beta: 21, roll: 27 });
  for (const e of m.edges)
    assert.ok(
      Math.abs(Math.hypot(...sub(m.vertices[e.a], m.vertices[e.b])) - 30) <
        1e-8,
    );
});
test("orthographic directions identify visible and hidden convex edges", () => {
  const m = buildSolid({ ...state, alpha: 54, beta: 20 });
  for (const d of [
    [0, 0, 1],
    [0, 1, 0],
    [1, 0, 0],
    [-1, 0, 0],
  ]) {
    const edges = viewEdges(m, d);
    assert.ok(edges.some((e) => e.visible));
    assert.ok(edges.some((e) => !e.visible));
  }
});
test("solid drawing and sheet export contain finite coordinates and escaped user content", () => {
  const m = buildSolid({ ...state, solid: "hexPrism", alpha: 45, beta: 20 });
  const d = solidDrawing(m, { ...state, solid: "hexPrism" });
  assert.ok(!/NaN|Infinity/.test(d.body));
  const svg = sheetSVG(d, {
    paper: "A4",
    mode: "solid",
    title: "<script>&",
    name: "A&B",
  });
  assert.ok(svg.includes("&lt;script&gt;&amp;"));
  assert.ok(!svg.includes("<script>"));
  assert.ok(svg.includes('width="297mm"'));
  assert.ok(svg.includes("FIRST ANGLE"));
});

test("REA spec mapper, visual styles, half-space slicer, and True Shape metrics stay exact and finite", () => {
  assert.ok(AUTOCAD_3D_ARCHITECTURE.visualStyles.verification);
  assert.equal(VISUAL_STYLE_SPECS.length, 7);
  assert.equal(mapVisualStyleConfig("conceptual").id, "conceptual");
  assert.equal(mapVisualStyleConfig("blueprint").id, "blueprint");

  const cube = buildSolid({ ...state, solid: "cube", size: 40, alpha: 90, beta: 0 });
  const xs = cube.vertices.map((p) => p[0]);
  const ys = cube.vertices.map((p) => p[1]);
  const zs = cube.vertices.map((p) => p[2]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2;

  // Horizontal cut on upright 40mm cube produces an exact 40x40 = 1600 mm^2 cap with 160 mm perimeter
  const horizBasis = computeCutPlaneBasis(0, cy, cx, cz);
  const slicedHoriz = splitPolyhedronByPlane(cube, horizBasis);
  assert.equal(slicedHoriz.capPoly.length, 4);
  assert.ok(slicedHoriz.lowerPolyData.vertices.length >= 8);
  assert.ok(slicedHoriz.upperPolyData.vertices.length >= 8);

  const metricsHoriz = computeSectionTrueShapeMetrics(slicedHoriz.capPoly);
  assert.ok(Math.abs(metricsHoriz.areaMm2 - 1600) < 1e-4, `Expected area 1600, got ${metricsHoriz.areaMm2}`);
  assert.ok(Math.abs(metricsHoriz.perimeterMm - 160) < 1e-4);

  // 45-degree inclined cut through center produces a wider True Shape rectangle (40 * 40*sqrt(2) = ~2262.7 mm^2)
  const tiltBasis = computeCutPlaneBasis(45, cy, cx, cz);
  const slicedTilt = splitPolyhedronByPlane(cube, tiltBasis);
  const metricsTilt = computeSectionTrueShapeMetrics(slicedTilt.capPoly);
  assert.ok(metricsTilt.areaMm2 > 2200 && metricsTilt.areaMm2 < 2300);

  // Inspect cut camera aligns perpendicular to cut face normal
  const inspectBasis = resolveCameraPresetBasis("inspectCut", tiltBasis);
  const dotNorm = Math.abs(
    inspectBasis.dir[0] * tiltBasis.normal[0] +
    inspectBasis.dir[1] * tiltBasis.normal[1] +
    inspectBasis.dir[2] * tiltBasis.normal[2]
  );
  assert.ok(dotNorm > 0.999);
});
