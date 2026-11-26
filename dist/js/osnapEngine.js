import { extractElementSegments } from "./layerManager.js";

/**
 * Authentic AutoCAD Object Snap (OSNAP) Engine
 * Supports Endpoint, Midpoint, Center, Quadrant, Intersection, Perpendicular, and XY Axis
 * with crisp geometric marker rendering.
 */

export function segmentIntersection(a1, a2, b1, b2) {
  const dx1 = a2[0] - a1[0];
  const dy1 = a2[1] - a1[1];
  const dx2 = b2[0] - b1[0];
  const dy2 = b2[1] - b1[1];
  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-8) return null;

  const t = ((b1[0] - a1[0]) * dy2 - (b1[1] - a1[1]) * dx2) / denom;
  const u = ((b1[0] - a1[0]) * dy1 - (b1[1] - a1[1]) * dx1) / denom;
  if (t < -1e-4 || t > 1 + 1e-4 || u < -1e-4 || u > 1 + 1e-4) return null;

  return {
    x: a1[0] + t * dx1,
    y: a1[1] + t * dy1,
    t: Math.max(0, Math.min(1, t)),
    u: Math.max(0, Math.min(1, u))
  };
}

export function lineCircleIntersections(a, b, cx, cy, r) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const fx = a[0] - cx;
  const fy = a[1] - cy;
  const A = dx * dx + dy * dy;
  if (A < 1e-9) return [];
  const B = 2 * (fx * dx + fy * dy);
  const C = fx * fx + fy * fy - r * r;
  let disc = B * B - 4 * A * C;
  if (disc < -1e-6) return [];
  disc = Math.max(0, disc);
  const sqrtD = Math.sqrt(disc);
  const hits = [];
  for (const t of [(-B - sqrtD) / (2 * A), (-B + sqrtD) / (2 * A)]) {
    if (t >= -1e-4 && t <= 1 + 1e-4) {
      const clampedT = Math.max(0, Math.min(1, t));
      hits.push({ x: a[0] + clampedT * dx, y: a[1] + clampedT * dy, t: clampedT });
    }
  }
  return hits;
}

export function perpendicularFoot(pt, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return null;
  const t = ((pt.x - a[0]) * dx + (pt.y - a[1]) * dy) / len2;
  if (t < -0.02 || t > 1.02) return null;
  const ct = Math.max(0, Math.min(1, t));
  return { x: a[0] + ct * dx, y: a[1] + ct * dy };
}

export class OsnapEngine {
  constructor() {
    this.enabled = true; // F3 OSNAP master toggle
    this.modes = {
      endpoint: true,
      midpoint: true,
      center: true,
      intersection: true,
      perpendicular: true,
      quadrant: true,
      xy: true
    };
  }

