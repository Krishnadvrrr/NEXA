import { LayerManager, extractElementSegments } from "./layerManager.js";
import { OsnapEngine, segmentIntersection, lineCircleIntersections } from "./osnapEngine.js";
import { selectEntitiesInBox, hitTestEntity, drawSelectionBox, distToSegWorld } from "./selectionBox.js";
import { DynamicInputHUD } from "./dynamicInput.js";
import { parseCoordinateInput } from "./commandParser.js";
import {
  cycleIsoplane,
  getIsoplaneSpec,
  getIsoOrthoAngles,
  getAllIsoAxisAngles,
  computeIsocircleGeometry
} from "./isoDraftEngine.js";
import { buildFourCenterGeometry } from "./fourCenterTool.js";

/**
 * Scaled Drafting Canvas Engine — AutoCAD Model Space Edition
 * - Model Space pure black canvas (#000000), bottom-left 2D UCS Icon, full-screen crosshair + pickbox
 * - Pure Polar Constraint Solver (Ortho F8, Polar F10, ∠/L Locks, Edge-Relative snapping)
 * - AutoCAD Osnap Engine (Endpoint, Midpoint, Center, Intersection, Perpendicular, Quadrant, XY)
 * - Window (L->R blue solid) & Crossing (R->L green dashed) Selection
 * - Complete Draw Commands: LINE, PLINE, CIRCLE, ARC (3-pt), RECTANG, POLYGON, XLINE (XL), DLI, DAL, DAN, T
 * - Complete Modify Commands: MOVE, COPY, ROTATE, MIRROR, TRIM, EXTEND, OFFSET, ERASE
 * - DYNMODE (F12) Floating Length/Angle Entry + Middle-mouse Pan, Wheel Cursor-Zoom & Zoom Extents
 */

const normalizeDeg = (d) => ((d % 360) + 360) % 360;
const angDiffDeg = (a, b) => {
  const diff = Math.abs(normalizeDeg(a) - normalizeDeg(b));
  return Math.min(diff, 360 - diff);
};

