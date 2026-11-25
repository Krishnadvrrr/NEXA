import { buildSolid } from "./js/geometry.js";
import { solidDrawing, drawingStyles } from "./js/drafting.js";
import { downloadSheet, practiceDrawing } from "./js/export.js";
import { QUESTIONS, TOPICS } from "./js/data/questions.js";
import { validateStep } from "./js/stepValidator.js";
import { PracticeCanvas } from "./js/practiceCanvas.js";
import { createPractice3D } from "./js/practice3d.js";
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
  modelKey = "";

// Practice Studio state
let customQuestions = loadCustomQuestions(),
  practiceCanvas = null,
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
  state.beta = Math.min(state.beta, 90 - state.alpha);
  for (const key of ["solid", "side"])
    if (![...$(key).options].some((o) => o.value === state[key]))
      state[key] = defaults[key];
  if (!["solid", "practice"].includes(state.mode)) state.mode = "solid";
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

  const practice = state.mode === "practice";

  document.body.classList.toggle("practice-mode", practice);

  $("solidControls").hidden = practice;
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
  } else {
    $("modeTitle").textContent = "Solid projections";
    $("modeDescription").textContent = "";
    $("workspaceTitle").textContent = "First-angle projections";
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
  render();
  renderer?.view("iso");
  $("notice").textContent = "Workspace reset.";
  save();
};

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
    $("stepHint").textContent = step.hint;

    $("btnPrevStep").disabled = currentStepIndex === 0;
    $("btnNextStep").textContent =
      currentStepIndex === steps.length - 1 ? "Problem Complete ✓" : "Next Step →";

    // Auto-select required pencil grade
    if (step.lineType) {
      $("pencilGradeSelect").value = step.lineType;
      practiceCanvas.pencilGrade = step.lineType;
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
      const isCurvedSolid = solidType === "cylinder" || solidType === "cone";
      const sizeParam = isCurvedSolid
        ? p.radius || (p.diameter ? p.diameter / 2 : 20)
        : p.baseEdge || 30;
      const previewModel = buildSolid({
        solid: solidType,
        size: sizeParam,
        height: p.height || 60,
        alpha: p.alpha !== undefined ? p.alpha : 90,
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

  // Real-time mirroring of student's 2D canvas strokes & live cursor/drag preview in 3D
  practiceCanvas.onElementsChanged = (elements) => {
    livePractice3D?.updateStrokes(elements);
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
