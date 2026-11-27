import test from "node:test";
import assert from "node:assert/strict";
import {
  ISO_SCALE,
  ISO_DIR,
  ISO_ELEVATION_DEG,
  projectWorldPointOrthographic,
  projectIsoBoxCoords,
  computeCubeTiltState
} from "../dist/js/isoCameraRig.js";
import {
  cycleIsoplane,
  getIsoOrthoAngles,
  computeIsocircleGeometry,
  toIsoLength
} from "../dist/js/isoDraftEngine.js";
import { buildFourCenterGeometry } from "../dist/js/fourCenterTool.js";
import { buildIsoSolidAssemblySpec, isIsometricWorldEdge } from "../dist/js/isoSolidsBuilder.js";
import { ISOMETRIC_QUESTIONS, ISO_UNIT_ID } from "../dist/js/data/isometricQuestions.js";
import { QUESTIONS, TOPICS } from "../dist/js/data/questions.js";
import { buildQuestionComprehension } from "../dist/js/customQuestionEngine.js";
import { validateStep } from "../dist/js/stepValidator.js";
import { practiceDrawing } from "../dist/js/export.js";

test("Isometric camera rig projects principal axes at exact 30°/150°/90° and 0.8165 scale", () => {
  const elev = (Math.asin(ISO_DIR[1]) * 180) / Math.PI;
  const azim = (Math.atan2(ISO_DIR[0], ISO_DIR[2]) * 180) / Math.PI;
  assert.ok(Math.abs(azim - 45) < 1e-6);
  assert.ok(Math.abs(elev - ISO_ELEVATION_DEG) < 1e-6);
  assert.ok(Math.abs(ISO_ELEVATION_DEG - 35.2643897) < 1e-4);
  assert.ok(Math.abs(ISO_SCALE - 0.81649658) < 1e-7);

  // Project unit basis axes aligned to box corner O along -Z (right30), -X (left30), +Y (up90)
  const pRight = projectWorldPointOrthographic([0, 0, -10], ISO_DIR);
  const pLeft = projectWorldPointOrthographic([-10, 0, 0], ISO_DIR);
  const pUp = projectWorldPointOrthographic([0, 10, 0], ISO_DIR);

  assert.ok(Math.abs(Math.hypot(pRight.x, pRight.y) - 10 * ISO_SCALE) < 1e-6);
  assert.ok(Math.abs((Math.atan2(pRight.y, pRight.x) * 180) / Math.PI - 30) < 1e-6);
  assert.ok(Math.abs((Math.atan2(pLeft.y, pLeft.x) * 180) / Math.PI - 150) < 1e-6);
  assert.ok(Math.abs((Math.atan2(pUp.y, pUp.x) * 180) / Math.PI - 90) < 1e-6);

  // Cube-Tilt explainer milestones: 0 (Front 1:1) -> 0.5 (45 deg Yaw) -> 1.0 (Isometric 0.8165)
  const t0 = computeCubeTiltState(0);
  assert.ok(Math.abs(t0.vertRatio - 1.0) < 1e-6);
  assert.ok(Math.abs(t0.rightEdgeAngleDeg) < 1e-6);

  const tMid = computeCubeTiltState(0.5);
  assert.ok(Math.abs(tMid.yawDeg - 45) < 1e-6);
  assert.ok(Math.abs(tMid.zEdgeRatio - Math.SQRT1_2) < 1e-5);

  const tIso = computeCubeTiltState(1.0);
  assert.ok(Math.abs(tIso.vertRatio - ISO_SCALE) < 1e-6);
  assert.ok(Math.abs(tIso.rightEdgeAngleDeg - 30) < 1e-6);
});

