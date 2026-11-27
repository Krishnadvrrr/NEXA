/**
 * AutoCAD Command Alias Dictionary, CLI Parser, Coordinate Solver & Habit Coach
 */

export const AUTOCAD_COMMANDS = [
  { alias: "L", name: "LINE", category: "Draw", tool: "line", hint: "Type L + Space to draw lines faster." },
  { alias: "PL", name: "PLINE", category: "Draw", tool: "polyline", hint: "Type PL + Space to draw continuous polylines." },
  { alias: "C", name: "CIRCLE", category: "Draw", tool: "circle", hint: "Type C + Space to sketch circles." },
  { alias: "A", name: "ARC", category: "Draw", tool: "arc", hint: "Type A + Space for a 3-point Arc." },
  { alias: "REC", name: "RECTANG", category: "Draw", tool: "rect", hint: "Type REC + Space, click corner, then type @30,-30." },
  { alias: "POL", name: "POLYGON", category: "Draw", tool: "polygon", hint: "Type POL + Space for triangles, squares, pentagons, or hexagons." },
  { alias: "XL", name: "XLINE", category: "Draw", tool: "projector", hint: "Type XL + Space for construction/projector rays." },

  { alias: "M", name: "MOVE", category: "Modify", tool: "move", hint: "Type M + Space to move selected geometry." },
  { alias: "CO", name: "COPY", category: "Modify", tool: "copy", hint: "Type CO + Space to duplicate selected geometry." },
  { alias: "RO", name: "ROTATE", category: "Modify", tool: "rotate", hint: "Type RO + Space to rotate around a base point." },
  { alias: "MI", name: "MIRROR", category: "Modify", tool: "mirror", hint: "Type MI + Space to reflect across a mirror line." },
  { alias: "TR", name: "TRIM", category: "Modify", tool: "trim", hint: "Type TR + Space then click overhanging line segments to trim." },
  { alias: "EX", name: "EXTEND", category: "Modify", tool: "extend", hint: "Type EX + Space then click line ends to extend to boundaries." },
  { alias: "O", name: "OFFSET", category: "Modify", tool: "offset", hint: "Type O + Space, enter distance, and click side to offset." },
  { alias: "E", name: "ERASE", category: "Modify", tool: "eraser", hint: "Type E + Space (or press Delete) to erase geometry." },

  { alias: "DLI", name: "DIMLINEAR", category: "Annotation", tool: "dimlinear", hint: "Type DLI + Space for horizontal/vertical dimensions." },
  { alias: "DAL", name: "DIMALIGNED", category: "Annotation", tool: "dimension", hint: "Type DAL + Space for true aligned slope dimensions." },
  { alias: "DAN", name: "DIMANGULAR", category: "Annotation", tool: "dimangular", hint: "Type DAN + Space then pick two lines to dimension their angle." },
  { alias: "T", name: "TEXT", category: "Annotation", tool: "text", hint: "Type T + Space to place vertex labels (a, b, a', b')." },

  { alias: "Z", name: "ZOOM", category: "Utility", tool: "zoom_extents", hint: "Type Z + Enter or double-click middle mouse for Zoom Extents." },
  { alias: "U", name: "UNDO", category: "Utility", tool: "undo", hint: "Type U + Enter (or Ctrl+Z) to step back." },
  { alias: "P", name: "PAN", category: "Utility", tool: "pan", hint: "Hold middle mouse drag anytime to Pan without switching tools." },

  { alias: "ISODRAFT", name: "ISODRAFT", category: "Isometric", tool: "isodraft", hint: "Toggle ISODRAFT for 30°/150° grid, tilted crosshair & F5 Isoplane switching." },
  { alias: "ISOPLANE", name: "ISOPLANE (F5)", category: "Isometric", tool: "isoplane", hint: "Press F5 or Ctrl+E anytime to cycle Isoplane Top -> Left -> Right." },
  { alias: "EL", name: "ELLIPSE / ISOCIRCLE", category: "Isometric", tool: "isocircle", hint: "Type EL + Space (then I) to draw an AutoCAD Isocircle aligned to active F5 Isoplane." },
  { alias: "FC", name: "FOURCENTER", category: "Isometric", tool: "fourcenter", hint: "Type FC + Space to construct an Isometric Ellipse via the Four-Center Method." }
];

