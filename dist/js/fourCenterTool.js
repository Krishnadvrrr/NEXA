/**
 * Guided "Four-Center Method" Construction Tool for Isometric Circles & Ellipses
 *
 * Given center (cx, cy), isometric half-side R (= circle radius along iso axes),
 * and isoplane ("top" | "left" | "right"):
 * 1. Constructs the 4 rhombus vertices using unit axis vectors separated by 60° / 120°.
 * 2. Identifies the two OBTUSE (120°) corners O1, O2 and two ACUTE (60°) corners A1, A2.
 * 3. Locates the 4 midpoints M0..M3 of the rhombus sides.
 * 4. Traces construction medians O1 -> opposite midpoints & O2 -> opposite midpoints.
 * 5. Computes the 2 small-arc centers C3, C4 analytically on the long diagonal:
 *    - C1 = O1, C2 = O2 with R_large = sqrt(3) * R
 *    - C3, C4 lie at 1/3 from midpoint along O1->M & O2->M with R_small = R / sqrt(3)
 *    Guarantees exact C^1 tangent continuity at all 4 midpoints!
 */

import { getIsoplaneSpec } from "./isoDraftEngine.js";

const deg2rad = (d) => (d * Math.PI) / 180;
const normAngle = (a) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

/**
 * Determines clockwise/CCW direction for shortest circular arc between `aStart` and `aEnd`
 * passing through the test direction angle of `refMidPt` from center `c`.
 */
function buildShortestTangentArc(c, r, pStart, pEnd, layerGrade = "HB", layerId = "Visible_Outline", tag = "") {
  const a1 = Math.atan2(pStart[1] - c[1], pStart[0] - c[0]);
  const a2 = Math.atan2(pEnd[1] - c[1], pEnd[0] - c[0]);
  // In standard math CCW: sweep positive angle from a1 to a2
  let ccwSweep = normAngle(a2 - a1);
  // All 4-center arcs sweep either 60° (π/3) or 120° (2π/3) — always strictly < 180° (π)!
  const worldCCW = ccwSweep <= Math.PI;
  return {
    type: "arc",
    cx: c[0],
    cy: c[1],
    radius: r,
    startAngle: a1,
    endAngle: a2,
    worldCCW,
    grade: layerGrade,
    layer: layerId,
    isFourCenterArc: true,
    arcTag: tag
  };
}

