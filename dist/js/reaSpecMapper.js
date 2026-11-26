/**
 * AutoCAD REA Architecture & 3D Spec Mapper
 * Documents SEEN vs INFERRED findings from reverse-engineered AutoCAD reports
 * and translates them into deterministic Three.js / WebGL configurations,
 * camera preset bases, section plane frames, and True Shape metrics.
 */

const degToRad = (d) => (d * Math.PI) / 180;

export const AUTOCAD_3D_ARCHITECTURE = {
  entityKernel: {
    verification: "SEEN",
    source: "autocad-reverse-engineering-analysis.md (AcDb3dSolid / Affine Transforms)",
    summary: "Convex B-Rep solids with outward face normals, unique shared edge adjacency, and WCS-to-View transforms.",
    mappedModule: "geometry.js & practice3d.js"
  },
  visualStyles: {
    verification: "INFERRED",
    source: "AutoCAD AcGs Visual Styles Pipeline",
    summary: "Separates Conceptual (Gooch cool-to-warm), Shaded with Edges, X-Ray transparency, and depth-occluded Hidden Wireframe.",
    mappedModule: "visualStyles.js"
  },
  edgeSilhouettePipeline: {
    verification: "SEEN+INFERRED",
    source: "AcGs Crease/Silhouette/Obscured Line Passes",
    summary: "Separates sharp crease edges, curved horizon silhouettes, and dashed obscured edges behind solid faces.",
    mappedModule: "visualStyles.js"
  },
  cameraRelativeRig: {
    verification: "INFERRED",
    source: "AutoCAD Dual-Distant Viewpoint Lighting & ViewCube HUD",
    summary: "Tracks the active camera vector so faces remain readable across every orbit angle, paired with face/corner camera slerping.",
    mappedModule: "sceneSetup.js & viewCube.js"
  },
  liveSectionEngine: {
    verification: "SEEN+INFERRED",
    source: "AcDbSection / Auxiliary Inclined Plane (AIP) Capping",
    summary: "Real-time half-space plane slicing with sealed cross-section cap, exploded upper segment along cut normal, and normal inspection camera.",
    mappedModule: "sectionSlicer.js"
  }
};

export const VISUAL_STYLE_SPECS = [
  {
    id: "conceptual",
    label: "Conceptual",
    category: "AutoCAD",
    description: "Gooch cool-to-warm shading so every facet and slope stays clear.",
    defaultOpacity: 0.96,
    showEdges: true,
    edgeColor: 0x161b22
  },
  {
    id: "shaded",
    label: "Shaded + Edges",
    category: "AutoCAD",
    description: "Crisp PBR shading with razor-sharp monochrome CAD outlines.",
    defaultOpacity: 0.92,
    showEdges: true,
    edgeColor: 0xffffff
  },
  {
    id: "xray",
    label: "X-Ray",
    category: "AutoCAD",
    description: "Controlled translucency revealing internal axes, vertices, and rear edges.",
    defaultOpacity: 0.25,
    showEdges: true,
    edgeColor: 0x9ce2ff
  },
  {
    id: "wireframe",
    label: "Hidden Wire",
    category: "AutoCAD",
    description: "Depth-occluded CAD wireframe with crisp dashed hidden edges.",
    defaultOpacity: 0.0,
    showEdges: true,
    edgeColor: 0xffffff
  },
  {
    id: "aluminum",
    label: "Aluminum",
    category: "Studio",
    description: "Machined brushed aluminum with clearcoat and anisotropic grain.",
    defaultOpacity: 1.0,
    showEdges: true,
    edgeColor: 0x2a2f36
  },
  {
    id: "glass",
    label: "Frosted Glass",
    category: "Studio",
    description: "Architectural frosted glass revealing internal reference geometry.",
    defaultOpacity: 0.42,
    showEdges: true,
    edgeColor: 0xb6ecff
  },
  {
    id: "blueprint",
    label: "Blueprint",
    category: "Studio",
    description: "Holographic blueprint core with glowing cyan wireframe contours.",
    defaultOpacity: 0.36,
    showEdges: true,
    edgeColor: 0x38e8ff
  }
];

export function mapVisualStyleConfig(styleId = "shaded") {
  return VISUAL_STYLE_SPECS.find((s) => s.id === styleId) || VISUAL_STYLE_SPECS[1];
}