const EXTRA_ALIASES = {
  CP: "CO",
  LINE: "L",
  PLINE: "PL",
  POLYLINE: "PL",
  CIRCLE: "C",
  ARC: "A",
  RECT: "REC",
  RECTANGLE: "REC",
  RECTANG: "REC",
  POLYGON: "POL",
  XLINE: "XL",
  RAY: "XL",
  PROJECTOR: "XL",
  MOVE: "M",
  COPY: "CO",
  ROTATE: "RO",
  MIRROR: "MI",
  TRIM: "TR",
  EXTEND: "EX",
  OFFSET: "O",
  ERASE: "E",
  DELETE: "E",
  DIM: "DAL",
  DIMLINEAR: "DLI",
  DIMALIGNED: "DAL",
  DIMANGULAR: "DAN",
  TEXT: "T",
  MTEXT: "T",
  MT: "T",
  ZOOM: "Z",
  ZE: "Z",
  UNDO: "U",
  PAN: "P",
  ISO: "ISODRAFT",
  ISODRAFT: "ISODRAFT",
  ISOPLANE: "ISOPLANE",
  F5: "ISOPLANE",
  ELLIPSE: "EL",
  ISOCIRCLE: "EL",
  FOURCENTER: "FC",
  "4C": "FC"
};

export function resolveCommandAlias(raw = "") {
  const token = String(raw || "").trim().toUpperCase();
  if (!token) return null;
  const canonical = EXTRA_ALIASES[token] || token;
  return AUTOCAD_COMMANDS.find((c) => c.alias === canonical || c.name === token) || null;
}

export function getCommandByTool(toolId) {
  return AUTOCAD_COMMANDS.find((c) => c.tool === toolId) || null;
}

export function suggestCommands(prefix = "") {
  const q = String(prefix || "").trim().toUpperCase();
  if (!q) return [];
  return AUTOCAD_COMMANDS.filter(
    (c) => c.alias.startsWith(q) || c.name.startsWith(q)
  ).slice(0, 6);
}

/**
 * Parses AutoCAD coordinate & value inputs:
 * - Relative Cartesian: "@30,-30" or "@-25,40"
 * - Absolute Cartesian: "50,25"
 * - Relative/Polar: "@50<45" or "50<45"
 * - Angle only: "<45"
 * - Scalar distance/angle: "30" or "-45"
 */