test("ISODRAFT F5 Isoplanes, Iso-Ortho directions, and Isocircle ellipses are exact", () => {
  assert.equal(cycleIsoplane("top"), "left");
  assert.equal(cycleIsoplane("left"), "right");
  assert.equal(cycleIsoplane("right"), "top");

  assert.deepEqual(getIsoOrthoAngles("top"), [30, 210, 150, 330]);
  assert.deepEqual(getIsoOrthoAngles("left"), [90, 270, 150, 330]);
  assert.deepEqual(getIsoOrthoAngles("right"), [30, 210, 90, 270]);

  // Verify inscribed ellipse math across all 3 isoplanes: rx / ry = sqrt(3) and midpoints sit on boundary
  const R = 20;
  for (const plane of ["top", "left", "right"]) {
    const isoC = computeIsocircleGeometry(10, -20, R, plane);
    assert.ok(Math.abs(isoC.rx / isoC.ry - Math.sqrt(3)) < 1e-6);
    assert.ok(Math.abs(isoC.rx - R * Math.sqrt(3 / 2)) < 1e-6);
    assert.ok(Math.abs(isoC.ry - R * Math.sqrt(1 / 2)) < 1e-6);

    const fc = buildFourCenterGeometry(10, -20, R, plane);
    assert.equal(fc.rhombusLines.length, 4);
    assert.equal(fc.medianLines.length, 4);
    assert.equal(fc.arcs.length, 4);

    // Every rhombus midpoint must touch the fitted ellipse equation (u/rx)^2 + (v/ry)^2 = 1
    const rot = (isoC.rotationDeg * Math.PI) / 180;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    for (const mp of Object.values(fc.midpoints)) {
      const dx = mp[0] - isoC.cx;
      const dy = mp[1] - isoC.cy;
      const lx = dx * cosR + dy * sinR;
      const ly = -dx * sinR + dy * cosR;
      const eqn = (lx / isoC.rx) ** 2 + (ly / isoC.ry) ** 2;
      assert.ok(Math.abs(eqn - 1) < 1e-6, `Midpoint failed ellipse equation on ${plane}: ${eqn}`);
    }

    // Check Four-Center arcs meet midpoints at exact radii rLarge & rSmall
    assert.ok(Math.abs(fc.rLarge - Math.sqrt(3) * R) < 1e-6);
    assert.ok(Math.abs(fc.rSmall - R / Math.sqrt(3)) < 1e-6);
    assert.ok(Math.abs(Math.hypot(fc.midpoints.M_negV[0] - fc.centers.C1[0], fc.midpoints.M_negV[1] - fc.centers.C1[1]) - fc.rLarge) < 1e-6);
    assert.ok(Math.abs(Math.hypot(fc.midpoints.M_posU[0] - fc.centers.C3[0], fc.midpoints.M_posU[1] - fc.centers.C3[1]) - fc.rSmall) < 1e-6);
  }
});

test("isoSolidsBuilder produces finite solids, dual boxes, cut polygons, and obeys Strict EG Sphere Rule", () => {
  // Check View (1:1) vs Projection (0.8165) toggle on Hexagonal Prism
  const pProj = buildIsoSolidAssemblySpec({ solid: "hexPrism", baseEdge: 25, height: 60 }, "projection");
  const pView = buildIsoSolidAssemblySpec({ solid: "hexPrism", baseEdge: 25, height: 60 }, "view");
  assert.ok(Math.abs(pProj.metrics.shownW - 50 * ISO_SCALE) < 1e-5);
  assert.ok(Math.abs(pView.metrics.shownW - 50) < 1e-5);
  assert.ok(pProj.nonIsoEdges.length >= 8, "Hexagonal prism diagonals must be flagged as Non-Isometric edges");
  assert.ok(pProj.offsets.length >= 4, "Hexagonal base requires enclosing box offset arrows");

  // Check Truncated Square Prism cut cap & ghost
  const truncSq = buildIsoSolidAssemblySpec({ solid: "truncSquarePrism", baseEdge: 35, height: 60, cutAngle: 45, cutHeight: 30 }, "projection");
  assert.ok(truncSq.capPoly.length === 4);
  assert.ok(truncSq.upperGhostPoly && truncSq.upperGhostPoly.vertices.length >= 8);
  assert.equal(truncSq.cutPoints.length, 4);

  // Check Frustum Hex Pyramid Dual Top Box
  const frustHex = buildIsoSolidAssemblySpec({ solid: "frustumHexPyramid", baseEdge: 30, topEdge: 15, height: 50 }, "projection");
  assert.ok(frustHex.topBoxBounds && frustHex.topBoxBounds.widthZ < frustHex.bounds.widthZ);

  // Check Truncated Cone curved cut generator cap
  const truncCone = buildIsoSolidAssemblySpec({ solid: "truncCone", diameter: 50, height: 65, cutAngle: 30, cutHeight: 32.5 }, "projection");
  assert.ok(truncCone.capPoly.length >= 12);
  assert.ok(truncCone.cutPoints.length >= 6);

  // Check Strict EG Sphere Rule on Combination Boss problem (D=40 -> R_true=20, Frustum H=40)
  const bossProj = buildIsoSolidAssemblySpec(
    { solid: "sphereOnFrustumSquare", baseEdge: 50, topEdge: 30, height: 40, sphereRadius: 20 },
    "projection"
  );
  assert.ok(bossProj.sphereSpec);
  assert.equal(bossProj.sphereSpec.renderRadiusInScene, 20);
  assert.ok(Math.abs(bossProj.sphereSpec.isoProjectedCenterOffsetMm - 60 * ISO_SCALE) < 1e-5);
  assert.ok(bossProj.topBoxBounds);

  // Edge classification helper
  assert.equal(isIsometricWorldEdge([0, 0, 0], [10, 0, 0]), true);
  assert.equal(isIsometricWorldEdge([0, 0, 0], [10, 0, 10]), false);
});

