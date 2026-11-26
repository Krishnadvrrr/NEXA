import * as THREE from "three";

/**
 * AutoCAD-Parity Visual Styles + Studio PBR Materials + Internal Axes/Generators
 * Supports: conceptual (Gooch GLSL), shaded, xray, wireframe (hidden-line occluded),
 * aluminum (brushed metal + clearcoat), glass (frosted architectural), blueprint (holographic).
 */

const textureCache = new Map();

/**
 * Procedural brushed aluminum bump & roughness textures (cached).
 */
export function getBrushedAluminumTextures() {
  if (textureCache.has("aluminum")) return textureCache.get("aluminum");

  const size = 256;
  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bctx = bumpCanvas.getContext("2d");

  const roughCanvas = document.createElement("canvas");
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rctx = roughCanvas.getContext("2d");

  bctx.fillStyle = "#808080";
  bctx.fillRect(0, 0, size, size);
  rctx.fillStyle = "#484848";
  rctx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y++) {
    const band = Math.sin(y * 1.9) * 16 + ((y * 37) % 29) - 14;
    const bVal = Math.max(40, Math.min(220, Math.round(128 + band)));
    const rVal = Math.max(30, Math.min(130, Math.round(64 + band * 0.85)));
    bctx.fillStyle = `rgb(${bVal},${bVal},${bVal})`;
    bctx.fillRect(0, y, size, 1);
    rctx.fillStyle = `rgb(${rVal},${rVal},${rVal})`;
    rctx.fillRect(0, y, size, 1);

    // Fine brushed streaks
    for (let s = 0; s < 4; s++) {
      const sx = ((y * 73 + s * 61) % size);
      const sw = 18 + ((y + s * 13) % 44);
      bctx.fillStyle = `rgba(255,255,255,0.12)`;
      bctx.fillRect(sx, y, sw, 1);
    }
  }

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(2, 2);
  bumpMap.userData = { shared: true };

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(2, 2);
  roughnessMap.userData = { shared: true };

  const pair = { bumpMap, roughnessMap };
  textureCache.set("aluminum", pair);
  return pair;
}

/**
 * Procedural 45-degree engineering section hatching CanvasTexture (metallic amber/charcoal).
 */
