import test from "node:test";
import assert from "node:assert/strict";
import { QUESTIONS, TOPICS } from "../dist/js/data/questions.js";
import { validateStep, TOLERANCE } from "../dist/js/stepValidator.js";
import {
  parseFacultyQuestionText,
  buildCustomQuestion,
  buildQuestionComprehension
} from "../dist/js/customQuestionEngine.js";
import { reconstructFrom2DStrokes } from "../dist/js/reconstruct3d.js";

test("Anna University Question Bank contains at least 9 problems across 3 syllabus units", () => {
  assert.ok(QUESTIONS.length >= 9, `Expected at least 9 questions, found ${QUESTIONS.length}`);

  const units = {
    "Projection of Solids": 0,
    "Section of Solids": 0,
    "Development of Surfaces": 0
  };

  for (const q of QUESTIONS) {
    assert.ok(q.id, "Question must have an id");
    assert.ok(q.unit, "Question must belong to a unit");
    assert.ok(q.title, "Question must have a title");
    assert.ok(q.problemStatement, "Question must have problemStatement");
    assert.ok(q.steps && q.steps.length >= 4, "Question must have at least 4 drafting steps");

    if (units[q.unit] !== undefined) {
      units[q.unit]++;
    }

    for (const step of q.steps) {
      assert.ok(step.stepNumber, "Step must have stepNumber");
      assert.ok(step.title, "Step must have title");
      assert.ok(step.instruction, "Step must have instruction");
      assert.ok(step.hint, "Step must have hint");
      assert.ok(step.lineType, "Step must have lineType");
    }
  }

  assert.ok(units["Projection of Solids"] >= 3, "At least 3 Projection of Solids problems");
  assert.ok(units["Section of Solids"] >= 3, "At least 3 Section of Solids problems");
  assert.ok(units["Development of Surfaces"] >= 3, "At least 3 Development of Surfaces problems");
});

test("Step validation engine enforces engineering tolerances and gives constructive feedback", () => {
  const step = QUESTIONS[0].steps[0]; // Reference line XY
  assert.equal(step.title, "Draw Reference Line (XY)");

  // 1. Empty elements should fail with prompt
  const emptyRes = validateStep(step, []);
  assert.equal(emptyRes.valid, false);
  assert.match(emptyRes.message, /empty/i);

  // 2. Short line should fail with length suggestion
  const shortLine = [{ type: "line", x1: -20, y1: 0, x2: 20, y2: 0, grade: "2H" }];
  const shortRes = validateStep(step, shortLine);
  assert.equal(shortRes.valid, false);
  assert.match(shortRes.message, /too short/i);

  // 3. Proper horizontal line across sheet along Y=0 should pass
  const validLine = [{ type: "line", x1: -120, y1: 0, x2: 120, y2: 0, grade: "2H" }];
  const passRes = validateStep(step, validLine);
  assert.equal(passRes.valid, true);

  // 4. Polygon validation for square base step (step 2)
  const step2 = QUESTIONS[0].steps[1];
  const wrongPoly = [{ type: "polygon", sides: 4, edgeLength: 20, cx: -50, cy: -40, grade: "HB" }];
  const wrongRes = validateStep(step2, wrongPoly);
  assert.equal(wrongRes.valid, false);
  assert.match(wrongRes.message, /Base edge is 20.0 mm; expected 30 mm/i);

  const rightPoly = [{ type: "polygon", sides: 4, edgeLength: 30, cx: -50, cy: -40, grade: "HB" }];
  const rightRes = validateStep(step2, rightPoly);
  assert.equal(rightRes.valid, true);
});

test("parseFacultyQuestionText accurately extracts engineering specs from faculty prompts", () => {
  const proj = parseFacultyQuestionText(
    "A pentagonal pyramid of base side 30 mm and axis height 65 mm rests on HP on one of its base edges such that the axis is inclined at 40° to HP and parallel to VP. Draw its projections."
  );
  assert.equal(proj.spec.unit, "Projection of Solids");
  assert.equal(proj.spec.solid, "pentPyramid");
  assert.equal(proj.spec.baseEdge, 30);
  assert.equal(proj.spec.height, 65);
  assert.equal(proj.spec.restingOn, "base edge");
  assert.equal(proj.spec.alpha, 40);

  const sec = parseFacultyQuestionText(
    "A hexagonal prism of base 25 mm and axis 60 mm rests on HP. A section plane inclined at 35 deg to HP passes 15 mm from the top face."
  );
  assert.equal(sec.spec.unit, "Section of Solids");
  assert.equal(sec.spec.solid, "hexPrism");
  assert.equal(sec.spec.baseEdge, 25);
  assert.equal(sec.spec.height, 60);
  assert.equal(sec.spec.cuttingAngle, 35);
  assert.equal(sec.spec.cutMode, "fromTop");
  assert.equal(sec.spec.cutOffset, 15);

  const dev = parseFacultyQuestionText(
    "A cone of base diameter 50 mm and axis 70 mm is cut by a plane at 45° to HP bisecting the axis. Develop its lateral surface."
  );
  assert.equal(dev.spec.unit, "Development of Surfaces");
  assert.equal(dev.spec.solid, "cone");
  assert.equal(dev.spec.diameter, 50);
  assert.equal(dev.spec.height, 70);
  assert.equal(dev.spec.cuttingAngle, 45);
  assert.equal(dev.spec.cutMode, "midpoint");
});