export const VIEWCUBE_PRESETS = {
  iso: { dir: [0.95, 0.85, 1.0], up: [0, 1, 0], label: "ISO" },
  front: { dir: [0, 0, 1], up: [0, 1, 0], label: "FRONT" },
  back: { dir: [0, 0, -1], up: [0, 1, 0], label: "BACK" },
  top: { dir: [0, 1, 0.0001], up: [0, 0, -1], label: "TOP" },
  bottom: { dir: [0, -1, 0.0001], up: [0, 0, 1], label: "BOT" },
  side: { dir: [1, 0, 0], up: [0, 1, 0], label: "RIGHT" },
  right: { dir: [1, 0, 0], up: [0, 1, 0], label: "RIGHT" },
  left: { dir: [-1, 0, 0], up: [0, 1, 0], label: "LEFT" },
  isoFLT: { dir: [-0.95, 0.85, 1.0], up: [0, 1, 0], label: "ISO-L" },
  isoBRT: { dir: [0.95, 0.85, -1.0], up: [0, 1, 0], label: "ISO-BR" },
  isoBLT: { dir: [-0.95, 0.85, -1.0], up: [0, 1, 0], label: "ISO-BL" }
};

/**
 * Orthonormal basis for an Auxiliary Inclined Plane (AIP) cutting through (cx, cutHeight, cz)
 * inclined at cutAngleDeg to the Horizontal Plane (X axis).
 */
export function computeCutPlaneBasis(cutAngleDeg = 45, cutHeight = 30, cx = 0, cz = 45) {
  const rad = degToRad(cutAngleDeg);
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);
  return {
    origin: [cx, cutHeight, cz],
    // Normal points upward (+Y when angle = 0) into the removed upper half
    normal: [-sinA, cosA, 0],
    // Tangent along slope inside cut plane
    uAxis: [cosA, sinA, 0],
    // Depth tangent parallel to VP/Z
    vAxis: [0, 0, 1],
    angleDeg: cutAngleDeg,
    cutHeight
  };
}

/**
 * Compute exact edge lengths, perimeter, centroid, and area of an ordered 3D section polygon.
 */
export function computeSectionTrueShapeMetrics(capPoly = []) {
  if (!Array.isArray(capPoly) || capPoly.length < 3) {
    return { edgeCount: 0, edges: [], perimeterMm: 0, areaMm2: 0, centroid: [0, 0, 0] };
  }

  const n = capPoly.length;
  const centroid = capPoly.reduce(
    (acc, p) => [acc[0] + p[0] / n, acc[1] + p[1] / n, acc[2] + p[2] / n],
    [0, 0, 0]
  );

  const edges = [];
  let perimeterMm = 0;
  let nx = 0;
  let ny = 0;
  let nz = 0;

  for (let i = 0; i < n; i++) {
    const a = capPoly[i];
    const b = capPoly[(i + 1) % n];
    const lengthMm = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    perimeterMm += lengthMm;
    edges.push({
      index: i,
      from: a,
      to: b,
      mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
      lengthMm
    });

    // Newell's method cross accumulation for true 3D polygon area
    const ax = a[0] - centroid[0];
    const ay = a[1] - centroid[1];
    const az = a[2] - centroid[2];
    const bx = b[0] - centroid[0];
    const by = b[1] - centroid[1];
    const bz = b[2] - centroid[2];
    nx += ay * bz - az * by;
    ny += az * bx - ax * bz;
    nz += ax * by - ay * bx;
  }

  const areaMm2 = 0.5 * Math.hypot(nx, ny, nz);
  return {
    edgeCount: edges.length,
    edges,
    perimeterMm,
    areaMm2,
    centroid
  };
}

/**
 * Resolves camera preset direction, up vector, and optional True Shape inspection target.
 */
export function resolveCameraPresetBasis(name = "iso", cutBasis = null) {
  if (name === "inspectCut" && cutBasis && Array.isArray(cutBasis.normal)) {
    const [nx, ny, nz] = cutBasis.normal;
    // Viewer looks squarely down the cut plane normal toward the section face
    const dir = [nx, ny, nz + 0.0001];
    const len = Math.hypot(...dir) || 1;
    // Choose stable "up" tangent orthogonal to normal (mostly along +Z or -uAxis so FV width reads cleanly)
    const up = Math.abs(ny) > 0.92 ? [0, 0, -1] : [-Math.sign(nx || 1) * Math.abs(ny), Math.abs(nx), 0];
    return {
      dir: [dir[0] / len, dir[1] / len, dir[2] / len],
      up,
      label: "TRUE SHAPE"
    };
  }
  const preset = VIEWCUBE_PRESETS[name] || VIEWCUBE_PRESETS.iso;
  const len = Math.hypot(...preset.dir) || 1;
  return {
    dir: [preset.dir[0] / len, preset.dir[1] / len, preset.dir[2] / len],
    up: [...preset.up],
    label: preset.label
  };
}

