import { buildSolid } from "./js/geometry.js";
import { solidDrawing, drawingStyles } from "./js/drafting.js";
import { downloadSheet, practiceDrawing } from "./js/export.js";
import { QUESTIONS, TOPICS } from "./js/data/questions.js";
import { validateStep } from "./js/stepValidator.js";
import { PracticeCanvas } from "./js/practiceCanvas.js";
import { createPractice3D } from "./js/practice3d.js";
import { initAutocadWorkspaceUI } from "./js/autocadRibbon.js";
import { formatStepAutoCadCommand } from "./js/commandParser.js";
import { ISOMETRIC_QUESTIONS, ISO_UNIT_ID } from "./js/data/isometricQuestions.js";
import { createIsoLabController } from "./js/isoLabController.js";
import { ISO_SCALE } from "./js/isoCameraRig.js";
import {
  SOLID_CATALOG,
  parseFacultyQuestionText,
  buildQuestionComprehension,
  buildCustomQuestion,
  loadCustomQuestions,
  saveCustomQuestions,
} from "./js/customQuestionEngine.js";

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
  sectionEnabled: false,
  cutAngle: 45,
  cutHeightPct: 50,
  explodeCut: false,
  explodeDist: 28,
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
  lastSave = 0,
  modelKey = "",
  sectionKey = "";

// Practice Studio & Isometric Lab state
let customQuestions = loadCustomQuestions(),
  practiceCanvas = null,
  livePractice3D = null,
  isoLab = null,
  selectedIsoQuestionId = ISOMETRIC_QUESTIONS[0]?.id || null,
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
  for (const key of ["size", "height"])
    state[key] = Math.min(
      key === "height" ? 200 : 150,
      Math.max(1, Number.isFinite(state[key]) ? state[key] : defaults[key]),
    );
  for (const key of ["alpha", "beta", "roll"])
    state[key] = Math.max(
      0,
      Math.min(
        key === "roll" ? 180 : 90,
        Number.isFinite(state[key]) ? state[key] : defaults[key],
      ),
    );
  state.cutAngle = Math.max(-75, Math.min(75, Number.isFinite(state.cutAngle) ? state.cutAngle : 45));
  state.cutHeightPct = Math.max(10, Math.min(90, Number.isFinite(state.cutHeightPct) ? state.cutHeightPct : 50));
  state.explodeDist = Math.max(0, Math.min(55, Number.isFinite(state.explodeDist) ? state.explodeDist : 28));
  state.beta = Math.min(state.beta, 90 - state.alpha);
  for (const key of ["solid", "side"])
    if (![...$(key).options].some((o) => o.value === state[key]))
      state[key] = defaults[key];
  if (!["solid", "isometric", "practice"].includes(state.mode)) state.mode = "solid";
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
  for (const key of ["alpha", "beta", "roll"])
    $(key + "Value").textContent = state[key].toFixed(0) + "°";
  if ($("cutAngleValue")) $("cutAngleValue").textContent = `${state.cutAngle.toFixed(0)}°`;
  if ($("cutHeightPctValue")) $("cutHeightPctValue").textContent = `${state.cutHeightPct.toFixed(0)}%`;
  if ($("explodeDistValue")) $("explodeDistValue").textContent = `${state.explodeDist.toFixed(0)} mm`;
  if ($("sectionControls")) $("sectionControls").hidden = !state.sectionEnabled;

  const practice = state.mode === "practice";
  const isoMode = state.mode === "isometric";

  document.body.classList.toggle("practice-mode", practice);
  document.body.classList.toggle("iso-lab-mode", isoMode);

  $("solidControls").hidden = practice || isoMode;
  if ($("isoControls")) $("isoControls").hidden = !isoMode;
  $("practiceControls").hidden = !practice;

  const layerCtrl = $("layerControls");
  if (layerCtrl) layerCtrl.hidden = practice || isoMode;

  $("panels").hidden = practice || isoMode;
  if ($("isoWorkspace")) $("isoWorkspace").hidden = !isoMode;
  $("practiceWorkspace").hidden = !practice;

  const insightEl = $("insightTitle")?.closest(".insight");
  if (insightEl) insightEl.hidden = practice || isoMode;

  document.querySelectorAll(".mode").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === state.mode);
    b.setAttribute("aria-pressed", b.dataset.mode === state.mode);
  });

  if (practice) {
    $("modeTitle").textContent = "Practice Studio";
    $("modeDescription").textContent = "";
    $("workspaceTitle").textContent = "";
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
  } else if (isoMode) {
    $("modeTitle").textContent = "Isometric Lab";
    $("modeDescription").textContent = "";
    $("workspaceTitle").textContent = "Unit V · Isometric Projection Mastery";
    document.querySelectorAll("[data-view]").forEach((b) => (b.disabled = true));
    $("angleStatus").textContent = "ORTHO (1,1,1) · 45° / 35.264°";
    if (!isoLab) {
      initIsometricLab();
    } else {
      setTimeout(() => isoLab.resize(), 10);
    }
  } else {
    $("modeTitle").textContent = "Solid projections";
    $("modeDescription").textContent = "";
    $("workspaceTitle").textContent = "First-angle projections";
    $("drawingTitle").innerHTML = "Orthographic sheet <span>2D</span>";
    $("drawingTag").textContent = state.sectionEnabled ? "SECTION · FIRST ANGLE" : "FIRST ANGLE";
    $("height").disabled = state.solid === "cube";
    $("sizeLabel").textContent = ["cylinder", "cone"].includes(state.solid)
      ? "Base radius"
      : "Base edge";
    $("hidden").closest("label").hidden = false;
    document.querySelectorAll("[data-view]").forEach((b) => (b.disabled = false));
    $("angleStatus").textContent = state.sectionEnabled
      ? `α ${state.alpha}° · β ${state.beta}° · θ ${state.cutAngle}°`
      : `α ${state.alpha}° · β ${state.beta}°`;
  }
}

