/**
 * Custom / Faculty Question Engine for EG Practice Studio
 * Parses faculty assignment text into engineering parameters, synthesizes
 * step-by-step drafting instructions, exact mathematical 2D/3D expected
 * geometry, validation rules, and conceptual problem breakdowns.
 */

export const STORAGE_KEY = "eg-studio-custom-questions-v1";

export const SOLID_CATALOG = {
  squarePrism: { label: "Square Prism", sides: 4, isCurved: false, isPyramid: false },
  pentPrism: { label: "Pentagonal Prism", sides: 5, isCurved: false, isPyramid: false },
  hexPrism: { label: "Hexagonal Prism", sides: 6, isCurved: false, isPyramid: false },
  triPrism: { label: "Triangular Prism", sides: 3, isCurved: false, isPyramid: false },
  cube: { label: "Cube", sides: 4, isCurved: false, isPyramid: false, isCube: true },
  squarePyramid: { label: "Square Pyramid", sides: 4, isCurved: false, isPyramid: true },
  pentPyramid: { label: "Pentagonal Pyramid", sides: 5, isCurved: false, isPyramid: true },
  hexPyramid: { label: "Hexagonal Pyramid", sides: 6, isCurved: false, isPyramid: true },
  triPyramid: { label: "Triangular Pyramid / Tetrahedron", sides: 3, isCurved: false, isPyramid: true },
  cylinder: { label: "Cylinder", sides: 12, isCurved: true, isPyramid: false },
  cone: { label: "Cone", sides: 12, isCurved: true, isPyramid: true }
};

const round2 = (n) => Math.round(n * 100) / 100;
const degToRad = (d) => (d * Math.PI) / 180;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function toMm(numStr, unitStr) {
  const v = parseFloat(numStr);
  if (!Number.isFinite(v)) return null;
  return unitStr && unitStr.toLowerCase() === "cm" ? v * 10 : v;
}

/**
 * Parse raw natural-language question text pasted from faculty notes / syllabus.
 * Returns normalized structured parameters plus a list of detected field summaries.
 */
export function parseFacultyQuestionText(rawText = "") {
  const text = String(rawText).trim();
  const lower = text.toLowerCase();
  const detected = [];

  // 1. Detect Unit
  let unit = "Projection of Solids";
  if (/develop|lateral\s+surface|stretch\s*-?\s*out/i.test(lower)) {
    unit = "Development of Surfaces";
  } else if (/section|cut(?:ting)?\s+plane|cut\s+by|sectional|true\s+shape|truncated/i.test(lower)) {
    unit = "Section of Solids";
  }
  detected.push(`Unit: ${unit}`);

  // 2. Detect Solid Type
  let solid = "squarePrism";
  const isPyramidWord = /pyramid|tetrahedron/i.test(lower);
  if (/tetrahedron/i.test(lower)) {
    solid = "triPyramid";
  } else if (/cone|conical/i.test(lower)) {
    solid = "cone";
  } else if (/cylinder|cylindrical/i.test(lower)) {
    solid = "cylinder";
  } else if (/cube/i.test(lower)) {
    solid = "cube";
  } else if (/pentagon(?:al)?/i.test(lower)) {
    solid = isPyramidWord ? "pentPyramid" : "pentPrism";
  } else if (/hexagon(?:al)?/i.test(lower)) {
    solid = isPyramidWord ? "hexPyramid" : "hexPrism";
  } else if (/triangl(?:e|ular)/i.test(lower)) {
    solid = isPyramidWord ? "triPyramid" : "triPrism";
  } else if (/square/i.test(lower)) {
    solid = isPyramidWord ? "squarePyramid" : "squarePrism";
  } else if (isPyramidWord) {
    solid = "squarePyramid";
  }
  const meta = SOLID_CATALOG[solid];
  detected.push(`Solid: ${meta.label}`);

  // 3. Detect Base Dimension (edge or diameter/radius)
  let baseEdge = 30;
  let diameter = 40;
  const diaMatch = text.match(/(?:base\s*)?(?:dia(?:meter)?|φ|ø)\s*(?:of|is|=|:)?\s*(\d+(?:\.\d+)?)\s*(mm|cm)?/i);
  const radMatch = text.match(/(?:base\s*)?radius\s*(?:of|is|=|:)?\s*(\d+(?:\.\d+)?)\s*(mm|cm)?/i);
  const sideMatch =
    text.match(/(?:base\s*(?:edge|side)|side\s+of\s+(?:the\s+)?base|edge\s+of\s+(?:the\s+)?base|edge|side)\s*(?:of|length|is|=|:)?\s*(\d+(?:\.\d+)?)\s*(mm|cm)?/i) ||
    text.match(/\bbase\s*(?:of|is|=|:)?\s*(\d+(?:\.\d+)?)\s*(mm|cm)?/i) ||
    text.match(/(\d+(?:\.\d+)?)\s*(mm|cm)?\s*(?:base\s*(?:side|edge)|side\s+base)/i);

  if (meta.isCurved) {
    if (diaMatch) {
      diameter = clamp(toMm(diaMatch[1], diaMatch[2]) || 40, 10, 150);
    } else if (radMatch) {
      diameter = clamp((toMm(radMatch[1], radMatch[2]) || 20) * 2, 10, 150);
    } else if (sideMatch) {
      diameter = clamp(toMm(sideMatch[1], sideMatch[2]) || 40, 10, 150);
    }
    baseEdge = diameter;
    detected.push(`Diameter: ${diameter} mm`);
  } else {
    if (sideMatch) {
      baseEdge = clamp(toMm(sideMatch[1], sideMatch[2]) || 30, 8, 120);
    } else if (diaMatch) {
      baseEdge = clamp(toMm(diaMatch[1], diaMatch[2]) || 30, 8, 120);
    }
    diameter = baseEdge;
    detected.push(`Base Side: ${baseEdge} mm`);
  }

  // 4. Detect Axis Height
  let height = meta.isCube ? baseEdge : solid === "triPyramid" && /tetrahedron/i.test(lower) ? round2(baseEdge * Math.sqrt(2 / 3)) : 60;
  const heightMatch =
    text.match(/(?:axis(?:\s+length|\s+height)?|height|altitude)\s*(?:of|is|=|:)?\s*(\d+(?:\.\d+)?)\s*(mm|cm)?/i) ||
    text.match(/(\d+(?:\.\d+)?)\s*(mm|cm)?\s*(?:long\s+axis|high|tall)/i);
  if (heightMatch && !meta.isCube) {
    height = clamp(toMm(heightMatch[1], heightMatch[2]) || 60, 15, 200);
  }
  detected.push(`Axis: ${height} mm`);

  // 5. Resting condition
  let restingOn = "base edge";
  if (/corner|vertex/i.test(lower)) {
    restingOn = "base corner";
  } else if (meta.isCurved && /point|rim|generator/i.test(lower)) {
    restingOn = "base rim point";
  } else if (/edge|side/i.test(lower)) {
    restingOn = "base edge";
  } else if (unit !== "Projection of Solids") {
    restingOn = "base on HP";
  }

  // 6. Inclination / Cutting Plane Angles
  let alpha = 45;
  let beta = 0;
  let cuttingAngle = 45;
  let cutMode = "midpoint";
  let cutOffset = round2(height / 2);

  if (unit === "Projection of Solids") {
    const baseTiltMatch = text.match(/base\s+(?:is\s+)?(?:inclined\s+(?:at\s+)?|makes\s+)(\d+(?:\.\d+)?)\s*(?:°|deg|degrees?)?\s*(?:to|with)\s*(?:the\s*)?hp/i);
    const axisTiltMatch =
      text.match(/axis\s+(?:is\s+)?(?:inclined\s+(?:at\s+)?|makes\s+)(\d+(?:\.\d+)?)\s*(?:°|deg|degrees?)?\s*(?:to|with)\s*(?:the\s*)?hp/i) ||
      text.match(/(\d+(?:\.\d+)?)\s*(?:°|deg|degrees?)?\s*(?:to|with)\s*(?:the\s*)?hp/i);

    if (baseTiltMatch) {
      alpha = clamp(90 - parseFloat(baseTiltMatch[1]), 10, 85);
    } else if (axisTiltMatch) {
      alpha = clamp(parseFloat(axisTiltMatch[1]), 10, 85);
    }
    const vpMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:°|deg|degrees?)?\s*(?:to|with)\s*(?:the\s*)?vp/i);
    if (vpMatch && !/parallel\s+to\s+vp/i.test(lower)) {
      beta = clamp(parseFloat(vpMatch[1]), 0, 90 - alpha);
    }
    detected.push(`Axis to HP: ${alpha}°`);
    detected.push(`Resting: ${restingOn}`);
  } else {
    const cutAngleMatch =
      text.match(/(?:section\s+plane|cutting\s+plane|plane)\s+(?:is\s+)?(?:perpendicular\s+to\s+vp\s*(?:and|,)?\s*)?(?:inclined\s+(?:at\s+)?|at\s+)(\d+(?:\.\d+)?)\s*(?:°|deg|degrees?)?/i) ||
      text.match(/(\d+(?:\.\d+)?)\s*(?:°|deg|degrees?)?\s*(?:to|with)\s*(?:the\s*)?hp/i);
    if (cutAngleMatch) {
      cuttingAngle = clamp(parseFloat(cutAngleMatch[1]), 10, 80);
    }

    const fromTopMatch = text.match(/(\d+(?:\.\d+)?)\s*(mm|cm)?\s*(?:from|below)\s*(?:the\s*)?(?:top|apex|vertex)/i);
    const fromBaseMatch = text.match(/(\d+(?:\.\d+)?)\s*(mm|cm)?\s*(?:from|above)\s*(?:the\s*)?(?:base|hp)/i);
    if (/bisect|mid\s*-?\s*point|middle/i.test(lower)) {
      cutMode = "midpoint";
      cutOffset = round2(height / 2);
    } else if (fromTopMatch) {
      cutMode = "fromTop";
      cutOffset = clamp(toMm(fromTopMatch[1], fromTopMatch[2]) || 15, 2, height - 2);
    } else if (fromBaseMatch) {
      cutMode = "fromBase";
      cutOffset = clamp(toMm(fromBaseMatch[1], fromBaseMatch[2]) || 20, 2, height - 2);
    }
    detected.push(`Cut Angle: ${cuttingAngle}°`);
  }

  const suffix =
    unit === "Projection of Solids"
      ? `Axis Inclined at ${alpha}° to HP`
      : unit === "Section of Solids"
        ? `Section Plane at ${cuttingAngle}° to HP`
        : "Surface Development";

  return {
    spec: {
      unit,
      solid,
      title: `${meta.label} — ${suffix}`,
      problemStatement: text || defaultStatementFor({ unit, solid, baseEdge, diameter, height, alpha, restingOn, cuttingAngle, cutMode, cutOffset }),
      baseEdge,
      diameter,
      height,
      restingOn,
      alpha,
      beta,
      cuttingAngle,
      cutMode,
      cutOffset
    },
    detected
  };
}

