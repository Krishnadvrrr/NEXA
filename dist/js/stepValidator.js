/**
 * Step Validation Engine for Engineering Graphics Practice Studio
 * Validates student's drafted geometry against expected problem steps
 * using realistic CAD tolerances (±2 mm, ±3° angle, quadrant check).
 */

export const TOLERANCE = {
  length: 2.5,     // ±2.5 mm length tolerance
  angle: 4.0,      // ±4.0 degrees angle tolerance
  distance: 3.5,   // ±3.5 mm position tolerance
  yReference: 3.0  // near XY line (Y ≈ 0)
};

function expandValidationElements(elements) {
  const expanded = [];
  for (const el of elements) {
    expanded.push(el);
    if ((el.type === "polyline" || el.type === "polygon") && Array.isArray(el.points) && el.points.length >= 2) {
      const count = el.type === "polygon" || el.closed ? el.points.length : el.points.length - 1;
      for (let i = 0; i < count; i++) {
        const a = el.points[i];
        const b = el.points[(i + 1) % el.points.length];
        expanded.push({
          type: "line",
          x1: a[0],
          y1: a[1],
          x2: b[0],
          y2: b[1],
          grade: el.grade || "HB"
        });
      }
      if (el.type === "polyline" && el.closed && el.points.length >= 3) {
        const xs = el.points.map((p) => p[0]);
        const ys = el.points.map((p) => p[1]);
        const e0 = Math.hypot(el.points[1][0] - el.points[0][0], el.points[1][1] - el.points[0][1]);
        expanded.push({
          type: "polygon",
          sides: el.points.length,
          edgeLength: e0,
          cx: (Math.min(...xs) + Math.max(...xs)) / 2,
          cy: (Math.min(...ys) + Math.max(...ys)) / 2,
          points: el.points
        });
      }
    }
  }
  return expanded;
}

export function validateStep(step, elements) {
  if (!step) return { valid: true, message: "Free practice mode. No constraints." };
  const rules = step.validation?.requires || [];
  if (rules.some((r) => r.type === "alwaysPass")) {
    return { valid: true, message: "✓ Calculation step verified! Proceed to the next step." };
  }
  if (!elements || elements.length === 0) {
    return {
      valid: false,
      message: "Canvas is empty. Draw the required geometry to complete this step.",
      suggestion: step.hint
    };
  }

  if (rules.length === 0) {
    return { valid: true, message: "Step completed! Proceed to the next step." };
  }

  const normalized = expandValidationElements(elements);

  // Evaluate each rule
  for (const rule of rules) {
    const result = evaluateRule(rule, normalized);
    if (!result.valid) {
      return result;
    }
  }

  return {
    valid: true,
    message: "✓ Step verified successfully! Geometry matches engineering specifications.",
    suggestion: "Click 'Next Step' to continue drafting."
  };
}

