/**
 * High-Priority Anna University (GE3251) Unit V: Isometric Projection Question Bank
 *
 * All 6 progressive, exam-authentic problems complete with:
 * - True 1:1 (Isometric View) vs 0.8165 (Isometric Projection) specifications
 * - Exact Ghost Guide coordinates generated via projectIsoBoxCoords / computeIsocircleGeometry / Four-Center
 * - Step-by-step AutoCAD ISODRAFT (F5/F8/EL->I/FOURCENTER) instructions & EG concept hints
 * - Smart validation rules catching True-Length vs 0.8165 scale mistakes & Sphere-Rule errors
 */

import { ISO_SCALE, projectIsoBoxCoords } from "../isoCameraRig.js";
import { computeIsocircleGeometry } from "../isoDraftEngine.js";
import { buildFourCenterGeometry } from "../fourCenterTool.js";

export const ISO_UNIT_ID = "Isometric Projection";

const round1 = (v) => Math.round(v * 10) / 10;
const round2 = (v) => Math.round(v * 100) / 100;

function boxWireframeGhost(ox, oy, rightW, upH, leftD, scaleMode = "projection", style = "construction") {
  const p = (r, h, l) => {
    const pt = projectIsoBoxCoords(r, h, l, { ox, oy, scaleMode });
    return [round2(pt.x), round2(pt.y)];
  };
  const b1 = p(0, 0, 0), b2 = p(rightW, 0, 0), b3 = p(rightW, 0, leftD), b4 = p(0, 0, leftD);
  const t1 = p(0, upH, 0), t2 = p(rightW, upH, 0), t3 = p(rightW, upH, leftD), t4 = p(0, upH, leftD);
  return [
    { type: "line", from: b1, to: b2, style },
    { type: "line", from: b2, to: b3, style },
    { type: "line", from: b3, to: b4, style },
    { type: "line", from: b4, to: b1, style },
    { type: "line", from: t1, to: t2, style },
    { type: "line", from: t2, to: t3, style },
    { type: "line", from: t3, to: t4, style },
    { type: "line", from: t4, to: t1, style },
    { type: "line", from: b1, to: t1, style },
    { type: "line", from: b2, to: t2, style },
    { type: "line", from: b3, to: t3, style },
    { type: "line", from: b4, to: t4, style }
  ];
}

// ===========================================================================
// Precompute Exact Ghost Geometry for All 6 Exam Problems
// ===========================================================================

// Problem 1: Hexagonal Prism (Isometric View 1:1, base 25 mm, H 60 mm, O=(0,-45))
const P1_OX = 0, P1_OY = -45, P1_A = 25, P1_W = 50, P1_D = round2(25 * Math.sqrt(3)), P1_H = 60;
const p1pt = (r, h, l) => {
  const pt = projectIsoBoxCoords(r, h, l, { ox: P1_OX, oy: P1_OY, scaleMode: "view" });
  return [round2(pt.x), round2(pt.y)];
};
const p1HexBase = [
  p1pt(0, 0, P1_D / 2),
  p1pt(P1_A * 0.5, 0, 0),
  p1pt(P1_A * 1.5, 0, 0),
  p1pt(P1_W, 0, P1_D / 2),
  p1pt(P1_A * 1.5, 0, P1_D),
  p1pt(P1_A * 0.5, 0, P1_D)
];
const p1HexTop = [
  p1pt(0, P1_H, P1_D / 2),
  p1pt(P1_A * 0.5, P1_H, 0),
  p1pt(P1_A * 1.5, P1_H, 0),
  p1pt(P1_W, P1_H, P1_D / 2),
  p1pt(P1_A * 1.5, P1_H, P1_D),
  p1pt(P1_A * 0.5, P1_H, P1_D)
];
const p1FinalOutlines = [];
for (let i = 0; i < 6; i++) {
  const j = (i + 1) % 6;
  p1FinalOutlines.push({ type: "line", from: p1HexTop[i], to: p1HexTop[j], style: "outline" });
}
for (const idx of [0, 3, 4, 5]) {
  p1FinalOutlines.push({ type: "line", from: p1HexBase[idx], to: p1HexTop[idx], style: "outline" });
}
for (const [a, b] of [[0, 5], [5, 4], [4, 3]]) {
  p1FinalOutlines.push({ type: "line", from: p1HexBase[a], to: p1HexBase[b], style: "outline" });
}

// Problem 2: Cylinder (Isometric Projection 0.8165, Dia 40 mm -> R_iso=16.33, H=60 -> H_iso=48.99)
const P2_OX = 0, P2_OY = -45, P2_D = 40, P2_R = 20, P2_H = 60;
const P2_R_ISO = round2(P2_R * ISO_SCALE); // 16.33
const P2_H_ISO = round2(P2_H * ISO_SCALE); // 48.99
const p2BotCenter = projectIsoBoxCoords(P2_R, 0, P2_R, { ox: P2_OX, oy: P2_OY, scaleMode: "projection" });
const p2TopCenter = projectIsoBoxCoords(P2_R, P2_H, P2_R, { ox: P2_OX, oy: P2_OY, scaleMode: "projection" });
const p2BotFC = buildFourCenterGeometry(p2BotCenter.x, p2BotCenter.y, P2_R_ISO, "top");
const p2TopFC = buildFourCenterGeometry(p2TopCenter.x, p2TopCenter.y, P2_R_ISO, "top");
const p2BotIso = computeIsocircleGeometry(p2BotCenter.x, p2BotCenter.y, P2_R_ISO, "top");
const p2TopIso = computeIsocircleGeometry(p2TopCenter.x, p2TopCenter.y, P2_R_ISO, "top");

// Problem 3: Truncated Square Prism (Isometric Projection 0.8165, base 35 mm, H 60 mm, 45° cut at mid=30 mm)
// Left corners at rightLen=0 cut at H_L = 30 - 17.5*tan45 = 12.5 mm; Right corners at rightLen=35 cut at H_R = 47.5 mm
const P3_OX = 0, P3_OY = -45, P3_E = 35, P3_H = 60, P3_HL = 12.5, P3_HR = 47.5;
const p3pt = (r, h, l) => {
  const pt = projectIsoBoxCoords(r, h, l, { ox: P3_OX, oy: P3_OY, scaleMode: "projection" });
  return [round2(pt.x), round2(pt.y)];
};
const p3CutQuad = [
  p3pt(0, P3_HL, P3_E),
  p3pt(0, P3_HL, 0),
  p3pt(P3_E, P3_HR, 0),
  p3pt(P3_E, P3_HR, P3_E)
];
const p3BaseFront = [p3pt(0, 0, P3_E), p3pt(P3_E, 0, P3_E), p3pt(P3_E, 0, 0)];

