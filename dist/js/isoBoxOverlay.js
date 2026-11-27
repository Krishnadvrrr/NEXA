import * as THREE from "three";
import { createSpriteLabel } from "./sceneSetup.js";
import { buildStyledSolidGroup, getEngineeringHatchTexture } from "./visualStyles.js";

/**
 * 3D Isometric Enclosing Box, Offsets, Non-Isometric Highlighter, Dual Frustum Boxes,
 * Sphere Rule Callout, 5-Stage Construction Overlay, and "Why 0.8165?" Micro Cube-Tilt Explainer
 */

function makeLineSegmentsFromPairs(pairs, colorHex, opacity = 0.9, dashed = false) {
  const pts = [];
  for (const [a, b] of pairs) {
    pts.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  const mat = dashed
    ? new THREE.LineDashedMaterial({
        color: colorHex,
        dashSize: 2.5,
        gapSize: 2.0,
        transparent: opacity < 1,
        opacity
      })
    : new THREE.LineBasicMaterial({
        color: colorHex,
        transparent: opacity < 1,
        opacity
      });
  const ls = new THREE.LineSegments(geo, mat);
  if (dashed) ls.computeLineDistances();
  return ls;
}

function buildBoxEdgePairs(b, yLo, yHi) {
  const c = [
    [b.maxX, yLo, b.maxZ],
    [b.maxX, yLo, b.minZ],
    [b.minX, yLo, b.minZ],
    [b.minX, yLo, b.maxZ],
    [b.maxX, yHi, b.maxZ],
    [b.maxX, yHi, b.minZ],
    [b.minX, yHi, b.minZ],
    [b.minX, yHi, b.maxZ]
  ];
  return [
    [c[0], c[1]], [c[1], c[2]], [c[2], c[3]], [c[3], c[0]],
    [c[4], c[5]], [c[5], c[6]], [c[6], c[7]], [c[7], c[4]],
    [c[0], c[4]], [c[1], c[5]], [c[2], c[6]], [c[3], c[7]]
  ];
}

/**
 * Builds the 3D scene contents for an Isometric AssemblySpec according to visibility & 5-stage scrubber state.
 */
export function buildIsoLabSceneContent(spec, opts = {}) {
  const {
    visualStyle = "shaded",
    showBox = true,
    showDualBox = true,
    showOffsets = true,
    showGhost = true,
    stage = 5,
    highlightedCutPointId = null
  } = opts;

  const root = new THREE.Group();
  const solidGroup = new THREE.Group();
  const overlayGroup = new THREE.Group();
  const cutMarkerGroup = new THREE.Group();
  root.add(solidGroup, overlayGroup, cutMarkerGroup);

  const b = spec.bounds;
  const f = spec.axisDisplayScale;
  const m = spec.metrics;

  // Stage 1: Base orthometric footprint & vertical guide frame
  if (stage >= 1) {
    const baseRect = [
      [[b.maxX, 0.1, b.maxZ], [b.maxX, 0.1, b.minZ]],
      [[b.maxX, 0.1, b.minZ], [b.minX, 0.1, b.minZ]],
      [[b.minX, 0.1, b.minZ], [b.minX, 0.1, b.maxZ]],
      [[b.minX, 0.1, b.maxZ], [b.maxX, 0.1, b.maxZ]]
    ];
    overlayGroup.add(makeLineSegmentsFromPairs(baseRect, 0x38bdf8, stage === 5 ? 0.35 : 0.72, false));
  }

  // Stage 2: Labeled 30° / 30° / 90° Isometric Axes at Origin O
  if (stage >= 2) {
    const [ox, oy, oz] = spec.originO;
    const axisSpan = Math.max(b.widthZ, b.depthX, b.heightY, 45) * 0.65 + 24 * f;
    const xRightAxis = makeLineSegmentsFromPairs([[[ox, oy, oz], [ox, oy, oz - axisSpan]]], 0x38bdf8, 0.95);
    const zLeftAxis = makeLineSegmentsFromPairs([[[ox, oy, oz], [ox - axisSpan, oy, oz]]], 0x38bdf8, 0.95);
    const yVertAxis = makeLineSegmentsFromPairs([[[ox, oy, oz], [ox, oy + axisSpan * 0.85, oz]]], 0xf5b95d, 0.95);
    overlayGroup.add(xRightAxis, zLeftAxis, yVertAxis);

    createSpriteLabel("O", new THREE.Vector3(ox + 3, oy + 2, oz + 5), "#ffffff", [16, 7], overlayGroup);
    createSpriteLabel("30° Right", new THREE.Vector3(ox + 6, oy + 2, oz - axisSpan - 8), "#38bdf8", [32, 8], overlayGroup);
    createSpriteLabel("30° Left", new THREE.Vector3(ox - axisSpan - 8, oy + 2, oz + 6), "#38bdf8", [30, 8], overlayGroup);
    createSpriteLabel("90° Vertical", new THREE.Vector3(ox, oy + axisSpan * 0.85 + 7, oz), "#f5b95d", [36, 8], overlayGroup);
  }

  // Stage 3: Glowing Translucent Isometric Enclosing Box + Corner Labels (1,2,3,4 & a,b,c,d) + Dimension Callouts
  if (stage >= 3 && showBox) {
    const boxOpacity = stage === 5 ? 0.34 : 0.78;
    const boxMesh = new THREE.Mesh(
      new THREE.BoxGeometry(b.depthX, b.heightY, b.widthZ),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: stage === 5 ? 0.035 : 0.075,
        depthWrite: false
      })
    );
    boxMesh.position.set((b.minX + b.maxX) / 2, b.heightY / 2, (b.minZ + b.maxZ) / 2);
    overlayGroup.add(boxMesh);

    const pairs = buildBoxEdgePairs(b, 0, b.heightY);
    overlayGroup.add(makeLineSegmentsFromPairs(pairs, 0x38bdf8, boxOpacity, stage === 5));

    // Corner labels 1,2,3,4 & a,b,c,d
    spec.boxCorners.base.forEach((c) => {
      createSpriteLabel(c.label, new THREE.Vector3(c.pos[0], c.pos[1] + 2, c.pos[2]), "#bae6fd", [18, 7], overlayGroup);
    });
    spec.boxCorners.top.forEach((c) => {
      createSpriteLabel(c.label, new THREE.Vector3(c.pos[0], c.pos[1] + 3, c.pos[2]), "#bae6fd", [16, 7], overlayGroup);
    });

    // Live Dimension Callouts (updates automatically 1:1 vs 0.8165!)
    createSpriteLabel(
      `${m.shownW.toFixed(1)} mm`,
      new THREE.Vector3(b.maxX + 6, -4, (b.minZ + b.maxZ) / 2),
      "#f5b95d",
      [34, 8],
      overlayGroup
    );
    createSpriteLabel(
      `${m.shownD.toFixed(1)} mm`,
      new THREE.Vector3((b.minX + b.maxX) / 2, -4, b.maxZ + 6),
      "#f5b95d",
      [34, 8],
      overlayGroup
    );
    createSpriteLabel(
      `H = ${m.shownH.toFixed(1)} mm`,
      new THREE.Vector3(b.maxX + 10, b.heightY / 2, b.minZ),
      "#f5b95d",
      [38, 8],
      overlayGroup
    );

    // Optional Dual Top Box for Frustums / Stacked Solids
    if (showDualBox && spec.topBoxBounds) {
      const tb = spec.topBoxBounds;
      const topPairs = [
        [[tb.maxX, tb.y, tb.maxZ], [tb.maxX, tb.y, tb.minZ]],
        [[tb.maxX, tb.y, tb.minZ], [tb.minX, tb.y, tb.minZ]],
        [[tb.minX, tb.y, tb.minZ], [tb.minX, tb.y, tb.maxZ]],
        [[tb.minX, tb.y, tb.maxZ], [tb.maxX, tb.y, tb.maxZ]]
      ];
      overlayGroup.add(makeLineSegmentsFromPairs(topPairs, 0x38bdf8, 0.88, true));
      createSpriteLabel(
        `Top Box ${((tb.widthZ / f) * spec.isoDisplayMultiplier).toFixed(1)}mm`,
        new THREE.Vector3(tb.minX, tb.y + 5, tb.minZ),
        "#7dd3fc",
        [38, 8],
        overlayGroup
      );
    }
  }

  // Stage 4: Plot Offsets, Base Footprint, Curved Generators, Four-Center Rhombus & Non-Isometric Highlights
  if (stage >= 4) {
    if (showOffsets && spec.offsets.length > 0) {
      const offsetPairs = spec.offsets.map((o) => [o.from, o.to]);
      overlayGroup.add(makeLineSegmentsFromPairs(offsetPairs, 0xf5b95d, stage === 5 ? 0.5 : 0.92, true));
      const firstOff = spec.offsets[0];
      if (firstOff) {
        createSpriteLabel(
          `Offset ${firstOff.distDisplayMm.toFixed(1)} mm`,
          new THREE.Vector3(
            (firstOff.from[0] + firstOff.to[0]) / 2,
            3,
            (firstOff.from[2] + firstOff.to[2]) / 2
          ),
          "#f5b95d",
          [34, 8],
          overlayGroup
        );
      }
    }

    // Highlight Isometric vs Non-Isometric lines explicitly on Stage 4+
    if (showOffsets && spec.isoEdges.length > 0 && stage === 4) {
      overlayGroup.add(makeLineSegmentsFromPairs(spec.isoEdges, 0x38bdf8, 0.92, false));
    }
    if (showOffsets && spec.nonIsoEdges.length > 0) {
      overlayGroup.add(makeLineSegmentsFromPairs(spec.nonIsoEdges, 0xf5b95d, stage === 5 ? 0.65 : 0.98, false));
    }

    // Cut point nodes for FV hover synchronization
    for (const cp of spec.cutPoints) {
      const isHi = highlightedCutPointId && cp.id === highlightedCutPointId;
      const dotMesh = new THREE.Mesh(
        new THREE.SphereGeometry(isHi ? 2.4 * f : 1.15 * f, 14, 14),
        new THREE.MeshBasicMaterial({
          color: isHi ? 0xffffff : 0xf5b95d
        })
      );
      dotMesh.position.set(cp.world[0], cp.world[1], cp.world[2]);
      cutMarkerGroup.add(dotMesh);

      if (isHi) {
        // Drop projector from highlighted 3D cut point to base for crystal clarity
        cutMarkerGroup.add(
          makeLineSegmentsFromPairs(
            [[cp.world, [cp.world[0], 0, cp.world[2]]]],
            0xffffff,
            0.95,
            true
          )
        );
        createSpriteLabel(
          `Cut ${cp.label} (Y=${(cp.truePos[1] * spec.isoDisplayMultiplier).toFixed(1)}mm)`,
          new THREE.Vector3(cp.world[0], cp.world[1] + 7, cp.world[2]),
          "#ffffff",
          [42, 9],
          cutMarkerGroup
        );
      }
    }
  }

  // Stage 5: Final Solid Mesh (with Visual Styles, Section Hatching Cap, Removed Cut Ghost, & Sphere Rule!)
  if (stage >= 5) {
    solidGroup.add(
      buildStyledSolidGroup(spec.polyData, visualStyle, {
        drawAllEdges: !spec.curved
      })
    );

    // Hatched planar cut cap if solid is truncated by an inclined cut plane
    if (spec.capPoly && spec.capPoly.length >= 3) {
      const hatchTex = getEngineeringHatchTexture();
      const capGeo = new THREE.BufferGeometry();
      const tris = [];
      const uvs = [];
      const c = spec.capPoly.reduce(
        (acc, p) => [acc[0] + p[0] / spec.capPoly.length, acc[1] + p[1] / spec.capPoly.length, acc[2] + p[2] / spec.capPoly.length],
        [0, 0, 0]
      );
      for (let i = 0; i < spec.capPoly.length; i++) {
        const a = spec.capPoly[i];
        const next = spec.capPoly[(i + 1) % spec.capPoly.length];
        tris.push(c[0], c[1], c[2], a[0], a[1], a[2], next[0], next[1], next[2]);
        uvs.push(c[0] * 0.04, c[2] * 0.04, a[0] * 0.04, a[2] * 0.04, next[0] * 0.04, next[2] * 0.04);
      }
      capGeo.setAttribute("position", new THREE.Float32BufferAttribute(tris, 3));
      capGeo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      capGeo.computeVertexNormals();
      const capMat = new THREE.MeshStandardMaterial({
        map: hatchTex,
        roughness: 0.4,
        metalness: 0.25,
        side: THREE.DoubleSide
      });
      solidGroup.add(new THREE.Mesh(capGeo, capMat));
    }

    // Translucent Removed Upper Ghost for Cut Solids
    if (showGhost && spec.upperGhostPoly) {
      const ghost = buildStyledSolidGroup(spec.upperGhostPoly, "xray", {
        drawAllEdges: !spec.curved
      });
      ghost.traverse((obj) => {
        if (obj.material) {
          obj.material.transparent = true;
          if ("opacity" in obj.material) obj.material.opacity = Math.min(obj.material.opacity ?? 0.2, 0.14);
          obj.castShadow = false;
        }
      });
      solidGroup.add(ghost);
    }

    // Stacked Sphere with True-Radius EG Rule Callout!
    if (spec.sphereSpec) {
      const sp = spec.sphereSpec;
      const sphereGeo = new THREE.SphereGeometry(sp.renderRadiusInScene, 48, 32);
      let sphereMat;
      if (visualStyle === "wireframe") {
        sphereMat = new THREE.MeshBasicMaterial({ color: 0x0d1520, wireframe: true, transparent: true, opacity: 0.55 });
      } else if (visualStyle === "xray" || visualStyle === "glass") {
        sphereMat = new THREE.MeshPhysicalMaterial({
          color: 0xe5e5e5,
          roughness: 0.15,
          metalness: 0.1,
          transparent: true,
          opacity: 0.42
        });
      } else {
        sphereMat = new THREE.MeshStandardMaterial({
          color: 0xc2c8d0,
          roughness: 0.36,
          metalness: 0.28
        });
      }
      const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
      sphereMesh.position.set(0, sp.renderCenterYInScene, 0);
      sphereMesh.castShadow = true;
      sphereMesh.receiveShadow = true;
      solidGroup.add(sphereMesh);

      // Vertical center axis from top of frustum to sphere center
      overlayGroup.add(
        makeLineSegmentsFromPairs(
          [[[0, spec.bounds.maxY, 0], [0, sp.renderCenterYInScene, 0]]],
          0xf5b95d,
          0.95,
          true
        )
      );
      createSpriteLabel(
        `Sphere R = ${sp.trueRadius.toFixed(1)}mm (Center +${(spec.sphereSpec.trueRadius * spec.isoDisplayMultiplier).toFixed(1)}mm)`,
        new THREE.Vector3(0, sp.renderCenterYInScene + sp.renderRadiusInScene + 9, 0),
        "#f5b95d",
        [64, 8],
        overlayGroup
      );
    }
  }

  return { root, solidGroup, overlayGroup, cutMarkerGroup };
}

