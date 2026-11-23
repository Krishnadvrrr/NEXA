import { buildSolid } from "./js/geometry.js";
import { solidDrawing, drawingStyles } from "./js/drafting.js";
import { curveDrawing } from "./js/curves.js";
import { downloadSheet, practiceDrawing } from "./js/export.js";
import { QUESTIONS, TOPICS } from "./js/data/questions.js";
import { validateStep } from "./js/stepValidator.js";
import { PracticeCanvas } from "./js/practiceCanvas.js";
import { createPractice3D } from "./js/practice3d.js";

const $ = (id) => document.getElementById(id);
const defaults = {
  mode: "solid",
  solid: "hexPrism",
  size: 30,
  height: 70,
  alpha: 60,
  beta: 20,
  roll: 0,
  side: "right",
  curve: "ellipse",
  distance: 35,
  ecc: 0.65,
  radius: 25,
  progress: 100,
  point: 40,
  tangent: true,
  construction: true,
  hidden: true,
  labels: true,
  dimensions: true,
};

let state = { ...defaults },
  renderer = null,
  model,
  drawing,
  pending = false,
  playing = false,
  previous = 0,
  lastSave = 0,
  modelKey = "";

// Practice Studio state
let practiceCanvas = null,
  livePractice3D = null,
  currentQuestion = QUESTIONS[0],
  currentStepIndex = 0,
  preview3dRenderer = null;

try {
  const saved = JSON.parse(localStorage.getItem("eg-studio-v1"));
  if (saved && typeof saved === "object")
    for (const key of Object.keys(defaults)) {
      if (typeof saved[key] === typeof defaults[key]) state[key] = saved[key];
    }
} catch {}

function normalize() {
  for (const key of ["size", "height", "distance", "radius"])
    state[key] = Math.min(
      key === "height" ? 200 : key === "radius" ? 100 : 150,
      Math.max(1, Number.isFinite(state[key]) ? state[key] : defaults[key]),
    );
  for (const key of ["alpha", "beta", "roll", "progress", "point"])
    state[key] = Math.max(
      0,
      Math.min(
        key === "roll" ? 180 : ["alpha", "beta"].includes(key) ? 90 : 100,
        Number.isFinite(state[key]) ? state[key] : defaults[key],
      ),
    );
  state.beta = Math.min(state.beta, 90 - state.alpha);
  for (const key of ["solid", "side", "curve"])
    if (![...$(key).options].some((o) => o.value === state[key]))
      state[key] = defaults[key];
  if (!["solid", "curve", "practice"].includes(state.mode)) state.mode = "solid";
  state.ecc =
    state.curve === "hyperbola"
      ? Math.max(1.05, Math.min(3, state.ecc))
      : Math.max(0.1, Math.min(0.95, state.ecc));
  if (!Number.isFinite(state.ecc)) state.ecc = 0.65;
}
normalize();

