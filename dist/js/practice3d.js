import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { reconstructFrom2DStrokes } from "./reconstruct3d.js";
import {
  computeCutPlaneBasis,
  resolveCameraPresetBasis
} from "./reaSpecMapper.js";
import {
  createStudioRenderer,
  createStudioLighting,
  createComposerPipeline,
  createStudioFloor,
  buildGlassReferencePlanesIntoGroups,
  clearThreeGroup,
  createSpriteLabel
} from "./sceneSetup.js";
import {
  buildStyledSolidGroup,
  buildInternalGuidesGroup,
  applyGroupOpacity,
  updateStyleUniforms
} from "./visualStyles.js";
import { buildSectionAssembly } from "./sectionSlicer.js";
import {
  createViewCube,
  createCameraAnimator,
  mountViewportOverlay
} from "./viewCube.js";

/**
 * High-Precision Synchronized 2D <-> 3D Engineering Graphics Visualizer (Practice Studio)
 * - AutoCAD Visual Styles (Conceptual Gooch, Shaded+Edges, X-Ray, Hidden Wire, Aluminum, Glass, Blueprint)
 * - Core-clipped 3D Section of Solids Engine with 45-degree metallic hatch, laser seam & Explode Cut
 * - Aligns 3D Stage Solids vertex-for-vertex with 2D Top & Front Views
 * - Interactive Dihedral Unfolding around the XY hinge line (0 deg 3D room <-> 90 deg 2D sheet)
 * - Interactive 3D ViewCube + Smooth Camera Animator (Iso, FV, TV, SV, Inspect True Shape)
 * - Real-time 60 FPS cursor reticle, locus ray, and live drag rubber-band preview
 * - True Live 2D-to-3D solid reconstruction in Free Practice & "From 2D" Sync mode
 */

const degToRad = (d) => (d * Math.PI) / 180;