// Problem 4: Frustum of Hexagonal Pyramid (0.8165 scale, base 30 mm, top 15 mm, H 50 mm)
const P4_OX = 0, P4_OY = -45, P4_B = 30, P4_T = 15, P4_H = 50;
const P4_W = 60, P4_D = round2(30 * Math.sqrt(3));
const p4pt = (r, h, l) => {
  const pt = projectIsoBoxCoords(r, h, l, { ox: P4_OX, oy: P4_OY, scaleMode: "projection" });
  return [round2(pt.x), round2(pt.y)];
};
const p4BasePts = [
  p4pt(0, 0, P4_D / 2),
  p4pt(P4_B * 0.5, 0, 0),
  p4pt(P4_B * 1.5, 0, 0),
  p4pt(P4_W, 0, P4_D / 2),
  p4pt(P4_B * 1.5, 0, P4_D),
  p4pt(P4_B * 0.5, 0, P4_D)
];
const p4TopOffR = (P4_W - P4_T * 2) / 2; // 15
const p4TopOffL = (P4_D - P4_T * Math.sqrt(3)) / 2; // 12.99
const p4TopPts = [
  p4pt(p4TopOffR, P4_H, P4_D / 2),
  p4pt(p4TopOffR + P4_T * 0.5, P4_H, p4TopOffL),
  p4pt(p4TopOffR + P4_T * 1.5, P4_H, p4TopOffL),
  p4pt(p4TopOffR + P4_T * 2, P4_H, P4_D / 2),
  p4pt(p4TopOffR + P4_T * 1.5, P4_H, P4_D - p4TopOffL),
  p4pt(p4TopOffR + P4_T * 0.5, P4_H, P4_D - p4TopOffL)
];

// Problem 5: Truncated Cone (0.8165 scale, Dia 50 mm, H 65 mm, 30° cut at mid=32.5 mm)
const P5_OX = 0, P5_OY = -45, P5_D = 50, P5_R = 25, P5_H = 65, P5_CH = 32.5;
const P5_R_ISO = round2(P5_R * ISO_SCALE); // 20.41
const p5pt = (r, h, l) => {
  const pt = projectIsoBoxCoords(r, h, l, { ox: P5_OX, oy: P5_OY, scaleMode: "projection" });
  return [round2(pt.x), round2(pt.y)];
};
const p5BotCenter = projectIsoBoxCoords(P5_R, 0, P5_R, { ox: P5_OX, oy: P5_OY, scaleMode: "projection" });
const p5BotIso = computeIsocircleGeometry(p5BotCenter.x, p5BotCenter.y, P5_R_ISO, "top");
// Calculate 8 cut generator points along cone cut plane y(x) = H_cut / (1 - (x/R)*(...) -> parametric slice:
// Cone surface: r(y) = R * (1 - y/H). Cut plane through (0, cutHeight) with angle 30° across X (rightLen - R):
// y_cut = cutHeight + dx * tan(30°), dx = r_y * cos(phi) -> y(phi) = cutHeight + R*(1 - y/H)*cos(phi)*tan30
// Solve for y(phi): y * (1 + (R*cos(phi)*tan30)/H) = cutHeight + R*cos(phi)*tan30
const p5CutCurvePts = [];
const tan30 = Math.tan((30 * Math.PI) / 180);
for (let k = 0; k < 12; k++) {
  const phi = (2 * Math.PI * k) / 12;
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  const yGen = (P5_CH + P5_R * c * tan30) / (1 + (P5_R * c * tan30) / P5_H);
  const rGen = P5_R * (1 - yGen / P5_H);
  const pt = projectIsoBoxCoords(P5_R + rGen * c, yGen, P5_R + rGen * s, {
    ox: P5_OX,
    oy: P5_OY,
    scaleMode: "projection"
  });
  p5CutCurvePts.push([round2(pt.x), round2(pt.y)]);
}

// Problem 6: Boss Combination — Sphere (D=40, R_true=20) on Frustum of Square Pyramid (Base 50, Top 30, H 40)
const P6_OX = 0, P6_OY = -45, P6_B = 50, P6_T = 30, P6_H = 40, P6_SR = 20;
const p6pt = (r, h, l) => {
  const pt = projectIsoBoxCoords(r, h, l, { ox: P6_OX, oy: P6_OY, scaleMode: "projection" });
  return [round2(pt.x), round2(pt.y)];
};
const p6TopOff = (P6_B - P6_T) / 2; // 10
const p6Base = [p6pt(0, 0, P6_B), p6pt(P6_B, 0, P6_B), p6pt(P6_B, 0, 0), p6pt(0, 0, 0)];
const p6Top = [
  p6pt(p6TopOff, P6_H, P6_B - p6TopOff),
  p6pt(P6_B - p6TopOff, P6_H, P6_B - p6TopOff),
  p6pt(P6_B - p6TopOff, P6_H, p6TopOff),
  p6pt(p6TopOff, P6_H, p6TopOff)
];
// Vertical sphere center sits 0.8165 * (40 + 20) = 48.99 mm above base center! Circle keeps TRUE radius 20.0 mm!
const p6SphereCenter = p6pt(P6_B / 2, P6_H + P6_SR, P6_B / 2);