test("buildCustomQuestion generates finite geometry, comprehension guides, and working validation across all 3 units", () => {
  const projQ = buildCustomQuestion({
    unit: "Projection of Solids",
    solid: "pentPyramid",
    baseEdge: 30,
    height: 65,
    restingOn: "base edge",
    alpha: 40
  });
  assert.equal(projQ.isCustom, true);
  assert.equal(projQ.steps.length, 6);
  assert.ok(projQ.comprehension.simplePositionRule.includes("40°"));
  assert.ok(projQ.comprehension.baseOrientationRule.includes("BASE EDGE"));

  // Check Step 2 polygon validation for pentagon (5 sides, 30 mm)
  assert.equal(
    validateStep(projQ.steps[1], [{ type: "polygon", sides: 4, edgeLength: 30, cx: -65, cy: -45 }]).valid,
    false
  );
  assert.equal(
    validateStep(projQ.steps[1], [{ type: "polygon", sides: 5, edgeLength: 30, cx: -65, cy: -45 }]).valid,
    true
  );
  // Check Step 5 tilted view (accepts 40° axis or 50° base)
  assert.equal(
    validateStep(projQ.steps[4], [{ type: "line", x1: 15, y1: 0, x2: 15 + 65 * Math.cos((40 * Math.PI) / 180), y2: 65 * Math.sin((40 * Math.PI) / 180) }]).valid,
    true
  );

  // Check Section of Solids custom question
  const secQ = buildCustomQuestion({
    unit: "Section of Solids",
    solid: "pentPrism",
    baseEdge: 28,
    height: 60,
    cuttingAngle: 40,
    cutMode: "fromTop",
    cutOffset: 15
  });
  assert.equal(secQ.parameters.cutHeight, 45);
  assert.equal(secQ.steps.length, 6);
  assert.equal(
    validateStep(secQ.steps[3], [{ type: "line", x1: -85, y1: 24, x2: -35, y2: 66 }]).valid,
    true
  );

  // Check Development of Surfaces Cone radial sector calculations & validation
  const devQ = buildCustomQuestion({
    unit: "Development of Surfaces",
    solid: "cone",
    diameter: 50,
    height: 65,
    cuttingAngle: 45,
    cutMode: "midpoint"
  });
  assert.equal(devQ.steps.length, 5);
  assert.ok(devQ.comprehension.calculations.some((c) => c.includes("Sector Angle")));
  assert.equal(validateStep(devQ.steps[1], []).valid, true); // alwaysPass calc step

  // Ensure every built-in question also yields a valid comprehension breakdown
  for (const q of QUESTIONS) {
    const comp = buildQuestionComprehension(q);
    assert.ok(comp && comp.simplePositionRule && comp.baseOrientationRule && comp.calculations.length >= 2);
  }
});

test("reconstructFrom2DStrokes extracts live 3D solids and cuts from drafted HP & VP geometry", () => {
  assert.deepEqual(reconstructFrom2DStrokes([]), { hasBase: false, hasSolid: false });

  // 1. Base pentagon on HP only
  const pentPts = [];
  for (let i = 0; i < 5; i++) {
    const a = (2 * Math.PI * i) / 5;
    pentPts.push([-60 + 25 * Math.cos(a), -45 + 25 * Math.sin(a)]);
  }
  const baseOnly = [{ type: "polygon", sides: 5, edgeLength: 29.4, cx: -60, cy: -45, points: pentPts, grade: "HB" }];
  const rBase = reconstructFrom2DStrokes(baseOnly);
  assert.equal(rBase.hasBase, true);
  assert.equal(rBase.hasSolid, false);
  assert.equal(rBase.base.sides, 5);

  // 2. Add upright Front View rectangle lines -> Prism
  const prismStrokes = [
    ...baseOnly,
    { type: "line", x1: -80, y1: 0, x2: -80, y2: 55, grade: "HB" },
    { type: "line", x1: -35, y1: 0, x2: -35, y2: 55, grade: "HB" },
    { type: "line", x1: -80, y1: 55, x2: -35, y2: 55, grade: "HB" }
  ];
  const rPrism = reconstructFrom2DStrokes(prismStrokes);
  assert.equal(rPrism.hasSolid, true);
  assert.equal(rPrism.isPyramid, false);
  assert.equal(rPrism.height, 55);

  // 3. Converging apex + cutting plane -> Cut Pyramid
  const pyramidCutStrokes = [
    ...baseOnly,
    { type: "line", x1: -80, y1: 0, x2: -60, y2: 65, grade: "HB" },
    { type: "line", x1: -35, y1: 0, x2: -60, y2: 65, grade: "HB" },
    { type: "line", x1: -85, y1: 7.5, x2: -35, y2: 57.5, grade: "Cutting Plane" }
  ];
  const rCutPyr = reconstructFrom2DStrokes(pyramidCutStrokes);
  assert.equal(rCutPyr.hasSolid, true);
  assert.equal(rCutPyr.isPyramid, true);
  assert.equal(rCutPyr.height, 65);
  assert.ok(rCutPyr.cutPlane && Math.abs(rCutPyr.cutPlane.angleDeg - 45) < 0.1);
  assert.ok(Math.abs(rCutPyr.cutPlane.cutHeight - 32.5) < 0.1);
});
