/**
 * Scaled Drafting Canvas Engine for Engineering Graphics Practice Studio
 * True-to-scale coordinate mapping (1 mm = 4 px baseline), CAD toolset,
 * millimeter blueprint grid, vertex & polar snap engine, live protractor HUD,
 * angle/length locking, and click-click + click-drag hybrid drafting.
 */

const normalizeDeg = (d) => ((d % 360) + 360) % 360;
const angDiffDeg = (a, b) => {
  const diff = Math.abs(normalizeDeg(a) - normalizeDeg(b));
  return Math.min(diff, 360 - diff);
};

/**
 * Pure polar constraint solver (unit-tested).
 * Computes final endpoint world coordinates under ortho lock, explicit angle lock
 * (XY or Edge-relative), explicit length lock, and magnetic polar angle snapping.
 */
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

  // 1. Ortho lock (Shift)
  if (opts.orthoLock) {
    const orthoCandidates = [0, 90, 180, 270];
    let best = 0;
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
      snappedInfo: { deg: best, label: `ORTHO ${best}°`, mode: "ortho" }
    };
  }

  // 2. Explicit Angle Lock (∠ Lock)
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

  // 3. Polar Angle Snap (15° increments + key edge-relative angles 45°, 90°, 30°, 60°)
  if (opts.angleSnap) {
    const snapWindow = 4.2;
    let best = null;
    let bestD = snapWindow;
    let bestLabel = "";

    // Edge-relative key angles when started on an inclined edge
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

    // Standard 15° global snaps (slightly preferred on ties)
    for (let target = 0; target < 360; target += 15) {
      const d = angDiffDeg(rawDeg, target);
      if (d <= bestD + 0.3 && d < snapWindow) {
        bestD = d;
        best = target;
        bestLabel = `${target}° SNAP`;
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

  // 4. Length-only lock or completely free
  const rad = (rawDeg * Math.PI) / 180;
  return {
    point: lockedLen
      ? { x: fromWorld.x + targetLen * Math.cos(rad), y: fromWorld.y + targetLen * Math.sin(rad) }
      : toWorld,
    snappedInfo: null
  };
}

/**
 * Parses AutoCAD-style dynamic keyboard entry while drawing:
 * e.g. "50<45", "@30<135", "<45", "50"
 */
export function parseDynamicEntry(raw) {
  const s = String(raw || "").trim().replace(/^@/, "");
  if (!s) return null;

  const polar = s.match(/^(\d+(?:\.\d+)?)\s*<\s*(-?\d+(?:\.\d+)?)$/);
  if (polar) {
    return { length: parseFloat(polar[1]), angle: parseFloat(polar[2]) };
  }

  const angleOnly = s.match(/^<\s*(-?\d+(?:\.\d+)?)$/);
  if (angleOnly) {
    return { length: null, angle: parseFloat(angleOnly[1]) };
  }

  const lenOnly = s.match(/^(\d+(?:\.\d+)?)$/);
  if (lenOnly) {
    return { length: parseFloat(lenOnly[1]), angle: null };
  }

  return null;
}

export class PracticeCanvas {
  constructor(canvas, hudElement, snapHudElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.hud = hudElement;
    this.snapHud = snapHudElement;

    // Viewport transform (World: mm, Screen: px)
    this.basePxPerMm = 4;
    this.zoom = 1.0;
    this.originX = canvas.width / 2;
    this.originY = canvas.height / 2;

    // Active tool and style
    this.tool = "line"; // line, polygon, circle, projector, text, dimension, eraser, pan
    this.pencilGrade = "HB"; // 2H, HB, Hidden, Axis, Cutting Plane, Dimension
    this.orthoLock = false;
    this.angleSnap = true;
    this.lockedAngleDeg = null;
    this.angleRelativeTo = "xy"; // "xy" | "edge"
    this.lockedLengthMm = null;
    this.refEdgeAngleDeg = null;
    this.snappedAngleInfo = null;
    this.showGhostGuide = false;
    this.ghostElements = [];

    // Canvas elements & history
    this.elements = [];
    this.history = [];
    this.redoStack = [];
    this.onElementsChanged = null;
    this.onPreviewChanged = null;

    // Interaction state
    this.isDrawing = false;
    this.clickClickActive = false;
    this.pointerDownScreen = null;
    this.typedCommandBuffer = "";
    this.isPanning = false;
    this.panStartX = 0;
    this.panStartY = 0;
    this.dragStart = null;
    this.currentWorldPos = { x: 0, y: 0 };
    this.activeSnap = null;
    this.selectedElement = null;

    // Label suggester state
    this.nextTvLabel = "a";
    this.nextFvLabel = "a'";

    // Polygon generator settings
    this.polygonSettings = {
      sides: 4,
      edgeLength: 30,
      angle: 0
    };

    // Initialize listeners
    this.initEvents();
    this.resize();
    this.saveState();
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

  // Coordinate transforms
  worldToScreen(x_mm, y_mm) {
    const scale = this.basePxPerMm * this.zoom;
    return {
      x: this.originX + x_mm * scale,
      y: this.originY - y_mm * scale // In EG: +Y is UP (VP), -Y is DOWN (HP)
    };
  }

  screenToWorld(sx, sy) {
    const scale = this.basePxPerMm * this.zoom;
    return {
      x: (sx - this.originX) / scale,
      y: (this.originY - sy) / scale
    };
  }

  // Snap Engine
  findSnap(screenX, screenY) {
    const snapThreshold = 12; // pixels
    let bestSnap = null;
    let bestDist = snapThreshold;

    const testPoint = (wx, wy, type, label) => {
      const sp = this.worldToScreen(wx, wy);
      const d = Math.hypot(sp.x - screenX, sp.y - screenY);
      if (d < bestDist) {
        bestDist = d;
        bestSnap = {
          worldX: wx,
          worldY: wy,
          screenX: sp.x,
          screenY: sp.y,
          type,
          label
        };
      }
    };

    // 1. Snap to XY reference line (Y = 0)
    const cursorWorld = this.screenToWorld(screenX, screenY);
    const xyScreen = this.worldToScreen(cursorWorld.x, 0);
    if (Math.abs(xyScreen.y - screenY) < snapThreshold) {
      testPoint(cursorWorld.x, 0, "xy", "XY Reference Line");
    }

    // 2. Snap to elements
    for (const el of this.elements) {
      if (el.type === "line") {
        testPoint(el.x1, el.y1, "endpoint", "Endpoint");
        testPoint(el.x2, el.y2, "endpoint", "Endpoint");
        testPoint((el.x1 + el.x2) / 2, (el.y1 + el.y2) / 2, "midpoint", "Midpoint");
      } else if (el.type === "circle") {
        testPoint(el.cx, el.cy, "center", "Center");
        testPoint(el.cx + el.radius, el.cy, "quadrant", "Quadrant");
        testPoint(el.cx - el.radius, el.cy, "quadrant", "Quadrant");
        testPoint(el.cx, el.cy + el.radius, "quadrant", "Quadrant");
        testPoint(el.cx, el.cy - el.radius, "quadrant", "Quadrant");
      } else if (el.type === "polygon") {
        for (const pt of el.points) {
          testPoint(pt[0], pt[1], "endpoint", "Vertex");
        }
        if (el.cx !== undefined && el.cy !== undefined) {
          testPoint(el.cx, el.cy, "center", "Center");
        }
      }
    }

    return bestSnap;
  }

  findReferenceEdgeAngle(wx, wy) {
    const tol = 2.5;
    if (Math.abs(wy) < tol) return 0;
    for (let i = this.elements.length - 1; i >= 0; i--) {
      const el = this.elements[i];
      if (el.type === "line") {
        if (distToSegment({ x: wx, y: wy }, { x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 }) < tol) {
          return normalizeDeg((Math.atan2(el.y2 - el.y1, el.x2 - el.x1) * 180) / Math.PI);
        }
      } else if (el.type === "polygon" && el.points) {
        for (let j = 0; j < el.points.length; j++) {
          const a = el.points[j];
          const b = el.points[(j + 1) % el.points.length];
          if (distToSegment({ x: wx, y: wy }, { x: a[0], y: a[1] }, { x: b[0], y: b[1] }) < tol) {
            return normalizeDeg((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI);
          }
        }
      }
    }
    return null;
  }

  // Ortho, Polar Lock & Angle Snapping
  applyAngleConstraints(fromWorld, toWorld) {
    const res = computePolarConstraint(fromWorld, toWorld, {
      orthoLock: this.orthoLock,
      angleSnap: this.angleSnap,
      lockedAngleDeg: this.lockedAngleDeg,
      angleRelativeTo: this.angleRelativeTo,
      refEdgeAngleDeg: this.refEdgeAngleDeg,
      lockedLengthMm: this.lockedLengthMm
    });
    this.snappedAngleInfo = res.snappedInfo;
    return res.point;
  }

  cancelDrawing() {
    this.isDrawing = false;
    this.clickClickActive = false;
    this.dragStart = null;
    this.refEdgeAngleDeg = null;
    this.snappedAngleInfo = null;
    this.typedCommandBuffer = "";
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

  // Event handlers
  initEvents() {
    this.canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    window.addEventListener("pointermove", (e) => this.onPointerMove(e));
    window.addEventListener("pointerup", (e) => this.onPointerUp(e));
    this.canvas.addEventListener("pointerleave", () => {
      if (!this.isDrawing) this.onPreviewChanged?.(null);
    });
    this.canvas.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    // Keyboard shortcuts (Undo, Redo, Ortho Shift, Escape, Direct Polar Input 50<45)
    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      if (e.key === "Shift") {
        this.orthoLock = true;
        this.render();
      }
      if (e.key === "Escape") {
        if (this.typedCommandBuffer) {
          this.typedCommandBuffer = "";
          this.render();
        } else if (this.isDrawing) {
          this.cancelDrawing();
        }
        return;
      }
      if (this.isDrawing && this.dragStart && (this.tool === "line" || this.tool === "projector" || this.tool === "circle" || this.tool === "dimension")) {
        if (/^[0-9.<\-]$/.test(e.key)) {
          e.preventDefault();
          this.typedCommandBuffer += e.key;
          this.render();
          return;
        }
        if (e.key === "Backspace" && this.typedCommandBuffer.length > 0) {
          e.preventDefault();
          this.typedCommandBuffer = this.typedCommandBuffer.slice(0, -1);
          this.render();
          return;
        }
        if (e.key === "Enter" && this.typedCommandBuffer.length > 0) {
          e.preventDefault();
          const parsed = parseDynamicEntry(this.typedCommandBuffer);
          this.typedCommandBuffer = "";
          if (parsed) {
            const dx = this.currentWorldPos.x - this.dragStart.x;
            const dy = this.currentWorldPos.y - this.dragStart.y;
            const curLen = Math.hypot(dx, dy) || 30;
            const curRad = Math.atan2(dy, dx);
            const len = parsed.length !== null ? parsed.length : curLen;
            let rad = curRad;
            if (parsed.angle !== null) {
              const deg = this.angleRelativeTo === "edge" && Number.isFinite(this.refEdgeAngleDeg)
                ? this.refEdgeAngleDeg + parsed.angle
                : parsed.angle;
              rad = (deg * Math.PI) / 180;
            }
            const targetEnd = {
              x: this.dragStart.x + len * Math.cos(rad),
              y: this.dragStart.y + len * Math.sin(rad)
            };
            this.commitSegment(this.dragStart, targetEnd);
            return;
          }
        }
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

  onPointerDown(e) {
    const pos = this.getPointerPos(e);

    // Right-click cancels active click-click drawing
    if (e.button === 2 && this.isDrawing) {
      this.cancelDrawing();
      return;
    }

    // Pan with middle click, Space+click, or Pan tool
    if (e.button === 1 || this.tool === "pan" || e.spaceKey) {
      this.isPanning = true;
      this.panStartX = pos.x - this.originX;
      this.panStartY = pos.y - this.originY;
      this.canvas.style.cursor = "grabbing";
      return;
    }

    if (e.button !== 0) return; // Only primary button for drawing

    let worldPos = this.activeSnap
      ? { x: this.activeSnap.worldX, y: this.activeSnap.worldY }
      : this.screenToWorld(pos.x, pos.y);

    if (this.tool === "eraser") {
      this.eraseAt(pos.x, pos.y);
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

    // Second click in click-click mode completes segment
    if (this.isDrawing && this.clickClickActive && this.dragStart) {
      if (this.tool === "projector") {
        const dx = Math.abs(worldPos.x - this.dragStart.x);
        const dy = Math.abs(worldPos.y - this.dragStart.y);
        if (dx < dy) worldPos.x = this.dragStart.x;
        else worldPos.y = this.dragStart.y;
      } else if (this.tool === "line" || this.tool === "dimension") {
        worldPos = this.applyAngleConstraints(this.dragStart, worldPos);
      }
      this.commitSegment(this.dragStart, worldPos);
      return;
    }

    // Start drawing line, circle, projector, dimension
    this.isDrawing = true;
    this.clickClickActive = false;
    this.pointerDownScreen = { x: pos.x, y: pos.y };
    this.dragStart = worldPos;
    this.refEdgeAngleDeg = this.findReferenceEdgeAngle(worldPos.x, worldPos.y);
    this.snappedAngleInfo = null;
    this.typedCommandBuffer = "";
    this.currentWorldPos = worldPos;
  }

  onPointerMove(e) {
    const pos = this.getPointerPos(e);

    if (this.isPanning) {
      this.originX = pos.x - this.panStartX;
      this.originY = pos.y - this.panStartY;
      this.render();
      return;
    }

    // Check snap
    this.activeSnap = this.findSnap(pos.x, pos.y);

    let worldPos = this.activeSnap
      ? { x: this.activeSnap.worldX, y: this.activeSnap.worldY }
      : this.screenToWorld(pos.x, pos.y);

    if (this.isDrawing && this.dragStart) {
      if (this.tool === "projector") {
        // Projector strictly locks vertical (90°) or horizontal (0°)
        const dx = Math.abs(worldPos.x - this.dragStart.x);
        const dy = Math.abs(worldPos.y - this.dragStart.y);
        if (dx < dy) {
          worldPos.x = this.dragStart.x;
        } else {
          worldPos.y = this.dragStart.y;
        }
        this.snappedAngleInfo = { deg: dx < dy ? 90 : 0, label: "PROJECTOR", mode: "ortho" };
      } else if (this.tool === "line" || this.tool === "dimension") {
        worldPos = this.applyAngleConstraints(this.dragStart, worldPos);
      }
    }

    this.currentWorldPos = worldPos;
    this.updateHud(pos, worldPos);
    const rect = this.canvas.getBoundingClientRect();
    const inside = pos.x >= 0 && pos.y >= 0 && pos.x <= rect.width && pos.y <= rect.height;
    if (inside || this.isDrawing) {
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
      this.canvas.style.cursor = this.tool === "pan" ? "grab" : "crosshair";
      return;
    }

    if (!this.isDrawing || !this.dragStart) return;

    const pos = this.getPointerPos(e);
    const movedPx = this.pointerDownScreen
      ? Math.hypot(pos.x - this.pointerDownScreen.x, pos.y - this.pointerDownScreen.y)
      : 999;

    // If user clicked cleanly (< 5 px drag), switch into Click-Click mode so they can aim angles effortlessly without holding LMB!
    if (movedPx < 5 && !this.clickClickActive) {
      this.clickClickActive = true;
      return;
    }

    // If finishing a click-drag gesture
    if (!this.clickClickActive) {
      this.commitSegment(this.dragStart, this.currentWorldPos);
    }
  }

  commitSegment(start, end) {
    this.isDrawing = false;
    this.clickClickActive = false;
    this.typedCommandBuffer = "";
    this.refEdgeAngleDeg = null;
    this.snappedAngleInfo = null;

    const len = Math.hypot(end.x - start.x, end.y - start.y);
    if (len < 0.5 && this.tool !== "circle") {
      this.dragStart = null;
      this.onPreviewChanged?.({
        worldPos: end,
        isDrawing: false,
        dragStart: null,
        tool: this.tool,
        pencilGrade: this.pencilGrade,
        activeSnap: this.activeSnap
      });
      this.render();
      return;
    }

    if (this.tool === "line") {
      this.elements.push({
        id: "line-" + Date.now() + "-" + Math.random(),
        type: "line",
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        grade: this.pencilGrade
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
        grade: "2H"
      });
      this.saveState();
    } else if (this.tool === "circle") {
      const radius = len || 20;
      this.elements.push({
        id: "circle-" + Date.now(),
        type: "circle",
        cx: start.x,
        cy: start.y,
        radius: Math.max(1, radius),
        grade: this.pencilGrade
      });
      this.saveState();
    } else if (this.tool === "dimension") {
      this.elements.push({
        id: "dim-" + Date.now(),
        type: "dimension",
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        value: len.toFixed(1)
      });
      this.saveState();
    }

    this.dragStart = null;
    this.onPreviewChanged?.({
      worldPos: end,
      isDrawing: false,
      dragStart: null,
      tool: this.tool,
      pencilGrade: this.pencilGrade,
      activeSnap: this.activeSnap
    });
    this.render();
  }

  onWheel(e) {
    e.preventDefault();
    const pos = this.getPointerPos(e);
    const beforeWorld = this.screenToWorld(pos.x, pos.y);

    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    const newZoom = Math.max(0.3, Math.min(6.0, this.zoom * factor));
    this.zoom = newZoom;

    // Keep point under cursor stationary
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

  placePolygon(centerWorld) {
    const sides = this.polygonSettings.sides || 4;
    const edge = this.polygonSettings.edgeLength || 30;
    const baseAngle = ((this.polygonSettings.angle || 0) * Math.PI) / 180;

    // Circumradius R = edge / (2 * sin(PI / sides))
    const R = edge / (2 * Math.sin(Math.PI / sides));
    const points = [];

    for (let i = 0; i < sides; i++) {
      const theta = baseAngle + (2 * Math.PI * i) / sides;
      points.push([
        centerWorld.x + R * Math.cos(theta),
        centerWorld.y + R * Math.sin(theta)
      ]);
    }

    this.elements.push({
      id: "poly-" + Date.now(),
      type: "polygon",
      cx: centerWorld.x,
      cy: centerWorld.y,
      sides,
      edgeLength: edge,
      points,
      grade: this.pencilGrade
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
      grade: "HB"
    });

    // Advance suggestion
    if (pos.y < 0 && label === this.nextTvLabel) {
      this.nextTvLabel = String.fromCharCode(this.nextTvLabel.charCodeAt(0) + 1);
    } else if (pos.y >= 0 && label === this.nextFvLabel) {
      const base = this.nextFvLabel.replace("'", "");
      this.nextFvLabel = String.fromCharCode(base.charCodeAt(0) + 1) + "'";
    }

    this.saveState();
    this.render();
  }

  eraseAt(screenX, screenY) {
    const clickRadius = 10;
    let foundIndex = -1;

    for (let i = this.elements.length - 1; i >= 0; i--) {
      const el = this.elements[i];
      if (el.type === "line" || el.type === "dimension") {
        const p1 = this.worldToScreen(el.x1, el.y1);
        const p2 = this.worldToScreen(el.x2, el.y2);
        const d = distToSegment({ x: screenX, y: screenY }, p1, p2);
        if (d < clickRadius) {
          foundIndex = i;
          break;
        }
      } else if (el.type === "circle") {
        const c = this.worldToScreen(el.cx, el.cy);
        const r = el.radius * this.basePxPerMm * this.zoom;
        const d = Math.abs(Math.hypot(screenX - c.x, screenY - c.y) - r);
        if (d < clickRadius) {
          foundIndex = i;
          break;
        }
      } else if (el.type === "polygon") {
        for (let j = 0; j < el.points.length; j++) {
          const pt1 = this.worldToScreen(el.points[j][0], el.points[j][1]);
          const next = (j + 1) % el.points.length;
          const pt2 = this.worldToScreen(el.points[next][0], el.points[next][1]);
          if (distToSegment({ x: screenX, y: screenY }, pt1, pt2) < clickRadius) {
            foundIndex = i;
            break;
          }
        }
        if (foundIndex !== -1) break;
      } else if (el.type === "text") {
        const p = this.worldToScreen(el.x, el.y);
        if (Math.hypot(screenX - p.x, screenY - p.y) < clickRadius * 1.5) {
          foundIndex = i;
          break;
        }
      }
    }

    if (foundIndex !== -1) {
      this.elements.splice(foundIndex, 1);
      this.saveState();
      this.render();
    }
  }

  // History (Undo/Redo)
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
    this.render();
    this.updateUndoRedoButtons();
    this.onElementsChanged?.(this.elements);
  }

  redo() {
    if (this.redoStack.length === 0) return;
    const next = this.redoStack.pop();
    this.history.push(next);
    this.elements = JSON.parse(next);
    this.render();
    this.updateUndoRedoButtons();
    this.onElementsChanged?.(this.elements);
  }

  clearCanvas() {
    if (this.elements.length === 0) return;
    this.elements = [];
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

  // HUD Update
  updateHud(pos, worldPos) {
    if (!this.hud) return;

    let lenText = "";
    let angleText = "";

    if (this.isDrawing && this.dragStart) {
      const dx = worldPos.x - this.dragStart.x;
      const dy = worldPos.y - this.dragStart.y;
      const len = Math.hypot(dx, dy);
      let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (deg < 0) deg += 360;

      lenText = ` L: ${len.toFixed(1)} mm`;
      angleText = ` ∠: ${deg.toFixed(1)}°`;
    }

    const region = worldPos.y >= 0 ? "VP (Front View)" : "HP (Top View)";
    this.hud.textContent = `X: ${worldPos.x.toFixed(1)} mm | Y: ${worldPos.y.toFixed(1)} mm [${region}]${lenText}${angleText}`;

    if (this.snapHud) {
      if (this.activeSnap) {
        this.snapHud.style.display = "block";
        this.snapHud.style.left = `${pos.x + 15}px`;
        this.snapHud.style.top = `${pos.y - 25}px`;
        this.snapHud.textContent = `Snap: ${this.activeSnap.label} (${this.activeSnap.worldX.toFixed(1)}, ${this.activeSnap.worldY.toFixed(1)})`;
      } else {
        this.snapHud.style.display = "none";
      }
    }
  }

  // Rendering Loop
  render() {
    const ctx = this.ctx;
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);

    ctx.clearRect(0, 0, w, h);

    // 1. Draw Millimeter Blueprint Grid
    this.drawGrid(ctx, w, h);

    // 2. Draw XY Reference Line prominently
    this.drawXYLine(ctx, w, h);

    // 3. Draw Ghost Guide Overlay (if enabled)
    if (this.showGhostGuide && this.ghostElements.length > 0) {
      this.drawGhostGuide(ctx);
    }

    // 4. Draw User Drawn Elements
    for (const el of this.elements) {
      this.drawElement(ctx, el);
    }

    // 5. Draw In-Progress Drag Preview
    if (this.isDrawing && this.dragStart) {
      this.drawPreview(ctx);
    }

    // 6. Draw Snap Indicator
    if (this.activeSnap) {
      this.drawSnapMarker(ctx, this.activeSnap);
    }
  }

  drawGrid(ctx, w, h) {
    const scale = this.basePxPerMm * this.zoom;
    const majorStepMm = 10; // 10 mm major grid
    const minorStepMm = 2;  // 2 mm minor grid

    const majorStepPx = majorStepMm * scale;
    const minorStepPx = minorStepMm * scale;

    const startX = this.originX % majorStepPx;
    const startY = this.originY % majorStepPx;

    // Minor grid (subtle)
    if (this.zoom >= 0.7) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
      ctx.lineWidth = 0.5;

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

    // Major grid (10 mm)
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
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

    // Subtle scale ruler numbers along edges
    ctx.fillStyle = "rgba(180, 180, 180, 0.6)";
    ctx.font = "9px monospace";
    for (let x = startX; x < w; x += majorStepPx * 2) {
      const mmX = Math.round((x - this.originX) / scale);
      if (mmX !== 0) ctx.fillText(mmX + "", x + 2, 12);
    }
    for (let y = startY; y < h; y += majorStepPx * 2) {
      const mmY = Math.round((this.originY - y) / scale);
      if (mmY !== 0) ctx.fillText(mmY + "", 4, y - 2);
    }
  }

  drawXYLine(ctx, w, h) {
    const xyY = this.originY; // Y = 0 mm
    if (xyY < -100 || xyY > h + 100) return;

    ctx.save();
    // Continuous axis line with amber accents
    ctx.strokeStyle = "#f5b95d";
    ctx.lineWidth = 1.6;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(0, xyY);
    ctx.lineTo(w, xyY);
    ctx.stroke();

    // X and Y text labels
    ctx.fillStyle = "#f5b95d";
    ctx.font = "bold 13px 'Segoe UI', monospace";
    ctx.fillText("X", 20, xyY - 6);
    ctx.fillText("Y", w - 30, xyY - 6);

    // Region indicators
    ctx.font = "10px 'Segoe UI', sans-serif";
    ctx.fillStyle = "rgba(245, 185, 93, 0.6)";
    ctx.fillText("VP (Front View) ↑", 45, xyY - 6);
    ctx.fillText("HP (Top View) ↓", 45, xyY + 14);

    ctx.restore();
  }

  applyGradeStyle(ctx, grade) {
    switch (grade) {
      case "2H": // Thin continuous (projectors, construction)
        ctx.strokeStyle = "#666666";
        ctx.lineWidth = 1.0;
        ctx.setLineDash([]);
        break;
      case "HB": // Thick continuous (visible outlines)
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.8;
        ctx.setLineDash([]);
        break;
      case "Hidden": // Medium dashed (invisible edges)
        ctx.strokeStyle = "#999999";
        ctx.lineWidth = 1.8;
        ctx.setLineDash([6, 4]);
        break;
      case "Axis": // Thin long-dash-dot (centerlines)
        ctx.strokeStyle = "#f5b95d";
        ctx.lineWidth = 1.2;
        ctx.setLineDash([16, 4, 2, 4]);
        break;
      case "Cutting Plane": // Chain thick ends
        ctx.strokeStyle = "#ff5370";
        ctx.lineWidth = 2.4;
        ctx.setLineDash([18, 4, 4, 4]);
        break;
      default:
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.0;
        ctx.setLineDash([]);
    }
  }

  drawElement(ctx, el) {
    ctx.save();
    this.applyGradeStyle(ctx, el.grade);

    if (el.type === "line") {
      const p1 = this.worldToScreen(el.x1, el.y1);
      const p2 = this.worldToScreen(el.x2, el.y2);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    } else if (el.type === "circle") {
      const c = this.worldToScreen(el.cx, el.cy);
      const r = el.radius * this.basePxPerMm * this.zoom;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (el.type === "polygon") {
      if (el.points && el.points.length > 0) {
        ctx.beginPath();
        const start = this.worldToScreen(el.points[0][0], el.points[0][1]);
        ctx.moveTo(start.x, start.y);
        for (let i = 1; i < el.points.length; i++) {
          const pt = this.worldToScreen(el.points[i][0], el.points[i][1]);
          ctx.lineTo(pt.x, pt.y);
        }
        ctx.closePath();
        ctx.stroke();
      }
    } else if (el.type === "text") {
      const p = this.worldToScreen(el.x, el.y);
      ctx.fillStyle = "#ffffff";
      ctx.font = "italic 14px 'Segoe UI', serif";
      ctx.fillText(el.text, p.x + 4, p.y - 4);
      // Small dot at anchor
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (el.type === "dimension") {
      this.drawDimension(ctx, el);
    }

    ctx.restore();
  }

  drawDimension(ctx, dim) {
    const p1 = this.worldToScreen(dim.x1, dim.y1);
    const p2 = this.worldToScreen(dim.x2, dim.y2);

    ctx.strokeStyle = "#f5b95d";
    ctx.fillStyle = "#f5b95d";
    ctx.lineWidth = 1.0;
    ctx.setLineDash([]);

    // Main line
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    // Arrowheads
    drawArrow(ctx, p2, p1, 7);
    drawArrow(ctx, p1, p2, 7);

    // Dimension text
    const mx = (p1.x + p2.x) / 2;
    const my = (p1.y + p2.y) / 2;
    ctx.font = "11px 'Segoe UI', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(`${dim.value} mm`, mx, my - 4);
  }

  drawPreview(ctx) {
    ctx.save();
    this.applyGradeStyle(ctx, this.pencilGrade);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 2.0;

    const p1 = this.worldToScreen(this.dragStart.x, this.dragStart.y);
    const p2 = this.worldToScreen(this.currentWorldPos.x, this.currentWorldPos.y);
    const dx = this.currentWorldPos.x - this.dragStart.x;
    const dy = this.currentWorldPos.y - this.dragStart.y;
    const lenMm = Math.hypot(dx, dy);
    const deg = normalizeDeg((Math.atan2(dy, dx) * 180) / Math.PI);

    if (this.tool === "line" || this.tool === "projector" || this.tool === "dimension") {
      // 1. Subtle Protractor Reference Cross & Degree Ticks around p1
      ctx.save();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(p1.x - 52, p1.y);
      ctx.lineTo(p1.x + 52, p1.y);
      ctx.moveTo(p1.x, p1.y - 52);
      ctx.lineTo(p1.x, p1.y + 52);
      ctx.stroke();

      // Subtle protractor ring every 15° around p1
      const dialR = 34;
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

      // If snapped to an existing inclined edge, render faint reference axis along that edge
      if (this.refEdgeAngleDeg !== null && Math.abs(this.refEdgeAngleDeg % 90) > 1.5) {
        const refRad = (this.refEdgeAngleDeg * Math.PI) / 180;
        ctx.strokeStyle = "rgba(245, 185, 93, 0.35)";
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(p1.x - 65 * Math.cos(refRad), p1.y + 65 * Math.sin(refRad));
        ctx.lineTo(p1.x + 65 * Math.cos(refRad), p1.y - 65 * Math.sin(refRad));
        ctx.stroke();
      }

      // 2. Polar Alignment Extension Ray when locked or snapped
      if (this.snappedAngleInfo) {
        const sRad = (this.snappedAngleInfo.deg * Math.PI) / 180;
        ctx.strokeStyle = "rgba(245, 185, 93, 0.32)";
        ctx.lineWidth = 1.2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p1.x + 500 * Math.cos(sRad), p1.y - 500 * Math.sin(sRad));
        ctx.stroke();
      }

      // 3. Swept Angle Arc between reference baseline and active segment
      if (lenMm > 1.5) {
        let refBase = dx >= 0 ? 0 : 180;
        if (this.angleRelativeTo === "edge" && this.refEdgeAngleDeg !== null) {
          refBase = angDiffDeg(deg, this.refEdgeAngleDeg) <= angDiffDeg(deg, this.refEdgeAngleDeg + 180)
            ? this.refEdgeAngleDeg
            : normalizeDeg(this.refEdgeAngleDeg + 180);
        }
        const delta = ((deg - refBase + 540) % 360) - 180;
        const arcR = Math.min(28, Math.max(14, Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.45));
        ctx.strokeStyle = this.snappedAngleInfo ? "#f5b95d" : "rgba(245, 185, 93, 0.75)";
        ctx.lineWidth = 1.6;
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

      // 4. Primary Preview Segment
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      // 5. Crisp Floating Live Telemetry Pill right beside cursor
      if (lenMm > 0.3 || this.typedCommandBuffer) {
        const horizAcute = Math.abs(deg > 180 ? 360 - deg : deg);
        const displayAcute = horizAcute > 90 ? 180 - horizAcute : horizAcute;
        let angleLabel = `∠ ${displayAcute.toFixed(1)}°`;
        if (Math.abs(deg - displayAcute) > 1.0 && Math.abs(displayAcute - 90) > 1.0 && Math.abs(displayAcute) > 1.0) {
          angleLabel += ` (${deg.toFixed(0)}°)`;
        }
        if (this.snappedAngleInfo) {
          angleLabel += ` · ${this.snappedAngleInfo.label}`;
        }
        const lenLabel = `${this.lockedLengthMm ? "🔒 " : ""}L: ${lenMm.toFixed(1)} mm`;
        const lines = [lenLabel, angleLabel];
        if (this.typedCommandBuffer) lines.push(`⌨ ${this.typedCommandBuffer} [Enter]`);

        ctx.save();
        ctx.font = "11px monospace";
        const padX = 8;
        const boxW = Math.max(...lines.map((t) => ctx.measureText(t).width)) + padX * 2;
        const boxH = lines.length * 16 + 8;
        const bx = Math.min(this.canvas.clientWidth - boxW - 8, p2.x + 14);
        const by = Math.max(8, p2.y + 14);

        ctx.fillStyle = "rgba(0, 0, 0, 0.92)";
        ctx.strokeStyle = this.snappedAngleInfo ? "#f5b95d" : "#444444";
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.fillRect(bx, by, boxW, boxH);
        ctx.strokeRect(bx, by, boxW, boxH);

        lines.forEach((text, idx) => {
          ctx.fillStyle = idx === 1 && this.snappedAngleInfo ? "#f5b95d" : "#ffffff";
          ctx.fillText(text, bx + padX, by + 16 + idx * 16);
        });
        ctx.restore();
      }
    } else if (this.tool === "circle") {
      const r = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      ctx.beginPath();
      ctx.arc(p1.x, p1.y, r, 0, Math.PI * 2);
      ctx.stroke();

      // Radius line + floating radius pill
      ctx.save();
      ctx.strokeStyle = "rgba(245, 185, 93, 0.65)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      ctx.font = "11px monospace";
      const label = `R: ${lenMm.toFixed(1)} mm (D: ${(lenMm * 2).toFixed(1)})`;
      const boxW = ctx.measureText(label).width + 14;
      ctx.fillStyle = "rgba(0, 0, 0, 0.92)";
      ctx.strokeStyle = "#f5b95d";
      ctx.setLineDash([]);
      ctx.fillRect(p2.x + 12, p2.y + 12, boxW, 22);
      ctx.strokeRect(p2.x + 12, p2.y + 12, boxW, 22);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, p2.x + 19, p2.y + 27);
      ctx.restore();
    }
    ctx.restore();
  }

  drawGhostGuide(ctx) {
    ctx.save();
    for (const g of this.ghostElements) {
      if (g.style === "cutting") {
        ctx.strokeStyle = "rgba(255, 83, 112, 0.55)";
        ctx.lineWidth = 2.0;
        ctx.setLineDash([12, 4, 3, 4]);
      } else if (g.style === "hidden") {
        ctx.strokeStyle = "rgba(245, 185, 93, 0.35)";
        ctx.lineWidth = 1.4;
        ctx.setLineDash([4, 4]);
      } else if (g.style === "axis") {
        ctx.strokeStyle = "rgba(245, 185, 93, 0.38)";
        ctx.lineWidth = 1.2;
        ctx.setLineDash([12, 3, 2, 3]);
      } else if (g.style === "construction") {
        ctx.strokeStyle = "rgba(245, 185, 93, 0.28)";
        ctx.lineWidth = 1.0;
        ctx.setLineDash([3, 3]);
      } else {
        ctx.strokeStyle = "rgba(245, 185, 93, 0.45)";
        ctx.lineWidth = 1.8;
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
      } else if (g.type === "text" && g.pos && g.text) {
        const sp = this.worldToScreen(g.pos[0], g.pos[1]);
        ctx.fillStyle = "rgba(245, 185, 93, 0.7)";
        ctx.font = "12px monospace";
        ctx.fillText(g.text, sp.x, sp.y);
      }
    }

    ctx.restore();
  }

  drawSnapMarker(ctx, snap) {
    ctx.save();
    ctx.strokeStyle = "#ffffff";
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 1.8;
    ctx.setLineDash([]);

    const x = snap.screenX;
    const y = snap.screenY;

    if (snap.type === "endpoint" || snap.type === "vertex") {
      ctx.strokeRect(x - 5, y - 5, 10, 10);
      ctx.fillRect(x - 5, y - 5, 10, 10);
    } else if (snap.type === "midpoint") {
      ctx.beginPath();
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x + 6, y + 5);
      ctx.lineTo(x - 6, y + 5);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
    } else if (snap.type === "center") {
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fill();
    } else if (snap.type === "xy") {
      // Diamond
      ctx.beginPath();
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x + 6, y);
      ctx.lineTo(x, y + 6);
      ctx.lineTo(x - 6, y);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
    }

    ctx.restore();
  }
}

// Helpers
function distToSegment(p, v, w) {
  const l2 = Math.hypot(v.x - w.x, v.y - w.y) ** 2;
  if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
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