function save() {
  try {
    localStorage.setItem("eg-studio-v1", JSON.stringify(state));
  } catch {}
}

function getSectionPayload() {
  return {
    enabled: Boolean(state.sectionEnabled),
    angleDeg: Number(state.cutAngle) || 45,
    heightPct: Number(state.cutHeightPct) || 50,
    explodeEnabled: Boolean(state.explodeCut),
    explodeDist: Number(state.explodeDist) || 0,
  };
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

  if (state.mode === "isometric") {
    if (isoLab) isoLab.resize();
    $("status").textContent = "Isometric Lab active · True (1,1,1) Orthographic Camera";
    return;
  }

  const key = [
    state.solid,
    state.size,
    state.height,
    state.alpha,
    state.beta,
    state.roll,
  ].join(":");
  const sKey = [
    state.sectionEnabled,
    state.cutAngle,
    state.cutHeightPct,
    state.explodeCut,
    state.explodeDist,
  ].join(":");
  if (key !== modelKey || sKey !== sectionKey) {
    if (key !== modelKey) {
      model = buildSolid(state);
      modelKey = key;
    }
    renderer?.update(model, getSectionPayload());
    sectionKey = sKey;
  }
  drawing = solidDrawing(model, state);
  $("insightTitle").textContent = "Follow the projectors";
  $("insightText").textContent =
    "Front and top share width. Front and side share height. Dimensions show projected overall extents, not true sloping lengths.";
  $("drawingFoot").innerHTML =
    `FV above XY · TV below XY <span>${state.side === "right" ? "Right-side view on the left" : "Left-side view on the right"}</span>`;

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

// Solid controls listener setup
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
  state = { ...defaults, mode: state.mode };
  sectionKey = "";
  render();
  renderer?.view("iso");
  $("notice").textContent = "Workspace reset.";
  save();
};

if ($("btnInspectCutSidebar")) {
  $("btnInspectCutSidebar").onclick = () => {
    renderer?.view("inspectCut");
  };
}

function svgPoint(event) {
  const p = new DOMPoint(event.clientX, event.clientY);
  return p.matrixTransform($("drawing").getScreenCTM().inverse());
}

$("drawing").addEventListener("pointermove", (e) => {
  if (!drawing?.scale) return;
  const p = svgPoint(e);
  $("coordinates").textContent =
    `SHEET X ${(p.x / drawing.scale).toFixed(1)} · Y ${(p.y / drawing.scale).toFixed(1)} mm`;
});

// Export sheet dialog
$("export").onclick = () => {
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
  isoLab?.dispose();
});

