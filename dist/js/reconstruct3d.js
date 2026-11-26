/**
 * Real-Time 2D-to-3D Reconstruction Engine
 * Inspects drafted 2D shapes on HP (Top View, Y <= 0) and VP (Front View, Y >= 0)
 * to reconstruct live 3D solid parameters, tilt angles, and section planes.
 */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Analyzes user-drawn 2D canvas elements and extracts an aligned 3D solid spec
 * whenever a Top View footprint (below XY) and/or Front View elevation (above XY) exist.
 */
export function reconstructFrom2DStrokes(elements = []) {
  if (!Array.isArray(elements) || elements.length === 0) {
    return { hasBase: false, hasSolid: false };
  }

  const expanded = [];
  for (const e of elements) {
    if (e.type === "polyline" && Array.isArray(e.points) && e.points.length >= 2) {
      const count = e.closed ? e.points.length : e.points.length - 1;
      for (let i = 0; i < count; i++) {
        const a = e.points[i];
        const b = e.points[(i + 1) % e.points.length];
        expanded.push({ type: "line", x1: a[0], y1: a[1], x2: b[0], y2: b[1], grade: e.grade || "HB" });
      }
      if (e.closed && e.points.length >= 3) {
        const xs = e.points.map((p) => p[0]);
        const ys = e.points.map((p) => p[1]);
        expanded.push({
          type: "polygon",
          sides: e.points.length,
          cx: (Math.min(...xs) + Math.max(...xs)) / 2,
          cy: (Math.min(...ys) + Math.max(...ys)) / 2,
          edgeLength: Math.hypot(e.points[1][0] - e.points[0][0], e.points[1][1] - e.points[0][1]),
          points: e.points,
          grade: e.grade || "HB"
        });
      }
    } else {
      expanded.push(e);
    }
  }

  // 1. Identify base footprint in HP (Y < 0)
  let base = null;

  const hpCircles = expanded.filter((e) => e.type === "circle" && e.cy < -1);
  const hpPolys = expanded.filter((e) => e.type === "polygon" && e.cy < -1 && Array.isArray(e.points) && e.points.length >= 3);
  const hpLines = expanded.filter(
    (e) =>
      e.type === "line" &&
      e.grade !== "2H" &&
      e.grade !== "Axis" &&
      e.y1 <= 1 &&
      e.y2 <= 1 &&
      (e.y1 < -1 || e.y2 < -1)
  );

  if (hpPolys.length > 0) {
    const p = hpPolys[hpPolys.length - 1];
    const xs = p.points.map((pt) => pt[0]);
    const ys = p.points.map((pt) => pt[1]);
    base = {
      kind: "polygon",
      sides: p.sides || p.points.length,
      cx: p.cx,
      cy: p.cy,
      radius: p.edgeLength / (2 * Math.sin(Math.PI / (p.sides || p.points.length))),
      points: p.points.map((pt) => [...pt]),
      xMin: Math.min(...xs),
      xMax: Math.max(...xs),
      yMin: Math.min(...ys),
      yMax: Math.max(...ys)
    };
  } else if (hpCircles.length > 0) {
    const c = hpCircles[hpCircles.length - 1];
    const pts = [];
    for (let i = 0; i < 24; i++) {
      const a = (2 * Math.PI * i) / 24;
      pts.push([c.cx + c.radius * Math.cos(a), c.cy + c.radius * Math.sin(a)]);
    }
    base = {
      kind: "circle",
      sides: 24,
      cx: c.cx,
      cy: c.cy,
      radius: c.radius,
      points: pts,
      xMin: c.cx - c.radius,
      xMax: c.cx + c.radius,
      yMin: c.cy - c.radius,
      yMax: c.cy + c.radius
    };
  } else if (hpLines.length >= 3) {
    const pts = [];
    for (const l of hpLines) {
      pts.push([l.x1, l.y1], [l.x2, l.y2]);
    }
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    const w = xMax - xMin;
    const d = yMax - yMin;
    if (w > 4 && d > 4) {
      const hull = convexHull2D(pts);
      base = {
        kind: "polygon",
        sides: hull.length,
        cx: (xMin + xMax) / 2,
        cy: (yMin + yMax) / 2,
        radius: Math.max(w, d) / 2,
        points: hull,
        xMin,
        xMax,
        yMin,
        yMax
      };
    }
  }

  if (!base) {
    return { hasBase: false, hasSolid: false };
  }

  // 2. Find matching Front View strokes above XY overlapping this base's X-range
  const tol = 10;
  const vpLines = expanded.filter(
    (e) =>
      e.type === "line" &&
      e.grade !== "2H" &&
      e.grade !== "Axis" &&
      e.grade !== "Cutting Plane" &&
      e.y1 >= -2 &&
      e.y2 >= -2 &&
      Math.max(e.y1, e.y2) > 4 &&
      ((e.x1 >= base.xMin - tol && e.x1 <= base.xMax + tol) ||
        (e.x2 >= base.xMin - tol && e.x2 <= base.xMax + tol))
  );

  if (vpLines.length === 0) {
    return {
      hasBase: true,
      hasSolid: false,
      base
    };
  }

  const vpPts = [];
  for (const l of vpLines) {
    vpPts.push([l.x1, l.y1], [l.x2, l.y2]);
  }
  const maxY = Math.max(...vpPts.map((p) => p[1]));
  const height = clamp(maxY, 5, 220);

  // Check if top converges (pyramid/cone) vs spans horizontally (prism/cylinder)
  const topPts = vpPts.filter((p) => p[1] >= maxY * 0.85);
  const topXs = topPts.map((p) => p[0]);
  const topSpan = topXs.length > 0 ? Math.max(...topXs) - Math.min(...topXs) : 0;
  const baseSpan = Math.max(1, base.xMax - base.xMin);
  const isPyramid = topSpan < baseSpan * 0.35;

  // Detect optional Cutting Plane overlapping FV
  const cutLines = expanded.filter(
    (e) => e.type === "line" && e.grade === "Cutting Plane" && Math.max(e.y1, e.y2) > 1
  );
  let cutPlane = null;
  if (cutLines.length > 0) {
    const cl = cutLines[cutLines.length - 1];
    const dx = cl.x2 - cl.x1;
    const dy = cl.y2 - cl.y1;
    let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    // Height where cutting line crosses base.cx
    const cutY = Math.abs(dx) > 1e-3 ? cl.y1 + ((base.cx - cl.x1) / dx) * dy : (cl.y1 + cl.y2) / 2;
    cutPlane = {
      angleDeg: clamp(angleDeg > 90 ? angleDeg - 180 : angleDeg < -90 ? angleDeg + 180 : angleDeg, -80, 80),
      cutHeight: clamp(cutY, 1, height - 1)
    };
  }

  return {
    hasBase: true,
    hasSolid: vpLines.length >= 2 && height >= 5,
    base,
    height,
    isPyramid,
    cutPlane
  };
}

function convexHull2D(rawPoints) {
  // Deduplicate close vertices first
  const pts = [];
  for (const p of rawPoints) {
    if (!pts.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1.5)) {
      pts.push([p[0], p[1]]);
    }
  }
  if (pts.length <= 3) return pts;

  pts.sort((a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]));
  const cross2 = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross2(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross2(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}
