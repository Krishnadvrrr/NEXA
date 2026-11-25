/**
 * Scaled Drafting Canvas Engine for Engineering Graphics Practice Studio
 * True-to-scale coordinate mapping (1 mm = 4 px baseline), CAD toolset,
 * millimeter blueprint grid, glowing vertex snap engine, and live HUD.
 */

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
    this.showGhostGuide = false;
    this.ghostElements = [];

    // Canvas elements & history
    this.elements = [];
    this.history = [];
    this.redoStack = [];
    this.onElementsChanged = null;

    // Interaction state
    this.isDrawing = false;
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

  // Ortho & Angle Snapping
  applyAngleConstraints(fromWorld, toWorld) {
    let dx = toWorld.x - fromWorld.x;
    let dy = toWorld.y - fromWorld.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.1) return toWorld;

    if (this.orthoLock) {
      // Strict 0° or 90°
      if (Math.abs(dx) >= Math.abs(dy)) {
        return { x: toWorld.x, y: fromWorld.y };
      } else {
        return { x: fromWorld.x, y: toWorld.y };
      }
    }

    if (this.angleSnap) {
      let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (deg < 0) deg += 360;

      // Common EG drafting angles: 0, 15, 30, 45, 60, 75, 90, 120, 135, 150, 180...
      const snapAngles = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180,
                          195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345, 360];
      for (const target of snapAngles) {
        if (Math.abs(deg - target) < 2.5) {
          const rad = (target * Math.PI) / 180;
          return {
            x: fromWorld.x + len * Math.cos(rad),
            y: fromWorld.y + len * Math.sin(rad)
          };
        }
      }
    }

    return toWorld;
  }

  // Event handlers
  initEvents() {
    this.canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    window.addEventListener("pointermove", (e) => this.onPointerMove(e));
    window.addEventListener("pointerup", (e) => this.onPointerUp(e));
    this.canvas.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    // Keyboard shortcuts (Undo, Redo, Ortho Shift)
    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "Shift") {
        this.orthoLock = true;
        this.render();
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

    // Start drawing line, circle, projector, dimension
    this.isDrawing = true;
    this.dragStart = worldPos;
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
      } else if (this.tool === "line" || this.tool === "dimension") {
        worldPos = this.applyAngleConstraints(this.dragStart, worldPos);
      }
    }

    this.currentWorldPos = worldPos;
    this.updateHud(pos, worldPos);
    this.render();
  }

  onPointerUp(e) {
    if (this.isPanning) {
      this.isPanning = false;
      this.canvas.style.cursor = this.tool === "pan" ? "grab" : "crosshair";
      return;
    }

    if (!this.isDrawing) return;
    this.isDrawing = false;

    if (!this.dragStart) return;
    const start = this.dragStart;
    let end = this.currentWorldPos;

    const len = Math.hypot(end.x - start.x, end.y - start.y);
    if (len < 0.5 && this.tool !== "circle") {
      this.dragStart = null;
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
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = 2.0;

    const p1 = this.worldToScreen(this.dragStart.x, this.dragStart.y);
    const p2 = this.worldToScreen(this.currentWorldPos.x, this.currentWorldPos.y);

    if (this.tool === "line" || this.tool === "projector" || this.tool === "dimension") {
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    } else if (this.tool === "circle") {
      const r = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      ctx.beginPath();
      ctx.arc(p1.x, p1.y, r, 0, Math.PI * 2);
      ctx.stroke();
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