export function defaultStatementFor(s) {
  const meta = SOLID_CATALOG[s.solid] || SOLID_CATALOG.squarePrism;
  const dimText = meta.isCurved
    ? `base diameter ${s.diameter || s.baseEdge} mm`
    : meta.isCube
      ? `side ${s.baseEdge} mm`
      : `base side ${s.baseEdge} mm`;
  const axisText = meta.isCube ? "" : ` and axis length ${s.height} mm`;

  if (s.unit === "Projection of Solids") {
    return `A ${meta.label.toLowerCase()} of ${dimText}${axisText} rests on HP on one of its ${s.restingOn || "base edges"} such that its axis is inclined at ${s.alpha || 45}° to HP and parallel to VP. Draw its projections.`;
  }
  const cutDesc =
    s.cutMode === "fromTop"
      ? `${s.cutOffset} mm from the ${meta.isPyramid ? "apex" : "top face"}`
      : s.cutMode === "fromBase"
        ? `${s.cutOffset} mm above the base`
        : "bisecting the axis";
  if (s.unit === "Section of Solids") {
    return `A ${meta.label.toLowerCase()} of ${dimText}${axisText} rests on its base on HP. It is cut by a section plane perpendicular to VP, inclined at ${s.cuttingAngle || 45}° to HP and ${cutDesc}. Draw its Front View, Sectional Top View, and True Shape of Section.`;
  }
  return `A ${meta.label.toLowerCase()} of ${dimText}${axisText} rests on its base on HP. It is cut by a plane inclined at ${s.cuttingAngle || 45}° to HP ${cutDesc}. Draw the development of its lateral surface.`;
}

/**
 * Compute regular 2D polygon / circle base points around (cx, cy) on HP.
 */
function computeBaseGeometry2D(solid, size, restingOn, cx, cy) {
  const meta = SOLID_CATALOG[solid] || SOLID_CATALOG.squarePrism;
  if (meta.isCurved) {
    const radius = size / 2;
    const vertices = [];
    for (let i = 0; i < 12; i++) {
      const th = (2 * Math.PI * i) / 12;
      vertices.push([round2(cx + radius * Math.cos(th)), round2(cy + radius * Math.sin(th))]);
    }
    return {
      isCurved: true,
      sides: 12,
      radius,
      edgeLength: size,
      angleDeg: 0,
      vertices,
      xMin: round2(cx - radius),
      xMax: round2(cx + radius),
      yMin: round2(cy - radius),
      yMax: round2(cy + radius)
    };
  }

  const sides = meta.sides;
  const R = size / (2 * Math.sin(Math.PI / sides));
  const useEdgeRight = restingOn === "base edge";
  const angleDeg = useEdgeRight ? round2(180 / sides) : 0;
  const angleRad = degToRad(angleDeg);

  const vertices = [];
  for (let i = 0; i < sides; i++) {
    const th = angleRad + (2 * Math.PI * i) / sides;
    vertices.push([round2(cx + R * Math.cos(th)), round2(cy + R * Math.sin(th))]);
  }
  const xs = vertices.map((v) => v[0]);
  const ys = vertices.map((v) => v[1]);
  return {
    isCurved: false,
    sides,
    radius: R,
    edgeLength: size,
    angleDeg,
    vertices,
    xMin: Math.min(...xs),
    xMax: Math.max(...xs),
    yMin: Math.min(...ys),
    yMax: Math.max(...ys)
  };
}

function resolveCutHeight(spec, height) {
  if (spec.cutHeight !== undefined && spec.cutMode === undefined) {
    return clamp(Number(spec.cutHeight) || height / 2, 2, height - 2);
  }
  if (spec.cutMode === "fromTop") {
    return clamp(height - (Number(spec.cutOffset) || 15), 2, height - 2);
  }
  if (spec.cutMode === "fromBase") {
    return clamp(Number(spec.cutOffset) || 20, 2, height - 2);
  }
  return round2(height / 2);
}

/**
 * Generates an insightful conceptual breakdown for ANY question (built-in or custom)
 * so students immediately understand WHY each view is drawn a certain way.
 */