export const ISOMETRIC_QUESTIONS = [
  // =========================================================================
  // 1. HEXAGONAL PRISM — Isometric View (1:1 Scale, Box Method Basics)
  // =========================================================================
  {
    id: "iso-hex-prism",
    unit: ISO_UNIT_ID,
    priorityBadge: "UNIT V · BOX METHOD (1:1 VIEW)",
    title: "Hexagonal Prism — Isometric View (Box Method Basics)",
    scaleMode: "view",
    isometric: true,
    problemStatement:
      "Draw the Isometric View of a hexagonal prism of base side 25 mm and axis length 60 mm resting on HP on its base with two of its base edges parallel to VP. Use True Scale (1:1).",
    parameters: {
      solid: "hexPrism",
      scaleMode: "view",
      baseEdge: 25,
      height: 60,
      boxWidth: 50,
      boxDepth: 43.3,
      restingOn: "base on HP (2 edges ∥ VP)"
    },
    comprehension: {
      simplePositionRule:
        "ISOMETRIC VIEW uses TRUE 1:1 scale (no 0.8165 foreshortening) because the prompt asks for 'Isometric View', not 'Isometric Projection'.",
      baseOrientationRule:
        "Enclose the 25 mm regular hexagon in a 50.0 × 43.3 mm rectangle with two flat edges along the front/back (30° right axis).",
      calculations: [
        "Enclosing Box Width (across corners) = 2 × 25 = 50.0 mm",
        "Enclosing Box Depth (across flats) = √3 × 25 = 43.3 mm",
        "Corner Offset from front/back box vertices = 25 / 2 = 12.5 mm",
        "Scale Factor = 1.000 (True Length — Isometric View)"
      ],
      visibilityTip:
        "All 6 top hexagon edges and the 4 front-facing vertical edges remain visible (HB). Back lower edges hidden inside the prism are omitted in isometric drawings!"
    },
    steps: [
      {
        stepNumber: 1,
        title: "Enable ISODRAFT & Draw 30° / 150° / 90° Isometric Axes",
        instruction:
          "Enable ISODRAFT (Status Bar) and ORTHO (F8). Starting at Origin O (0, -45), draw the horizontal reference ground ray and the two base isometric axes at 30° (right, 50 mm) and 150° (left, 43.3 mm).",
        autocadHint:
          "Click ISODRAFT + F8 (Isoplane Top) → Type L + Space → click O (0,-45) → pull right 30°, type 50 → Enter → pull left 150°, type 43.3 → Enter",
        hint:
          "Press F5 to confirm Isoplane TOP (red/green 30°/150° crosshairs). Because this is an Isometric View (1:1), enter true dimensions directly!",
        lineType: "2H",
        expectedGeometry: [
          { type: "line", from: [-60, -45], to: [60, -45], style: "axis" },
          { type: "line", from: p1pt(0, 0, 0), to: p1pt(P1_W, 0, 0), style: "construction" },
          { type: "line", from: p1pt(0, 0, 0), to: p1pt(0, 0, P1_D), style: "construction" },
          { type: "line", from: p1pt(0, 0, 0), to: p1pt(0, P1_H, 0), style: "construction" }
        ],
        validation: {
          requires: [
            { type: "isoAxes", angles: [30, 150], minCount: 2 }
          ]
        }
      },
      {
        stepNumber: 2,
        title: "Construct Complete 3D Enclosing Box (50 × 43.3 × 60 mm)",
        instruction:
          "Press F5 to switch Isoplanes (Top -> Left -> Right) and complete the 50.0 × 43.3 × 60.0 mm isometric rectangular prism enclosing box using thin 2H lines.",
        autocadHint:
          "F8 ON → L (30°: 50, 150°: 43.3) → Press F5 (Isoplane Right/Left) → L (90° vertical: 60 mm at all corners) → Close top box!",
        hint:
          "Opposite sides of an isometric enclosing box are always parallel and equal (50 mm along 30°, 43.3 mm along 150°, 60 mm along 90°).",
        lineType: "2H",
        expectedGeometry: boxWireframeGhost(P1_OX, P1_OY, P1_W, P1_H, P1_D, "view", "construction"),
        validation: {
          requires: [
            { type: "isometricBox", expectedWidth: 50, expectedDepth: 43.3, expectedHeight: 60, scaleMode: "view" }
          ]
        }
      },
      {
        stepNumber: 3,
        title: "Plot Non-Isometric Base Hexagon via Box Offsets",
        instruction:
          "Along the 50 mm sides mark 12.5 mm offsets from the corners, and mark midpoints (21.65 mm) on the 43.3 mm left/right edges to locate all 6 hexagon vertices. Turn F8 Ortho OFF to connect the non-isometric slanted edges!",
        autocadHint:
          "Press F8 (Ortho OFF) → Type PL + Space → snap corners at midpoints & 12.5 mm offsets to trace the base hexagon (Repeat on top face!)",
        hint:
          "The 4 diagonal sides of a hexagon are NON-ISOMETRIC lines — never try to draw them at 30°! Locate vertices by offsets along box edges, then join point-to-point.",
        lineType: "HB",
        expectedGeometry: [
          ...p1HexBase.map((pt, i) => ({ type: "line", from: pt, to: p1HexBase[(i + 1) % 6], style: "construction" })),
          ...p1HexTop.map((pt, i) => ({ type: "line", from: pt, to: p1HexTop[(i + 1) % 6], style: "outline" }))
        ],
        validation: {
          requires: [
            { type: "polygon", sides: 6, edgeLength: 25, toleranceOverride: 6.5 }
          ]
        }
      },
      {
        stepNumber: 4,
        title: "Darken Visible Outlines (Top Face + Front Verticals)",
        instruction:
          "Switch to Visible_Outline (HB). Draw all 6 edges of the top hexagon, the 4 visible vertical prism edges (60 mm each), and the 3 front visible base edges.",
        autocadHint:
          "Layer: Visible_Outline (0.50mm) → F8 ON (90°) for vertical prism edges (60 mm) → F8 OFF to connect top hexagon & front base",
        hint:
          "Isometric drawings normally omit hidden lines! Only darken the front/top visible edges so the 3D form pops clearly.",
        lineType: "HB",
        expectedGeometry: p1FinalOutlines,
        validation: {
          requires: [
            { type: "composite", minElements: 10 },
            { type: "line", vertical: true, minLength: 55 }
          ]
        }
      }
    ]
  },

  // =========================================================================
  // 2. CYLINDER — Isometric Projection (0.8165 Scale + Four-Center Method)
  // =========================================================================
  {
    id: "iso-cylinder",
    unit: ISO_UNIT_ID,
    priorityBadge: "UNIT V · 0.8165 + ISOCIRCLE",
    title: "Cylinder — Isometric Projection (Scale + Four-Center Method)",
    scaleMode: "projection",
    isometric: true,
    problemStatement:
      "Draw the Isometric Projection of a vertical cylinder of base diameter 40 mm and axis height 60 mm resting on HP. Apply the true isometric scale factor (0.8165) and construct circular ends as isometric ellipses.",
    parameters: {
      solid: "cylinder",
      scaleMode: "projection",
      diameter: 40,
      radius: 20,
      height: 60,
      isoDiameter: P2_R_ISO * 2,
      isoRadius: P2_R_ISO,
      isoHeight: P2_H_ISO
    },
    comprehension: {
      simplePositionRule:
        "ISOMETRIC PROJECTION requires multiplying EVERY true axis length by 0.8165 (√(2/3)).",
      baseOrientationRule:
        "Circular ends in Isoplane TOP foreshorten into isometric ellipses with Major Axis = 40.0 mm (horizontal 0°) and Minor Axis = 40/√3 = 23.1 mm (vertical 90°).",
      calculations: [
        "Isometric Base Box Side = 40 × 0.8165 = 32.66 mm (Radius = 16.33 mm)",
        "Isometric Axis Height = 60 × 0.8165 = 48.99 mm",
        "Four-Center Large Radius R1 = √3 × 16.33 = 28.28 mm",
        "Four-Center Small Radius R2 = 16.33 / √3 = 9.43 mm"
      ],
      visibilityTip:
        "Draw the complete top ellipse and the front half of the bottom ellipse visible, then join them with two vertical tangent lines (48.99 mm)!"
    },
    steps: [
      {
        stepNumber: 1,
        title: "Draw Isometric Projection Base Rhombus (32.66 × 32.66 mm)",
        instruction:
          "Apply the 0.8165 Isometric Scale! In Isoplane TOP (F5 + F8), construct the bottom enclosing rhombus of side 32.66 mm (40 × 0.8165 mm, NOT 40 mm!).",
        autocadHint:
          "ISODRAFT ON · F5 Top · F8 ON → L → click (0,-45) → type 32.66 along 30°, 32.66 along 150°, close 32.66 × 32.66 rhombus!",
        hint:
          "Use the Iso ×0.8165 quick converter in the toolbar (type 40 -> click Apply = 32.66 mm) so you never accidentally draw True Length 40 mm.",
        lineType: "2H",
        expectedGeometry: boxWireframeGhost(P2_OX, P2_OY, P2_D, P2_H, P2_D, "projection", "construction").slice(0, 4),
        validation: {
          requires: [
            { type: "isoAxes", angles: [30, 150], minCount: 2 },
            { type: "isoScaleTrap", trueLength: 40, isoLength: P2_R_ISO * 2 }
          ]
        }
      },
      {
        stepNumber: 2,
        title: "Construct Bottom Ellipse (Four-Center or EL → I Isocircle)",
        instruction:
          "Construct the bottom isometric circle centered inside the 32.66 mm rhombus using EITHER the 4-Center tool (R_iso = 16.3 mm) OR AutoCAD EL -> I Isocircle (Isoplane TOP, radius 16.3 mm).",
        autocadHint:
          "Click 4-Center (or type EL + Space -> I -> Enter) → snap rhombus center → type 16.33 → Enter",
        hint:
          "If using the Four-Center manual method, join both 120° corners to the two opposite midpoints to locate C1..C4 before sweeping.",
        lineType: "HB",
        expectedGeometry: [
          ...p2BotFC.rhombusLines.map((l) => ({ type: "line", from: [l.x1, l.y1], to: [l.x2, l.y2], style: "construction" })),
          ...p2BotFC.medianLines.map((l) => ({ type: "line", from: [l.x1, l.y1], to: [l.x2, l.y2], style: "construction" })),
          { type: "ellipse", center: [round2(p2BotIso.cx), round2(p2BotIso.cy)], rx: round2(p2BotIso.rx), ry: round2(p2BotIso.ry), rotationDeg: p2BotIso.rotationDeg, style: "outline" }
        ],
        validation: {
          requires: [
            { type: "isocircle", isoplane: "top", expectedRadius: P2_R_ISO, trueRadiusTrap: P2_R }
          ]
        }
      },
      {
        stepNumber: 3,
        title: "Elevate Top Rhombus Center by 48.99 mm & Draw Top Ellipse",
        instruction:
          "Draw the vertical axis / enclosing box edges upward by Isometric Height H_iso = 60 × 0.8165 = 48.99 mm, then construct the complete top isometric ellipse (radius 16.33 mm).",
        autocadHint:
          "Switch F5 Right/Left → draw axis up 48.99 mm → Switch F5 Top → Type EL -> I (or CO copy bottom ellipse +48.99 mm vertical)",
        hint:
          "In AutoCAD, copying (`CO`) the completed bottom ellipse vertically upward by `@0,48.99` is the fastest pro workflow!",
        lineType: "HB",
        expectedGeometry: [
          { type: "line", from: [round2(p2BotCenter.x), round2(p2BotCenter.y)], to: [round2(p2TopCenter.x), round2(p2TopCenter.y)], style: "axis" },
          ...p2TopFC.rhombusLines.map((l) => ({ type: "line", from: [l.x1, l.y1], to: [l.x2, l.y2], style: "construction" })),
          { type: "ellipse", center: [round2(p2TopIso.cx), round2(p2TopIso.cy)], rx: round2(p2TopIso.rx), ry: round2(p2TopIso.ry), rotationDeg: p2TopIso.rotationDeg, style: "outline" }
        ],
        validation: {
          requires: [
            { type: "line", vertical: true, expectedLength: P2_H_ISO, trueLengthTrap: P2_H },
            { type: "isocircle", isoplane: "top", expectedRadius: P2_R_ISO, minCount: 2 }
          ]
        }
      },
      {
        stepNumber: 4,
        title: "Connect Left & Right Tangent Extreme Generators (HB)",
        instruction:
          "Draw vertical tangent generator lines connecting the extreme left and extreme right points (major-axis ends) of the top and bottom isometric ellipses.",
        autocadHint:
          "Layer: Visible_Outline (HB) → Snap Quadrant on left/right ends of ellipses -> draw two vertical 48.99 mm lines",
        hint:
          "Tangent lines touch the horizontal extremes (`± rx`) of both ellipses cleanly!",
        lineType: "HB",
        expectedGeometry: [
          { type: "line", from: [round2(p2BotIso.cx - p2BotIso.rx), round2(p2BotIso.cy)], to: [round2(p2TopIso.cx - p2TopIso.rx), round2(p2TopIso.cy)], style: "outline" },
          { type: "line", from: [round2(p2BotIso.cx + p2BotIso.rx), round2(p2BotIso.cy)], to: [round2(p2TopIso.cx + p2TopIso.rx), round2(p2TopIso.cy)], style: "outline" }
        ],
        validation: {
          requires: [
            { type: "composite", minElements: 4 },
            { type: "line", vertical: true, expectedLength: P2_H_ISO }
          ]
        }
      }
    ]
  },

  // =========================================================================
  // 3. TRUNCATED SQUARE PRISM — Cut Solid (Height Transfer in Iso)
  // =========================================================================
  {
    id: "iso-trunc-sq-prism",
    unit: ISO_UNIT_ID,
    priorityBadge: "UNIT V · SECTION CUT SOLID",
    title: "Truncated Square Prism — Cut Solid (Height Transfer)",
    scaleMode: "projection",
    isometric: true,
    problemStatement:
      "A square prism of base 35 mm and axis 60 mm rests on HP with base edges parallel to isometric axes. It is cut by an AIP perpendicular to VP, inclined at 45° to HP, bisecting the axis. Draw its Isometric Projection.",
    parameters: {
      solid: "truncSquarePrism",
      scaleMode: "projection",
      baseEdge: 35,
      height: 60,
      cutAngle: 45,
      cutHeight: 30,
      isoEdge: round2(35 * ISO_SCALE),
      isoHeight: round2(60 * ISO_SCALE)
    },
    comprehension: {
      simplePositionRule:
        "Use Isometric Projection scale (0.8165) on ALL box dimensions and transferred cut corner heights!",
      baseOrientationRule:
        "A 45° AIP through the midpoint (30 mm) across a 35 mm prism cuts the left front/rear corners at H_L = 30 - 17.5·tan45° = 12.5 mm and right corners at H_R = 30 + 17.5 = 47.5 mm.",
      calculations: [
        "Iso Base Side = 35 × 0.8165 = 28.58 mm",
        "Iso Full Box Height = 60 × 0.8165 = 48.99 mm",
        "Cut Height Left Edges (12.5 mm true) = 12.5 × 0.8165 = 10.21 mm",
        "Cut Height Right Edges (47.5 mm true) = 47.5 × 0.8165 = 38.78 mm"
      ],
      visibilityTip:
        "Never measure the 45° angle directly on the isometric sheet! Always transfer vertical cut heights along the box vertical edges, then join with F8 Ortho OFF."
    },
    steps: [
      {
        stepNumber: 1,
        title: "Draw Isometric Enclosing Prism (28.58 × 28.58 × 48.99 mm)",
        instruction:
          "Using 0.8165 scaling, construct the thin (2H) enclosing isometric box of base 28.58 × 28.58 mm and full height 48.99 mm.",
        autocadHint:
          "ISODRAFT + F8 ON → Cycle F5 Top/Right/Left → draw 28.58 mm base at 30°/150° & 48.99 mm vertical posts",
        hint:
          "Remember: 35 × 0.8165 = 28.58 mm. Do NOT draw 35 mm true length!",
        lineType: "2H",
        expectedGeometry: boxWireframeGhost(P3_OX, P3_OY, P3_E, P3_H, P3_E, "projection", "construction"),
        validation: {
          requires: [
            { type: "isoAxes", angles: [30, 150], minCount: 2 },
            { type: "isoScaleTrap", trueLength: 35, isoLength: round2(35 * ISO_SCALE) }
          ]
        }
      },
      {
        stepNumber: 2,
        title: "Transfer Cut Elevations Vertically (10.21 mm Left, 38.78 mm Right)",
        instruction:
          "Along the two left vertical box edges measure 10.21 mm (12.5 × 0.8165) upward; along the two right vertical edges measure 38.78 mm (47.5 × 0.8165) upward from base.",
        autocadHint:
          "Layer: Visible_Outline (HB) · F8 ON → trace left verticals to 10.21 mm, right verticals to 38.78 mm",
        hint:
          "Notice the two left cut points have equal vertical height (10.21 mm) and the two right ones have equal vertical height (38.78 mm).",
        lineType: "HB",
        expectedGeometry: [
          { type: "line", from: p3pt(0, 0, P3_E), to: p3pt(0, P3_HL, P3_E), style: "outline" },
          { type: "line", from: p3pt(P3_E, 0, P3_E), to: p3pt(P3_E, P3_HR, P3_E), style: "outline" },
          { type: "line", from: p3pt(P3_E, 0, 0), to: p3pt(P3_E, P3_HR, 0), style: "outline" }
        ],
        validation: {
          requires: [
            { type: "line", vertical: true, expectedLength: round2(P3_HL * ISO_SCALE), trueLengthTrap: P3_HL }
          ]
        }
      },
      {
        stepNumber: 3,
        title: "Join Cut Section Face (Non-Isometric Sloping Edges) & Base",
        instruction:
          "Turn F8 Ortho OFF and join all 4 cut vertices to form the sloping elliptical/rectangular cut surface, plus darken the visible front base edges.",
        autocadHint:
          "Press F8 OFF → Type L → snap the 4 elevated cut points & front base edges cleanly in HB",
        hint:
          "The two sloping edges across the front & back faces are NON-ISOMETRIC lines (not at 30°!).",
        lineType: "HB",
        expectedGeometry: [
          ...p3CutQuad.map((pt, i) => ({ type: "line", from: pt, to: p3CutQuad[(i + 1) % 4], style: "outline" })),
          { type: "line", from: p3BaseFront[0], to: p3BaseFront[1], style: "outline" },
          { type: "line", from: p3BaseFront[1], to: p3BaseFront[2], style: "outline" }
        ],
        validation: {
          requires: [
            { type: "composite", minElements: 7 }
          ]
        }
      },
      {
        stepNumber: 4,
        title: "Darken Visible Outlines & Label Cut Heights (45° AIP)",
        instruction:
          "Confirm all visible front cut outlines (HB) and add a central axis line or dimension annotation verifying the transferred isometric cut heights (10.2 mm -> 38.8 mm).",
        autocadHint:
          "Layer: Dimensions_Text -> Type DAL + Space (or T) to label cut heights; keep cut section bright HB!",
        hint:
          "Check that no invisible back-bottom hidden lines clutter your final isometric view.",
        lineType: "HB",
        expectedGeometry: [
          ...p3CutQuad.map((pt, i) => ({ type: "line", from: pt, to: p3CutQuad[(i + 1) % 4], style: "outline" })),
          { type: "line", from: p3BaseFront[0], to: p3BaseFront[1], style: "outline" },
          { type: "line", from: p3BaseFront[1], to: p3BaseFront[2], style: "outline" }
        ],
        validation: {
          requires: [
            { type: "composite", minElements: 7 }
          ]
        }
      }
    ]
  },

  // =========================================================================
  // 4. FRUSTUM OF HEXAGONAL PYRAMID — Dual Enclosing Boxes
  // =========================================================================
  {
    id: "iso-frustum-hex-pyramid",
    unit: ISO_UNIT_ID,
    priorityBadge: "UNIT V · DUAL BOXES",
    title: "Frustum of a Hexagonal Pyramid (Dual Enclosing Boxes)",
    scaleMode: "projection",
    isometric: true,
    problemStatement:
      "Draw the Isometric Projection of a frustum of a hexagonal pyramid having base side 30 mm, top side 15 mm, and vertical height 50 mm, resting centrally on its hexagonal base on HP.",
    parameters: {
      solid: "frustumHexPyramid",
      scaleMode: "projection",
      baseEdge: 30,
      topEdge: 15,
      height: 50,
      isoBaseEdge: round2(30 * ISO_SCALE),
      isoTopEdge: round2(15 * ISO_SCALE),
      isoHeight: round2(50 * ISO_SCALE)
    },
    comprehension: {
      simplePositionRule:
        "Build TWO coaxially centered Isometric Enclosing Boxes: Bottom Box at Y = 0 and Top Box centered at Y_iso = 40.82 mm.",
      baseOrientationRule:
        "Both hexagons have non-isometric slanted sides, located cleanly by corner offsets inside their respective isometric boxes.",
      calculations: [
        "Bottom Box (30 mm hex × 0.8165): 48.99 mm × 42.40 mm",
        "Top Box (15 mm hex × 0.8165): 24.49 mm × 21.20 mm at height 50 × 0.8165 = 40.82 mm",
        "Top Box Inset Margin = (48.99 - 24.49)/2 = 12.25 mm along 30° & 10.60 mm along 150°",
        "Slant Edges: non-isometric lines connecting matching base -> top hex corners"
      ],
      visibilityTip:
        "Connect corresponding outer vertices of top & bottom hexagons with F8 OFF to reveal the 6 tapered trapezoidal side faces."
    },
    steps: [
      {
        stepNumber: 1,
        title: "Draw Bottom Enclosing Box (48.99 × 42.40 mm, Height 40.82 mm)",
        instruction:
          "Construct the bottom isometric box (48.99 mm along 30°, 42.40 mm along 150°) and project vertical height 40.82 mm upward.",
        autocadHint:
          "ISODRAFT + F8 ON (0.8165 scale!) → 48.99 mm along 30°, 42.40 mm along 150°, 40.82 mm vertical",
        hint:
          "Box True = 60 × 51.96 × 50 mm. Multiplied by 0.8165 = 48.99 × 42.40 × 40.82 mm.",
        lineType: "2H",
        expectedGeometry: boxWireframeGhost(P4_OX, P4_OY, P4_W, P4_H, P4_D, "projection", "construction"),
        validation: {
          requires: [
            { type: "isoAxes", angles: [30, 150], minCount: 2 },
            { type: "isoScaleTrap", trueLength: 60, isoLength: round2(60 * ISO_SCALE) }
          ]
        }
      },
      {
        stepNumber: 2,
        title: "Plot Bottom Hexagon & Centered Top Box (24.49 × 21.20 mm)",
        instruction:
          "Plot the base hexagon vertices inside the bottom box, and construct the centered upper isometric box (24.49 × 21.20 mm) on top face Y_iso = 40.82 mm.",
        autocadHint:
          "Draw 12.25 mm inset top rectangle at 40.82 mm height → plot 6 top hexagon vertices",
        hint:
          "Since top side (15 mm) is half the base side (30 mm), the upper box is exact 1/2 scale centered at the top center!",
        lineType: "2H",
        expectedGeometry: [
          ...p4BasePts.map((pt, i) => ({ type: "line", from: pt, to: p4BasePts[(i + 1) % 6], style: "construction" })),
          ...p4TopPts.map((pt, i) => ({ type: "line", from: pt, to: p4TopPts[(i + 1) % 6], style: "outline" }))
        ],
        validation: {
          requires: [
            { type: "composite", minElements: 6 }
          ]
        }
      },
      {
        stepNumber: 3,
        title: "Connect Top Hexagon & Non-Isometric Slant Edges (HB)",
        instruction:
          "Turn F8 OFF and connect the 6 top hexagon edges, front base edges, and visible tapered slant edges joining top corners to matching base corners.",
        autocadHint:
          "F8 OFF · Visible_Outline (HB) → snap top hex vertex -> matching base hex vertex",
        hint:
          "All slant edges of a pyramid frustum are NON-ISOMETRIC lines!",
        lineType: "HB",
        expectedGeometry: [
          ...p4TopPts.map((pt, i) => ({ type: "line", from: pt, to: p4TopPts[(i + 1) % 6], style: "outline" })),
          ...p4BasePts.map((pt, i) => ({ type: "line", from: pt, to: p4TopPts[i], style: "outline" })),
          ...[[0, 5], [5, 4], [4, 3]].map(([a, b]) => ({ type: "line", from: p4BasePts[a], to: p4BasePts[b], style: "outline" }))
        ],
        validation: {
          requires: [
            { type: "composite", minElements: 9 }
          ]
        }
      },
      {
        stepNumber: 4,
        title: "Verify Axis & Complete Front Base Edges (HB)",
        instruction:
          "Draw the vertical frustum center axis (40.82 mm) and confirm the front base edges and top hexagon boundary are dark continuous HB lines.",
        autocadHint:
          "Layer: Axis_Center -> vertical 40.82 mm center axis · confirm HB tapered outlines",
        hint:
          "Only the front 3 base edges are visible; the back edges hidden behind the tapered pyramid are omitted.",
        lineType: "HB",
        expectedGeometry: [
          ...p4TopPts.map((pt, i) => ({ type: "line", from: pt, to: p4TopPts[(i + 1) % 6], style: "outline" })),
          ...[[0, 5], [5, 4], [4, 3]].map(([a, b]) => ({ type: "line", from: p4BasePts[a], to: p4BasePts[b], style: "outline" }))
        ],
        validation: {
          requires: [
            { type: "composite", minElements: 9 }
          ]
        }
      }
    ]
  },

  // =========================================================================
  // 5. TRUNCATED CONE — Curved Cut Section (Generator Offsets)
  // =========================================================================
  {
    id: "iso-trunc-cone",
    unit: ISO_UNIT_ID,
    priorityBadge: "UNIT V · CURVED CUT SOLID",
    title: "Truncated Cone — Curved Cut Section (Generator Offsets)",
    scaleMode: "projection",
    isometric: true,
    problemStatement:
      "A cone of base diameter 50 mm and axis height 65 mm rests on HP. It is cut by an AIP inclined at 30° to HP passing through the midpoint of the axis. Draw its Isometric Projection.",
    parameters: {
      solid: "truncCone",
      scaleMode: "projection",
      diameter: 50,
      radius: 25,
      height: 65,
      cutAngle: 30,
      cutHeight: 32.5,
      isoDiameter: P5_R_ISO * 2,
      isoRadius: P5_R_ISO,
      isoHeight: round2(65 * ISO_SCALE)
    },
    comprehension: {
      simplePositionRule:
        "Transfer cut generator heights (3D cylindrical X, Z, Y offsets mapped by 0.8165) instead of projecting cut angles directly!",
      baseOrientationRule:
        "Construct base circle (Dia 50 × 0.8165 = 40.82 mm, R_iso = 20.41 mm) using Four-Center / EL → I and divide into 12 equal generator radial lines.",
      calculations: [
        "Base Rhombus Side = 50 × 0.8165 = 40.82 mm (Iso Radius = 20.41 mm)",
        "Midpoint Cut Elevation = 32.5 × 0.8165 = 26.54 mm",
        "Minimum Generator Cut Height (left edge) = 19.86 mm true -> 16.22 mm iso",
        "Maximum Generator Cut Height (right edge) = 42.33 mm true -> 34.56 mm iso"
      ],
      visibilityTip:
        "Trace a smooth closed Polyline/Curve (F8 OFF) through the elevated generator cut points, then draw the two extreme tangent cone boundary lines to the base ellipse."
    },
    steps: [
      {
        stepNumber: 1,
        title: "Draw Base Enclosing Rhombus (40.82 × 40.82 mm)",
        instruction:
          "In Isoplane TOP (F5 + F8), construct the 40.82 × 40.82 mm base enclosing rhombus (50 × 0.8165 mm).",
        autocadHint:
          "ISODRAFT + F5 Top + F8 ON → L → draw 40.82 mm rhombus sides at 30° / 150°",
        hint:
          "Diameter 50 mm × 0.8165 = 40.82 mm. Always scale true base size first!",
        lineType: "2H",
        expectedGeometry: boxWireframeGhost(P5_OX, P5_OY, P5_D, P5_H, P5_D, "projection", "construction").slice(0, 4),
        validation: {
          requires: [
            { type: "isoAxes", angles: [30, 150], minCount: 2 },
            { type: "isoScaleTrap", trueLength: 50, isoLength: round2(50 * ISO_SCALE) }
          ]
        }
      },
      {
        stepNumber: 2,
        title: "Draw Isometric Base Ellipse (R_iso = 20.41 mm)",
        instruction:
          "Draw the base isometric ellipse centered in the rhombus using Four-Center or EL -> I Isocircle (radius 20.41 mm).",
        autocadHint:
          "Type EL + Space -> I (or click 4-Center) → pick center → enter 20.41 → Enter",
        hint:
          "Notice true radius 25 mm becomes 25 × 0.8165 = 20.41 mm along isometric axes.",
        lineType: "HB",
        expectedGeometry: [
          { type: "ellipse", center: [round2(p5BotIso.cx), round2(p5BotIso.cy)], rx: round2(p5BotIso.rx), ry: round2(p5BotIso.ry), rotationDeg: p5BotIso.rotationDeg, style: "outline" }
        ],
        validation: {
          requires: [
            { type: "isocircle", isoplane: "top", expectedRadius: P5_R_ISO, trueRadiusTrap: P5_R }
          ]
        }
      },
      {
        stepNumber: 3,
        title: "Plot Generator Cut Heights & Trace Inclined Cut Section Curve",
        instruction:
          "Erect the cut-point generator heights along vertical (90°) iso lines from base divisions, then connect them smoothly (PL Polyline with F8 OFF) and join extreme outer generators to the base ellipse.",
        autocadHint:
          "Layer: Visible_Outline (HB) · F8 OFF → Type PL + Space → connect cut ellipse points -> draw tangent boundary lines",
        hint:
          "The inclined section through all cone generators creates an angled closed curve above the base!",
        lineType: "HB",
        expectedGeometry: [
          ...p5CutCurvePts.map((pt, i) => ({ type: "line", from: pt, to: p5CutCurvePts[(i + 1) % p5CutCurvePts.length], style: "outline" })),
          { type: "line", from: [round2(p5BotIso.cx - p5BotIso.rx), round2(p5BotIso.cy)], to: p5CutCurvePts[6], style: "outline" },
          { type: "line", from: [round2(p5BotIso.cx + p5BotIso.rx), round2(p5BotIso.cy)], to: p5CutCurvePts[0], style: "outline" }
        ],
        validation: {
          requires: [
            { type: "composite", minElements: 6 }
          ]
        }
      },
      {
        stepNumber: 4,
        title: "Erase Hidden Back Arcs / Add Center Axis & Section Hatch",
        instruction:
          "Draw the central vertical axis (53.07 mm iso height to cone apex reference) and darken only the front visible half of the base ellipse plus the closed cut ellipse.",
        autocadHint:
          "Use TRIM (TR) on concealed back base edges if needed, and verify axis centerline (Axis_Center)",
        hint:
          "The complete upper cut curve and outer tangent generators frame the truncated cone cleanly.",
        lineType: "HB",
        expectedGeometry: [
          ...p5CutCurvePts.map((pt, i) => ({ type: "line", from: pt, to: p5CutCurvePts[(i + 1) % p5CutCurvePts.length], style: "outline" })),
          { type: "line", from: p5pt(P5_R, 0, P5_R), to: p5pt(P5_R, P5_H, P5_R), style: "axis" }
        ],
        validation: {
          requires: [
            { type: "composite", minElements: 6 }
          ]
        }
      }
    ]
  },

  // =========================================================================
  // 6. COMBINATION BOSS — Sphere on Frustum of Square Pyramid (Strict Sphere Rule)
  // =========================================================================
  {
    id: "iso-sphere-frustum-boss",
    unit: ISO_UNIT_ID,
    priorityBadge: "UNIT V · BOSS COMBINATION (SPHERE RULE)",
    title: "Combination Solid — Sphere on Frustum of Square Pyramid",
    scaleMode: "projection",
    isometric: true,
    problemStatement:
      "A sphere of diameter 40 mm rests centrally on top of a frustum of a square pyramid (base side 50 mm, top side 30 mm, vertical height 40 mm). Draw its Isometric Projection.",
    parameters: {
      solid: "sphereOnFrustumSquare",
      scaleMode: "projection",
      baseEdge: 50,
      topEdge: 30,
      height: 40,
      sphereDiameter: 40,
      sphereRadius: 20,
      isoBaseEdge: round2(50 * ISO_SCALE),
      isoTopEdge: round2(30 * ISO_SCALE),
      isoHeight: round2(40 * ISO_SCALE),
      isoSphereOffset: round2(20 * ISO_SCALE)
    },
    comprehension: {
      simplePositionRule:
        "CRITICAL EXAM RULE: Scale ALL frustum edges, height, and vertical sphere center elevation by 0.8165 — BUT draw the Sphere circle itself at TRUE RADIUS (20.0 mm)!",
      baseOrientationRule:
        "Construct lower square frustum cleanly first (50×0.8165 = 40.82 mm base, 30×0.8165 = 24.49 mm top, height 32.66 mm). Locate center of top square and step UP by 20 × 0.8165 = 16.33 mm.",
      calculations: [
        "Frustum Base Side = 50 × 0.8165 = 40.82 mm",
        "Frustum Top Side = 30 × 0.8165 = 24.49 mm; Frustum Height = 40 × 0.8165 = 32.66 mm",
        "Sphere Center Elevation above top square = 20 × 0.8165 = 16.33 mm (Total = 48.99 mm)",
        "Sphere Drawn Circle Radius = TRUE RADIUS = 20.0 mm (NOT 16.33 mm!)"
      ],
      visibilityTip:
        "A circle/sphere in 3D parallel projection ALWAYS keeps its full circular radius (True R = 20 mm) — only center distances foreshorten!"
    },
    steps: [
      {
        stepNumber: 1,
        title: "Draw Frustum Base & Top Isometric Boxes (40.82 mm -> 24.49 mm)",
        instruction:
          "Apply 0.8165 scale! Construct the frustum base square (40.82 × 40.82 mm) at 30°/150°, go up 32.66 mm, and place the centered top square (24.49 × 24.49 mm).",
        autocadHint:
          "ISODRAFT + F8 ON → 40.82 mm base rhombus -> up 32.66 mm -> 8.16 mm inset -> 24.49 mm top rhombus",
        hint:
          "50 × 0.8165 = 40.82 mm; 30 × 0.8165 = 24.49 mm; Height 40 × 0.8165 = 32.66 mm.",
        lineType: "2H",
        expectedGeometry: [
          ...p6Base.map((pt, i) => ({ type: "line", from: pt, to: p6Base[(i + 1) % 4], style: "construction" })),
          ...p6Top.map((pt, i) => ({ type: "line", from: pt, to: p6Top[(i + 1) % 4], style: "outline" }))
        ],
        validation: {
          requires: [
            { type: "isoAxes", angles: [30, 150], minCount: 2 },
            { type: "isoScaleTrap", trueLength: 50, isoLength: round2(50 * ISO_SCALE) }
          ]
        }
      },
      {
        stepNumber: 2,
        title: "Draw Tapered Non-Isometric Slant Edges of Frustum (HB)",
        instruction:
          "Turn F8 Ortho OFF and connect corresponding base & top corners of the frustum with visible HB outlines (front base + top face + tapered slant edges).",
        autocadHint:
          "F8 OFF · Visible_Outline (HB) → connect frustum slant edges & top square face",
        hint:
          "Darken top square and front vertical/sloping boundaries; omit hidden back base edges.",
        lineType: "HB",
        expectedGeometry: [
          ...p6Top.map((pt, i) => ({ type: "line", from: pt, to: p6Top[(i + 1) % 4], style: "outline" })),
          { type: "line", from: p6Base[0], to: p6Base[1], style: "outline" },
          { type: "line", from: p6Base[1], to: p6Base[2], style: "outline" },
          { type: "line", from: p6Base[0], to: p6Top[0], style: "outline" },
          { type: "line", from: p6Base[1], to: p6Top[1], style: "outline" },
          { type: "line", from: p6Base[2], to: p6Top[2], style: "outline" }
        ],
        validation: {
          requires: [
            { type: "composite", minElements: 6 }
          ]
        }
      },
      {
        stepNumber: 3,
        title: "Plot Sphere Center (+16.33 mm Iso) & Draw Circle at TRUE Radius (20 mm)",
        instruction:
          "From the center of the top square face, draw a thin vertical line UP by 16.33 mm (R_iso = 20 × 0.8165). Then use CIRCLE (C) at that center with TRUE RADIUS = 20.0 mm!",
        autocadHint:
          "Axis up 16.33 mm from top face center → Type C + Space → click top center → type 20 → Enter (TRUE RADIUS 20 mm!)",
        hint:
          "Classic GE3251 Rule: Center height uses iso scale (16.33 mm), while the sphere circle itself uses TRUE radius (20.0 mm)!",
        lineType: "HB",
        expectedGeometry: [
          { type: "line", from: p6pt(P6_B / 2, P6_H, P6_B / 2), to: p6SphereCenter, style: "axis" },
          { type: "circle", center: p6SphereCenter, radius: P6_SR, style: "outline" }
        ],
        validation: {
          requires: [
            { type: "line", vertical: true, expectedLength: round2(P6_SR * ISO_SCALE), trueLengthTrap: P6_SR },
            { type: "sphereTrueRadius", expectedTrueRadius: P6_SR, wrongIsoRadius: round2(P6_SR * ISO_SCALE) }
          ]
        }
      },
      {
        stepNumber: 4,
        title: "Finish Assembly: Verify Coaxial Contact & Dimension Sphere Rule",
        instruction:
          "Ensure the Sphere contact point aligns coaxially above the 24.49 mm frustum top square and annotate True Radius R = 20 mm.",
        autocadHint:
          "Type T + Space to annotate 'SPHERE Ø40 (TRUE R=20mm)' and trim obscured frustum top edges behind the sphere!",
        hint:
          "In exams, clearly label the sphere diameter (True R = 20 mm) so examiners see you applied the strict EG Sphere Rule.",
        lineType: "HB",
        expectedGeometry: [
          { type: "circle", center: p6SphereCenter, radius: P6_SR, style: "outline" },
          ...p6Base.slice(0, 2).map((pt, i) => ({ type: "line", from: pt, to: p6Base[i + 1], style: "outline" }))
        ],
        validation: {
          requires: [
            { type: "sphereTrueRadius", expectedTrueRadius: P6_SR, wrongIsoRadius: round2(P6_SR * ISO_SCALE) },
            { type: "composite", minElements: 8 }
          ]
        }
      }
    ]
  }
];
