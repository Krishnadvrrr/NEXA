import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

/**
 * Live 3D Step Visualizer Engine for Practice Studio
 * Demonstrates the 3D spatial evolution of the student's drawing step-by-step
 * (from 2D base on HP, to upright solid, to inclined/tilted solid, to section cuts and developments)
 * and projects the student's actual 2D drafted strokes onto the 3D HP/VP planes in real time.
 */

export function createPractice3D(host) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  host.innerHTML = "";
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();

  // Orthographic camera for true engineering projections
  const camera = new THREE.OrthographicCamera(-120, 120, 120, -120, 0.1, 4000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minZoom = 0.3;
  controls.maxZoom = 6;

  // Scene lighting
  scene.add(new THREE.HemisphereLight(0xb3faff, 0x172c43, 2.5));
  const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
  dirLight.position.set(120, 200, 160);
  scene.add(dirLight);

  const fillLight = new THREE.DirectionalLight(0x45d5b0, 1.2);
  fillLight.position.set(-100, 100, -100);
  scene.add(fillLight);

  // Groups
  const staticPlanesGroup = new THREE.Group();
  const stageGroup = new THREE.Group();
  const strokesGroup = new THREE.Group();

  scene.add(staticPlanesGroup);
  scene.add(stageGroup);
  scene.add(strokesGroup);

  let extent = 120;
  const center = new THREE.Vector3(0, 35, 35);
  let dirty = true;
  let disposed = false;
  let currentPreset = "iso";

  // Build HP, VP, and XY line
  function buildPlanes() {
    // Clear previous
    while (staticPlanesGroup.children.length > 0) {
      const o = staticPlanesGroup.children.pop();
      o.geometry?.dispose();
    }

    const planeMat = new THREE.MeshBasicMaterial({
      color: 0x18485e,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // Horizontal Plane (HP): Y = 0, Z >= 0
    const hpGeo = new THREE.PlaneGeometry(extent * 2.2, extent * 1.4);
    const hp = new THREE.Mesh(hpGeo, planeMat);
    hp.rotation.x = -Math.PI / 2;
    hp.position.set(0, 0, (extent * 1.4) / 2);
    staticPlanesGroup.add(hp);

    // Vertical Plane (VP): Z = 0, Y >= 0
    const vpGeo = new THREE.PlaneGeometry(extent * 2.2, extent * 1.4);
    const vp = new THREE.Mesh(vpGeo, planeMat.clone());
    vp.position.set(0, (extent * 1.4) / 2, 0);
    staticPlanesGroup.add(vp);

    // Subtle Grid lines on HP and VP
    const gridPoints = [];
    for (let x = -extent; x <= extent; x += 20) {
      // HP grid lines (along Z)
      gridPoints.push(x, 0, 0, x, 0, extent * 1.4);
      // VP grid lines (along Y)
      gridPoints.push(x, 0, 0, x, extent * 1.4, 0);
    }
    for (let z = 0; z <= extent * 1.4; z += 20) {
      gridPoints.push(-extent, 0, z, extent, 0, z);
    }
    for (let y = 0; y <= extent * 1.4; y += 20) {
      gridPoints.push(-extent, y, 0, extent, y, 0);
    }

    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(gridPoints, 3),
    );
    const gridMat = new THREE.LineBasicMaterial({
      color: 0x1f3c4d,
      transparent: true,
      opacity: 0.5,
    });
    staticPlanesGroup.add(new THREE.LineSegments(gridGeo, gridMat));

    // XY Reference line (intersection of HP and VP)
    const xyGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-extent * 1.1, 0, 0),
      new THREE.Vector3(extent * 1.1, 0, 0),
    ]);
    const xyLine = new THREE.Line(
      xyGeo,
      new THREE.LineBasicMaterial({ color: 0xf5b95d, linewidth: 2 }),
    );
    staticPlanesGroup.add(xyLine);

    // Plane Labels
    createTextSprite(
      "HP (Horizontal Plane)",
      new THREE.Vector3(extent * 0.7, 0, extent * 1.1),
      "#6fa3ba",
    );
    createTextSprite(
      "VP (Vertical Plane)",
      new THREE.Vector3(-extent * 0.7, extent * 1.1, 0),
      "#6fa3ba",
    );
    createTextSprite(
      "X",
      new THREE.Vector3(-extent * 1.1 - 6, 0, 0),
      "#f5b95d",
    );
    createTextSprite(
      "Y",
      new THREE.Vector3(extent * 1.1 + 6, 0, 0),
      "#f5b95d",
    );
  }

  function createTextSprite(text, pos, color = "#8aafc0") {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    ctx.font = "bold 26px 'Segoe UI', monospace";
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.fillText(text, 128, 42);

    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
      }),
    );
    sprite.scale.set(38, 9.5, 1);
    sprite.position.copy(pos);
    staticPlanesGroup.add(sprite);
  }

  // Update 3D Stage according to Question and Active Step
  function updateStage(question, stepIndex, drawnElements = []) {
    // Clear previous stage
    while (stageGroup.children.length > 0) {
      const o = stageGroup.children.pop();
      o.geometry?.dispose();
      if (Array.isArray(o.material)) o.material.forEach((m) => m?.dispose());
      else o.material?.dispose();
    }

    if (!question) {
      updateStrokes(drawnElements);
      dirty = true;
      return;
    }

    const p = question.parameters || {};
    const solidType = p.solid || "squarePrism";
    const baseEdge = p.baseEdge || p.diameter || 30;
    const height = p.height || 60;
    const radius = p.radius || baseEdge / 2;
    const alpha = p.alpha || 45;

    // Determine the spatial evolution stage based on step number and title
    const currentStep = question.steps?.[stepIndex];
    const stepNum = currentStep?.stepNumber || stepIndex + 1;
    const stepTitle = (currentStep?.title || "").toLowerCase();

    // Material definitions
    const solidMat = new THREE.MeshStandardMaterial({
      color: 0x00d8e8,
      metalness: 0.15,
      roughness: 0.35,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x4cf9ff,
      linewidth: 2,
    });
    const projMat = new THREE.LineDashedMaterial({
      color: 0x64748b,
      dashSize: 3,
      gapSize: 2,
    });
    const axisMat = new THREE.LineDashedMaterial({
      color: 0xf5b95d,
      dashSize: 6,
      gapSize: 3,
      depthTest: false,
    });
    const cutMat = new THREE.MeshStandardMaterial({
      color: 0xff5370,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });

    // -------------------------------------------------------------
    // STAGE 1: Reference line
    // -------------------------------------------------------------
    if (stepNum === 1) {
      updateSpatialDescription(
        "Stage 1: Reference System (VP / HP)",
        "The horizontal XY reference line divides the Vertical Plane (VP) above from the Horizontal Plane (HP) in front.",
      );
    }

    // -------------------------------------------------------------
    // STAGE 2: 2D Base on HP (Top View)
    // -------------------------------------------------------------
    else if (stepNum === 2) {
      const centerZ = 45;
      const baseMesh = buildBase2DMesh(solidType, baseEdge, radius, centerZ);
      stageGroup.add(baseMesh);

      // Add normal arrow pointing up
      const arrow = new THREE.ArrowHelper(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0, 0, centerZ),
        25,
        0x00f0ff,
        6,
        4,
      );
      stageGroup.add(arrow);

      updateSpatialDescription(
        "Stage 2: 2D Base Resting on HP",
        `In 3D reality, your drafted Top View is a physical 2D base lying directly on the Horizontal Plane (HP) at Z = ${centerZ} mm in front of VP.`,
      );
    }

    // -------------------------------------------------------------
    // STAGE 3: Projectors to XY Line
    // -------------------------------------------------------------
    else if (stepNum === 3) {
      const centerZ = 45;
      const baseMesh = buildBase2DMesh(solidType, baseEdge, radius, centerZ);
      stageGroup.add(baseMesh);

      // Add vertical projector rays from base corners to XY and up into VP
      const projLines = buildProjectorRays(
        solidType,
        baseEdge,
        radius,
        centerZ,
        height,
      );
      stageGroup.add(projLines);

      updateSpatialDescription(
        "Stage 3: Orthographic Projectors",
        "Thin construction projectors transfer the width from the base on HP up to the XY ground line and into the Vertical Plane (VP).",
      );
    }

    // -------------------------------------------------------------
    // STAGE 4: Simple Position (Erect Solid)
    // -------------------------------------------------------------
    else if (stepNum === 4) {
      const centerZ = 45;
      const solidGroup = build3DSolidMesh(
        solidType,
        baseEdge,
        radius,
        height,
        0,
        solidMat,
        lineMat,
      );
      solidGroup.position.set(0, 0, centerZ);
      stageGroup.add(solidGroup);

      // Central Axis line
      const axisGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, centerZ),
        new THREE.Vector3(0, height, centerZ),
      ]);
      const al = new THREE.Line(axisGeo, axisMat);
      al.computeLineDistances();
      stageGroup.add(al);

      updateSpatialDescription(
        "Stage 4: Solid in Simple Position",
        `The ${question.title.split("—")[0].trim()} stands upright on HP with its axis perpendicular to HP (${height} mm high) and parallel to VP.`,
      );
    }

    // -------------------------------------------------------------
    // STAGE 5: Tilted / Inclined Position or Section Plane
    // -------------------------------------------------------------
    else if (stepNum === 5) {
      const centerZ = 45;

      if (question.unit === "Section of Solids") {
        // Section of Solids: Upright solid cut by an inclined section plane!
        const solidGroup = build3DSolidMesh(
          solidType,
          baseEdge,
          radius,
          height,
          0,
          solidMat,
          lineMat,
        );
        solidGroup.position.set(0, 0, centerZ);
        stageGroup.add(solidGroup);

        // Section Cutting Plane
        const cutAngle = p.cuttingAngle || 45;
        const cutHeight = p.cutHeight || 30;
        const cutPlane = buildCuttingPlaneMesh(
          cutAngle,
          cutHeight,
          centerZ,
          cutMat,
        );
        stageGroup.add(cutPlane);

        updateSpatialDescription(
          `Stage 5: Section Plane Cutting Solid at ${cutAngle}°`,
          `An Auxiliary Inclined Plane (AIP) inclined at ${cutAngle}° to HP slices through the solid at height ${cutHeight} mm, dividing it into truncated and truncated portions.`,
        );
      } else {
        // Projection of Solids: Inclined to HP
        const tiltAngleRad = ((90 - alpha) * Math.PI) / 180; // Tilt from vertical
        const solidGroup = build3DSolidMesh(
          solidType,
          baseEdge,
          radius,
          height,
          tiltAngleRad,
          solidMat,
          lineMat,
        );
        solidGroup.position.set(0, 0, centerZ);
        stageGroup.add(solidGroup);

        updateSpatialDescription(
          `Stage 5: Solid Tilted at ${alpha}° to HP`,
          `The solid tilts so that its axis is inclined at ${alpha}° to HP, resting on a single base edge or corner on the ground plane.`,
        );
      }
    }

    // -------------------------------------------------------------
    // STAGE 6: Final Section / True Shape / Development
    // -------------------------------------------------------------
    else {
      const centerZ = 45;

      if (question.unit === "Development of Surfaces") {
        // Show truncated 3D solid alongside unrolled sheet
        const solidGroup = build3DSolidMesh(
          solidType,
          baseEdge,
          radius,
          height,
          0,
          solidMat,
          lineMat,
        );
        solidGroup.position.set(-35, 0, centerZ);
        stageGroup.add(solidGroup);

        // Unrolled development plane
        const devMesh = buildDevelopmentSheetMesh(
          solidType,
          baseEdge,
          height,
          centerZ,
        );
        stageGroup.add(devMesh);

        updateSpatialDescription(
          "Stage 6: Surface Development",
          "The lateral surface of the truncated solid unrolls into a flat 2D pattern showing the true length of every fold line.",
        );
      } else if (question.unit === "Section of Solids") {
        // Truncated solid with true cut shape
        const solidGroup = build3DSolidMesh(
          solidType,
          baseEdge,
          radius,
          height,
          0,
          solidMat,
          lineMat,
        );
        solidGroup.position.set(0, 0, centerZ);
        stageGroup.add(solidGroup);

        const cutAngle = p.cuttingAngle || 45;
        const cutHeight = p.cutHeight || 30;
        const cutPlane = buildCuttingPlaneMesh(
          cutAngle,
          cutHeight,
          centerZ,
          cutMat,
        );
        stageGroup.add(cutPlane);

        updateSpatialDescription(
          "Stage 6: Sectional View & True Shape",
          "The cut surface viewed perpendicular to the cutting plane reveals the True Shape of the section (e.g. true polygon or ellipse).",
        );
      } else {
        // Tilted solid with downward projectors to final Top View
        const tiltAngleRad = ((90 - alpha) * Math.PI) / 180;
        const solidGroup = build3DSolidMesh(
          solidType,
          baseEdge,
          radius,
          height,
          tiltAngleRad,
          solidMat,
          lineMat,
        );
        solidGroup.position.set(0, 0, centerZ);
        stageGroup.add(solidGroup);

        updateSpatialDescription(
          "Stage 6: Final Orthographic Projections",
          "Projecting downwards from all tilted vertices produces the final foreshortened Top View on HP with visible and hidden edges.",
        );
      }
    }

    // Mirror student's actual 2D drawings in 3D space
    updateStrokes(drawnElements);
    dirty = true;
  }

  // Project student's 2D canvas strokes directly onto 3D HP/VP planes!
  function updateStrokes(drawnElements = []) {
    while (strokesGroup.children.length > 0) {
      const o = strokesGroup.children.pop();
      o.geometry?.dispose();
      o.material?.dispose();
    }

    if (!drawnElements || drawnElements.length === 0) {
      dirty = true;
      return;
    }

    const strokeLines = [];
    const strokeColors = [];

    const hexColor = (grade) => {
      if (grade === "HB") return 0x00f0ff;
      if (grade === "2H") return 0x5d8193;
      if (grade === "Axis") return 0xf5b95d;
      if (grade === "Hidden") return 0x8298a9;
      if (grade === "Cutting Plane") return 0xff5370;
      return 0x00f0ff;
    };

    for (const el of drawnElements) {
      const col = new THREE.Color(hexColor(el.grade));

      if (el.type === "line") {
        // If line is in Top View (y < 0): maps onto HP (Y_3d = 0, Z_3d = -y)
        // If line is in Front View (y > 0): maps onto VP (Y_3d = y, Z_3d = 0)
        let p1_3d, p2_3d;

        if (el.y1 <= 0 && el.y2 <= 0) {
          // On HP
          p1_3d = new THREE.Vector3(el.x1, 0.2, -el.y1);
          p2_3d = new THREE.Vector3(el.x2, 0.2, -el.y2);
        } else if (el.y1 >= 0 && el.y2 >= 0) {
          // On VP
          p1_3d = new THREE.Vector3(el.x1, el.y1, 0.2);
          p2_3d = new THREE.Vector3(el.x2, el.y2, 0.2);
        } else {
          // Crosses XY line
          p1_3d =
            el.y1 < 0
              ? new THREE.Vector3(el.x1, 0.2, -el.y1)
              : new THREE.Vector3(el.x1, el.y1, 0.2);
          p2_3d =
            el.y2 < 0
              ? new THREE.Vector3(el.x2, 0.2, -el.y2)
              : new THREE.Vector3(el.x2, el.y2, 0.2);
        }

        const geo = new THREE.BufferGeometry().setFromPoints([p1_3d, p2_3d]);
        const mat = new THREE.LineBasicMaterial({
          color: col,
          linewidth: el.grade === "HB" ? 3 : 1.5,
        });
        strokesGroup.add(new THREE.Line(geo, mat));
      } else if (el.type === "polygon" && el.points) {
        const pts_3d = [];
        const isHP = el.cy < 0;

        for (const pt of el.points) {
          if (isHP) pts_3d.push(new THREE.Vector3(pt[0], 0.2, -pt[1]));
          else pts_3d.push(new THREE.Vector3(pt[0], pt[1], 0.2));
        }
        if (pts_3d.length > 0) pts_3d.push(pts_3d[0]); // Close loop

        const geo = new THREE.BufferGeometry().setFromPoints(pts_3d);
        const mat = new THREE.LineBasicMaterial({ color: col, linewidth: 2.5 });
        strokesGroup.add(new THREE.Line(geo, mat));
      } else if (el.type === "circle") {
        const isHP = el.cy < 0;
        const segments = 64;
        const circlePts = [];

        for (let i = 0; i <= segments; i++) {
          const theta = (i / segments) * Math.PI * 2;
          const px = el.cx + el.radius * Math.cos(theta);
          const py = el.cy + el.radius * Math.sin(theta);
          if (isHP) circlePts.push(new THREE.Vector3(px, 0.2, -py));
          else circlePts.push(new THREE.Vector3(px, py, 0.2));
        }

        const geo = new THREE.BufferGeometry().setFromPoints(circlePts);
        const mat = new THREE.LineBasicMaterial({ color: col, linewidth: 2 });
        strokesGroup.add(new THREE.Line(geo, mat));
      }
    }

    dirty = true;
  }

  function updateSpatialDescription(title, desc) {
    const titleEl = document.getElementById("stepSpatialTag");
    const descEl = document.getElementById("stepSpatialDesc");
    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = desc;
  }

  // Geometry Builders
  function buildBase2DMesh(solidType, edge, radius, centerZ) {
    const group = new THREE.Group();
    let geo;

    if (solidType.includes("hex")) {
      const sides = 6;
      const R = edge;
      const shape = new THREE.Shape();
      for (let i = 0; i < sides; i++) {
        const a = (i * Math.PI * 2) / sides;
        const x = R * Math.cos(a);
        const z = R * Math.sin(a);
        if (i === 0) shape.moveTo(x, z);
        else shape.lineTo(x, z);
      }
      shape.closePath();
      geo = new THREE.ShapeGeometry(shape);
    } else if (solidType.includes("square") || solidType === "cube") {
      const half = edge / 2;
      geo = new THREE.PlaneGeometry(edge, edge);
    } else {
      // Cylinder or Cone (Circle base)
      geo = new THREE.CircleGeometry(radius, 48);
    }

    // Lay flat on HP (rotation X = -90 deg)
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, 0.2, centerZ);
    group.add(mesh);

    // Glowing border outline
    const wireGeo = new THREE.EdgesGeometry(geo);
    const wireMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      linewidth: 2.5,
    });
    const wire = new THREE.LineSegments(wireGeo, wireMat);
    wire.rotation.x = -Math.PI / 2;
    wire.position.set(0, 0.25, centerZ);
    group.add(wire);

    return group;
  }

  function buildProjectorRays(solidType, edge, radius, centerZ, height) {
    const group = new THREE.Group();
    const projPoints = [];

    // Base corner points on HP
    const w = edge / 2;
    const cornerXs = [-w, w];

    for (const x of cornerXs) {
      // From base on HP to XY line (Z = 0)
      projPoints.push(x, 0.2, centerZ, x, 0.2, 0);
      // Rising up in VP
      projPoints.push(x, 0, 0.2, x, height, 0.2);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(projPoints, 3),
    );
    const mat = new THREE.LineDashedMaterial({
      color: 0x64748b,
      dashSize: 4,
      gapSize: 3,
    });
    const lines = new THREE.LineSegments(geo, mat);
    lines.computeLineDistances();
    group.add(lines);

    return group;
  }

  function build3DSolidMesh(
    solidType,
    edge,
    radius,
    height,
    tiltAngleRad,
    solidMat,
    lineMat,
  ) {
    const group = new THREE.Group();
    let meshGeo;

    if (solidType.includes("hex") && solidType.includes("Pyramid")) {
      meshGeo = new THREE.ConeGeometry(edge, height, 6);
    } else if (solidType.includes("hex")) {
      meshGeo = new THREE.CylinderGeometry(edge, edge, height, 6);
    } else if (
      solidType.includes("square") &&
      solidType.includes("Pyramid")
    ) {
      meshGeo = new THREE.ConeGeometry(edge * 0.707, height, 4);
    } else if (solidType.includes("square") || solidType === "cube") {
      meshGeo = new THREE.BoxGeometry(edge, height, edge);
    } else if (solidType === "cone") {
      meshGeo = new THREE.ConeGeometry(radius, height, 48);
    } else {
      // Cylinder
      meshGeo = new THREE.CylinderGeometry(radius, radius, height, 48);
    }

    const mesh = new THREE.Mesh(meshGeo, solidMat);
    // Center of box/cylinder is at height/2
    mesh.position.y = height / 2;

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(meshGeo, 15),
      lineMat,
    );
    edges.position.y = height / 2;

    const innerGroup = new THREE.Group();
    innerGroup.add(mesh);
    innerGroup.add(edges);

    // Tilt rotation around X axis or Z axis
    if (tiltAngleRad !== 0) {
      innerGroup.rotation.z = tiltAngleRad;
      // Adjust pivot so it rests on ground
      innerGroup.position.y = 0;
    }

    group.add(innerGroup);
    return group;
  }

  function buildCuttingPlaneMesh(angleDeg, cutHeight, centerZ, cutMat) {
    const group = new THREE.Group();
    const planeW = 80;
    const planeH = 90;
    const geo = new THREE.PlaneGeometry(planeW, planeH);

    const mesh = new THREE.Mesh(geo, cutMat);
    mesh.position.set(0, cutHeight, centerZ);
    // Angle in degrees to HP
    mesh.rotation.z = ((angleDeg - 90) * Math.PI) / 180;
    group.add(mesh);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: 0xff5370, linewidth: 2 }),
    );
    edges.position.copy(mesh.position);
    edges.rotation.copy(mesh.rotation);
    group.add(edges);

    return group;
  }

  function buildDevelopmentSheetMesh(solidType, edge, height, centerZ) {
    const group = new THREE.Group();
    const stretchLen = edge * 4; // 120 mm for square prism
    const geo = new THREE.PlaneGeometry(stretchLen, height);

    const mat = new THREE.MeshBasicMaterial({
      color: 0xf5b95d,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(40, height / 2, 0.2); // On VP
    group.add(mesh);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: 0xf5b95d, linewidth: 2 }),
    );
    edges.position.copy(mesh.position);
    group.add(edges);

    return group;
  }

  // Camera presets
  function view(name = "iso") {
    currentPreset = name;
    controls.target.copy(center);

    const directions = {
      iso: [1, 0.9, 1],
      front: [0, 0, 1], // elevation (VP)
      top: [0, 1, 0.0001], // plan (HP)
      side: [1, 0, 0],
    };

    const dir = directions[name] || directions.iso;
    camera.position
      .copy(center)
      .add(new THREE.Vector3(...dir).multiplyScalar(400));
    camera.up.set(0, 1, 0);
    camera.zoom = 1;
    controls.update();
    resize();
    dirty = true;
  }

  function resize() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;

    renderer.setSize(w, h, false);
    camera.left = (-extent * w) / h;
    camera.right = (extent * w) / h;
    camera.top = extent;
    camera.bottom = -extent;
    camera.updateProjectionMatrix();
    dirty = true;
  }

  controls.addEventListener("change", () => (dirty = true));

  const observer = new ResizeObserver(() => resize());
  observer.observe(host);

  function frame() {
    if (disposed) return;
    requestAnimationFrame(frame);
    controls.update();
    if (dirty && host.clientWidth) {
      renderer.render(scene, camera);
      dirty = false;
    }
  }

  // Initialize
  buildPlanes();
  view("iso");
  frame();

  return {
    updateStage,
    updateStrokes,
    view,
    resize,
    get preset() {
      return currentPreset;
    },
    dispose() {
      disposed = true;
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
    },
  };
}
