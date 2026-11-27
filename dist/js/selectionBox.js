import { extractElementSegments } from "./layerManager.js";
import { segmentIntersection, lineCircleIntersections } from "./osnapEngine.js";

/**
 * AutoCAD Window Selection (Left-to-Right Blue Solid) vs
 * Crossing Selection (Right-to-Left Green Dashed) + Entity Hit-Testing.
 */

export function normalizeRect(p1, p2) {
  return {
    xMin: Math.min(p1.x, p2.x),
    xMax: Math.max(p1.x, p2.x),
    yMin: Math.min(p1.y, p2.y),
    yMax: Math.max(p1.y, p2.y)
  };
}

export function pointInRect(x, y, r) {
  return x >= r.xMin && x <= r.xMax && y >= r.yMin && y <= r.yMax;
}

function segmentIntersectsRect(a, b, rect) {
  if (pointInRect(a[0], a[1], rect) || pointInRect(b[0], b[1], rect)) return true;
  const corners = [
    [rect.xMin, rect.yMin],
    [rect.xMax, rect.yMin],
    [rect.xMax, rect.yMax],
    [rect.xMin, rect.yMax]
  ];
  for (let i = 0; i < 4; i++) {
    if (segmentIntersection(a, b, corners[i], corners[(i + 1) % 4])) return true;
  }
  return false;
}

export function getEntityBounds(el) {
  if (!el) return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
  if (el.type === "line" || el.type === "dimension") {
    return {
      xMin: Math.min(el.x1, el.x2),
      xMax: Math.max(el.x1, el.x2),
      yMin: Math.min(el.y1, el.y2),
      yMax: Math.max(el.y1, el.y2)
    };
  }
  if (el.type === "circle" || el.type === "arc") {
    return {
      xMin: el.cx - el.radius,
      xMax: el.cx + el.radius,
      yMin: el.cy - el.radius,
      yMax: el.cy + el.radius
    };
  }
  if (el.type === "ellipse") {
    const rMax = Math.max(el.rx || 1, el.ry || 1);
    return {
      xMin: el.cx - rMax,
      xMax: el.cx + rMax,
      yMin: el.cy - rMax,
      yMax: el.cy + rMax
    };
  }
  if ((el.type === "polygon" || el.type === "polyline") && Array.isArray(el.points) && el.points.length > 0) {
    const xs = el.points.map((p) => p[0]);
    const ys = el.points.map((p) => p[1]);
    return {
      xMin: Math.min(...xs),
      xMax: Math.max(...xs),
      yMin: Math.min(...ys),
      yMax: Math.max(...ys)
    };
  }
  if (el.type === "text") {
    return { xMin: el.x, xMax: el.x + 4, yMin: el.y, yMax: el.y + 4 };
  }
  return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
}

export function isEntityInsideRect(el, rect) {
  const b = getEntityBounds(el);
  return b.xMin >= rect.xMin && b.xMax <= rect.xMax && b.yMin >= rect.yMin && b.yMax <= rect.yMax;
}

export function isEntityCrossingRect(el, rect) {
  if (isEntityInsideRect(el, rect)) return true;

  const segs = extractElementSegments(el);
  for (const s of segs) {
    if (segmentIntersectsRect(s.a, s.b, rect)) return true;
  }

  if (el.type === "circle" || el.type === "arc") {
    const cx = Math.max(rect.xMin, Math.min(el.cx, rect.xMax));
    const cy = Math.max(rect.yMin, Math.min(el.cy, rect.yMax));
    const dist = Math.hypot(el.cx - cx, el.cy - cy);
    if (dist <= el.radius) {
      // Check it isn't strictly enclosing the whole selection rectangle without touching perimeter
      const cornersDist = [
        Math.hypot(rect.xMin - el.cx, rect.yMin - el.cy),
        Math.hypot(rect.xMax - el.cx, rect.yMin - el.cy),
        Math.hypot(rect.xMax - el.cx, rect.yMax - el.cy),
        Math.hypot(rect.xMin - el.cx, rect.yMax - el.cy)
      ];
      if (cornersDist.some((d) => d >= el.radius - 0.1)) return true;
      const edges = [
        [[rect.xMin, rect.yMin], [rect.xMax, rect.yMin]],
        [[rect.xMax, rect.yMin], [rect.xMax, rect.yMax]],
        [[rect.xMax, rect.yMax], [rect.xMin, rect.yMax]],
        [[rect.xMin, rect.yMax], [rect.xMin, rect.yMin]]
      ];
      for (const [ea, eb] of edges) {
        if (lineCircleIntersections(ea, eb, el.cx, el.cy, el.radius).length > 0) return true;
      }
    }
  }

  if (el.type === "ellipse") {
    return pointInRect(el.cx, el.cy, rect);
  }

  if (el.type === "text") {
    return pointInRect(el.x, el.y, rect);
  }

  return false;
}

