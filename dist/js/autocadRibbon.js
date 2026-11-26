import {
  AUTOCAD_COMMANDS,
  resolveCommandAlias,
  suggestCommands,
  getCommandByTool
} from "./commandParser.js";
import { sheetSVG, practiceDrawing, downloadSheet } from "./export.js";

/**
 * Authentic AutoCAD Ribbon Controller, Command Line Bar, Habit Coach,
 * Layer Properties Popup, Status Bar (F3/F7/F8/F9/F10/F12/LWT) & Model/Layout Tabs.
 */
export function initAutocadWorkspaceUI({
  canvasEngine,
  getQuestionContext = () => ({ title: "Engineering Graphics", student: "" }),
  onLearningModeChanged = () => {}
}) {
  const cmdInput = document.getElementById("acadCmdInput");
  const cmdPromptLabel = document.getElementById("acadCmdPrompt");
  const cmdLogEl = document.getElementById("acadCmdHistory");
  const cmdSuggestEl = document.getElementById("acadCmdSuggest");
  const coachToastEl = document.getElementById("acadCoachTip");

  const layerDropdownBtn = document.getElementById("btnLayerDropdown");
  const layerMenuEl = document.getElementById("acadLayerMenu");
  const activeLayerSwatch = document.getElementById("activeLayerSwatch");
  const activeLayerName = document.getElementById("activeLayerName");

  const modelTabBtn = document.getElementById("tabModelSpace");
  const layoutTabBtn = document.getElementById("tabLayoutSheet");
  const modelBodyEl = document.getElementById("practiceWorkspaceBody");
  const layoutSheetViewEl = document.getElementById("acadLayoutSheetView");
  const layoutPreviewHost = document.getElementById("acadLayoutPreviewHost");
  const layoutPaperSelect = document.getElementById("acadLayoutPaper");

  const btnModeGuided = document.getElementById("btnLearningGuided");
  const btnModePure = document.getElementById("btnLearningPure");

  const cmdHistory = [];
  let cmdHistoryIndex = -1;
  let lastExecutedCommand = "L";
  let learningMode = "guided"; // "guided" | "pure"
  let activeSpace = "model"; // "model" | "layout"

  function pushCommandLog(text, kind = "info") {
    if (!cmdLogEl) return;
    const row = document.createElement("div");
    row.className = `cmd-log-line ${kind}`;
    row.textContent = text;
    cmdLogEl.appendChild(row);
    while (cmdLogEl.children.length > 30) {
      cmdLogEl.removeChild(cmdLogEl.firstChild);
    }
    cmdLogEl.scrollTop = cmdLogEl.scrollHeight;
  }

  function showCoachTip(message) {
    if (!coachToastEl || !message) return;
    coachToastEl.textContent = message;
    coachToastEl.hidden = false;
  }

  // Expose logging + prompt callbacks to PracticeCanvas
  canvasEngine.onCommandPromptChange = (promptText) => {
    if (cmdPromptLabel) cmdPromptLabel.textContent = promptText;
  };
  canvasEngine.onCommandLog = (msg, kind = "info") => {
    pushCommandLog(msg, kind);
  };

  // Sync Layer Dropdown & Quick Properties Popup
  function renderLayerUI() {
    const active = canvasEngine.layerManager.getActiveLayer();
    if (activeLayerSwatch) activeLayerSwatch.style.background = active.color;
    if (activeLayerName) activeLayerName.textContent = `${active.name} (${active.lineweight.toFixed(2)}mm)`;

    if (!layerMenuEl) return;
    layerMenuEl.innerHTML = "";
    for (const layer of canvasEngine.layerManager.getAll()) {
      const row = document.createElement("div");
      row.className = `layer-row ${layer.id === active.id ? "active" : ""}`;
      row.innerHTML = `
        <button type="button" class="layer-vis-btn ${layer.visible ? "on" : "off"}" title="Toggle visibility" aria-label="Toggle ${layer.name} visibility">${layer.visible ? "💡" : "○"}</button>
        <button type="button" class="layer-lock-btn ${layer.locked ? "locked" : ""}" title="Toggle layer lock" aria-label="Lock ${layer.name}">${layer.locked ? "🔒" : "🔓"}</button>
        <span class="layer-color-dot" style="background:${layer.color}"></span>
        <button type="button" class="layer-select-btn" title="Set current layer">
          <span class="layer-name">${layer.name}</span>
          <span class="layer-meta">${layer.linetype} · ${layer.lineweight.toFixed(2)}mm</span>
        </button>
      `;

      row.querySelector(".layer-vis-btn").onclick = (e) => {
        e.stopPropagation();
        canvasEngine.layerManager.toggleVisibility(layer.id);
        renderLayerUI();
        canvasEngine.render();
      };
      row.querySelector(".layer-lock-btn").onclick = (e) => {
        e.stopPropagation();
        canvasEngine.layerManager.toggleLock(layer.id);
        renderLayerUI();
        canvasEngine.render();
      };
      row.querySelector(".layer-select-btn").onclick = (e) => {
        e.stopPropagation();
        canvasEngine.setLayer(layer.id);
        renderLayerUI();
        layerMenuEl.hidden = true;
      };
      layerMenuEl.appendChild(row);
    }
  }

  canvasEngine.onLayerChanged = () => renderLayerUI();
  renderLayerUI();

  if (layerDropdownBtn && layerMenuEl) {
    layerDropdownBtn.onclick = (e) => {
      e.stopPropagation();
      layerMenuEl.hidden = !layerMenuEl.hidden;
    };
    window.addEventListener("click", (e) => {
      if (!layerMenuEl.hidden && !layerMenuEl.contains(e.target) && e.target !== layerDropdownBtn) {
        layerMenuEl.hidden = true;
      }
    });
  }

  // Highlight active ribbon tool button
  function highlightToolButton(toolId) {
    document.querySelectorAll(".ribbon-tool-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tool === toolId);
    });
  }
  canvasEngine.onToolChanged = (toolId) => {
    highlightToolButton(toolId);
  };

  // Ribbon tool clicks (+ AutoCAD Habit Coach Micro-Hints!)
  document.querySelectorAll(".ribbon-tool-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const toolId = btn.dataset.tool;
      if (!toolId) return;
      if (toolId === "zoom_extents") {
        canvasEngine.zoomExtents();
        pushCommandLog("Command: Z (ZOOM Extents)", "cmd");
        showCoachTip("Pro Tip: Type Z + Space or double-click middle mouse to Zoom Extents.");
        return;
      }
      if (toolId === "undo") {
        canvasEngine.undo();
        pushCommandLog("Command: U (UNDO)", "cmd");
        return;
      }
      if (toolId === "polygon") {
        canvasEngine.activateTool("polygon");
        document.getElementById("polygonDialog")?.showModal();
      } else {
        canvasEngine.activateTool(toolId);
      }

      const cmd = getCommandByTool(toolId);
      if (cmd) {
        lastExecutedCommand = cmd.alias;
        showCoachTip(`Pro Tip: ${cmd.hint}`);
      }
      highlightToolButton(toolId);
    });
  });

  // Status Bar Drafting-Aid Toggles (F3, F7, F8, F9, F10, F12, LWT)
  const statusToggleEls = {
    grid: document.getElementById("btnStatusGrid"),
    snap: document.getElementById("btnStatusSnap"),
    ortho: document.getElementById("btnStatusOrtho"),
    polar: document.getElementById("btnStatusPolar"),
    osnap: document.getElementById("btnStatusOsnap"),
    dyn: document.getElementById("btnStatusDyn"),
    lwt: document.getElementById("btnStatusLwt")
  };

  function syncStatusBarUI() {
    statusToggleEls.grid?.classList.toggle("active", canvasEngine.gridEnabled);
    statusToggleEls.snap?.classList.toggle("active", canvasEngine.gridSnapEnabled);
    statusToggleEls.ortho?.classList.toggle("active", canvasEngine.orthoLock);
    statusToggleEls.polar?.classList.toggle("active", canvasEngine.angleSnap);
    statusToggleEls.osnap?.classList.toggle("active", canvasEngine.osnap.enabled);
    statusToggleEls.dyn?.classList.toggle("active", canvasEngine.dynHud.enabled);
    statusToggleEls.lwt?.classList.toggle("active", canvasEngine.layerManager.showLineweight);

    const orthoTop = document.getElementById("btnToggleOrtho");
    if (orthoTop) {
      orthoTop.classList.toggle("active", canvasEngine.orthoLock);
      orthoTop.textContent = canvasEngine.orthoLock ? "Ortho (F8): ON" : "Ortho (F8): OFF";
    }
    const snapTop = document.getElementById("btnToggleAngleSnap");
    if (snapTop) {
      snapTop.classList.toggle("active", canvasEngine.angleSnap);
      snapTop.textContent = canvasEngine.angleSnap ? "Polar (F10): 15°" : "Polar (F10): OFF";
    }
  }

  canvasEngine.onAidStateChanged = () => syncStatusBarUI();

  statusToggleEls.grid?.addEventListener("click", () => {
    canvasEngine.toggleAid("grid");
    pushCommandLog(`<Grid ${canvasEngine.gridEnabled ? "on" : "off"}>`, "sys");
  });
  statusToggleEls.snap?.addEventListener("click", () => {
    canvasEngine.toggleAid("gridSnap");
    pushCommandLog(`<Grid Snap ${canvasEngine.gridSnapEnabled ? "on" : "off"}>`, "sys");
  });
  statusToggleEls.ortho?.addEventListener("click", () => {
    canvasEngine.toggleAid("ortho");
    pushCommandLog(`<Ortho ${canvasEngine.orthoLock ? "on" : "off"}>`, "sys");
  });
  statusToggleEls.polar?.addEventListener("click", () => {
    canvasEngine.toggleAid("polar");
    pushCommandLog(`<Polar ${canvasEngine.angleSnap ? "on" : "off"}>`, "sys");
  });
  statusToggleEls.osnap?.addEventListener("click", () => {
    canvasEngine.toggleAid("osnap");
    pushCommandLog(`<Osnap ${canvasEngine.osnap.enabled ? "on" : "off"}>`, "sys");
  });
  statusToggleEls.dyn?.addEventListener("click", () => {
    canvasEngine.toggleAid("dyn");
    pushCommandLog(`<Dynamic Input ${canvasEngine.dynHud.enabled ? "on" : "off"}>`, "sys");
  });
  statusToggleEls.lwt?.addEventListener("click", () => {
    canvasEngine.toggleAid("lwt");
    pushCommandLog(`<Lineweight ${canvasEngine.layerManager.showLineweight ? "on" : "off"}>`, "sys");
  });

  // Wire Function Keys F3, F7, F8, F9, F10, F12 cleanly inside Practice Studio
  window.addEventListener("keydown", (e) => {
    if (!document.body.classList.contains("practice-mode")) return;
    if (e.key === "F7") {
      e.preventDefault();
      canvasEngine.toggleAid("grid");
    } else if (e.key === "F9") {
      e.preventDefault();
      canvasEngine.toggleAid("gridSnap");
    } else if (e.key === "F8") {
      e.preventDefault();
      canvasEngine.toggleAid("ortho");
    } else if (e.key === "F10") {
      e.preventDefault();
      canvasEngine.toggleAid("polar");
    } else if (e.key === "F3") {
      e.preventDefault();
      canvasEngine.toggleAid("osnap");
    } else if (e.key === "F12") {
      e.preventDefault();
      canvasEngine.toggleAid("dyn");
    }
  });

  syncStatusBarUI();

  // Execute a command string submitted via CLI or Spacebar
  function submitCommandString(rawText) {
    const val = String(rawText || "").trim();
    if (!val) {
      // Empty Enter/Space inside an active command confirms/advances or finishes it; when idle repeats last command!
      if (canvasEngine.hasActiveCommand()) {
        canvasEngine.confirmActiveCommandFromCLI("");
      } else if (lastExecutedCommand) {
        const repeatCmd = resolveCommandAlias(lastExecutedCommand);
        if (repeatCmd) {
          pushCommandLog(`Command: ${repeatCmd.name} (Repeat)`, "cmd");
          canvasEngine.startCommand(repeatCmd);
        }
      }
      return;
    }

    cmdHistory.push(val);
    cmdHistoryIndex = cmdHistory.length;

    // 1. If a command is currently waiting for coordinates / distance / angle / confirmation
    if (canvasEngine.hasActiveCommand()) {
      const handled = canvasEngine.confirmActiveCommandFromCLI(val);
      if (handled) {
        pushCommandLog(`${val}`, "input");
        return;
      }
    }

    // 2. Otherwise check alias / command match
    const cmd = resolveCommandAlias(val);
    if (cmd) {
      lastExecutedCommand = cmd.alias;
      pushCommandLog(`Command: ${cmd.alias} (${cmd.name})`, "cmd");
      if (cmd.tool === "undo") {
        canvasEngine.undo();
      } else if (cmd.tool === "zoom_extents") {
        canvasEngine.zoomExtents();
      } else {
        canvasEngine.startCommand(cmd);
      }
      if (cmdSuggestEl) cmdSuggestEl.hidden = true;
      return;
    }

    pushCommandLog(`Unknown command "${val}". Try L, PL, C, A, REC, POL, XL, M, CO, RO, MI, TR, EX, O, E, Z, U.`, "warn");
  }

  function updateAutocomplete(text) {
    if (!cmdSuggestEl) return;
    const trimmed = text.trim();
    if (!trimmed || canvasEngine.hasActiveCommand()) {
      cmdSuggestEl.hidden = true;
      return;
    }
    const matches = suggestCommands(trimmed);
    if (matches.length === 0) {
      cmdSuggestEl.hidden = true;
      return;
    }
    cmdSuggestEl.innerHTML = matches
      .map(
        (m) =>
          `<button type="button" class="cmd-sug-item" data-alias="${m.alias}"><strong>${m.alias}</strong> · ${m.name} <span>(${m.category})</span></button>`
      )
      .join("");
    cmdSuggestEl.hidden = false;
    cmdSuggestEl.querySelectorAll(".cmd-sug-item").forEach((btn) => {
      btn.onclick = () => {
        if (cmdInput) cmdInput.value = "";
        submitCommandString(btn.dataset.alias);
      };
    });
  }

  if (cmdInput) {
    cmdInput.addEventListener("input", () => {
      updateAutocomplete(cmdInput.value);
    });

    cmdInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || (e.key === " " && !cmdInput.value.includes(" ") && !canvasEngine.hasActiveCommand())) {
        e.preventDefault();
        const val = cmdInput.value;
        cmdInput.value = "";
        if (cmdSuggestEl) cmdSuggestEl.hidden = true;
        submitCommandString(val);
      } else if (e.key === "Escape") {
        e.preventDefault();
        cmdInput.value = "";
        if (cmdSuggestEl) cmdSuggestEl.hidden = true;
        canvasEngine.cancelCommand();
        pushCommandLog("*Cancel*", "warn");
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (cmdHistory.length > 0 && cmdHistoryIndex > 0) {
          cmdHistoryIndex--;
          cmdInput.value = cmdHistory[cmdHistoryIndex];
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (cmdHistoryIndex < cmdHistory.length - 1) {
          cmdHistoryIndex++;
          cmdInput.value = cmdHistory[cmdHistoryIndex];
        } else {
          cmdHistoryIndex = cmdHistory.length;
          cmdInput.value = "";
        }
      }
    });
  }

  // Global key routing: Typing letters/commands when canvas is active feeds AutoCAD Command Bar automatically!
  window.addEventListener("keydown", (e) => {
    if (!document.body.classList.contains("practice-mode")) return;
    if (document.querySelector("dialog[open]")) return;
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key === "Delete") {
      e.preventDefault();
      canvasEngine.eraseSelection();
      pushCommandLog("Command: E (ERASE selection)", "cmd");
      return;
    }

    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (canvasEngine.dynHud.isFocused()) {
        canvasEngine.dynHud.submitCurrent();
      } else if (canvasEngine.hasActiveCommand()) {
        submitCommandString("");
      } else {
        submitCommandString("");
      }
      return;
    }

    // Letters trigger AutoCAD Command Bar cleanly!
    if (/^[a-zA-Z]$/.test(e.key) && cmdInput) {
      e.preventDefault();
      cmdInput.focus();
      cmdInput.value = e.key.toUpperCase();
      updateAutocomplete(cmdInput.value);
      return;
    }
  });

  // Model / Layout1 (A4/A3 Paper Space Sheet Preview)
  function renderLayoutSheet() {
    if (!layoutPreviewHost) return;
    const paper = layoutPaperSelect?.value || "A4";
    const ctx = getQuestionContext();
    const d = practiceDrawing(canvasEngine.elements);
    const svgStr = sheetSVG(d, {
      mode: "practice",
      paper,
      title: ctx.title || "Engineering Graphics — Model Sheet",
      name: ctx.student || "Student"
    });
    layoutPreviewHost.innerHTML = svgStr;
  }

  function setSpace(nextSpace) {
    activeSpace = nextSpace === "layout" ? "layout" : "model";
    const isLayout = activeSpace === "layout";
    modelTabBtn?.classList.toggle("active", !isLayout);
    layoutTabBtn?.classList.toggle("active", isLayout);
    if (modelBodyEl) modelBodyEl.hidden = isLayout;
    if (layoutSheetViewEl) layoutSheetViewEl.hidden = !isLayout;
    if (isLayout) {
      renderLayoutSheet();
    } else {
      setTimeout(() => canvasEngine.resize(), 10);
    }
  }

  modelTabBtn?.addEventListener("click", () => setSpace("model"));
  layoutTabBtn?.addEventListener("click", () => setSpace("layout"));
  layoutPaperSelect?.addEventListener("change", () => renderLayoutSheet());

  document.getElementById("btnLayoutExportSVG")?.addEventListener("click", async () => {
    const ctx = getQuestionContext();
    await downloadSheet(practiceDrawing(canvasEngine.elements), {
      mode: "practice",
      paper: layoutPaperSelect?.value || "A4",
      format: "SVG",
      title: ctx.title || "Engineering Graphics — Practice Sheet",
      name: ctx.student || ""
    });
  });

  document.getElementById("btnLayoutExportPNG")?.addEventListener("click", async () => {
    const ctx = getQuestionContext();
    await downloadSheet(practiceDrawing(canvasEngine.elements), {
      mode: "practice",
      paper: layoutPaperSelect?.value || "A4",
      format: "PNG",
      title: ctx.title || "Engineering Graphics — Practice Sheet",
      name: ctx.student || ""
    });
  });

  // Dual Learning Mode Toggle (Guided EG vs Pure AutoCAD)
  function setLearningMode(mode) {
    learningMode = mode === "pure" ? "pure" : "guided";
    btnModeGuided?.classList.toggle("active", learningMode === "guided");
    btnModePure?.classList.toggle("active", learningMode === "pure");
    document.body.classList.toggle("pure-autocad-mode", learningMode === "pure");
    if (learningMode === "pure") {
      canvasEngine.showGhostGuide = false;
      canvasEngine.render();
      showCoachTip("Pure AutoCAD Mode active: Step hints & ghost guides hidden. Draft using commands & OSNAP!");
    } else {
      showCoachTip("Guided EG Mode active: Syllabus steps + AutoCAD command hints enabled.");
    }
    onLearningModeChanged(learningMode);
  }

  btnModeGuided?.addEventListener("click", () => setLearningMode("guided"));
  btnModePure?.addEventListener("click", () => setLearningMode("pure"));

  return {
    pushCommandLog,
    showCoachTip,
    renderLayerUI,
    syncStatusBarUI,
    refreshLayoutIfActive: () => {
      if (activeSpace === "layout") renderLayoutSheet();
    },
    get learningMode() {
      return learningMode;
    }
  };
}