test("GE3251 Unit V Isometric Question Bank + Smart Validator catches True-Length & Sphere-Rule traps", () => {
  assert.equal(ISOMETRIC_QUESTIONS.length, 6);
  assert.ok(TOPICS.some((t) => t.id === ISO_UNIT_ID));
  assert.ok(QUESTIONS.some((q) => q.unit === ISO_UNIT_ID));

  for (const q of ISOMETRIC_QUESTIONS) {
    assert.equal(q.unit, ISO_UNIT_ID);
    assert.ok(q.steps.length >= 3);
    const comp = buildQuestionComprehension(q);
    assert.ok(comp && comp.calculations.length >= 2);
  }

  // 1. Cylinder Step 1: Drawing True 40 mm base instead of 32.66 mm triggers exact Scale Trap feedback!
  const cylQ = ISOMETRIC_QUESTIONS[1];
  const r30 = (30 * Math.PI) / 180;
  const r150 = (150 * Math.PI) / 180;
  const true40Trap = [
    { type: "line", x1: 0, y1: 0, x2: 40 * Math.cos(r30), y2: 40 * Math.sin(r30), grade: "2H" },
    { type: "line", x1: 0, y1: 0, x2: 40 * Math.cos(r150), y2: 40 * Math.sin(r150), grade: "2H" }
  ];
  const trapRes = validateStep(cylQ.steps[0], true40Trap);
  assert.equal(trapRes.valid, false);
  assert.match(trapRes.message, /True Length \(40 mm\)/);
  assert.match(trapRes.message, /0\.8165/);

  // Scaled 32.66 mm lines pass!
  const isoLen = toIsoLength(40);
  const valid32 = [
    { type: "line", x1: 0, y1: 0, x2: isoLen * Math.cos(r30), y2: isoLen * Math.sin(r30), grade: "2H" },
    { type: "line", x1: 0, y1: 0, x2: isoLen * Math.cos(r150), y2: isoLen * Math.sin(r150), grade: "2H" }
  ];
  assert.equal(validateStep(cylQ.steps[0], valid32).valid, true);

  // 2. Cylinder Step 2: Supports BOTH EL->I Isocircle ellipse & Four-Center arcs + catches R=20 true trap!
  const trapEllipse = computeIsocircleGeometry(0, -12, 20, "top");
  const trapEllRes = validateStep(cylQ.steps[1], [trapEllipse]);
  assert.equal(trapEllRes.valid, false);
  assert.match(trapEllRes.message, /True Radius \(20 mm\)/);

  const validEllipse = computeIsocircleGeometry(0, -12, toIsoLength(20), "top");
  assert.equal(validateStep(cylQ.steps[1], [validEllipse]).valid, true);

  const fcBuilt = buildFourCenterGeometry(0, -12, toIsoLength(20), "top");
  assert.equal(validateStep(cylQ.steps[1], fcBuilt.allElements).valid, true);

  // Also test SVG sheet export includes <ellipse> cleanly
  const svgOut = practiceDrawing([validEllipse]);
  assert.ok(svgOut.body.includes("<ellipse "));

  // 3. Boss Combination Problem #6 Step 3: Catches scaling Sphere radius to 16.33 mm & passes True R = 20 mm!
  const bossQ = ISOMETRIC_QUESTIONS[5];
  const hOffsetLine = { type: "line", x1: 0, y1: 0, x2: 0, y2: toIsoLength(20), grade: "Axis" };
  const wrongSphere = validateStep(bossQ.steps[2], [hOffsetLine, { type: "circle", cx: 0, cy: toIsoLength(20), radius: toIsoLength(20), grade: "HB" }]);
  assert.equal(wrongSphere.valid, false);
  assert.match(wrongSphere.message, /TRUE RADIUS \(20 mm\)/i);

  const rightSphere = validateStep(bossQ.steps[2], [hOffsetLine, { type: "circle", cx: 0, cy: toIsoLength(20), radius: 20, grade: "HB" }]);
  assert.equal(rightSphere.valid, true);
});
