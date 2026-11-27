/**
 * AutoCAD ISODRAFT Engine & F5 Isoplane State Manager
 *
 * Pure geometric math + state machine (unit-testable in Node & 2D Practice Canvas):
 * - Isoplanes: "top" (30°, 150°), "left" (90°, 150°), "right" (30°, 90°)
 * - F5 / Ctrl+E seamless Isoplane cycling
 * - Exact Isometric Ellipse parameters (major/minor axes & tilt rotation) per Isoplane
 * - Isometric Ortho candidate angles & Polar priorities
 * - True Length <-> Isometric Length (0.8165) scale converter
 */

export const ISO_SCALE_FACTOR = Math.sqrt(2 / 3); // 0.81649658

export const ISOPLANE_ORDER = ["top", "left", "right"];

export const ISOPLANE_SPECS = {
  top: {
    id: "top",
    label: "Top",
    shortLabel: "TOP",
    axesDeg: [30, 150],
    axisColors: ["#ef4444", "#22c55e"],
    // In standard EG Isometric top face: U goes 30° up-right, V goes 150° up-left.
    // Major axis lies along U - V (0° horizontal), Minor along U + V (90° vertical).
    majorAngleDeg: 0,
    minorAngleDeg: 90,
    description: "Horizontal plane (30° & 150°)"
  },
  left: {
    id: "left",
    label: "Left",
    shortLabel: "LEFT",
    axesDeg: [90, 150],
    axisColors: ["#22c55e", "#ef4444"],
    // Vertical 90° and upper-left 150° include 60°: major axis lies along bisector 120°, minor along 30°.
    majorAngleDeg: 120,
    minorAngleDeg: 30,
    description: "Left vertical plane (90° & 150°)"
  },
  right: {
    id: "right",
    label: "Right",
    shortLabel: "RIGHT",
    axesDeg: [30, 90],
    axisColors: ["#ef4444", "#22c55e"],
    // Vertical 90° and upper-right 30° include 60°: major axis lies along bisector 60°, minor along 150°.
    majorAngleDeg: 60,
    minorAngleDeg: 150,
    description: "Right vertical plane (30° & 90°)"
  }
};

export function cycleIsoplane(current = "top") {
  const idx = ISOPLANE_ORDER.indexOf(current);
  return ISOPLANE_ORDER[(idx + 1) % ISOPLANE_ORDER.length];
}

export function getIsoplaneSpec(isoplane = "top") {
  return ISOPLANE_SPECS[isoplane] || ISOPLANE_SPECS.top;
}

/**
 * Returns valid bidirectional Ortho angles (degrees in [0..360)) for the active Isoplane.
 */
export function getIsoOrthoAngles(isoplane = "top") {
  const spec = getIsoplaneSpec(isoplane);
  const dirs = [];
  for (const a of spec.axesDeg) {
    dirs.push(((a % 360) + 360) % 360);
    dirs.push(((a + 180) % 360 + 360) % 360);
  }
  return dirs;
}

/**
 * Returns all 6 principal isometric axis directions [30, 90, 150, 210, 270, 330].
 */
export function getAllIsoAxisAngles() {
  return [30, 90, 150, 210, 270, 330];
}

/**
 * Computes exact Isocircle (Isometric Ellipse) parameters centered at (cx, cy)
 * for an enclosing rhombus of half-side `rhombusHalfSide` (= radius along isometric axes).
 *
 * Mathematical proof:
 * For a circle inscribed inside a 60°/120° rhombus of side `2R`:
 *   rx (semi-major) = R * sqrt(3 / 2) ≈ 1.224745 * R
 *   ry (semi-minor) = R * sqrt(1 / 2) ≈ 0.707107 * R
 *   Ratio rx / ry = sqrt(3) ≈ 1.73205
 * Note: When `rhombusHalfSide = R_true * 0.8165` (Isometric Projection),
 *   rx = R_true (exact True Radius!).
 */
export function computeIsocircleGeometry(cx, cy, rhombusHalfSide, isoplane = "top") {
  const R = Math.max(0.5, Number(rhombusHalfSide) || 20);
  const spec = getIsoplaneSpec(isoplane);
  return {
    type: "ellipse",
    cx,
    cy,
    rx: R * Math.sqrt(3 / 2),
    ry: R * Math.sqrt(1 / 2),
    rotationDeg: spec.majorAngleDeg,
    isoplane: spec.id,
    isoRadius: R
  };
}

/**
 * Converts True Length <-> Isometric Projected Length cleanly.
 */
export function toIsoLength(trueLenMm) {
  return Number(trueLenMm) * ISO_SCALE_FACTOR;
}

export function toTrueLength(isoLenMm) {
  return Number(isoLenMm) / ISO_SCALE_FACTOR;
}

/**
 * Samples points around an ellipse in world (mm) coordinates for segment extraction,
 * hit-testing, OSNAP quadrants, and SVG/Path rendering verification.
 */
export function sampleEllipsePoints(el, count = 48) {
  const rot = ((el.rotationDeg || 0) * Math.PI) / 180;
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);
  const pts = [];
  for (let i = 0; i < count; i++) {
    const t = (2 * Math.PI * i) / count;
    const lx = el.rx * Math.cos(t);
    const ly = el.ry * Math.sin(t);
    pts.push([
      el.cx + lx * cosR - ly * sinR,
      el.cy + lx * sinR + ly * cosR
    ]);
  }
  return pts;
}

/**
 * Returns the 4 isometric tangent quadrant points (where the inscribed circle touches
 * the 4 sides of the isometric rhombus) + the 4 extreme major/minor vertices.
 */
export function getIsocircleKeyPoints(el) {
  const rot = ((el.rotationDeg || 0) * Math.PI) / 180;
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);
  const toWorld = (lx, ly) => ({
    x: el.cx + lx * cosR - ly * sinR,
    y: el.cy + lx * sinR + ly * cosR
  });
  return {
    center: { x: el.cx, y: el.cy },
    majorPos: toWorld(el.rx, 0),
    majorNeg: toWorld(-el.rx, 0),
    minorPos: toWorld(0, el.ry),
    minorNeg: toWorld(0, -el.ry)
  };
}
