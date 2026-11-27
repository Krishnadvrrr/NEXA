import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  ISO_SCALE,
  ISO_DIR,
  ISO_UP,
  computeCubeTiltState,
  projectWorldPointOrthographic
} from "./isoCameraRig.js";
import { buildIsoSolidAssemblySpec } from "./isoSolidsBuilder.js";
import { buildIsoLabSceneContent, buildLinked2DFvTvSVG } from "./isoBoxOverlay.js";
import {
  createStudioRenderer,
  createStudioLighting,
  createComposerPipeline,
  createStudioFloor,
  clearThreeGroup
} from "./sceneSetup.js";
import {
  updateStyleUniforms
} from "./visualStyles.js";
import {
  createViewCube,
  createCameraAnimator,
  mountViewportOverlay
} from "./viewCube.js";

/**
 * 3D Isometric Projection Lab Controller
 * Orchestrates:
 * - Geometrically exact OrthographicCamera locked to (1,1,1)/sqrt(3) -> 30° / 30° / 90° axes
 * - "Isometric View (1:1)" vs "Isometric Projection (0.8165)" live switching
 * - 3D Enclosing Box, Offsets, Non-Isometric Line highlights & Dual Boxes
 * - Interactive 5-Stage Construction Scrubber & Linked 2D FV/TV hover synchronization
 * - Micro "Why 0.8165?" Cube-Tilt Explainer canvas visualizer + Interactive Scale Bar
 * - Clean disposal on problem switch or page unload (zero WebGL leaks)
 */

const STAGE_DESCRIPTIONS = [
  "Stage 1 · Orthographic Base Footprint: Inspect the enclosing rectangle projected onto the base HP plane.",
  "Stage 2 · 30° / 30° / 90° Isometric Axes: Three principal axes emanate from Origin O at 120° intervals.",
  "Stage 3 · 3D Isometric Enclosing Box: Construct the prism/pyramid bounding box (and top box for frustums) before carving vertices.",
  "Stage 4 · Plot Offsets, Cut Heights & Non-Isometric Guides: Measure box-edge offsets (cyan iso vs amber non-iso) and vertical cut heights.",
  "Stage 5 · Final Isometric Solid: Crisp visible outlines rendered in full PBR / AutoCAD visual style over faded construction guides."
];

