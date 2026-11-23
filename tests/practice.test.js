import test from "node:test";
import assert from "node:assert/strict";
import { QUESTIONS, TOPICS } from "../dist/js/data/questions.js";
import { validateStep, TOLERANCE } from "../dist/js/stepValidator.js";

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
