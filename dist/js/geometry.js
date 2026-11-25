// Right-handed coordinates: X along XY, Y above HP, Z in front of VP.
export const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
export const sub = (a, b) => a.map((v, i) => v - b[i]);
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const unit = (a) => {
  const n = Math.hypot(...a);
  return a.map((v) => v / (n || 1));
};
export function axisDirection(alpha, beta) {
  const y = Math.sin((alpha * Math.PI) / 180),
    z = Math.sin((beta * Math.PI) / 180);
  return [Math.sqrt(Math.max(0, 1 - y * y - z * z)), y, z];
}
export function solidSides(solid = "") {
  if (solid.includes("tri") || solid === "tetrahedron") return 3;
  if (solid.includes("pent")) return 5;
  if (solid.includes("hex")) return 6;
  return 4;
}
export function buildSolid(s) {
  const curved = ["cylinder", "cone"].includes(s.solid),
    pyramid = s.solid.includes("Pyramid") || s.solid === "cone" || s.solid === "tetrahedron",
    n = curved ? 180 : solidSides(s.solid);
  const r = curved ? s.size : s.size / (2 * Math.sin(Math.PI / n)),
    h = s.solid === "cube" ? s.size : s.height;
  const axis = axisDirection(s.alpha, s.beta),
    u = unit(cross(Math.abs(axis[1]) > 0.95 ? [0, 0, 1] : [0, 1, 0], axis)),
    v = cross(axis, u),
    roll = (s.roll * Math.PI) / 180;
  let vertices = [];
  for (let layer = 0; layer < (pyramid ? 1 : 2); layer++)
    for (let i = 0; i < n; i++) {
      const t = (2 * Math.PI * i) / n + Math.PI / n + roll;
      vertices.push(
        axis.map(
          (a, k) =>
            a * (layer - 0.5) * h +
            r * (u[k] * Math.cos(t) + v[k] * Math.sin(t)),
        ),
      );
    }
  if (pyramid) vertices.push(axis.map((a) => (a * h) / 2));
  const center = vertices.reduce(
    (a, p) => a.map((v, k) => v + p[k] / vertices.length),
    [0, 0, 0],
  );
  let faces = [Array.from({ length: n }, (_, i) => i)];
  if (!pyramid) faces.push(Array.from({ length: n }, (_, i) => i + n));
  for (let i = 0; i < n; i++) {
    let j = (i + 1) % n;
    faces.push(pyramid ? [i, j, n] : [i, j, j + n, i + n]);
  }
  faces = faces.map((ids) => {
    let normal = unit(
      cross(
        sub(vertices[ids[1]], vertices[ids[0]]),
        sub(vertices[ids[2]], vertices[ids[0]]),
      ),
    );
    if (dot(normal, sub(vertices[ids[0]], center)) < 0) {
      ids.reverse();
      normal = normal.map((v) => -v);
    }
    return { ids, normal };
  });
  const shift = [
    0,
    15 - Math.min(...vertices.map((p) => p[1])),
    15 - Math.min(...vertices.map((p) => p[2])),
  ];
  vertices = vertices.map((p) => p.map((v, k) => v + shift[k]));
  const edges = new Map();
  faces.forEach((f, fi) =>
    f.ids.forEach((a, i) => {
      const b = f.ids[(i + 1) % f.ids.length],
        key = [a, b].sort((a, b) => a - b).join(":");
      if (!edges.has(key)) edges.set(key, { a, b, faces: [] });
      edges.get(key).faces.push(fi);
    }),
  );
  const ends = [-0.5, 0.5].map((t) => axis.map((a, k) => a * t * h + shift[k]));
  return {
    vertices,
    faces,
    edges: [...edges.values()],
    axis: ends,
    curved,
    n,
    pyramid,
    height: h,
  };
}
export function viewEdges(model, direction) {
  return model.edges
    .map((edge) => {
      const facing = edge.faces.map((i) =>
        dot(model.faces[i].normal, direction),
      );
      const rim =
        (edge.a < model.n && edge.b < model.n) ||
        (!model.pyramid && edge.a >= model.n && edge.b >= model.n);
      const silhouette =
        facing.some((v) => v > 1e-8) && facing.some((v) => v <= 1e-8);
      return {
        ...edge,
        visible: facing.some((v) => v > 1e-8),
        draw: !model.curved || rim || silhouette,
      };
    })
    .filter((e) => e.draw);
}
