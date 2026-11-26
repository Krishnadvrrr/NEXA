import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
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
  clearThreeGroup
} from "./sceneSetup.js";
import {
  buildStyledSolidGroup,
  buildInternalGuidesGroup,
  updateStyleUniforms
} from "./visualStyles.js";
import { buildSectionAssembly } from "./sectionSlicer.js";
import {
  createViewCube,
  createCameraAnimator,
  mountViewportOverlay
} from "./viewCube.js";

/**
 * Upgraded Projections 3D Viewport Engine
 * Powers both main Projections Spatial View and View-in-3D Inspector Modal
 * with AutoCAD Visual Styles, PBR Materials, Bloom, Glass HP/VP, Section Slicer & ViewCube.
 */
export function createRenderer(host, opts = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const { renderer, disposeEnv } = createStudioRenderer(host, scene);
  const camera = new THREE.OrthographicCamera(-150, 150, 150, -150, 0.1, 4000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.minZoom = 0.25;
  controls.maxZoom = 8;

  const lights = createStudioLighting(scene, 200);
  const composerPipeline = createComposerPipeline(renderer, scene, camera);

  const solidGroup = new THREE.Group();
  const planesGroup = new THREE.Group();
  const xyGroup = new THREE.Group();
  const vpGroup = new THREE.Group();
  const hpGroup = new THREE.Group();
  planesGroup.add(xyGroup, vpGroup, hpGroup);

  const floorGroup = createStudioFloor(-0.65, 340);
  scene.add(floorGroup, planesGroup, solidGroup);

  let extent = 150;
  let center = new THREE.Vector3(0, 45, 45);
  let preset = "iso";
  let dirty = true;
  let disposed = false;

  let currentModel = null;
  let visualStyle = opts.initialStyle || "shaded";
  let showGuides = opts.initialGuides ?? true;
  let performanceMode = opts.initialPerf ?? false;
  let inspectCutMode = false;

  let sectionConfig = {
    enabled: false,
    angleDeg: 45,
    heightPct: 50,
    explodeEnabled: false,
    explodeDist: 0
  };
  let currentCutBasis = null;
  let onSectionUpdateCb = opts.onSectionUpdate || null;

  const camAnimator = createCameraAnimator(camera, controls, () => {
    dirty = true;
  });

  const viewCube = createViewCube(host, {
    showInspectButton: true,
    onSelectView: (targetView) => {
      view(targetView);
    }
  });

  const hud = mountViewportOverlay(host, {
    initialStyle: visualStyle,
    initialGuides: showGuides,
    initialPerf: performanceMode,
    onChangeStyle: (styleId) => {
      visualStyle = styleId;
      rebuildScene();
    },
    onToggleGuides: (on) => {
      showGuides = on;
      rebuildScene();
    },
    onTogglePerf: (on) => {
      performanceMode = on;
      lights.setShadows(!on);
      dirty = true;
    },
    onChangeExplode: (enabled, dist) => {
      sectionConfig.explodeEnabled = enabled;
      sectionConfig.explodeDist = dist;
      rebuildScene();
      if (onSectionUpdateCb) onSectionUpdateCb({ explodeEnabled: enabled, explodeDist: dist });
    },
    onInspectCut: () => {
      inspectCutMode = !inspectCutMode;
      rebuildScene();
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

  function rebuildScene() {
    if (!currentModel) return;
    clearThreeGroup(solidGroup);
    clearThreeGroup(xyGroup);
    clearThreeGroup(vpGroup);
    clearThreeGroup(hpGroup);

    const box = new THREE.Box3().setFromPoints(
      currentModel.vertices.map((p) => new THREE.Vector3(...p))
    );
    box.getCenter(center);
    const size = box.getSize(new THREE.Vector3());
    extent = Math.max(100, size.x, size.y, size.z, box.max.y, box.max.z) * 1.18;

    // 1. Sleek Glass Reference Planes (VP & HP) + Glowing XY Hinge
    buildGlassReferencePlanesIntoGroups({
      xyGroup,
      vpGroup,
      hpGroup,
      minX: -extent,
      maxX: extent,
      heightSpan: extent,
      depthSpan: extent,
      gridStep: 20,
      xyLineY: 0
    });

    // 2. Render either full Styled Solid OR Core-Clipped Live Section Assembly
    currentCutBasis = null;
    if (sectionConfig.enabled) {
      const frac = Math.max(0.08, Math.min(0.92, (sectionConfig.heightPct ?? 50) / 100));
      const cutY = box.min.y + size.y * frac;
      currentCutBasis = computeCutPlaneBasis(sectionConfig.angleDeg ?? 45, cutY, center.x, center.z);

      const assembly = buildSectionAssembly(currentModel, currentCutBasis, visualStyle, {
        drawAllEdges: !currentModel.curved,
        explodeDist: sectionConfig.explodeEnabled ? sectionConfig.explodeDist || 0 : 0,
        showUpper: true,
        showPlane: true,
        showAnnotations: inspectCutMode,
        sizeSpan: Math.max(size.x, size.z, 72)
      });
      solidGroup.add(assembly.rootGroup);
      hud.setSectionActive(true);
      hud.setExplode(sectionConfig.explodeEnabled, sectionConfig.explodeDist);
      hud.setSectionMetrics(assembly.metrics, inspectCutMode);
      viewCube.setInspectVisible(true);
    } else {
      inspectCutMode = false;
      solidGroup.add(
        buildStyledSolidGroup(currentModel, visualStyle, {
          drawAllEdges: !currentModel.curved
        })
      );
      hud.setSectionActive(false);
      hud.setSectionMetrics(null, false);
      viewCube.setInspectVisible(false);
    }

    // 3. Internal Center Axis & Generators / Slant Guides
    if (showGuides || visualStyle === "xray" || visualStyle === "glass") {
      solidGroup.add(
        buildInternalGuidesGroup(currentModel, {
          axisPts: currentModel.axis,
          isCurved: currentModel.curved,
          isPyramid: currentModel.pyramid
        })
      );
    }

    dirty = true;
    resize();
  }

  function update(model, nextSection = null) {
    currentModel = model;
    if (nextSection) {
      sectionConfig = { ...sectionConfig, ...nextSection };
    }
    rebuildScene();
  }

  function setSectionOptions(nextSection = {}) {
    sectionConfig = { ...sectionConfig, ...nextSection };
    rebuildScene();
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

  function view(name = "iso") {
    preset = name;
    if (name === "inspectCut" && currentCutBasis) {
      inspectCutMode = true;
      rebuildScene();
    } else if (inspectCutMode && name !== "inspectCut") {
      inspectCutMode = false;
      rebuildScene();
    }

    const basis = resolveCameraPresetBasis(name, currentCutBasis);
    const target = name === "inspectCut" && currentCutBasis ? new THREE.Vector3(...currentCutBasis.origin) : center;
    camAnimator.animateTo(basis.dir, basis.up, target, 500, name === "inspectCut" ? 1.15 : 1.0, 420);
    dirty = true;
  }

  const observer = new ResizeObserver(resize);
  observer.observe(host);

  function frame(now) {
    if (disposed) return;
    requestAnimationFrame(frame);

    const animActive = camAnimator.update(now);
    const ctrlChanged = controls.update();
    if (animActive || ctrlChanged || dirty) {
      if (host.clientWidth > 0) {
        lights.updateTracking(camera, center);
        updateStyleUniforms(solidGroup, camera, center);
        viewCube.syncFromCamera(camera);
        composerPipeline.renderFrame(performanceMode);
        dirty = false;
      }
    }
  }

  frame(performance.now());

  return {
    update,
    setSectionOptions,
    setVisualStyle(styleId) {
      visualStyle = styleId;
      hud.setStyle(styleId);
      rebuildScene();
    },
    setShowGuides(on) {
      showGuides = Boolean(on);
      hud.setGuides(showGuides);
      rebuildScene();
    },
    setPerformanceMode(on) {
      performanceMode = Boolean(on);
      hud.setPerf(performanceMode);
      lights.setShadows(!performanceMode);
      dirty = true;
    },
    view,
    resize,
    dispose() {
      disposed = true;
      observer.disconnect();
      controls.dispose();
      viewCube.dispose();
      hud.dispose();
      clearThreeGroup(solidGroup);
      clearThreeGroup(xyGroup);
      clearThreeGroup(vpGroup);
      clearThreeGroup(hpGroup);
      clearThreeGroup(floorGroup);
      composerPipeline.dispose();
      disposeEnv();
      renderer.dispose();
    },
    get preset() {
      return preset;
    },
    get currentStyle() {
      return visualStyle;
    }
  };
}
