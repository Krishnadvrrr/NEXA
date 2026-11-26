import * as THREE from "three";
import { computeSectionTrueShapeMetrics, splitPolyhedronByPlane } from "./reaSpecMapper.js";
import { buildStyledSolidGroup, getEngineeringHatchTexture } from "./visualStyles.js";

/**
 * Watertight 3D Section of Solids Engine
 * - Exact half-space slicing producing solid-core Lower Base + Cut-Off Upper Piece
 * - Procedural 45-degree metallic engineering hatching on cut face
 * - Glowing HDR laser intersection rim & Frosted-Cyan Glass Cutting Plane (AIP)
 * - Smooth "Explode / Lift Cut" displacement along plane normal vector
 * - Live millimeter True Shape edge annotations for face-on inspection
 */
export { splitPolyhedronByPlane };

/**
 * Procedural 45-degree engineering hatched section face with subtle metallic PBR sheen.
 */
function buildHatchedCapMesh(capPoly, cutBasis) {
  if (!capPoly || capPoly.length < 3) return null;

  const n = capPoly.length;
  const cen = capPoly.reduce(
    (acc, p) => [acc[0] + p[0] / n, acc[1] + p[1] / n, acc[2] + p[2] / n],
    [0, 0, 0]
  );

  const [ux, uy, uz] = cutBasis.uAxis;
  const [vx, vy, vz] = cutBasis.vAxis;
  const [nx, ny, nz] = cutBasis.normal;
  const tileMm = 36;

  const projectUV = (p) => [
    ((p[0] - cen[0]) * ux + (p[1] - cen[1]) * uy + (p[2] - cen[2]) * uz) / tileMm + 0.5,
    ((p[0] - cen[0]) * vx + (p[1] - cen[1]) * vy + (p[2] - cen[2]) * vz) / tileMm + 0.5
  ];

  const positions = [];
  const uvs = [];
  const cUV = [0.5, 0.5];

  for (let i = 0; i < n; i++) {
    const a = capPoly[i];
    const b = capPoly[(i + 1) % n];
    const aUV = projectUV(a);
    const bUV = projectUV(b);

    positions.push(
      cen[0] + nx * 0.08, cen[1] + ny * 0.08, cen[2] + nz * 0.08,
      a[0] + nx * 0.08, a[1] + ny * 0.08, a[2] + nz * 0.08,
      b[0] + nx * 0.08, b[1] + ny * 0.08, b[2] + nz * 0.08
    );
    uvs.push(cUV[0], cUV[1], aUV[0], aUV[1], bUV[0], bUV[1]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();

  const hatchTex = getEngineeringHatchTexture();
  const mat = new THREE.MeshStandardMaterial({
    map: hatchTex,
    color: 0xffffff,
    metalness: 0.34,
    roughness: 0.28,
    envMapIntensity: 1.25,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Glowing laser-cut intersection rim around the sliced cross-section boundary.
 */
function buildLaserCutSeam(capPoly, cutBasis) {
  if (!capPoly || capPoly.length < 3) return null;
  const [nx, ny, nz] = cutBasis.normal;
  const pts = capPoly.map((p) => new THREE.Vector3(p[0] + nx * 0.16, p[1] + ny * 0.16, p[2] + nz * 0.16));
  pts.push(pts[0].clone());

  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({
    color: new THREE.Color().setRGB(2.4, 1.38, 0.34),
    toneMapped: false
  });
  return new THREE.Line(geo, mat);
}

/**
 * Frosted-cyan glass Auxiliary Inclined Plane (AIP) with glowing amber perimeter frame.
 */
function buildFrostedCuttingPlane(cutBasis, sizeSpan = 80) {
  const g = new THREE.Group();
  const w = Math.max(76, sizeSpan * 1.45);
  const d = Math.max(82, sizeSpan * 1.55);

  const basisMat = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(...cutBasis.uAxis),
    new THREE.Vector3(...cutBasis.normal),
    new THREE.Vector3(...cutBasis.vAxis)
  );
  const planeGroup = new THREE.Group();
  planeGroup.position.set(...cutBasis.origin);
  planeGroup.quaternion.setFromRotationMatrix(basisMat);

  const geo = new THREE.PlaneGeometry(w, d);
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.05,
    roughness: 0.18,
    clearcoat: 0.7,
    transparent: true,
    opacity: 0.09,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const pMesh = new THREE.Mesh(geo, glassMat);
  pMesh.rotation.x = -Math.PI / 2;
  planeGroup.add(pMesh);

  // Glowing neon-amber perimeter line
  const borderEdges = new THREE.EdgesGeometry(geo);
  const borderMat = new THREE.LineBasicMaterial({
    color: new THREE.Color().setRGB(2.2, 1.32, 0.3),
    toneMapped: false
  });
  const border = new THREE.LineSegments(borderEdges, borderMat);
  border.rotation.x = -Math.PI / 2;
  planeGroup.add(border);

  g.add(planeGroup);
  return g;
}

/**
 * Crisp millimeter edge-length pill labels on cut edges (auto-condensed on circular ellipses).
 */
function buildCutEdgeAnnotations(capPoly, cutBasis, metrics) {
  const group = new THREE.Group();
  if (!capPoly || capPoly.length < 3) return group;

  const [nx, ny, nz] = cutBasis.normal;

  const makePillSprite = (text, pos) => {
    const canvas = document.createElement("canvas");
    canvas.width = 192;
    canvas.height = 48;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "rgba(0, 0, 0, 0.88)";
    ctx.strokeStyle = "#f5b95d";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(6, 6, 180, 36, 8);
    ctx.fill();
    ctx.stroke();

    ctx.font = "bold 20px 'Segoe UI', monospace";
    ctx.fillStyle = "#fde68a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 96, 24);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthTest: false
      })
    );
    sprite.position.set(pos[0] + nx * 2.4, pos[1] + ny * 2.4, pos[2] + nz * 2.4);
    sprite.scale.set(22, 5.5, 1);
    sprite.renderOrder = 10;
    group.add(sprite);
  };

  if (metrics.edgeCount <= 10) {
    // Polygon cut: label every significant edge in mm
    for (const edge of metrics.edges) {
      if (edge.lengthMm < 3.0) continue;
      const outDir = [
        edge.mid[0] - metrics.centroid[0],
        edge.mid[1] - metrics.centroid[1],
        edge.mid[2] - metrics.centroid[2]
      ];
      const d = Math.hypot(...outDir) || 1;
      const pos = [
        edge.mid[0] + (outDir[0] / d) * 6.5,
        edge.mid[1] + (outDir[1] / d) * 6.5,
        edge.mid[2] + (outDir[2] / d) * 6.5
      ];
      makePillSprite(`${edge.lengthMm.toFixed(1)} mm`, pos);
    }
  } else {
    // Smooth cone/cylinder ellipse/parabola/circle: show summary True Perimeter / Area badge
    makePillSprite(`P ${metrics.perimeterMm.toFixed(1)} mm`, metrics.centroid);
  }

  return group;
}

/**
 * Full Showpiece Section Assembly:
 * Retained Lower Base + Hatched Cap + Laser Rim + Exploding Upper Ghost + Frosted Glass Cut Plane + Edge Labels
 */
export function buildSectionAssembly(polyData, cutBasis, styleId = "shaded", opts = {}) {
  const {
    drawAllEdges = true,
    explodeDist = 0,
    showUpper = true,
    showPlane = true,
    showAnnotations = false,
    sizeSpan = 80
  } = opts;

  const rootGroup = new THREE.Group();
  const { lowerPolyData, upperPolyData, capPoly } = splitPolyhedronByPlane(polyData, cutBasis);
  const metrics = computeSectionTrueShapeMetrics(capPoly);

  const lowerGroup = new THREE.Group();
  if (lowerPolyData.vertices.length >= 3) {
    lowerGroup.add(
      buildStyledSolidGroup(lowerPolyData, styleId, {
        drawAllEdges
      })
    );
  }
  const capMesh = buildHatchedCapMesh(capPoly, cutBasis);
  if (capMesh) lowerGroup.add(capMesh);

  const laserSeam = buildLaserCutSeam(capPoly, cutBasis);
  if (laserSeam) lowerGroup.add(laserSeam);

  rootGroup.add(lowerGroup);

  // Explodable upper removed portion in sleek ghost wireframe + lift vector guides
  if (showUpper && upperPolyData.vertices.length >= 3) {
    const upperGroup = new THREE.Group();
    upperGroup.add(
      buildStyledSolidGroup(upperPolyData, styleId, {
        drawAllEdges,
        isGhost: true
      })
    );
    const [nx, ny, nz] = cutBasis.normal;
    if (explodeDist > 0.1) {
      upperGroup.position.set(nx * explodeDist, ny * explodeDist, nz * explodeDist);
      // Faint normal lift trajectory vector
      const c = metrics.centroid;
      const liftRay = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(c[0], c[1], c[2]),
          new THREE.Vector3(c[0] + nx * explodeDist, c[1] + ny * explodeDist, c[2] + nz * explodeDist)
        ]),
        new THREE.LineDashedMaterial({
          color: 0xcccccc,
          dashSize: 3,
          gapSize: 2,
          transparent: true,
          opacity: 0.7
        })
      );
      liftRay.computeLineDistances();
      rootGroup.add(liftRay);
    }
    rootGroup.add(upperGroup);
  }

  if (showPlane) {
    rootGroup.add(buildFrostedCuttingPlane(cutBasis, sizeSpan));
  }

  if (showAnnotations && capPoly.length >= 3) {
    rootGroup.add(buildCutEdgeAnnotations(capPoly, cutBasis, metrics));
  }

  return {
    rootGroup,
    lowerGroup,
    capPoly,
    cutBasis,
    metrics
  };
}