function evaluateRule(rule, elements) {
  switch (rule.type) {
    case "alwaysPass":
      return { valid: true, message: "Information step acknowledged." };

    case "line": {
      // Find lines matching criteria
      const lines = elements.filter((e) => e.type === "line");
      if (lines.length === 0) {
        return {
          valid: false,
          message: "No straight lines detected. Use the Line tool to draw this step.",
          suggestion: "Click and drag with the Line tool (or use Shift for Ortho lock)."
        };
      }

      if (rule.nearY !== undefined) {
        const nearXY = lines.find((l) =>
          Math.abs(l.y1 - rule.nearY) < TOLERANCE.yReference &&
          Math.abs(l.y2 - rule.nearY) < TOLERANCE.yReference
        );
        if (!nearXY) {
          return {
            valid: false,
            message: `Reference line should be along Y = ${rule.nearY} mm (on the central axis).`,
            suggestion: "Snap your line to the horizontal XY guide in the center of the canvas."
          };
        }
      }

      if (rule.minLength) {
        const maxLen = Math.max(...lines.map((l) => Math.hypot(l.x2 - l.x1, l.y2 - l.y1)));
        if (maxLen < rule.minLength - TOLERANCE.length) {
          return {
            valid: false,
            message: `Line is too short (${maxLen.toFixed(1)} mm). Minimum required length is ${rule.minLength} mm.`,
            suggestion: "Extend the line across the drawing sheet."
          };
        }
      }

      if (rule.vertical) {
        const hasVert = lines.some((l) => Math.abs(l.x2 - l.x1) < TOLERANCE.distance && Math.abs(l.y2 - l.y1) > 10);
        if (!hasVert) {
          return {
            valid: false,
            message: "Projectors must be strictly vertical lines.",
            suggestion: "Hold Shift while drawing or toggle Ortho Lock to snap strictly to 90°."
          };
        }
      }

      if (rule.horizontal) {
        const hasHoriz = lines.some((l) => Math.abs(l.y2 - l.y1) < TOLERANCE.distance && Math.abs(l.x2 - l.x1) > 10);
        if (!hasHoriz) {
          return {
            valid: false,
            message: "Expected horizontal projection lines.",
            suggestion: "Hold Shift while drawing to snap strictly to 0°/180°."
          };
        }
      }

      if (rule.angle !== undefined || Array.isArray(rule.angles)) {
        const targets = Array.isArray(rule.angles) ? rule.angles : [rule.angle];
        const matchingAngle = lines.find((l) => {
          let deg = Math.abs((Math.atan2(l.y2 - l.y1, l.x2 - l.x1) * 180) / Math.PI);
          if (deg > 90) deg = 180 - deg;
          return targets.some((t) => Math.abs(deg - t) <= TOLERANCE.angle);
        });

        if (!matchingAngle) {
          const primaryTarget = targets[0];
          const angles = lines.map((l) => {
            let deg = Math.abs((Math.atan2(l.y2 - l.y1, l.x2 - l.x1) * 180) / Math.PI);
            if (deg > 90) deg = 180 - deg;
            return deg;
          });
          const closest = Math.min(...angles.map((a) => Math.abs(a - primaryTarget)));
          const actualAngle = angles[angles.map((a) => Math.abs(a - primaryTarget)).indexOf(closest)];
          const targetDesc = targets.length > 1 ? `${targets.join("° or ")}°` : `${primaryTarget}°`;
          return {
            valid: false,
            message: `Expected line inclined at ${targetDesc}. Found line at ${actualAngle.toFixed(1)}° (tolerance ±${TOLERANCE.angle}°).`,
            suggestion: `Adjust the inclination angle closer to ${targetDesc}. Check the HUD readout while drawing.`
          };
        }
      }

      if (rule.nearPoint) {
        const [px, py] = rule.nearPoint;
        const nearLine = lines.find((l) => pointToSegmentDist(px, py, l.x1, l.y1, l.x2, l.y2) <= TOLERANCE.distance * 2.5);
        if (!nearLine) {
          return {
            valid: false,
            message: `Expected line passing near key point (${px.toFixed(1)}, ${py.toFixed(1)}) mm.`,
            suggestion: stepHintFallback(px, py)
          };
        }
      }

      if (rule.inRegion === "aboveXY") {
        const aboveCount = lines.filter((l) => l.y1 > -TOLERANCE.yReference && l.y2 > -TOLERANCE.yReference).length;
        if (aboveCount === 0) {
          return {
            valid: false,
            message: "Front View features must be drawn ABOVE the XY line (in VP).",
            suggestion: "Draw above the horizontal center line where Y is positive."
          };
        }
      }

      if (rule.inRegion === "belowXY") {
        const belowCount = lines.filter((l) => l.y1 < TOLERANCE.yReference && l.y2 < TOLERANCE.yReference).length;
        if (belowCount === 0) {
          return {
            valid: false,
            message: "Top View features must be drawn BELOW the XY line (in HP).",
            suggestion: "Draw below the horizontal center line where Y is negative."
          };
        }
      }

      if (rule.inRegion === "rightSide") {
        const rightCount = lines.filter((l) => Math.max(l.x1, l.x2) >= 0).length;
        if (rightCount === 0) {
          return {
            valid: false,
            message: "Draw the development geometry on the right half of the sheet (X ≥ 0 mm).",
            suggestion: "Place your development baseline to the right of the orthographic Front View."
          };
        }
      }

      return { valid: true };
    }

    case "polygon": {
      // Check for polygon entity or collection of closed lines
      const polys = elements.filter((e) => e.type === "polygon");
      const lines = elements.filter((e) => e.type === "line");

      if (polys.length === 0 && lines.length < (rule.sides || 3)) {
        return {
          valid: false,
          message: `Expected a polygon with ${rule.sides || "multiple"} sides.`,
          suggestion: "Use the Polygon generator in the toolbar to quickly place accurate regular polygons."
        };
      }

      if (rule.sides && polys.length > 0 && !polys.some((p) => p.sides === rule.sides)) {
        return {
          valid: false,
          message: `Expected a ${rule.sides}-sided polygon, found ${polys[0].sides} sides.`,
          suggestion: `Set sides to ${rule.sides} in the Polygon generator.`
        };
      }

      if (rule.edgeLength) {
        // Check polygon edge lengths
        let foundEdge = false;
        let actualEdge = 0;

        if (polys.length > 0) {
          for (const p of polys) {
            if (Math.abs(p.edgeLength - rule.edgeLength) <= TOLERANCE.length) {
              foundEdge = true;
              break;
            }
            actualEdge = p.edgeLength;
          }
        }

        if (!foundEdge && lines.length > 0) {
          const matchingLine = lines.find((l) => {
            const len = Math.hypot(l.x2 - l.x1, l.y2 - l.y1);
            actualEdge = len;
            return Math.abs(len - rule.edgeLength) <= TOLERANCE.length;
          });
          if (matchingLine) foundEdge = true;
        }

        if (!foundEdge) {
          return {
            valid: false,
            message: `Base edge is ${actualEdge.toFixed(1)} mm; expected ${rule.edgeLength} mm (±${TOLERANCE.length} mm).`,
            suggestion: `Set base edge to ${rule.edgeLength} mm using the Polygon tool or check cursor length HUD.`
          };
        }
      }

      if (rule.inRegion === "belowXY") {
        const isBelow = polys.some((p) => p.cy < 0) || lines.some((l) => l.y1 < 0 && l.y2 < 0);
        if (!isBelow) {
          return {
            valid: false,
            message: "Construct the Top View base BELOW the XY line (HP region).",
            suggestion: "Draw the base polygon in the lower half of the drafting sheet."
          };
        }
      }

      return { valid: true };
    }

    case "box": {
      // Check for rectangle (4 lines or box)
      const lines = elements.filter((e) => e.type === "line");
      if (lines.length < 3) {
        return {
          valid: false,
          message: "Construct the complete rectangular outline (FV).",
          suggestion: "Draw the base, two vertical sides, and the top face."
        };
      }

      if (rule.height) {
        const vertLengths = lines
          .filter((l) => Math.abs(l.x2 - l.x1) < TOLERANCE.distance)
          .map((l) => Math.abs(l.y2 - l.y1));
        const matchingHeight = vertLengths.find((h) => Math.abs(h - rule.height) <= TOLERANCE.length);
        if (!matchingHeight) {
          const maxH = vertLengths.length > 0 ? Math.max(...vertLengths) : 0;
          return {
            valid: false,
            message: `Prism/cylinder height measured ${maxH.toFixed(1)} mm; expected ${rule.height} mm (±${TOLERANCE.length} mm).`,
            suggestion: `Ensure vertical edges extend ${rule.height} mm from the base.`
          };
        }
      }

      if (rule.inRegion === "aboveXY") {
        const hasAbove = lines.some((l) => Math.max(l.y1, l.y2) > TOLERANCE.yReference);
        if (!hasAbove) {
          return {
            valid: false,
            message: "Draw the Front View ABOVE the XY line (where Y is positive).",
            suggestion: "Extend vertical height upwards into the VP region."
          };
        }
      }

      return { valid: true };
    }

    case "arc": {
      const hasCurve = elements.some(
        (e) =>
          (e.type === "circle" && (rule.inRegion !== "rightSide" || e.cx >= -5)) ||
          (e.type === "line" && (rule.inRegion !== "rightSide" || Math.max(e.x1, e.x2) >= 0))
      );
      if (!hasCurve) {
        return {
          valid: false,
          message: "Draw the radial arc / sector lines on the right side of the sheet.",
          suggestion: "Use Circle or Line tool from apex O to construct the radial sector."
        };
      }
      return { valid: true };
    }

    case "circle": {
      const circles = elements.filter((e) => e.type === "circle");
      if (circles.length === 0) {
        return {
          valid: false,
          message: "Circle required for this view. Use the Circle tool.",
          suggestion: "Select Circle tool, click center and enter radius."
        };
      }

      if (rule.radius) {
        const matchingRadius = circles.find((c) => Math.abs(c.radius - rule.radius) <= TOLERANCE.length);
        if (!matchingRadius) {
          return {
            valid: false,
            message: `Circle radius is ${circles[0].radius.toFixed(1)} mm; expected ${rule.radius} mm.`,
            suggestion: `Set radius to ${rule.radius} mm (diameter ${rule.radius * 2} mm).`
          };
        }
      }

      if (rule.inRegion === "belowXY") {
        if (!circles.some((c) => c.cy < 0)) {
          return {
            valid: false,
            message: "Draw the base circle in the Top View (below XY line).",
            suggestion: "Place circle center where Y is negative."
          };
        }
      }

      return { valid: true };
    }

    case "composite": {
      if (elements.length < (rule.minElements || 2)) {
        return {
          valid: false,
          message: "Complete the view with all required outline and projection lines.",
          suggestion: "Add the remaining projection and boundary lines."
        };
      }
      return { valid: true };
    }

    default:
      return { valid: true };
  }
}

function pointToSegmentDist(px, py, x1, y1, x2, y2) {
  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

function stepHintFallback(px, py) {
  return `Ensure the geometry connects through (${px.toFixed(1)}, ${py.toFixed(1)}) mm (check HUD coordinates).`;
}
