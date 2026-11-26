import { drawingStyles, escapeXML } from "./drafting.js";
export function sheetSVG(drawing, options) {
  const W = options.paper === "A3" ? 420 : 297,
    H = options.paper === "A3" ? 297 : 210,
    contentW = W - 24,
    contentH = H - 64;
  const f = Math.min(contentW / 1100, contentH / 850),
    tx = (W - 1100 * f) / 2,
    ty = 12,
    scale = drawing.scale * f;
  const date = new Intl.DateTimeFormat("en-GB").format(new Date());
  const symbol =
    options.mode === "solid" || options.mode === "practice"
      ? `<g transform="translate(${W - 43} ${H - 35})" fill="none" stroke="#17212b" stroke-width=".35"><path d="M0 0 L14 2 L14 10 L0 12 Z M0 6 H38"/><circle cx="28" cy="6" r="6"/><circle cx="28" cy="6" r="4"/></g>`
      : "";
  const safe = escapeXML;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="white"/><rect x="10" y="10" width="${W - 20}" height="${H - 20}" fill="none" stroke="#17212b" stroke-width=".5"/><svg x="${tx}" y="${ty}" width="${1100 * f}" height="${850 * f}" viewBox="0 0 1100 850">${drawingStyles(true)}${drawing.body}</svg><g font-family="Arial,sans-serif" fill="#17212b"><rect x="${W - 190}" y="${H - 48}" width="180" height="38" fill="white" stroke="#17212b" stroke-width=".4"/><path d="M${W - 190} ${H - 32} H${W - 10} M${W - 190} ${H - 21} H${W - 10} M${W - 65} ${H - 48} V${H - 10}" fill="none" stroke="#17212b" stroke-width=".3"/><text x="${W - 186}" y="${H - 42}" font-size="2.5">PROJECT TITLE</text><text x="${W - 186}" y="${H - 36}" font-size="3.1" textLength="118" lengthAdjust="spacingAndGlyphs">${safe(options.title)}</text><text x="${W - 186}" y="${H - 25}" font-size="3">Student: ${safe(options.name || "—")}</text><text x="${W - 186}" y="${H - 14}" font-size="2.8">Scale ${scale.toFixed(3)}:1 · mm · ${date}</text><text x="${W - 61}" y="${H - 42}" font-size="2.5">${options.mode === "practice" ? "PRACTICE LAB" : "FIRST ANGLE"}</text><text x="${W - 61}" y="${H - 14}" font-size="2.8">${options.paper} · EG / STUDIO</text><text x="13" y="${H - 13}" font-size="2.4">Print at 100% · Do not fit to page</text></g>${symbol}</svg>`;
}

export function practiceDrawing(elements) {
  const scale = 2.4;
  const ox = 550;
  const oy = 425;
  const fv = (x, y) => [ox + x * scale, oy - y * scale];

  let body = "";
  // Draw XY reference line
  body += `<line x1="50" y1="${oy}" x2="1050" y2="${oy}" class="axis" />`;
  body += `<text x="35" y="${oy + 5}" class="viewtitle">X</text>`;
  body += `<text x="1065" y="${oy + 5}" class="viewtitle">Y</text>`;
  body += `<text x="80" y="${oy - 8}" class="label" font-size="11">VP (Elevation)</text>`;
  body += `<text x="80" y="${oy + 18}" class="label" font-size="11">HP (Plan)</text>`;

  for (const el of elements) {
    if (el.type === "line") {
      const p1 = fv(el.x1, el.y1);
      const p2 = fv(el.x2, el.y2);
      const cls =
        el.grade === "HB"
          ? "outline"
          : el.grade === "Hidden"
            ? "hidden"
            : el.grade === "Axis"
              ? "axis"
              : "construction";
      body += `<line x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" class="${cls}" />`;
    } else if (el.type === "circle") {
      const c = fv(el.cx, el.cy);
      const r = el.radius * scale;
      const cls =
        el.grade === "HB"
          ? "outline"
          : el.grade === "Hidden"
            ? "hidden"
            : "construction";
      body += `<circle cx="${c[0]}" cy="${c[1]}" r="${r}" class="${cls}" fill="none" />`;
    } else if (el.type === "polygon") {
      const pts = el.points.map((p) => fv(p[0], p[1]).join(",")).join(" ");
      body += `<polygon points="${pts}" class="outline" fill="none" />`;
    } else if (el.type === "polyline" && Array.isArray(el.points) && el.points.length >= 2) {
      const cls =
        el.grade === "HB"
          ? "outline"
          : el.grade === "Hidden"
            ? "hidden"
            : el.grade === "Axis"
              ? "axis"
              : "construction";
      const pts = el.points.map((p) => fv(p[0], p[1]).join(",")).join(" ");
      body += el.closed
        ? `<polygon points="${pts}" class="${cls}" fill="none" />`
        : `<polyline points="${pts}" class="${cls}" fill="none" />`;
    } else if (el.type === "arc") {
      const cls =
        el.grade === "HB"
          ? "outline"
          : el.grade === "Hidden"
            ? "hidden"
            : "construction";
      let d = "";
      for (let i = 0; i <= 32; i++) {
        let sweep = el.endAngle - el.startAngle;
        if (el.worldCCW && sweep < 0) sweep += Math.PI * 2;
        if (!el.worldCCW && sweep > 0) sweep -= Math.PI * 2;
        const a = el.startAngle + (sweep * i) / 32;
        const p = fv(el.cx + el.radius * Math.cos(a), el.cy + el.radius * Math.sin(a));
        d += (i === 0 ? "M" : " L") + p[0].toFixed(2) + "," + p[1].toFixed(2);
      }
      body += `<path d="${d}" class="${cls}" fill="none" />`;
    } else if (el.type === "text") {
      const p = fv(el.x, el.y);
      body += `<text x="${p[0] + 4}" y="${p[1] - 4}" class="label" font-style="italic">${escapeXML(el.text)}</text>`;
    } else if (el.type === "dimension") {
      const p1 = fv(el.x1, el.y1);
      const p2 = fv(el.x2, el.y2);
      body += `<line x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" class="dimension" />`;
      body += `<text x="${(p1[0] + p2[0]) / 2}" y="${(p1[1] + p2[1]) / 2 - 5}" class="dimtext" text-anchor="middle">${escapeXML(el.value)} mm</text>`;
    }
  }

  return {
    body,
    scale,
    viewBox: [0, 0, 1100, 850],
    description: "Student Practice Drawing Sheet",
  };
}
export async function downloadSheet(drawing, options) {
  const svg = sheetSVG(drawing, options);
  let blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  if (options.format === "PNG") {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(
        ((options.paper === "A3" ? 420 : 297) / 25.4) * 300,
      );
      canvas.height = Math.round(
        ((options.paper === "A3" ? 297 : 210) / 25.4) * 300,
      );
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      blob = await new Promise((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(Error("PNG encoding failed"))),
          "image/png",
        ),
      );
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `eg-studio-${options.paper.toLowerCase()}.${options.format.toLowerCase()}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
