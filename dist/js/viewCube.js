import * as THREE from "three";
import { VISUAL_STYLE_SPECS } from "./reaSpecMapper.js";

/**
 * Interactive 3D CAD ViewCube HUD + Floating Visual Style / Section / Performance Controls
 * Syncs smoothly in real time from active camera.matrixWorldInverse using 3D CSS
 * (zero extra WebGL contexts) and triggers eased camera transitions on face/corner clicks.
 */

export function mountViewportOverlay(viewportEl, options = {}) {
  if (!viewportEl) {
    return {
      setStyle() {},
      setGuides() {},
      setPerf() {},
      setSectionActive() {},
      setSectionMetrics() {},
      setExplode() {},
      dispose() {}
    };
  }

  const {
    initialStyle = "shaded",
    initialGuides = true,
    initialPerf = false,
    onChangeStyle = () => {},
    onToggleGuides = () => {},
    onTogglePerf = () => {},
    onChangeExplode = () => {},
    onInspectCut = () => {}
  } = options;

  const topBar = document.createElement("div");
  topBar.className = "cad-3d-overlay-top";

  const styleOptsHtml = VISUAL_STYLE_SPECS.map(
    (s) => `<option value="${s.id}" ${s.id === initialStyle ? "selected" : ""}>${s.category}: ${s.label}</option>`
  ).join("");

  topBar.innerHTML = `
    <select class="cad-style-select" title="Switch AutoCAD & Studio 3D Visual Style" aria-label="3D Visual Style">
      ${styleOptsHtml}
    </select>
    <button type="button" class="vc-mini-btn overlay-guides-btn ${initialGuides ? "active" : ""}" title="Toggle internal axis, slant edges & 12-division generators">Guides</button>
    <button type="button" class="vc-mini-btn overlay-perf-btn ${initialPerf ? "active" : ""}" title="Performance Mode (disables Bloom & soft shadows for 60 fps)">Perf</button>
  `;

  const secBar = document.createElement("div");
  secBar.className = "cad-3d-overlay-bottom";
  secBar.hidden = true;
  secBar.innerHTML = `
    <div class="sec-hud-row">
      <button type="button" class="vc-mini-btn sec-explode-btn" title="Explode / lift upper cut half along section normal">Explode</button>
      <input type="range" class="sec-explode-slider" min="0" max="55" value="0" title="Lift distance (mm)" />
      <span class="sec-explode-val">0 mm</span>
      <button type="button" class="vc-mini-btn sec-true-btn" title="Look normal to cut face with edge measurements">True Shape</button>
    </div>
    <div class="sec-metrics-line" hidden></div>
  `;

  viewportEl.appendChild(topBar);
  viewportEl.appendChild(secBar);

  const selectEl = topBar.querySelector(".cad-style-select");
  const guidesBtn = topBar.querySelector(".overlay-guides-btn");
  const perfBtn = topBar.querySelector(".overlay-perf-btn");
  const explodeBtn = secBar.querySelector(".sec-explode-btn");
  const explodeSlider = secBar.querySelector(".sec-explode-slider");
  const explodeVal = secBar.querySelector(".sec-explode-val");
  const trueBtn = secBar.querySelector(".sec-true-btn");
  const metricsEl = secBar.querySelector(".sec-metrics-line");

  let guidesState = initialGuides;
  let perfState = initialPerf;
  let explodeOn = false;
  let explodeDist = 0;

  selectEl.addEventListener("change", (e) => {
    e.stopPropagation();
    onChangeStyle(selectEl.value);
  });

  guidesBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    guidesState = !guidesState;
    guidesBtn.classList.toggle("active", guidesState);
    onToggleGuides(guidesState);
  });

  perfBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    perfState = !perfState;
    perfBtn.classList.toggle("active", perfState);
    onTogglePerf(perfState);
  });

  explodeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    explodeOn = !explodeOn;
    explodeDist = explodeOn ? Math.max(24, Number(explodeSlider.value) || 28) : 0;
    explodeSlider.value = String(explodeDist);
    explodeVal.textContent = `${Math.round(explodeDist)} mm`;
    explodeBtn.classList.toggle("active", explodeOn);
    onChangeExplode(explodeOn, explodeDist);
  });

  explodeSlider.addEventListener("input", (e) => {
    e.stopPropagation();
    explodeDist = Number(explodeSlider.value) || 0;
    explodeOn = explodeDist > 0;
    explodeVal.textContent = `${Math.round(explodeDist)} mm`;
    explodeBtn.classList.toggle("active", explodeOn);
    onChangeExplode(explodeOn, explodeDist);
  });

  trueBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onInspectCut();
  });

  return {
    setStyle(id) {
      if (selectEl) selectEl.value = id;
    },
    setGuides(on) {
      guidesState = Boolean(on);
      guidesBtn.classList.toggle("active", guidesState);
    },
    setPerf(on) {
      perfState = Boolean(on);
      perfBtn.classList.toggle("active", perfState);
    },
    setSectionActive(active) {
      secBar.hidden = !active;
    },
    setExplode(enabled, dist) {
      explodeOn = Boolean(enabled);
      explodeDist = Number(dist) || 0;
      explodeSlider.value = String(Math.round(explodeDist));
      explodeVal.textContent = `${Math.round(explodeDist)} mm`;
      explodeBtn.classList.toggle("active", explodeOn);
    },
    setSectionMetrics(metrics, inspecting = false) {
      trueBtn.classList.toggle("active", inspecting);
      if (!metrics || metrics.edgeCount < 3) {
        metricsEl.hidden = true;
        return;
      }
      metricsEl.hidden = false;
      metricsEl.textContent = `True Shape · Edges: ${metrics.edgeCount} · Perim: ${metrics.perimeterMm.toFixed(1)} mm · Area: ${metrics.areaMm2.toFixed(0)} mm²`;
    },
    dispose() {
      topBar.remove();
      secBar.remove();
    }
  };
}