/**
 * Selects entities inside elements matching AutoCAD Window (L->R) or Crossing (R->L).
 */
export function selectEntitiesInBox(elements, startWorld, endWorld, isSelectable = () => true) {
  const mode = endWorld.x >= startWorld.x ? "window" : "crossing";
  const rect = normalizeRect(startWorld, endWorld);
  const ids = [];

  for (const el of elements) {
    if (!isSelectable(el)) continue;
    const hit = mode === "window" ? isEntityInsideRect(el, rect) : isEntityCrossingRect(el, rect);
    if (hit) ids.push(el.id);
  }

  return { mode, ids };
}

export function distToSegWorld(px, py, a, b) {
  const l2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
  if (l2 === 0) return Math.hypot(px - a[0], py - a[1]);
  const t = Math.max(0, Math.min(1, ((px - a[0]) * (b[0] - a[0]) + (py - a[1]) * (b[1] - a[1])) / l2));
  return Math.hypot(px - (a[0] + t * (b[0] - a[0])), py - (a[1] + t * (b[1] - a[1])));
}

export function hitTestEntity(worldPt, elements, tolWorld = 3.0, isSelectable = () => true) {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (!isSelectable(el)) continue;
    const segs = extractElementSegments(el);
    for (const s of segs) {
      if (distToSegWorld(worldPt.x, worldPt.y, s.a, s.b) <= tolWorld) return el;
    }
    if (el.type === "circle" || el.type === "arc") {
      const d = Math.abs(Math.hypot(worldPt.x - el.cx, worldPt.y - el.cy) - el.radius);
      if (d <= tolWorld) return el;
    } else if (el.type === "ellipse") {
      const rot = ((el.rotationDeg || 0) * Math.PI) / 180;
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);
      const dx = worldPt.x - el.cx;
      const dy = worldPt.y - el.cy;
      const lx = dx * cosR + dy * sinR;
      const ly = -dx * sinR + dy * cosR;
      const norm = Math.hypot(lx / (el.rx || 1), ly / (el.ry || 1));
      const approxDist = Math.abs(norm - 1) * Math.min(el.rx || 1, el.ry || 1);
      if (approxDist <= tolWorld || Math.hypot(dx, dy) <= tolWorld * 1.4) return el;
    } else if (el.type === "text") {
      if (Math.hypot(worldPt.x - el.x, worldPt.y - el.y) <= tolWorld * 1.8) return el;
    }
  }
  return null;
}

export function drawSelectionBox(ctx, startScreen, endScreen) {
  if (!startScreen || !endScreen) return;
  const isWindow = endScreen.x >= startScreen.x;
  const x = Math.min(startScreen.x, endScreen.x);
  const y = Math.min(startScreen.y, endScreen.y);
  const w = Math.abs(endScreen.x - startScreen.x);
  const h = Math.abs(endScreen.y - startScreen.y);

  ctx.save();
  if (isWindow) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.14)";
    ctx.strokeStyle = "#ffffff";
    ctx.setLineDash([]);
  } else {
    ctx.fillStyle = "rgba(245, 185, 93, 0.12)";
    ctx.strokeStyle = "#f5b95d";
    ctx.setLineDash([6, 4]);
  }
  ctx.lineWidth = 1.4;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}