function sync() {
  for (const [key, value] of Object.entries(state)) {
    const el = $(key);
    if (el) {
      if (el.type === "checkbox") el.checked = value;
      else el.value = value;
    }
  }
  for (const key of ["alpha", "beta", "roll", "progress", "point"])
    $(key + "Value").textContent =
      state[key].toFixed(0) + (["progress", "point"].includes(key) ? "%" : "°");

  const curve = state.mode === "curve";
  const practice = state.mode === "practice";

  document.body.classList.toggle("curve-mode", curve);
  document.body.classList.toggle("practice-mode", practice);

  $("solidControls").hidden = curve || practice;
  $("curveControls").hidden = !curve;
  $("practiceControls").hidden = !practice;

  const layerCtrl = $("layerControls");
  if (layerCtrl) layerCtrl.hidden = practice;

  $("panels").hidden = practice;
  $("practiceWorkspace").hidden = !practice;

  const insightEl = $("insightTitle")?.closest(".insight");
  if (insightEl) insightEl.hidden = practice;

  document.querySelectorAll(".mode").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === state.mode);
    b.setAttribute("aria-pressed", b.dataset.mode === state.mode);
  });

  if (practice) {
    $("modeTitle").textContent = "Practice Studio";
    $("modeDescription").textContent = "Draft Anna University syllabus problems step-by-step.";
    $("workspaceTitle").textContent = "Interactive Scaled Drafting Canvas";
    document.querySelectorAll("[data-view]").forEach((b) => (b.disabled = true));
    $("angleStatus").textContent = "1 mm = 4 px · True CAD Scale";
    if (!practiceCanvas) {
      initPracticeStudio();
    } else {
      setTimeout(() => {
        practiceCanvas.resize();
        livePractice3D?.resize();
      }, 10);
    }
  } else if (curve) {
    $("modeTitle").textContent = "Engineering curves";
    $("modeDescription").textContent = "Trace the rule behind the curve.";
    $("workspaceTitle").textContent = "Geometry, one point at a time.";
    $("drawingTitle").innerHTML = "Curve construction <span>2D</span>";
    $("drawingTag").textContent = "PARAMETRIC CONSTRUCTION";
    document.querySelectorAll("[data-view]").forEach((b) => (b.disabled = true));
    const rolling = ["cycloid", "involute"].includes(state.curve);
    $("distanceLabel").hidden = rolling;
    $("eccLabel").hidden = rolling || state.curve === "parabola";
    $("radiusLabel").hidden = !rolling;
    $("hidden").closest("label").hidden = curve;
    $("ecc").min = state.curve === "hyperbola" ? 1.05 : 0.1;
    $("ecc").max = state.curve === "hyperbola" ? 3 : 0.95;
    $("angleStatus").textContent = rolling
      ? `r ${state.radius} mm · ${state.curve}`
      : `e ${state.curve === "parabola" ? 1 : state.ecc} · ${state.curve}`;
  } else {
    $("modeTitle").textContent = "Solid projections";
    $("modeDescription").textContent = "See the solid. Understand every line.";
    $("workspaceTitle").textContent = "One solid. Three perspectives.";
    $("drawingTitle").innerHTML = "Orthographic sheet <span>2D</span>";
    $("drawingTag").textContent = "FIRST ANGLE";
    $("height").disabled = state.solid === "cube";
    $("sizeLabel").textContent = ["cylinder", "cone"].includes(state.solid)
      ? "Base radius"
      : "Base edge";
    $("hidden").closest("label").hidden = false;
    document.querySelectorAll("[data-view]").forEach((b) => (b.disabled = false));
    $("angleStatus").textContent = `α ${state.alpha}° · β ${state.beta}°`;
  }
}

function save() {
  try {
    localStorage.setItem("eg-studio-v1", JSON.stringify(state));
  } catch {}
}

function render() {
  pending = false;
  normalize();
  sync();

  if (state.mode === "practice") {
    if (practiceCanvas) practiceCanvas.render();
    $("status").textContent = "Practice Studio active · Ready for drafting";
    return;
  }

  if (state.mode === "solid") {
    const key = [
      state.solid,
      state.size,
      state.height,
      state.alpha,
      state.beta,
      state.roll,
    ].join(":");
    if (key !== modelKey) {
      model = buildSolid(state);
      renderer?.update(model);
      modelKey = key;
    }
    drawing = solidDrawing(model, state);
    $("insightTitle").textContent = "Follow the projectors";
    $("insightText").textContent =
      "Front and top share width. Front and side share height. Dimensions show projected overall extents, not true sloping lengths.";
    $("drawingFoot").innerHTML =
      `FV above XY · TV below XY <span>${state.side === "right" ? "Right-side view on the left" : "Left-side view on the right"}</span>`;
  } else {
    drawing = curveDrawing(state);
    $("insightTitle").textContent =
      state.curve.charAt(0).toUpperCase() +
      state.curve.slice(1) +
      " construction";
    $("insightText").textContent = drawing.description;
    $("drawingFoot").innerHTML =
      "Amber: tangent / construction <span>Violet: normal · Click curve to inspect</span>";
  }

  $("drawing").innerHTML = drawingStyles() + drawing.body;
  if (performance.now() - lastSave > 500) {
    save();
    lastSave = performance.now();
  }
}

function schedule() {
  if (!pending) {
    pending = true;
    requestAnimationFrame(render);
  }
}