window.addEventListener("resize", () => {
  renderer?.resize();
  practiceCanvas?.resize();
  livePractice3D?.resize();
  isoLab?.resize();
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

  function getAllQuestions() {
    return [...customQuestions, ...QUESTIONS];
  }

  // 2. Populate Questions based on Topic
  function updateQuestionDropdown(topicId, preferredQuestionId = null) {
    const qSelect = $("questionSelect");
    qSelect.innerHTML = "";
    const allQuestions = getAllQuestions();

    if (topicId === "free-practice") {
      const opt = document.createElement("option");
      opt.value = "free";
      opt.textContent = "Free Practice — Open Digital Drafting Sheet";
      qSelect.appendChild(opt);
    } else if (topicId === "custom") {
      if (customQuestions.length === 0) {
        const opt = document.createElement("option");
        opt.value = "empty-custom";
        opt.textContent = "No custom questions yet — click '+ Add Question'";
        qSelect.appendChild(opt);
      } else {
        customQuestions.forEach((q) => {
          const opt = document.createElement("option");
          opt.value = q.id;
          opt.textContent = `[Custom] ${q.unit}: ${q.title}`;
          qSelect.appendChild(opt);
        });
      }
    } else {
      const filtered =
        topicId === "all"
          ? allQuestions
          : allQuestions.filter((q) => q.unit === topicId);
      filtered.forEach((q) => {
        const opt = document.createElement("option");
        opt.value = q.id;
        opt.textContent = `${q.isCustom ? "[Custom] " : ""}${q.unit}: ${q.title}`;
        qSelect.appendChild(opt);
      });
    }

    if (preferredQuestionId && [...qSelect.options].some((o) => o.value === preferredQuestionId)) {
      qSelect.value = preferredQuestionId;
    }
    loadActiveQuestion();
  }

  topicSelect.onchange = () => updateQuestionDropdown(topicSelect.value);

  // 3. Load Selected Question
  const qSelect = $("questionSelect");
  qSelect.onchange = () => loadActiveQuestion();

  function renderComprehensionCard(q) {
    const comp = buildQuestionComprehension(q);
    const details = $("problemUnderstandDetails");
    if (!details || !comp) {
      if (details) details.hidden = true;
      return;
    }
    details.hidden = false;
    details.open = Boolean(q.isCustom);

    $("understandSetup").textContent = comp.simplePositionRule || "";
    $("understandOrientation").textContent = comp.baseOrientationRule || "";

    const calcList = $("understandCalcs");
    calcList.innerHTML = "";
    for (const item of comp.calculations || []) {
      const li = document.createElement("li");
      li.textContent = item;
      calcList.appendChild(li);
    }
    $("understandTip").textContent = comp.visibilityTip ? `Tip: ${comp.visibilityTip}` : "";
  }

  function loadActiveQuestion() {
    const qId = qSelect.value;
    const isFree = qId === "free" || qId === "empty-custom";
    const allQuestions = getAllQuestions();

    $("problemCard").hidden = isFree;
    $("stepCard").hidden = isFree;

    if (isFree) {
      currentQuestion = null;
      practiceCanvas.ghostElements = [];
      practiceCanvas.render();
      livePractice3D?.updateStage(null, 0, practiceCanvas.elements);
      $("notice").textContent =
        qId === "empty-custom"
          ? "Click '+ Add Question' to enter your own problem."
          : "Free Practice mode active. Full drafting freedom.";
      return;
    }

    currentQuestion = allQuestions.find((q) => q.id === qId) || allQuestions[0];
    currentStepIndex = 0;

    // Update Problem Card UI
    $("problemUnitBadge").textContent =
      (currentQuestion.isCustom ? "CUSTOM · " : "") + currentQuestion.unit.toUpperCase();
    $("problemTitle").textContent = currentQuestion.title;
    $("problemStatement").textContent = currentQuestion.problemStatement;

    const delBtn = $("btnDeleteCustomQ");
    if (delBtn) delBtn.hidden = !currentQuestion.isCustom;

    const isIsoQ = currentQuestion.unit === ISO_UNIT_ID;
    const isoJumpBtn = $("btnViewIso3D");
    if (isoJumpBtn) {
      isoJumpBtn.hidden = !isIsoQ;
      isoJumpBtn.onclick = () => {
        selectedIsoQuestionId = currentQuestion.id;
        state.mode = "isometric";
        schedule();
        setTimeout(() => {
          if ($("isoQuestionSelect")) {
            $("isoQuestionSelect").value = currentQuestion.id;
            isoLab?.loadQuestion(currentQuestion);
          }
        }, 30);
      };
    }
    if (practiceCanvas) {
      practiceCanvas.setIsoDraft(isIsoQ, "top");
    }

    const paramContainer = $("problemParams");
    paramContainer.innerHTML = "";
    for (const [k, v] of Object.entries(currentQuestion.parameters || {})) {
      if (typeof v === "number" || typeof v === "string") {
        const tag = document.createElement("span");
        tag.className = "param-tag";
        const isAngle = k.toLowerCase().includes("angle") || k === "alpha" || k === "beta";
        tag.textContent = `${k}: ${v}${typeof v === "number" ? (isAngle ? "°" : "mm") : ""}`;
        paramContainer.appendChild(tag);
      }
    }

    renderComprehensionCard(currentQuestion);
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
    if ($("stepAutoCadHint")) {
      $("stepAutoCadHint").textContent = `💻 AutoCAD: ${formatStepAutoCadCommand(step, currentQuestion)}`;
    }
    $("stepHint").textContent = step.hint;

    $("btnPrevStep").disabled = currentStepIndex === 0;
    $("btnNextStep").textContent =
      currentStepIndex === steps.length - 1 ? "Problem Complete ✓" : "Next Step →";

    // Auto-select required AutoCAD layer & pencil grade
    if (step.lineType) {
      if ($("pencilGradeSelect")) $("pencilGradeSelect").value = step.lineType;
      practiceCanvas.setPencilGrade(step.lineType);
    }

    // Auto-prefill Polygon generator settings when step provides suggestedPolygon
    if (step.suggestedPolygon) {
      practiceCanvas.polygonSettings = { ...step.suggestedPolygon };
      if ($("polySides")) $("polySides").value = String(step.suggestedPolygon.sides);
      if ($("polyEdge")) $("polyEdge").value = String(step.suggestedPolygon.edgeLength);
      if ($("polyAngle")) $("polyAngle").value = String(step.suggestedPolygon.angle);
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
    practiceCanvas.activateTool("polygon");
    $("notice").textContent = "Click on the drafting sheet to place the polygon.";
  };

  if ($("pencilGradeSelect")) {
    $("pencilGradeSelect").onchange = (e) => {
      practiceCanvas.setPencilGrade(e.target.value);
    };
  }

  if ($("btnToggleOrtho")) {
    $("btnToggleOrtho").onclick = () => practiceCanvas.toggleAid("ortho");
  }

  if ($("btnToggleAngleSnap")) {
    $("btnToggleAngleSnap").onclick = () => practiceCanvas.toggleAid("polar");
  }

  // Explicit Angle & Length Precision Locks
  const angleInput = $("angleLockInput");
  const angleClear = $("btnClearAngleLock");
  const angleRelBtn = $("btnAngleRelMode");
  const lenInput = $("lengthLockInput");
  const lenClear = $("btnClearLengthLock");

  if (angleInput) {
    const applyAngleLock = () => {
      const val = angleInput.value.trim();
      const num = parseFloat(val);
      if (val !== "" && Number.isFinite(num)) {
        practiceCanvas.lockedAngleDeg = num;
        angleInput.closest(".cad-lock-pill")?.classList.add("locked");
        if (angleClear) angleClear.hidden = false;
      } else {
        practiceCanvas.lockedAngleDeg = null;
        angleInput.closest(".cad-lock-pill")?.classList.remove("locked");
        if (angleClear) angleClear.hidden = true;
      }
    };
    angleInput.addEventListener("input", applyAngleLock);
    angleInput.addEventListener("change", applyAngleLock);
    if (angleClear) {
      angleClear.onclick = () => {
        angleInput.value = "";
        applyAngleLock();
      };
    }
  }

  if (angleRelBtn) {
    angleRelBtn.onclick = () => {
      const next = practiceCanvas.angleRelativeTo === "edge" ? "xy" : "edge";
      practiceCanvas.angleRelativeTo = next;
      angleRelBtn.textContent = next === "edge" ? "Edge" : "XY";
      angleRelBtn.classList.toggle("edge-mode", next === "edge");
    };
  }

  if (lenInput) {
    const applyLenLock = () => {
      const val = lenInput.value.trim();
      const num = parseFloat(val);
      if (val !== "" && Number.isFinite(num) && num > 0) {
        practiceCanvas.lockedLengthMm = num;
        lenInput.closest(".cad-lock-pill")?.classList.add("locked");
        if (lenClear) lenClear.hidden = false;
      } else {
        practiceCanvas.lockedLengthMm = null;
        lenInput.closest(".cad-lock-pill")?.classList.remove("locked");
        if (lenClear) lenClear.hidden = true;
      }
    };
    lenInput.addEventListener("input", applyLenLock);
    lenInput.addEventListener("change", applyLenLock);
    if (lenClear) {
      lenClear.onclick = () => {
        lenInput.value = "";
        applyLenLock();
      };
    }
  }

  // Undo / Redo / Reset View
  if ($("canvasUndo")) $("canvasUndo").onclick = () => practiceCanvas.undo();
  if ($("canvasRedo")) $("canvasRedo").onclick = () => practiceCanvas.redo();
  if ($("btnResetView")) $("btnResetView").onclick = () => practiceCanvas.resetView();

  // 10. 3D Solid Model Inspector Modal (routes Isometric problems straight to interactive Isometric Lab)
  $("btnView3D").onclick = async () => {
    if (!currentQuestion) return;
    if (currentQuestion.unit === ISO_UNIT_ID && $("btnViewIso3D")) {
      $("btnViewIso3D").click();
      return;
    }
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
      const isCurvedSolid = solidType === "cylinder" || solidType === "cone";
      const sizeParam = isCurvedSolid
        ? p.radius || (p.diameter ? p.diameter / 2 : 20)
        : p.baseEdge || 30;
      const hParam = p.height || 60;
      const previewModel = buildSolid({
        solid: solidType,
        size: sizeParam,
        height: hParam,
        alpha: p.alpha !== undefined ? p.alpha : 90,
        beta: p.beta || 0,
        roll: 0,
      });

      const isSectionProblem = currentQuestion.unit === "Section of Solids" || currentQuestion.unit === "Development of Surfaces";
      const cutPct = isSectionProblem ? Math.max(15, Math.min(85, ((p.cutHeight || hParam / 2) / hParam) * 100)) : 50;
      preview3dRenderer.update(previewModel, {
        enabled: isSectionProblem,
        angleDeg: p.cuttingAngle || 45,
        heightPct: cutPct,
        explodeEnabled: isSectionProblem,
        explodeDist: isSectionProblem ? 18 : 0,
      });
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

  // 11. Custom / Faculty Question Dialog & Deletion
  const customDlg = $("customQuestionDialog");
  if (customDlg) {
    const syncCustomFormFields = () => {
      const unitVal = $("customUnit").value;
      const solidVal = $("customSolid").value;
      const meta = SOLID_CATALOG[solidVal] || SOLID_CATALOG.squarePrism;

      $("customBaseLabel").textContent = meta.isCurved ? "Base diameter" : "Base edge";
      $("customHeight").disabled = Boolean(meta.isCube);
      if (meta.isCube) $("customHeight").value = $("customBaseSize").value;

      const isProj = unitVal === "Projection of Solids";
      const isMidpoint = $("customCutMode").value === "midpoint";
      $("customProjFields").hidden = !isProj;
      $("customSectionFields").hidden = isProj;
      $("customCutOffsetWrap").hidden = isMidpoint;

      $("customRestingOn").disabled = !isProj;
      $("customAlpha").disabled = !isProj;
      $("customCutAngle").disabled = isProj;
      $("customCutMode").disabled = isProj;
      $("customCutOffset").disabled = isProj || isMidpoint;

      // Update Live Comprehension Preview
      const previewSpec = readCustomFormSpec();
      const previewQ = buildCustomQuestion(previewSpec);
      const comp = previewQ.comprehension;
      $("customPreviewSummary").textContent = `${previewQ.steps.length} guided steps ready · ${comp.simplePositionRule}`;
      const list = $("customPreviewCalcs");
      list.innerHTML = "";
      for (const c of comp.calculations || []) {
        const li = document.createElement("li");
        li.textContent = c;
        list.appendChild(li);
      }
    };

    const readCustomFormSpec = () => ({
      unit: $("customUnit").value,
      solid: $("customSolid").value,
      baseEdge: Number($("customBaseSize").value) || 30,
      diameter: Number($("customBaseSize").value) || 40,
      height: Number($("customHeight").value) || 60,
      restingOn: $("customRestingOn").value,
      alpha: Number($("customAlpha").value) || 45,
      cuttingAngle: Number($("customCutAngle").value) || 45,
      cutMode: $("customCutMode").value,
      cutOffset: Number($("customCutOffset").value) || 20,
      title: $("customTitle").value,
      problemStatement: $("customRawText").value,
    });

    $("btnAddCustomQuestion").onclick = () => {
      $("parseStatusMsg").textContent = "";
      syncCustomFormFields();
      customDlg.showModal();
    };
    $("closeCustomQuestionDialog").onclick = () => customDlg.close();

    $("btnParseQuestion").onclick = () => {
      const raw = $("customRawText").value;
      if (!raw.trim()) {
        $("parseStatusMsg").textContent = "Paste or type a question statement first.";
        return;
      }
      const { spec, detected } = parseFacultyQuestionText(raw);
      $("customUnit").value = spec.unit;
      $("customSolid").value = spec.solid;
      const meta = SOLID_CATALOG[spec.solid];
      $("customBaseSize").value = meta?.isCurved ? spec.diameter : spec.baseEdge;
      $("customHeight").value = spec.height;
      $("customRestingOn").value = spec.restingOn === "base corner" ? "base corner" : "base edge";
      $("customAlpha").value = spec.alpha;
      $("customCutAngle").value = spec.cuttingAngle;
      $("customCutMode").value = spec.cutMode;
      $("customCutOffset").value = spec.cutOffset;
      $("customTitle").value = spec.title;
      $("parseStatusMsg").textContent = `Detected: ${detected.join(" · ")}`;
      syncCustomFormFields();
    };

    [
      "customUnit",
      "customSolid",
      "customBaseSize",
      "customHeight",
      "customRestingOn",
      "customAlpha",
      "customCutAngle",
      "customCutMode",
      "customCutOffset",
    ].forEach((id) => {
      const el = $(id);
      if (el) {
        el.addEventListener("input", syncCustomFormFields);
        el.addEventListener("change", syncCustomFormFields);
      }
    });

    $("customQuestionForm").onsubmit = (e) => {
      e.preventDefault();
      const spec = readCustomFormSpec();
      const newQ = buildCustomQuestion(spec);
      customQuestions = [newQ, ...customQuestions];
      saveCustomQuestions(customQuestions);
      customDlg.close();

      if (practiceCanvas.elements.length > 0) {
        practiceCanvas.clearCanvas();
      }
      topicSelect.value = "all";
      updateQuestionDropdown("all", newQ.id);
      $("notice").textContent = `Added custom question "${newQ.title}" with ${newQ.steps.length} guided steps.`;
    };
  }

  if ($("btnDeleteCustomQ")) {
    $("btnDeleteCustomQ").onclick = () => {
      if (!currentQuestion || !currentQuestion.isCustom) return;
      if (confirm(`Delete custom question "${currentQuestion.title}"?`)) {
        customQuestions = customQuestions.filter((q) => q.id !== currentQuestion.id);
        saveCustomQuestions(customQuestions);
        updateQuestionDropdown(topicSelect.value);
        $("notice").textContent = "Custom question deleted.";
      }
    };
  }

  // Initialize Live 3D Step Visualizer side column
  try {
    const p3dHost = $("practice3dHost");
    if (p3dHost) {
      livePractice3D = createPractice3D(p3dHost);
    }
  } catch (err) {
    console.warn("Live 3D Step Visualizer initialization failed", err);
  }

  // Initialize AutoCAD Ribbon, Command Line, Layer Dropdown, Status Bar, Model/Layout & Habit Coach
  const acadUI = initAutocadWorkspaceUI({
    canvasEngine: practiceCanvas,
    getQuestionContext: () => ({
      title: currentQuestion?.title || "Engineering Graphics — Model Sheet",
      student: $("studentName")?.value || "",
    }),
    onLearningModeChanged: (mode) => {
      if (mode === "pure") {
        practiceCanvas.showGhostGuide = false;
        if ($("btnToggleGhost")) {
          $("btnToggleGhost").classList.remove("active");
          $("btnToggleGhost").textContent = "👻 Ghost Guide: OFF";
        }
        practiceCanvas.render();
      } else {
        updateStepUI();
      }
    },
  });

  // Real-time mirroring of student's 2D canvas strokes & live cursor/drag preview in 3D
  practiceCanvas.onElementsChanged = (elements) => {
    livePractice3D?.updateStrokes(elements);
    acadUI.refreshLayoutIfActive();
  };
  practiceCanvas.onPreviewChanged = (payload) => {
    livePractice3D?.updateCursorAndPreview(payload);
  };

  // 3D preset views (Iso, FV, TV, SV)
  document.querySelectorAll("[data-pview]").forEach((btn) => {
    btn.onclick = () => {
      document
        .querySelectorAll("[data-pview]")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      livePractice3D?.view(btn.dataset.pview);
    };
  });

  // 3D Sync mode toggle (Stage vs From 2D)
  document.querySelectorAll("[data-syncmode]").forEach((btn) => {
    btn.onclick = () => {
      document
        .querySelectorAll("[data-syncmode]")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      livePractice3D?.setSyncMode(btn.dataset.syncmode);
    };
  });

  // Projection rays toggle
  if ($("btnToggle3DRays")) {
    let raysOn = true;
    $("btnToggle3DRays").onclick = () => {
      raysOn = !raysOn;
      $("btnToggle3DRays").classList.toggle("active", raysOn);
      livePractice3D?.setShowRays(raysOn);
    };
  }

  // Interactive HP Dihedral Fold / Unfold controls (0° = 3D room, 90° = 2D flat sheet)
  if ($("hpFoldSlider") && $("btnToggleFold")) {
    const syncFoldLabel = (deg) => {
      $("hpFoldVal").textContent = `${Math.round(deg)}°`;
      const isFlat = deg >= 45;
      $("btnToggleFold").classList.toggle("active", isFlat);
      $("btnToggleFold").textContent = isFlat ? "Fold 3D" : "Unfold 90°";
    };
    $("hpFoldSlider").addEventListener("input", () => {
      const deg = Number($("hpFoldSlider").value) || 0;
      livePractice3D?.setFoldAngle(deg, true);
      syncFoldLabel(deg);
    });
    $("btnToggleFold").onclick = () => {
      const next = (livePractice3D?.foldDeg || 0) >= 45 ? 0 : 90;
      livePractice3D?.setFoldAngle(next, false);
      syncFoldLabel(next);
    };
  }

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
  window.__egPracticeHelpers = {
    selectQuestion: (topicId, qId) => {
      topicSelect.value = topicId;
      updateQuestionDropdown(topicId, qId);
      practiceCanvas?.setIsoDraft(true, "top");
      practiceCanvas?.resetView();
    }
  };
}

// ===========================================================================
// 3D ISOMETRIC PROJECTION LAB CONTROLLER
// ===========================================================================
function initIsometricLab() {
  const hostEl = $("isoThreeHost");
  if (!hostEl) return;

  isoLab = createIsoLabController({
    viewportEl: hostEl,
    insetEl: $("isoInsetSvgHost"),
    explainerCanvasEl: $("isoExplainerCanvas")
  });

  const qSelect = $("isoQuestionSelect");
  if (qSelect) {
    qSelect.innerHTML = "";
    ISOMETRIC_QUESTIONS.forEach((q, idx) => {
      const opt = document.createElement("option");
      opt.value = q.id;
      opt.textContent = `${idx + 1}. ${q.title}`;
      qSelect.appendChild(opt);
    });
    if (selectedIsoQuestionId) qSelect.value = selectedIsoQuestionId;
  }

  const syncInputsFromQuestion = (q) => {
    const p = q?.parameters || {};
    const hasTop = p.topEdge !== undefined;
    const hasCut = p.cutAngle !== undefined || p.cuttingAngle !== undefined;
    $("isoBaseDimLbl").textContent = p.diameter ? "Diameter" : "Base Edge";
    $("isoBaseInput").value = p.diameter || p.baseEdge || 30;
    $("isoHeightInput").value = p.height || 60;
    if ($("isoExtraDimRow")) $("isoExtraDimRow").hidden = !hasTop && !hasCut;
    if ($("isoTopWrap")) $("isoTopWrap").hidden = !hasTop;
    if ($("isoCutWrap")) $("isoCutWrap").hidden = !hasCut;
    if (hasTop) $("isoTopInput").value = p.topEdge;
    if (hasCut) $("isoCutAngleInput").value = p.cutAngle || p.cuttingAngle || 45;
    if ($("isoDualBoxRow")) $("isoDualBoxRow").hidden = !hasTop;
    if ($("isoGhostRow")) $("isoGhostRow").hidden = !hasCut;
  };

  isoLab.onStateChange((st) => {
    if (!st || !st.spec) return;
    const isView = st.scaleMode === "view";
    $("btnIsoModeProj")?.classList.toggle("active", !isView);
    $("btnIsoModeView")?.classList.toggle("active", isView);
    if ($("isoRuleBadge")) {
      $("isoRuleBadge").textContent = isView
        ? "Isometric View (1:1): Draws true dimensions directly along 30°/150°/90° axes (× 1.000)."
        : "Isometric Projection (0.8165): Multiplies every axis edge by √(2/3) ≈ 0.8165 (Sphere keeps True R).";
    }

    const refTrue = st.spec.metrics.trueW || 40;
    const refShown = isView ? refTrue : refTrue * ISO_SCALE;
    if ($("isoScaleRatioLabel")) $("isoScaleRatioLabel").textContent = isView ? "1.000× (View)" : "0.8165× (Proj)";
    if ($("isoValTrue")) $("isoValTrue").textContent = `${refTrue.toFixed(1)} mm`;
    if ($("isoValShown")) $("isoValShown").textContent = `${refShown.toFixed(1)} mm`;
    if ($("isoBarShown")) $("isoBarShown").style.width = isView ? "100%" : `${(ISO_SCALE * 100).toFixed(2)}%`;

    if ($("isoDimSummary")) {
      const m = st.spec.metrics;
      $("isoDimSummary").textContent = `Box: ${m.shownW.toFixed(1)} × ${m.shownD.toFixed(1)} × ${m.shownH.toFixed(1)} mm`;
    }
    if ($("isoCamLockBadge")) {
      $("isoCamLockBadge").textContent = st.camSnappedToIso
        ? "ORTHO (1,1,1) · 45° / 35.264° LOCKED"
        : "ORBITED · Click Snap True Iso (1,1,1)";
    }
    if ($("isoSphereRuleBanner")) {
      $("isoSphereRuleBanner").hidden = !st.spec.sphereSpec;
    }

    document.querySelectorAll("[data-isostage]").forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset.isostage) === st.stage);
    });
    if ($("isoStageSlider")) $("isoStageSlider").value = String(st.stage);
    if ($("isoStageCaption")) $("isoStageCaption").textContent = st.stageDescription || "";
  });

  const loadById = (id) => {
    selectedIsoQuestionId = id;
    const q = ISOMETRIC_QUESTIONS.find((item) => item.id === id) || ISOMETRIC_QUESTIONS[0];
    syncInputsFromQuestion(q);
    isoLab.loadQuestion(q);
  };

  qSelect?.addEventListener("change", () => loadById(qSelect.value));

  $("btnIsoModeProj")?.addEventListener("click", () => isoLab.setScaleMode("projection"));
  $("btnIsoModeView")?.addEventListener("click", () => isoLab.setScaleMode("view"));
  $("btnResetTrueIso")?.addEventListener("click", () => isoLab.snapToTrueIso(true));

  ["isoBaseInput", "isoHeightInput", "isoTopInput", "isoCutAngleInput"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("input", () => {
      const activeQ = ISOMETRIC_QUESTIONS.find((item) => item.id === qSelect?.value) || ISOMETRIC_QUESTIONS[0];
      const baseP = { ...(activeQ?.parameters || {}) };
      const bVal = Number($("isoBaseInput").value) || 30;
      const hVal = Number($("isoHeightInput").value) || 60;
      if (baseP.diameter !== undefined) {
        baseP.diameter = bVal;
        baseP.radius = bVal / 2;
      } else {
        baseP.baseEdge = bVal;
      }
      baseP.height = hVal;
      if (baseP.topEdge !== undefined) baseP.topEdge = Number($("isoTopInput").value) || 15;
      if (baseP.cutAngle !== undefined || baseP.cuttingAngle !== undefined) {
        const ca = Number($("isoCutAngleInput").value) || 30;
        baseP.cutAngle = ca;
        baseP.cuttingAngle = ca;
        baseP.cutHeight = hVal / 2;
      }
      isoLab.loadCustomParams(baseP);
    });
  });

  $("isoShowBox")?.addEventListener("change", (e) => isoLab.setOverlayOptions({ showBox: e.target.checked }));
  $("isoShowOffsets")?.addEventListener("change", (e) => isoLab.setOverlayOptions({ showOffsets: e.target.checked }));
  $("isoShowDualBox")?.addEventListener("change", (e) => isoLab.setOverlayOptions({ showDualBox: e.target.checked }));
  $("isoShowGhost")?.addEventListener("change", (e) => isoLab.setOverlayOptions({ showGhost: e.target.checked }));

  $("btnPlayIsoTilt")?.addEventListener("click", () => isoLab.playTiltExplainer());
  $("isoTiltSlider")?.addEventListener("input", (e) => isoLab.setTiltProgress(Number(e.target.value) / 100));

  $("btnToggleIsoInset")?.addEventListener("click", () => {
    const inset = $("isoFvTvInset");
    if (!inset) return;
    const isCollapsed = inset.classList.toggle("collapsed");
    $("btnToggleIsoInset").textContent = isCollapsed ? "▸" : "▾";
  });

  document.querySelectorAll("[data-isostage]").forEach((btn) => {
    btn.addEventListener("click", () => isoLab.setStage(Number(btn.dataset.isostage)));
  });
  $("isoStageSlider")?.addEventListener("input", (e) => isoLab.setStage(Number(e.target.value)));

  // Seamless handoff into Practice Studio with ISODRAFT + exact GE3251 problem loaded!
  $("btnIsoToPractice")?.addEventListener("click", () => {
    const qId = qSelect?.value || selectedIsoQuestionId || ISOMETRIC_QUESTIONS[0].id;
    state.mode = "practice";
    schedule();
    setTimeout(() => {
      window.__egPracticeHelpers?.selectQuestion(ISO_UNIT_ID, qId);
      $("notice").textContent = "Practice Studio opened with ISODRAFT (F5 Isoplanes) & GE3251 Isometric problem!";
    }, 30);
  });

  loadById(selectedIsoQuestionId || ISOMETRIC_QUESTIONS[0].id);
}

// Initial render
render();

// Setup 3D visualizer for the Projections mode
try {
  const { createRenderer } = await import("./js/renderer3d.js");
  renderer = createRenderer($("threeHost"), {
    onSectionUpdate: ({ explodeEnabled, explodeDist }) => {
      state.explodeCut = Boolean(explodeEnabled);
      state.explodeDist = Number(explodeDist) || 0;
      sync();
      save();
    },
  });
  renderer.update(model || buildSolid(state), getSectionPayload());
  renderer.view("iso");
  $("threeLoading")?.remove();
  $("status").textContent = "Geometry engine ready";
} catch (error) {
  if ($("threeLoading")) {
    $("threeLoading").textContent =
      "3D unavailable. Check WebGL support and your connection to jsDelivr. The 2D studio and exports remain available.";
  }
  $("status").textContent = "2D studio ready · 3D unavailable";
  console.error(error);
}