export function buildQuestionComprehension(question) {
  if (!question) return null;
  if (question.comprehension) return question.comprehension;

  const p = question.parameters || {};
  const solid = p.solid || "squarePrism";
  const meta = SOLID_CATALOG[solid] || SOLID_CATALOG.squarePrism;
  const edge = p.baseEdge || p.diameter || 30;
  const radius = p.radius || (meta.isCurved ? edge / 2 : edge / (2 * Math.sin(Math.PI / meta.sides)));
  const height = meta.isCube ? edge : (p.height || 60);
  const alpha = p.alpha ?? 45;
  const restingOn = p.restingOn || "base edge";
  const cuttingAngle = p.cuttingAngle ?? 45;
  const cutHeight = p.cutHeight ?? round2(height / 2);

  if (question.unit === "Projection of Solids") {
    const baseTilt = round2(90 - alpha);
    const isEdge = restingOn.includes("edge");
    return {
      simplePositionRule: `Start in Simple Position (upright on HP, axis ⊥ HP) because the true axis is inclined at ${alpha}° to HP and parallel to VP. This gives true widths in Top View (below XY) and true heights (${height} mm) in Front View (above XY).`,
      baseOrientationRule: meta.isCurved
        ? `Draw the base circle (${edge} mm diameter, radius ${round2(radius)} mm) below XY and divide into 8 or 12 equal radial generators for accurate elliptical projection.`
        : isEdge
          ? `Resting on a BASE EDGE on HP → orient the initial ${meta.sides}-gon below XY with one edge vertical (perpendicular to XY) on the right side (Polygon Angle: ${round2(180 / meta.sides)}°). That edge stays grounded on XY when tilted.`
          : `Resting on a BASE CORNER on HP → orient the initial ${meta.sides}-gon below XY with a single corner pointing right (Polygon Angle: 0°). That corner becomes the XY pivot when tilted.`,
      calculations: [
        `Base ${meta.isCurved ? "Radius r" : "Circumradius R"} = ${round2(radius)} mm`,
        `Tilted Base Angle to XY = 90° − α = 90° − ${alpha}° = ${baseTilt}°`,
        `Projected Height Check: Axis remains ${height} mm true length in tilted FV`
      ],
      visibilityTip: `In the Final Top View, the outer boundary is always continuous (HB). Edges attached to the grounded bottom ${isEdge ? "edge" : "corner"} beneath the solid become dashed Hidden lines.`
    };
  }

  if (question.unit === "Section of Solids") {
    return {
      simplePositionRule: `Since the ${meta.label.toLowerCase()} rests on its base on HP, first draw its full upright Top View (below XY) and Front View (${height} mm tall above XY).`,
      baseOrientationRule: `Draw the cutting plane (AIP) in the Front View at ${cuttingAngle}° to XY passing at height Y = ${round2(cutHeight)} mm above XY. Notice every intersection point on vertical or slant edges projects directly straight down into the Top View.`,
      calculations: [
        `Cut Elevation above Base = ${round2(cutHeight)} mm (out of ${height} mm)`,
        `Cutting Plane Angle to HP = ${cuttingAngle}°`,
        `True Shape Projection: Project ⊥ to ${cuttingAngle}° cutting plane onto X1Y1`
      ],
      visibilityTip: `Shade the cut surface in Top View with parallel 45° thin (2H) hatching lines. Remember that the True Shape is always wider than the Sectional Top View because you are viewing perpendicular to the ${cuttingAngle}° cut!`
    };
  }

  // Development of Surfaces
  const calcs = [
    `Cut Height on Axis = ${round2(cutHeight)} mm`,
    `Cutting Plane Angle = ${cuttingAngle}°`
  ];
  let devRule = "";
  if (meta.isPyramid) {
    const L = round2(Math.hypot(radius, height));
    if (meta.isCurved) {
      const sectorAngle = round2((radius / L) * 360);
      calcs.push(`True Slant Length L = √(${round2(radius)}² + ${height}²) = ${L} mm`);
      calcs.push(`Sector Angle θ = (r / L) × 360° = (${round2(radius)} / ${L}) × 360° = ${sectorAngle}°`);
      devRule = `Radial Line Method: Calculate sector angle θ = ${sectorAngle}° with radius L = ${L} mm centered at apex O. Divide into 12 parts and transfer true radial cut lengths from the outer generator in FV.`;
    } else {
      calcs.push(`Circumradius R = ${round2(radius)} mm, True Slant Edge L = √(R² + H²) = ${L} mm`);
      devRule = `Radial Line Method: Draw ${meta.sides} triangular faces fanning out from apex O with slant edge L = ${L} mm and base chord ${edge} mm. Transfer cut heights horizontally onto the outer true-length slant edge before swinging arcs onto each crease.`;
    }
  } else {
    const stretchLen = meta.isCurved ? round2(Math.PI * edge) : round2(meta.sides * edge);
    calcs.push(
      meta.isCurved
        ? `Stretch-Out Circumference = π × ${edge} = ${stretchLen} mm (12 divisions of ${round2(stretchLen / 12)} mm)`
        : `Stretch-Out Perimeter = ${meta.sides} × ${edge} = ${stretchLen} mm`
    );
    devRule = `Parallel Line Method: Unroll the ${stretchLen} mm perimeter along a horizontal baseline divided into ${meta.isCurved ? "12 equal generators" : `${meta.sides} faces of ${edge} mm`}, and project horizontal cut heights directly from Front View.`;
  }

  return {
    simplePositionRule: `Draw the orthographic Top and Front Views first on the left, then construct the unfolded lateral pattern immediately to the right along the same horizontal baseline.`,
    baseOrientationRule: devRule,
    calculations: calcs,
    visibilityTip: `True lengths of vertical prism edges are directly visible in Front View, while pyramid slant edges must be measured against an extreme outer generator lying parallel to VP.`
  };
}

/**
 * Generates a full guided problem compatible with QUESTIONS[] from structured spec.
 */