export function computePolarConstraint(fromWorld, toWorld, opts = {}) {
  const dx = toWorld.x - fromWorld.x;
  const dy = toWorld.y - fromWorld.y;
  const rawLen = Math.hypot(dx, dy);
  const lockedLen = Number(opts.lockedLengthMm) > 0 ? Number(opts.lockedLengthMm) : null;

  if (rawLen < 0.05 && !lockedLen) {
    return { point: toWorld, snappedInfo: null };
  }

  const targetLen = lockedLen || rawLen;
  const rawDeg = rawLen >= 0.05 ? normalizeDeg((Math.atan2(dy, dx) * 180) / Math.PI) : 0;

  if (opts.orthoLock) {
    const orthoCandidates = opts.isoDraft ? getIsoOrthoAngles(opts.isoplane || "top") : [0, 90, 180, 270];
    let best = orthoCandidates[0];
    let bestD = Infinity;
    for (const c of orthoCandidates) {
      const d = angDiffDeg(rawDeg, c);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    const rad = (best * Math.PI) / 180;
    return {
      point: { x: fromWorld.x + targetLen * Math.cos(rad), y: fromWorld.y + targetLen * Math.sin(rad) },
      snappedInfo: {
        deg: best,
        label: opts.isoDraft ? `ISO ORTHO ${best}°` : `ORTHO ${best}°`,
        mode: "ortho"
      }
    };
  }

  if (opts.lockedAngleDeg !== null && opts.lockedAngleDeg !== undefined && Number.isFinite(Number(opts.lockedAngleDeg))) {
    const a = Number(opts.lockedAngleDeg);
    let candidates;
    let labelSuffix = "";

    if (opts.angleRelativeTo === "edge" && Number.isFinite(opts.refEdgeAngleDeg)) {
      const ref = opts.refEdgeAngleDeg;
      candidates = [ref + a, ref - a, ref + 180 + a, ref + 180 - a].map(normalizeDeg);
      labelSuffix = ` (to edge)`;
    } else if (a >= 0 && a <= 90) {
      candidates = [a, 180 - a, 180 + a, 360 - a].map(normalizeDeg);
    } else {
      candidates = [a, a + 180].map(normalizeDeg);
    }

    let best = candidates[0];
    let bestD = Infinity;
    for (const c of candidates) {
      const d = angDiffDeg(rawDeg, c);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    const rad = (best * Math.PI) / 180;
    return {
      point: { x: fromWorld.x + targetLen * Math.cos(rad), y: fromWorld.y + targetLen * Math.sin(rad) },
      snappedInfo: { deg: best, label: `LOCK ${Math.abs(a)}°${labelSuffix}`, mode: "lock" }
    };
  }

  if (opts.angleSnap) {
    const snapWindow = 4.2;
    let best = null;
    let bestD = snapWindow;
    let bestLabel = "";

    if (Number.isFinite(opts.refEdgeAngleDeg) && Math.abs(opts.refEdgeAngleDeg % 90) > 1.5) {
      const ref = opts.refEdgeAngleDeg;
      for (const rel of [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330]) {
        const cand = normalizeDeg(ref + rel);
        const d = angDiffDeg(rawDeg, cand);
        if (d < bestD) {
          bestD = d;
          best = cand;
          const acuteRel = rel > 180 ? 360 - rel : rel;
          const displayRel = acuteRel > 90 ? 180 - acuteRel : acuteRel;
          bestLabel = displayRel === 90 ? "90° ⊥ edge" : displayRel === 0 ? "∥ edge" : `${displayRel}° to edge`;
        }
      }
    }

    for (let target = 0; target < 360; target += 15) {
      const d = angDiffDeg(rawDeg, target);
      if (d <= bestD + 0.3 && d < snapWindow) {
        bestD = d;
        best = target;
        bestLabel = opts.isoDraft && getAllIsoAxisAngles().includes(target) ? `ISO ${target}°` : `${target}° SNAP`;
      }
    }

    if (best !== null) {
      const rad = (best * Math.PI) / 180;
      return {
        point: { x: fromWorld.x + targetLen * Math.cos(rad), y: fromWorld.y + targetLen * Math.sin(rad) },
        snappedInfo: { deg: best, label: bestLabel, mode: "snap" }
      };
    }
  }

  const rad = (rawDeg * Math.PI) / 180;
  return {
    point: lockedLen
      ? { x: fromWorld.x + targetLen * Math.cos(rad), y: fromWorld.y + targetLen * Math.sin(rad) }
      : toWorld,
    snappedInfo: null
  };
}

export function parseDynamicEntry(raw) {
  const s = String(raw || "").trim().replace(/^@/, "");
  if (!s) return null;
  const polar = s.match(/^(\d+(?:\.\d+)?)\s*<\s*(-?\d+(?:\.\d+)?)$/);
  if (polar) return { length: parseFloat(polar[1]), angle: parseFloat(polar[2]) };
  const angleOnly = s.match(/^<\s*(-?\d+(?:\.\d+)?)$/);
  if (angleOnly) return { length: null, angle: parseFloat(angleOnly[1]) };
  const lenOnly = s.match(/^(\d+(?:\.\d+)?)$/);
  if (lenOnly) return { length: parseFloat(lenOnly[1]), angle: null };
  return null;
}

// ===========================================================================
// PURE GEOMETRIC TRANSFORM & EDITING KERNELS (Unit-Testable)
// ===========================================================================

export function circumcircle3Pt(p1, p2, p3) {
  const d = 2 * (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y));
  if (Math.abs(d) < 1e-6) return null;
  const p1sq = p1.x * p1.x + p1.y * p1.y;
  const p2sq = p2.x * p2.x + p2.y * p2.y;
  const p3sq = p3.x * p3.x + p3.y * p3.y;
  const cx = (p1sq * (p2.y - p3.y) + p2sq * (p3.y - p1.y) + p3sq * (p1.y - p2.y)) / d;
  const cy = (p1sq * (p3.x - p2.x) + p2sq * (p1.x - p3.x) + p3sq * (p2.x - p1.x)) / d;
  const radius = Math.hypot(p1.x - cx, p1.y - cy);
  if (!Number.isFinite(radius) || radius < 0.2 || radius > 2000) return null;

  const a1 = Math.atan2(p1.y - cy, p1.x - cx);
  const a2 = Math.atan2(p2.y - cy, p2.x - cx);
  const a3 = Math.atan2(p3.y - cy, p3.x - cx);

  // Determine sweep orientation so p2 lies strictly between a1 and a3
  const cwSweep = ((a1 - a3) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  const cwMid = ((a1 - a2) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  const anticlockwise = cwMid > cwSweep; // screen Y-flipped later, store in world math coords (CCW if false -> world standard!)
  return { cx, cy, radius, startAngle: a1, endAngle: a3, worldCCW: !anticlockwise };
}

export function createRectPoints(c1, c2) {
  return [
    [c1.x, c1.y],
    [c2.x, c1.y],
    [c2.x, c2.y],
    [c1.x, c2.y]
  ];
}

export function transformEntity(el, fnPoint, rotDeg = 0) {
  const clone = JSON.parse(JSON.stringify(el));
  if (clone.type === "line" || clone.type === "dimension") {
    const a = fnPoint({ x: clone.x1, y: clone.y1 });
    const b = fnPoint({ x: clone.x2, y: clone.y2 });
    clone.x1 = a.x;
    clone.y1 = a.y;
    clone.x2 = b.x;
    clone.y2 = b.y;
    if (clone.px !== undefined && clone.py !== undefined) {
      const p = fnPoint({ x: clone.px, y: clone.py });
      clone.px = p.x;
      clone.py = p.y;
    }
  } else if (clone.type === "circle") {
    const c = fnPoint({ x: clone.cx, y: clone.cy });
    clone.cx = c.x;
    clone.cy = c.y;
  } else if (clone.type === "ellipse") {
    const c = fnPoint({ x: clone.cx, y: clone.cy });
    clone.cx = c.x;
    clone.cy = c.y;
    clone.rotationDeg = (clone.rotationDeg || 0) + rotDeg;
  } else if (clone.type === "arc") {
    const c = fnPoint({ x: clone.cx, y: clone.cy });
    clone.cx = c.x;
    clone.cy = c.y;
    const rad = (rotDeg * Math.PI) / 180;
    clone.startAngle += rad;
    clone.endAngle += rad;
  } else if ((clone.type === "polygon" || clone.type === "polyline") && Array.isArray(clone.points)) {
    clone.points = clone.points.map((pt) => {
      const r = fnPoint({ x: pt[0], y: pt[1] });
      return [r.x, r.y];
    });
    if (clone.cx !== undefined && clone.cy !== undefined) {
      const c = fnPoint({ x: clone.cx, y: clone.cy });
      clone.cx = c.x;
      clone.cy = c.y;
    }
  } else if (clone.type === "text") {
    const p = fnPoint({ x: clone.x, y: clone.y });
    clone.x = p.x;
    clone.y = p.y;
  }
  return clone;
}

export function mirrorEntity(el, m1, m2) {
  const dx = m2.x - m1.x;
  const dy = m2.y - m1.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-8) return JSON.parse(JSON.stringify(el));
  const reflectPt = (p) => {
    const t = ((p.x - m1.x) * dx + (p.y - m1.y) * dy) / len2;
    const fx = m1.x + t * dx;
    const fy = m1.y + t * dy;
    return { x: 2 * fx - p.x, y: 2 * fy - p.y };
  };
  const mirrored = transformEntity(el, reflectPt, 0);
  if (mirrored.type === "ellipse") {
    const lineAngDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    mirrored.rotationDeg = 2 * lineAngDeg - (el.rotationDeg || 0);
  } else if (mirrored.type === "arc") {
    const lineAng = Math.atan2(dy, dx);
    const ns = 2 * lineAng - el.startAngle;
    const ne = 2 * lineAng - el.endAngle;
    mirrored.startAngle = ne;
    mirrored.endAngle = ns;
    mirrored.worldCCW = !el.worldCCW;
  }
  return mirrored;
}

/**
 * Computes Trim spans on target `line` element against all other elements in `allElements`.
 * Returns replacement array of 0, 1, or 2 trimmed line elements removing the span containing `pickWorld`.
 */
export function trimLineAtPoint(targetLine, pickWorld, allElements) {
  if (!targetLine || targetLine.type !== "line") return null;
  const a = [targetLine.x1, targetLine.y1];
  const b = [targetLine.x2, targetLine.y2];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return null;

  const ts = [0, 1];
  for (const other of allElements) {
    if (other.id === targetLine.id) continue;
    for (const seg of extractElementSegments(other)) {
      const hit = segmentIntersection(a, b, seg.a, seg.b);
      if (hit && hit.t > 0.002 && hit.t < 0.998) ts.push(hit.t);
    }
    if (other.type === "circle" || other.type === "arc") {
      for (const h of lineCircleIntersections(a, b, other.cx, other.cy, other.radius)) {
        if (h.t > 0.002 && h.t < 0.998) ts.push(h.t);
      }
    }
  }

  ts.sort((x, y) => x - y);
  const uniqT = [];
  for (const t of ts) {
    if (uniqT.length === 0 || t - uniqT[uniqT.length - 1] > 0.003) uniqT.push(t);
  }
  if (uniqT.length < 2) return null;

  const tPick = Math.max(0, Math.min(1, ((pickWorld.x - a[0]) * dx + (pickWorld.y - a[1]) * dy) / len2));
  let removeIdx = 0;
  for (let i = 0; i < uniqT.length - 1; i++) {
    if (tPick >= uniqT[i] && tPick <= uniqT[i + 1]) {
      removeIdx = i;
      break;
    }
  }

  // Build kept spans before & after removed sub-span
  const kept = [];
  if (removeIdx > 0) {
    const tEnd = uniqT[removeIdx];
    kept.push({
      ...targetLine,
      id: targetLine.id + "-a",
      x1: a[0],
      y1: a[1],
      x2: a[0] + tEnd * dx,
      y2: a[1] + tEnd * dy
    });
  }
  if (removeIdx < uniqT.length - 2) {
    const tStart = uniqT[removeIdx + 1];
    kept.push({
      ...targetLine,
      id: targetLine.id + "-b",
      x1: a[0] + tStart * dx,
      y1: a[1] + tStart * dy,
      x2: b[0],
      y2: b[1]
    });
  }

  return {
    removedSpan: {
      x1: a[0] + uniqT[removeIdx] * dx,
      y1: a[1] + uniqT[removeIdx] * dy,
      x2: a[0] + uniqT[removeIdx + 1] * dx,
      y2: a[1] + uniqT[removeIdx + 1] * dy
    },
    kept
  };
}

/**
 * Extends either endpoint of `targetLine` (nearest to `pickWorld`) to the closest intersection boundary forward.
 */
export function extendLineToBoundary(targetLine, pickWorld, allElements) {
  if (!targetLine || targetLine.type !== "line") return null;
  const dStart = Math.hypot(pickWorld.x - targetLine.x1, pickWorld.y - targetLine.y1);
  const dEnd = Math.hypot(pickWorld.x - targetLine.x2, pickWorld.y - targetLine.y2);
  const extendEnd = dEnd <= dStart;

  const anchor = extendEnd ? [targetLine.x1, targetLine.y1] : [targetLine.x2, targetLine.y2];
  const tip = extendEnd ? [targetLine.x2, targetLine.y2] : [targetLine.x1, targetLine.y1];
  const vx = tip[0] - anchor[0];
  const vy = tip[1] - anchor[1];
  const baseLen = Math.hypot(vx, vy);
  if (baseLen < 1e-4) return null;

  const ux = vx / baseLen;
  const uy = vy / baseLen;
  const rayFar = [tip[0] + ux * 1500, tip[1] + uy * 1500];

  let bestDist = Infinity;
  let bestPt = null;

  const testHit = (hx, hy) => {
    const forward = (hx - tip[0]) * ux + (hy - tip[1]) * uy;
    if (forward > 0.2 && forward < bestDist) {
      bestDist = forward;
      bestPt = { x: hx, y: hy };
    }
  };

  for (const other of allElements) {
    if (other.id === targetLine.id) continue;
    for (const seg of extractElementSegments(other)) {
      const hit = segmentIntersection(tip, rayFar, seg.a, seg.b);
      if (hit) testHit(hit.x, hit.y);
    }
    if (other.type === "circle" || other.type === "arc") {
      for (const h of lineCircleIntersections(tip, rayFar, other.cx, other.cy, other.radius)) {
        testHit(h.x, h.y);
      }
    }
  }

  // Also allow extending strictly to XY line
  const xyHit = segmentIntersection(tip, rayFar, [-2000, 0], [2000, 0]);
  if (xyHit) testHit(xyHit.x, xyHit.y);

  if (!bestPt) return null;
  const updated = { ...targetLine };
  if (extendEnd) {
    updated.x2 = bestPt.x;
    updated.y2 = bestPt.y;
  } else {
    updated.x1 = bestPt.x;
    updated.y1 = bestPt.y;
  }
  return { from: { x: tip[0], y: tip[1] }, to: bestPt, updated };
}

/**
 * Computes parallel/concentric offset clone of an entity by distance `distMm` toward `sidePointWorld`.
 */
export function offsetEntity(el, distMm, sidePointWorld, idSuffix = Date.now()) {
  if (!el || !Number.isFinite(distMm) || distMm <= 0.05) return null;
  if (el.type === "line") {
    const dx = el.x2 - el.x1;
    const dy = el.y2 - el.y1;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) return null;
    const nx = -dy / len;
    const ny = dx / len;
    const crossSide = (sidePointWorld.x - el.x1) * nx + (sidePointWorld.y - el.y1) * ny;
    const sign = crossSide >= 0 ? 1 : -1;
    return {
      ...el,
      id: `${el.id}-off-${idSuffix}`,
      x1: el.x1 + sign * nx * distMm,
      y1: el.y1 + sign * ny * distMm,
      x2: el.x2 + sign * nx * distMm,
      y2: el.y2 + sign * ny * distMm
    };
  }
  if (el.type === "circle" || el.type === "arc") {
    const d = Math.hypot(sidePointWorld.x - el.cx, sidePointWorld.y - el.cy);
    const nextR = d >= el.radius ? el.radius + distMm : Math.max(1, el.radius - distMm);
    return { ...el, id: `${el.id}-off-${idSuffix}`, radius: nextR };
  }
  if (el.type === "polygon" && el.cx !== undefined && Array.isArray(el.points)) {
    const avgR = Math.hypot(el.points[0][0] - el.cx, el.points[0][1] - el.cy);
    const dSide = Math.hypot(sidePointWorld.x - el.cx, sidePointWorld.y - el.cy);
    const factor = (dSide >= avgR ? avgR + distMm : Math.max(2, avgR - distMm)) / (avgR || 1);
    return {
      ...el,
      id: `${el.id}-off-${idSuffix}`,
      edgeLength: (el.edgeLength || 30) * factor,
      points: el.points.map((pt) => [
        el.cx + (pt[0] - el.cx) * factor,
        el.cy + (pt[1] - el.cy) * factor
      ])
    };
  }
  return null;
}

// ===========================================================================
// PRACTICE CANVAS CLASS
// ===========================================================================

export class PracticeCanvas {
  constructor(canvas, hudElement, snapHudElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.hud = hudElement;
    this.snapHud = snapHudElement;

    this.basePxPerMm = 4;
    this.zoom = 1.0;
    this.originX = canvas.width / 2;
    this.originY = canvas.height / 2;

    // AutoCAD Core Modules
    this.layerManager = new LayerManager();
    this.osnap = new OsnapEngine();
    this.dynHud = canvas.parentElement
      ? new DynamicInputHUD(canvas.parentElement, {
          onCommit: (payload) => this.handleDynamicCommit(payload),
          onValuePreview: () => this.render(),
          onCancel: () => this.cancelCommand()
        })
      : {
          enabled: true,
          visible: false,
          isFocused: () => false,
          feedCharacter: () => false,
          update: () => {},
          hide: () => {},
          resetEdits: () => {},
          resolveTargetPoint: () => null
        };

    // Tools & Drafting Aids
    this.tool = "line"; // select, line, polyline, circle, arc, rect, polygon, projector, move, copy, rotate, mirror, trim, extend, offset, eraser, pan, dimlinear, dimension, dimangular, text
    this.pencilGrade = "HB";
    this.gridEnabled = true;      // F7
    this.gridSnapEnabled = false; // F9
    this.orthoLock = false;       // F8
    this.angleSnap = true;        // F10
    this.isoDraftEnabled = false; // ISODRAFT
    this.isoplane = "top";        // F5 Isoplane: top | left | right
    this.lockedAngleDeg = null;
    this.angleRelativeTo = "xy";
    this.lockedLengthMm = null;
    this.refEdgeAngleDeg = null;
    this.snappedAngleInfo = null;
    this.showGhostGuide = false;
    this.ghostElements = [];

    // Elements, Selection & History
    this.elements = [];
    this.selectedIds = new Set();
    this.history = [];
    this.redoStack = [];
    this.onElementsChanged = null;
    this.onPreviewChanged = null;
    this.onCommandPromptChange = null;
    this.onCommandLog = null;
    this.onLayerChanged = null;
    this.onToolChanged = null;
    this.onAidStateChanged = null;
    this.onIsoStateChanged = null;

    // Interactive Command State Machine
    this.isDrawing = false;
    this.clickClickActive = false;
    this.pointerDownScreen = null;
    this.dragStart = null;
    this.arcPoints = [];
    this.polyPoints = [];
    this.boxSelStart = null;
    this.boxSelCurrent = null;

    // Modify / Dimension Command Sub-States
    this.cmdStage = null; // e.g., "selectObjects" | "basePoint" | "displacement" | "angle" | "mirror2" | "offsetDist" | "pickObject" | "pickSide" | "dimPt2" | "dimPlace" | "angPick2"
    this.cmdOriginPt = null;
    this.cmdTargetEl = null;
    this.cmdAuxPt = null;
    this.lastOffsetDist = 10;
    this.hoverPreviewInfo = null; // Trim span highlight / Extend target / Offset ghost

    this.isPanning = false;
    this.panStartX = 0;
    this.panStartY = 0;
    this.mouseScreen = { x: 0, y: 0, inside: false };
    this.currentWorldPos = { x: 0, y: 0 };
    this.activeSnap = null;
    this.nextTvLabel = "a";
    this.nextFvLabel = "a'";
    this.polygonSettings = { sides: 4, edgeLength: 30, angle: 0 };

    this.initEvents();
    this.resize();
    this.saveState();
    this.updateCommandPrompt();
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth || 900;
    const h = parent.clientHeight || 600;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";

    this.ctx.resetTransform();
    this.ctx.scale(dpr, dpr);

    if (this.originX === 0 && this.originY === 0) {
      this.originX = w / 2;
      this.originY = h / 2;
    }
    this.render();
  }

  worldToScreen(x_mm, y_mm) {
    const scale = this.basePxPerMm * this.zoom;
    return {
      x: this.originX + x_mm * scale,
      y: this.originY - y_mm * scale
    };
  }

  screenToWorld(sx, sy) {
    const scale = this.basePxPerMm * this.zoom;
    return {
      x: (sx - this.originX) / scale,
      y: (this.originY - sy) / scale
    };
  }

  getActiveLayerAndGrade() {
    const layer = this.layerManager.getActiveLayer();
    return {
      layer: layer.id,
      grade: layer.grade || this.pencilGrade
    };
  }

  setLayer(layerId) {
    const layer = this.layerManager.setActiveLayer(layerId);
    this.pencilGrade = layer.grade || "HB";
    this.onLayerChanged?.(layer);
    this.render();
  }

  setPencilGrade(grade) {
    this.pencilGrade = grade;
    this.layerManager.setActiveByGrade(grade);
    this.onLayerChanged?.(this.layerManager.getActiveLayer());
    this.render();
  }

  toggleAid(kind) {
    if (kind === "grid") this.gridEnabled = !this.gridEnabled;
    else if (kind === "gridSnap") this.gridSnapEnabled = !this.gridSnapEnabled;
    else if (kind === "ortho") this.orthoLock = !this.orthoLock;
    else if (kind === "polar") this.angleSnap = !this.angleSnap;
    else if (kind === "osnap") this.osnap.enabled = !this.osnap.enabled;
    else if (kind === "dyn") {
      this.dynHud.enabled = !this.dynHud.enabled;
      if (!this.dynHud.enabled) this.dynHud.hide();
    } else if (kind === "lwt") {
      this.layerManager.showLineweight = !this.layerManager.showLineweight;
    } else if (kind === "isodraft") {
      this.setIsoDraft(!this.isoDraftEnabled);
      return;
    } else if (kind === "isoplane") {
      this.cycleIsoplaneMode();
      return;
    }
    this.onAidStateChanged?.();
    this.render();
  }

  setIsoDraft(enabled, nextIsoplane = null) {
    this.isoDraftEnabled = Boolean(enabled);
    if (nextIsoplane) this.isoplane = nextIsoplane;
    this.onAidStateChanged?.();
    this.onIsoStateChanged?.({ enabled: this.isoDraftEnabled, isoplane: this.isoplane });
    this.render();
  }

  cycleIsoplaneMode() {
    this.isoplane = cycleIsoplane(this.isoplane);
    if (!this.isoDraftEnabled) this.isoDraftEnabled = true;
    const spec = getIsoplaneSpec(this.isoplane);
    this.onCommandLog?.(`<Isoplane ${spec.label}> (${spec.description})`, "sys");
    this.onAidStateChanged?.();
    this.onIsoStateChanged?.({ enabled: this.isoDraftEnabled, isoplane: this.isoplane });
    this.updateCommandPrompt();
    this.render();
    return this.isoplane;
  }

  hasActiveCommand() {
    if (this.isDrawing && this.dragStart) return true;
    if (this.cmdStage) return true;
    if (this.tool === "arc" && this.arcPoints.length > 0) return true;
    if (this.tool === "polyline" && this.polyPoints.length > 0) return true;
    return false;
  }

  updateCommandPrompt() {
    let prompt = "Command: ";
    const t = this.tool;
    if (t === "line") {
      prompt = this.isDrawing && this.dragStart ? "LINE Specify next point or [Enter]:" : "LINE Specify first point:";
    } else if (t === "polyline") {
      prompt = this.polyPoints.length > 0 ? "PLINE Specify next point or [Enter to close/finish]:" : "PLINE Specify start point:";
    } else if (t === "circle") {
      prompt = this.isDrawing && this.dragStart ? "CIRCLE Specify radius of circle:" : "CIRCLE Specify center point:";
    } else if (t === "isocircle") {
      const planeLabel = getIsoplaneSpec(this.isoplane).label;
      if (this.cmdStage === "ellipseOption") {
        prompt = `ELLIPSE Specify center or [Isocircle] (F5=${planeLabel}):`;
      } else {
        prompt = this.isDrawing && this.dragStart
          ? `ISOCIRCLE (${planeLabel}) Specify iso radius (press F5 to flip plane):`
          : `ISOCIRCLE (${planeLabel}) Specify center of isocircle:`;
      }
    } else if (t === "fourcenter") {
      const planeLabel = getIsoplaneSpec(this.isoplane).label;
      prompt = this.isDrawing && this.dragStart
        ? `FOURCENTER (${planeLabel}) Specify iso radius of rhombus/ellipse:`
        : `FOURCENTER (${planeLabel}) Specify center of Four-Center rhombus:`;
    } else if (t === "arc") {
      prompt =
        this.arcPoints.length === 0
          ? "ARC Specify start point:"
          : this.arcPoints.length === 1
            ? "ARC Specify second point on arc:"
            : "ARC Specify end point of arc:";
    } else if (t === "rect") {
      prompt = this.isDrawing && this.dragStart ? "RECTANG Specify other corner or [@dx,dy]:" : "RECTANG Specify first corner point:";
    } else if (t === "polygon") {
      prompt = `POLYGON (${this.polygonSettings.sides} sides, edge ${this.polygonSettings.edgeLength} mm) Click center:`;
    } else if (t === "projector") {
      prompt = this.isDrawing && this.dragStart ? "XLINE Specify through point:" : "XLINE Specify construction start point:";
    } else if (t === "move" || t === "copy" || t === "rotate" || t === "mirror") {
      const label = t.toUpperCase();
      if (this.cmdStage === "selectObjects") prompt = `${label} Select objects (${this.selectedIds.size} selected) then Enter:`;
      else if (this.cmdStage === "basePoint") prompt = `${label} Specify base point:`;
      else if (this.cmdStage === "displacement") prompt = `${label} Specify second point / displacement:`;
      else if (this.cmdStage === "angle") prompt = "ROTATE Specify rotation angle (deg):";
      else if (this.cmdStage === "mirror1") prompt = "MIRROR Specify first point of mirror line:";
      else if (this.cmdStage === "mirror2") prompt = "MIRROR Specify second point of mirror line:";
    } else if (t === "offset") {
      if (this.cmdStage === "offsetDist") prompt = `OFFSET Specify offset distance <${this.lastOffsetDist}>:`;
      else if (this.cmdStage === "pickObject") prompt = "OFFSET Select object to offset:";
      else if (this.cmdStage === "pickSide") prompt = "OFFSET Specify point on side to offset:";
    } else if (t === "trim") {
      prompt = "TRIM Click overhanging segment span to trim:";
    } else if (t === "extend") {
      prompt = "EXTEND Click near segment end to extend to boundary:";
    } else if (t === "eraser") {
      prompt = "ERASE Click object or drag Window/Crossing selection:";
    } else if (t === "dimlinear" || t === "dimension") {
      const name = t === "dimlinear" ? "DIMLINEAR" : "DIMALIGNED";
      prompt = this.isDrawing && this.dragStart ? `${name} Specify second point:` : `${name} Specify first extension origin:`;
    } else if (t === "dimangular") {
      prompt = this.cmdTargetEl ? "DIMANGULAR Select second line:" : "DIMANGULAR Select first line:";
    } else if (t === "text") {
      prompt = "TEXT Specify insertion point for label:";
    } else if (t === "select") {
      prompt = this.selectedIds.size > 0 ? `Command (${this.selectedIds.size} selected):` : "Command: ";
    }
    this.onCommandPromptChange?.(prompt);
  }

  activateTool(toolId) {
    if (toolId === "isodraft") {
      this.setIsoDraft(!this.isoDraftEnabled);
      this.onCommandLog?.(`<ISODRAFT ${this.isoDraftEnabled ? "ON" : "OFF"}>`, "sys");
      return;
    }
    if (toolId === "isoplane") {
      this.cycleIsoplaneMode();
      return;
    }

    this.resetTransientCommand();
    this.tool = toolId;

    if (toolId === "isocircle" || toolId === "fourcenter") {
      if (!this.isoDraftEnabled) {
        this.isoDraftEnabled = true;
        this.onAidStateChanged?.();
        this.onIsoStateChanged?.({ enabled: true, isoplane: this.isoplane });
      }
    }

    if (toolId === "projector") {
      this.setLayer("Projectors_Const");
    } else if (toolId === "dimlinear" || toolId === "dimension" || toolId === "dimangular" || toolId === "text") {
      this.setLayer("Dimensions_Text");
    }

    if (toolId === "move" || toolId === "copy" || toolId === "rotate") {
      this.cmdStage = this.selectedIds.size > 0 ? "basePoint" : "selectObjects";
    } else if (toolId === "mirror") {
      this.cmdStage = this.selectedIds.size > 0 ? "mirror1" : "selectObjects";
    } else if (toolId === "offset") {
      this.cmdStage = "offsetDist";
    } else if (toolId === "eraser" && this.selectedIds.size > 0) {
      this.eraseSelection();
      this.tool = "select";
    }

    this.onToolChanged?.(this.tool);
    this.updateCommandPrompt();
    this.render();
  }

  startCommand(cmd) {
    if (!cmd) return;
    if (cmd.tool === "move" || cmd.tool === "copy" || cmd.tool === "rotate") {
      if (this.selectedIds.size > 0) {
        this.activateTool(cmd.tool);
        return;
      }
    }
    if (cmd.alias === "EL") {
      this.activateTool("isocircle");
      this.cmdStage = "ellipseOption";
      this.updateCommandPrompt();
      return;
    }
    this.activateTool(cmd.tool);
  }

  resetTransientCommand() {
    this.isDrawing = false;
    this.clickClickActive = false;
    this.dragStart = null;
    this.arcPoints = [];
    this.polyPoints = [];
    this.cmdStage = null;
    this.cmdOriginPt = null;
    this.cmdTargetEl = null;
    this.cmdAuxPt = null;
    this.boxSelStart = null;
    this.boxSelCurrent = null;
    this.hoverPreviewInfo = null;
    this.refEdgeAngleDeg = null;
    this.snappedAngleInfo = null;
    this.dynHud.hide();
  }

  cancelCommand() {
    this.resetTransientCommand();
    this.selectedIds.clear();
    this.tool = "select";
    this.onToolChanged?.("select");
    this.updateCommandPrompt();
    this.onPreviewChanged?.({
      worldPos: this.currentWorldPos,
      isDrawing: false,
      dragStart: null,
      tool: this.tool,
      pencilGrade: this.pencilGrade,
      activeSnap: this.activeSnap
    });
    this.render();
  }

  cancelDrawing() {
    if (this.tool === "polyline" && this.polyPoints.length >= 2) {
      this.commitPolyline(this.polyPoints, false);
      return;
    }
    this.resetTransientCommand();
    this.updateCommandPrompt();
    this.onPreviewChanged?.({
      worldPos: this.currentWorldPos,
      isDrawing: false,
      dragStart: null,
      tool: this.tool,
      pencilGrade: this.pencilGrade,
      activeSnap: this.activeSnap
    });
    this.render();
  }

  confirmActiveCommandFromCLI(rawVal) {
    const val = String(rawVal || "").trim();

    // Confirm empty Enter/Space inside multi-step commands
    if (!val) {
      if (this.cmdStage === "ellipseOption") {
        this.cmdStage = null;
        this.updateCommandPrompt();
        return true;
      }
      if (this.cmdStage === "selectObjects" && this.selectedIds.size > 0) {
        this.cmdStage = this.tool === "mirror" ? "mirror1" : "basePoint";
        this.updateCommandPrompt();
        this.render();
        return true;
      }
      if (this.cmdStage === "offsetDist") {
        this.cmdStage = "pickObject";
        this.updateCommandPrompt();
        this.render();
        return true;
      }
      if (this.tool === "polyline" && this.polyPoints.length >= 2) {
        this.commitPolyline(this.polyPoints, false);
        return true;
      }
      this.resetTransientCommand();
      this.updateCommandPrompt();
      this.render();
      return true;
    }

    // EL -> I (Isocircle option)
    if (this.cmdStage === "ellipseOption") {
      if (/^I(SOCIRCLE)?$/i.test(val)) {
        this.cmdStage = null;
        this.setIsoDraft(true);
        this.onCommandLog?.(`ISOCIRCLE active on Isoplane ${getIsoplaneSpec(this.isoplane).label}. Specify center point:`, "sys");
        this.updateCommandPrompt();
        return true;
      }
    }

    // Offset distance input
    if (this.cmdStage === "offsetDist") {
      const d = parseFloat(val);
      if (Number.isFinite(d) && d > 0.1) {
        this.lastOffsetDist = d;
        this.cmdStage = "pickObject";
        this.updateCommandPrompt();
        this.render();
        return true;
      }
      return false;
    }

    // Rotate angle numeric input
    if (this.tool === "rotate" && this.cmdStage === "angle" && this.cmdOriginPt) {
      const ang = parseFloat(val);
      if (Number.isFinite(ang)) {
        this.commitRotate(this.cmdOriginPt, ang);
        return true;
      }
      return false;
    }

    // Coordinate input during active Draw/Move/Copy/Mirror/Rect
    const anchor = this.dragStart || this.cmdOriginPt || { x: 0, y: 0 };
    const parsed = parseCoordinateInput(val, anchor, this.currentWorldPos);
    if (!parsed) return false;

    if (this.tool === "move" || this.tool === "copy") {
      if (this.cmdStage === "displacement" && this.cmdOriginPt) {
        this.commitMoveOrCopy(this.cmdOriginPt, { x: parsed.x, y: parsed.y }, this.tool === "copy");
        return true;
      }
      if (this.cmdStage === "basePoint") {
        this.cmdOriginPt = { x: parsed.x, y: parsed.y };
        this.cmdStage = "displacement";
        this.updateCommandPrompt();
        return true;
      }
    }

    if (this.isDrawing && this.dragStart) {
      if (this.tool === "rect") {
        this.commitRect(this.dragStart, { x: parsed.x, y: parsed.y });
      } else {
        let targetEnd = { x: parsed.x, y: parsed.y };
        if (parsed.kind === "polar" && this.angleRelativeTo === "edge" && Number.isFinite(this.refEdgeAngleDeg)) {
          const rad = ((this.refEdgeAngleDeg + parsed.angle) * Math.PI) / 180;
          targetEnd = {
            x: this.dragStart.x + parsed.length * Math.cos(rad),
            y: this.dragStart.y + parsed.length * Math.sin(rad)
          };
        }
        this.commitSegment(this.dragStart, targetEnd, true);
      }
      return true;
    }

    if (this.tool === "polyline") {
      if (this.polyPoints.length === 0) {
        this.polyPoints.push([parsed.x, parsed.y]);
        this.dragStart = { x: parsed.x, y: parsed.y };
        this.isDrawing = true;
      } else {
        this.polyPoints.push([parsed.x, parsed.y]);
        this.dragStart = { x: parsed.x, y: parsed.y };
      }
      this.updateCommandPrompt();
      this.render();
      return true;
    }

    if (this.tool === "line" || this.tool === "circle" || this.tool === "isocircle" || this.tool === "fourcenter" || this.tool === "rect" || this.tool === "projector") {
      this.cmdStage = null;
      this.beginStrokeAt({ x: parsed.x, y: parsed.y });
      return true;
    }

    return false;
  }

  handleDynamicCommit(payload) {
    if (!this.isDrawing && !this.cmdStage) return;
    const anchor = this.dragStart || this.cmdOriginPt || { x: 0, y: 0 };

    if (this.tool === "rotate" && this.cmdStage === "angle" && this.cmdOriginPt) {
      const val = parseFloat(payload.primaryRaw);
      if (Number.isFinite(val)) {
        this.commitRotate(this.cmdOriginPt, val);
      }
      return;
    }

    if (this.cmdStage === "offsetDist") {
      const val = parseFloat(payload.primaryRaw);
      if (Number.isFinite(val) && val > 0.1) {
        this.lastOffsetDist = val;
        this.cmdStage = "pickObject";
        this.dynHud.hide();
        this.updateCommandPrompt();
        this.render();
      }
      return;
    }

    // Re-apply latest typed string cleanly using DYNMODE field logic
    let target = null;
    const pRaw = payload.primaryRaw;
    const sRaw = payload.secondaryRaw;
    if (payload.primaryEdited && (pRaw.includes(",") || pRaw.includes("<") || pRaw.startsWith("@"))) {
      const parsed = parseCoordinateInput(pRaw, anchor, this.currentWorldPos);
      if (parsed) target = { x: parsed.x, y: parsed.y };
    }
    if (!target) {
      const dx = this.currentWorldPos.x - anchor.x;
      const dy = this.currentWorldPos.y - anchor.y;
      const curLen = Math.hypot(dx, dy) || 30;
      const curDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
      const pNum = parseFloat(pRaw);
      const sNum = parseFloat(sRaw);

      if (this.tool === "rect") {
        const rx = payload.primaryEdited && Number.isFinite(pNum) ? pNum : dx;
        const ry = payload.secondaryEdited && Number.isFinite(sNum) ? sNum : dy;
        target = { x: anchor.x + rx, y: anchor.y + ry };
      } else {
        const len = payload.primaryEdited && Number.isFinite(pNum) && pNum > 0 ? pNum : curLen;
        let deg = payload.secondaryEdited && Number.isFinite(sNum) ? sNum : curDeg;
        if (payload.secondaryEdited && this.angleRelativeTo === "edge" && Number.isFinite(this.refEdgeAngleDeg)) {
          deg = this.refEdgeAngleDeg + sNum;
        }
        const rad = (deg * Math.PI) / 180;
        target = { x: anchor.x + len * Math.cos(rad), y: anchor.y + len * Math.sin(rad) };
      }
    }

    if (!target) return;
    if (this.tool === "move" || this.tool === "copy") {
      if (this.cmdStage === "displacement" && this.cmdOriginPt) {
        this.commitMoveOrCopy(this.cmdOriginPt, target, this.tool === "copy");
      }
      return;
    }
    if (this.tool === "rect") {
      this.commitRect(this.dragStart, target);
      return;
    }
    if (this.tool === "polyline") {
      this.polyPoints.push([target.x, target.y]);
      this.dragStart = target;
      this.clickClickActive = true;
      this.updateCommandPrompt();
      this.render();
      return;
    }
    this.commitSegment(this.dragStart, target, true);
  }

  findReferenceEdgeAngle(wx, wy) {
    const tol = 2.5;
    if (Math.abs(wy) < tol) return 0;
    for (let i = this.elements.length - 1; i >= 0; i--) {
      const el = this.elements[i];
      if (!this.layerManager.isElementVisible(el)) continue;
      for (const s of extractElementSegments(el)) {
        if (distToSegWorld(wx, wy, s.a, s.b) < tol) {
          return normalizeDeg((Math.atan2(s.b[1] - s.a[1], s.b[0] - s.a[0]) * 180) / Math.PI);
        }
      }
    }
    return null;
  }

  applyAngleConstraints(fromWorld, toWorld) {
    const res = computePolarConstraint(fromWorld, toWorld, {
      orthoLock: this.orthoLock,
      angleSnap: this.angleSnap,
      isoDraft: this.isoDraftEnabled,
      isoplane: this.isoplane,
      lockedAngleDeg: this.lockedAngleDeg,
      angleRelativeTo: this.angleRelativeTo,
      refEdgeAngleDeg: this.refEdgeAngleDeg,
      lockedLengthMm: this.lockedLengthMm
    });
    this.snappedAngleInfo = res.snappedInfo;
    return res.point;
  }

  beginStrokeAt(worldPos) {
    this.isDrawing = true;
    this.clickClickActive = true;
    this.dragStart = worldPos;
    this.refEdgeAngleDeg = this.findReferenceEdgeAngle(worldPos.x, worldPos.y);
    this.snappedAngleInfo = null;
    this.currentWorldPos = worldPos;
    this.updateCommandPrompt();
    this.render();
  }

  // Event setup
  initEvents() {
    this.canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    window.addEventListener("pointermove", (e) => this.onPointerMove(e));
    window.addEventListener("pointerup", (e) => this.onPointerUp(e));
    this.canvas.addEventListener("dblclick", (e) => {
      if (e.button === 1) {
        e.preventDefault();
        this.zoomExtents();
      }
    });
    this.canvas.addEventListener("auxclick", (e) => {
      if (e.button === 1) e.preventDefault();
    });
    this.canvas.addEventListener("pointerleave", () => {
      this.mouseScreen.inside = false;
      if (!this.isDrawing) {
        this.dynHud.hide();
        this.onPreviewChanged?.(null);
      }
      this.render();
    });
    this.canvas.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    window.addEventListener("keydown", (e) => {
      if (!document.body.classList.contains("practice-mode")) return;
      if (document.querySelector("dialog[open]")) return;

      if (e.key === "Shift") {
        this.orthoLock = true;
        this.onAidStateChanged?.();
        this.render();
      }

      if (e.key === "Escape") {
        if (this.dynHud.isFocused()) {
          this.dynHud.resetEdits();
        }
        this.cancelCommand();
        return;
      }

      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // Feed digits, '@', '<', '.', '-', or Tab straight into floating DYNMODE boxes when aiming!
      if (
        this.dynHud.enabled &&
        this.dynHud.visible &&
        (/^[0-9.<@\-]$/.test(e.key) || e.key === "Tab")
      ) {
        e.preventDefault();
        this.dynHud.feedCharacter(e.key);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) this.redo();
        else this.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        this.redo();
      }
    });

    window.addEventListener("keyup", (e) => {
      if (e.key === "Shift") {
        this.orthoLock = false;
        this.onAidStateChanged?.();
        this.render();
      }
    });
  }

  getPointerPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  computePointForCursor(pos) {
    this.activeSnap = this.osnap.findSnap(
      pos.x,
      pos.y,
      this.elements,
      (wx, wy) => this.worldToScreen(wx, wy),
      (sx, sy) => this.screenToWorld(sx, sy),
      {
        dragStart: this.dragStart || this.cmdOriginPt,
        isVisible: (el) => this.layerManager.isElementVisible(el)
      }
    );

    let worldPos = this.activeSnap
      ? { x: this.activeSnap.worldX, y: this.activeSnap.worldY }
      : this.screenToWorld(pos.x, pos.y);

    if (!this.activeSnap && this.gridSnapEnabled) {
      const step = this.zoom < 0.7 ? 5 : 2;
      worldPos = {
        x: Math.round(worldPos.x / step) * step,
        y: Math.round(worldPos.y / step) * step
      };
    }

    // DYNMODE live overrides
    const anchor = this.dragStart || this.cmdOriginPt;
    if (anchor) {
      const dynTarget = this.dynHud.resolveTargetPoint(anchor, worldPos, {
        angleRelativeTo: this.angleRelativeTo,
        refEdgeAngleDeg: this.refEdgeAngleDeg
      });
      if (dynTarget) {
        return dynTarget;
      }
    }

    if ((this.isDrawing && this.dragStart) || (this.cmdStage === "displacement" && this.cmdOriginPt) || this.cmdStage === "mirror2") {
      const base = this.dragStart || this.cmdOriginPt;
      if (this.tool === "projector") {
        const dx = Math.abs(worldPos.x - base.x);
        const dy = Math.abs(worldPos.y - base.y);
        if (dx < dy) worldPos.x = base.x;
        else worldPos.y = base.y;
        this.snappedAngleInfo = { deg: dx < dy ? 90 : 0, label: "ORTHO XLINE", mode: "ortho" };
      } else if (["line", "polyline", "dimension", "dimlinear", "move", "copy", "mirror"].includes(this.tool)) {
        worldPos = this.applyAngleConstraints(base, worldPos);
      }
    }
    return worldPos;
  }

  onPointerDown(e) {
    const pos = this.getPointerPos(e);

    // Right-click: Confirm multi-step command OR cancel active stroke cleanly
    if (e.button === 2) {
      if (this.cmdStage === "selectObjects" && this.selectedIds.size > 0) {
        this.cmdStage = this.tool === "mirror" ? "mirror1" : "basePoint";
        this.updateCommandPrompt();
        this.render();
      } else if (this.tool === "polyline" && this.polyPoints.length >= 2) {
        this.commitPolyline(this.polyPoints, false);
      } else if (this.isDrawing || this.cmdStage) {
        this.cancelDrawing();
      }
      return;
    }

    // Pan with middle mouse or Pan tool
    if (e.button === 1 || this.tool === "pan") {
      this.isPanning = true;
      this.panStartX = pos.x - this.originX;
      this.panStartY = pos.y - this.originY;
      this.canvas.style.cursor = "grabbing";
      return;
    }

    if (e.button !== 0) return;

    const worldPos = this.computePointForCursor(pos);
    const tolWorld = 10 / (this.basePxPerMm * this.zoom);

    // Modify Commands: TRIM, EXTEND, OFFSET, ERASE, SELECT
    if (this.tool === "trim") {
      const hit = hitTestEntity(worldPos, this.elements, tolWorld, (el) =>
        this.layerManager.isElementVisible(el) && !this.layerManager.isElementLocked(el)
      );
      if (hit && hit.type === "line") {
        const res = trimLineAtPoint(hit, worldPos, this.elements.filter((el) => this.layerManager.isElementVisible(el)));
        if (res) {
          const idx = this.elements.findIndex((el) => el.id === hit.id);
          if (idx !== -1) {
            this.elements.splice(idx, 1, ...res.kept);
            this.saveState();
            this.hoverPreviewInfo = null;
            this.onCommandLog?.(`Trimmed segment (${res.kept.length} span${res.kept.length === 1 ? "" : "s"} remaining).`, "info");
            this.render();
          }
        }
      }
      return;
    }

    if (this.tool === "extend") {
      const hit = hitTestEntity(worldPos, this.elements, tolWorld, (el) =>
        this.layerManager.isElementVisible(el) && !this.layerManager.isElementLocked(el)
      );
      if (hit && hit.type === "line") {
        const res = extendLineToBoundary(hit, worldPos, this.elements.filter((el) => this.layerManager.isElementVisible(el)));
        if (res) {
          const idx = this.elements.findIndex((el) => el.id === hit.id);
          if (idx !== -1) {
            this.elements[idx] = res.updated;
            this.saveState();
            this.hoverPreviewInfo = null;
            this.onCommandLog?.("Extended line to intersection boundary.", "info");
            this.render();
          }
        }
      }
      return;
    }

    if (this.tool === "offset") {
      if (this.cmdStage === "offsetDist") {
        this.cmdStage = "pickObject";
      }
      if (this.cmdStage === "pickObject") {
        const hit = hitTestEntity(worldPos, this.elements, tolWorld, (el) => this.layerManager.isElementVisible(el));
        if (hit && ["line", "circle", "arc", "polygon"].includes(hit.type)) {
          this.cmdTargetEl = hit;
          this.cmdStage = "pickSide";
          this.updateCommandPrompt();
          this.render();
        }
        return;
      }
      if (this.cmdStage === "pickSide" && this.cmdTargetEl) {
        const off = offsetEntity(this.cmdTargetEl, this.lastOffsetDist, worldPos);
        if (off) {
          this.elements.push(off);
          this.saveState();
          this.onCommandLog?.(`Offset created at ${this.lastOffsetDist} mm.`, "info");
        }
        this.cmdTargetEl = null;
        this.hoverPreviewInfo = null;
        this.cmdStage = "pickObject";
        this.updateCommandPrompt();
        this.render();
        return;
      }
    }

    if (this.tool === "eraser") {
      const hit = hitTestEntity(worldPos, this.elements, tolWorld, (el) =>
        this.layerManager.isElementVisible(el) && !this.layerManager.isElementLocked(el)
      );
      if (hit) {
        this.elements = this.elements.filter((el) => el.id !== hit.id);
        this.selectedIds.delete(hit.id);
        this.saveState();
        this.render();
      } else {
        this.boxSelStart = worldPos;
        this.boxSelCurrent = worldPos;
      }
      return;
    }

    if (this.tool === "select" || this.cmdStage === "selectObjects") {
      const hit = hitTestEntity(worldPos, this.elements, tolWorld, (el) =>
        this.layerManager.isElementVisible(el) && !this.layerManager.isElementLocked(el)
      );
      if (hit) {
        if (this.selectedIds.has(hit.id)) this.selectedIds.delete(hit.id);
        else this.selectedIds.add(hit.id);
        this.updateCommandPrompt();
        this.render();
      } else {
        this.boxSelStart = worldPos;
        this.boxSelCurrent = worldPos;
      }
      return;
    }

    if (this.tool === "move" || this.tool === "copy") {
      if (this.cmdStage === "basePoint") {
        this.cmdOriginPt = worldPos;
        this.cmdStage = "displacement";
        this.dragStart = worldPos;
        this.updateCommandPrompt();
        this.render();
        return;
      }
      if (this.cmdStage === "displacement" && this.cmdOriginPt) {
        this.commitMoveOrCopy(this.cmdOriginPt, worldPos, this.tool === "copy");
        return;
      }
    }

    if (this.tool === "rotate") {
      if (this.cmdStage === "basePoint") {
        this.cmdOriginPt = worldPos;
        this.cmdStage = "angle";
        this.dragStart = worldPos;
        this.updateCommandPrompt();
        this.render();
        return;
      }
      if (this.cmdStage === "angle" && this.cmdOriginPt) {
        const ang = (Math.atan2(worldPos.y - this.cmdOriginPt.y, worldPos.x - this.cmdOriginPt.x) * 180) / Math.PI;
        this.commitRotate(this.cmdOriginPt, ang);
        return;
      }
    }

    if (this.tool === "mirror") {
      if (this.cmdStage === "mirror1") {
        this.cmdOriginPt = worldPos;
        this.cmdStage = "mirror2";
        this.dragStart = worldPos;
        this.updateCommandPrompt();
        this.render();
        return;
      }
      if (this.cmdStage === "mirror2" && this.cmdOriginPt) {
        this.commitMirror(this.cmdOriginPt, worldPos);
        return;
      }
    }

    // Annotation Angular Dim (DAN): pick 2 lines
    if (this.tool === "dimangular") {
      const hit = hitTestEntity(worldPos, this.elements, tolWorld, (el) =>
        this.layerManager.isElementVisible(el) && el.type === "line"
      );
      if (hit) {
        if (!this.cmdTargetEl) {
          this.cmdTargetEl = hit;
          this.updateCommandPrompt();
          this.render();
        } else if (hit.id !== this.cmdTargetEl.id) {
          this.commitAngularDimension(this.cmdTargetEl, hit, worldPos);
        }
      }
      return;
    }

    if (this.tool === "polygon") {
      this.placePolygon(worldPos);
      return;
    }

    if (this.tool === "text") {
      this.placeText(worldPos);
      return;
    }

    // 3-Point ARC
    if (this.tool === "arc") {
      this.arcPoints.push(worldPos);
      if (this.arcPoints.length === 1) {
        this.isDrawing = true;
        this.dragStart = worldPos;
      } else if (this.arcPoints.length === 3) {
        this.commitArc(this.arcPoints[0], this.arcPoints[1], this.arcPoints[2]);
        return;
      }
      this.updateCommandPrompt();
      this.render();
      return;
    }

    // Polyline multi-point chain
    if (this.tool === "polyline") {
      if (this.polyPoints.length >= 3) {
        const first = this.polyPoints[0];
        if (Math.hypot(worldPos.x - first[0], worldPos.y - first[1]) < 1.5) {
          this.commitPolyline(this.polyPoints, true);
          return;
        }
      }
      this.polyPoints.push([worldPos.x, worldPos.y]);
      this.dragStart = worldPos;
      this.isDrawing = true;
      this.clickClickActive = true;
      this.refEdgeAngleDeg = this.findReferenceEdgeAngle(worldPos.x, worldPos.y);
      this.updateCommandPrompt();
      this.render();
      return;
    }

    // Second click in click-click mode finishes segment/rect/circle/isocircle/fourcenter/dim
    if (this.isDrawing && this.clickClickActive && this.dragStart) {
      if (this.tool === "rect") {
        this.commitRect(this.dragStart, worldPos);
      } else {
        this.commitSegment(this.dragStart, worldPos, this.tool === "line");
      }
      return;
    }

    if (this.cmdStage === "ellipseOption") {
      this.cmdStage = null;
    }

    // Start Draw click-click / drag
    this.isDrawing = true;
    this.clickClickActive = false;
    this.pointerDownScreen = { x: pos.x, y: pos.y };
    this.dragStart = worldPos;
    this.refEdgeAngleDeg = this.findReferenceEdgeAngle(worldPos.x, worldPos.y);
    this.snappedAngleInfo = null;
    this.currentWorldPos = worldPos;
    this.updateCommandPrompt();
  }

  onPointerMove(e) {
    const pos = this.getPointerPos(e);
    const rect = this.canvas.getBoundingClientRect();
    this.mouseScreen = {
      x: pos.x,
      y: pos.y,
      inside: pos.x >= 0 && pos.y >= 0 && pos.x <= rect.width && pos.y <= rect.height
    };

    if (this.isPanning) {
      this.originX = pos.x - this.panStartX;
      this.originY = pos.y - this.panStartY;
      this.render();
      return;
    }

    if (this.boxSelStart) {
      this.boxSelCurrent = this.screenToWorld(pos.x, pos.y);
      this.render();
      return;
    }

    const worldPos = this.computePointForCursor(pos);
    this.currentWorldPos = worldPos;
    const tolWorld = 10 / (this.basePxPerMm * this.zoom);

    // Update live Trim / Extend / Offset previews
    this.hoverPreviewInfo = null;
    if (this.tool === "trim") {
      const hit = hitTestEntity(worldPos, this.elements, tolWorld, (el) =>
        this.layerManager.isElementVisible(el) && !this.layerManager.isElementLocked(el)
      );
      if (hit && hit.type === "line") {
        const res = trimLineAtPoint(hit, worldPos, this.elements.filter((el) => this.layerManager.isElementVisible(el)));
        if (res) this.hoverPreviewInfo = { kind: "trim", span: res.removedSpan };
      }
    } else if (this.tool === "extend") {
      const hit = hitTestEntity(worldPos, this.elements, tolWorld, (el) =>
        this.layerManager.isElementVisible(el) && !this.layerManager.isElementLocked(el)
      );
      if (hit && hit.type === "line") {
        const res = extendLineToBoundary(hit, worldPos, this.elements.filter((el) => this.layerManager.isElementVisible(el)));
        if (res) this.hoverPreviewInfo = { kind: "extend", from: res.from, to: res.to };
      }
    } else if (this.tool === "offset" && this.cmdStage === "pickSide" && this.cmdTargetEl) {
      const ghost = offsetEntity(this.cmdTargetEl, this.lastOffsetDist, worldPos, "preview");
      if (ghost) this.hoverPreviewInfo = { kind: "offset", entity: ghost };
    }

    // Update DYNMODE (F12) Floating Boxes beside crosshair
    const dynAnchor = this.dragStart || this.cmdOriginPt;
    if (this.mouseScreen.inside && dynAnchor && (this.isDrawing || this.cmdStage === "displacement" || this.cmdStage === "mirror2" || this.cmdStage === "angle")) {
      const dx = worldPos.x - dynAnchor.x;
      const dy = worldPos.y - dynAnchor.y;
      const len = Math.hypot(dx, dy);
      const deg = normalizeDeg((Math.atan2(dy, dx) * 180) / Math.PI);
      if (this.tool === "rect") {
        this.dynHud.update(pos, {
          mode: "rect",
          primaryVal: dx.toFixed(1),
          secondaryVal: dy.toFixed(1),
          primaryLabel: "ΔX",
          secondaryLabel: "ΔY",
          primaryUnit: "mm",
          secondaryUnit: "mm"
        });
      } else if (this.tool === "rotate" && this.cmdStage === "angle") {
        this.dynHud.update(pos, {
          mode: "scalar",
          primaryVal: deg.toFixed(1),
          primaryLabel: "∠",
          primaryUnit: "°"
        });
      } else if (this.tool === "circle" || this.tool === "isocircle" || this.tool === "fourcenter") {
        this.dynHud.update(pos, {
          mode: "scalar",
          primaryVal: len.toFixed(1),
          primaryLabel: this.tool === "circle" ? "R" : "R_iso",
          primaryUnit: "mm"
        });
      } else {
        this.dynHud.update(pos, {
          mode: "polar",
          primaryVal: len.toFixed(1),
          secondaryVal: deg.toFixed(1),
          primaryLabel: "L",
          secondaryLabel: "∠",
          primaryUnit: "mm",
          secondaryUnit: "°"
        });
      }
    } else if (this.mouseScreen.inside && this.cmdStage === "offsetDist") {
      this.dynHud.update(pos, {
        mode: "scalar",
        primaryVal: String(this.lastOffsetDist),
        primaryLabel: "O",
        primaryUnit: "mm"
      });
    } else {
      this.dynHud.hide();
    }

    this.updateHud(pos, worldPos);
    if (this.mouseScreen.inside || this.isDrawing) {
      this.onPreviewChanged?.({
        worldPos,
        isDrawing: this.isDrawing,
        dragStart: this.dragStart,
        tool: this.tool,
        pencilGrade: this.pencilGrade,
        activeSnap: this.activeSnap
      });
    }
    this.render();
  }

  onPointerUp(e) {
    if (this.isPanning) {
      this.isPanning = false;
      this.canvas.style.cursor = this.tool === "pan" ? "grab" : "none";
      return;
    }

    if (this.boxSelStart && this.boxSelCurrent) {
      const draggedMm = Math.hypot(this.boxSelCurrent.x - this.boxSelStart.x, this.boxSelCurrent.y - this.boxSelStart.y);
      if (draggedMm > 1.5) {
        const res = selectEntitiesInBox(this.elements, this.boxSelStart, this.boxSelCurrent, (el) =>
          this.layerManager.isElementVisible(el) && !this.layerManager.isElementLocked(el)
        );
        if (this.tool === "eraser") {
          if (res.ids.length > 0) {
            const drop = new Set(res.ids);
            this.elements = this.elements.filter((el) => !drop.has(el.id));
            res.ids.forEach((id) => this.selectedIds.delete(id));
            this.saveState();
          }
        } else {
          res.ids.forEach((id) => this.selectedIds.add(id));
          this.onCommandLog?.(
            `${res.mode === "window" ? "Window" : "Crossing"} selected ${res.ids.length} object(s).`,
            "info"
          );
        }
      } else if (this.tool === "select") {
        // Empty click clears selection in neutral Select mode
        this.selectedIds.clear();
      }
      this.boxSelStart = null;
      this.boxSelCurrent = null;
      this.updateCommandPrompt();
      this.render();
      return;
    }

    if (!this.isDrawing || !this.dragStart) return;

    const pos = this.getPointerPos(e);
    const movedPx = this.pointerDownScreen
      ? Math.hypot(pos.x - this.pointerDownScreen.x, pos.y - this.pointerDownScreen.y)
      : 999;

    if (movedPx < 5 && !this.clickClickActive) {
      this.clickClickActive = true;
      return;
    }

    if (!this.clickClickActive && this.tool !== "arc" && this.tool !== "polyline") {
      if (this.tool === "rect") {
        this.commitRect(this.dragStart, this.currentWorldPos);
      } else if (!this.cmdStage) {
        this.commitSegment(this.dragStart, this.currentWorldPos, false);
      }
    }
  }

  commitSegment(start, end, chainIfLine = false) {
    const len = Math.hypot(end.x - start.x, end.y - start.y);
    const { layer, grade } = this.getActiveLayerAndGrade();

    if (len >= 0.5 || this.tool === "circle" || this.tool === "isocircle" || this.tool === "fourcenter") {
      if (this.tool === "line") {
        this.elements.push({
          id: "line-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
          type: "line",
          x1: start.x,
          y1: start.y,
          x2: end.x,
          y2: end.y,
          grade,
          layer
        });
        this.saveState();
      } else if (this.tool === "projector") {
        this.elements.push({
          id: "proj-" + Date.now(),
          type: "line",
          x1: start.x,
          y1: start.y,
          x2: end.x,
          y2: end.y,
          grade: "2H",
          layer: "Projectors_Const"
        });
        this.saveState();
      } else if (this.tool === "circle") {
        this.elements.push({
          id: "circle-" + Date.now(),
          type: "circle",
          cx: start.x,
          cy: start.y,
          radius: Math.max(1, len || 20),
          grade,
          layer
        });
        this.saveState();
      } else if (this.tool === "isocircle") {
        const rIso = Math.max(1, len || 20);
        const geo = computeIsocircleGeometry(start.x, start.y, rIso, this.isoplane);
        this.elements.push({
          id: "isocirc-" + Date.now(),
          ...geo,
          grade,
          layer
        });
        this.saveState();
      } else if (this.tool === "fourcenter") {
        const rIso = Math.max(2, len || 20);
        const built = buildFourCenterGeometry(start.x, start.y, rIso, this.isoplane, { layer, grade });
        this.elements.push(...built.allElements);
        this.onCommandLog?.(
          `Four-Center Ellipse (${getIsoplaneSpec(this.isoplane).label}, R_iso=${rIso.toFixed(1)}mm): Rhombus + 4 arcs constructed.`,
          "info"
        );
        this.saveState();
      } else if (this.tool === "dimension" || this.tool === "dimlinear") {
        let p2 = { x: end.x, y: end.y };
        let measured = len;
        if (this.tool === "dimlinear") {
          if (Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)) {
            p2 = { x: end.x, y: start.y };
            measured = Math.abs(end.x - start.x);
          } else {
            p2 = { x: start.x, y: end.y };
            measured = Math.abs(end.y - start.y);
          }
        }
        this.elements.push({
          id: "dim-" + Date.now(),
          type: "dimension",
          x1: start.x,
          y1: start.y,
          x2: p2.x,
          y2: p2.y,
          value: measured.toFixed(1),
          layer: "Dimensions_Text",
          grade: "Dimension"
        });
        this.saveState();
      }
    }

    if (chainIfLine && this.tool === "line" && len >= 0.5) {
      // AutoCAD continuous LINE chain! Right-click / Enter / Esc stops chaining
      this.dragStart = { x: end.x, y: end.y };
      this.isDrawing = true;
      this.clickClickActive = true;
      this.refEdgeAngleDeg = this.findReferenceEdgeAngle(end.x, end.y);
      this.snappedAngleInfo = null;
      this.dynHud.resetEdits();
    } else {
      this.isDrawing = false;
      this.clickClickActive = false;
      this.dragStart = null;
      this.refEdgeAngleDeg = null;
      this.snappedAngleInfo = null;
      this.dynHud.hide();
    }

    this.updateCommandPrompt();
    this.onPreviewChanged?.({
      worldPos: end,
      isDrawing: this.isDrawing,
      dragStart: this.dragStart,
      tool: this.tool,
      pencilGrade: this.pencilGrade,
      activeSnap: this.activeSnap
    });
    this.render();
  }

  commitRect(c1, c2) {
    const w = Math.abs(c2.x - c1.x);
    const h = Math.abs(c2.y - c1.y);
    if (w >= 0.5 && h >= 0.5) {
      const { layer, grade } = this.getActiveLayerAndGrade();
      this.elements.push({
        id: "rect-" + Date.now(),
        type: "polyline",
        closed: true,
        points: createRectPoints(c1, c2),
        grade,
        layer
      });
      this.saveState();
    }
    this.resetTransientCommand();
    this.updateCommandPrompt();
    this.render();
  }

  commitPolyline(pts, closed = false) {
    if (pts.length >= 2) {
      const { layer, grade } = this.getActiveLayerAndGrade();
      this.elements.push({
        id: "pline-" + Date.now(),
        type: "polyline",
        closed,
        points: pts.map((p) => [p[0], p[1]]),
        grade,
        layer
      });
      this.saveState();
    }
    this.resetTransientCommand();
    this.updateCommandPrompt();
    this.render();
  }

  commitArc(p1, p2, p3) {
    const circ = circumcircle3Pt(p1, p2, p3);
    if (circ) {
      const { layer, grade } = this.getActiveLayerAndGrade();
      this.elements.push({
        id: "arc-" + Date.now(),
        type: "arc",
        cx: circ.cx,
        cy: circ.cy,
        radius: circ.radius,
        startAngle: circ.startAngle,
        endAngle: circ.endAngle,
        worldCCW: circ.worldCCW,
        grade,
        layer
      });
      this.saveState();
    } else {
      this.onCommandLog?.("Arc points are collinear; skipped.", "warn");
    }
    this.resetTransientCommand();
    this.updateCommandPrompt();
    this.render();
  }

  commitMoveOrCopy(base, target, isCopy = false) {
    const dx = target.x - base.x;
    const dy = target.y - base.y;
    const nextEls = [];
    const newSel = new Set();

    for (const el of this.elements) {
      if (this.selectedIds.has(el.id) && !this.layerManager.isElementLocked(el)) {
        const moved = transformEntity(el, (p) => ({ x: p.x + dx, y: p.y + dy }), 0);
        if (isCopy) {
          moved.id = `${el.id}-cp-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
          nextEls.push(el, moved);
          newSel.add(el.id);
        } else {
          nextEls.push(moved);
          newSel.add(moved.id);
        }
      } else {
        nextEls.push(el);
      }
    }

    this.elements = nextEls;
    this.selectedIds = newSel;
    this.saveState();

    if (isCopy) {
      // Allow repeated copy placements until Enter/Esc just like AutoCAD!
      this.cmdStage = "displacement";
      this.dynHud.resetEdits();
    } else {
      this.resetTransientCommand();
      this.tool = "select";
      this.onToolChanged?.("select");
    }
    this.updateCommandPrompt();
    this.render();
  }

  commitRotate(pivot, angleDeg) {
    const rad = (angleDeg * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    const rotPt = (p) => {
      const dx = p.x - pivot.x;
      const dy = p.y - pivot.y;
      return {
        x: pivot.x + dx * cosA - dy * sinA,
        y: pivot.y + dx * sinA + dy * cosA
      };
    };

    this.elements = this.elements.map((el) => {
      if (this.selectedIds.has(el.id) && !this.layerManager.isElementLocked(el)) {
        return transformEntity(el, rotPt, angleDeg);
      }
      return el;
    });
    this.saveState();
    this.resetTransientCommand();
    this.tool = "select";
    this.onToolChanged?.("select");
    this.updateCommandPrompt();
    this.render();
  }

  commitMirror(m1, m2) {
    const extras = [];
    for (const el of this.elements) {
      if (this.selectedIds.has(el.id) && !this.layerManager.isElementLocked(el)) {
        const mir = mirrorEntity(el, m1, m2);
        mir.id = `${el.id}-mi-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
        extras.push(mir);
      }
    }
    this.elements.push(...extras);
    this.saveState();
    this.resetTransientCommand();
    this.tool = "select";
    this.onToolChanged?.("select");
    this.updateCommandPrompt();
    this.render();
  }

  commitAngularDimension(l1, l2, cursorWorld) {
    const dx1 = l1.x2 - l1.x1;
    const dy1 = l1.y2 - l1.y1;
    const dx2 = l2.x2 - l2.x1;
    const dy2 = l2.y2 - l2.y1;
    const denom = dx1 * dy2 - dy1 * dx2;
    let vx = cursorWorld.x;
    let vy = cursorWorld.y;
    if (Math.abs(denom) > 1e-6) {
      const t = ((l2.x1 - l1.x1) * dy2 - (l2.y1 - l1.y1) * dx2) / denom;
      vx = l1.x1 + t * dx1;
      vy = l1.y1 + t * dy1;
    }
    const a1 = Math.atan2(l1.y2 - l1.y1, l1.x2 - l1.x1);
    const a2 = Math.atan2(l2.y2 - l2.y1, l2.x2 - l2.x1);
    let diff = Math.abs(((a2 - a1) * 180) / Math.PI) % 180;
    if (diff > 90) diff = 180 - diff;

    this.elements.push({
      id: "dimang-" + Date.now(),
      type: "dimension",
      subType: "angular",
      x1: vx,
      y1: vy,
      x2: cursorWorld.x,
      y2: cursorWorld.y,
      a1,
      a2,
      radius: Math.max(12, Math.hypot(cursorWorld.x - vx, cursorWorld.y - vy)),
      value: diff.toFixed(1) + "°",
      layer: "Dimensions_Text",
      grade: "Dimension"
    });
    this.saveState();
    this.cmdTargetEl = null;
    this.updateCommandPrompt();
    this.render();
  }

  eraseSelection() {
    if (this.selectedIds.size === 0) return;
    const next = this.elements.filter((el) => !(this.selectedIds.has(el.id) && !this.layerManager.isElementLocked(el)));
    if (next.length !== this.elements.length) {
      this.elements = next;
      this.selectedIds.clear();
      this.saveState();
      this.render();
    }
  }

  onWheel(e) {
    e.preventDefault();
    const pos = this.getPointerPos(e);
    const beforeWorld = this.screenToWorld(pos.x, pos.y);
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    this.zoom = Math.max(0.25, Math.min(8.0, this.zoom * factor));
    const scale = this.basePxPerMm * this.zoom;
    this.originX = pos.x - beforeWorld.x * scale;
    this.originY = pos.y + beforeWorld.y * scale;
    this.render();
    this.updateZoomDisplay();
  }

  updateZoomDisplay() {
    const el = document.getElementById("canvasZoomLevel");
    if (el) el.textContent = Math.round(this.zoom * 100) + "%";
  }

  resetView() {
    const parent = this.canvas.parentElement;
    this.zoom = 1.0;
    this.originX = (parent?.clientWidth || 900) / 2;
    this.originY = (parent?.clientHeight || 600) / 2;
    this.render();
    this.updateZoomDisplay();
  }

  zoomExtents() {
    if (this.elements.length === 0) {
      this.resetView();
      return;
    }
    const pts = [];
    for (const el of this.elements) {
      for (const s of extractElementSegments(el)) {
        pts.push(s.a, s.b);
      }
      if (el.type === "circle" || el.type === "arc") {
        pts.push([el.cx - el.radius, el.cy - el.radius], [el.cx + el.radius, el.cy + el.radius]);
      } else if (el.type === "ellipse") {
        const rm = Math.max(el.rx || 1, el.ry || 1);
        pts.push([el.cx - rm, el.cy - rm], [el.cx + rm, el.cy + rm]);
      } else if (el.type === "text") {
        pts.push([el.x, el.y]);
      }
    }
    if (pts.length === 0) {
      this.resetView();
      return;
    }
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const parent = this.canvas.parentElement;
    const w = parent?.clientWidth || 700;
    const h = parent?.clientHeight || 500;
    const spanX = Math.max(40, maxX - minX);
    const spanY = Math.max(40, maxY - minY);
    const targetScale = Math.min((w * 0.78) / spanX, (h * 0.78) / spanY);
    this.zoom = Math.max(0.3, Math.min(6.0, targetScale / this.basePxPerMm));
    const scale = this.basePxPerMm * this.zoom;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    this.originX = w / 2 - cx * scale;
    this.originY = h / 2 + cy * scale;
    this.render();
    this.updateZoomDisplay();
  }

  placePolygon(centerWorld) {
    const sides = this.polygonSettings.sides || 4;
    const edge = this.polygonSettings.edgeLength || 30;
    const baseAngle = ((this.polygonSettings.angle || 0) * Math.PI) / 180;
    const R = edge / (2 * Math.sin(Math.PI / sides));
    const points = [];
    for (let i = 0; i < sides; i++) {
      const theta = baseAngle + (2 * Math.PI * i) / sides;
      points.push([centerWorld.x + R * Math.cos(theta), centerWorld.y + R * Math.sin(theta)]);
    }
    const { layer, grade } = this.getActiveLayerAndGrade();
    this.elements.push({
      id: "poly-" + Date.now(),
      type: "polygon",
      cx: centerWorld.x,
      cy: centerWorld.y,
      sides,
      edgeLength: edge,
      points,
      grade,
      layer
    });
    this.saveState();
    this.render();
  }

  placeText(pos) {
    const suggested = pos.y < 0 ? this.nextTvLabel : this.nextFvLabel;
    const label = prompt("Enter vertex label or annotation:", suggested);
    if (!label) return;
    this.elements.push({
      id: "text-" + Date.now(),
      type: "text",
      x: pos.x,
      y: pos.y,
      text: label,
      grade: "HB",
      layer: "Dimensions_Text"
    });
    if (pos.y < 0 && label === this.nextTvLabel) {
      this.nextTvLabel = String.fromCharCode(this.nextTvLabel.charCodeAt(0) + 1);
    } else if (pos.y >= 0 && label === this.nextFvLabel) {
      const base = this.nextFvLabel.replace("'", "");
      this.nextFvLabel = String.fromCharCode(base.charCodeAt(0) + 1) + "'";
    }
    this.saveState();
    this.render();
  }

  saveState() {
    this.history.push(JSON.stringify(this.elements));
    if (this.history.length > 50) this.history.shift();
    this.redoStack = [];
    this.updateUndoRedoButtons();
    this.onElementsChanged?.(this.elements);
  }

  undo() {
    if (this.history.length <= 1) return;
    this.redoStack.push(this.history.pop());
    this.elements = JSON.parse(this.history[this.history.length - 1]);
    this.selectedIds.clear();
    this.render();
    this.updateUndoRedoButtons();
    this.onElementsChanged?.(this.elements);
  }

  redo() {
    if (this.redoStack.length === 0) return;
    const next = this.redoStack.pop();
    this.history.push(next);
    this.elements = JSON.parse(next);
    this.selectedIds.clear();
    this.render();
    this.updateUndoRedoButtons();
    this.onElementsChanged?.(this.elements);
  }

  clearCanvas() {
    if (this.elements.length === 0) return;
    this.elements = [];
    this.selectedIds.clear();
    this.saveState();
    this.render();
    this.onElementsChanged?.(this.elements);
  }

  updateUndoRedoButtons() {
    const u = document.getElementById("canvasUndo");
    const r = document.getElementById("canvasRedo");
    if (u) u.disabled = this.history.length <= 1;
    if (r) r.disabled = this.redoStack.length === 0;
  }

  updateHud(pos, worldPos) {
    const coordStr = `${worldPos.x.toFixed(1)}, ${worldPos.y.toFixed(1)}, 0.0 mm`;
    const statusCoords = document.getElementById("acadStatusCoords");
    if (statusCoords) statusCoords.textContent = coordStr;

    if (!this.hud) return;
    let lenText = "";
    let angleText = "";
    const base = this.dragStart || this.cmdOriginPt;
    if ((this.isDrawing || this.cmdStage === "displacement") && base) {
      const dx = worldPos.x - base.x;
      const dy = worldPos.y - base.y;
      const len = Math.hypot(dx, dy);
      const deg = normalizeDeg((Math.atan2(dy, dx) * 180) / Math.PI);
      lenText = ` L: ${len.toFixed(1)} mm`;
      angleText = ` ∠: ${deg.toFixed(1)}°`;
    }
    const region = this.isoDraftEnabled
      ? `ISOPLANE: ${getIsoplaneSpec(this.isoplane).shortLabel}`
      : worldPos.y >= 0
        ? "VP (Front View)"
        : "HP (Top View)";
    this.hud.textContent = `X: ${worldPos.x.toFixed(1)} · Y: ${worldPos.y.toFixed(1)} mm [${region}]${lenText}${angleText}`;

    if (this.snapHud) {
      if (this.activeSnap) {
        this.snapHud.style.display = "block";
        this.snapHud.style.left = `${pos.x + 16}px`;
        this.snapHud.style.top = `${pos.y - 26}px`;
        this.snapHud.textContent = `${this.activeSnap.label}`;
      } else {
        this.snapHud.style.display = "none";
      }
    }
  }

  // =========================================================================
  // RENDERING PIPELINE (60 FPS HiDPI Model Space)
  // =========================================================================

  render() {
    const ctx = this.ctx;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.width / dpr;
    const h = this.canvas.height / dpr;

    ctx.clearRect(0, 0, w, h);

    // 1. Millimeter Rectangular OR 30°/150°/90° Isometric Diamond Grid (F7)
    if (this.gridEnabled) {
      if (this.isoDraftEnabled) this.drawIsoGrid(ctx, w, h);
      else this.drawGrid(ctx, w, h);
    }

    // 2. XY Reference Axis Line
    this.drawXYLine(ctx, w, h);

    // 3. Ghost Guide Overlay
    if (this.showGhostGuide && this.ghostElements.length > 0) {
      this.drawGhostGuide(ctx);
    }

    // 4. Drawn Geometry per Active Layer Styling & Lineweight
    for (const el of this.elements) {
      if (!this.layerManager.isElementVisible(el)) continue;
      this.drawElement(ctx, el, this.selectedIds.has(el.id));
    }

    // 5. Modify Previews (Trim Span, Extend Ray, Offset Ghost, Selected Ghosts)
    this.drawModifyPreview(ctx);

    // 6. Active Draw Preview + Protractor
    if (this.isDrawing && this.dragStart) {
      this.drawPreview(ctx);
    } else if (this.tool === "polyline" && this.polyPoints.length > 0) {
      this.drawPolylineInProgress(ctx);
    } else if (this.tool === "arc" && this.arcPoints.length > 0) {
      this.drawArcInProgress(ctx);
    }

    // 7. Window / Crossing Selection Box
    if (this.boxSelStart && this.boxSelCurrent) {
      drawSelectionBox(
        ctx,
        this.worldToScreen(this.boxSelStart.x, this.boxSelStart.y),
        this.worldToScreen(this.boxSelCurrent.x, this.boxSelCurrent.y)
      );
    }

    // 8. Green OSNAP Marker
    if (this.activeSnap) {
      this.osnap.drawMarker(ctx, this.activeSnap);
    }

    // 9. Bottom-left 2D UCS Icon & Full-Screen Crosshair Cursor
    this.drawUcsIcon(ctx, w, h);
    if (this.mouseScreen.inside && this.tool !== "pan" && !this.isPanning) {
      this.drawCrosshair(ctx, w, h);
    }
  }

  drawIsoGrid(ctx, w, h) {
    const scale = this.basePxPerMm * this.zoom;
    const stepMm = this.zoom >= 0.7 ? 10 : 20;
    const cos30 = Math.sqrt(3) / 2;
    const sin30 = 0.5;
    const spanPx = Math.hypot(w, h) + 200;

    // Anchor isometric lattice to Origin (0,0) so grid intersects cleanly with sheet coordinates
    const o = this.worldToScreen(0, 0);
    const stepRight = stepMm * scale;
    const stepVert = stepMm * scale;

    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.11)";
    ctx.lineWidth = 0.85;
    ctx.setLineDash([]);

    // Vertical 90° grid lines along iso horizontal pitch (step * cos30)
    const dxVert = stepRight * cos30;
    const startVX = ((o.x % dxVert) + dxVert) % dxVert;
    ctx.beginPath();
    for (let x = startVX; x < w; x += dxVert) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    ctx.stroke();

    // Sloping 30° (+X_iso) and 150° (-Z_iso) diamond grid lines passing through exact lattice steps
    const numSteps = Math.ceil((w + h) / (stepVert * 0.5) / 2) + 24;
    const slope = Math.tan(Math.PI / 6); // 1 / sqrt(3)
    const yPeriod = stepVert;
    const baseYOffset = ((o.y - o.x * slope) % yPeriod + yPeriod) % yPeriod;
    const diagSpanX = w + 120;

    ctx.beginPath();
    for (let k = -numSteps; k <= numSteps; k++) {
      const y0 = o.y + k * yPeriod;
      // 30° upward-right lines (in screen Y-down: dy/dx = -tan30)
      const yAt0_pos = y0 + o.x * slope;
      const yAtW_pos = y0 - (diagSpanX - o.x) * slope;
      ctx.moveTo(0, yAt0_pos);
      ctx.lineTo(diagSpanX, yAtW_pos);

      // 150° upward-left / 330° downward-right lines (dy/dx = +tan30)
      const yAt0_neg = y0 - o.x * slope;
      const yAtW_neg = y0 + (diagSpanX - o.x) * slope;
      ctx.moveTo(0, yAt0_neg);
      ctx.lineTo(diagSpanX, yAtW_neg);
    }
    ctx.stroke();

    // Scale labels across top edge
    ctx.fillStyle = "#777777";
    ctx.font = "9px monospace";
    for (let x = startVX; x < w; x += dxVert * 2) {
      const mmX = Math.round((x - this.originX) / scale);
      if (mmX !== 0) ctx.fillText(String(mmX), x + 2, 11);
    }
    ctx.restore();
  }

  drawGrid(ctx, w, h) {
    const scale = this.basePxPerMm * this.zoom;
    const majorStepPx = 10 * scale;
    const minorStepPx = 2 * scale;
    const startX = this.originX % majorStepPx;
    const startY = this.originY % majorStepPx;

    if (this.zoom >= 0.7) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
      ctx.lineWidth = 0.6;
      const minorStartX = this.originX % minorStepPx;
      const minorStartY = this.originY % minorStepPx;
      for (let x = minorStartX; x < w; x += minorStepPx) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = minorStartY; y < h; y += minorStepPx) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
    ctx.lineWidth = 1;
    for (let x = startX; x < w; x += majorStepPx) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = startY; y < h; y += majorStepPx) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    ctx.fillStyle = "#777777";
    ctx.font = "9px monospace";
    for (let x = startX; x < w; x += majorStepPx * 2) {
      const mmX = Math.round((x - this.originX) / scale);
      if (mmX !== 0) ctx.fillText(String(mmX), x + 2, 11);
    }
    for (let y = startY; y < h; y += majorStepPx * 2) {
      const mmY = Math.round((this.originY - y) / scale);
      if (mmY !== 0) ctx.fillText(String(mmY), 4, y - 2);
    }
  }

  drawXYLine(ctx, w, h) {
    const xyLayer = this.layerManager.getLayer("XY_Reference");
    if (!xyLayer.visible) return;
    const xyY = this.originY;
    if (xyY < -100 || xyY > h + 100) return;

    ctx.save();
    ctx.strokeStyle = xyLayer.color || "#f5b95d";
    ctx.lineWidth = 1.6;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(0, xyY);
    ctx.lineTo(w, xyY);
    ctx.stroke();

    ctx.fillStyle = xyLayer.color || "#f5b95d";
    ctx.font = "bold 12px 'Segoe UI', monospace";
    ctx.fillText("X", 16, xyY - 6);
    ctx.fillText("Y", w - 26, xyY - 6);
    ctx.font = "10px 'Segoe UI', sans-serif";
    ctx.fillStyle = "rgba(245, 185, 93, 0.72)";
    ctx.fillText("VP (Front View) ↑", 36, xyY - 6);
    ctx.fillText("HP (Top View) ↓", 36, xyY + 13);
    ctx.restore();
  }

  drawUcsIcon(ctx, w, h) {
    const ux = 26;
    const uy = h - 42;
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);

    // Origin pick square
    ctx.strokeStyle = "#aaaaaa";
    ctx.strokeRect(ux - 4, uy - 4, 8, 8);

    // X axis (Red)
    ctx.strokeStyle = "#ef4444";
    ctx.beginPath();
    ctx.moveTo(ux, uy);
    ctx.lineTo(ux + 34, uy);
    ctx.stroke();
    ctx.fillStyle = "#ef4444";
    ctx.font = "bold 10px monospace";
    ctx.fillText("X", ux + 37, uy + 3);

    // Y axis (Green)
    ctx.strokeStyle = "#22c55e";
    ctx.beginPath();
    ctx.moveTo(ux, uy);
    ctx.lineTo(ux, uy - 34);
    ctx.stroke();
    ctx.fillStyle = "#22c55e";
    ctx.fillText("Y", ux - 3, uy - 38);

    ctx.restore();
  }

  drawCrosshair(ctx, w, h) {
    const mx = this.mouseScreen.x;
    const my = this.mouseScreen.y;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash([]);

    if (this.isoDraftEnabled) {
      const spec = getIsoplaneSpec(this.isoplane);
      const span = Math.max(w, h) + 200;
      spec.axesDeg.forEach((deg, idx) => {
        const rad = (deg * Math.PI) / 180;
        const dx = Math.cos(rad);
        const dy = -Math.sin(rad); // screen Y-down
        ctx.strokeStyle = spec.axisColors[idx];
        ctx.globalAlpha = 0.65;
        ctx.beginPath();
        ctx.moveTo(mx - dx * span, my - dy * span);
        ctx.lineTo(mx - dx * 6, my - dy * 6);
        ctx.moveTo(mx + dx * 6, my + dy * 6);
        ctx.lineTo(mx + dx * span, my + dy * span);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
      ctx.font = "bold 9px monospace";
      ctx.fillStyle = "#f5b95d";
      ctx.fillText(`ISO:${spec.shortLabel}`, mx + 8, my + 14);
    } else {
      ctx.strokeStyle = "rgba(226, 232, 240, 0.45)";
      ctx.beginPath();
      // Full-screen crosshair with 5px gap around pickbox
      ctx.moveTo(0, my);
      ctx.lineTo(mx - 5, my);
      ctx.moveTo(mx + 5, my);
      ctx.lineTo(w, my);
      ctx.moveTo(mx, 0);
      ctx.lineTo(mx, my - 5);
      ctx.moveTo(mx, my + 5);
      ctx.lineTo(mx, h);
      ctx.stroke();
    }

    // Central pickbox
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.strokeRect(mx - 4, my - 4, 8, 8);
    ctx.restore();
  }

  applyElementLayerStyle(ctx, el, selected = false) {
    const layer = this.layerManager.resolveElementLayer(el);
    ctx.strokeStyle = selected ? "#ffffff" : layer.color;

    const showLwt = this.layerManager.showLineweight;
    const pxWidth = showLwt ? Math.max(1.0, (layer.lineweight || 0.25) * 4.8) : 1.3;
    ctx.lineWidth = selected ? Math.max(2.4, pxWidth + 0.8) : pxWidth;

    if (layer.linetype === "Dashed" || el.grade === "Hidden") ctx.setLineDash([6, 4]);
    else if (layer.linetype === "Center" || el.grade === "Axis") ctx.setLineDash([16, 4, 2, 4]);
    else if (layer.linetype === "Phantom" || el.grade === "Cutting Plane") ctx.setLineDash([18, 4, 4, 4]);
    else ctx.setLineDash([]);
  }

  drawElement(ctx, el, selected = false) {
    ctx.save();
    this.applyElementLayerStyle(ctx, el, selected);

    if (el.type === "line") {
      const p1 = this.worldToScreen(el.x1, el.y1);
      const p2 = this.worldToScreen(el.x2, el.y2);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      if (selected) this.drawSelectionGrips(ctx, [p1, p2]);
    } else if (el.type === "circle") {
      const c = this.worldToScreen(el.cx, el.cy);
      const r = el.radius * this.basePxPerMm * this.zoom;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.stroke();
      if (selected) this.drawSelectionGrips(ctx, [c]);
    } else if (el.type === "ellipse") {
      const c = this.worldToScreen(el.cx, el.cy);
      const s = this.basePxPerMm * this.zoom;
      const rotRad = -((el.rotationDeg || 0) * Math.PI) / 180;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, el.rx * s, el.ry * s, rotRad, 0, Math.PI * 2);
      ctx.stroke();
      if (selected) this.drawSelectionGrips(ctx, [c]);
    } else if (el.type === "arc") {
      const c = this.worldToScreen(el.cx, el.cy);
      const r = el.radius * this.basePxPerMm * this.zoom;
      ctx.beginPath();
      // World angle -> Canvas angle (invert Y)
      ctx.arc(c.x, c.y, r, -el.startAngle, -el.endAngle, Boolean(el.worldCCW));
      ctx.stroke();
      if (selected) this.drawSelectionGrips(ctx, [c]);
    } else if ((el.type === "polygon" || el.type === "polyline") && Array.isArray(el.points) && el.points.length > 0) {
      ctx.beginPath();
      const spPts = el.points.map((pt) => this.worldToScreen(pt[0], pt[1]));
      ctx.moveTo(spPts[0].x, spPts[0].y);
      for (let i = 1; i < spPts.length; i++) ctx.lineTo(spPts[i].x, spPts[i].y);
      if (el.type === "polygon" || el.closed) ctx.closePath();
      ctx.stroke();
      if (selected) this.drawSelectionGrips(ctx, spPts);
    } else if (el.type === "text") {
      const p = this.worldToScreen(el.x, el.y);
      const layer = this.layerManager.resolveElementLayer(el);
      ctx.fillStyle = selected ? "#ffffff" : layer.color;
      ctx.font = "italic 14px 'Segoe UI', serif";
      ctx.fillText(el.text, p.x + 4, p.y - 4);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (el.type === "dimension") {
      this.drawDimension(ctx, el, selected);
    }
    ctx.restore();
  }

  drawSelectionGrips(ctx, screenPts) {
    ctx.save();
    ctx.fillStyle = "#f5b95d";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    for (const p of screenPts) {
      ctx.fillRect(p.x - 3.5, p.y - 3.5, 7, 7);
      ctx.strokeRect(p.x - 3.5, p.y - 3.5, 7, 7);
    }
    ctx.restore();
  }

  drawDimension(ctx, dim, selected = false) {
    const dimColor = selected ? "#ffffff" : this.layerManager.getLayer("Dimensions_Text").color || "#e5e5e5";
    ctx.strokeStyle = dimColor;
    ctx.fillStyle = dimColor;
    ctx.lineWidth = 1.1;
    ctx.setLineDash([]);

    if (dim.subType === "angular") {
      const c = this.worldToScreen(dim.x1, dim.y1);
      const r = (dim.radius || 22) * this.basePxPerMm * this.zoom;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, -dim.a1, -dim.a2, Math.abs(dim.a2 - dim.a1) < Math.PI ? dim.a2 > dim.a1 : dim.a2 < dim.a1);
      ctx.stroke();
      const midA = (dim.a1 + dim.a2) / 2;
      ctx.font = "11px 'Segoe UI', monospace";
      ctx.fillText(String(dim.value), c.x + (r + 12) * Math.cos(midA), c.y - (r + 12) * Math.sin(midA));
      return;
    }

    const p1 = this.worldToScreen(dim.x1, dim.y1);
    const p2 = this.worldToScreen(dim.x2, dim.y2);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    drawArrow(ctx, p2, p1, 7);
    drawArrow(ctx, p1, p2, 7);
    const mx = (p1.x + p2.x) / 2;
    const my = (p1.y + p2.y) / 2;
    ctx.font = "11px 'Segoe UI', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(`${dim.value} mm`, mx, my - 4);
  }

  drawModifyPreview(ctx) {
    if (this.hoverPreviewInfo?.kind === "trim") {
      const s = this.hoverPreviewInfo.span;
      const p1 = this.worldToScreen(s.x1, s.y1);
      const p2 = this.worldToScreen(s.x2, s.y2);
      ctx.save();
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 3.2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.restore();
    } else if (this.hoverPreviewInfo?.kind === "extend") {
      const p1 = this.worldToScreen(this.hoverPreviewInfo.from.x, this.hoverPreviewInfo.from.y);
      const p2 = this.worldToScreen(this.hoverPreviewInfo.to.x, this.hoverPreviewInfo.to.y);
      ctx.save();
      ctx.strokeStyle = "#4ade80";
      ctx.lineWidth = 2.0;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.restore();
    } else if (this.hoverPreviewInfo?.kind === "offset") {
      ctx.save();
      ctx.globalAlpha = 0.65;
      this.drawElement(ctx, this.hoverPreviewInfo.entity, false);
      ctx.restore();
    }

    // Move / Copy / Rotate / Mirror ghost preview
    if ((this.cmdStage === "displacement" || this.cmdStage === "angle" || this.cmdStage === "mirror2") && this.cmdOriginPt) {
      ctx.save();
      ctx.globalAlpha = 0.65;
      if (this.cmdStage === "displacement") {
        const dx = this.currentWorldPos.x - this.cmdOriginPt.x;
        const dy = this.currentWorldPos.y - this.cmdOriginPt.y;
        for (const el of this.elements) {
          if (this.selectedIds.has(el.id)) {
            this.drawElement(ctx, transformEntity(el, (p) => ({ x: p.x + dx, y: p.y + dy }), 0), false);
          }
        }
      } else if (this.cmdStage === "angle") {
        const ang = (Math.atan2(this.currentWorldPos.y - this.cmdOriginPt.y, this.currentWorldPos.x - this.cmdOriginPt.x) * 180) / Math.PI;
        const rad = (ang * Math.PI) / 180;
        const cosA = Math.cos(rad);
        const sinA = Math.sin(rad);
        const pivot = this.cmdOriginPt;
        const rotPt = (p) => ({
          x: pivot.x + (p.x - pivot.x) * cosA - (p.y - pivot.y) * sinA,
          y: pivot.y + (p.x - pivot.x) * sinA + (p.y - pivot.y) * cosA
        });
        for (const el of this.elements) {
          if (this.selectedIds.has(el.id)) {
            this.drawElement(ctx, transformEntity(el, rotPt, ang), false);
          }
        }
      } else if (this.cmdStage === "mirror2") {
        for (const el of this.elements) {
          if (this.selectedIds.has(el.id)) {
            this.drawElement(ctx, mirrorEntity(el, this.cmdOriginPt, this.currentWorldPos), false);
          }
        }
        const a = this.worldToScreen(this.cmdOriginPt.x, this.cmdOriginPt.y);
        const b = this.worldToScreen(this.currentWorldPos.x, this.currentWorldPos.y);
        ctx.strokeStyle = "#f5b95d";
        ctx.lineWidth = 1.4;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  drawPolylineInProgress(ctx) {
    ctx.save();
    this.applyElementLayerStyle(ctx, { grade: this.layerManager.getActiveLayer().grade }, false);
    const spPts = this.polyPoints.map((pt) => this.worldToScreen(pt[0], pt[1]));
    ctx.beginPath();
    ctx.moveTo(spPts[0].x, spPts[0].y);
    for (let i = 1; i < spPts.length; i++) ctx.lineTo(spPts[i].x, spPts[i].y);
    const p2 = this.worldToScreen(this.currentWorldPos.x, this.currentWorldPos.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.restore();
  }

  drawArcInProgress(ctx) {
    ctx.save();
    this.applyElementLayerStyle(ctx, { grade: this.layerManager.getActiveLayer().grade }, false);
    if (this.arcPoints.length === 1) {
      const a = this.worldToScreen(this.arcPoints[0].x, this.arcPoints[0].y);
      const b = this.worldToScreen(this.currentWorldPos.x, this.currentWorldPos.y);
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    } else if (this.arcPoints.length === 2) {
      const circ = circumcircle3Pt(this.arcPoints[0], this.arcPoints[1], this.currentWorldPos);
      if (circ) {
        const c = this.worldToScreen(circ.cx, circ.cy);
        const r = circ.radius * this.basePxPerMm * this.zoom;
        ctx.beginPath();
        ctx.arc(c.x, c.y, r, -circ.startAngle, -circ.endAngle, Boolean(circ.worldCCW));
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawPreview(ctx) {
    ctx.save();
    const activeLayer = this.layerManager.getActiveLayer();
    ctx.strokeStyle = activeLayer.color || "#ffffff";
    ctx.lineWidth = 1.8;

    const p1 = this.worldToScreen(this.dragStart.x, this.dragStart.y);
    const p2 = this.worldToScreen(this.currentWorldPos.x, this.currentWorldPos.y);
    const dx = this.currentWorldPos.x - this.dragStart.x;
    const dy = this.currentWorldPos.y - this.dragStart.y;
    const lenMm = Math.hypot(dx, dy);
    const deg = normalizeDeg((Math.atan2(dy, dx) * 180) / Math.PI);

    if (this.tool === "rect") {
      const x = Math.min(p1.x, p2.x);
      const y = Math.min(p1.y, p2.y);
      ctx.strokeRect(x, y, Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y));
      ctx.restore();
      return;
    }

    if (["line", "projector", "dimension", "dimlinear", "polyline"].includes(this.tool)) {
      ctx.save();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(p1.x - 48, p1.y);
      ctx.lineTo(p1.x + 48, p1.y);
      ctx.moveTo(p1.x, p1.y - 48);
      ctx.lineTo(p1.x, p1.y + 48);
      ctx.stroke();

      const dialR = 32;
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
      ctx.beginPath();
      ctx.arc(p1.x, p1.y, dialR, 0, Math.PI * 2);
      ctx.stroke();
      for (let t = 0; t < 360; t += 15) {
        const tr = (t * Math.PI) / 180;
        const inner = t % 45 === 0 ? dialR - 6 : dialR - 3;
        ctx.beginPath();
        ctx.moveTo(p1.x + inner * Math.cos(tr), p1.y - inner * Math.sin(tr));
        ctx.lineTo(p1.x + dialR * Math.cos(tr), p1.y - dialR * Math.sin(tr));
        ctx.stroke();
      }

      if (this.snappedAngleInfo) {
        const sRad = (this.snappedAngleInfo.deg * Math.PI) / 180;
        ctx.strokeStyle = "rgba(74, 222, 128, 0.45)";
        ctx.lineWidth = 1.1;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p1.x + 600 * Math.cos(sRad), p1.y - 600 * Math.sin(sRad));
        ctx.stroke();
      }

      if (lenMm > 1.5) {
        const refBase = dx >= 0 ? 0 : 180;
        const delta = ((deg - refBase + 540) % 360) - 180;
        const arcR = Math.min(26, Math.max(14, Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.45));
        ctx.strokeStyle = "#f5b95d";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.beginPath();
        for (let s = 0; s <= 24; s++) {
          const a = ((refBase + (delta * s) / 24) * Math.PI) / 180;
          const ax = p1.x + arcR * Math.cos(a);
          const ay = p1.y - arcR * Math.sin(a);
          if (s === 0) ctx.moveTo(ax, ay);
          else ctx.lineTo(ax, ay);
        }
        ctx.stroke();
      }
      ctx.restore();

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    } else if (this.tool === "circle") {
      const r = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      ctx.beginPath();
      ctx.arc(p1.x, p1.y, r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (this.tool === "isocircle" || this.tool === "fourcenter") {
      const rIso = Math.max(1, lenMm);
      const s = this.basePxPerMm * this.zoom;
      const fc = buildFourCenterGeometry(this.dragStart.x, this.dragStart.y, rIso, this.isoplane, { includeLabels: false });
      ctx.save();
      ctx.strokeStyle = "rgba(245, 185, 93, 0.45)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      for (const l of [...fc.rhombusLines, ...(this.tool === "fourcenter" ? fc.medianLines : [])]) {
        const a = this.worldToScreen(l.x1, l.y1);
        const b = this.worldToScreen(l.x2, l.y2);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.restore();

      const isoEl = computeIsocircleGeometry(this.dragStart.x, this.dragStart.y, rIso, this.isoplane);
      const c = this.worldToScreen(isoEl.cx, isoEl.cy);
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, isoEl.rx * s, isoEl.ry * s, -((isoEl.rotationDeg * Math.PI) / 180), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawGhostGuide(ctx) {
    ctx.save();
    for (const g of this.ghostElements) {
      if (g.style === "cutting") {
        ctx.strokeStyle = "rgba(244, 114, 182, 0.55)";
        ctx.lineWidth = 2.0;
        ctx.setLineDash([12, 4, 3, 4]);
      } else if (g.style === "hidden") {
        ctx.strokeStyle = "rgba(250, 204, 21, 0.4)";
        ctx.lineWidth = 1.4;
        ctx.setLineDash([4, 4]);
      } else if (g.style === "axis") {
        ctx.strokeStyle = "rgba(248, 113, 113, 0.45)";
        ctx.lineWidth = 1.2;
        ctx.setLineDash([12, 3, 2, 3]);
      } else {
        ctx.strokeStyle = "rgba(245, 185, 93, 0.42)";
        ctx.lineWidth = 1.6;
        ctx.setLineDash([5, 4]);
      }

      if (g.type === "line" && g.from && g.to) {
        const p1 = this.worldToScreen(g.from[0], g.from[1]);
        const p2 = this.worldToScreen(g.to[0], g.to[1]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      } else if (g.type === "circle" && g.center) {
        const c = this.worldToScreen(g.center[0], g.center[1]);
        const r = g.radius * this.basePxPerMm * this.zoom;
        ctx.beginPath();
        ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (g.type === "ellipse" && g.center) {
        const c = this.worldToScreen(g.center[0], g.center[1]);
        const s = this.basePxPerMm * this.zoom;
        const rotRad = -((g.rotationDeg || 0) * Math.PI) / 180;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, g.rx * s, g.ry * s, rotRad, 0, Math.PI * 2);
        ctx.stroke();
      } else if (g.type === "arc" && g.center && Number.isFinite(g.radius)) {
        const c = this.worldToScreen(g.center[0], g.center[1]);
        const r = g.radius * this.basePxPerMm * this.zoom;
        const sa = ((g.startAngle || 0) * Math.PI) / 180;
        const ea = ((g.endAngle || 90) * Math.PI) / 180;
        ctx.beginPath();
        for (let i = 0; i <= 48; i++) {
          const a = sa + ((ea - sa) * i) / 48;
          const px = c.x + r * Math.cos(a);
          const py = c.y - r * Math.sin(a);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      } else if (g.type === "polygon" && g.points && g.points.length > 0) {
        ctx.beginPath();
        g.points.forEach((pt, idx) => {
          const sp = this.worldToScreen(pt[0], pt[1]);
          if (idx === 0) ctx.moveTo(sp.x, sp.y);
          else ctx.lineTo(sp.x, sp.y);
        });
        ctx.closePath();
        ctx.stroke();
      } else if (g.type === "polygon" && g.center) {
        const c = this.worldToScreen(g.center[0], g.center[1]);
        const sides = g.sides || 6;
        const R = ((g.edgeLength || 25) / (2 * Math.sin(Math.PI / sides))) * this.basePxPerMm * this.zoom;
        const baseA = ((g.angle || 0) * Math.PI) / 180;
        ctx.beginPath();
        for (let i = 0; i < sides; i++) {
          const a = baseA + (2 * Math.PI * i) / sides;
          const x = c.x + R * Math.cos(a);
          const y = c.y - R * Math.sin(a);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

function drawArrow(ctx, from, to, size) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.save();
  ctx.translate(to.x, to.y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-size, -size / 2.5);
  ctx.lineTo(-size, size / 2.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
