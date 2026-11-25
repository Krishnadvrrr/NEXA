import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { reconstructFrom2DStrokes } from "./reconstruct3d.js";

/**
 * High-Precision Synchronized 2D <-> 3D Engineering Graphics Visualizer
 * - Aligns 3D Stage Solids vertex-for-vertex with 2D Top & Front Views
 * - Interactive Dihedral Unfolding around the XY hinge line (0 deg 3D room <-> 90 deg 2D sheet)
 * - Real-time 60 FPS cursor reticle, locus ray, and live drag rubber-band preview
 * - Analytical 3D Section Plane slicing with cross-section cap & removed top ghost
 * - True Live 2D-to-3D solid reconstruction in Free Practice & "From 2D" Sync mode
 */

const degToRad = (d) => (d * Math.PI) / 180;

export function createPractice3D(host) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  host.innerHTML = "";
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();

  // Orthographic camera for true engineering projections
  const camera = new THREE.OrthographicCamera(-150, 150, 150, -150, 0.1, 4000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.minZoom = 0.25;
  controls.maxZoom = 6;

  // Monochromatic studio lighting
  scene.add(new THREE.HemisphereLight(0xffffff, 0x111111, 2.4));
  const dirLight = new THREE.DirectionalLight(0xffffff, 2.4);
  dirLight.position.set(140, 220, 180);
  scene.add(dirLight);
  const fillLight = new THREE.DirectionalLight(0xffffff, 1.0);
  fillLight.position.set(-120, 90, -100);
  scene.add(fillLight);

  // Scene hierarchy: Fixed VP, Fixed XY, Hinged HP, 3D Stage & Reconstructed Solids
  const xyGroup = new THREE.Group();
  const vpGroup = new THREE.Group();
  const hpPivotGroup = new THREE.Group();

  const vpStrokesGroup = new THREE.Group();
  const vpPreviewGroup = new THREE.Group();
  const hpStrokesGroup = new THREE.Group();
  const hpPreviewGroup = new THREE.Group();
  const hpShadowGroup = new THREE.Group();

  const stageGroup = new THREE.Group();
  const raysGroup = new THREE.Group();
  const reconstructedGroup = new THREE.Group();

  vpGroup.add(vpStrokesGroup, vpPreviewGroup);
  hpPivotGroup.add(hpStrokesGroup, hpPreviewGroup, hpShadowGroup);

  scene.add(xyGroup, vpGroup, hpPivotGroup, stageGroup, raysGroup, reconstructedGroup);

  // Dimensions & camera center
  const minX = -160;
  const maxX = 180;
  const heightSpan = 160;
  const depthSpan = 150;
  let extent = 145;
  const center = new THREE.Vector3(-10, 32, 38);

  let dirty = true;
  let disposed = false;
  let currentPreset = "iso";
  let showRays = true;
  let syncMode = "stage"; // "stage" (guided + live strokes) | "draft" (reconstruct strictly from 2D strokes)
  let foldDeg = 0; // 0 = 3D dihedral room, 90 = flat unfolded 2D sheet
  let targetFoldDeg = 0;
  let lastQuestion = null;
  let lastStepIndex = 0;
  let lastDrawnElements = [];

  // Shared materials cached cleanly where appropriate
  const gradeColor = (grade) => {
    if (grade === "HB") return 0xffffff;
    if (grade === "2H") return 0x666666;
    if (grade === "Axis") return 0xf5b95d;
    if (grade === "Hidden") return 0x999999;
    if (grade === "Cutting Plane") return 0xff5370;
    return 0xffffff;
  };

  function clearGroup(group) {
    while (group.children.length > 0) {
      const o = group.children.pop();
      clearObjectResources(o);
    }
  }

  function clearObjectResources(obj) {
    if (obj.children && obj.children.length > 0) {
      for (const c of [...obj.children]) {
        clearObjectResources(c);
      }
    }
    obj.geometry?.dispose();
    if (Array.isArray(obj.material)) {
      obj.material.forEach((m) => {
        m?.map?.dispose();
        m?.dispose();
      });
    } else if (obj.material) {
      obj.material.map?.dispose();
      obj.material.dispose();
    }
  }

  function makeTextSprite(text, pos, color = "#888888", scaleSize = [34, 8.5], targetGroup = xyGroup) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    ctx.font = "bold 26px 'Segoe UI', monospace";
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.fillText(text, 128, 42);

    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
      }),
    );
    sprite.scale.set(scaleSize[0], scaleSize[1], 1);
    sprite.position.copy(pos);
    targetGroup.add(sprite);
    return sprite;
  }

  // Build Fixed VP Wall, Fixed XY Ground Hinge, and Hinged HP Floor
  function buildPlanes() {
    clearGroup(xyGroup);
    // Clear static children from vpGroup / hpPivotGroup except stroke sub-groups
    for (const grp of [vpGroup, hpPivotGroup]) {
      for (const child of [...grp.children]) {
        if (
          child !== vpStrokesGroup &&
          child !== vpPreviewGroup &&
          child !== hpStrokesGroup &&
          child !== hpPreviewGroup &&
          child !== hpShadowGroup
        ) {
          grp.remove(child);
          clearObjectResources(child);
        }
      }
    }

    const width = maxX - minX;
    const midX = (minX + maxX) / 2;

    const planeMatVP = new THREE.MeshBasicMaterial({
      color: 0x111111,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const planeMatHP = planeMatVP.clone();

    // VP Wall: Z = 0, Y in [0, heightSpan]
    const vpMesh = new THREE.Mesh(new THREE.PlaneGeometry(width, heightSpan), planeMatVP);
    vpMesh.position.set(midX, heightSpan / 2, 0);
    vpGroup.add(vpMesh);

    // HP Floor: Y = 0, Z in [0, depthSpan] (inside hpPivotGroup so it folds cleanly!)
    const hpMesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depthSpan), planeMatHP);
    hpMesh.rotation.x = -Math.PI / 2;
    hpMesh.position.set(midX, 0, depthSpan / 2);
    hpPivotGroup.add(hpMesh);

    // Subtle 20 mm grids
    const vpGridPts = [];
    const hpGridPts = [];
    for (let x = minX; x <= maxX; x += 20) {
      vpGridPts.push(x, 0, 0, x, heightSpan, 0);
      hpGridPts.push(x, 0, 0, x, 0, depthSpan);
    }
    for (let y = 0; y <= heightSpan; y += 20) {
      vpGridPts.push(minX, y, 0, maxX, y, 0);
    }
    for (let z = 0; z <= depthSpan; z += 20) {
      hpGridPts.push(minX, 0, z, maxX, 0, z);
    }

    const gridMat = new THREE.LineBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.65 });
    const vpGridGeo = new THREE.BufferGeometry();
    vpGridGeo.setAttribute("position", new THREE.Float32BufferAttribute(vpGridPts, 3));
    vpGroup.add(new THREE.LineSegments(vpGridGeo, gridMat));

    const hpGridGeo = new THREE.BufferGeometry();
    hpGridGeo.setAttribute("position", new THREE.Float32BufferAttribute(hpGridPts, 3));
    hpPivotGroup.add(new THREE.LineSegments(hpGridGeo, gridMat.clone()));

    // XY Hinge Line
    const xyGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(minX - 10, 0, 0),
      new THREE.Vector3(maxX + 10, 0, 0),
    ]);
    xyGroup.add(new THREE.Line(xyGeo, new THREE.LineBasicMaterial({ color: 0xf5b95d, linewidth: 2 })));

    makeTextSprite("VP (Vertical Plane)", new THREE.Vector3(minX + 45, heightSpan - 12, 0), "#888888", [44, 11], vpGroup);
    makeTextSprite("HP (Horizontal Plane)", new THREE.Vector3(minX + 48, 0, depthSpan - 12), "#888888", [44, 11], hpPivotGroup);
    makeTextSprite("X", new THREE.Vector3(minX - 14, 0, 0), "#f5b95d", [24, 6], xyGroup);
    makeTextSprite("Y", new THREE.Vector3(maxX + 14, 0, 0), "#f5b95d", [24, 6], xyGroup);
  }

  // =========================================================================
  // POLYHEDRON GEOMETRY BUILDER + ANALYTICAL SECTION SLICER
  // =========================================================================

  function polySides3D(solidType = "") {
    if (solidType.includes("tri") || solidType === "tetrahedron") return 3;
    if (solidType.includes("pent")) return 5;
    if (solidType.includes("hex")) return 6;
    if (solidType === "cylinder" || solidType === "cone") return 36;
    return 4;
  }

  function computeLocalBaseRing(solidType, edge, radius, baseAngleDeg) {
    const isCurved = solidType === "cylinder" || solidType === "cone";
    const sides = polySides3D(solidType);
    const R = isCurved ? radius : edge / (2 * Math.sin(Math.PI / sides));
    const phi0 = degToRad(baseAngleDeg || 0);
    const ring = [];
    for (let i = 0; i < sides; i++) {
      const a = phi0 + (2 * Math.PI * i) / sides;
      ring.push([R * Math.cos(a), -R * Math.sin(a)]); // [localX, localZ]
    }
    return ring;
  }

  function buildPolyhedronDataFromRing(ringXZ, height, isPyramid, offsetX = 0, offsetZ = 45, tiltOpt = null) {
    // ringXZ: array of [lx, lz] centered around local origin (0, 0)
    const n = ringXZ.length;
    let vertices = [];
    for (let i = 0; i < n; i++) vertices.push([ringXZ[i][0], 0, ringXZ[i][1]]);
    if (isPyramid) {
      vertices.push([0, height, 0]);
    } else {
      for (let i = 0; i < n; i++) vertices.push([ringXZ[i][0], height, ringXZ[i][1]]);
    }

    // Apply grounded tilt rotation if requested
    if (tiltOpt && Math.abs(tiltOpt.tiltRad) > 1e-4) {
      const xs = ringXZ.map((p) => p[0]);
      const xMin = Math.min(...xs);
      const xMax = Math.max(...xs);
      const delta = tiltOpt.tiltRad;
      const leanRight = tiltOpt.leanRight;
      const anchorLocalX = leanRight ? xMax : xMin;
      const sign = leanRight ? -1 : 1; // clockwise (-delta) tilts +Y toward +X; ccw (+delta) tilts +Y toward -X
      const theta = sign * delta;
      const c = Math.cos(theta);
      const s = Math.sin(theta);

      vertices = vertices.map(([lx, ly, lz]) => {
        const dx = lx - anchorLocalX;
        const rx = dx * c - ly * s;
        const ry = dx * s + ly * c;
        return [tiltOpt.pivotX + rx, Math.max(0, ry), offsetZ + lz];
      });
    } else {
      vertices = vertices.map(([lx, ly, lz]) => [offsetX + lx, ly, offsetZ + lz]);
    }

    // Build faces (outward normals)
    const faces = [];
    faces.push(Array.from({ length: n }, (_, i) => n - 1 - i)); // bottom cap
    if (!isPyramid) {
      faces.push(Array.from({ length: n }, (_, i) => n + i)); // top cap
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      faces.push(isPyramid ? [i, j, n] : [i, j, n + j, n + i]);
    }

    return { vertices, faces, isPyramid, n };
  }

  function polyhedronToThreeGroup(polyData, solidMat, edgeMat, drawAllEdges = true) {
    const group = new THREE.Group();
    const { vertices, faces } = polyData;

    const positions = [];
    for (const f of faces) {
      for (let i = 1; i < f.length - 1; i++) {
        const a = vertices[f[0]];
        const b = vertices[f[i]];
        const c = vertices[f[i + 1]];
        positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    group.add(new THREE.Mesh(geo, solidMat));

    if (edgeMat) {
      const eg = new THREE.EdgesGeometry(geo, drawAllEdges ? 15 : 28);
      group.add(new THREE.LineSegments(eg, edgeMat));
    }
    return group;
  }

  /**
   * Analytical half-space polyhedron slicer for Section of Solids & Developments.
   * Cut line passes through (cx, cutH) at angleDeg to HP (X-axis).
   */
  function buildSlicedThreeGroups(polyData, cx, cutH, cutAngleDeg, solidMat, edgeMat, capMat, capEdgeMat, ghostMat) {
    const rad = degToRad(cutAngleDeg);
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);

    // Signed distance: > 0 is upper removed half, <= 0 is lower retained half
    const signedDist = (v) => (v[1] - cutH) * cosA - (v[0] - cx) * sinA;

    const clipFaceList = (keepLower) => {
      const outFaces = [];
      const cutVerts = [];
      for (const f of polyData.faces) {
        const poly = f.map((id) => [...polyData.vertices[id]]);
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
              prev[2] + t * (cur[2] - prev[2]),
            ];
            clipped.push(hit);
            cutVerts.push(hit);
          }
          if (curIn) clipped.push(cur);
        }
        if (clipped.length >= 3) outFaces.push(clipped);
      }

      // Deduplicate & order cut cap polygon around centroid
      const uniq = [];
      for (const p of cutVerts) {
        if (!uniq.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < 0.1)) {
          uniq.push(p);
        }
      }
      if (uniq.length >= 3) {
        const cen = uniq.reduce((a, p) => [a[0] + p[0] / uniq.length, a[1] + p[1] / uniq.length, a[2] + p[2] / uniq.length], [0, 0, 0]);
        // Sort around cut-plane normal (-sinA, cosA, 0): tangent u=(cosA, sinA, 0), v=(0, 0, 1)
        uniq.sort((p, q) => {
          const ap = Math.atan2(p[2] - cen[2], (p[0] - cen[0]) * cosA + (p[1] - cen[1]) * sinA);
          const aq = Math.atan2(q[2] - cen[2], (q[0] - cen[0]) * cosA + (q[1] - cen[1]) * sinA);
          return ap - aq;
        });
      }
      return { outFaces, capPoly: uniq };
    };

    const facesToMesh = (faceList, mat, eMat) => {
      const g = new THREE.Group();
      const pos = [];
      for (const pts of faceList) {
        for (let i = 1; i < pts.length - 1; i++) {
          pos.push(pts[0][0], pts[0][1], pts[0][2], pts[i][0], pts[i][1], pts[i][2], pts[i + 1][0], pts[i + 1][1], pts[i + 1][2]);
        }
      }
      if (pos.length === 0) return g;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      g.add(new THREE.Mesh(geo, mat));
      if (eMat) {
        g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 16), eMat));
      }
      return g;
    };

    const lower = clipFaceList(true);
    const upper = clipFaceList(false);

    const lowerGroup = facesToMesh(lower.outFaces, solidMat, edgeMat);
    const upperGroup = facesToMesh(upper.outFaces, ghostMat, null);

    // Highlighted Cross-Section Cap Face
    const capGroup = new THREE.Group();
    if (lower.capPoly.length >= 3) {
      const capMeshGroup = facesToMesh([lower.capPoly], capMat, null);
      capGroup.add(capMeshGroup);

      const borderPts = lower.capPoly.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
      borderPts.push(borderPts[0].clone());
      capGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(borderPts), capEdgeMat));
    }

    return { lowerGroup, upperGroup, capGroup, capPoly: lower.capPoly };
  }

  // =========================================================================
  // QUESTION & STEP PLACEMENT EXTRACTION (1-to-1 Alignment with 2D Sheet)
  // =========================================================================

  function extractPlacement(question, solidType) {
    const fallback = { cx: -60, cy: -42.5, tiltPivotX: 15, leanRight: false, baseAngleDeg: 0 };
    if (!question) return fallback;

    const p = question.parameters || {};
    const sides = polySides3D(solidType);
    let baseAngleDeg = (p.restingOn || "").includes("edge") ? 180 / sides : 0;

    // Look for exact center (cx, cy) from Step 2 (or Step 1 for development)
    let cx = -60;
    let cy = -42.5;
    const baseStep = question.unit === "Development of Surfaces" ? question.steps?.[0] : question.steps?.[1];
    if (baseStep?.suggestedPolygon?.angle !== undefined) {
      baseAngleDeg = baseStep.suggestedPolygon.angle;
    }
    const exp = baseStep?.expectedGeometry || [];
    const circleG = exp.find((g) => g.type === "circle" && g.center);
    const polyG = exp.find((g) => g.type === "polygon" && g.center);
    if (circleG) {
      cx = circleG.center[0];
      cy = circleG.center[1];
    } else if (polyG) {
      cx = polyG.center[0];
      cy = polyG.center[1];
    } else {
      // Compute center from belowXY lines
      const pts = [];
      for (const g of exp) {
        if (g.type === "line" && g.from && g.to && (g.from[1] < 0 || g.to[1] < 0)) {
          pts.push(g.from, g.to);
        }
      }
      if (pts.length > 0) {
        const xs = pts.map((v) => v[0]);
        const ys = pts.map((v) => v[1]);
        cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      }
    }

    // Look for Step 5 tilted pivot & lean direction
    let tiltPivotX = 15;
    let leanRight = false;
    const step5Exp = question.steps?.[4]?.expectedGeometry || [];
    const groundedPts = [];
    const highPts = [];
    let axisFrom = null;
    let axisTo = null;
    for (const g of step5Exp) {
      if (g.type === "line" && g.from && g.to) {
        if (g.style === "axis") {
          axisFrom = g.from[1] <= g.to[1] ? g.from : g.to;
          axisTo = g.from[1] <= g.to[1] ? g.to : g.from;
        }
        if (Math.abs(g.from[1]) < 0.5) groundedPts.push(g.from[0]);
        if (Math.abs(g.to[1]) < 0.5) groundedPts.push(g.to[0]);
        if (g.from[1] > 15) highPts.push(g.from[0]);
        if (g.to[1] > 15) highPts.push(g.to[0]);
      }
    }
    if (groundedPts.length > 0) {
      tiltPivotX = groundedPts[0];
    }
    if (axisFrom && axisTo) {
      leanRight = axisTo[0] >= axisFrom[0];
    } else if (highPts.length > 0) {
      const avgHigh = highPts.reduce((s, v) => s + v, 0) / highPts.length;
      leanRight = avgHigh >= tiltPivotX;
    }

    return { cx, cy, tiltPivotX, leanRight, baseAngleDeg };
  }

  // Build subtle 3D projection rays from 3D vertices to VP (Z=0) and HP (Y=0)
  function addProjectionRays(points3D, includeVertical = true, includeDepth = true) {
    if (!showRays || !points3D || points3D.length === 0) return;
    const pts = [];
    for (const [x, y, z] of points3D) {
      if (includeVertical && y > 0.5) {
        pts.push(x, y, z, x, 0.2, z); // Drop down to HP
        pts.push(x, 0.2, z, x, 0.2, 0); // Trace across HP to XY
      }
      if (includeDepth && z > 0.5 && y > 0.5) {
        pts.push(x, y, z, x, y, 0.2); // Project back to VP
        pts.push(x, y, 0.2, x, 0, 0.2); // Drop down VP to XY
      }
    }
    if (pts.length === 0) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const mat = new THREE.LineDashedMaterial({
      color: 0x555555,
      dashSize: 3,
      gapSize: 2.5,
      transparent: true,
      opacity: 0.75,
    });
    const ls = new THREE.LineSegments(geo, mat);
    ls.computeLineDistances();
    raysGroup.add(ls);
  }

  // Build 3D Unfolded Development Sheet on the right (X >= 15)
  function build3DDevelopmentSheet(solidType, edge, radius, height, cutAngleDeg, cutH, cx) {
    const group = new THREE.Group();
    const isPyramid = solidType.includes("Pyramid") || solidType === "cone" || solidType === "tetrahedron";
    const isCurved = solidType === "cylinder" || solidType === "cone";
    const sides = polySides3D(solidType);

    if (!isPyramid) {
      const numSegs = isCurved ? 24 : sides;
      const ring = computeLocalBaseRing(solidType, edge, radius, isCurved ? 0 : 180 / sides);
      const stepW = isCurved ? (Math.PI * 2 * radius) / numSegs : edge;
      const startX = 15;
      const tanA = Math.tan(degToRad(cutAngleDeg));

      const positions = [];
      const borderPts = [new THREE.Vector3(startX, 0, 0.4)];
      const creasePts = [];

      for (let i = 0; i < numSegs; i++) {
        const x0 = startX + i * stepW;
        const x1 = startX + (i + 1) * stepW;
        const v0x = cx + ring[i % ring.length][0];
        const v1x = cx + ring[(i + 1) % ring.length][0];
        const h0 = Math.max(2, Math.min(height, cutH + (v0x - cx) * tanA));
        const h1 = Math.max(2, Math.min(height, cutH + (v1x - cx) * tanA));

        positions.push(x0, 0, 0.4, x1, 0, 0.4, x1, h1, 0.4);
        positions.push(x0, 0, 0.4, x1, h1, 0.4, x0, h0, 0.4);

        if (i === 0) borderPts.push(new THREE.Vector3(x0, h0, 0.4));
        borderPts.push(new THREE.Vector3(x1, h1, 0.4));
        if (!isCurved && i > 0) creasePts.push(x0, 0, 0.45, x0, h0, 0.45);
      }
      borderPts.push(new THREE.Vector3(startX + numSegs * stepW, 0, 0.4), new THREE.Vector3(startX, 0, 0.4));

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geo.computeVertexNormals();
      group.add(
        new THREE.Mesh(
          geo,
          new THREE.MeshBasicMaterial({ color: 0xf5b95d, transparent: true, opacity: 0.16, side: THREE.DoubleSide }),
        ),
      );
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(borderPts), new THREE.LineBasicMaterial({ color: 0xf5b95d, linewidth: 2 })));
      if (creasePts.length > 0) {
        const cg = new THREE.BufferGeometry();
        cg.setAttribute("position", new THREE.Float32BufferAttribute(creasePts, 3));
        group.add(new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: 0xaa8040 })));
      }
    } else {
      // Radial Line sheet
      const R = isCurved ? radius : edge / (2 * Math.sin(Math.PI / sides));
      const L = Math.hypot(R, height);
      const numSegs = isCurved ? 24 : sides;
      const sectorRad = isCurved
        ? (R / L) * Math.PI * 2
        : 2 * Math.asin(Math.min(0.99, edge / (2 * L))) * numSegs;
      const startA = Math.PI * 1.5 - sectorRad / 2;
      const apex = [75, height + 12, 0.4];

      const positions = [];
      const borderPts = [];
      const cutBorder = [];
      const ring = computeLocalBaseRing(solidType, edge, radius, 0);
      const tanA = Math.tan(degToRad(cutAngleDeg));

      for (let i = 0; i <= numSegs; i++) {
        const a = startA + (sectorRad * i) / numSegs;
        const bx = apex[0] + L * Math.cos(a);
        const by = apex[1] + L * Math.sin(a);
        borderPts.push(new THREE.Vector3(bx, by, 0.4));

        const vx = cx + ring[i % ring.length][0];
        const denom = height - (cx - vx) * tanA;
        let t = Math.abs(denom) > 1e-3 ? (cutH + (vx - cx) * tanA) / denom : 0.5;
        t = Math.max(0.05, Math.min(0.98, t));
        const rCut = L * (1 - t);
        cutBorder.push(new THREE.Vector3(apex[0] + rCut * Math.cos(a), apex[1] + rCut * Math.sin(a), 0.4));

        if (i > 0) {
          const p0 = borderPts[i - 1];
          const p1 = borderPts[i];
          const c0 = cutBorder[i - 1];
          const c1 = cutBorder[i];
          positions.push(p0.x, p0.y, 0.4, p1.x, p1.y, 0.4, c1.x, c1.y, 0.4);
          positions.push(p0.x, p0.y, 0.4, c1.x, c1.y, 0.4, c0.x, c0.y, 0.4);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      group.add(
        new THREE.Mesh(
          geo,
          new THREE.MeshBasicMaterial({ color: 0xf5b95d, transparent: true, opacity: 0.16, side: THREE.DoubleSide }),
        ),
      );
      const outline = [cutBorder[0], ...borderPts, cutBorder[cutBorder.length - 1], ...cutBorder.slice().reverse()];
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(outline), new THREE.LineBasicMaterial({ color: 0xf5b95d })));
    }
    return group;
  }

  // =========================================================================
  // STAGE UPDATER (Guided Practice & Live Sync Mode)
  // =========================================================================

  function updateStage(question, stepIndex, drawnElements = []) {
    lastQuestion = question;
    lastStepIndex = stepIndex;
    lastDrawnElements = drawnElements;

    clearGroup(stageGroup);
    clearGroup(raysGroup);
    clearGroup(hpShadowGroup);
    clearGroup(reconstructedGroup);

    updateStrokes(drawnElements);

    // If user switched Sync mode to "From 2D" OR Free Practice (no question)
    if (syncMode === "draft" || !question) {
      updateFrom2DReconstruction(drawnElements, !question);
      applyFoldVisibility();
      dirty = true;
      return;
    }

    const p = question.parameters || {};
    const solidType = p.solid || "squarePrism";
    const baseEdge = p.baseEdge || p.diameter || 30;
    const isCube = solidType === "cube";
    const height = isCube ? baseEdge : (p.height || 60);
    const radius = p.radius || baseEdge / 2;
    const alpha = p.alpha ?? 45;
    const isPyramid = solidType.includes("Pyramid") || solidType === "cone" || solidType === "tetrahedron";
    const isCurved = solidType === "cylinder" || solidType === "cone";

    const currentStep = question.steps?.[stepIndex];
    const stepNum = currentStep?.stepNumber || stepIndex + 1;
    const place = extractPlacement(question, solidType);
    const centerZ = -place.cy;

    const solidMat = new THREE.MeshStandardMaterial({
      color: 0xd4d4d4,
      metalness: 0.15,
      roughness: 0.35,
      transparent: true,
      opacity: 0.86,
      side: THREE.DoubleSide,
    });
    const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
    const ghostSolidMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const capMat = new THREE.MeshBasicMaterial({
      color: 0xf5b95d,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
    });
    const capEdgeMat = new THREE.LineBasicMaterial({ color: 0xff5370, linewidth: 2.5 });
    const cutPlaneMat = new THREE.MeshStandardMaterial({
      color: 0xff5370,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const ringXZ = computeLocalBaseRing(solidType, baseEdge, radius, place.baseAngleDeg);
    const basePtsWorld = ringXZ.map(([lx, lz]) => [place.cx + lx, 0.25, centerZ + lz]);

    // Footprint helper on HP
    const addHPFootprint = (pts3d, colorHex = 0xffffff, fillOpacity = 0.14) => {
      const shape = new THREE.Shape();
      pts3d.forEach((pt, idx) => {
        if (idx === 0) shape.moveTo(pt[0], -pt[2]);
        else shape.lineTo(pt[0], -pt[2]);
      });
      shape.closePath();
      const sGeo = new THREE.ShapeGeometry(shape);
      const mesh = new THREE.Mesh(
        sGeo,
        new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: fillOpacity, side: THREE.DoubleSide }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.18;
      hpShadowGroup.add(mesh);

      const linePts = pts3d.map((pt) => new THREE.Vector3(pt[0], 0.25, pt[2]));
      linePts.push(linePts[0].clone());
      hpShadowGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(linePts), new THREE.LineBasicMaterial({ color: colorHex })));
    };

    // Development Unit starts straight with orthographic views on Step 1
    if (question.unit === "Development of Surfaces") {
      const polyData = buildPolyhedronDataFromRing(ringXZ, height, isPyramid, place.cx, centerZ, null);
      const cutAngle = p.cuttingAngle || 45;
      const cutHeight = p.cutHeight ?? height / 2;

      if (stepNum === 1) {
        stageGroup.add(polyhedronToThreeGroup(polyData, solidMat, edgeMat, !isCurved));
        addHPFootprint(basePtsWorld);
        addProjectionRays(polyData.vertices.filter((_, idx) => !isCurved || idx % 6 === 0));
        updateSpatialDescription(
          "Stage 1: Upright Solid & Simple Views",
          `The ${question.title.split("—")[0].trim()} stands upright on HP at X = ${place.cx.toFixed(0)} mm, projecting directly onto VP and HP.`,
        );
      } else if (stepNum <= 4) {
        const sliced = buildSlicedThreeGroups(polyData, place.cx, cutHeight, cutAngle, solidMat, edgeMat, capMat, capEdgeMat, ghostSolidMat);
        stageGroup.add(sliced.lowerGroup, sliced.upperGroup, sliced.capGroup);
        stageGroup.add(buildCuttingPlaneQuad(cutAngle, cutHeight, place.cx, centerZ, radius * 2.4, cutPlaneMat));
        if (stepNum >= 3) {
          stageGroup.add(build3DDevelopmentSheet(solidType, baseEdge, radius, height, cutAngle, cutHeight, place.cx));
        }
        addProjectionRays(sliced.capPoly.filter((_, idx) => !isCurved || idx % 6 === 0));
        updateSpatialDescription(
          stepNum === 2 ? `Stage 2: Sliced at ${cutAngle}°` : `Stage ${stepNum}: Cutting Plane & Baseline`,
          `Section plane at ${cutAngle}° slices at Y = ${cutHeight.toFixed(1)} mm. True vertical/slant edge lengths project across to the unfolded stretch-out.`,
        );
      } else {
        const sliced = buildSlicedThreeGroups(polyData, place.cx, cutHeight, cutAngle, solidMat, edgeMat, capMat, capEdgeMat, ghostSolidMat);
        stageGroup.add(sliced.lowerGroup, sliced.capGroup);
        stageGroup.add(build3DDevelopmentSheet(solidType, baseEdge, radius, height, cutAngle, cutHeight, place.cx));
        updateSpatialDescription(
          "Stage 5: Complete Lateral Development",
          "The truncated 3D solid unrolls directly onto the flat pattern on the right, preserving every true edge & arc length.",
        );
      }
      applyFoldVisibility();
      dirty = true;
      return;
    }

    // Projection of Solids & Section of Solids Stages 1..6
    if (stepNum === 1) {
      updateSpatialDescription(
        "Stage 1: Dihedral Planes (VP / HP)",
        "The XY line acts as the 90° hinge between VP (vertical wall) and HP (horizontal floor). Drag the Unfold slider below to fold HP flat!",
      );
    } else if (stepNum === 2) {
      addHPFootprint(basePtsWorld, 0xffffff, 0.22);
      const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(place.cx, 0, centerZ), 26, 0xffffff, 6, 4);
      stageGroup.add(arrow);
      updateSpatialDescription(
        "Stage 2: Base Footprint on HP",
        `Your Top View lies physically flat on the Horizontal Plane (HP) centered at X = ${place.cx.toFixed(0)} mm, Z = ${centerZ.toFixed(0)} mm.`,
      );
    } else if (stepNum === 3) {
      if (question.unit === "Section of Solids") {
        const polyData = buildPolyhedronDataFromRing(ringXZ, height, isPyramid, place.cx, centerZ, null);
        stageGroup.add(polyhedronToThreeGroup(polyData, solidMat, edgeMat, !isCurved));
        addHPFootprint(basePtsWorld);
        addProjectionRays(polyData.vertices.filter((_, idx) => !isCurved || idx % 6 === 0));
        updateSpatialDescription(
          "Stage 3: Full Elevation Above HP",
          `The solid stands upright (${height} mm tall) over your drafted base, projecting rays straight back onto your VP elevation.`,
        );
      } else {
        addHPFootprint(basePtsWorld, 0xffffff, 0.16);
        addProjectionRays(basePtsWorld.filter((_, idx) => !isCurved || idx % 6 === 0), true, false);
        // Also rise vertical construction rays in VP
        const vpPts = [];
        for (const [bx] of basePtsWorld.filter((_, idx) => !isCurved || idx % 6 === 0)) {
          vpPts.push(bx, 0, 0.2, bx, height, 0.2);
        }
        const vGeo = new THREE.BufferGeometry();
        vGeo.setAttribute("position", new THREE.Float32BufferAttribute(vpPts, 3));
        const vMat = new THREE.LineDashedMaterial({ color: 0x666666, dashSize: 3, gapSize: 2.5 });
        const ls = new THREE.LineSegments(vGeo, vMat);
        ls.computeLineDistances();
        raysGroup.add(ls);
        updateSpatialDescription(
          "Stage 3: Orthographic Projectors",
          "Rays travel from each corner on the HP floor forward to XY and straight upward into the VP wall.",
        );
      }
    } else if (stepNum === 4) {
      const polyData = buildPolyhedronDataFromRing(ringXZ, height, isPyramid, place.cx, centerZ, null);
      if (question.unit === "Section of Solids") {
        const cutAngle = p.cuttingAngle || 45;
        const cutHeight = p.cutHeight ?? height / 2;
        const sliced = buildSlicedThreeGroups(polyData, place.cx, cutHeight, cutAngle, solidMat, edgeMat, capMat, capEdgeMat, ghostSolidMat);
        stageGroup.add(sliced.lowerGroup, sliced.upperGroup, sliced.capGroup);
        stageGroup.add(buildCuttingPlaneQuad(cutAngle, cutHeight, place.cx, centerZ, radius * 2.5, cutPlaneMat));
        updateSpatialDescription(
          `Stage 4: Section Plane Slicing at ${cutAngle}°`,
          `An Auxiliary Inclined Plane (AIP) cuts the solid at Y = ${cutHeight.toFixed(1)} mm. Notice the exposed cross-section interior.`,
        );
      } else {
        stageGroup.add(polyhedronToThreeGroup(polyData, solidMat, edgeMat, !isCurved));
        addHPFootprint(basePtsWorld);
        const axisGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(place.cx, 0, centerZ),
          new THREE.Vector3(place.cx, height, centerZ),
        ]);
        const axisMat = new THREE.LineDashedMaterial({ color: 0xf5b95d, dashSize: 6, gapSize: 3, depthTest: false });
        const al = new THREE.Line(axisGeo, axisMat);
        al.computeLineDistances();
        stageGroup.add(al);
        addProjectionRays(polyData.vertices.filter((_, idx) => !isCurved || idx % 6 === 0));
        updateSpatialDescription(
          "Stage 4: Upright Solid Over Top View",
          `Notice how the upright ${height} mm solid sits directly over your HP base and projects directly onto your VP Front View.`,
        );
      }
    } else if (stepNum === 5) {
      if (question.unit === "Section of Solids") {
        const cutAngle = p.cuttingAngle || 45;
        const cutHeight = p.cutHeight ?? height / 2;
        const polyData = buildPolyhedronDataFromRing(ringXZ, height, isPyramid, place.cx, centerZ, null);
        const sliced = buildSlicedThreeGroups(polyData, place.cx, cutHeight, cutAngle, solidMat, edgeMat, capMat, capEdgeMat, ghostSolidMat);
        stageGroup.add(sliced.lowerGroup, sliced.upperGroup, sliced.capGroup);
        stageGroup.add(buildCuttingPlaneQuad(cutAngle, cutHeight, place.cx, centerZ, radius * 2.5, cutPlaneMat));
        addHPFootprint(sliced.capPoly.length >= 3 ? sliced.capPoly : basePtsWorld, 0xf5b95d, 0.28);
        addProjectionRays(sliced.capPoly.filter((_, idx) => !isCurved || idx % 6 === 0));
        updateSpatialDescription(
          "Stage 5: Sectional Top View Projection",
          "Rays drop straight down from the sliced cross-section perimeter onto HP, creating the hatched Sectional Top View.",
        );
      } else {
        const deltaRad = degToRad(90 - alpha);
        const polyData = buildPolyhedronDataFromRing(ringXZ, height, isPyramid, place.cx, centerZ, {
          tiltRad: deltaRad,
          pivotX: place.tiltPivotX,
          leanRight: place.leanRight,
        });
        stageGroup.add(polyhedronToThreeGroup(polyData, solidMat, edgeMat, !isCurved));
        addProjectionRays(polyData.vertices.filter((_, idx) => !isCurved || idx % 6 === 0));
        updateSpatialDescription(
          `Stage 5: Solid Tilted at ${alpha}° to HP`,
          `Pivoted on its grounded resting edge/corner at X = ${place.tiltPivotX.toFixed(0)} mm so the axis leans at ${alpha}° above HP.`,
        );
      }
    } else {
      if (question.unit === "Section of Solids") {
        const cutAngle = p.cuttingAngle || 45;
        const cutHeight = p.cutHeight ?? height / 2;
        const polyData = buildPolyhedronDataFromRing(ringXZ, height, isPyramid, place.cx, centerZ, null);
        const sliced = buildSlicedThreeGroups(polyData, place.cx, cutHeight, cutAngle, solidMat, edgeMat, capMat, capEdgeMat, ghostSolidMat);
        stageGroup.add(sliced.lowerGroup, sliced.capGroup);
        stageGroup.add(buildCuttingPlaneQuad(cutAngle, cutHeight, place.cx, centerZ, radius * 2.5, cutPlaneMat));
        addHPFootprint(sliced.capPoly.length >= 3 ? sliced.capPoly : basePtsWorld, 0xf5b95d, 0.28);
        addProjectionRays(sliced.capPoly.filter((_, idx) => !isCurved || idx % 6 === 0));
        updateSpatialDescription(
          "Stage 6: True Shape of Section",
          "Viewing strictly perpendicular to the highlighted section face reveals the exact True Shape (un-foreshortened).",
        );
      } else {
        const deltaRad = degToRad(90 - alpha);
        const polyData = buildPolyhedronDataFromRing(ringXZ, height, isPyramid, place.cx, centerZ, {
          tiltRad: deltaRad,
          pivotX: place.tiltPivotX,
          leanRight: place.leanRight,
        });
        stageGroup.add(polyhedronToThreeGroup(polyData, solidMat, edgeMat, !isCurved));
        addProjectionRays(polyData.vertices.filter((_, idx) => !isCurved || idx % 6 === 0));
        updateSpatialDescription(
          "Stage 6: Final Top View Shadow on HP",
          "Looking straight down from above (TV camera), rays from the tilted 3D edges create the foreshortened Top View & dashed hidden bottom edges.",
        );
      }
    }

    applyFoldVisibility();
    dirty = true;
  }

  function buildCuttingPlaneQuad(angleDeg, cutHeight, cx, cz, sizeSpan, cutMat) {
    const g = new THREE.Group();
    const w = Math.max(70, sizeSpan * 1.35);
    const d = Math.max(75, sizeSpan * 1.45);
    const geo = new THREE.PlaneGeometry(w, d);
    const planeGroup = new THREE.Group();
    planeGroup.position.set(cx, cutHeight, cz);
    planeGroup.rotation.z = degToRad(angleDeg);
    const pMesh = new THREE.Mesh(geo, cutMat);
    pMesh.rotation.x = -Math.PI / 2;
    planeGroup.add(pMesh);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xff5370, linewidth: 2 }));
    edges.rotation.x = -Math.PI / 2;
    planeGroup.add(edges);
    g.add(planeGroup);
    return g;
  }

  // =========================================================================
  // LIVE 2D -> 3D RECONSTRUCTION ENGINE (From Student's Drafted Lines)
  // =========================================================================

  function updateFrom2DReconstruction(elements, isFreePractice = false) {
    const recon = reconstructFrom2DStrokes(elements);
    if (!recon.hasBase) {
      updateSpatialDescription(
        isFreePractice ? "Free Practice: Live 2D → 3D" : "From My 2D Strokes",
        "Draw a Polygon, Circle, or closed base shape below XY (in HP) to place it in 3D space, then draw its Front View height above XY to extrude!",
      );
      return;
    }

    const basePtsWorld = recon.base.points.map((pt) => [pt[0], 0.22, -pt[1]]);
    const centerZ = -recon.base.cy;

    // Show reconstructed base footprint on HP
    const linePts = basePtsWorld.map((pt) => new THREE.Vector3(pt[0], 0.25, pt[2]));
    linePts.push(linePts[0].clone());
    hpShadowGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(linePts), new THREE.LineBasicMaterial({ color: 0xffffff })));

    if (!recon.hasSolid) {
      addProjectionRays(basePtsWorld, true, false);
      updateSpatialDescription(
        "Live Base Detected on HP",
        `Detected ${recon.base.kind === "circle" ? "circle" : `${recon.base.sides}-gon`} base on HP (${recon.base.cx.toFixed(0)}, ${recon.base.cy.toFixed(0)}). Draw Front View outlines above XY to extrude in 3D!`,
      );
      return;
    }

    const localRing = recon.base.points.map((pt) => [pt[0] - recon.base.cx, -(pt[1] - recon.base.cy)]);
    const polyData = buildPolyhedronDataFromRing(localRing, recon.height, recon.isPyramid, recon.base.cx, centerZ, null);

    const solidMat = new THREE.MeshStandardMaterial({
      color: 0xd4d4d4,
      metalness: 0.15,
      roughness: 0.35,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });

    if (recon.cutPlane) {
      const sliced = buildSlicedThreeGroups(
        polyData,
        recon.base.cx,
        recon.cutPlane.cutHeight,
        recon.cutPlane.angleDeg,
        solidMat,
        edgeMat,
        new THREE.MeshBasicMaterial({ color: 0xf5b95d, transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
        new THREE.LineBasicMaterial({ color: 0xff5370, linewidth: 2 }),
        new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }),
      );
      reconstructedGroup.add(sliced.lowerGroup, sliced.upperGroup, sliced.capGroup);
    } else {
      reconstructedGroup.add(polyhedronToThreeGroup(polyData, solidMat, edgeMat, recon.base.kind !== "circle"));
    }

    addProjectionRays(polyData.vertices.filter((_, i) => recon.base.kind !== "circle" || i % 4 === 0));
    const shapeName = recon.base.kind === "circle"
      ? (recon.isPyramid ? "Cone" : "Cylinder")
      : `${recon.base.sides}-Sided ${recon.isPyramid ? "Pyramid" : "Prism"}`;
    updateSpatialDescription(
      `Live Reconstructed ${shapeName}`,
      `Auto-built from your drafted HP footprint & ${recon.height.toFixed(1)} mm VP elevation${recon.cutPlane ? ` (sliced at ${Math.abs(recon.cutPlane.angleDeg).toFixed(0)}°)` : ""}.`,
    );
  }

  // =========================================================================
  // 2D STROKES MIRRORED ON HINGED HP & FIXED VP (WITH DASHES & LABELS)
  // =========================================================================

  function makeLineMaterial(grade) {
    const col = gradeColor(grade);
    if (grade === "Hidden") {
      return new THREE.LineDashedMaterial({ color: col, dashSize: 3.5, gapSize: 2.2 });
    }
    if (grade === "Axis") {
      return new THREE.LineDashedMaterial({ color: col, dashSize: 7, gapSize: 2.5 });
    }
    if (grade === "Cutting Plane") {
      return new THREE.LineDashedMaterial({ color: col, dashSize: 9, gapSize: 2.5 });
    }
    return new THREE.LineBasicMaterial({ color: col, linewidth: grade === "HB" ? 2.5 : 1.2 });
  }

  function addStrokeLine(p3a, p3b, grade, targetGroup) {
    const geo = new THREE.BufferGeometry().setFromPoints([p3a, p3b]);
    const mat = makeLineMaterial(grade);
    const line = new THREE.Line(geo, mat);
    if (mat.isLineDashedMaterial) line.computeLineDistances();
    targetGroup.add(line);
  }

  function updateStrokes(drawnElements = []) {
    lastDrawnElements = drawnElements;
    clearGroup(vpStrokesGroup);
    clearGroup(hpStrokesGroup);

    if (!drawnElements || drawnElements.length === 0) {
      if (syncMode === "draft" || !lastQuestion) {
        clearGroup(raysGroup);
        clearGroup(hpShadowGroup);
        clearGroup(reconstructedGroup);
        updateFrom2DReconstruction(drawnElements, !lastQuestion);
      }
      dirty = true;
      return;
    }

    for (const el of drawnElements) {
      if (el.type === "line" || el.type === "dimension") {
        const grade = el.type === "dimension" ? "Axis" : el.grade;
        if (el.y1 <= 0 && el.y2 <= 0) {
          addStrokeLine(new THREE.Vector3(el.x1, 0.3, -el.y1), new THREE.Vector3(el.x2, 0.3, -el.y2), grade, hpStrokesGroup);
        } else if (el.y1 >= 0 && el.y2 >= 0) {
          addStrokeLine(new THREE.Vector3(el.x1, el.y1, 0.3), new THREE.Vector3(el.x2, el.y2, 0.3), grade, vpStrokesGroup);
        } else {
          // Crosses XY -> split at Y=0 so HP segment hinges with hpPivotGroup and VP segment stays on VP!
          const t = (0 - el.y1) / (el.y2 - el.y1 || 1);
          const xCross = el.x1 + t * (el.x2 - el.x1);
          if (el.y1 < 0) {
            addStrokeLine(new THREE.Vector3(el.x1, 0.3, -el.y1), new THREE.Vector3(xCross, 0.3, 0), grade, hpStrokesGroup);
            addStrokeLine(new THREE.Vector3(xCross, 0, 0.3), new THREE.Vector3(el.x2, el.y2, 0.3), grade, vpStrokesGroup);
          } else {
            addStrokeLine(new THREE.Vector3(el.x1, el.y1, 0.3), new THREE.Vector3(xCross, 0, 0.3), grade, vpStrokesGroup);
            addStrokeLine(new THREE.Vector3(xCross, 0.3, 0), new THREE.Vector3(el.x2, 0.3, -el.y2), grade, hpStrokesGroup);
          }
        }
        if (el.type === "dimension" && el.value) {
          const mx = (el.x1 + el.x2) / 2;
          const my = (el.y1 + el.y2) / 2;
          const onHP = my <= 0;
          makeTextSprite(
            `${el.value}mm`,
            onHP ? new THREE.Vector3(mx, 2.5, -my) : new THREE.Vector3(mx, my + 2.5, 2),
            "#f5b95d",
            [18, 4.5],
            onHP ? hpStrokesGroup : vpStrokesGroup,
          );
        }
      } else if (el.type === "polygon" && el.points) {
        const isHP = el.cy < 0;
        const pts = el.points.map((pt) => (isHP ? new THREE.Vector3(pt[0], 0.3, -pt[1]) : new THREE.Vector3(pt[0], pt[1], 0.3)));
        if (pts.length > 0) pts.push(pts[0].clone());
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = makeLineMaterial(el.grade);
        const line = new THREE.Line(geo, mat);
        if (mat.isLineDashedMaterial) line.computeLineDistances();
        (isHP ? hpStrokesGroup : vpStrokesGroup).add(line);
      } else if (el.type === "circle") {
        const isHP = el.cy < 0;
        const circlePts = [];
        for (let i = 0; i <= 64; i++) {
          const theta = (i / 64) * Math.PI * 2;
          const px = el.cx + el.radius * Math.cos(theta);
          const py = el.cy + el.radius * Math.sin(theta);
          circlePts.push(isHP ? new THREE.Vector3(px, 0.3, -py) : new THREE.Vector3(px, py, 0.3));
        }
        const geo = new THREE.BufferGeometry().setFromPoints(circlePts);
        const mat = makeLineMaterial(el.grade);
        const line = new THREE.Line(geo, mat);
        if (mat.isLineDashedMaterial) line.computeLineDistances();
        (isHP ? hpStrokesGroup : vpStrokesGroup).add(line);
      } else if (el.type === "text" && el.text) {
        const isHP = el.y <= 0;
        makeTextSprite(
          el.text,
          isHP ? new THREE.Vector3(el.x, 3, -el.y) : new THREE.Vector3(el.x, el.y + 3, 2),
          "#ffffff",
          [16, 4],
          isHP ? hpStrokesGroup : vpStrokesGroup,
        );
      }
    }

    if (syncMode === "draft" || !lastQuestion) {
      clearGroup(raysGroup);
      clearGroup(hpShadowGroup);
      clearGroup(reconstructedGroup);
      updateFrom2DReconstruction(drawnElements, !lastQuestion);
    }

    dirty = true;
  }

  // =========================================================================
  // 60 FPS REAL-TIME CURSOR CROSSHAIR, LOCUS RAY & DRAG PREVIEW SYNC
  // =========================================================================

  function updateCursorAndPreview(payload) {
    clearGroup(vpPreviewGroup);
    clearGroup(hpPreviewGroup);

    const teleEl = document.getElementById("p3dTelemetry");
    if (!payload || !payload.worldPos) {
      if (teleEl) teleEl.hidden = true;
      dirty = true;
      return;
    }

    const { worldPos, isDrawing, dragStart, tool, activeSnap } = payload;
    const onHP = worldPos.y <= 0;

    if (teleEl) {
      teleEl.hidden = false;
      teleEl.textContent = onHP
        ? `HP Floor · X ${worldPos.x.toFixed(1)} · Z ${(-worldPos.y).toFixed(1)} mm${activeSnap ? ` [${activeSnap.type}]` : ""}`
        : `VP Wall · X ${worldPos.x.toFixed(1)} · Y ${worldPos.y.toFixed(1)} mm${activeSnap ? ` [${activeSnap.type}]` : ""}`;
    }

    // 1. Crosshair reticle + subtle 3D locus ray showing where point shoots into 3D space
    const crossSz = 3.5;
    const reticleMat = new THREE.LineBasicMaterial({ color: activeSnap ? 0xf5b95d : 0xffffff });
    if (onHP) {
      const z = -worldPos.y;
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(worldPos.x - crossSz, 0.5, z),
        new THREE.Vector3(worldPos.x + crossSz, 0.5, z),
        new THREE.Vector3(worldPos.x, 0.5, z - crossSz),
        new THREE.Vector3(worldPos.x, 0.5, z + crossSz),
      ]);
      hpPreviewGroup.add(new THREE.LineSegments(g, reticleMat));
      if (foldDeg < 15) {
        // Locus ray shooting up from HP into 3D space
        const rGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(worldPos.x, 0.5, z),
          new THREE.Vector3(worldPos.x, 65, z),
        ]);
        const rLine = new THREE.Line(rGeo, new THREE.LineDashedMaterial({ color: 0x666666, dashSize: 2.5, gapSize: 2.5 }));
        rLine.computeLineDistances();
        hpPreviewGroup.add(rLine);
      }
    } else {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(worldPos.x - crossSz, worldPos.y, 0.5),
        new THREE.Vector3(worldPos.x + crossSz, worldPos.y, 0.5),
        new THREE.Vector3(worldPos.x, worldPos.y - crossSz, 0.5),
        new THREE.Vector3(worldPos.x, worldPos.y + crossSz, 0.5),
      ]);
      vpPreviewGroup.add(new THREE.LineSegments(g, reticleMat));
      if (foldDeg < 15) {
        const rGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(worldPos.x, worldPos.y, 0.5),
          new THREE.Vector3(worldPos.x, worldPos.y, 70),
        ]);
        const rLine = new THREE.Line(rGeo, new THREE.LineDashedMaterial({ color: 0x666666, dashSize: 2.5, gapSize: 2.5 }));
        rLine.computeLineDistances();
        vpPreviewGroup.add(rLine);
      }
    }

    // 2. Live rubber-band stroke while dragging
    if (isDrawing && dragStart) {
      const pMat = new THREE.LineBasicMaterial({ color: 0xf5b95d, linewidth: 2 });
      if (tool === "circle") {
        const r = Math.hypot(worldPos.x - dragStart.x, worldPos.y - dragStart.y);
        const startOnHP = dragStart.y <= 0;
        const pts = [];
        for (let i = 0; i <= 48; i++) {
          const a = (2 * Math.PI * i) / 48;
          const px = dragStart.x + r * Math.cos(a);
          const py = dragStart.y + r * Math.sin(a);
          pts.push(startOnHP ? new THREE.Vector3(px, 0.5, -py) : new THREE.Vector3(px, py, 0.5));
        }
        (startOnHP ? hpPreviewGroup : vpPreviewGroup).add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), pMat));
      } else {
        if (dragStart.y <= 0 && worldPos.y <= 0) {
          hpPreviewGroup.add(
            new THREE.Line(
              new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(dragStart.x, 0.5, -dragStart.y),
                new THREE.Vector3(worldPos.x, 0.5, -worldPos.y),
              ]),
              pMat,
            ),
          );
        } else {
          vpPreviewGroup.add(
            new THREE.Line(
              new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(dragStart.x, Math.max(0, dragStart.y), 0.5),
                new THREE.Vector3(worldPos.x, Math.max(0, worldPos.y), 0.5),
              ]),
              pMat,
            ),
          );
        }
      }
    }

    dirty = true;
  }

  // =========================================================================
  // DIHEDRAL UNFOLDING & SYNC CONTROLS
  // =========================================================================

  function applyFoldVisibility() {
    hpPivotGroup.rotation.x = degToRad(foldDeg);
    const showSolids = foldDeg < 82;
    stageGroup.visible = showSolids;
    raysGroup.visible = showRays && foldDeg < 25;
    reconstructedGroup.visible = showSolids;
    if (showSolids) {
      const fade = foldDeg > 5 ? Math.max(0.08, 1 - foldDeg / 85) : 1;
      for (const grp of [stageGroup, reconstructedGroup]) {
        grp.traverse((obj) => {
          if (obj.material) {
            if (obj.userData.baseOpacity === undefined) {
              obj.userData.baseOpacity = obj.material.opacity ?? 1;
            }
            if (fade < 1) {
              obj.material.transparent = true;
              obj.material.opacity = obj.userData.baseOpacity * fade;
            } else {
              obj.material.opacity = obj.userData.baseOpacity;
            }
          }
        });
      }
    }
  }

  function setFoldAngle(deg, immediate = false) {
    targetFoldDeg = Math.max(0, Math.min(90, Number(deg) || 0));
    if (immediate) {
      foldDeg = targetFoldDeg;
      applyFoldVisibility();
    }
    dirty = true;
  }

  function setShowRays(enabled) {
    showRays = Boolean(enabled);
    updateStage(lastQuestion, lastStepIndex, lastDrawnElements);
  }

  function setSyncMode(mode) {
    syncMode = mode === "draft" ? "draft" : "stage";
    updateStage(lastQuestion, lastStepIndex, lastDrawnElements);
  }

  function updateSpatialDescription(title, desc) {
    const titleEl = document.getElementById("stepSpatialTag");
    const descEl = document.getElementById("stepSpatialDesc");
    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = desc;
  }

  // Camera presets
  function view(name = "iso") {
    currentPreset = name;
    controls.target.copy(center);

    const directions = {
      iso: [0.95, 0.85, 1.0],
      front: [0, 0, 1], // elevation (VP)
      top: [0, 1, 0.0001], // plan (HP)
      side: [1, 0, 0], // profile (SV)
    };

    const dir = directions[name] || directions.iso;
    camera.position.copy(center).add(new THREE.Vector3(...dir).multiplyScalar(420));
    camera.up.set(0, 1, 0);
    camera.zoom = name === "iso" ? 1.0 : 0.95;
    controls.update();
    resize();
    dirty = true;
  }

  function resize() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;

    renderer.setSize(w, h, false);
    camera.left = (-extent * w) / h;
    camera.right = (extent * w) / h;
    camera.top = extent;
    camera.bottom = -extent;
    camera.updateProjectionMatrix();
    dirty = true;
  }

  controls.addEventListener("change", () => (dirty = true));

  const observer = new ResizeObserver(() => resize());
  observer.observe(host);

  function frame() {
    if (disposed) return;
    requestAnimationFrame(frame);

    if (Math.abs(foldDeg - targetFoldDeg) > 0.1) {
      foldDeg += (targetFoldDeg - foldDeg) * 0.18;
      if (Math.abs(foldDeg - targetFoldDeg) <= 0.2) foldDeg = targetFoldDeg;
      applyFoldVisibility();
      const slider = document.getElementById("hpFoldSlider");
      const val = document.getElementById("hpFoldVal");
      if (slider) slider.value = String(Math.round(foldDeg));
      if (val) val.textContent = `${Math.round(foldDeg)}°`;
      dirty = true;
    }

    controls.update();
    if (dirty && host.clientWidth) {
      renderer.render(scene, camera);
      dirty = false;
    }
  }

  buildPlanes();
  view("iso");
  frame();

  return {
    updateStage,
    updateStrokes,
    updateCursorAndPreview,
    setFoldAngle,
    setShowRays,
    setSyncMode,
    view,
    resize,
    get preset() {
      return currentPreset;
    },
    get foldDeg() {
      return foldDeg;
    },
    dispose() {
      disposed = true;
      observer.disconnect();
      controls.dispose();
      clearGroup(xyGroup);
      clearGroup(vpGroup);
      clearGroup(hpPivotGroup);
      clearGroup(stageGroup);
      clearGroup(raysGroup);
      clearGroup(reconstructedGroup);
      renderer.dispose();
    },
  };
}