  findSnap(screenX, screenY, elements, worldToScreen, screenToWorld, opts = {}) {
    if (!this.enabled) return null;

    const { dragStart = null, isVisible = () => true, aperturePx = 13 } = opts;
    const cursorW = screenToWorld(screenX, screenY);

    let best = null;
    let bestDist = aperturePx;

    const consider = (wx, wy, type, label, priorityBonus = 0) => {
      const sp = worldToScreen(wx, wy);
      const d = Math.hypot(sp.x - screenX, sp.y - screenY);
      if (d < aperturePx && d - priorityBonus < bestDist) {
        bestDist = d - priorityBonus;
        best = {
          worldX: wx,
          worldY: wy,
          screenX: sp.x,
          screenY: sp.y,
          type,
          label
        };
      }
    };

    const visibleEls = elements.filter(isVisible);
    const allSegs = [];
    const circles = [];

    for (const el of visibleEls) {
      const segs = extractElementSegments(el);
      for (const s of segs) {
        allSegs.push(s);
        if (this.modes.endpoint) {
          consider(s.a[0], s.a[1], "endpoint", "Endpoint", 1.2);
          consider(s.b[0], s.b[1], "endpoint", "Endpoint", 1.2);
        }
        if (this.modes.midpoint) {
          consider((s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2, "midpoint", "Midpoint", 0.6);
        }
        if (this.modes.perpendicular && dragStart) {
          const foot = perpendicularFoot(dragStart, s.a, s.b);
          if (foot) {
            consider(foot.x, foot.y, "perpendicular", "Perpendicular", 0.8);
          }
        }
      }

      if (el.type === "circle" || el.type === "arc") {
        circles.push(el);
        if (this.modes.center) {
          consider(el.cx, el.cy, "center", "Center", 0.8);
        }
        if (this.modes.quadrant && el.type === "circle") {
          consider(el.cx + el.radius, el.cy, "quadrant", "Quadrant", 0.3);
          consider(el.cx - el.radius, el.cy, "quadrant", "Quadrant", 0.3);
          consider(el.cx, el.cy + el.radius, "quadrant", "Quadrant", 0.3);
          consider(el.cx, el.cy - el.radius, "quadrant", "Quadrant", 0.3);
        }
        if (el.type === "arc" && this.modes.endpoint) {
          consider(
            el.cx + el.radius * Math.cos(el.startAngle),
            el.cy + el.radius * Math.sin(el.startAngle),
            "endpoint",
            "Endpoint",
            1.2
          );
          consider(
            el.cx + el.radius * Math.cos(el.endAngle),
            el.cy + el.radius * Math.sin(el.endAngle),
            "endpoint",
            "Endpoint",
            1.2
          );
        }
      } else if (el.type === "polygon" && el.cx !== undefined && el.cy !== undefined && this.modes.center) {
        consider(el.cx, el.cy, "center", "Center", 0.8);
      }
    }

    // Intersections (segment-segment & segment-XY & segment-circle)
    if (this.modes.intersection) {
      for (let i = 0; i < allSegs.length; i++) {
        for (let j = i + 1; j < allSegs.length; j++) {
          const hit = segmentIntersection(allSegs[i].a, allSegs[i].b, allSegs[j].a, allSegs[j].b);
          if (hit) {
            consider(hit.x, hit.y, "intersection", "Intersection", 1.5);
          }
        }
        // Check XY intersection
        const xyHit = segmentIntersection(allSegs[i].a, allSegs[i].b, [-1000, 0], [1000, 0]);
        if (xyHit) {
          consider(xyHit.x, xyHit.y, "intersection", "Intersection", 1.4);
        }
        for (const c of circles) {
          const cHits = lineCircleIntersections(allSegs[i].a, allSegs[i].b, c.cx, c.cy, c.radius);
          for (const h of cHits) {
            consider(h.x, h.y, "intersection", "Intersection", 1.4);
          }
        }
      }
    }

    // XY Reference Axis snap (Perpendicular when dragging, else XY trace)
    if (this.modes.xy) {
      const xyScreen = worldToScreen(cursorW.x, 0);
      if (Math.abs(xyScreen.y - screenY) < aperturePx) {
        if (this.modes.perpendicular && dragStart && Math.abs(cursorW.x - dragStart.x) < 3.5) {
          consider(dragStart.x, 0, "perpendicular", "Perpendicular to XY", 1.0);
        } else {
          consider(cursorW.x, 0, "xy", "XY Reference", 0);
        }
      }
    }

    return best;
  }

  /**
   * Renders crisp AutoCAD green geometric OSNAP markers on the canvas.
   */
  drawMarker(ctx, snap) {
    if (!snap) return;
    ctx.save();
    ctx.strokeStyle = "#4ade80";
    ctx.fillStyle = "rgba(74, 222, 128, 0.18)";
    ctx.lineWidth = 2.0;
    ctx.setLineDash([]);

    const x = snap.screenX;
    const y = snap.screenY;

    switch (snap.type) {
      case "endpoint":
      case "vertex":
        ctx.strokeRect(x - 5.5, y - 5.5, 11, 11);
        ctx.fillRect(x - 5.5, y - 5.5, 11, 11);
        break;

      case "midpoint":
        ctx.beginPath();
        ctx.moveTo(x, y - 6.5);
        ctx.lineTo(x + 6.5, y + 5.5);
        ctx.lineTo(x - 6.5, y + 5.5);
        ctx.closePath();
        ctx.stroke();
        ctx.fill();
        break;

      case "center":
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fill();
        break;

      case "intersection":
        ctx.beginPath();
        ctx.moveTo(x - 5.5, y - 5.5);
        ctx.lineTo(x + 5.5, y + 5.5);
        ctx.moveTo(x + 5.5, y - 5.5);
        ctx.lineTo(x - 5.5, y + 5.5);
        ctx.stroke();
        break;

      case "perpendicular":
        ctx.beginPath();
        ctx.moveTo(x - 6, y - 6);
        ctx.lineTo(x - 6, y + 6);
        ctx.lineTo(x + 6, y + 6);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - 6, y);
        ctx.lineTo(x, y);
        ctx.lineTo(x, y + 6);
        ctx.stroke();
        break;

      case "quadrant":
      case "xy":
      default:
        ctx.beginPath();
        ctx.moveTo(x, y - 6.5);
        ctx.lineTo(x + 6.5, y);
        ctx.lineTo(x, y + 6.5);
        ctx.lineTo(x - 6.5, y);
        ctx.closePath();
        ctx.stroke();
        ctx.fill();
        break;
    }

    ctx.restore();
  }
}
