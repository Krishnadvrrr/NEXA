/**
 * Geometrically Exact Isometric Camera Rig & "Why 0.8165?" Cube-Tilt Explainer Math
 *
 * Pure mathematical core (Zero DOM dependency, unit-testable in Node & WebGL):
 * - Exact Isometric Direction: (1, 1, 1) / sqrt(3) -> Azimuth 45°, Elevation arctan(1 / sqrt(2)) ≈ 35.264°
 * - Exact Isometric Projection Ratio: sqrt(2 / 3) ≈ 0.81649658 (cos 35.2643897°)
 * - Inverse Isometric View Enlargement Factor: sqrt(3 / 2) ≈ 1.22474487
 * - Principal axis projections onto the view plane at exact 120° intervals (30° right, 150° left, 90° vertical)
 */

export const ISO_SCALE = Math.sqrt(2 / 3); // ≈ 0.8164965809
export const ISO_VIEW_FACTOR = Math.sqrt(3 / 2); // ≈ 1.2247448714
export const ISO_AZIMUTH_DEG = 45;
export const ISO_AZIMUTH_RAD = Math.PI / 4;
export const ISO_ELEVATION_RAD = Math.atan(1 / Math.SQRT2); // ≈ 0.6154797 rad (35.2643897°)
export const ISO_ELEVATION_DEG = (ISO_ELEVATION_RAD * 180) / Math.PI;

export const ISO_DIR = [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)];
export const ISO_UP = [0, 1, 0];

const cos30 = Math.sqrt(3) / 2;
const sin30 = 0.5;

/**
 * Orthonormal screen basis for an orthographic camera at (1,1,1)/sqrt(3) looking at origin:
 * - forward = (-1, -1, -1) / sqrt(3)
 * - screenRight = normalize(forward × worldUp) = (+1/sqrt(2), 0, -1/sqrt(2))
 * - screenUp = screenRight × forward = (-1/sqrt(6), +2/sqrt(6), -1/sqrt(6))
 *
 * Notice relative to front-bottom corner O along (+X_box = -Z_world, +Z_box = -X_world, +Y_box = +Y_world):
 * - (+X_box = -Z_world) projects at +30° above horizontal (to the right) with length 0.8165
 * - (+Z_box = -X_world) projects at +150° (30° left above horizontal) with length 0.8165
 * - (+Y_box = +Y_world) projects vertically at 90° with length 0.8165
 */
export function getCameraPlaneBasisFromDir(dir = ISO_DIR) {
  const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const vx = dir[0] / len;
  const vy = dir[1] / len;
  const vz = dir[2] / len;
  const fx = -vx;
  const fy = -vy;
  const fz = -vz;

  // right = normalize(forward x [0,1,0]) = [vx? no: (-fz, 0, fx)? cross([fx,fy,fz],[0,1,0]) = (-fz, 0, fx)]
  let rx = -fz;
  let ry = 0;
  let rz = fx;
  const rLen = Math.hypot(rx, ry, rz);
  if (rLen < 1e-6) {
    rx = 1;
    ry = 0;
    rz = 0;
  } else {
    rx /= rLen;
    rz /= rLen;
  }

  // up = right x forward
  const ux = ry * fz - rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy - ry * fx;

  return {
    viewDir: [vx, vy, vz],
    screenRight: [rx, ry, rz],
    screenUp: [ux, uy, uz]
  };
}

/**
 * Projects a 3D world point (x, y, z) onto the orthographic isometric viewplane.
 * Returns { x: horizontal_mm, y: vertical_mm }.
 */
export function projectWorldPointOrthographic(pt, viewDir = ISO_DIR) {
  const basis = getCameraPlaneBasisFromDir(viewDir);
  return {
    x: pt[0] * basis.screenRight[0] + pt[1] * basis.screenRight[1] + pt[2] * basis.screenRight[2],
    y: pt[0] * basis.screenUp[0] + pt[1] * basis.screenUp[1] + pt[2] * basis.screenUp[2]
  };
}

