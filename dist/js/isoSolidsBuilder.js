/**
 * Pure Geometric Solid & Isometric Construction Builders
 *
 * Zero DOM/WebGL dependency — 100% unit-testable in Node and consumed by Three.js WebGL overlays
 * and 2D Orthographic Inset SVG generators.
 *
 * Coordinates use standard EG World frame (right-handed, centered in XZ inside bounding box):
 *   x in [-boxD/2 .. +boxD/2], z in [-boxW/2 .. +boxW/2], y in [0 .. H]
 * Camera at (+1, +1, +1)/sqrt(3) looks at the frontmost corner O = (+boxD/2, 0, +boxW/2):
 *   - Edge along (-Z) = `rightLen` projects at +30° up-right (FV X-width direction)
 *   - Edge along (-X) = `leftDepth` projects at +150° up-left (TV depth direction)
 *   - Edge along (+Y) = `height` projects vertically at +90°
 */

import { splitPolyhedronByPlane } from "./reaSpecMapper.js";
import { ISO_SCALE, projectIsoBoxCoords, projectWorldPointOrthographic } from "./isoCameraRig.js";

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const unit = (a) => {
  const n = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};

function computeFacesAndEdges(vertices, rawFaces) {
  const n = vertices.length || 1;
  const center = vertices.reduce(
    (acc, p) => [acc[0] + p[0] / n, acc[1] + p[1] / n, acc[2] + p[2] / n],
    [0, 0, 0]
  );

  const faces = rawFaces.map((origIds) => {
    const ids = [...origIds];
    const v0 = vertices[ids[0]];
    const v1 = vertices[ids[1]];
    const v2 = vertices[ids[2]];
    let normal = unit(cross(sub(v1, v0), sub(v2, v0)));
    if (dot(normal, sub(v0, center)) < 0) {
      ids.reverse();
      normal = [-normal[0], -normal[1], -normal[2]];
    }
    return { ids, normal };
  });

  const edgesMap = new Map();
  faces.forEach((f, fi) => {
    for (let i = 0; i < f.ids.length; i++) {
      const a = f.ids[i];
      const b = f.ids[(i + 1) % f.ids.length];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (!edgesMap.has(key)) edgesMap.set(key, { a: Math.min(a, b), b: Math.max(a, b), faces: [] });
      edgesMap.get(key).faces.push(fi);
    }
  });

  return { faces, edges: [...edgesMap.values()] };
}

/**
 * Generates an upright closed manifold (Prism, Pyramid, Frustum, Cylinder, Cone)
 * seated cleanly on y = 0 with rightWidth in Z and leftDepth in X.
 * `basePoly`: ordered XZ points `[[leftX, rightZ], ...]` centered around (0,0).
 */
export function buildFrustumManifold(basePts2D, topPts2D, height) {
  const n = basePts2D.length;
  const isApex = !topPts2D || topPts2D.length === 1;
  const vertices = [];
  for (let i = 0; i < n; i++) {
    vertices.push([basePts2D[i][0], 0, basePts2D[i][1]]);
  }
  if (isApex) {
    const apex = topPts2D?.[0] || [0, 0];
    vertices.push([apex[0], height, apex[1]]);
  } else {
    for (let i = 0; i < n; i++) {
      vertices.push([topPts2D[i][0], height, topPts2D[i][1]]);
    }
  }

  const rawFaces = [];
  rawFaces.push(Array.from({ length: n }, (_, i) => i));
  if (!isApex) {
    rawFaces.push(Array.from({ length: n }, (_, i) => n + i));
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    rawFaces.push(isApex ? [i, j, n] : [i, j, n + j, n + i]);
  }

  const { faces, edges } = computeFacesAndEdges(vertices, rawFaces);
  return { vertices, faces, edges, n, pyramid: isApex, height };
}

/**
 * Returns 2D polygon vertices in [leftX (depth from front-to-back along 150°), rightZ (width left-to-right along 30°)].
 */
function buildPolygon2D(sides, radius, rollDeg = 0) {
  const pts = [];
  const rollRad = (rollDeg * Math.PI) / 180;
  for (let i = 0; i < sides; i++) {
    const a = (2 * Math.PI * i) / sides + rollRad;
    pts.push([radius * Math.sin(a), radius * Math.cos(a)]);
  }
  return pts;
}

/**
 * Normalizes any built manifold's vertices so Y starts at 0 and XZ center is (0,0), returning bounding spans.
 */