// Solid & Curve controls listener setup
for (const key of Object.keys(defaults)) {
  const el = $(key);
  if (!el) continue;
  el.addEventListener("input", () => {
    if (el.type === "number" && (!el.value || !el.checkValidity())) return;
    state[key] =
      el.type === "checkbox"
        ? el.checked
        : typeof defaults[key] === "number"
          ? Number(el.value)
          : el.value;
    if (key === "alpha" || key === "beta") {
      const other = key === "alpha" ? "beta" : "alpha";
      if (state.alpha + state.beta > 90) {
        state[other] = 90 - state[key];
        $("notice").textContent =
          "The other inclination was adjusted: true axis inclinations must satisfy α + β ≤ 90°.";
      } else $("notice").textContent = "";
    }
    if (key === "curve") {
      state.ecc = state.curve === "hyperbola" ? 1.5 : 0.65;
      state.progress = 100;
      stop();
    }
    if (key === "progress") stop();
    schedule();
  });
  if (el.type === "number")
    el.addEventListener("change", () => {
      const invalid = !el.checkValidity() || !el.value;
      state[key] = Number.isFinite(el.valueAsNumber)
        ? el.valueAsNumber
        : defaults[key];
      normalize();
      sync();
      schedule();
      if (invalid)
        $("notice").textContent =
          "Values were limited to the supported positive range.";
    });
}

// Mode navigation
document.querySelectorAll(".mode").forEach(
  (b) =>
    (b.onclick = () => {
      state.mode = b.dataset.mode;
      stop();
      schedule();
      setTimeout(() => {
        renderer?.resize();
        if (state.mode === "practice" && practiceCanvas) {
          practiceCanvas.resize();
        }
      }, 0);
    }),
);

document.querySelectorAll("[data-view]").forEach(
  (b) =>
    (b.onclick = () => {
      renderer?.view(b.dataset.view);
      document
        .querySelectorAll("[data-view]")
        .forEach((x) => x.classList.toggle("active", x === b));
    }),
);

$("collapse").onclick = () => {
  const collapsed = $("controls").classList.toggle("collapsed");
  $("collapse").setAttribute("aria-expanded", !collapsed);
  setTimeout(() => {
    renderer?.resize();
    practiceCanvas?.resize();
  }, 100);
};

$("reset").onclick = () => {
  stop();
  state = { ...defaults, mode: state.mode };
  render();
  renderer?.view("iso");
  $("notice").textContent = "Workspace reset.";
  save();
};

function stop() {
  playing = false;
  $("play").textContent = "▶ Animate";
}

function tick(now) {
  if (!playing) return;
  if (previous) {
    state.progress = Math.min(100, state.progress + (now - previous) / 100);
    state.point = state.progress;
    schedule();
  }
  previous = now;
  if (state.progress >= 100) {
    stop();
    save();
  } else requestAnimationFrame(tick);
}

$("play").onclick = () => {
  if (playing) {
    stop();
    return;
  }
  playing = true;
  if (state.progress >= 100) state.progress = 0;
  previous = 0;
  $("play").textContent = "Ⅱ Pause";
  requestAnimationFrame(tick);
};

$("step").onclick = () => {
  stop();
  state.progress =
    state.progress >= 100 ? 0 : Math.min(100, state.progress + 100 / 12);
  state.point = state.progress;
  schedule();
};

function svgPoint(event) {
  const p = new DOMPoint(event.clientX, event.clientY);
  return p.matrixTransform($("drawing").getScreenCTM().inverse());
}

$("drawing").addEventListener("pointermove", (e) => {
  const p = svgPoint(e);
  $("coordinates").textContent =
    `SHEET X ${(p.x / drawing.scale).toFixed(1)} · Y ${(p.y / drawing.scale).toFixed(1)} mm`;
});

$("drawing").addEventListener("click", (e) => {
  if (state.mode !== "curve") return;
  const p = svgPoint(e);
  let best = Infinity,
    index = 0;
  drawing.samples.forEach((q, i) => {
    const d = Math.hypot(q[0] - p.x, q[1] - p.y);
    if (d < best) {
      best = d;
      index = i;
    }
  });
  state.point = index / 4;
  schedule();
});

// Export sheet dialog
$("export").onclick = () => {
  stop();
  $("exportDialog").showModal();
};
$("closeDialog").onclick = () => $("exportDialog").close();