/**
 * Projects EG local box coordinates (right30Len, up90Height, left30Depth) directly
 * into 2D isometric drawing coordinates relative to box origin (ox, oy).
 * `scaleMode`: "projection" multiplies by 0.8165, "view" uses true 1.0 length.
 */
export function projectIsoBoxCoords(rightLen, upHeight, leftDepth, opts = {}) {
  const factor = opts.scaleMode === "view" ? 1.0 : opts.factor ?? ISO_SCALE;
  const ox = opts.ox || 0;
  const oy = opts.oy || 0;
  const r = rightLen * factor;
  const u = upHeight * factor;
  const l = leftDepth * factor;
  return {
    x: ox + (r - l) * cos30,
    y: oy + (r + l) * sin30 + u
  };
}

/**
 * Computes camera direction + foreshortening readout for the interactive Cube-Tilt Explainer (`t` in [0..1]).
 * Stage 0 (t = 0): Flat Front View looking along +Z (0° azimuth, 0° pitch). Edges show 1.000× true length.
 * Stage 1 (t = 0..0.5): Yaw 0° -> 45° around vertical Y axis so cube diagonal faces viewer (edge ratio = cos 45° = 0.7071 horizontal).
 * Stage 2 (t = 0.5..1.0): Pitch 0° -> 35.264° upward along body diagonal (1,1,1) -> all 3 principal edges align at 120° with exact ratio 0.8165!
 */
export function computeCubeTiltState(tRaw = 1) {
  const t = Math.max(0, Math.min(1, Number(tRaw) || 0));
  const yawProgress = Math.min(1, t / 0.5);
  const pitchProgress = Math.max(0, (t - 0.5) / 0.5);

  // Smoothstep easing for clean animation feel
  const smooth = (u) => u * u * (3 - 2 * u);
  const yawRad = smooth(yawProgress) * ISO_AZIMUTH_RAD;
  const pitchRad = smooth(pitchProgress) * ISO_ELEVATION_RAD;

  const cosP = Math.cos(pitchRad);
  const viewDir = [
    cosP * Math.sin(yawRad),
    Math.sin(pitchRad),
    cosP * Math.cos(yawRad)
  ];

  // Evaluate how a unit edge along -Z (or -X) and +Y foreshorten onto this camera plane
  const basis = getCameraPlaneBasisFromDir(viewDir);
  const projVecLen = (v) => {
    const px = v[0] * basis.screenRight[0] + v[1] * basis.screenRight[1] + v[2] * basis.screenRight[2];
    const py = v[0] * basis.screenUp[0] + v[1] * basis.screenUp[1] + v[2] * basis.screenUp[2];
    return Math.hypot(px, py);
  };

  const vertRatio = projVecLen([0, 1, 0]);
  const xEdgeRatio = projVecLen([-1, 0, 0]);
  const zEdgeRatio = projVecLen([0, 0, -1]);

  // Projected angle of -Z (front-right bottom edge) in degrees
  const rPx = -basis.screenRight[2];
  const rPy = -basis.screenUp[2];
  const rightEdgeAngleDeg = Math.hypot(rPx, rPy) > 1e-4 ? (Math.atan2(rPy, rPx) * 180) / Math.PI : 0;

  let phaseLabel = "Front View (Orthographic 1:1)";
  if (t > 0.02 && t < 0.5) phaseLabel = `Rotating 45° around vertical axis (${((yawRad * 180) / Math.PI).toFixed(1)}°)`;
  else if (t >= 0.5 && t < 0.99) phaseLabel = `Tilting forward toward 35.264° (${((pitchRad * 180) / Math.PI).toFixed(1)}°)`;
  else if (t >= 0.99) phaseLabel = "True Isometric (45° Yaw, 35.264° Tilt -> Ratio 0.8165)";

  return {
    t,
    yawDeg: (yawRad * 180) / Math.PI,
    pitchDeg: (pitchRad * 180) / Math.PI,
    viewDir,
    vertRatio,
    xEdgeRatio,
    zEdgeRatio,
    rightEdgeAngleDeg,
    phaseLabel
  };
}
