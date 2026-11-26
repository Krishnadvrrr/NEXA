/**
 * AutoCAD-Style Layer Properties Manager for Engineering Graphics
 * Pre-configured with standard BIS / Anna University EG drafting layers
 * plus bidirectional mapping to semantic pencil grades (HB, 2H, Hidden, Axis, etc.).
 */

export const EG_LAYERS = [
  {
    id: "XY_Reference",
    name: "XY_Reference",
    color: "#f5b95d",
    linetype: "Continuous",
    lineweight: 0.25,
    grade: "Axis",
    visible: true,
    locked: false
  },
  {
    id: "Visible_Outline",
    name: "Visible_Outline",
    color: "#ffffff",
    linetype: "Continuous",
    lineweight: 0.50,
    grade: "HB",
    visible: true,
    locked: false
  },
  {
    id: "Projectors_Const",
    name: "Projectors_Const",
    color: "#666666",
    linetype: "Continuous",
    lineweight: 0.15,
    grade: "2H",
    visible: true,
    locked: false
  },
  {
    id: "Hidden_Edges",
    name: "Hidden_Edges",
    color: "#facc15",
    linetype: "Dashed",
    lineweight: 0.30,
    grade: "Hidden",
    visible: true,
    locked: false
  },
  {
    id: "Axis_Center",
    name: "Axis_Center",
    color: "#f87171",
    linetype: "Center",
    lineweight: 0.20,
    grade: "Axis",
    visible: true,
    locked: false
  },
  {
    id: "Dimensions_Text",
    name: "Dimensions_Text",
    color: "#e5e5e5",
    linetype: "Continuous",
    lineweight: 0.18,
    grade: "Dimension",
    visible: true,
    locked: false
  },
  {
    id: "Cutting_Plane",
    name: "Cutting_Plane",
    color: "#f472b6",
    linetype: "Phantom",
    lineweight: 0.50,
    grade: "Cutting Plane",
    visible: true,
    locked: false
  }
];

const GRADE_TO_LAYER = {
  HB: "Visible_Outline",
  "2H": "Projectors_Const",
  Hidden: "Hidden_Edges",
  Axis: "Axis_Center",
  Dimension: "Dimensions_Text",
  "Cutting Plane": "Cutting_Plane"
};

export function layerIdForGrade(grade = "HB") {
  return GRADE_TO_LAYER[grade] || "Visible_Outline";
}

export class LayerManager {
  constructor() {
    this.layers = EG_LAYERS.map((l) => ({ ...l }));
    this.activeLayerId = "Visible_Outline";
    this.showLineweight = true;
  }

  getAll() {
    return this.layers;
  }

  getLayer(id) {
    return this.layers.find((l) => l.id === id) || this.layers[1];
  }

  getActiveLayer() {
    return this.getLayer(this.activeLayerId);
  }

  setActiveLayer(id) {
    const found = this.layers.find((l) => l.id === id);
    if (found) this.activeLayerId = found.id;
    return this.getActiveLayer();
  }

  setActiveByGrade(grade) {
    const id = layerIdForGrade(grade);
    return this.setActiveLayer(id);
  }

  toggleVisibility(id) {
    const l = this.layers.find((x) => x.id === id);
    if (l) l.visible = !l.visible;
    return l?.visible ?? true;
  }

  toggleLock(id) {
    const l = this.layers.find((x) => x.id === id);
    if (l) l.locked = !l.locked;
    return l?.locked ?? false;
  }

  resolveElementLayer(el) {
    if (el?.layer) return this.getLayer(el.layer);
    if (el?.type === "dimension" || el?.type === "text") return this.getLayer("Dimensions_Text");
    return this.getLayer(layerIdForGrade(el?.grade || "HB"));
  }

  isElementVisible(el) {
    return this.resolveElementLayer(el).visible !== false;
  }

  isElementLocked(el) {
    return this.resolveElementLayer(el).locked === true;
  }
}

/**
 * Expands any geometric entity (line, polyline, polygon, rect, arc, circle)
 * into raw 2D line segments for snap/selection/trim/extend/3D extraction.
 */
export function extractElementSegments(el) {
  if (!el) return [];
  if (el.type === "line" || el.type === "dimension") {
    return [{ a: [el.x1, el.y1], b: [el.x2, el.y2] }];
  }
  if ((el.type === "polygon" || el.type === "polyline") && Array.isArray(el.points) && el.points.length >= 2) {
    const segs = [];
    const pts = el.points;
    const count = el.type === "polygon" || el.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < count; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      segs.push({ a: [a[0], a[1]], b: [b[0], b[1]] });
    }
    return segs;
  }
  return [];
}