export function parseCoordinateInput(raw, anchor = { x: 0, y: 0 }, cursor = { x: 10, y: 0 }) {
  const s = String(raw || "").trim();
  if (!s) return null;

  // @dx,dy (relative cartesian)
  const relCart = s.match(/^@\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (relCart) {
    return {
      kind: "point",
      x: anchor.x + parseFloat(relCart[1]),
      y: anchor.y + parseFloat(relCart[2]),
      dx: parseFloat(relCart[1]),
      dy: parseFloat(relCart[2])
    };
  }

  // x,y (absolute cartesian)
  const absCart = s.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (absCart) {
    return {
      kind: "point",
      x: parseFloat(absCart[1]),
      y: parseFloat(absCart[2])
    };
  }

  // @len<deg or len<deg
  const polar = s.match(/^@?\s*(\d+(?:\.\d+)?)\s*<\s*(-?\d+(?:\.\d+)?)$/);
  if (polar) {
    const len = parseFloat(polar[1]);
    const deg = parseFloat(polar[2]);
    const rad = (deg * Math.PI) / 180;
    return {
      kind: "polar",
      length: len,
      angle: deg,
      x: anchor.x + len * Math.cos(rad),
      y: anchor.y + len * Math.sin(rad)
    };
  }

  // <deg
  const angleOnly = s.match(/^<\s*(-?\d+(?:\.\d+)?)$/);
  if (angleOnly) {
    const deg = parseFloat(angleOnly[1]);
    const curLen = Math.hypot(cursor.x - anchor.x, cursor.y - anchor.y) || 30;
    const rad = (deg * Math.PI) / 180;
    return {
      kind: "angle",
      length: curLen,
      angle: deg,
      x: anchor.x + curLen * Math.cos(rad),
      y: anchor.y + curLen * Math.sin(rad)
    };
  }

  // Scalar number: direct distance along cursor vector or scalar parameter (angle/radius/offset)
  const numOnly = s.match(/^(-?\d+(?:\.\d+)?)$/);
  if (numOnly) {
    const val = parseFloat(numOnly[1]);
    const dx = cursor.x - anchor.x;
    const dy = cursor.y - anchor.y;
    const mag = Math.hypot(dx, dy);
    const ux = mag > 1e-4 ? dx / mag : 1;
    const uy = mag > 1e-4 ? dy / mag : 0;
    return {
      kind: "scalar",
      value: val,
      x: anchor.x + val * ux,
      y: anchor.y + val * uy
    };
  }

  return null;
}

/**
 * Generates an AutoCAD command walkthrough for any Guided EG problem step
 * (Section 4 "AutoCAD Habit Coach").
 */
export function formatStepAutoCadCommand(step, question) {
  if (!step) return "";
  if (step.autocadHint) return step.autocadHint;
  const title = (step.title || "").toLowerCase();
  const p = question?.parameters || {};
  const edge = p.baseEdge || p.diameter || 30;
  const h = p.height || 50;
  const alpha = p.alpha ?? 45;

  if (title.includes("xy")) {
    return "Type L + Space → click left on XY → move right → type 220 → Enter";
  }
  if (title.includes("top view") && (p.solid === "cylinder" || p.solid === "cone" || step.lineType === "HB" && title.includes("circle"))) {
    return `Type C + Space → click below XY → type ${(edge / 2).toFixed(0)} → Enter`;
  }
  if (title.includes("top view") && (p.solid === "squarePrism" || p.solid === "cube") && !title.includes("final")) {
    return `Type REC + Space → click below XY → type @${edge},-${edge} → Enter`;
  }
  if (step.suggestedPolygon) {
    return `Type POL + Space → ${step.suggestedPolygon.sides} sides → click below XY → ${step.suggestedPolygon.edgeLength} mm edge`;
  }
  if (title.includes("projector")) {
    return "Type XL + Space (or F8 Ortho) → snap Endpoint → drag vertically to XY → Click";
  }
  if (title.includes("simple position") && title.includes("front view")) {
    return `Type L + Space (or REC) → trace projection width & height ${h} mm above XY`;
  }
  if (title.includes("tilted") || title.includes("inclined")) {
    const tilt = 90 - alpha;
    return `Type CO + Space → move right → Type RO + Space → pick XY pivot → type ${tilt} → Enter`;
  }
  if (title.includes("cutting plane")) {
    const cutA = p.cuttingAngle || 45;
    return `Select Cutting_Plane layer → Type L + Space → pick axis cut pt → Tab → ${cutA} → Enter`;
  }
  if (title.includes("stretch-out") || title.includes("baseline")) {
    return "Type L + Space (F8 Ortho ON) → click right of FV → type total perimeter → Enter";
  }
  if (title.includes("sector")) {
    return "Type C + Space (or A) → click apex O → enter True Slant Radius → Enter";
  }
  return `Type ${step.lineType === "2H" ? "XL or L" : step.lineType === "Hidden" ? "L (Hidden_Edges layer)" : "L"} + Space to draft`;
}