export function createPractice3D(host) {
  const viewportEl = host.parentElement || host;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030508);

  const { renderer, disposeEnv } = createStudioRenderer(host, scene);

  const camera = new THREE.OrthographicCamera(-150, 150, 150, -150, 0.1, 4000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.minZoom = 0.25;
  controls.maxZoom = 6;

  const lights = createStudioLighting(scene, 220);
  const composerPipeline = createComposerPipeline(renderer, scene, camera);

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

  const floorGroup = createStudioFloor(-0.65, 340);
  scene.add(floorGroup, xyGroup, vpGroup, hpPivotGroup, stageGroup, raysGroup, reconstructedGroup);

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
  let syncMode = "stage"; // "stage" | "draft"
  let foldDeg = 0;
  let targetFoldDeg = 0;

  let visualStyle = "shaded";
  let showGuides = true;
  let performanceMode = false;
  let explodeEnabled = false;
  let explodeDist = 0;
  let inspectCutMode = false;
  let currentCutBasis = null;

  let lastQuestion = null;
  let lastStepIndex = 0;
  let lastDrawnElements = [];

  const camAnimator = createCameraAnimator(camera, controls, () => {
    dirty = true;
  });

  const viewCube = createViewCube(viewportEl, {
    showInspectButton: true,
    onSelectView: (targetView) => {
      view(targetView);
    }
  });

  const hud = mountViewportOverlay(viewportEl, {
    initialStyle: visualStyle,
    initialGuides: showGuides,
    initialPerf: performanceMode,
    onChangeStyle: (styleId) => {
      visualStyle = styleId;
      updateStage(lastQuestion, lastStepIndex, lastDrawnElements);
    },
    onToggleGuides: (on) => {
      showGuides = on;
      updateStage(lastQuestion, lastStepIndex, lastDrawnElements);
    },
    onTogglePerf: (on) => {
      performanceMode = on;
      lights.setShadows(!on);
      dirty = true;
    },
    onChangeExplode: (enabled, dist) => {
      explodeEnabled = enabled;
      explodeDist = dist;
      updateStage(lastQuestion, lastStepIndex, lastDrawnElements);
    },
    onInspectCut: () => {
      inspectCutMode = !inspectCutMode;
      updateStage(lastQuestion, lastStepIndex, lastDrawnElements);
      if (inspectCutMode) {
        view("inspectCut");
      } else {
        view("iso");
      }
    }
  });

  controls.addEventListener("start", () => {
    camAnimator.cancel();
  });
  controls.addEventListener("change", () => {
    dirty = true;
  });

  const gradeColor = (grade) => {
    if (grade === "HB") return 0xffffff;
    if (grade === "2H") return 0x6b7280;
    if (grade === "Axis") return 0xf5b95d;
    if (grade === "Hidden") return 0x9ca3af;
    if (grade === "Cutting Plane") return 0x38bdf8;
    return 0xffffff;
  };

  function buildPlanes() {
    clearThreeGroup(xyGroup);
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
        }
      }
    }

    buildGlassReferencePlanesIntoGroups({
      xyGroup,
      vpGroup,
      hpGroup: hpPivotGroup,
      minX,
      maxX,
      heightSpan,
      depthSpan,
      gridStep: 20,
      xyLineY: 0
    });
  }

  // =========================================================================
  // POLYHEDRON GEOMETRY BUILDER + STAGE ALIGNMENT
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
      ring.push([R * Math.cos(a), -R * Math.sin(a)]);
    }
    return ring;
  }

  function buildPolyhedronDataFromRing(ringXZ, height, isPyramid, offsetX = 0, offsetZ = 45, tiltOpt = null) {
    const n = ringXZ.length;
    let vertices = [];
    for (let i = 0; i < n; i++) vertices.push([ringXZ[i][0], 0, ringXZ[i][1]]);
    if (isPyramid) {
      vertices.push([0, height, 0]);
    } else {
      for (let i = 0; i < n; i++) vertices.push([ringXZ[i][0], height, ringXZ[i][1]]);
    }

    if (tiltOpt && Math.abs(tiltOpt.tiltRad) > 1e-4) {
      const xs = ringXZ.map((p) => p[0]);
      const xMin = Math.min(...xs);
      const xMax = Math.max(...xs);
      const delta = tiltOpt.tiltRad;
      const leanRight = tiltOpt.leanRight;
      const anchorLocalX = leanRight ? xMax : xMin;
      const sign = leanRight ? -1 : 1;
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

    const faces = [];
    faces.push(Array.from({ length: n }, (_, i) => n - 1 - i));
    if (!isPyramid) {
      faces.push(Array.from({ length: n }, (_, i) => n + i));
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      faces.push(isPyramid ? [i, j, n] : [i, j, n + j, n + i]);
    }

    return { vertices, faces, isPyramid, n };
  }

  function extractPlacement(question, solidType) {
    const p = question.parameters || {};
    const sides = polySides3D(solidType);
    let baseAngleDeg = (p.restingOn || "").includes("edge") ? 180 / sides : 0;

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
    if (groundedPts.length > 0) tiltPivotX = groundedPts[0];
    if (axisFrom && axisTo) {
      leanRight = axisTo[0] >= axisFrom[0];
    } else if (highPts.length > 0) {
      const avgHigh = highPts.reduce((s, v) => s + v, 0) / highPts.length;
      leanRight = avgHigh >= tiltPivotX;
    }

    return { cx, cy, tiltPivotX, leanRight, baseAngleDeg };
  }

  function addProjectionRays(points3D, includeVertical = true, includeDepth = true) {
    if (!showRays || !points3D || points3D.length === 0) return;
    const pts = [];
    for (const [x, y, z] of points3D) {
      if (includeVertical && y > 0.5) {
        pts.push(x, y, z, x, 0.2, z);
        pts.push(x, 0.2, z, x, 0.2, 0);
      }
      if (includeDepth && z > 0.5 && y > 0.5) {
        pts.push(x, y, z, x, y, 0.2);
        pts.push(x, y, 0.2, x, 0, 0.2);
      }
    }
    if (pts.length === 0) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const mat = new THREE.LineDashedMaterial({
      color: 0x5c7288,
      dashSize: 3,
      gapSize: 2.5,
      transparent: true,
      opacity: 0.72
    });
    const ls = new THREE.LineSegments(geo, mat);
    ls.computeLineDistances();
    raysGroup.add(ls);
  }

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
          new THREE.MeshBasicMaterial({ color: 0xf5b95d, transparent: true, opacity: 0.16, side: THREE.DoubleSide })
        )
      );
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(borderPts), new THREE.LineBasicMaterial({ color: 0xf5b95d })));
      if (creasePts.length > 0) {
        const cg = new THREE.BufferGeometry();
        cg.setAttribute("position", new THREE.Float32BufferAttribute(creasePts, 3));
        group.add(new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: 0xaa8040 })));
      }
    } else {
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
          new THREE.MeshBasicMaterial({ color: 0xf5b95d, transparent: true, opacity: 0.16, side: THREE.DoubleSide })
        )
      );
      const outline = [cutBorder[0], ...borderPts, cutBorder[cutBorder.length - 1], ...cutBorder.slice().reverse()];
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(outline), new THREE.LineBasicMaterial({ color: 0xf5b95d })));
    }
    return group;
  }

  function appendGuidesIfEnabled(polyData, isCurved, isPyramid) {
    if (showGuides || visualStyle === "xray" || visualStyle === "glass") {
      stageGroup.add(buildInternalGuidesGroup(polyData, { isCurved, isPyramid }));
    }
  }

  // =========================================================================
  // STAGE UPDATER (Guided Practice & Live Sync Mode)
  // =========================================================================

  function updateStage(question, stepIndex, drawnElements = []) {
    lastQuestion = question;
    lastStepIndex = stepIndex;
    lastDrawnElements = drawnElements;

    clearThreeGroup(stageGroup);
    clearThreeGroup(raysGroup);
    clearThreeGroup(hpShadowGroup);
    clearThreeGroup(reconstructedGroup);

    currentCutBasis = null;
    updateStrokes(drawnElements);

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

    const ringXZ = computeLocalBaseRing(solidType, baseEdge, radius, place.baseAngleDeg);
    const basePtsWorld = ringXZ.map(([lx, lz]) => [place.cx + lx, 0.25, centerZ + lz]);

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
        new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: fillOpacity, side: THREE.DoubleSide })
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.18;
      hpShadowGroup.add(mesh);

      const linePts = pts3d.map((pt) => new THREE.Vector3(pt[0], 0.25, pt[2]));
      linePts.push(linePts[0].clone());
      hpShadowGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(linePts), new THREE.LineBasicMaterial({ color: colorHex })));
    };

    const runSectionRender = (polyData, cutAngle, cutHeight, showUpper, showPlane) => {
      const cutBasis = computeCutPlaneBasis(cutAngle, cutHeight, place.cx, centerZ);
      currentCutBasis = cutBasis;
      const assembly = buildSectionAssembly(polyData, cutBasis, visualStyle, {
        drawAllEdges: !isCurved,
        explodeDist: explodeEnabled ? explodeDist : 0,
        showUpper,
        showPlane,
        showAnnotations: inspectCutMode,
        sizeSpan: radius * 2.5
      });
      stageGroup.add(assembly.rootGroup);
      appendGuidesIfEnabled(polyData, isCurved, isPyramid);
      hud.setSectionActive(true);
      hud.setSectionMetrics(assembly.metrics, inspectCutMode);
      viewCube.setInspectVisible(true);
      return assembly;
    };

    if (question.unit === "Development of Surfaces") {
      const polyData = buildPolyhedronDataFromRing(ringXZ, height, isPyramid, place.cx, centerZ, null);
      const cutAngle = p.cuttingAngle || 45;
      const cutHeight = p.cutHeight ?? height / 2;

      if (stepNum === 1) {
        hud.setSectionActive(false);
        viewCube.setInspectVisible(false);
        stageGroup.add(buildStyledSolidGroup(polyData, visualStyle, { drawAllEdges: !isCurved }));
        appendGuidesIfEnabled(polyData, isCurved, isPyramid);
        addHPFootprint(basePtsWorld);
        addProjectionRays(polyData.vertices.filter((_, idx) => !isCurved || idx % 6 === 0));
        updateSpatialDescription(
          "Stage 1: Upright Solid & Simple Views",
          `The ${question.title.split("—")[0].trim()} stands upright on HP at X = ${place.cx.toFixed(0)} mm, projecting directly onto VP and HP.`
        );
      } else if (stepNum <= 4) {
        const assembly = runSectionRender(polyData, cutAngle, cutHeight, true, true);
        if (stepNum >= 3) {
          stageGroup.add(build3DDevelopmentSheet(solidType, baseEdge, radius, height, cutAngle, cutHeight, place.cx));
        }
        addProjectionRays(assembly.capPoly.filter((_, idx) => !isCurved || idx % 6 === 0));
        updateSpatialDescription(
          stepNum === 2 ? `Stage 2: Sliced at ${cutAngle}°` : `Stage ${stepNum}: Cutting Plane & Baseline`,
          `Section plane at ${cutAngle}° slices at Y = ${cutHeight.toFixed(1)} mm with 45° hatched core. Project true lengths onto the stretch-out.`
        );
      } else {
        runSectionRender(polyData, cutAngle, cutHeight, false, false);
        stageGroup.add(build3DDevelopmentSheet(solidType, baseEdge, radius, height, cutAngle, cutHeight, place.cx));
        updateSpatialDescription(
          "Stage 5: Complete Lateral Development",
          "The truncated 3D solid unrolls directly onto the flat pattern on the right, preserving every true edge & arc length."
        );
      }
      applyFoldVisibility();
      dirty = true;
      return;
    }

    // Projection of Solids & Section of Solids Stages 1..6
    const isSectionStep = question.unit === "Section of Solids" && stepNum >= 4;
    if (!isSectionStep) {
      inspectCutMode = false;
      hud.setSectionActive(false);
      hud.setSectionMetrics(null, false);
      viewCube.setInspectVisible(false);
    }

    if (stepNum === 1) {
      updateSpatialDescription(
        "Stage 1: Dihedral Planes (VP / HP)",
        "The XY line acts as the 90° hinge between glass VP and HP planes. Drag the Unfold slider to flatten HP into a 2D sheet."
      );
    } else if (stepNum === 2) {
      addHPFootprint(basePtsWorld, 0xffffff, 0.22);
      const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(place.cx, 0, centerZ), 26, 0xffffff, 6, 4);
      stageGroup.add(arrow);
      updateSpatialDescription(
        "Stage 2: Base Footprint on HP",
        `Your Top View lies physically flat on HP centered at X = ${place.cx.toFixed(0)} mm, Z = ${centerZ.toFixed(0)} mm.`
      );
    } else if (stepNum === 3) {
      if (question.unit === "Section of Solids") {
        const polyData = buildPolyhedronDataFromRing(ringXZ, height, isPyramid, place.cx, centerZ, null);
        stageGroup.add(buildStyledSolidGroup(polyData, visualStyle, { drawAllEdges: !isCurved }));
        appendGuidesIfEnabled(polyData, isCurved, isPyramid);
        addHPFootprint(basePtsWorld);
        addProjectionRays(polyData.vertices.filter((_, idx) => !isCurved || idx % 6 === 0));
        updateSpatialDescription(
          "Stage 3: Full Elevation Above HP",
          `The solid stands upright (${height} mm tall) over your drafted base, projecting rays straight back onto your VP elevation.`
        );
      } else {
        addHPFootprint(basePtsWorld, 0xffffff, 0.16);
        addProjectionRays(basePtsWorld.filter((_, idx) => !isCurved || idx % 6 === 0), true, false);
        const vpPts = [];
        for (const [bx] of basePtsWorld.filter((_, idx) => !isCurved || idx % 6 === 0)) {
          vpPts.push(bx, 0, 0.2, bx, height, 0.2);
        }
        const vGeo = new THREE.BufferGeometry();
        vGeo.setAttribute("position", new THREE.Float32BufferAttribute(vpPts, 3));
        const ls = new THREE.LineSegments(vGeo, new THREE.LineDashedMaterial({ color: 0x5c7288, dashSize: 3, gapSize: 2.5 }));
        ls.computeLineDistances();
        raysGroup.add(ls);
        updateSpatialDescription(
          "Stage 3: Orthographic Projectors",
          "Rays travel from each corner on the HP floor forward to XY and straight upward into the VP wall."
        );
      }
    } else if (stepNum === 4) {
      const polyData = buildPolyhedronDataFromRing(ringXZ, height, isPyramid, place.cx, centerZ, null);
      if (question.unit === "Section of Solids") {
        const cutAngle = p.cuttingAngle || 45;
        const cutHeight = p.cutHeight ?? height / 2;
        runSectionRender(polyData, cutAngle, cutHeight, true, true);
        updateSpatialDescription(
          `Stage 4: Section Plane Slicing at ${cutAngle}°`,
          `Frosted AIP laser plane cuts at Y = ${cutHeight.toFixed(1)} mm. Use Explode or True Shape to inspect the hatched interior!`
        );
      } else {
        stageGroup.add(buildStyledSolidGroup(polyData, visualStyle, { drawAllEdges: !isCurved }));
        appendGuidesIfEnabled(polyData, isCurved, isPyramid);
        addHPFootprint(basePtsWorld);
        addProjectionRays(polyData.vertices.filter((_, idx) => !isCurved || idx % 6 === 0));
        updateSpatialDescription(
          "Stage 4: Upright Solid Over Top View",
          `Notice how the upright ${height} mm solid sits directly over your HP base and projects straight onto your VP Front View.`
        );
      }
    } else if (stepNum === 5) {
      if (question.unit === "Section of Solids") {
        const cutAngle = p.cuttingAngle || 45;
        const cutHeight = p.cutHeight ?? height / 2;
        const polyData = buildPolyhedronDataFromRing(ringXZ, height, isPyramid, place.cx, centerZ, null);
        const assembly = runSectionRender(polyData, cutAngle, cutHeight, true, true);
        addHPFootprint(assembly.capPoly.length >= 3 ? assembly.capPoly : basePtsWorld, 0xf5b95d, 0.28);
        addProjectionRays(assembly.capPoly.filter((_, idx) => !isCurved || idx % 6 === 0));
        updateSpatialDescription(
          "Stage 5: Sectional Top View Projection",
          "Rays drop straight down from the glowing laser cut boundary onto HP, forming the hatched Sectional Top View."
        );
      } else {
        const deltaRad = degToRad(90 - alpha);
        const polyData = buildPolyhedronDataFromRing(ringXZ, height, isPyramid, place.cx, centerZ, {
          tiltRad: deltaRad,
          pivotX: place.tiltPivotX,
          leanRight: place.leanRight
        });
        stageGroup.add(buildStyledSolidGroup(polyData, visualStyle, { drawAllEdges: !isCurved }));
        appendGuidesIfEnabled(polyData, isCurved, isPyramid);
        addProjectionRays(polyData.vertices.filter((_, idx) => !isCurved || idx % 6 === 0));
        updateSpatialDescription(
          `Stage 5: Solid Tilted at ${alpha}° to HP`,
          `Pivoted on its grounded resting edge/corner at X = ${place.tiltPivotX.toFixed(0)} mm so the axis leans at ${alpha}° above HP.`
        );
      }
    } else {
      if (question.unit === "Section of Solids") {
        const cutAngle = p.cuttingAngle || 45;
        const cutHeight = p.cutHeight ?? height / 2;
        const polyData = buildPolyhedronDataFromRing(ringXZ, height, isPyramid, place.cx, centerZ, null);
        const assembly = runSectionRender(polyData, cutAngle, cutHeight, false, true);
        addHPFootprint(assembly.capPoly.length >= 3 ? assembly.capPoly : basePtsWorld, 0xf5b95d, 0.28);
        addProjectionRays(assembly.capPoly.filter((_, idx) => !isCurved || idx % 6 === 0));
        updateSpatialDescription(
          "Stage 6: True Shape of Section",
          "Click True Shape (or ViewCube Cut) to inspect the hatched section face strictly perpendicular with edge dimensions."
        );
      } else {
        const deltaRad = degToRad(90 - alpha);
        const polyData = buildPolyhedronDataFromRing(ringXZ, height, isPyramid, place.cx, centerZ, {
          tiltRad: deltaRad,
          pivotX: place.tiltPivotX,
          leanRight: place.leanRight
        });
        stageGroup.add(buildStyledSolidGroup(polyData, visualStyle, { drawAllEdges: !isCurved }));
        appendGuidesIfEnabled(polyData, isCurved, isPyramid);
        addProjectionRays(polyData.vertices.filter((_, idx) => !isCurved || idx % 6 === 0));
        updateSpatialDescription(
          "Stage 6: Final Top View Shadow on HP",
          "Looking straight down from ViewCube TOP reveals the foreshortened Top View and dashed hidden bottom edges."
        );
      }
    }

    applyFoldVisibility();
    dirty = true;
  }

  // =========================================================================
  // LIVE 2D -> 3D RECONSTRUCTION ENGINE (From Student's Drafted Lines)
  // =========================================================================

  function updateFrom2DReconstruction(elements, isFreePractice = false) {
    const recon = reconstructFrom2DStrokes(elements);
    currentCutBasis = null;

    if (!recon.hasBase) {
      hud.setSectionActive(false);
      viewCube.setInspectVisible(false);
      updateSpatialDescription(
        isFreePractice ? "Free Practice: Live 2D → 3D" : "From My 2D Strokes",
        "Draw a Polygon, Circle, or closed base below XY (HP), then draw Front View height above XY to extrude in 3D!"
      );
      return;
    }

    const basePtsWorld = recon.base.points.map((pt) => [pt[0], 0.22, -pt[1]]);
    const centerZ = -recon.base.cy;

    const linePts = basePtsWorld.map((pt) => new THREE.Vector3(pt[0], 0.25, pt[2]));
    linePts.push(linePts[0].clone());
    hpShadowGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(linePts), new THREE.LineBasicMaterial({ color: 0xffffff })));

    if (!recon.hasSolid) {
      hud.setSectionActive(false);
      viewCube.setInspectVisible(false);
      addProjectionRays(basePtsWorld, true, false);
      updateSpatialDescription(
        "Live Base Detected on HP",
        `Detected ${recon.base.kind === "circle" ? "circle" : `${recon.base.sides}-gon`} base on HP. Draw Front View outlines above XY to extrude!`
      );
      return;
    }

    const localRing = recon.base.points.map((pt) => [pt[0] - recon.base.cx, -(pt[1] - recon.base.cy)]);
    const polyData = buildPolyhedronDataFromRing(localRing, recon.height, recon.isPyramid, recon.base.cx, centerZ, null);
    const isCurved = recon.base.kind === "circle";

    if (recon.cutPlane) {
      currentCutBasis = computeCutPlaneBasis(
        recon.cutPlane.angleDeg,
        recon.cutPlane.cutHeight,
        recon.base.cx,
        centerZ
      );
      const assembly = buildSectionAssembly(polyData, currentCutBasis, visualStyle, {
        drawAllEdges: !isCurved,
        explodeDist: explodeEnabled ? explodeDist : 0,
        showUpper: true,
        showPlane: true,
        showAnnotations: inspectCutMode,
        sizeSpan: recon.base.radius * 2.6
      });
      reconstructedGroup.add(assembly.rootGroup);
      hud.setSectionActive(true);
      hud.setSectionMetrics(assembly.metrics, inspectCutMode);
      viewCube.setInspectVisible(true);
    } else {
      hud.setSectionActive(false);
      viewCube.setInspectVisible(false);
      reconstructedGroup.add(buildStyledSolidGroup(polyData, visualStyle, { drawAllEdges: !isCurved }));
    }

    if (showGuides || visualStyle === "xray" || visualStyle === "glass") {
      reconstructedGroup.add(buildInternalGuidesGroup(polyData, { isCurved, isPyramid: recon.isPyramid }));
    }

    addProjectionRays(polyData.vertices.filter((_, i) => !isCurved || i % 4 === 0));
    const shapeName = isCurved
      ? recon.isPyramid
        ? "Cone"
        : "Cylinder"
      : `${recon.base.sides}-Sided ${recon.isPyramid ? "Pyramid" : "Prism"}`;
    updateSpatialDescription(
      `Live Reconstructed ${shapeName}`,
      `Auto-built from drafted HP footprint & ${recon.height.toFixed(1)} mm VP elevation${recon.cutPlane ? ` (sliced at ${Math.abs(recon.cutPlane.angleDeg).toFixed(0)}°)` : ""}.`
    );
  }

  // =========================================================================
  // 2D STROKES MIRRORED ON HINGED HP & FIXED VP
  // =========================================================================

  function makeLineMaterial(grade) {
    const col = gradeColor(grade);
    if (grade === "Hidden") return new THREE.LineDashedMaterial({ color: col, dashSize: 3.5, gapSize: 2.2 });
    if (grade === "Axis") return new THREE.LineDashedMaterial({ color: col, dashSize: 7, gapSize: 2.5 });
    if (grade === "Cutting Plane") return new THREE.LineDashedMaterial({ color: col, dashSize: 9, gapSize: 2.5 });
    return new THREE.LineBasicMaterial({ color: col });
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
    clearThreeGroup(vpStrokesGroup);
    clearThreeGroup(hpStrokesGroup);

    if (!drawnElements || drawnElements.length === 0) {
      if (syncMode === "draft" || !lastQuestion) {
        clearThreeGroup(raysGroup);
        clearThreeGroup(hpShadowGroup);
        clearThreeGroup(reconstructedGroup);
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
          const t = (0 - el.y1) / (el.y2 - el.y1 || 1);
          const xCross = el.x1 + t * (el.x2 - el.x1);
          if (el.y1 < 0) {
            addStrokeLine(new THREE.Vector3(el.x1, 0.3, -el.y1), new THREE.Vector3(xCross, 0.3, 0), grade, hpStrokesGroup);
            addStrokeLine(new THREE.Vector3(xCross, 0, 0.3), new THREE.Vector3(el.x2, el.y2, 0.3), grade, vpStrokesGroup);
          } else {
            addStrokeLine(new THREE.Vector3(el.x1, el.y1, 0.3), new THREE.Vector3(xCross, 0, 0.3), grade, vpStrokesGroup);
            addStrokeLine(new THREE.Vector3(xCross, 0.3, 0), new THREE.Vector3(el.x2, el.y2, 0.3), grade, hpStrokesGroup);
          }
        }
        if (el.type === "dimension" && el.value) {
          const mx = (el.x1 + el.x2) / 2;
          const my = (el.y1 + el.y2) / 2;
          const onHP = my <= 0;
          createSpriteLabel(
            `${el.value}mm`,
            onHP ? new THREE.Vector3(mx, 2.5, -my) : new THREE.Vector3(mx, my + 2.5, 2),
            "#f5b95d",
            [18, 4.5],
            onHP ? hpStrokesGroup : vpStrokesGroup
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
        createSpriteLabel(
          el.text,
          isHP ? new THREE.Vector3(el.x, 3, -el.y) : new THREE.Vector3(el.x, el.y + 3, 2),
          "#ffffff",
          [16, 4],
          isHP ? hpStrokesGroup : vpStrokesGroup
        );
      }
    }

    if (syncMode === "draft" || !lastQuestion) {
      clearThreeGroup(raysGroup);
      clearThreeGroup(hpShadowGroup);
      clearThreeGroup(reconstructedGroup);
      updateFrom2DReconstruction(drawnElements, !lastQuestion);
    }

    dirty = true;
  }

  // =========================================================================
  // 60 FPS REAL-TIME CURSOR CROSSHAIR, LOCUS RAY & DRAG PREVIEW SYNC
  // =========================================================================

  function updateCursorAndPreview(payload) {
    clearThreeGroup(vpPreviewGroup);
    clearThreeGroup(hpPreviewGroup);

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

    const crossSz = 3.5;
    const reticleMat = new THREE.LineBasicMaterial({ color: activeSnap ? 0xf5b95d : 0xffffff });
    if (onHP) {
      const z = -worldPos.y;
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(worldPos.x - crossSz, 0.5, z),
        new THREE.Vector3(worldPos.x + crossSz, 0.5, z),
        new THREE.Vector3(worldPos.x, 0.5, z - crossSz),
        new THREE.Vector3(worldPos.x, 0.5, z + crossSz)
      ]);
      hpPreviewGroup.add(new THREE.LineSegments(g, reticleMat));
      if (foldDeg < 15) {
        const rGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(worldPos.x, 0.5, z),
          new THREE.Vector3(worldPos.x, 65, z)
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
        new THREE.Vector3(worldPos.x, worldPos.y + crossSz, 0.5)
      ]);
      vpPreviewGroup.add(new THREE.LineSegments(g, reticleMat));
      if (foldDeg < 15) {
        const rGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(worldPos.x, worldPos.y, 0.5),
          new THREE.Vector3(worldPos.x, worldPos.y, 70)
        ]);
        const rLine = new THREE.Line(rGeo, new THREE.LineDashedMaterial({ color: 0x666666, dashSize: 2.5, gapSize: 2.5 }));
        rLine.computeLineDistances();
        vpPreviewGroup.add(rLine);
      }
    }

    if (isDrawing && dragStart) {
      const pMat = new THREE.LineBasicMaterial({ color: 0xf5b95d });
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
      } else if (dragStart.y <= 0 && worldPos.y <= 0) {
        hpPreviewGroup.add(
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(dragStart.x, 0.5, -dragStart.y),
              new THREE.Vector3(worldPos.x, 0.5, -worldPos.y)
            ]),
            pMat
          )
        );
      } else {
        vpPreviewGroup.add(
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(dragStart.x, Math.max(0, dragStart.y), 0.5),
              new THREE.Vector3(worldPos.x, Math.max(0, worldPos.y), 0.5)
            ]),
            pMat
          )
        );
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
      applyGroupOpacity(stageGroup, fade);
      applyGroupOpacity(reconstructedGroup, fade);
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

  function view(name = "iso") {
    currentPreset = name;
    if (name === "inspectCut" && currentCutBasis) {
      inspectCutMode = true;
      updateStage(lastQuestion, lastStepIndex, lastDrawnElements);
    } else if (inspectCutMode && name !== "inspectCut") {
      inspectCutMode = false;
      updateStage(lastQuestion, lastStepIndex, lastDrawnElements);
    }

    const basis = resolveCameraPresetBasis(name, currentCutBasis);
    const target = name === "inspectCut" && currentCutBasis ? new THREE.Vector3(...currentCutBasis.origin) : center;
    camAnimator.animateTo(basis.dir, basis.up, target, 420, name === "inspectCut" ? 1.15 : name === "iso" ? 1.0 : 0.95, 420);
    dirty = true;
  }

  function resize() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;

    renderer.setSize(w, h, false);
    composerPipeline.resize(w, h);
    camera.left = (-extent * w) / h;
    camera.right = (extent * w) / h;
    camera.top = extent;
    camera.bottom = -extent;
    camera.updateProjectionMatrix();
    dirty = true;
  }

  const observer = new ResizeObserver(() => resize());
  observer.observe(host);

  function frame(now) {
    if (disposed) return;
    requestAnimationFrame(frame);

    let foldMoving = false;
    if (Math.abs(foldDeg - targetFoldDeg) > 0.1) {
      foldDeg += (targetFoldDeg - foldDeg) * 0.18;
      if (Math.abs(foldDeg - targetFoldDeg) <= 0.2) foldDeg = targetFoldDeg;
      applyFoldVisibility();
      const slider = document.getElementById("hpFoldSlider");
      const val = document.getElementById("hpFoldVal");
      if (slider) slider.value = String(Math.round(foldDeg));
      if (val) val.textContent = `${Math.round(foldDeg)}°`;
      foldMoving = true;
      dirty = true;
    }

    const animActive = camAnimator.update(now);
    const ctrlChanged = controls.update();
    if (foldMoving || animActive || ctrlChanged || dirty) {
      if (host.clientWidth > 0) {
        lights.updateTracking(camera, center);
        updateStyleUniforms(stageGroup, camera, center);
        updateStyleUniforms(reconstructedGroup, camera, center);
        viewCube.syncFromCamera(camera);
        composerPipeline.renderFrame(performanceMode);
        dirty = false;
      }
    }
  }

  buildPlanes();
  view("iso");
  frame(performance.now());

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
      viewCube.dispose();
      hud.dispose();
      clearThreeGroup(xyGroup);
      clearThreeGroup(vpGroup);
      clearThreeGroup(hpPivotGroup);
      clearThreeGroup(stageGroup);
      clearThreeGroup(raysGroup);
      clearThreeGroup(reconstructedGroup);
      clearThreeGroup(floorGroup);
      composerPipeline.dispose();
      disposeEnv();
      renderer.dispose();
    }
  };
}