const sTmpMat = new THREE.Matrix4();

export function createViewCube(viewportEl, options = {}) {
  if (!viewportEl) return { syncFromCamera() {}, setInspectVisible() {}, dispose() {} };

  const {
    onSelectView = () => {},
    showInspectButton = true
  } = options;

  const root = document.createElement("div");
  root.className = "cad-viewcube-hud";
  root.innerHTML = `
    <div class="vc-top-bar">
      <button type="button" class="vc-mini-btn" data-vcview="iso" title="Reset Isometric Home">⌂ Iso</button>
      ${showInspectButton ? `<button type="button" class="vc-mini-btn vc-inspect-btn" data-vcview="inspectCut" hidden title="Look perpendicular to section cut (True Shape)">⌖ Cut</button>` : ""}
    </div>
    <div class="vc-stage" title="Click cube face or ISO corners to snap camera">
      <div class="vc-compass-ring"></div>
      <div class="vc-cube">
        <button type="button" class="vc-face vc-front" data-vcview="front">FRONT</button>
        <button type="button" class="vc-face vc-back" data-vcview="back">BACK</button>
        <button type="button" class="vc-face vc-right" data-vcview="right">RIGHT</button>
        <button type="button" class="vc-face vc-left" data-vcview="left">LEFT</button>
        <button type="button" class="vc-face vc-top" data-vcview="top">TOP</button>
        <button type="button" class="vc-face vc-bottom" data-vcview="bottom">BOT</button>
      </div>
    </div>
  `;

  viewportEl.appendChild(root);

  const cubeEl = root.querySelector(".vc-cube");
  const inspectBtn = root.querySelector(".vc-inspect-btn");

  const handleClick = (e) => {
    const btn = e.target.closest("[data-vcview]");
    if (!btn) return;
    e.stopPropagation();
    const targetView = btn.dataset.vcview;
    onSelectView(targetView);
  };
  root.addEventListener("click", handleClick);

  function syncFromCamera(camera) {
    if (!camera || !cubeEl) return;
    camera.updateMatrixWorld();
    sTmpMat.extractRotation(camera.matrixWorldInverse);
    const m = sTmpMat.elements;
    // Conjugate by diag(1, -1, 1) to bridge WebGL Y-up to CSS Y-down cleanly
    const css = [
      m[0], -m[1], m[2], 0,
      -m[4], m[5], -m[6], 0,
      m[8], -m[9], m[10], 0,
      0, 0, 0, 1
    ];
    cubeEl.style.transform = `matrix3d(${css.map((v) => v.toFixed(5)).join(",")})`;
  }

  function setInspectVisible(visible) {
    if (inspectBtn) {
      inspectBtn.hidden = !visible;
    }
  }

  function dispose() {
    root.removeEventListener("click", handleClick);
    root.remove();
  }

  return {
    syncFromCamera,
    setInspectVisible,
    dispose
  };
}

/**
 * Smooth requestAnimationFrame cubic-eased camera view animator for OrbitControls.
 */
export function createCameraAnimator(camera, controls, onTick = () => {}) {
  let anim = null;

  function animateTo(dirVec, upVec, targetCenter, distance, zoom = 1, durationMs = 420) {
    const len = Math.hypot(dirVec[0], dirVec[1], dirVec[2]) || 1;
    const endOffset = new THREE.Vector3(dirVec[0] / len, dirVec[1] / len, dirVec[2] / len).multiplyScalar(distance);
    const endTarget = targetCenter.clone();
    const endPos = endTarget.clone().add(endOffset);
    const endUp = new THREE.Vector3(...upVec).normalize();

    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    const startUp = camera.up.clone().normalize();
    const startZoom = camera.zoom;

    anim = {
      startTime: performance.now(),
      duration: durationMs,
      startPos,
      endPos,
      startTarget,
      endTarget,
      startUp,
      endUp,
      startZoom,
      endZoom: zoom
    };
  }

  function cancel() {
    anim = null;
  }

  function update(now = performance.now()) {
    if (!anim) return false;
    const raw = (now - anim.startTime) / Math.max(1, anim.duration);
    const t = Math.min(1, Math.max(0, raw));
    // Smooth cubic ease-in-out
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    camera.position.lerpVectors(anim.startPos, anim.endPos, ease);
    controls.target.lerpVectors(anim.startTarget, anim.endTarget, ease);
    camera.up.lerpVectors(anim.startUp, anim.endUp, ease).normalize();
    camera.zoom = anim.startZoom + (anim.endZoom - anim.startZoom) * ease;
    camera.updateProjectionMatrix();
    controls.update();
    onTick();

    if (t >= 1) {
      anim = null;
    }
    return true;
  }

  return {
    animateTo,
    cancel,
    update,
    get isActive() {
      return anim !== null;
    }
  };
}
