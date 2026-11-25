import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSolid,
  axisDirection,
  dot,
  sub,
  viewEdges,
} from "../dist/js/geometry.js";
import { curvePoint, curveDrawing } from "../dist/js/curves.js";
import { solidDrawing } from "../dist/js/drafting.js";
import { sheetSVG } from "../dist/js/export.js";
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
test("conic points satisfy focus/directrix definition", () => {
  for (const [type, e] of [
    ["ellipse", 0.65],
    ["parabola", 1],
    ["hyperbola", 1.5],
  ])
    for (let i = 0; i <= 100; i++) {
      const [x, y] = curvePoint(type, i / 100, 35, e, 25);
      assert.ok(Math.abs(Math.hypot(x - 35, y) - e * Math.abs(x)) < 1e-8);
    }
});
test("rolling curves meet analytic endpoints", () => {
  const r = 25;
  assert.deepEqual(curvePoint("cycloid", 0, 0, 0, r), [0, 0]);
  const p = curvePoint("cycloid", 1, 0, 0, r);
  assert.ok(Math.abs(p[0] - 2 * Math.PI * r) < 1e-8);
  assert.ok(Math.abs(p[1]) < 1e-8);
  const inv = curvePoint("involute", 1, 0, 0, r);
  assert.ok(Math.abs(inv[0] - r) < 1e-8);
  assert.ok(Math.abs(inv[1] + 2 * Math.PI * r) < 1e-8);
});
test("curves and sheet export contain finite coordinates and escaped user content", () => {
  for (const curve of [
    "ellipse",
    "parabola",
    "hyperbola",
    "cycloid",
    "involute",
  ]) {
    const d = curveDrawing({
      ...state,
      curve,
      distance: 35,
      ecc: curve === "hyperbola" ? 1.5 : 0.65,
      radius: 25,
      point: 0,
      progress: 100,
      tangent: true,
    });
    assert.ok(!/NaN|Infinity/.test(d.body));
    const svg = sheetSVG(d, {
      paper: "A4",
      mode: "curve",
      title: "<script>&",
      name: "A&B",
    });
    assert.ok(svg.includes("&lt;script&gt;&amp;"));
    assert.ok(!svg.includes("<script>"));
    assert.ok(svg.includes('width="297mm"'));
  }
});