export function createIsoLabController({
  viewportEl,
  insetEl,
  explainerCanvasEl,
  onSelectPractice = () => {}
} = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const { renderer, disposeEnv } = createStudioRenderer(viewportEl, scene);
  const camera = new THREE.OrthographicCamera(-150, 150, 150, -150, 0.1, 4000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.minZoom = 0.25;
  controls.maxZoom = 7;

  const lights = createStudioLighting(scene, 200);
  const composerPipeline = createComposerPipeline(renderer, scene, camera);
  const floorGroup = createStudioFloor(-0.65, 340);
  const contentRoot = new THREE.Group();
  scene.add(floorGroup, contentRoot);

  let disposed = false;
  let dirty = true;
  let extent = 115;
  const targetCenter = new THREE.Vector3(0, 30, 0);

  // State
  let activeQuestion = null;
  let activeParams = {
    solid: "hexPrism",
    baseEdge: 25,
    height: 60,
    scaleMode: "projection"
  };
  let scaleMode = "projection"; // "view" | "projection"
  let visualStyle = "shaded";
  let showGuides = true;
  let performanceMode = false;
  let showBox = true;
  let showDualBox = true;
  let showOffsets = true;
  let showGhost = true;
  let stage = 5;
  let highlightedCutId = null;
  let currentSpec = null;
  let camSnappedToIso = true;

  // Cube-Tilt explainer state
  let tiltProgress = 1.0;
  let tiltAnimDir = 0; // 0 idle, 1 playing forward
  let onStateChangeCb = null;

  const camAnimator = createCameraAnimator(camera, controls, () => {
    dirty = true;
  });

  const viewCube = createViewCube(viewportEl, {
    showInspectButton: false,
    onSelectView: (viewName) => {
      if (viewName === "iso") {
        snapToTrueIso(true);
      } else {
        camSnappedToIso = false;
        const map = {
          front: [[0, 0, 1], [0, 1, 0]],
          back: [[0, 0, -1], [0, 1, 0]],
          right: [[1, 0, 0], [0, 1, 0]],
          left: [[-1, 0, 0], [0, 1, 0]],
          top: [[0, 1, 0.0001], [0, 0, -1]],
          bottom: [[0, -1, 0.0001], [0, 0, 1]]
        };
        const [dir, up] = map[viewName] || [ISO_DIR, ISO_UP];
        camAnimator.animateTo(dir, up, targetCenter, 440, camera.zoom || 1, 420);
        emitState();
      }
    }
  });

  const hud = mountViewportOverlay(viewportEl, {
    initialStyle: visualStyle,
    initialGuides: showGuides,
    initialPerf: performanceMode,
    onChangeStyle: (id) => {
      visualStyle = id;
      rebuild();
    },
    onToggleGuides: (on) => {
      showGuides = on;
      showBox = on;
      showOffsets = on;
      rebuild();
      emitState();
    },
    onTogglePerf: (on) => {
      performanceMode = on;
      lights.setShadows(!on);
      dirty = true;
    }
  });

  controls.addEventListener("start", () => {
    camAnimator.cancel();
    camSnappedToIso = false;
    emitState();
  });
  controls.addEventListener("change", () => {
    dirty = true;
  });

  function snapToTrueIso(animate = true) {
    camSnappedToIso = true;
    if (animate) {
      camAnimator.animateTo(ISO_DIR, ISO_UP, targetCenter, 440, 1.0, 380);
    } else {
      const dist = 440;
      camera.position.set(
        targetCenter.x + ISO_DIR[0] * dist,
        targetCenter.y + ISO_DIR[1] * dist,
        targetCenter.z + ISO_DIR[2] * dist
      );
      camera.up.set(...ISO_UP);
      controls.target.copy(targetCenter);
      camera.zoom = 1.0;
      camera.updateProjectionMatrix();
      controls.update();
    }
    dirty = true;
    emitState();
  }

  function resize() {
    if (!viewportEl) return;
    const w = viewportEl.clientWidth;
    const h = viewportEl.clientHeight;
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

  const observer = new ResizeObserver(resize);
  if (viewportEl) observer.observe(viewportEl);

  function rebuild() {
    clearThreeGroup(contentRoot);
    currentSpec = buildIsoSolidAssemblySpec(activeParams, scaleMode);

    // Keep extent FIXED based on true unscaled solid spans so toggling 1:1 View <-> 0.8165 Projection
    // produces an unmistakable ~22.5% visual scale contrast inside the same metric camera frame!
    const m = currentSpec.metrics;
    const totalH = currentSpec.sphereSpec
      ? currentSpec.sphereSpec.trueCenterY + currentSpec.sphereSpec.trueRadius
      : m.trueH;
    extent = Math.max(85, m.trueW * 1.15, m.trueD * 1.15, totalH * 1.15);
    targetCenter.set(0, Math.max(18, totalH * 0.48), 0);

    const built = buildIsoLabSceneContent(currentSpec, {
      visualStyle,
      showBox,
      showDualBox,
      showOffsets,
      showGhost,
      stage,
      highlightedCutPointId: highlightedCutId
    });
    contentRoot.add(built.root);

    // Refresh linked 2D FV/TV inset SVG
    if (insetEl) {
      insetEl.innerHTML = buildLinked2DFvTvSVG(currentSpec, highlightedCutId);
      insetEl.querySelectorAll(".fv-cut-pt").forEach((el) => {
        el.addEventListener("pointerenter", () => {
          highlightedCutId = el.dataset.cutid;
          rebuild();
        });
        el.addEventListener("pointerleave", () => {
          highlightedCutId = null;
          rebuild();
        });
      });
    }

    resize();
    dirty = true;
  }

  function emitState() {
    if (!onStateChangeCb || !currentSpec) return;
    onStateChangeCb({
      question: activeQuestion,
      spec: currentSpec,
      scaleMode,
      stage,
      stageDescription: STAGE_DESCRIPTIONS[Math.max(0, Math.min(4, stage - 1))],
      showBox,
      showDualBox,
      showOffsets,
      showGhost,
      camSnappedToIso
    });
  }

  function loadQuestion(q) {
    activeQuestion = q || null;
    if (q) {
      activeParams = { ...(q.parameters || {}), solid: q.parameters?.solid || "hexPrism" };
      scaleMode = q.scaleMode || q.parameters?.scaleMode || "projection";
    }
    stage = 5;
    highlightedCutId = null;
    rebuild();
    snapToTrueIso(false);
    emitState();
  }

  function loadCustomParams(nextParams) {
    activeQuestion = null;
    activeParams = { ...activeParams, ...nextParams };
    rebuild();
    emitState();
  }

  function setScaleMode(nextMode) {
    scaleMode = nextMode === "view" ? "view" : "projection";
    rebuild();
    emitState();
  }

  function setStage(nextStage) {
    stage = Math.max(1, Math.min(5, Math.round(Number(nextStage) || 5)));
    rebuild();
    emitState();
  }

  function setOverlayOptions(opts = {}) {
    if ("showBox" in opts) showBox = Boolean(opts.showBox);
    if ("showDualBox" in opts) showDualBox = Boolean(opts.showDualBox);
    if ("showOffsets" in opts) showOffsets = Boolean(opts.showOffsets);
    if ("showGhost" in opts) showGhost = Boolean(opts.showGhost);
    rebuild();
    emitState();
  }

  // Interactive Micro Cube-Tilt Explainer ("Why 0.8165?") rendered at 60 fps on dedicated 2D canvas
  function renderCubeTiltCanvas() {
    if (!explainerCanvasEl) return;
    const ctx = explainerCanvasEl.getContext("2d");
    const w = explainerCanvasEl.width;
    const h = explainerCanvasEl.height;
    ctx.clearRect(0, 0, w, h);

    const state = computeCubeTiltState(tiltProgress);
    const s = 34; // half-cube side
    const cx = w * 0.5;
    const cy = h * 0.52;

    const verts = [
      [-s, -s, s], [s, -s, s], [s, s, s], [-s, s, s],     // Front (+Z) 0..3
      [-s, -s, -s], [s, -s, -s], [s, s, -s], [-s, s, -s]  // Back (-Z) 4..7
    ];
    const proj = verts.map((v) => {
      const p = projectWorldPointOrthographic(v, state.viewDir);
      return [cx + p.x, cy - p.y];
    });

    const faces = [
      { ids: [0, 1, 2, 3], fill: "rgba(255,255,255,0.06)" },
      { ids: [1, 5, 6, 2], fill: "rgba(56,189,248,0.09)" },
      { ids: [3, 2, 6, 7], fill: "rgba(245,185,93,0.08)" }
    ];
    for (const f of faces) {
      ctx.beginPath();
      f.ids.forEach((id, k) => {
        if (k === 0) ctx.moveTo(proj[id][0], proj[id][1]);
        else ctx.lineTo(proj[id][0], proj[id][1]);
      });
      ctx.closePath();
      ctx.fillStyle = f.fill;
      ctx.fill();
    }

    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7]
    ];
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    edges.forEach(([a, b]) => {
      ctx.beginPath();
      ctx.moveTo(proj[a][0], proj[a][1]);
      ctx.lineTo(proj[b][0], proj[b][1]);
      ctx.stroke();
    });

    // Highlighted reference edges:
    // 1) Front bottom-right edge (1 -> 5, along -Z = 30° axis in final Iso)
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = "#38bdf8";
    ctx.beginPath();
    ctx.moveTo(proj[1][0], proj[1][1]);
    ctx.lineTo(proj[5][0], proj[5][1]);
    ctx.stroke();

    // 2) Vertical edge (1 -> 2, shows foreshortening 1.000 -> 0.8165 directly)
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = "#f5b95d";
    ctx.beginPath();
    ctx.moveTo(proj[1][0], proj[1][1]);
    ctx.lineTo(proj[2][0], proj[2][1]);
    ctx.stroke();

    // Horizon reference tick from vertex 1
    ctx.strokeStyle = "rgba(245,185,93,0.4)";
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(proj[1][0], proj[1][1]);
    ctx.lineTo(proj[1][0] + 62, proj[1][1]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Text metrics overlay
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 10px Consolas, monospace";
    ctx.fillText(state.phaseLabel, 8, 14);
    ctx.fillStyle = "#f5b95d";
    ctx.fillText(`Vertical ratio: ${state.vertRatio.toFixed(4)}`, 8, h - 18);
    ctx.fillStyle = "#38bdf8";
    ctx.fillText(`Axis angle: ${Math.abs(state.rightEdgeAngleDeg).toFixed(1)}°`, 8, h - 6);
  }

  function setTiltProgress(t) {
    tiltProgress = Math.max(0, Math.min(1, Number(t) || 0));
    tiltAnimDir = 0;
    renderCubeTiltCanvas();
  }

  function playTiltExplainer() {
    if (tiltProgress >= 0.98) tiltProgress = 0;
    tiltAnimDir = 1;
  }

  function frame(now) {
    if (disposed) return;
    requestAnimationFrame(frame);

    if (tiltAnimDir !== 0) {
      tiltProgress = Math.min(1, tiltProgress + 0.011);
      renderCubeTiltCanvas();
      if (tiltProgress >= 1) tiltAnimDir = 0;
    }

    const animActive = camAnimator.update(now);
    const ctrlChanged = controls.update();
    if (animActive || ctrlChanged || dirty) {
      if (viewportEl && viewportEl.clientWidth > 0) {
        lights.updateTracking(camera, targetCenter);
        updateStyleUniforms(contentRoot, camera, targetCenter);
        viewCube.syncFromCamera(camera);
        composerPipeline.renderFrame(performanceMode);
        dirty = false;
      }
    }
  }

  snapToTrueIso(false);
  renderCubeTiltCanvas();
  frame(performance.now());

  return {
    loadQuestion,
    loadCustomParams,
    setScaleMode,
    setStage,
    setOverlayOptions,
    snapToTrueIso,
    setTiltProgress,
    playTiltExplainer,
    setVisualStyle(id) {
      visualStyle = id;
      hud.setStyle(id);
      rebuild();
    },
    onStateChange(cb) {
      onStateChangeCb = cb;
      emitState();
    },
    getState() {
      return {
        question: activeQuestion,
        spec: currentSpec,
        scaleMode,
        stage,
        tiltProgress,
        camSnappedToIso
      };
    },
    get camera() {
      return camera;
    },
    get controls() {
      return controls;
    },
    resize,
    dispose() {
      disposed = true;
      observer.disconnect();
      controls.dispose();
      viewCube.dispose();
      hud.dispose();
      clearThreeGroup(contentRoot);
      clearThreeGroup(floorGroup);
      composerPipeline.dispose();
      disposeEnv();
      renderer.dispose();
    }
  };
}