/**
 * Watertight Half-Space Manifold Slicer (pure math, testable in Node & WebGL).
 * Clips every convex/closed polyhedron face against the plane defined by `cutBasis`,
 * returning sealed lower & upper solid polyhedra plus ordered boundary vertices `capPoly`.
 */
export function splitPolyhedronByPlane(polyData, cutBasis) {
  const [ox, oy, oz] = cutBasis.origin;
  const [nx, ny, nz] = cutBasis.normal;
  const [ux, uy, uz] = cutBasis.uAxis;
  const [vx, vy, vz] = cutBasis.vAxis;

  const signedDist = (p) => (p[0] - ox) * nx + (p[1] - oy) * ny + (p[2] - oz) * nz;
  const rawFaces = polyData.faces.map((f) => (Array.isArray(f) ? f : f.ids));

  const clipHalf = (keepLower) => {
    const outFaces = [];
    const cutVerts = [];
    for (const face of rawFaces) {
      const poly = face.map((id) => [...polyData.vertices[id]]);
      const clipped = [];
      for (let i = 0; i < poly.length; i++) {
        const cur = poly[i];
        const prev = poly[(i + poly.length - 1) % poly.length];
        const dCur = signedDist(cur);
        const dPrev = signedDist(prev);
        const curIn = keepLower ? dCur <= 1e-4 : dCur >= -1e-4;
        const prevIn = keepLower ? dPrev <= 1e-4 : dPrev >= -1e-4;
        if (curIn !== prevIn) {
          const t = dPrev / (dPrev - dCur || 1e-9);
          const hit = [
            prev[0] + t * (cur[0] - prev[0]),
            prev[1] + t * (cur[1] - prev[1]),
            prev[2] + t * (cur[2] - prev[2])
          ];
          clipped.push(hit);
          cutVerts.push(hit);
        }
        if (curIn) clipped.push(cur);
      }
      if (clipped.length >= 3) outFaces.push(clipped);
    }

    const uniq = [];
    for (const p of cutVerts) {
      if (!uniq.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < 0.08)) {
        uniq.push(p);
      }
    }

    if (uniq.length >= 3) {
      const cen = uniq.reduce(
        (acc, p) => [acc[0] + p[0] / uniq.length, acc[1] + p[1] / uniq.length, acc[2] + p[2] / uniq.length],
        [0, 0, 0]
      );
      uniq.sort((p, q) => {
        const pu = (p[0] - cen[0]) * ux + (p[1] - cen[1]) * uy + (p[2] - cen[2]) * uz;
        const pv = (p[0] - cen[0]) * vx + (p[1] - cen[1]) * vy + (p[2] - cen[2]) * vz;
        const qu = (q[0] - cen[0]) * ux + (q[1] - cen[1]) * uy + (q[2] - cen[2]) * uz;
        const qv = (q[0] - cen[0]) * vx + (q[1] - cen[1]) * vy + (q[2] - cen[2]) * vz;
        return Math.atan2(pv, pu) - Math.atan2(qv, qu);
      });
    }

    return { faces: outFaces, cap: uniq };
  };

  const lower = clipHalf(true);
  const upper = clipHalf(false);
  const capPoly = lower.cap.length >= 3 ? lower.cap : upper.cap;

  const packFlat = (halfFaces, cap, reverseCap) => {
    const vertices = [];
    const faces = [];
    for (const poly of halfFaces) {
      const start = vertices.length;
      for (const p of poly) vertices.push(p);
      faces.push(Array.from({ length: poly.length }, (_, k) => start + k));
    }
    if (cap.length >= 3) {
      const capStart = vertices.length;
      const ordered = reverseCap ? [...cap].reverse() : cap;
      for (const p of ordered) vertices.push(p);
      faces.push(Array.from({ length: ordered.length }, (_, k) => capStart + k));
    }
    return { vertices, faces };
  };

  return {
    lowerPolyData: packFlat(lower.faces, capPoly, false),
    upperPolyData: packFlat(upper.faces, capPoly, true),
    capPoly
  };
}