export function getEngineeringHatchTexture() {
  if (textureCache.has("hatch")) return textureCache.get("hatch");

  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  // Warm metallic base
  ctx.fillStyle = "#4f3a16";
  ctx.fillRect(0, 0, size, size);

  // Subtle brushed gradient background
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, "rgba(245, 185, 93, 0.24)");
  grad.addColorStop(0.5, "rgba(255, 224, 158, 0.14)");
  grad.addColorStop(1, "rgba(245, 185, 93, 0.28)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Parallel 45-degree BIS section hatch lines (seamless across tile borders)
  ctx.strokeStyle = "#ffd98e";
  ctx.lineWidth = 3.2;
  const step = 32;
  for (let offset = -size; offset <= size * 2; offset += step) {
    ctx.beginPath();
    ctx.moveTo(offset, 0);
    ctx.lineTo(offset + size, size);
    ctx.stroke();
  }

  // Secondary micro-hatch sheen
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.lineWidth = 1;
  for (let offset = -size + 4; offset <= size * 2; offset += step) {
    ctx.beginPath();
    ctx.moveTo(offset, 0);
    ctx.lineTo(offset + size, size);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.userData = { shared: true };

  textureCache.set("hatch", tex);
  return tex;
}

/**
 * Custom AutoCAD Conceptual Gooch ShaderMaterial (cool-to-warm luminance ramp).
 */
export function createGoochMaterial(opacity = 0.96) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uBaseColor: { value: new THREE.Color(0x9eaab8) },
      uCoolColor: { value: new THREE.Color(0x16324f) },
      uWarmColor: { value: new THREE.Color(0xd99b43) },
      uCoolMix: { value: 0.35 },
      uWarmMix: { value: 0.48 },
      uRimColor: { value: new THREE.Color(0xd4d4d4) },
      uLightDir: { value: new THREE.Vector3(0.45, 0.78, 0.55).normalize() },
      uViewDir: { value: new THREE.Vector3(0.55, 0.52, 0.65).normalize() },
      uOpacity: { value: opacity }
    },
    vertexShader: `
      varying vec3 vNormalW;
      void main() {
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uBaseColor;
      uniform vec3 uCoolColor;
      uniform vec3 uWarmColor;
      uniform float uCoolMix;
      uniform float uWarmMix;
      uniform vec3 uRimColor;
      uniform vec3 uLightDir;
      uniform vec3 uViewDir;
      uniform float uOpacity;
      varying vec3 vNormalW;

      void main() {
        vec3 n = normalize(vNormalW) * (gl_FrontFacing ? 1.0 : -1.0);
        vec3 l = normalize(uLightDir);
        vec3 v = normalize(uViewDir);

        vec3 cool = uCoolColor + uCoolMix * uBaseColor;
        vec3 warm = uWarmColor + uWarmMix * uBaseColor;
        float ndotl = dot(n, l);
        float t = 0.5 * (1.0 + ndotl);
        vec3 col = mix(cool, warm, t);

        vec3 h = normalize(l + v);
        float spec = pow(max(dot(n, h), 0.0), 36.0) * 0.24;
        float rim = pow(1.0 - max(dot(n, v), 0.0), 2.8) * 0.22;
        col += vec3(spec) + uRimColor * rim;

        gl_FragColor = vec4(col, uOpacity);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: opacity >= 0.9
  });
}

/**
 * Syncs Gooch uniforms smoothly with active camera & camera-tracking light direction.
 */
export function updateStyleUniforms(rootGroup, camera, targetVec) {
  if (!rootGroup || !camera) return;
  const viewVec = new THREE.Vector3().copy(camera.position).sub(targetVec || new THREE.Vector3(0, 0, 0)).normalize();
  const keyOffset = new THREE.Vector3(0.35, 0.55, 0.25);
  const lightDir = viewVec.clone().add(keyOffset).normalize();

  rootGroup.traverse((obj) => {
    const mat = obj.material;
    if (mat && mat.isShaderMaterial && mat.uniforms?.uLightDir) {
      mat.uniforms.uLightDir.value.copy(lightDir);
      mat.uniforms.uViewDir.value.copy(viewVec);
    }
  });
}

/**
 * Helper to modulate opacity cleanly across both standard materials and ShaderMaterial.
 */
export function applyGroupOpacity(group, fadeFactor) {
  if (!group) return;
  group.traverse((obj) => {
    const mat = obj.material;
    if (!mat) return;
    const applyOne = (m) => {
      if (m.userData.baseOpacity === undefined) {
        if (m.isShaderMaterial && m.uniforms?.uOpacity) {
          m.userData.baseOpacity = m.uniforms.uOpacity.value;
        } else {
          m.userData.baseOpacity = m.opacity ?? 1;
        }
      }
      const next = m.userData.baseOpacity * fadeFactor;
      if (m.isShaderMaterial && m.uniforms?.uOpacity) {
        m.uniforms.uOpacity.value = next;
      } else {
        m.transparent = next < 0.99 || m.userData.baseTransparent === true;
        m.opacity = next;
      }
    };
    if (Array.isArray(mat)) mat.forEach(applyOne);
    else applyOne(mat);
  });
}

/**
 * Converts indexed or non-indexed { vertices, faces } polyhedron into a Three.js BufferGeometry.
 */
export function polyhedronToBufferGeometry(vertices, faces) {
  const positions = [];
  for (const f of faces) {
    for (let i = 1; i < f.length - 1; i++) {
      const a = vertices[f[0]];
      const b = vertices[f[i]];
      const c = vertices[f[i + 1]];
      if (!a || !b || !c) continue;
      positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a complete styled 3D Group for a polyhedron under the requested Visual Style.
 */
export function buildStyledSolidGroup(polyData, styleId = "shaded", opts = {}) {
  const {
    drawAllEdges = true,
    isGhost = false,
    opacityScale = 1.0,
    castShadow = true,
    receiveShadow = true
  } = opts;

  const group = new THREE.Group();
  group.userData.isStyledSolid = true;

  const geo = Array.isArray(polyData.faces[0])
    ? polyhedronToBufferGeometry(polyData.vertices, polyData.faces)
    : polyhedronToBufferGeometry(
        polyData.vertices,
        polyData.faces.map((f) => f.ids)
      );

  const edgeThreshold = drawAllEdges ? 14 : 28;
  const eg = new THREE.EdgesGeometry(geo, edgeThreshold);

  if (isGhost) {
    const ghostMat = new THREE.MeshBasicMaterial({
      color: 0xbfe8ff,
      transparent: true,
      opacity: 0.08 * opacityScale,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    ghostMat.userData.baseTransparent = true;
    const mesh = new THREE.Mesh(geo, ghostMat);
    group.add(mesh);

    const gLineMat = new THREE.LineDashedMaterial({
      color: 0x7ec8e3,
      dashSize: 3,
      gapSize: 2.2,
      transparent: true,
      opacity: 0.55 * opacityScale
    });
    gLineMat.userData.baseTransparent = true;
    const gLines = new THREE.LineSegments(eg, gLineMat);
    gLines.computeLineDistances();
    group.add(gLines);
    return group;
  }

  let bodyMesh = null;
  let edgeObj = null;

  if (styleId === "conceptual") {
    const mat = createGoochMaterial(0.97 * opacityScale);
    bodyMesh = new THREE.Mesh(geo, mat);
    const eMat = new THREE.LineBasicMaterial({
      color: 0x0d1520,
      transparent: true,
      opacity: 0.85 * opacityScale
    });
    edgeObj = new THREE.LineSegments(eg, eMat);
  } else if (styleId === "xray") {
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x99d6f2,
      metalness: 0.08,
      roughness: 0.25,
      transparent: true,
      opacity: 0.24 * opacityScale,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    mat.userData.baseTransparent = true;
    bodyMesh = new THREE.Mesh(geo, mat);

    const hiddenMat = new THREE.LineDashedMaterial({
      color: 0x7dcfff,
      dashSize: 3.2,
      gapSize: 2.4,
      transparent: true,
      opacity: 0.72 * opacityScale
    });
    hiddenMat.userData.baseTransparent = true;
    edgeObj = new THREE.LineSegments(eg, hiddenMat);
    edgeObj.computeLineDistances();

    // Glowing vertices for high clarity in X-Ray mode
    if (drawAllEdges && polyData.vertices?.length <= 64) {
      const ptsGeo = new THREE.BufferGeometry().setFromPoints(
        polyData.vertices.map((v) => new THREE.Vector3(v[0], v[1], v[2]))
      );
      const ptsMat = new THREE.PointsMaterial({
        color: new THREE.Color().setRGB(0.6, 1.5, 2.0),
        size: 3.8,
        sizeAttenuation: false,
        toneMapped: false
      });
      group.add(new THREE.Points(ptsGeo, ptsMat));
    }
  } else if (styleId === "wireframe") {
    // True CAD Hidden-Line Occluded Wireframe:
    // 1. Depth-only core pushes surface slightly away so front lines pass LessEqual & back lines pass Greater
    const occluderMat = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: true,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 2
    });
    const occluder = new THREE.Mesh(geo, occluderMat);
    occluder.renderOrder = 0;
    group.add(occluder);

    // 2. Obscured back edges (dashed)
    const backEg = eg.clone();
    const backMat = new THREE.LineDashedMaterial({
      color: 0x6b7c8e,
      dashSize: 3.5,
      gapSize: 2.5,
      depthTest: true,
      depthFunc: THREE.GreaterDepth,
      depthWrite: false,
      transparent: true,
      opacity: 0.65 * opacityScale
    });
    backMat.userData.baseTransparent = true;
    const backLines = new THREE.LineSegments(backEg, backMat);
    backLines.computeLineDistances();
    backLines.renderOrder = 1;
    group.add(backLines);

    // 3. Visible front edges (crisp solid white)
    const frontMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      depthTest: true,
      depthFunc: THREE.LessEqualDepth,
      transparent: opacityScale < 0.99,
      opacity: opacityScale
    });
    edgeObj = new THREE.LineSegments(eg, frontMat);
    edgeObj.renderOrder = 2;
  } else if (styleId === "aluminum") {
    const tex = getBrushedAluminumTextures();
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xd0d6de,
      metalness: 0.9,
      roughness: 0.26,
      roughnessMap: tex.roughnessMap,
      bumpMap: tex.bumpMap,
      bumpScale: 0.35,
      clearcoat: 0.38,
      clearcoatRoughness: 0.2,
      envMapIntensity: 1.35,
      transparent: opacityScale < 0.99,
      opacity: opacityScale,
      side: THREE.DoubleSide
    });
    bodyMesh = new THREE.Mesh(geo, mat);
    edgeObj = new THREE.LineSegments(
      eg,
      new THREE.LineBasicMaterial({
        color: 0x222831,
        transparent: true,
        opacity: 0.72 * opacityScale
      })
    );
  } else if (styleId === "glass") {
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xdff6ff,
      metalness: 0.05,
      roughness: 0.14,
      clearcoat: 0.9,
      clearcoatRoughness: 0.08,
      reflectivity: 0.95,
      envMapIntensity: 1.6,
      transparent: true,
      opacity: 0.4 * opacityScale,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    mat.userData.baseTransparent = true;
    bodyMesh = new THREE.Mesh(geo, mat);
    edgeObj = new THREE.LineSegments(
      eg,
      new THREE.LineBasicMaterial({
        color: 0xa6ecff,
        transparent: true,
        opacity: 0.88 * opacityScale
      })
    );
  } else if (styleId === "blueprint") {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x051a2e,
      metalness: 0.2,
      roughness: 0.5,
      transparent: true,
      opacity: 0.36 * opacityScale,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    mat.userData.baseTransparent = true;
    bodyMesh = new THREE.Mesh(geo, mat);

    const glowMat = new THREE.LineBasicMaterial({
      color: new THREE.Color().setRGB(0.28, 1.35, 1.95),
      toneMapped: false,
      transparent: opacityScale < 0.99,
      opacity: opacityScale
    });
    edgeObj = new THREE.LineSegments(eg, glowMat);

    if (drawAllEdges && polyData.vertices?.length <= 64) {
      const ptsGeo = new THREE.BufferGeometry().setFromPoints(
        polyData.vertices.map((v) => new THREE.Vector3(v[0], v[1], v[2]))
      );
      const ptsMat = new THREE.PointsMaterial({
        color: new THREE.Color().setRGB(0.55, 1.75, 2.2),
        size: 3.5,
        sizeAttenuation: false,
        toneMapped: false
      });
      group.add(new THREE.Points(ptsGeo, ptsMat));
    }
  } else {
    // Default "shaded": AutoCAD Shaded with Edges (clean studio PBR + crisp white outlines)
    const mat = new THREE.MeshStandardMaterial({
      color: 0xd0d5dc,
      metalness: 0.16,
      roughness: 0.36,
      envMapIntensity: 1.05,
      transparent: opacityScale < 0.99,
      opacity: 0.94 * opacityScale,
      side: THREE.DoubleSide
    });
    bodyMesh = new THREE.Mesh(geo, mat);
    edgeObj = new THREE.LineSegments(
      eg,
      new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.9 * opacityScale
      })
    );
  }

  if (bodyMesh) {
    bodyMesh.castShadow = castShadow && styleId !== "xray" && styleId !== "blueprint" && styleId !== "glass";
    bodyMesh.receiveShadow = receiveShadow;
    group.add(bodyMesh);
  }
  if (edgeObj) {
    group.add(edgeObj);
  } else {
    eg.dispose();
  }

  return group;
}

/**
 * Builds glowing internal center axis + 12-division generator lines / slant edges overlay.
 */
export function buildInternalGuidesGroup(polyData, options = {}) {
  const {
    axisPts = null,
    isCurved = false,
    isPyramid = false
  } = options;

  const group = new THREE.Group();
  const verts = polyData?.vertices || [];
  if (verts.length === 0) return group;

  // 1. Glowing central axis (explicit endpoints or centroid top-to-bottom)
  let pA = null;
  let pB = null;
  if (axisPts && axisPts.length >= 2) {
    pA = axisPts[0];
    pB = axisPts[1];
  } else if (polyData.n > 0) {
    const n = polyData.n;
    const bCen = [0, 0, 0];
    for (let i = 0; i < n && i < verts.length; i++) {
      bCen[0] += verts[i][0] / n;
      bCen[1] += verts[i][1] / n;
      bCen[2] += verts[i][2] / n;
    }
    pA = bCen;
    if (isPyramid) {
      pB = verts[verts.length - 1];
    } else if (verts.length >= 2 * n) {
      const tCen = [0, 0, 0];
      for (let i = n; i < 2 * n; i++) {
        tCen[0] += verts[i][0] / n;
        tCen[1] += verts[i][1] / n;
        tCen[2] += verts[i][2] / n;
      }
      pB = tCen;
    }
  }

  if (pA && pB) {
    const aVec = new THREE.Vector3(pA[0], pA[1], pA[2]);
    const bVec = new THREE.Vector3(pB[0], pB[1], pB[2]);
    const dir = bVec.clone().sub(aVec);
    const len = dir.length() || 1;
    dir.normalize();
    const axisGeo = new THREE.BufferGeometry().setFromPoints([
      aVec.clone().addScaledVector(dir, -8),
      bVec.clone().addScaledVector(dir, 8)
    ]);
    const axisMat = new THREE.LineDashedMaterial({
      color: new THREE.Color().setRGB(1.85, 1.25, 0.35),
      dashSize: 5,
      gapSize: 2.5,
      depthTest: false,
      toneMapped: false
    });
    const axisLine = new THREE.Line(axisGeo, axisMat);
    axisLine.computeLineDistances();
    axisLine.renderOrder = 4;
    group.add(axisLine);
  }

  // 2. 12-division radial base lines & surface generators for cylinders/cones (or slant diagonals for prisms/pyramids)
  const n = polyData.n || 0;
  if (isCurved && n >= 12) {
    const genPts = [];
    const step = Math.max(1, Math.round(n / 12));
    const apex = isPyramid ? verts[verts.length - 1] : null;

    // Base radial center-to-rim spokes
    const bCen = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      bCen[0] += verts[i][0] / n;
      bCen[1] += verts[i][1] / n;
      bCen[2] += verts[i][2] / n;
    }
    for (let i = 0; i < n; i += step) {
      const bv = verts[i];
      genPts.push(bCen[0], bCen[1], bCen[2], bv[0], bv[1], bv[2]);
      if (isPyramid && apex) {
        genPts.push(bv[0], bv[1], bv[2], apex[0], apex[1], apex[2]);
      } else if (verts.length >= 2 * n) {
        const tv = verts[n + i];
        genPts.push(bv[0], bv[1], bv[2], tv[0], tv[1], tv[2]);
      }
    }
    if (genPts.length > 0) {
      const gGeo = new THREE.BufferGeometry();
      gGeo.setAttribute("position", new THREE.Float32BufferAttribute(genPts, 3));
      const gMat = new THREE.LineDashedMaterial({
        color: 0x888888,
        dashSize: 2.5,
        gapSize: 2.2,
        transparent: true,
        opacity: 0.72
      });
      const gLines = new THREE.LineSegments(gGeo, gMat);
      gLines.computeLineDistances();
      group.add(gLines);
    }
  } else if (n >= 3 && verts.length >= n) {
    // Diagonal base construction spokes & hidden slant guides
    const spokePts = [];
    const bCen = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      bCen[0] += verts[i][0] / n;
      bCen[1] += verts[i][1] / n;
      bCen[2] += verts[i][2] / n;
    }
    for (let i = 0; i < n; i++) {
      spokePts.push(bCen[0], bCen[1], bCen[2], verts[i][0], verts[i][1], verts[i][2]);
    }
    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute("position", new THREE.Float32BufferAttribute(spokePts, 3));
    const sMat = new THREE.LineDashedMaterial({
      color: 0x888888,
      dashSize: 2.2,
      gapSize: 2.2,
      transparent: true,
      opacity: 0.52
    });
    const sLines = new THREE.LineSegments(sGeo, sMat);
    sLines.computeLineDistances();
    group.add(sLines);
  }

  return group;
}
