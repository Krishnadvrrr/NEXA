import { viewEdges } from "./geometry.js";
export const escapeXML = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
export const line = (a, b, cls = "outline") =>
  `<path class="${cls}" d="M${a.join(",")} L${b.join(",")}"/>`;
export const text = (x, y, t, cls = "label", anchor = "middle") =>
  `<text class="${cls}" x="${x}" y="${y}" text-anchor="${anchor}">${escapeXML(t)}</text>`;
export const path = (points, cls = "outline") =>
  `<path class="${cls}" d="${points.map((p, i) => (i ? "L" : "M") + p.join(",")).join(" ")}"/>`;
export function drawingStyles(print = false) {
  return `<style>.outline{fill:none;stroke:${print ? "#142029" : "#ffffff"};stroke-width:2.4;stroke-linejoin:round;stroke-linecap:round}.hidden{fill:none;stroke:${print ? "#475561" : "#888888"};stroke-width:1.3;stroke-dasharray:7 5}.axis{fill:none;stroke:${print ? "#657480" : "#666666"};stroke-width:1;stroke-dasharray:16 4 2 4}.section-plane{fill:none;stroke:#38bdf8;stroke-width:2.2;stroke-dasharray:14 4 3 4}.construction{fill:none;stroke:${print ? "#a2aab0" : "#444444"};stroke-width:.7}.dimension{fill:none;stroke:${print ? "#72500e" : "#f5b95d"};stroke-width:1}.label,.dimtext,.viewtitle{fill:${print ? "#17212b" : "#e5e5e5"};font:14px 'Segoe UI',sans-serif}.dimtext{fill:${print ? "#72500e" : "#f5b95d"};font-size:13px}.viewtitle{font-size:14px;letter-spacing:2px}.focus{fill:${print ? "#17212b" : "#ffffff"}}.normal{fill:none;stroke:${print ? "#697583" : "#aaaaaa"};stroke-width:1.3;stroke-dasharray:6 4}.tangent{fill:none;stroke:${print ? "#72500e" : "#f5b95d"};stroke-width:1.5}</style>`;
}
export function dimension(a, b, label) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    len = Math.hypot(dx, dy);
  if (len < 1) return "";
  const u = [dx / len, dy / len],
    v = [-u[1] * 4, u[0] * 4];
  let out = line(a, b, "dimension");
  for (const [p, sign] of [
    [a, 1],
    [b, -1],
  ])
    out += path(
      [
        p.map((x, k) => x + sign * u[k] * 8 + v[k]),
        p,
        p.map((x, k) => x + sign * u[k] * 8 - v[k]),
      ],
      "dimension",
    );
  return (
    out +
    text((a[0] + b[0]) / 2 + v[0] * 3, (a[1] + b[1]) / 2 - 9, label, "dimtext")
  );
}
export function solidDrawing(model, s) {
  const xs = model.vertices.map((p) => p[0]),
    ys = model.vertices.map((p) => p[1]),
    zs = model.vertices.map((p) => p[2]);
  const xmin = Math.min(...xs),
    xmax = Math.max(...xs),
    ymax = Math.max(...ys),
    zmax = Math.max(...zs),
    width = xmax - xmin;
  const scale = Math.min(710 / (width + zmax + 35), 610 / (ymax + zmax + 35)),
    right = s.side === "right",
    frontX = right
      ? 140 + zmax * scale + 80 - xmin * scale
      : 100 - xmin * scale,
    xy = 100 + ymax * scale,
    sideX = right ? 140 + zmax * scale : frontX + xmax * scale + 80;
  const fv = (p) => [frontX + p[0] * scale, xy - p[1] * scale],
    tv = (p) => [frontX + p[0] * scale, xy + p[2] * scale],
    sv = (p) => [sideX + (right ? -p[2] : p[2]) * scale, xy - p[1] * scale];
  let out = "";
  if (s.construction) {
    for (const p of model.vertices.filter(
      (_, i) => !model.curved || i % 30 === 0,
    )) {
      out +=
        line(fv(p), tv(p), "construction") + line(fv(p), sv(p), "construction");
      const top = tv(p),
        side = sv(p),
        mx = side[0],
        my = top[1];
      out += path([top, [mx, my], side], "construction");
    }
    const sign = right ? -1 : 1;
    out += line(
      [sideX, xy],
      [sideX + sign * zmax * scale, xy + zmax * scale],
      "axis",
    );
  }
  out +=
    line([55, xy], [1040, xy], "axis") +
    text(40, xy + 5, "X") +
    text(1055, xy + 5, "Y");
  const views = [
    { map: fv, dir: [0, 0, 1], name: "FRONT VIEW · FV", suffix: "′" },
    { map: tv, dir: [0, 1, 0], name: "TOP VIEW · TV", suffix: "" },
    {
      map: sv,
      dir: right ? [1, 0, 0] : [-1, 0, 0],
      name: (right ? "RIGHT" : "LEFT") + " SIDE · SV",
      suffix: "″",
    },
  ];
  for (const view of views) {
    const points = model.vertices.map(view.map),
      minx = Math.min(...points.map((p) => p[0])),
      maxx = Math.max(...points.map((p) => p[0])),
      miny = Math.min(...points.map((p) => p[1])),
      maxy = Math.max(...points.map((p) => p[1]));
    const edges = viewEdges(model, view.dir);
    for (const visible of [false, true])
      for (const e of edges.filter((e) => e.visible === visible)) {
        if (visible || s.hidden)
          out += line(points[e.a], points[e.b], visible ? "outline" : "hidden");
      }
    const ax = model.axis.map(view.map),
      ad = [ax[1][0] - ax[0][0], ax[1][1] - ax[0][1]],
      al = Math.hypot(...ad);
    if (al > 1)
      out += line(
        ax[0].map((v, k) => v - (ad[k] / al) * 15),
        ax[1].map((v, k) => v + (ad[k] / al) * 15),
        "axis",
      );
    else
      out +=
        line([ax[0][0] - 15, ax[0][1]], [ax[0][0] + 15, ax[0][1]], "axis") +
        line([ax[0][0], ax[0][1] - 15], [ax[0][0], ax[0][1] + 15], "axis");
    if (s.labels && !model.curved) {
      const occupied = new Map();
      points.forEach((p, i) => {
        const key = p.map((v) => Math.round(v / 3)).join(",");
        const item = occupied.get(key) || { p, n: [] };
        item.n.push(String.fromCharCode(97 + i) + view.suffix);
        occupied.set(key, item);
      });
      for (const { p, n } of occupied.values())
        out += text(p[0] + 7, p[1] - 9, n.join(","), "label", "start");
    }
    out += text(
      (minx + maxx) / 2,
      maxy + (s.dimensions ? 64 : 35),
      view.name,
      "viewtitle",
    );
    if (s.dimensions) {
      const yy = maxy + 30;
      out +=
        line([minx, maxy + 4], [minx, yy + 8], "dimension") +
        line([maxx, maxy + 4], [maxx, yy + 8], "dimension") +
        dimension([minx, yy], [maxx, yy], ((maxx - minx) / scale).toFixed(1));
      const xx = minx - 27;
      out += dimension(
        [xx, miny],
        [xx, maxy],
        ((maxy - miny) / scale).toFixed(1),
      );
    }
  }
  if (s.sectionEnabled) {
    const ymin = Math.min(...ys);
    const frac = Math.max(0.08, Math.min(0.92, (s.cutHeightPct ?? 50) / 100));
    const cutY = ymin + (ymax - ymin) * frac;
    const cx = (xmin + xmax) / 2;
    const rad = ((s.cutAngle ?? 45) * Math.PI) / 180;
    const halfSpan = Math.max(width, ymax - ymin) * 0.72;
    const dx = halfSpan * Math.cos(rad);
    const dy = halfSpan * Math.sin(rad);
    const p1 = fv([cx - dx, cutY - dy, 0]);
    const p2 = fv([cx + dx, cutY + dy, 0]);
    out += line(p1, p2, "section-plane");
    out += text(p2[0] + 8, p2[1] - 4, `AIP ${s.cutAngle ?? 45}°`, "dimtext", "start");
  }
  return {
    body: out,
    scale,
    viewBox: [0, 0, 1100, 850],
    description: "Dimensions are projected overall extents in mm.",
  };
}