export function buildCustomQuestion(rawSpec) {
  const unit = rawSpec.unit || "Projection of Solids";
  const solid = rawSpec.solid && SOLID_CATALOG[rawSpec.solid] ? rawSpec.solid : "squarePrism";
  const meta = SOLID_CATALOG[solid];

  const baseSize = meta.isCurved
    ? clamp(Number(rawSpec.diameter || rawSpec.baseEdge) || 40, 10, 150)
    : clamp(Number(rawSpec.baseEdge) || 30, 8, 120);
  const height = meta.isCube
    ? baseSize
    : clamp(Number(rawSpec.height) || 60, 15, 200);
  const alpha = clamp(Number(rawSpec.alpha) || 45, 10, 85);
  const beta = clamp(Number(rawSpec.beta) || 0, 0, 90 - alpha);
  const restingOn = rawSpec.restingOn || (unit === "Projection of Solids" ? "base edge" : "base on HP");
  const cuttingAngle = clamp(Number(rawSpec.cuttingAngle) || 45, 10, 80);
  const cutHeight = resolveCutHeight(rawSpec, height);

  const spec = {
    unit,
    solid,
    baseEdge: baseSize,
    diameter: baseSize,
    radius: meta.isCurved ? round2(baseSize / 2) : round2(baseSize / (2 * Math.sin(Math.PI / meta.sides))),
    height,
    alpha,
    beta,
    restingOn,
    cuttingAngle,
    cutMode: rawSpec.cutMode || "midpoint",
    cutOffset: rawSpec.cutOffset || round2(height / 2),
    cutHeight
  };

  const title =
    (rawSpec.title || "").trim() ||
    `${meta.label} — ${
      unit === "Projection of Solids"
        ? `Axis at ${alpha}° to HP`
        : unit === "Section of Solids"
          ? `Cut at ${cuttingAngle}° to HP`
          : "Lateral Surface Development"
    }`;

  const problemStatement =
    (rawSpec.problemStatement || "").trim() || defaultStatementFor(spec);

  const parameters = {
    solid,
    ...(meta.isCurved ? { diameter: baseSize, radius: spec.radius } : { baseEdge: baseSize }),
    height,
    ...(unit === "Projection of Solids"
      ? { alpha, beta, restingOn }
      : { cuttingAngle, cutHeight })
  };

  const id = rawSpec.id || `custom-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  let steps = [];
  if (unit === "Projection of Solids") {
    steps = buildProjectionSteps(spec, meta);
  } else if (unit === "Section of Solids") {
    steps = buildSectionSteps(spec, meta);
  } else {
    steps = buildDevelopmentSteps(spec, meta);
  }

  const questionObj = {
    id,
    isCustom: true,
    unit,
    title,
    problemStatement,
    parameters,
    steps
  };

  questionObj.comprehension = buildQuestionComprehension(questionObj);
  return questionObj;
}

// ===========================================================================
// STEP BUILDERS WITH EXACT COORDINATES & GHOST GEOMETRY
// ===========================================================================

function buildSimpleBaseExpected(base, cx, cy, isPyramid) {
  if (base.isCurved) {
    const out = [
      { type: "circle", center: [cx, cy], radius: base.radius, style: "outline" },
      { type: "line", from: [round2(cx - base.radius), cy], to: [round2(cx + base.radius), cy], style: "axis" },
      { type: "line", from: [cx, round2(cy - base.radius)], to: [cx, round2(cy + base.radius)], style: "axis" }
    ];
    return out;
  }
  const pts = base.vertices;
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const next = pts[(i + 1) % pts.length];
    out.push({ type: "line", from: pts[i], to: next, style: "outline" });
    if (isPyramid) {
      out.push({ type: "line", from: pts[i], to: [cx, cy], style: "outline" });
    }
  }
  return out;
}

function buildUniqueSortedXs(base, cx) {
  const rawXs = base.isCurved
    ? [round2(cx - base.radius), cx, round2(cx + base.radius)]
    : base.vertices.map((v) => v[0]).concat([cx]);
  rawXs.sort((a, b) => a - b);
  const uniq = [];
  for (const x of rawXs) {
    if (uniq.length === 0 || Math.abs(uniq[uniq.length - 1] - x) > 0.4) {
      uniq.push(x);
    }
  }
  return uniq;
}

function buildProjectionSteps(spec, meta) {
  const cx = -65;
  const cy = -45;
  const base = computeBaseGeometry2D(spec.solid, spec.baseEdge, spec.restingOn, cx, cy);
  const H = spec.height;
  const fvWidth = round2(base.xMax - base.xMin);
  const alphaRad = degToRad(spec.alpha);
  const baseTiltDeg = round2(90 - spec.alpha);
  const projXs = buildUniqueSortedXs(base, cx);

  // Step 2: Top View
  const step2Expected = buildSimpleBaseExpected(base, cx, cy, meta.isPyramid);
  const step2Req = base.isCurved
    ? [{ type: "circle", radius: base.radius, inRegion: "belowXY" }]
    : [{ type: "polygon", sides: base.sides, edgeLength: base.edgeLength, inRegion: "belowXY" }];

  // Step 3: Projectors to XY
  const step3Expected = base.vertices.map((v) => ({
    type: "line",
    from: v,
    to: [v[0], 0],
    style: "construction"
  }));
  step3Expected.push({ type: "line", from: [cx, cy], to: [cx, 0], style: "axis" });

  // Step 4: Simple Position Front View
  const step4Expected = [{ type: "line", from: [base.xMin, 0], to: [base.xMax, 0], style: "outline" }];
  if (meta.isPyramid) {
    for (const vx of projXs) {
      if (Math.abs(vx - cx) > 0.5) {
        step4Expected.push({ type: "line", from: [vx, 0], to: [cx, H], style: "outline" });
      }
    }
    step4Expected.push({ type: "line", from: [cx, 0], to: [cx, H], style: "axis" });
  } else {
    step4Expected.push({ type: "line", from: [base.xMin, H], to: [base.xMax, H], style: "outline" });
    for (const vx of projXs) {
      if (Math.abs(vx - cx) < 0.4) {
        step4Expected.push({ type: "line", from: [vx, 0], to: [vx, H], style: "axis" });
      } else {
        step4Expected.push({ type: "line", from: [vx, 0], to: [vx, H], style: "outline" });
      }
    }
  }
  const step4Req = meta.isPyramid
    ? [{ type: "line", nearPoint: [cx, H], inRegion: "aboveXY" }]
    : [{ type: "box", height: H, inRegion: "aboveXY" }];

  // Step 5: Tilted Front View pivoted around rightmost base edge/corner (xPivot = 15, 0)
  const xPivot = 15;
  const rotPt = (px, py) => {
    const dx = px - base.xMax;
    const dy = py;
    return [
      round2(xPivot + dx * Math.sin(alphaRad) + dy * Math.cos(alphaRad)),
      round2(-dx * Math.cos(alphaRad) + dy * Math.sin(alphaRad))
    ];
  };

  const step5Expected = [];
  const tiltedBasePts = base.vertices.map((v) => ({
    tvY: v[1],
    origX: v[0],
    fv: rotPt(v[0], 0)
  }));

  if (meta.isPyramid) {
    const tiltedApex = rotPt(cx, H);
    const pLeft = rotPt(base.xMin, 0);
    const pRight = rotPt(base.xMax, 0);
    const pBaseCenter = rotPt(cx, 0);
    step5Expected.push({ type: "line", from: pRight, to: pLeft, style: "outline" });
    step5Expected.push({ type: "line", from: pBaseCenter, to: tiltedApex, style: "axis" });
    for (const vx of projXs) {
      if (Math.abs(vx - cx) > 0.5 || !base.isCurved) {
        step5Expected.push({ type: "line", from: rotPt(vx, 0), to: tiltedApex, style: "outline" });
      }
    }
  } else {
    const bL = rotPt(base.xMin, 0);
    const bR = rotPt(base.xMax, 0);
    const tL = rotPt(base.xMin, H);
    const tR = rotPt(base.xMax, H);
    const aB = rotPt(cx, 0);
    const aT = rotPt(cx, H);
    step5Expected.push({ type: "line", from: bR, to: bL, style: "outline" });
    step5Expected.push({ type: "line", from: tR, to: tL, style: "outline" });
    step5Expected.push({ type: "line", from: aB, to: aT, style: "axis" });
    for (const vx of projXs) {
      if (Math.abs(vx - cx) > 0.4) {
        step5Expected.push({ type: "line", from: rotPt(vx, 0), to: rotPt(vx, H), style: "outline" });
      }
    }
  }

  // Step 6: Final Top View (project downwards from tilted FV to initial TV depth lines)
  const step6Expected = [];
  if (meta.isPyramid) {
    const tiltedApex = rotPt(cx, H);
    const apexTV = [tiltedApex[0], cy];
    const finalBaseTV = tiltedBasePts.map((b) => [b.fv[0], b.tvY]);
    // Base edges: edges touching rightmost grounded pivot lie beneath body when leaning right -> hidden if facing away
    for (let i = 0; i < finalBaseTV.length; i++) {
      const nextIdx = (i + 1) % finalBaseTV.length;
      const onRightEdge =
        Math.abs(base.vertices[i][0] - base.xMax) < 1.0 &&
        Math.abs(base.vertices[nextIdx][0] - base.xMax) < 1.0;
      const isRightVertex =
        Math.abs(base.vertices[i][0] - base.xMax) < 1.0 ||
        Math.abs(base.vertices[nextIdx][0] - base.xMax) < 1.0;
      step6Expected.push({
        type: "line",
        from: finalBaseTV[i],
        to: finalBaseTV[nextIdx],
        style: onRightEdge || isRightVertex ? "hidden" : "outline"
      });
    }
    if (!base.isCurved) {
      for (const bPt of finalBaseTV) {
        step6Expected.push({ type: "line", from: bPt, to: apexTV, style: "outline" });
      }
    } else {
      // Tangent outer generators to apex
      const minY = Math.min(...finalBaseTV.map((p) => p[1]));
      const maxY = Math.max(...finalBaseTV.map((p) => p[1]));
      step6Expected.push({ type: "line", from: [finalBaseTV[0][0], minY], to: apexTV, style: "outline" });
      step6Expected.push({ type: "line", from: [finalBaseTV[0][0], maxY], to: apexTV, style: "outline" });
    }
  } else {
    const finalBot = tiltedBasePts.map((b) => [b.fv[0], b.tvY]);
    const finalTop = base.vertices.map((v) => [rotPt(v[0], H)[0], v[1]]);
    for (let i = 0; i < finalBot.length; i++) {
      const next = (i + 1) % finalBot.length;
      const touchingGround =
        Math.abs(base.vertices[i][0] - base.xMax) < 1.0 &&
        Math.abs(base.vertices[next][0] - base.xMax) < 1.0;
      step6Expected.push({
        type: "line",
        from: finalBot[i],
        to: finalBot[next],
        style: touchingGround ? "hidden" : "outline"
      });
      step6Expected.push({
        type: "line",
        from: finalTop[i],
        to: finalTop[next],
        style: "outline"
      });
      if (!base.isCurved || i % 3 === 0) {
        step6Expected.push({
          type: "line",
          from: finalBot[i],
          to: finalTop[i],
          style: touchingGround ? "hidden" : "outline"
        });
      }
    }
  }

  const polygonHint = base.isCurved
    ? `Use Circle tool (radius ${base.radius} mm) centered at (${cx}, ${cy}).`
    : `Use Polygon tool: ${base.sides} sides, edge ${spec.baseEdge} mm, angle ${base.angleDeg}° centered around (${cx}, ${cy}).`;

  return [
    {
      stepNumber: 1,
      title: "Draw Reference Line (XY)",
      instruction: "Draw the horizontal ground reference line (XY) across the sheet using the 2H pencil grade. Above XY is VP (Front View); below XY is HP (Top View).",
      hint: "Use the Line tool (2H grade) with Ortho Lock along Y = 0 mm from X = -150 to X = +150 mm.",
      lineType: "2H",
      expectedGeometry: [{ type: "line", from: [-150, 0], to: [150, 0], style: "axis", label: "XY" }],
      validation: { requires: [{ type: "line", minLength: 200, angle: 0, nearY: 0 }] }
    },
    {
      stepNumber: 2,
      title: `Simple Position — Top View (${meta.label})`,
      instruction: meta.isCurved
        ? `Draw the base circle of diameter ${spec.baseEdge} mm (radius ${base.radius} mm) below the XY line.`
        : `Construct the ${meta.label.toLowerCase()} base (${base.sides} sides, ${spec.baseEdge} mm edge) below XY with ${spec.restingOn === "base edge" ? "an edge perpendicular to XY on the right side" : "a corner pointing to the right"}.${meta.isPyramid ? " Connect all corners to the center apex." : ""}`,
      hint: polygonHint,
      lineType: "HB",
      suggestedPolygon: base.isCurved ? null : { sides: base.sides, edgeLength: spec.baseEdge, angle: base.angleDeg },
      expectedGeometry: step2Expected,
      validation: { requires: step2Req }
    },
    {
      stepNumber: 3,
      title: "Projectors from Top View to XY",
      instruction: "Draw thin vertical projection lines (2H) upwards from all corners of the Top View base to meet the XY reference line.",
      hint: "Select the Projector tool or 2H Line tool. Snap to each base corner and drag vertically up to Y = 0 mm.",
      lineType: "2H",
      expectedGeometry: step3Expected,
      validation: { requires: [{ type: "line", vertical: true, connectsToY: 0 }] }
    },
    {
      stepNumber: 4,
      title: `Simple Position — Front View (${H} mm Axis)`,
      instruction: meta.isPyramid
        ? `Draw the Front View above XY: place the base on XY (${fvWidth} mm span), locate the apex ${H} mm above XY on the center axis, and connect slant edges.`
        : `Draw the upright Front View rectangle above XY (${fvWidth} mm wide × ${H} mm tall) showing vertical visible edges and the central Axis line.`,
      hint: meta.isPyramid
        ? `Apex is at (${cx}, ${H}). Connect all base projections on Y = 0 up to (${cx}, ${H}).`
        : `Extend vertical edges from Y = 0 up to Y = ${H} mm and close the top face horizontally.`,
      lineType: "HB",
      expectedGeometry: step4Expected,
      validation: { requires: step4Req }
    },
    {
      stepNumber: 5,
      title: `Inclined Position — Tilted Front View (Axis ${spec.alpha}° to HP)`,
      instruction: `Tilt the entire Front View to the right around the rightmost grounded ${spec.restingOn === "base edge" ? "edge" : "corner"} on XY so the axis is inclined at ${spec.alpha}° to HP (base inclined at ${baseTiltDeg}° to XY).`,
      hint: `Pivot at X = ${xPivot}, Y = 0. Draw base going up-left at ${baseTiltDeg}° and axis/edges leaning right at ${spec.alpha}° to XY.`,
      lineType: "HB",
      expectedGeometry: step5Expected,
      validation: { requires: [{ type: "line", angles: [spec.alpha, baseTiltDeg], inRegion: "aboveXY" }] }
    },
    {
      stepNumber: 6,
      title: "Final Top View (Visible & Hidden Edges)",
      instruction: "Drop thin vertical projectors downwards from every vertex of the tilted Front View to intersect horizontal projectors from the initial Top View. Connect outer boundary with HB and resting hidden edges with Hidden (dashed).",
      hint: "Outer silhouette lines are always solid (HB). Edges resting on XY underneath the overhanging top face are dashed (Hidden).",
      lineType: "HB",
      expectedGeometry: step6Expected,
      validation: { requires: [{ type: "composite", inRegion: "belowXY", minElements: 4 }] }
    }
  ];
}

function buildSectionSteps(spec, meta) {
  const cx = -60;
  const cy = -45;
  const base = computeBaseGeometry2D(spec.solid, spec.baseEdge, spec.restingOn, cx, cy);
  const H = spec.height;
  const cutH = spec.cutHeight;
  const cutAngRad = degToRad(spec.cuttingAngle);
  const fvWidth = round2(base.xMax - base.xMin);
  const projXs = buildUniqueSortedXs(base, cx);

  const step2Expected = buildSimpleBaseExpected(base, cx, cy, meta.isPyramid);
  const step2Req = base.isCurved
    ? [{ type: "circle", radius: base.radius, inRegion: "belowXY" }]
    : [{ type: "polygon", sides: base.sides, edgeLength: base.edgeLength, inRegion: "belowXY" }];

  // Step 3: Elevation + Projectors
  const step3Expected = [{ type: "line", from: [base.xMin, 0], to: [base.xMax, 0], style: "outline" }];
  if (meta.isPyramid) {
    for (const vx of projXs) {
      if (Math.abs(vx - cx) > 0.5) {
        step3Expected.push({ type: "line", from: [vx, 0], to: [cx, H], style: "outline" });
      }
    }
    step3Expected.push({ type: "line", from: [cx, 0], to: [cx, H], style: "axis" });
  } else {
    step3Expected.push({ type: "line", from: [base.xMin, H], to: [base.xMax, H], style: "outline" });
    for (const vx of projXs) {
      step3Expected.push({
        type: "line",
        from: [vx, 0],
        to: [vx, H],
        style: Math.abs(vx - cx) < 0.4 ? "axis" : "outline"
      });
    }
  }
  const step3Req = meta.isPyramid
    ? [{ type: "line", nearPoint: [cx, H], inRegion: "aboveXY" }]
    : [{ type: "box", height: H, inRegion: "aboveXY" }];

  // Step 4: Cutting Plane line passing through (cx, cutH) at cuttingAngle
  const spanX = Math.max(fvWidth / 2 + 12, 32);
  const cutA = [round2(cx - spanX), round2(cutH - spanX * Math.tan(cutAngRad))];
  const cutB = [round2(cx + spanX), round2(cutH + spanX * Math.tan(cutAngRad))];

  // Compute exact cut intersections for Step 5 (Sectional TV) and Step 6 (True Shape)
  const cutYAt = (x) => cutH + (x - cx) * Math.tan(cutAngRad);
  const cutPoints = []; // { fv: [x, y], tv: [x, y] }

  if (meta.isPyramid) {
    for (const v of base.vertices) {
      // Slant edge from [v[0], 0] to [cx, H] in FV
      // x(t) = v[0] + t*(cx - v[0]), y(t) = t*H
      const dx = cx - v[0];
      const denom = H - dx * Math.tan(cutAngRad);
      let t = Math.abs(denom) > 1e-4 ? (cutH + (v[0] - cx) * Math.tan(cutAngRad)) / denom : 0.5;
      t = clamp(t, 0, 1);
      const fvX = round2(v[0] + t * dx);
      const fvY = round2(t * H);
      const tvX = round2(v[0] + t * (cx - v[0]));
      const tvY = round2(v[1] + t * (cy - v[1]));
      cutPoints.push({ fv: [fvX, fvY], tv: [tvX, tvY] });
    }
  } else {
    // Prism or cylinder clipped by cutting plane
    const tanA = Math.tan(cutAngRad);
    const xExitTop = Math.abs(tanA) > 1e-4 ? cx + (H - cutH) / tanA : Infinity;
    const xExitBot = Math.abs(tanA) > 1e-4 ? cx + (0 - cutH) / tanA : -Infinity;

    // Clip base polygon against [xExitBot, xExitTop] in cyclic order
    let poly = base.vertices.map((v) => [...v]);
    poly = clipPolygonXMax(poly, xExitTop);
    poly = clipPolygonXMin(poly, xExitBot);
    for (const p of poly) {
      cutPoints.push({
        fv: [round2(p[0]), round2(clamp(cutYAt(p[0]), 0, H))],
        tv: [round2(p[0]), round2(p[1])]
      });
    }
  }

  // Step 5 Expected: Sectional TV outline + hatching lines
  const step5Expected = [];
  for (let i = 0; i < cutPoints.length; i++) {
    const next = cutPoints[(i + 1) % cutPoints.length];
    step5Expected.push({ type: "line", from: cutPoints[i].tv, to: next.tv, style: "outline" });
  }
  // Simple interior hatch lines across bounding box of cutPoints.tv
  if (cutPoints.length >= 3) {
    const tvPoly = cutPoints.map((c) => c.tv);
    const minX = Math.min(...tvPoly.map((p) => p[0]));
    const maxX = Math.max(...tvPoly.map((p) => p[0]));
    const minY = Math.min(...tvPoly.map((p) => p[1]));
    const maxY = Math.max(...tvPoly.map((p) => p[1]));
    for (let c = minX + minY + 4; c <= maxX + maxY - 4; c += 5) {
      const hits = clipDiagonalLineToPoly(tvPoly, c);
      if (hits.length === 2) {
        step5Expected.push({ type: "line", from: hits[0], to: hits[1], style: "construction" });
      }
    }
  }

  // Step 6 Expected: True Shape projected perpendicular to cutting plane
  const ux = Math.cos(cutAngRad);
  const uy = Math.sin(cutAngRad);
  const nx = -Math.sin(cutAngRad);
  const ny = Math.cos(cutAngRad);
  const x1y1Offset = 42;
  const refCenter = [cx + nx * x1y1Offset, cutH + ny * x1y1Offset];
  const step6Expected = [
    {
      type: "line",
      from: [round2(refCenter[0] - ux * 55), round2(refCenter[1] - uy * 55)],
      to: [round2(refCenter[0] + ux * 55), round2(refCenter[1] + uy * 55)],
      style: "axis"
    }
  ];

  const trueShapePts = cutPoints.map((pt) => {
    const s = (pt.fv[0] - cx) * ux + (pt.fv[1] - cutH) * uy;
    const depth = pt.tv[1] - cy; // symmetric lateral width from centerline
    const dist = x1y1Offset + 28 + depth;
    return [round2(cx + ux * s + nx * dist), round2(cutH + uy * s + ny * dist)];
  });

  for (let i = 0; i < trueShapePts.length; i++) {
    const next = trueShapePts[(i + 1) % trueShapePts.length];
    step6Expected.push({ type: "line", from: trueShapePts[i], to: next, style: "outline" });
    step6Expected.push({ type: "line", from: cutPoints[i].fv, to: trueShapePts[i], style: "construction" });
  }

  return [
    {
      stepNumber: 1,
      title: "Draw Reference Line (XY)",
      instruction: "Draw the horizontal reference line (XY) across the workspace using the 2H pencil grade.",
      hint: "Snap along Y = 0 mm from X = -150 to X = +150 mm.",
      lineType: "2H",
      expectedGeometry: [{ type: "line", from: [-150, 0], to: [150, 0], style: "axis", label: "XY" }],
      validation: { requires: [{ type: "line", minLength: 200, angle: 0, nearY: 0 }] }
    },
    {
      stepNumber: 2,
      title: `Top View (${meta.label} Base)`,
      instruction: meta.isCurved
        ? `Draw the base circle (${spec.baseEdge} mm diameter) below XY centered at (${cx}, ${cy}) and divide into 12 radial generators.`
        : `Draw the regular ${base.sides}-sided base (${spec.baseEdge} mm side) below XY.${meta.isPyramid ? " Connect all corners to the apex center." : ""}`,
      hint: meta.isCurved
        ? `Use Circle tool (radius ${base.radius} mm) centered at (${cx}, ${cy}).`
        : `Use Polygon tool: ${base.sides} sides, edge ${spec.baseEdge} mm, angle ${base.angleDeg}° around (${cx}, ${cy}).`,
      lineType: "HB",
      suggestedPolygon: base.isCurved ? null : { sides: base.sides, edgeLength: spec.baseEdge, angle: base.angleDeg },
      expectedGeometry: step2Expected,
      validation: { requires: step2Req }
    },
    {
      stepNumber: 3,
      title: `Front View (${H} mm Elevation)`,
      instruction: `Project vertical construction lines (2H) from Top View corners to XY, then draw the ${meta.isPyramid ? "triangular/pyramid" : "rectangular"} Front View (${H} mm axis height) above XY.`,
      hint: `Base sits on XY from X = ${base.xMin} to ${base.xMax}. Height extends to Y = ${H} mm.`,
      lineType: "HB",
      expectedGeometry: step3Expected,
      validation: { requires: step3Req }
    },
    {
      stepNumber: 4,
      title: `Cutting Plane (${spec.cuttingAngle}° to HP at Y = ${round2(cutH)} mm)`,
      instruction: `Select 'Cutting Plane' style and draw the section plane line inclined at ${spec.cuttingAngle}° to HP passing through the axis point (${cx}, ${round2(cutH)}) in Front View.`,
      hint: `Draw an inclined line at ${spec.cuttingAngle}° passing cleanly through (${cx}, ${round2(cutH)}) across the Front View.`,
      lineType: "Cutting Plane",
      expectedGeometry: [{ type: "line", from: cutA, to: cutB, style: "cutting" }],
      validation: { requires: [{ type: "line", angle: spec.cuttingAngle, nearPoint: [cx, cutH], inRegion: "aboveXY" }] }
    },
    {
      stepNumber: 5,
      title: "Sectional Top View & 45° Hatching",
      instruction: "Project all intersection points where the cutting plane meets Front View edges vertically downward onto the corresponding edges in Top View. Outline the cut polygon (HB) and hatch at 45° (2H).",
      hint: "Every point where the cutting plane meets a generator/slant edge drops straight down to that same edge in Top View.",
      lineType: "HB",
      expectedGeometry: step5Expected,
      validation: { requires: [{ type: "composite", inRegion: "belowXY", minElements: 4 }] }
    },
    {
      stepNumber: 6,
      title: "True Shape of Section (Auxiliary Plane X1-Y1)",
      instruction: `Draw an auxiliary reference line X1-Y1 parallel to the ${spec.cuttingAngle}° cutting plane, project perpendicular construction rays from each cut point, and transfer lateral Top View distances to complete the True Shape.`,
      hint: "Measure each cut point's distance from the horizontal Top View centerline and step off along the perpendicular projectors past X1-Y1.",
      lineType: "HB",
      expectedGeometry: step6Expected,
      validation: { requires: [{ type: "composite", inRegion: "aboveXY", minElements: 4 }] }
    }
  ];
}

function buildDevelopmentSteps(spec, meta) {
  const cx = -65;
  const cy = -45;
  const base = computeBaseGeometry2D(spec.solid, spec.baseEdge, spec.restingOn, cx, cy);
  const H = spec.height;
  const cutH = spec.cutHeight;
  const cutAngRad = degToRad(spec.cuttingAngle);
  const fvWidth = round2(base.xMax - base.xMin);
  const projXs = buildUniqueSortedXs(base, cx);

  // Step 1 Expected: Ortho Views
  const step1Expected = [
    { type: "line", from: [-150, 0], to: [150, 0], style: "axis", label: "XY" },
    ...buildSimpleBaseExpected(base, cx, cy, meta.isPyramid),
    { type: "line", from: [base.xMin, 0], to: [base.xMax, 0], style: "outline" }
  ];
  if (meta.isPyramid) {
    for (const vx of projXs) {
      if (Math.abs(vx - cx) > 0.5) step1Expected.push({ type: "line", from: [vx, 0], to: [cx, H], style: "outline" });
    }
    step1Expected.push({ type: "line", from: [cx, 0], to: [cx, H], style: "axis" });
  } else {
    step1Expected.push({ type: "line", from: [base.xMin, H], to: [base.xMax, H], style: "outline" });
    for (const vx of projXs) {
      step1Expected.push({ type: "line", from: [vx, 0], to: [vx, H], style: Math.abs(vx - cx) < 0.4 ? "axis" : "outline" });
    }
  }
  const step1Req = meta.isPyramid
    ? [{ type: "line", nearPoint: [cx, H], inRegion: "aboveXY" }]
    : [{ type: "box", height: H, inRegion: "aboveXY" }];

  // Step 2: Cutting plane
  const spanX = Math.max(fvWidth / 2 + 12, 30);
  const cutA = [round2(cx - spanX), round2(cutH - spanX * Math.tan(cutAngRad))];
  const cutB = [round2(cx + spanX), round2(cutH + spanX * Math.tan(cutAngRad))];

  // Step 3, 4, 5 depend on Parallel Line (Prism/Cylinder) vs Radial Line (Pyramid/Cone)
  if (!meta.isPyramid) {
    const numSegs = meta.isCurved ? 12 : base.sides;
    const totalLen = meta.isCurved ? round2(Math.PI * spec.baseEdge) : round2(numSegs * spec.baseEdge);
    const stepLen = totalLen / numSegs;
    const startX = 15;

    const step3Expected = [{ type: "line", from: [startX, 0], to: [round2(startX + totalLen), 0], style: "outline" }];
    for (let i = 0; i <= numSegs; i++) {
      const gx = round2(startX + i * stepLen);
      step3Expected.push({
        type: "line",
        from: [gx, 0],
        to: [gx, H],
        style: i === 0 || i === numSegs ? "outline" : "construction"
      });
    }

    const step4Expected = [];
    const devBoundaryPts = [];
    const cutYAt = (x) => cutH + (x - cx) * Math.tan(cutAngRad);

    for (let i = 0; i <= numSegs; i++) {
      const gx = round2(startX + i * stepLen);
      const srcV = base.vertices[i % base.vertices.length];
      const rawH = cutYAt(srcV[0]);
      const h = round2(clamp(rawH, 0, H));
      devBoundaryPts.push([gx, h]);
      step4Expected.push({ type: "line", from: [srcV[0], h], to: [gx, h], style: "construction" });
    }

    const step5Expected = [
      { type: "line", from: [startX, 0], to: [round2(startX + totalLen), 0], style: "outline" },
      { type: "line", from: [startX, 0], to: devBoundaryPts[0], style: "outline" },
      { type: "line", from: [round2(startX + totalLen), 0], to: devBoundaryPts[devBoundaryPts.length - 1], style: "outline" }
    ];
    for (let i = 0; i < devBoundaryPts.length - 1; i++) {
      step5Expected.push({ type: "line", from: devBoundaryPts[i], to: devBoundaryPts[i + 1], style: "outline" });
      if (i > 0) {
        step5Expected.push({ type: "line", from: [devBoundaryPts[i][0], 0], to: devBoundaryPts[i], style: "outline" });
      }
    }

    return [
      {
        stepNumber: 1,
        title: "Draw Orthographic Views (TV & FV)",
        instruction: `Draw the XY line, Top View (${meta.isCurved ? `${spec.baseEdge} mm circle divided into 12 generators` : `${base.sides}-gon of ${spec.baseEdge} mm edge`}) below XY, and Front View (${H} mm tall) above XY.`,
        hint: `Place TV around (${cx}, ${cy}) and FV directly above XY up to Y = ${H} mm.`,
        lineType: "HB",
        suggestedPolygon: base.isCurved ? null : { sides: base.sides, edgeLength: spec.baseEdge, angle: base.angleDeg },
        expectedGeometry: step1Expected,
        validation: { requires: step1Req }
      },
      {
        stepNumber: 2,
        title: `Draw ${spec.cuttingAngle}° Cutting Plane`,
        instruction: `Draw the cutting plane line inclined at ${spec.cuttingAngle}° to HP through Y = ${round2(cutH)} mm in the Front View.`,
        hint: `Cutting plane passes through (${cx}, ${round2(cutH)}) at angle ${spec.cuttingAngle}°.`,
        lineType: "Cutting Plane",
        expectedGeometry: [{ type: "line", from: cutA, to: cutB, style: "cutting" }],
        validation: { requires: [{ type: "line", angle: spec.cuttingAngle, nearPoint: [cx, cutH], inRegion: "aboveXY" }] }
      },
      {
        stepNumber: 3,
        title: `Stretch-Out Baseline (${totalLen} mm)`,
        instruction: meta.isCurved
          ? `Draw the horizontal stretch-out line = π × D = ${totalLen} mm to the right of Front View (from X = ${startX} to ${round2(startX + totalLen)} mm) and divide into 12 equal strips (${round2(stepLen)} mm each).`
          : `Draw the horizontal stretch-out line = ${base.sides} × ${spec.baseEdge} = ${totalLen} mm to the right of Front View (from X = ${startX} to ${round2(startX + totalLen)} mm) with vertical fold lines every ${spec.baseEdge} mm.`,
        hint: `Draw baseline along Y = 0 from X = ${startX} to X = ${round2(startX + totalLen)} mm, rising to height ${H} mm.`,
        lineType: "HB",
        expectedGeometry: step3Expected,
        validation: { requires: [{ type: "line", minLength: Math.max(40, totalLen - 15), angle: 0, inRegion: "rightSide" }] }
      },
      {
        stepNumber: 4,
        title: "Horizontal Projectors from Cut Points",
        instruction: "Project thin horizontal lines (2H) from each intersection point in the Front View across to meet the corresponding vertical fold/generator line in the development.",
        hint: "Use horizontal 2H construction lines from every cut edge in FV across to the stretch-out grid.",
        lineType: "2H",
        expectedGeometry: step4Expected,
        validation: { requires: [{ type: "line", horizontal: true, style: "2H" }] }
      },
      {
        stepNumber: 5,
        title: meta.isCurved ? "Complete Smooth Development Curve" : "Complete Development Profile",
        instruction: meta.isCurved
          ? "Draw a smooth continuous curve (HB) connecting the 12 plotted heights, and darken the remaining lower outer boundary."
          : "Connect the consecutive cut points along the fold lines with straight outlines (HB) and darken the retained vertical fold lines.",
        hint: "Darken only the retained lower portion beneath the cut.",
        lineType: "HB",
        expectedGeometry: step5Expected,
        validation: { requires: [{ type: "composite", inRegion: "rightSide", minElements: 4 }] }
      }
    ];
  }

  // Pyramid or Cone (Radial Line Development)
  const L = round2(Math.hypot(base.radius, H));
  const numSegs = meta.isCurved ? 12 : base.sides;
  const sectorDeg = meta.isCurved
    ? round2((base.radius / L) * 360)
    : round2(((2 * Math.asin(clamp(spec.baseEdge / (2 * L), 0.01, 0.99))) * 180) / Math.PI * numSegs);
  const dAngle = sectorDeg / numSegs;
  const startAngleDeg = 270 - sectorDeg / 2;
  const apexO = [round2(cx + base.radius + L + 25), round2(H + 10)];

  const step3Expected = [];
  const fullPts = [];
  for (let i = 0; i <= numSegs; i++) {
    const a = degToRad(startAngleDeg + i * dAngle);
    const pt = [round2(apexO[0] + L * Math.cos(a)), round2(apexO[1] + L * Math.sin(a))];
    fullPts.push(pt);
    step3Expected.push({
      type: "line",
      from: apexO,
      to: pt,
      style: i === 0 || i === numSegs ? "outline" : "construction"
    });
  }
  if (meta.isCurved) {
    step3Expected.push({
      type: "arc",
      center: apexO,
      radius: L,
      startAngle: startAngleDeg,
      endAngle: startAngleDeg + sectorDeg,
      style: "outline"
    });
  } else {
    for (let i = 0; i < fullPts.length - 1; i++) {
      step3Expected.push({ type: "line", from: fullPts[i], to: fullPts[i + 1], style: "outline" });
    }
  }

  // Step 4 & 5: Compute exact true radial distances from Apex O
  const cutRadPts = [];
  const step4Expected = [];
  for (let i = 0; i <= numSegs; i++) {
    const v = base.vertices[i % base.vertices.length];
    const dx = cx - v[0];
    const denom = H - dx * Math.tan(cutAngRad);
    let t = Math.abs(denom) > 1e-4 ? (cutH + (v[0] - cx) * Math.tan(cutAngRad)) / denom : 0.5;
    t = clamp(t, 0, 1);
    const yCut = t * H;
    const distFromApex = round2(L * (1 - t));
    const a = degToRad(startAngleDeg + i * dAngle);
    cutRadPts.push([round2(apexO[0] + distFromApex * Math.cos(a)), round2(apexO[1] + distFromApex * Math.sin(a))]);
    if (i < numSegs) {
      step4Expected.push({
        type: "line",
        from: [round2(v[0] + t * dx), round2(yCut)],
        to: [round2(cx + base.radius * (1 - t)), round2(yCut)],
        style: "construction"
      });
    }
  }

  const step5Expected = [
    { type: "line", from: fullPts[0], to: cutRadPts[0], style: "outline" },
    { type: "line", from: fullPts[fullPts.length - 1], to: cutRadPts[cutRadPts.length - 1], style: "outline" }
  ];
  for (let i = 0; i < fullPts.length - 1; i++) {
    step5Expected.push({ type: "line", from: cutRadPts[i], to: cutRadPts[i + 1], style: "outline" });
    if (!meta.isCurved) {
      step5Expected.push({ type: "line", from: fullPts[i], to: fullPts[i + 1], style: "outline" });
      if (i > 0) step5Expected.push({ type: "line", from: fullPts[i], to: cutRadPts[i], style: "outline" });
    }
  }

  return [
    {
      stepNumber: 1,
      title: "Draw Orthographic Elevation & Plan",
      instruction: `Draw XY line, Top View (${meta.isCurved ? `${spec.baseEdge} mm circle divided into 12 parts` : `${base.sides}-gon of ${spec.baseEdge} mm edge`}) below XY, and Front View (${H} mm tall) above XY.`,
      hint: `Center Top View at (${cx}, ${cy}) and apex at (${cx}, ${H}).`,
      lineType: "HB",
      suggestedPolygon: base.isCurved ? null : { sides: base.sides, edgeLength: spec.baseEdge, angle: base.angleDeg },
      expectedGeometry: step1Expected,
      validation: { requires: step1Req }
    },
    {
      stepNumber: 2,
      title: `Calculate True Slant Length L (${L} mm)`,
      instruction: meta.isCurved
        ? `Compute true generator length L = √(r² + H²) = √(${base.radius}² + ${H}²) = ${L} mm and sector angle θ = (r / L) × 360° = ${sectorDeg}°. Locate apex O for development.`
        : `Compute true slant edge length L = √(R² + H²) = √(${round2(base.radius)}² + ${H}²) = ${L} mm (where circumradius R = ${round2(base.radius)} mm). If no slant edge in TV is horizontal, swing an arc to find L.`,
      hint: `True slant length L = ${L} mm${meta.isCurved ? `, Sector angle θ = ${sectorDeg}°` : ""}.`,
      lineType: "2H",
      expectedGeometry: [
        { type: "text", text: `L = ${L} mm${meta.isCurved ? `, θ = ${sectorDeg}°` : ""}`, pos: [apexO[0] - 25, apexO[1] + 10] }
      ],
      validation: { requires: [{ type: "alwaysPass" }] }
    },
    {
      stepNumber: 3,
      title: `Draw ${spec.cuttingAngle}° Cutting Plane`,
      instruction: `Draw the cutting plane line in Front View inclined at ${spec.cuttingAngle}° to HP through Y = ${round2(cutH)} mm.`,
      hint: `Line passes through (${cx}, ${round2(cutH)}) at ${spec.cuttingAngle}° to XY.`,
      lineType: "Cutting Plane",
      expectedGeometry: [{ type: "line", from: cutA, to: cutB, style: "cutting" }],
      validation: { requires: [{ type: "line", angle: spec.cuttingAngle, nearPoint: [cx, cutH], inRegion: "aboveXY" }] }
    },
    {
      stepNumber: 4,
      title: meta.isCurved ? `Draw Radial Sector (Radius ${L} mm, ${sectorDeg}°)` : `Construct ${numSegs} True-Length Sector Triangles`,
      instruction: meta.isCurved
        ? `From apex O (${apexO[0]}, ${apexO[1]}), draw a circular arc of radius L = ${L} mm spanning ${sectorDeg}° and divide into 12 equal radial generators.`
        : `From apex O (${apexO[0]}, ${apexO[1]}), swing an arc of radius L = ${L} mm and step off ${numSegs} base chords of ${spec.baseEdge} mm along the arc. Connect to apex O.`,
      hint: `Project horizontal cut points onto the true outer generator in FV to obtain true distances from apex O.`,
      lineType: "HB",
      expectedGeometry: [...step3Expected, ...step4Expected],
      validation: {
        requires: [meta.isCurved ? { type: "arc", inRegion: "rightSide" } : { type: "composite", inRegion: "rightSide", minElements: 3 }]
      }
    },
    {
      stepNumber: 5,
      title: "Transfer Cut Distances & Complete Development",
      instruction: "Mark the true distance from apex O along each radial generator/slant edge and connect with HB outlines (smooth curve for cone, straight edges for pyramid) for the retained truncated portion.",
      hint: "For regular solids, cut point distance from apex O = L × (H − y_cut) / H.",
      lineType: "HB",
      expectedGeometry: step5Expected,
      validation: { requires: [{ type: "composite", inRegion: "rightSide", minElements: 4 }] }
    }
  ];
}

// ===========================================================================
// POLYGON CLIPPING & HATCH HELPERS
// ===========================================================================

function clipPolygonXMax(pts, xMax) {
  if (!Number.isFinite(xMax)) return pts;
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i];
    const prev = pts[(i + pts.length - 1) % pts.length];
    const curIn = cur[0] <= xMax;
    const prevIn = prev[0] <= xMax;
    if (curIn !== prevIn) {
      const t = (xMax - prev[0]) / (cur[0] - prev[0] || 1);
      out.push([xMax, prev[1] + t * (cur[1] - prev[1])]);
    }
    if (curIn) out.push(cur);
  }
  return out;
}

function clipPolygonXMin(pts, xMin) {
  if (!Number.isFinite(xMin)) return pts;
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i];
    const prev = pts[(i + pts.length - 1) % pts.length];
    const curIn = cur[0] >= xMin;
    const prevIn = prev[0] >= xMin;
    if (curIn !== prevIn) {
      const t = (xMin - prev[0]) / (cur[0] - prev[0] || 1);
      out.push([xMin, prev[1] + t * (cur[1] - prev[1])]);
    }
    if (curIn) out.push(cur);
  }
  return out;
}

function clipDiagonalLineToPoly(poly, c) {
  // Line x + y = c (45 deg hatching slope -1 in screen/world)
  const hits = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const fa = a[0] + a[1] - c;
    const fb = b[0] + b[1] - c;
    if ((fa <= 0 && fb > 0) || (fb <= 0 && fa > 0)) {
      const t = -fa / (fb - fa || 1);
      hits.push([round2(a[0] + t * (b[0] - a[0])), round2(a[1] + t * (b[1] - a[1]))]);
    }
  }
  return hits.length >= 2 ? [hits[0], hits[1]] : [];
}

// ===========================================================================
// PERSISTENCE (localStorage)
// ===========================================================================

export function loadCustomQuestions() {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((q) => q && q.id && Array.isArray(q.steps)) : [];
  } catch {
    return [];
  }
}

export function saveCustomQuestions(list) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }
  } catch {}
}