function computeLocalBounds(polyData) {
  const xs = polyData.vertices.map((p) => p[0]);
  const ys = polyData.vertices.map((p) => p[1]);
  const zs = polyData.vertices.map((p) => p[2]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
    depthX: Math.max(...xs) - Math.min(...xs),
    heightY: Math.max(...ys) - Math.min(...ys),
    widthZ: Math.max(...zs) - Math.min(...zs)
  };
}

/**
 * Checks whether a 3D segment (p -> q) is parallel to one of the 3 isometric axes (X, Y, Z).
 */
export function isIsometricWorldEdge(p, q, eps = 0.25) {
  const dx = Math.abs(q[0] - p[0]);
  const dy = Math.abs(q[1] - p[1]);
  const dz = Math.abs(q[2] - p[2]);
  const zeroAxes = (dx < eps ? 1 : 0) + (dy < eps ? 1 : 0) + (dz < eps ? 1 : 0);
  return zeroAxes >= 2;
}

/**
 * Builds complete 3D & 2D Isometric Assembly Spec for any exam solid parameter set.
 */
export function buildIsoSolidAssemblySpec(params = {}, scaleMode = "projection") {
  const mode = scaleMode === "view" ? "view" : "projection";
  // When scaleMode = "projection", world solid stays at 1.0× true mm so orthographic projection along (1,1,1)
  // naturally foreshortens every isometric axis by 0.8165 (and leaves sphere radius at 1.0× true!).
  // When scaleMode = "view", solid scales up by sqrt(3/2) = 1.22474 so projected isometric edges read TRUE 1.000× mm!
  const axisDisplayScale = mode === "view" ? Math.sqrt(3 / 2) : 1.0;
  const isoDisplayMultiplier = mode === "view" ? 1.0 : ISO_SCALE;

  const solid = params.solid || "hexPrism";
  const height = Number(params.height) || 60;
  const baseEdge = Number(params.baseEdge) || 30;
  const diameter = Number(params.diameter) || (params.radius ? params.radius * 2 : 40);
  const topEdge = Number(params.topEdge) || 15;
  const cutAngle = Number(params.cutAngle) || Number(params.cuttingAngle) || 0;
  const cutHeight = Number(params.cutHeight) || height / 2;
  const sphereRadius = Number(params.sphereRadius) || (params.sphereDiameter ? params.sphereDiameter / 2 : 20);

  let polyData = null;
  let upperGhostPoly = null;
  let capPoly = [];
  let cutBasis = null;
  let curved = false;
  let topBoxBounds = null;
  let sphereSpec = null;
  let key2DVertices = []; // Base key vertices used for FV/TV + 3D corner labels & offset arrows

  if (solid === "hexPrism") {
    // Hexagonal prism with 2 edges parallel to VP (flat top/bottom edges along width Z, corners left/right)
    const R = baseEdge;
    const base2D = buildPolygon2D(6, R, 0);
    key2DVertices = base2D;
    polyData = buildFrustumManifold(base2D, base2D, height);
  } else if (solid === "squarePrism" || solid === "truncSquarePrism" || solid === "cube") {
    const e = solid === "cube" ? baseEdge : baseEdge;
    const h = solid === "cube" ? baseEdge : height;
    const half = e / 2;
    const base2D = [
      [half, -half],
      [half, half],
      [-half, half],
      [-half, -half]
    ];
    key2DVertices = base2D;
    const full = buildFrustumManifold(base2D, base2D, h);

    if (cutAngle > 0 || solid === "truncSquarePrism") {
      const ang = cutAngle || 45;
      const rad = (ang * Math.PI) / 180;
      const sinA = Math.sin(rad);
      const cosA = Math.cos(rad);
      // Cut plane slopes across the front-facing width axis (-Z in world = left-to-right in FV):
      // origin at (0, cutHeight, 0), uAxis = [0, sinA, -cosA] (rising toward -Z = right in FV), vAxis = [1, 0, 0]
      cutBasis = {
        origin: [0, cutHeight, 0],
        normal: [0, cosA, sinA],
        uAxis: [0, sinA, -cosA],
        vAxis: [1, 0, 0],
        angleDeg: ang,
        cutHeight
      };
      const sliced = splitPolyhedronByPlane(full, cutBasis);
      const { faces, edges } = computeFacesAndEdges(sliced.lowerPolyData.vertices, sliced.lowerPolyData.faces);
      const uFe = sliced.upperPolyData.vertices.length >= 4
        ? computeFacesAndEdges(sliced.upperPolyData.vertices, sliced.upperPolyData.faces)
        : null;
      polyData = { vertices: sliced.lowerPolyData.vertices, faces, edges, n: 4, pyramid: false, height: h };
      upperGhostPoly = uFe ? { vertices: sliced.upperPolyData.vertices, ...uFe } : null;
      capPoly = sliced.capPoly;
    } else {
      polyData = full;
    }
  } else if (solid === "cylinder") {
    curved = true;
    const r = diameter / 2;
    const segs = 64;
    const base2D = buildPolygon2D(segs, r, 0);
    key2DVertices = buildPolygon2D(8, r, 0);
    polyData = buildFrustumManifold(base2D, base2D, height);
  } else if (solid === "frustumHexPyramid") {
    const base2D = buildPolygon2D(6, baseEdge, 0);
    const top2D = buildPolygon2D(6, topEdge, 0);
    key2DVertices = base2D;
    polyData = buildFrustumManifold(base2D, top2D, height);
    const tb = computeLocalBounds(buildFrustumManifold(top2D, top2D, 1));
    topBoxBounds = {
      minX: tb.minX, maxX: tb.maxX,
      minZ: tb.minZ, maxZ: tb.maxZ,
      y: height,
      depthX: tb.depthX,
      widthZ: tb.widthZ
    };
  } else if (solid === "cone" || solid === "truncCone") {
    curved = true;
    const r = diameter / 2;
    const segs = 72;
    const base2D = buildPolygon2D(segs, r, 0);
    key2DVertices = buildPolygon2D(12, r, 0);
    const full = buildFrustumManifold(base2D, [[0, 0]], height);
    if (cutAngle > 0 || solid === "truncCone") {
      const ang = cutAngle || 30;
      const rad = (ang * Math.PI) / 180;
      const sinA = Math.sin(rad);
      const cosA = Math.cos(rad);
      cutBasis = {
        origin: [0, cutHeight, 0],
        normal: [0, cosA, sinA],
        uAxis: [0, sinA, -cosA],
        vAxis: [1, 0, 0],
        angleDeg: ang,
        cutHeight
      };
      const sliced = splitPolyhedronByPlane(full, cutBasis);
      const { faces, edges } = computeFacesAndEdges(sliced.lowerPolyData.vertices, sliced.lowerPolyData.faces);
      const uFe = sliced.upperPolyData.vertices.length >= 4
        ? computeFacesAndEdges(sliced.upperPolyData.vertices, sliced.upperPolyData.faces)
        : null;
      polyData = { vertices: sliced.lowerPolyData.vertices, faces, edges, n: segs, pyramid: true, height };
      upperGhostPoly = uFe ? { vertices: sliced.upperPolyData.vertices, ...uFe } : null;
      capPoly = sliced.capPoly;
    } else {
      polyData = full;
    }
  } else if (solid === "frustumSquarePyramid" || solid === "sphereOnFrustumSquare" || solid === "sphereOnCube") {
    const bH = solid === "sphereOnCube" ? baseEdge : height;
    const bh = baseEdge / 2;
    const th = solid === "sphereOnCube" ? bh : topEdge / 2;
    const base2D = [[bh, -bh], [bh, bh], [-bh, bh], [-bh, -bh]];
    const top2D = [[th, -th], [th, th], [-th, th], [-th, -th]];
    key2DVertices = base2D;
    polyData = buildFrustumManifold(base2D, top2D, bH);
    topBoxBounds = {
      minX: -th, maxX: th,
      minZ: -th, maxZ: th,
      y: bH,
      depthX: th * 2,
      widthZ: th * 2
    };
    if (solid === "sphereOnFrustumSquare" || solid === "sphereOnCube") {
      // Sphere sits coaxially centered at (0, bH + sphereRadius, 0) in local geometry.
      // CRITICAL EG RULE: Center elevation scales along the vertical iso axis by `axisDisplayScale`,
      // while the projected silhouette radius remains TRUE `sphereRadius` in Projection mode!
      sphereSpec = {
        trueRadius: sphereRadius,
        trueCenterY: bH + sphereRadius,
        isoProjectedCenterOffsetMm: (bH + sphereRadius) * isoDisplayMultiplier,
        renderRadiusInScene: sphereRadius, // Always renders with exact True Radius silhouette under OrthographicCamera!
        renderCenterYInScene: (bH + sphereRadius) * axisDisplayScale
      };
    }
  } else if (solid === "squarePyramid" || solid === "hexPyramid") {
    const isHex = solid === "hexPyramid";
    const sides = isHex ? 6 : 4;
    const rad = isHex ? baseEdge : baseEdge / Math.SQRT2;
    const base2D = buildPolygon2D(sides, rad, isHex ? 30 : 45);
    key2DVertices = base2D;
    polyData = buildFrustumManifold(base2D, [[0, 0]], height);
  } else {
    // Fallback rectangular prism
    const half = baseEdge / 2;
    const base2D = [[half, -half], [half, half], [-half, half], [-half, -half]];
    key2DVertices = base2D;
    polyData = buildFrustumManifold(base2D, base2D, height);
  }

  // Scale non-sphere geometry vertices uniformly by `axisDisplayScale` (1.0 in Projection -> natural 0.8165 foreshortening;
  // sqrt(3/2) in Isometric View -> exact 1:1 edge lengths on screen!)
  const scalePt = (p) => [
    p[0] * axisDisplayScale,
    p[1] * axisDisplayScale,
    p[2] * axisDisplayScale
  ];

  const scaledPoly = {
    ...polyData,
    vertices: polyData.vertices.map(scalePt),
    axis: [
      [0, 0, 0],
      [0, (sphereSpec ? sphereSpec.trueCenterY : height) * axisDisplayScale, 0]
    ],
    curved,
    height: height * axisDisplayScale
  };

  const scaledUpperGhost = upperGhostPoly
    ? {
        ...upperGhostPoly,
        vertices: upperGhostPoly.vertices.map(scalePt),
        curved
      }
    : null;

  const scaledCap = capPoly.map(scalePt);
  const fullBoxTrueHeight = sphereSpec ? sphereSpec.trueCenterY + sphereSpec.trueRadius : height;
  const fullBaseTrue = buildFrustumManifold(key2DVertices, key2DVertices, fullBoxTrueHeight);
  const trueBounds = computeLocalBounds(fullBaseTrue);

  // Full bounding box in scene space
  const envHeight = height * axisDisplayScale;
  const bounds = {
    minX: trueBounds.minX * axisDisplayScale,
    maxX: trueBounds.maxX * axisDisplayScale,
    minY: 0,
    maxY: envHeight,
    minZ: trueBounds.minZ * axisDisplayScale,
    maxZ: trueBounds.maxZ * axisDisplayScale,
    widthZ: trueBounds.widthZ * axisDisplayScale,
    depthX: trueBounds.depthX * axisDisplayScale,
    heightY: envHeight,
    trueWidthZ: trueBounds.widthZ,
    trueDepthX: trueBounds.depthX,
    trueHeightY: height
  };

  const scaledTopBox = topBoxBounds
    ? {
        minX: topBoxBounds.minX * axisDisplayScale,
        maxX: topBoxBounds.maxX * axisDisplayScale,
        minZ: topBoxBounds.minZ * axisDisplayScale,
        maxZ: topBoxBounds.maxZ * axisDisplayScale,
        y: topBoxBounds.y * axisDisplayScale,
        widthZ: topBoxBounds.widthZ * axisDisplayScale,
        depthX: topBoxBounds.depthX * axisDisplayScale
      }
    : null;

  // Classify main visible polyhedral edges into Isometric vs Non-Isometric
  const isoEdges = [];
  const nonIsoEdges = [];
  if (!curved) {
    for (const e of scaledPoly.edges) {
      const p = scaledPoly.vertices[e.a];
      const q = scaledPoly.vertices[e.b];
      if (isIsometricWorldEdge(p, q)) isoEdges.push([p, q]);
      else nonIsoEdges.push([p, q]);
    }
  } else if (scaledCap.length >= 3) {
    // For curved cut cones, cut points along cap form a non-isometric curved section perimeter
    for (let i = 0; i < scaledCap.length; i++) {
      nonIsoEdges.push([scaledCap[i], scaledCap[(i + 1) % scaledCap.length]]);
    }
  }

  // Offset vectors from outer Enclosing Box boundary to each key base vertex on Y = 0
  const offsets = [];
  for (let i = 0; i < key2DVertices.length; i++) {
    const [vxT, vzT] = key2DVertices[i];
    const vx = vxT * axisDisplayScale;
    const vz = vzT * axisDisplayScale;
    const dMinZ = Math.abs(vz - bounds.minZ);
    const dMaxZ = Math.abs(bounds.maxZ - vz);
    const dMinX = Math.abs(vx - bounds.minX);
    const dMaxX = Math.abs(bounds.maxX - vx);
    if (dMinZ > 0.5 && dMaxZ > 0.5) {
      const boxZ = dMaxZ <= dMinZ ? bounds.maxZ : bounds.minZ;
      offsets.push({
        from: [vx, 0.25, boxZ],
        to: [vx, 0.25, vz],
        distTrueMm: Math.min(dMinZ, dMaxZ) / axisDisplayScale,
        distDisplayMm: (Math.min(dMinZ, dMaxZ) / axisDisplayScale) * isoDisplayMultiplier
      });
    }
    if (dMinX > 0.5 && dMaxX > 0.5) {
      const boxX = dMaxX <= dMinX ? bounds.maxX : bounds.minX;
      offsets.push({
        from: [boxX, 0.25, vz],
        to: [vx, 0.25, vz],
        distTrueMm: Math.min(dMinX, dMaxX) / axisDisplayScale,
        distDisplayMm: (Math.min(dMinX, dMaxX) / axisDisplayScale) * isoDisplayMultiplier
      });
    }
  }

  // Interactive Cut Points (for FV <-> 3D linked hover sync)
  let cutPoints = [];
  if (scaledCap.length >= 3) {
    const step = curved ? Math.max(1, Math.floor(scaledCap.length / 8)) : 1;
    let idx = 1;
    for (let i = 0; i < scaledCap.length && cutPoints.length < 10; i += step) {
      const pt = scaledCap[i];
      cutPoints.push({
        id: `cp-${idx}`,
        label: `${idx}'`,
        tvLabel: `${idx}`,
        world: pt,
        truePos: [pt[0] / axisDisplayScale, pt[1] / axisDisplayScale, pt[2] / axisDisplayScale]
      });
      idx++;
    }
  } else if (upperGhostPoly === null && cutHeight && cutAngle === 0) {
    cutPoints = [];
  }

  // Box Origin O at frontmost corner (maxX, 0, maxZ)
  const originO = [bounds.maxX, 0, bounds.maxZ];

  // Key corners 1,2,3,4 on base and a,b,c,d on top of enclosing box
  const boxCorners = {
    base: [
      { label: "1 (O)", pos: [bounds.maxX, 0, bounds.maxZ] },
      { label: "2", pos: [bounds.maxX, 0, bounds.minZ] },
      { label: "3", pos: [bounds.minX, 0, bounds.minZ] },
      { label: "4", pos: [bounds.minX, 0, bounds.maxZ] }
    ],
    top: [
      { label: "a", pos: [bounds.maxX, bounds.maxY, bounds.maxZ] },
      { label: "b", pos: [bounds.maxX, bounds.maxY, bounds.minZ] },
      { label: "c", pos: [bounds.minX, bounds.maxY, bounds.minZ] },
      { label: "d", pos: [bounds.minX, bounds.maxY, bounds.maxZ] }
    ]
  };

  return {
    solid,
    scaleMode: mode,
    axisDisplayScale,
    isoDisplayMultiplier,
    polyData: scaledPoly,
    upperGhostPoly: scaledUpperGhost,
    capPoly: scaledCap,
    cutBasis: cutBasis
      ? {
          ...cutBasis,
          origin: scalePt(cutBasis.origin),
          cutHeight: cutBasis.cutHeight * axisDisplayScale
        }
      : null,
    curved,
    bounds,
    topBoxBounds: scaledTopBox,
    sphereSpec,
    isoEdges,
    nonIsoEdges,
    offsets,
    cutPoints,
    key2DVertices,
    originO,
    boxCorners,
    // Dimension strings updated dynamically for View (1:1) vs Projection (0.8165)
    metrics: {
      trueW: trueBounds.widthZ,
      trueD: trueBounds.depthX,
      trueH: height,
      shownW: trueBounds.widthZ * isoDisplayMultiplier,
      shownD: trueBounds.depthX * isoDisplayMultiplier,
      shownH: height * isoDisplayMultiplier,
      sphereTrueRadius: sphereSpec?.trueRadius ?? null,
      sphereShownCenterOffset: sphereSpec?.isoProjectedCenterOffsetMm ?? null
    }
  };
}