export function buildFourCenterGeometry(cx, cy, halfSideR, isoplane = "top", opts = {}) {
  const R = Math.max(2, Number(halfSideR) || 20);
  const spec = getIsoplaneSpec(isoplane);
  const aDeg = spec.axesDeg[0];
  const bDeg = spec.axesDeg[1];

  // Ensure vector u and vector v form an interior angle of 60° or 120° consistently
  // Specifically pick unit directions whose interior dot product is +0.5 (60°) or -0.5 (120°):
  const ux0 = Math.cos(deg2rad(aDeg));
  const uy0 = Math.sin(deg2rad(aDeg));
  const vx0 = Math.cos(deg2rad(bDeg));
  const vy0 = Math.sin(deg2rad(bDeg));

  // Rhombus vertices: (+u+v), (+u-v), (-u-v), (-u+v)
  // Notice: corner angle at `sU * u + sV * v` is OBTUSE (120°) iff dot(sU * u, sV * v) > 0!
  // Let's make v2 = (dot(u, v) >= 0 ? v : -v) so (+u + v2) and (-u - v2) are ALWAYS the OBTUSE (120°) corners?
  // Wait: check vertex angle at P = p + q relative to center:
  // Sides meeting at +u + v2 point along -u and -v2 -> angle between -u and -v2 equals angle between u and v2!
  // So if angle(u, v2) = 120° (dot < 0), then vertex +u + v2 has 120° interior angle (OBTUSE)!!
  // Check top: u = 30°, v = 150° -> dot = cos(120°) = -0.5 -> +u+v is TOP (0, +1), -u-v is BOTTOM (0, -1) -> BOTH ARE OBTUSE (120°)!!
  // Check left: u = 90°, v = 150° -> dot = cos(60°) = +0.5 -> flip v2 = -v = 330° -> +u + v2 is angle 30°, wait: angle(90°, 330°) = 120°!
  // Corner +u + v2 is (+√3/2, +0.5) [upper-right] and -u - v2 is (-√3/2, -0.5) [lower-left], where sides meet at 120°!
  const dotUV = ux0 * vx0 + uy0 * vy0;
  const vx = dotUV <= 0 ? vx0 : -vx0;
  const vy = dotUV <= 0 ? vy0 : -vy0;
  const ux = ux0;
  const uy = uy0;

  const pt = (su, sv) => [cx + R * (su * ux + sv * vx), cy + R * (su * uy + sv * vy)];

  // Obtuse (120°) corners O1, O2 and Acute (60°) corners A1, A2
  const O1 = pt(1, 1);
  const A1 = pt(1, -1);
  const O2 = pt(-1, -1);
  const A2 = pt(-1, 1);

  // Midpoints of the 4 sides:
  // Adjacent to O1: M_O1_u = +u (between O1 and A1), M_O1_v = +v (between O1 and A2)
  // Adjacent to O2: M_O2_u = -u (between O2 and A2), M_O2_v = -v (between O2 and A1)
  const M_posU = pt(1, 0);   // on O1-A1 (opposite O2)
  const M_posV = pt(0, 1);   // on O1-A2 (opposite O2)
  const M_negU = pt(-1, 0);  // on O2-A2 (opposite O1)
  const M_negV = pt(0, -1);  // on O2-A1 (opposite O1)

  // Construction diagonals:
  // From O1 (+u+v) to opposite midpoints M_negU (-u) and M_negV (-v)
  // From O2 (-u-v) to opposite midpoints M_posU (+u) and M_posV (+v)
  // Intersection C3 (of O1->M_negV and O2->M_posU, inside A1 quadrant): (O1 + O2 + A1)/3? Wait: let's solve algebraically!
  // Line 1: P(s) = (1-s)(u+v) + s(-v) = (1-s)u + (1-2s)v
  // Line 2: Q(t) = (1-t)(-u-v) + t(u) = (-1+2t)u + (-1+t)v
  // Solve: 1-s = -1+2t and 1-2s = -1+t => s = t = 2/3!
  // Plug s=2/3: C3 = (1/3)u - (1/3)v = (A1)/3!
  // And by symmetry, C4 (inside A2 quadrant) = (-1/3)u + (1/3)v = (A2)/3!
  const C1 = O1;
  const C2 = O2;
  const C3 = [cx + (R / 3) * (ux - vx), cy + (R / 3) * (uy - vy)];
  const C4 = [cx + (R / 3) * (-ux + vx), cy + (R / 3) * (-uy + vy)];

  const rLarge = Math.sqrt(3) * R;
  const rSmall = R / Math.sqrt(3);

  const prefix = opts.idPrefix || `fc-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
  const arcLayer = opts.layer || "Visible_Outline";
  const arcGrade = opts.grade || "HB";

  const makeLine = (a, b, suffix, layer = "Projectors_Const", grade = "2H") => ({
    id: `${prefix}-${suffix}`,
    type: "line",
    x1: a[0],
    y1: a[1],
    x2: b[0],
    y2: b[1],
    grade,
    layer,
    fourCenterGroup: prefix
  });

  // 1. Rhombus box (4 edges)
  const rhombusLines = [
    makeLine(O1, A1, "rh1"),
    makeLine(A1, O2, "rh2"),
    makeLine(O2, A2, "rh3"),
    makeLine(A2, O1, "rh4")
  ];

  // 2. Obtuse-to-opposite-midpoint construction rays (4 medians)
  const medianLines = [
    makeLine(O1, M_negU, "md1"),
    makeLine(O1, M_negV, "md2"),
    makeLine(O2, M_posU, "md3"),
    makeLine(O2, M_posV, "md4")
  ];

  // 3. Four tangent circular arcs spanning [M_negU <-> M_negV], [M_posU <-> M_posV], [M_posU <-> M_negV], [M_negU <-> M_posV]
  const arcs = [
    { ...buildShortestTangentArc(C1, rLarge, M_negV, M_negU, arcGrade, arcLayer, "large-1"), id: `${prefix}-arc1`, fourCenterGroup: prefix, isoplane: spec.id, isoRadius: R },
    { ...buildShortestTangentArc(C2, rLarge, M_posV, M_posU, arcGrade, arcLayer, "large-2"), id: `${prefix}-arc2`, fourCenterGroup: prefix, isoplane: spec.id, isoRadius: R },
    { ...buildShortestTangentArc(C3, rSmall, M_posU, M_negV, arcGrade, arcLayer, "small-1"), id: `${prefix}-arc3`, fourCenterGroup: prefix, isoplane: spec.id, isoRadius: R },
    { ...buildShortestTangentArc(C4, rSmall, M_negU, M_posV, arcGrade, arcLayer, "small-2"), id: `${prefix}-arc4`, fourCenterGroup: prefix, isoplane: spec.id, isoRadius: R }
  ];

  // 4. Center point labels (C1..C4 on Projectors_Const or Dimensions_Text)
  const labels = opts.includeLabels === false ? [] : [
    { id: `${prefix}-c1`, type: "text", x: C1[0], y: C1[1], text: "C1", grade: "2H", layer: "Projectors_Const", fourCenterGroup: prefix },
    { id: `${prefix}-c2`, type: "text", x: C2[0], y: C2[1], text: "C2", grade: "2H", layer: "Projectors_Const", fourCenterGroup: prefix },
    { id: `${prefix}-c3`, type: "text", x: C3[0], y: C3[1], text: "C3", grade: "2H", layer: "Projectors_Const", fourCenterGroup: prefix },
    { id: `${prefix}-c4`, type: "text", x: C4[0], y: C4[1], text: "C4", grade: "2H", layer: "Projectors_Const", fourCenterGroup: prefix }
  ];

  return {
    isoplane: spec.id,
    center: [cx, cy],
    isoRadius: R,
    rLarge,
    rSmall,
    corners: { O1, A1, O2, A2 },
    midpoints: { M_posU, M_posV, M_negU, M_negV },
    centers: { C1, C2, C3, C4 },
    rhombusLines,
    medianLines,
    arcs,
    labels,
    allElements: [...rhombusLines, ...medianLines, ...labels, ...arcs]
  };
}