/**
 * Generates an interactive Linked 2D Reference SVG showing Front View & Top View + Enclosing Rectangle + hoverable Cut Points.
 */
export function buildLinked2DFvTvSVG(spec, highlightedCutId = null) {
  const b = spec.bounds;
  const f = spec.axisDisplayScale;
  const wT = spec.metrics.trueW;
  const dT = spec.metrics.trueD;
  const hT = spec.sphereSpec ? spec.sphereSpec.trueCenterY + spec.sphereSpec.trueRadius : spec.metrics.trueH;

  const span = Math.max(wT, dT, hT, 45);
  const sc = Math.min(120 / span, 90 / (hT + dT + 20));
  const cx = 105;
  const xyY = 108;

  const toFV = (rightNorm, heightT) => [cx + rightNorm * sc, xyY - heightT * sc];
  const toTV = (rightNorm, leftNorm) => [cx + rightNorm * sc, xyY + 14 + (leftNorm + dT / 2) * sc];

  let body = "";
  // XY line
  body += `<line x1="12" y1="${xyY}" x2="198" y2="${xyY}" stroke="#f5b95d" stroke-width="1.2" />`;
  body += `<text x="14" y="${xyY - 4}" fill="#f5b95d" font-size="8" font-family="monospace">FV</text>`;
  body += `<text x="14" y="${xyY + 11}" fill="#f5b95d" font-size="8" font-family="monospace">TV</text>`;

  // FV & TV Enclosing Rectangles (dashed cyan)
  const fvW = wT * sc;
  const fvH = spec.metrics.trueH * sc;
  const tvD = dT * sc;
  body += `<rect x="${cx - fvW / 2}" y="${xyY - fvH}" width="${fvW}" height="${fvH}" fill="none" stroke="#38bdf8" stroke-width="0.9" stroke-dasharray="3 2" />`;
  body += `<rect x="${cx - fvW / 2}" y="${xyY + 14}" width="${fvW}" height="${tvD}" fill="none" stroke="#38bdf8" stroke-width="0.9" stroke-dasharray="3 2" />`;

  // FV outline approximation (Rectangle, Tapered Frustum/Cone/Pyramid)
  if (spec.topBoxBounds) {
    const tw = (spec.topBoxBounds.widthZ / f) * sc;
    body += `<polygon points="${cx - fvW / 2},${xyY} ${cx + fvW / 2},${xyY} ${cx + tw / 2},${xyY - fvH} ${cx - tw / 2},${xyY - fvH}" fill="none" stroke="#ffffff" stroke-width="1.4" />`;
  } else if (spec.polyData.pyramid) {
    body += `<polygon points="${cx - fvW / 2},${xyY} ${cx + fvW / 2},${xyY} ${cx},${xyY - fvH}" fill="none" stroke="#ffffff" stroke-width="1.4" />`;
  } else {
    body += `<rect x="${cx - fvW / 2}" y="${xyY - fvH}" width="${fvW}" height="${fvH}" fill="none" stroke="#ffffff" stroke-width="1.4" />`;
  }

  // Stacked Sphere circle in FV + TV
  if (spec.sphereSpec) {
    const sr = spec.sphereSpec.trueRadius * sc;
    const scY = xyY - spec.sphereSpec.trueCenterY * sc;
    body += `<circle cx="${cx}" cy="${scY}" r="${sr}" fill="none" stroke="#ffffff" stroke-width="1.4" />`;
    body += `<circle cx="${cx}" cy="${xyY + 14 + tvD / 2}" r="${sr}" fill="none" stroke="#ffffff" stroke-width="1.1" stroke-dasharray="2 2" />`;
  }

  // TV Base Shape
  if (spec.curved) {
    body += `<circle cx="${cx}" cy="${xyY + 14 + tvD / 2}" r="${fvW / 2}" fill="none" stroke="#ffffff" stroke-width="1.3" />`;
  } else {
    const tvPts = spec.key2DVertices
      .map(([lx, rz]) => toTV(-rz, -lx).join(","))
      .join(" ");
    body += `<polygon points="${tvPts}" fill="none" stroke="#ffffff" stroke-width="1.3" />`;
  }

  // Cutting Plane VT line in FV + hoverable cut points
  if (spec.cutBasis) {
    const ch = spec.cutBasis.cutHeight / f;
    const rad = ((spec.cutBasis.angleDeg || 30) * Math.PI) / 180;
    const dy = (wT * 0.65) * Math.tan(rad);
    const p1 = toFV(-wT * 0.65, ch - dy);
    const p2 = toFV(wT * 0.65, ch + dy);
    body += `<line x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" stroke="#f5b95d" stroke-width="1.5" stroke-dasharray="6 3" />`;
    body += `<text x="${p2[0] + 2}" y="${p2[1] - 2}" fill="#f5b95d" font-size="8" font-family="monospace">VT ${spec.cutBasis.angleDeg}°</text>`;
  }

  for (const cp of spec.cutPoints) {
    const [tx, ty, tz] = cp.truePos;
    const fvp = toFV(-tz, ty);
    const isHi = highlightedCutId === cp.id;
    body += `<circle class="fv-cut-pt" data-cutid="${cp.id}" cx="${fvp[0]}" cy="${fvp[1]}" r="${isHi ? 4.8 : 3.4}" fill="${isHi ? "#ffffff" : "#f5b95d"}" stroke="#000000" stroke-width="0.9" style="cursor:pointer" />`;
    body += `<text class="fv-cut-pt" data-cutid="${cp.id}" x="${fvp[0] + 4}" y="${fvp[1] - 4}" fill="${isHi ? "#ffffff" : "#f5b95d"}" font-size="7.5" font-family="monospace" style="cursor:pointer">${cp.label}</text>`;
  }

  return `<svg viewBox="0 0 210 205" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}
