import { line, path, text, dimension } from "./drafting.js";
export function curvePoint(type, t, d, e, r) {
  // Conic parameterizations satisfy sqrt((x-d)^2+y^2) = e*abs(x).
  if (type === "ellipse") {
    const a = (e * d) / (1 - e * e),
      b = (e * d) / Math.sqrt(1 - e * e),
      u = 2 * Math.PI * t;
    return [d / (1 - e * e) - a * Math.cos(u), b * Math.sin(u)];
  }
  if (type === "parabola") {
    const y = (t * 2 - 1) * d * 2.5;
    return [(y * y + d * d) / (2 * d), y];
  }
  if (type === "hyperbola") {
    const u = (2 * t - 1) * 1.8;
    return [
      -d / (e * e - 1) + ((e * d) / (e * e - 1)) * Math.cosh(u),
      ((e * d) / Math.sqrt(e * e - 1)) * Math.sinh(u),
    ];
  }
  const u = t * Math.PI * 2;
  if (type === "cycloid") return [r * (u - Math.sin(u)), r * (1 - Math.cos(u))];
  return [
    r * (Math.cos(u) + u * Math.sin(u)),
    r * (Math.sin(u) - u * Math.cos(u)),
  ];
}
export function curveDrawing(s) {
  const d = s.distance,
    e = s.curve === "parabola" ? 1 : s.ecc,
    r = s.radius,
    at = (t) => curvePoint(s.curve, t, d, e, r),
    points = Array.from({ length: 401 }, (_, i) => at(i / 400)),
    conic = ["ellipse", "parabola", "hyperbola"].includes(s.curve);
  const extras = conic
    ? [
        [0, 0],
        [d, 0],
      ]
    : [
        [0, -r],
        [0, r],
        [r, 0],
        [-r, 0],
      ];
  const all = points.concat(extras),
    minx = Math.min(...all.map((p) => p[0])),
    maxx = Math.max(...all.map((p) => p[0])),
    miny = Math.min(...all.map((p) => p[1])),
    maxy = Math.max(...all.map((p) => p[1]));
  const scale = Math.min(850 / (maxx - minx || 1), 560 / (maxy - miny || 1));
  const ox = (1100 - (maxx + minx) * scale) / 2,
    oy = (790 + (maxy + miny) * scale) / 2,
    map = (p) => [ox + p[0] * scale, oy - p[1] * scale];
  let out = "";
  out += line(map([minx - 20, 0]), map([maxx + 20, 0]), "axis");
  const t = s.point / 100,
    p = at(t),
    u = t * 2 * Math.PI,
    P = map(p);
  let explanation = "";
  if (conic) {
    out +=
      line([map([0, 0])[0], 85], [map([0, 0])[0], 760], "axis") +
      text(map([0, 0])[0], 75, "DIRECTRIX", "viewtitle") +
      `<circle class="focus" cx="${map([d, 0])[0]}" cy="${map([d, 0])[1]}" r="4"/>` +
      (s.labels ? text(map([d, 0])[0], map([d, 0])[1] + 23, "F") : "");
    if (s.construction) {
      for (let i = 0; i <= 12; i++) {
        const q = at(i / 12);
        out += line(map([q[0], 0]), map(q), "construction");
      }
      out += path([map([0, p[1]]), P, map([d, 0])], "dimension");
      const rr = Math.hypot(p[0] - d, p[1]);
      out += `<circle class="construction" cx="${map([d, 0])[0]}" cy="${map([d, 0])[1]}" r="${rr * scale}"/>`;
    }
    if (s.dimensions)
      out += dimension(
        [map([0, 0])[0], map([0, miny])[1] + 40],
        [map([d, 0])[0], map([0, miny])[1] + 40],
        `d = ${d} mm`,
      );
    explanation = `Eccentricity construction: PF / PD = ${e.toFixed(2)}. D is the perpendicular foot on the directrix. ${s.curve === "hyperbola" ? "Showing the branch facing the selected focus." : ""}`;
  } else {
    const center = s.curve === "cycloid" ? [r * u, r] : [0, 0],
      C = map(center);
    if (s.construction) {
      out += `<circle class="construction" cx="${C[0]}" cy="${C[1]}" r="${r * scale}"/>`;
      if (s.curve === "cycloid") {
        out +=
          line(map([0, 0]), map([2 * Math.PI * r, 0]), "construction") +
          line(C, P, "dimension") +
          line(C, map([r * u, 0]), "construction");
        for (let i = 0; i <= 12; i++) {
          const x = (2 * Math.PI * r * i) / 12;
          out += line(map([x, 0]), map([x, 2 * r]), "construction");
        }
      } else {
        const contact = [r * Math.cos(u), r * Math.sin(u)];
        out += path([map([0, 0]), map(contact), P], "dimension");
        for (let i = 0; i < 12; i++) {
          const a = (i * Math.PI) / 6;
          out += line(
            map([0, 0]),
            map([r * Math.cos(a), r * Math.sin(a)]),
            "construction",
          );
        }
      }
    }
    if (s.dimensions)
      out += dimension(C, map([center[0] + r, center[1]]), `r = ${r} mm`);
    explanation =
      s.curve === "cycloid"
        ? "A point on a circle rolling without slipping. Travel = rθ; one arch spans 2πr."
        : "A taut string unwinding from a circle. The free string is tangent to the base circle and has length rθ.";
  }
  out += path(points.slice(0, Math.floor(s.progress * 4) + 1).map(map));
  if (s.tangent) {
    const eps = 1e-5,
      a = at(Math.max(0, t - eps)),
      b = at(Math.min(1, t + eps)),
      vx = b[0] - a[0],
      vy = -(b[1] - a[1]),
      len = Math.hypot(vx, vy) || 1,
      dir = [vx / len, vy / len],
      normal = [-dir[1], dir[0]];
    out +=
      line(
        P.map((v, k) => v - dir[k] * 90),
        P.map((v, k) => v + dir[k] * 90),
        "tangent",
      ) +
      line(
        P.map((v, k) => v - normal[k] * 70),
        P.map((v, k) => v + normal[k] * 70),
        "normal",
      ) +
      text(P[0] + dir[0] * 97, P[1] + dir[1] * 97, "T", "dimtext") +
      text(P[0] + normal[0] * 78, P[1] + normal[1] * 78, "N");
  }
  out += `<circle class="focus" cx="${P[0]}" cy="${P[1]}" r="4"/>`;
  if (s.labels) out += text(P[0] + 12, P[1] - 12, "P", "label", "start");
  out += text(
    550,
    45,
    s.curve.toUpperCase() +
      " / " +
      (conic ? "ECCENTRICITY METHOD" : "GENERATING CIRCLE"),
    "viewtitle",
  );
  return {
    body: out,
    scale,
    viewBox: [0, 0, 1100, 850],
    description: explanation,
    samples: points.map(map),
  };
}
