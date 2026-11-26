import { parseCoordinateInput } from "./commandParser.js";

/**
 * AutoCAD DYNMODE (F12) Floating Length + Angle Boxes beside the Crosshair.
 * Supports:
 * - Type length -> Tab -> type angle -> Enter (e.g., 30 <Tab> 45 <Enter>)
 * - Relative/Cartesian strings directly inside box (e.g., @30,-30 <Enter>)
 * - Scalar entry (50 <Enter> for Circle radius, Offset distance, Rotate angle, etc.)
 */
export class DynamicInputHUD {
  constructor(hostEl, options = {}) {
    this.hostEl = hostEl;
    this.enabled = true; // F12 DYNMODE
    this.onCommit = options.onCommit || (() => {});
    this.onValuePreview = options.onValuePreview || (() => {});
    this.onCancel = options.onCancel || (() => {});

    this.visible = false;
    this.primaryEdited = false;
    this.secondaryEdited = false;
    this.lockedPrimary = null;
    this.lockedSecondary = null;
    this.mode = "polar"; // "polar" | "rect" | "scalar"

    this.el = document.createElement("div");
    this.el.className = "acad-dyn-hud";
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="dyn-box-wrap" data-field="primary">
        <span class="dyn-lbl" data-role="p-lbl">L</span>
        <input type="text" class="dyn-input" data-role="p-in" autocomplete="off" spellcheck="false" aria-label="Dynamic length or coordinate" />
        <span class="dyn-unit" data-role="p-unit">mm</span>
      </div>
      <div class="dyn-box-wrap" data-field="secondary">
        <span class="dyn-lbl" data-role="s-lbl">∠</span>
        <input type="text" class="dyn-input" data-role="s-in" autocomplete="off" spellcheck="false" aria-label="Dynamic angle" />
        <span class="dyn-unit" data-role="s-unit">°</span>
      </div>
    `;
    this.hostEl.appendChild(this.el);

    this.pWrap = this.el.querySelector('[data-field="primary"]');
    this.sWrap = this.el.querySelector('[data-field="secondary"]');
    this.pLbl = this.el.querySelector('[data-role="p-lbl"]');
    this.sLbl = this.el.querySelector('[data-role="s-lbl"]');
    this.pUnit = this.el.querySelector('[data-role="p-unit"]');
    this.sUnit = this.el.querySelector('[data-role="s-unit"]');
    this.pInput = this.el.querySelector('[data-role="p-in"]');
    this.sInput = this.el.querySelector('[data-role="s-in"]');

    this.bindEvents();
  }

  bindEvents() {
    const syncState = () => {
      const pStr = this.pInput.value.trim();
      const sStr = this.sInput.value.trim();
      this.lockedPrimary = this.primaryEdited && pStr !== "" ? pStr : null;
      this.lockedSecondary = this.secondaryEdited && sStr !== "" ? sStr : null;
      this.pWrap.classList.toggle("locked", this.primaryEdited && pStr !== "");
      this.sWrap.classList.toggle("locked", this.secondaryEdited && sStr !== "");
      this.onValuePreview({
        primary: this.lockedPrimary,
        secondary: this.lockedSecondary,
        mode: this.mode
      });
    };

    const handleKeyDown = (isPrimary, e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        this.resetEdits();
        this.onCancel();
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        if (this.mode !== "scalar") {
          const next = isPrimary ? this.sInput : this.pInput;
          next.focus();
          next.select();
        }
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        this.submitCurrent();
        return;
      }
    };

    this.pInput.addEventListener("beforeinput", (e) => {
      if (this._ignoreInitialChar && e.data === this._ignoreInitialChar) {
        e.preventDefault();
        this._ignoreInitialChar = null;
      }
    });

    this.pInput.addEventListener("input", () => {
      this._ignoreInitialChar = null;
      this.primaryEdited = true;
      syncState();
    });
    this.sInput.addEventListener("input", () => {
      this.secondaryEdited = true;
      syncState();
    });

    this.pInput.addEventListener("keydown", (e) => handleKeyDown(true, e));
    this.sInput.addEventListener("keydown", (e) => handleKeyDown(false, e));
  }

  isFocused() {
    const active = document.activeElement;
    return active === this.pInput || active === this.sInput;
  }

  feedCharacter(ch) {
    if (!this.enabled || !this.visible) return false;
    if (ch === "Tab") {
      if (this.mode !== "scalar") {
        this.sInput.focus();
        this.sInput.select();
        return true;
      }
      return false;
    }
    this._ignoreInitialChar = ch;
    setTimeout(() => {
      if (this._ignoreInitialChar === ch) this._ignoreInitialChar = null;
    }, 25);
    this.primaryEdited = true;
    this.pInput.focus();
    this.pInput.value = ch;
    try {
      this.pInput.setSelectionRange(ch.length, ch.length);
    } catch {}
    this.lockedPrimary = ch;
    this.pWrap.classList.add("locked");
    this.onValuePreview({
      primary: this.lockedPrimary,
      secondary: this.lockedSecondary,
      mode: this.mode
    });
    return true;
  }

  submitCurrent() {
    const pVal = this.pInput.value.trim();
    const sVal = this.sInput.value.trim();
    const payload = {
      mode: this.mode,
      primaryRaw: pVal,
      secondaryRaw: sVal,
      primaryEdited: this.primaryEdited,
      secondaryEdited: this.secondaryEdited
    };
    this.resetEdits();
    this.onCommit(payload);
  }

  resetEdits() {
    this.primaryEdited = false;
    this.secondaryEdited = false;
    this.lockedPrimary = null;
    this.lockedSecondary = null;
    this.pWrap.classList.remove("locked");
    this.sWrap.classList.remove("locked");
    if (this.isFocused()) {
      this.pInput.blur();
      this.sInput.blur();
    }
  }

  hide() {
    this.visible = false;
    this.el.hidden = true;
    this.resetEdits();
  }

  /**
   * Positions floating boxes cleanly near crosshair and syncs live telemetry values.
   */
  update(screenPos, state = {}) {
    if (!this.enabled || !screenPos) {
      this.hide();
      return;
    }
    const {
      mode = "polar",
      primaryVal = "0.0",
      secondaryVal = "0.0",
      primaryLabel = "L",
      secondaryLabel = "∠",
      primaryUnit = "mm",
      secondaryUnit = "°"
    } = state;

    this.mode = mode;
    this.visible = true;
    this.el.hidden = false;

    this.pLbl.textContent = primaryLabel;
    this.pUnit.textContent = primaryUnit;
    this.sWrap.hidden = mode === "scalar";
    if (mode !== "scalar") {
      this.sLbl.textContent = secondaryLabel;
      this.sUnit.textContent = secondaryUnit;
    }

    if (!this.primaryEdited && document.activeElement !== this.pInput) {
      this.pInput.value = primaryVal;
    }
    if (!this.secondaryEdited && document.activeElement !== this.sInput) {
      this.sInput.value = secondaryVal;
    }

    const hostW = this.hostEl.clientWidth || 700;
    const hostH = this.hostEl.clientHeight || 500;
    const boxW = mode === "scalar" ? 115 : 210;
    const left = Math.max(10, Math.min(hostW - boxW - 10, screenPos.x + 18));
    const top = Math.max(10, Math.min(hostH - 46, screenPos.y - 42));

    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
  }

  /**
   * Resolves Dynamic Input state into exact target world point (or null).
   */
  resolveTargetPoint(anchor, cursorWorld, extra = {}) {
    const pStr = this.lockedPrimary;
    const sStr = this.lockedSecondary;
    if (pStr === null && sStr === null) return null;

    // 1. Direct AutoCAD string like "@30,-30" or "50<45"
    if (pStr && (pStr.includes(",") || pStr.includes("<") || pStr.startsWith("@"))) {
      const parsed = parseCoordinateInput(pStr, anchor, cursorWorld);
      if (parsed && Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
        return { x: parsed.x, y: parsed.y, scalar: parsed.value ?? null };
      }
    }

    const pNum = pStr !== null ? parseFloat(pStr) : null;
    const sNum = sStr !== null ? parseFloat(sStr) : null;

    if (this.mode === "rect") {
      const dx = Number.isFinite(pNum) ? pNum : cursorWorld.x - anchor.x;
      const dy = Number.isFinite(sNum) ? sNum : cursorWorld.y - anchor.y;
      return { x: anchor.x + dx, y: anchor.y + dy };
    }

    const dx = cursorWorld.x - anchor.x;
    const dy = cursorWorld.y - anchor.y;
    const curLen = Math.hypot(dx, dy) || 30;
    const curDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

    const len = Number.isFinite(pNum) && pNum > 0 ? pNum : curLen;
    let deg = Number.isFinite(sNum) ? sNum : curDeg;
    if (Number.isFinite(sNum) && extra.angleRelativeTo === "edge" && Number.isFinite(extra.refEdgeAngleDeg)) {
      deg = extra.refEdgeAngleDeg + sNum;
    }
    const rad = (deg * Math.PI) / 180;
    return {
      x: anchor.x + len * Math.cos(rad),
      y: anchor.y + len * Math.sin(rad),
      scalar: Number.isFinite(pNum) ? pNum : null
    };
  }
}