$("exportForm").onsubmit = async (e) => {
  e.preventDefault();
  const button = e.submitter;
  button.disabled = true;
  try {
    let targetDrawing = drawing;
    if (state.mode === "practice" && practiceCanvas) {
      targetDrawing = practiceDrawing(practiceCanvas.elements);
    }
    await downloadSheet(targetDrawing, {
      mode: state.mode,
      paper: $("paper").value,
      format: $("format").value,
      title: $("projectTitle").value,
      name: $("studentName").value,
    });
    $("exportDialog").close();
    $("notice").textContent = "Drawing sheet downloaded.";
  } catch (error) {
    $("notice").textContent = "Export failed: " + error.message;
  } finally {
    button.disabled = false;
  }
};

window.addEventListener("pagehide", () => {
  save();
  renderer?.dispose();
  preview3dRenderer?.dispose();
  livePractice3D?.dispose();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) stop();
});

window.addEventListener("resize", () => {
  renderer?.resize();
  practiceCanvas?.resize();
  livePractice3D?.resize();
});

// ===========================================================================
// PRACTICE STUDIO CONTROLLER
// ===========================================================================
function initPracticeStudio() {
  const canvasEl = $("draftingCanvas");
  if (!canvasEl) return;

  practiceCanvas = new PracticeCanvas(canvasEl, $("canvasHud"), $("snapBadge"));

  // 1. Populate Topic Dropdown
  const topicSelect = $("topicSelect");
  topicSelect.innerHTML = "";
  for (const t of TOPICS) {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.name;
    topicSelect.appendChild(opt);
  }

  // 2. Populate Questions based on Topic
  function updateQuestionDropdown(topicId) {
    const qSelect = $("questionSelect");
    qSelect.innerHTML = "";

    if (topicId === "free-practice") {
      const opt = document.createElement("option");
      opt.value = "free";
      opt.textContent = "Free Practice — Open Digital Drafting Sheet";
      qSelect.appendChild(opt);
    } else {
      const filtered =
        topicId === "all"
          ? QUESTIONS
          : QUESTIONS.filter((q) => q.unit === topicId);
      filtered.forEach((q) => {
        const opt = document.createElement("option");
        opt.value = q.id;
        opt.textContent = `${q.unit}: ${q.title}`;
        qSelect.appendChild(opt);
      });
    }
    loadActiveQuestion();
  }

  topicSelect.onchange = () => updateQuestionDropdown(topicSelect.value);

  // 3. Load Selected Question
  const qSelect = $("questionSelect");
  qSelect.onchange = () => loadActiveQuestion();

  function loadActiveQuestion() {
    const qId = qSelect.value;
    const isFree = qId === "free";

    $("problemCard").hidden = isFree;
    $("stepCard").hidden = isFree;

    if (isFree) {
      currentQuestion = null;
      practiceCanvas.ghostElements = [];
      practiceCanvas.render();
      livePractice3D?.updateStage(null, 0, practiceCanvas.elements);
      $("notice").textContent = "Free Practice mode active. Full drafting freedom.";
      return;
    }

    currentQuestion = QUESTIONS.find((q) => q.id === qId) || QUESTIONS[0];
    currentStepIndex = 0;

    // Update Problem Card UI
    $("problemUnitBadge").textContent = currentQuestion.unit.toUpperCase();
    $("problemTitle").textContent = currentQuestion.title;
    $("problemStatement").textContent = currentQuestion.problemStatement;

    const paramContainer = $("problemParams");
    paramContainer.innerHTML = "";
    for (const [k, v] of Object.entries(currentQuestion.parameters || {})) {
      if (typeof v === "number" || typeof v === "string") {
        const tag = document.createElement("span");
        tag.className = "param-tag";
        tag.textContent = `${k}: ${v}${typeof v === "number" && !k.toLowerCase().includes("angle") ? "mm" : ""}`;
        paramContainer.appendChild(tag);
      }
    }

    updateStepUI();
  }

  // 4. Update Step UI
  function updateStepUI() {
    if (!currentQuestion) return;
    const steps = currentQuestion.steps || [];
    const step = steps[currentStepIndex];
    if (!step) return;

    $("stepProgressBadge").textContent = `STEP ${currentStepIndex + 1} OF ${steps.length}`;
    $("stepLineTypeBadge").textContent = `Pencil: ${step.lineType}`;
    $("stepTitle").textContent = step.title;
    $("stepInstruction").textContent = step.instruction;
    $("stepHint").textContent = step.hint;

    $("btnPrevStep").disabled = currentStepIndex === 0;
    $("btnNextStep").textContent =
      currentStepIndex === steps.length - 1 ? "Problem Complete ✓" : "Next Step →";

    // Auto-select required pencil grade
    if (step.lineType) {
      $("pencilGradeSelect").value = step.lineType;
      practiceCanvas.pencilGrade = step.lineType;
    }

    // Update Ghost Guide Geometry
    practiceCanvas.ghostElements = step.expectedGeometry || [];
    practiceCanvas.render();

    // Update Live 3D Step Visualizer
    livePractice3D?.updateStage(
      currentQuestion,
      currentStepIndex,
      practiceCanvas.elements || [],
    );

    // Clear previous feedback banner
    const fb = $("stepFeedback");
    fb.hidden = true;
    fb.className = "feedback-banner";
  }

  // 5. Step Navigation Listeners
  $("btnPrevStep").onclick = () => {
    if (currentStepIndex > 0) {
      currentStepIndex--;
      updateStepUI();
    }
  };

  $("btnNextStep").onclick = () => {
    if (currentQuestion && currentStepIndex < currentQuestion.steps.length - 1) {
      currentStepIndex++;
      updateStepUI();
    } else {
      $("notice").textContent = "✓ Problem completed! Excellent engineering drafting.";
    }
  };

  // 6. Check Step Button
  $("btnCheckStep").onclick = () => {
    if (!currentQuestion) {
      $("notice").textContent = "Free practice mode. No constraints to check.";
      return;
    }
    const step = currentQuestion.steps[currentStepIndex];
    const result = validateStep(step, practiceCanvas.elements);

    const fb = $("stepFeedback");
    fb.hidden = false;
    fb.className = `feedback-banner ${result.valid ? "success" : "error"}`;
    fb.textContent =
      result.message + (result.suggestion ? " " + result.suggestion : "");

    if (result.valid) {
      $("notice").textContent = "✓ Step verified within engineering tolerance!";
    }
  };

  // 7. Toggle Ghost Guide Button
  $("btnToggleGhost").onclick = () => {
    practiceCanvas.showGhostGuide = !practiceCanvas.showGhostGuide;
    $("btnToggleGhost").classList.toggle("active", practiceCanvas.showGhostGuide);
    $("btnToggleGhost").textContent = practiceCanvas.showGhostGuide
      ? "👻 Ghost Guide: ON"
      : "👻 Ghost Guide: OFF";
    practiceCanvas.render();
  };

  // 8. Clear Canvas Button
  $("btnClearCanvas").onclick = () => {
    if (confirm("Clear all drawn elements on the drafting sheet?")) {
      practiceCanvas.clearCanvas();
      $("stepFeedback").hidden = true;
      $("notice").textContent = "Drafting sheet cleared.";
    }
  };

  // 9. CAD Toolbar Tools
  document.querySelectorAll(".cad-tool-btn").forEach((btn) => {
    btn.onclick = () => {
      document
        .querySelectorAll(".cad-tool-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const tool = btn.dataset.tool;
      practiceCanvas.tool = tool;

      if (tool === "polygon") {
        $("polygonDialog").showModal();
      }
    };
  });

  // Polygon Generator Dialog
  $("closePolygonDialog").onclick = () => $("polygonDialog").close();
  $("polygonForm").onsubmit = (e) => {
    e.preventDefault();
    practiceCanvas.polygonSettings = {
      sides: Number($("polySides").value),
      edgeLength: Number($("polyEdge").value),
      angle: Number($("polyAngle").value),
    };
    $("polygonDialog").close();
    $("notice").textContent = "Click on the drafting sheet to place the polygon.";
  };

  // Pencil Grade Select
  $("pencilGradeSelect").onchange = (e) => {
    practiceCanvas.pencilGrade = e.target.value;
  };

  // Ortho & Angle Snapping
  $("btnToggleOrtho").onclick = () => {
    practiceCanvas.orthoLock = !practiceCanvas.orthoLock;
    $("btnToggleOrtho").classList.toggle("active", practiceCanvas.orthoLock);
    $("btnToggleOrtho").textContent = practiceCanvas.orthoLock
      ? "Ortho: ON"
      : "Ortho: OFF";
  };

  $("btnToggleAngleSnap").onclick = () => {
    practiceCanvas.angleSnap = !practiceCanvas.angleSnap;
    $("btnToggleAngleSnap").classList.toggle("active", practiceCanvas.angleSnap);
    $("btnToggleAngleSnap").textContent = practiceCanvas.angleSnap
      ? "Snap: 15°"
      : "Snap: OFF";
  };

  // Undo / Redo / Reset View
  $("canvasUndo").onclick = () => practiceCanvas.undo();
  $("canvasRedo").onclick = () => practiceCanvas.redo();
  $("btnResetView").onclick = () => practiceCanvas.resetView();

  // 10. 3D Solid Model Inspector Modal
  $("btnView3D").onclick = async () => {
    if (!currentQuestion) return;
    $("preview3dDialog").showModal();
    const p = currentQuestion.parameters || {};

    $("preview3dTitle").textContent = `3D Model: ${currentQuestion.title}`;
    $("preview3dDesc").textContent = `Inspect spatial orientation in relation to HP & VP. Solid: ${p.solid || "model"}, Base: ${p.baseEdge || p.diameter || 30} mm, Height: ${p.height || 60} mm, Axis Inclination: ${p.alpha || 45}°.`;

    const host = $("preview3dHost");
    host.innerHTML = "";

    try {
      const { createRenderer } = await import("./js/renderer3d.js");
      preview3dRenderer?.dispose();
      preview3dRenderer = createRenderer(host);

      const solidType = p.solid || "squarePrism";
      const previewModel = buildSolid({
        solid: solidType,
        size: p.baseEdge || p.radius || (p.diameter ? p.diameter / 2 : 25),
        height: p.height || 60,
        alpha: p.alpha || 45,
        beta: p.beta || 0,
        roll: 0,
      });

      preview3dRenderer.update(previewModel);
      preview3dRenderer.view("iso");
    } catch (err) {
      host.textContent = "3D WebGL renderer unavailable. Ensure WebGL support.";
      console.error(err);
    }
  };

  const close3d = () => {
    $("preview3dDialog").close();
    preview3dRenderer?.dispose();
    preview3dRenderer = null;
  };
  $("closePreview3d").onclick = close3d;
  $("closePreview3dBtn").onclick = close3d;

  // Initialize Live 3D Step Visualizer side column
  try {
    const p3dHost = $("practice3dHost");
    if (p3dHost) {
      livePractice3D = createPractice3D(p3dHost);
    }
  } catch (err) {
    console.warn("Live 3D Step Visualizer initialization failed", err);
  }

  // Real-time mirroring of student's 2D canvas strokes on 3D HP/VP planes
  practiceCanvas.onElementsChanged = (elements) => {
    livePractice3D?.updateStrokes(elements);
  };

  // 3D preset views (Iso, FV, TV)
  document.querySelectorAll("[data-pview]").forEach((btn) => {
    btn.onclick = () => {
      document
        .querySelectorAll("[data-pview]")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      livePractice3D?.view(btn.dataset.pview);
    };
  });

  // Toggle 3D column size (standard vs expanded)
  const bodyEl = $("practiceWorkspaceBody");
  if ($("btnToggle3DCol") && bodyEl) {
    $("btnToggle3DCol").onclick = () => {
      bodyEl.classList.toggle("expanded-3d");
      setTimeout(() => {
        practiceCanvas?.resize();
        livePractice3D?.resize();
      }, 50);
    };
  }

  // Initialize with all questions
  updateQuestionDropdown("all");
}

// Initial render
render();

// Setup 3D visualizer for the Projections mode
try {
  const { createRenderer } = await import("./js/renderer3d.js");
  renderer = createRenderer($("threeHost"));
  renderer.update(model || buildSolid(state));
  renderer.view("iso");
  $("threeLoading").remove();
  $("status").textContent = "Geometry engine ready";
} catch (error) {
  $("threeLoading").textContent =
    "3D unavailable. Check WebGL support and your connection to jsDelivr. The 2D studio and exports remain available.";
  $("status").textContent = "2D studio ready · 3D unavailable";
  console.error(error);
}
