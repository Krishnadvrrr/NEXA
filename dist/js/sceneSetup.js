import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

/**
 * Shared Three.js Studio Scene Infrastructure:
 * - ACESFilmic WebGLRenderer + PCFSoftShadowMap + SRGBColorSpace
 * - Procedural PMREM RoomEnvironment reflections
 * - Selective UnrealBloomPass via EffectComposer + OutputPass (with instant Performance Mode bypass)
 * - AutoCAD-inspired Camera-Tracking Fill + 3-Point Studio Lighting
 * - Glass Reference Planes (HP/VP), Engraved Grids, Glowing XY Hinge, & Disposal utilities
 */

export function disposeObjectTree(obj) {
  if (!obj) return;
  if (obj.children && obj.children.length > 0) {
    for (const child of [...obj.children]) {
      disposeObjectTree(child);
    }
  }
  obj.geometry?.dispose();
  const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
  for (const m of mats) {
    if (!m) continue;
    for (const mapKey of ["map", "bumpMap", "roughnessMap", "normalMap", "alphaMap", "emissiveMap"]) {
      const tex = m[mapKey];
      if (tex && !tex.userData?.shared) {
        tex.dispose();
      }
    }
    m.dispose();
  }
}

export function clearThreeGroup(group) {
  if (!group) return;
  while (group.children.length > 0) {
    const child = group.children.pop();
    disposeObjectTree(child);
  }
}

export function createSpriteLabel(text, pos, color = "#9ca3af", scaleSize = [32, 8], targetGroup = null) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.font = "600 24px 'Segoe UI', monospace";
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 128, 32);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false
    })
  );
  sprite.scale.set(scaleSize[0], scaleSize[1], 1);
  sprite.position.copy(pos);
  if (targetGroup) targetGroup.add(sprite);
  return sprite;
}

/**
 * Creates WebGLRenderer + PMREM RoomEnvironment reflections on `scene.environment`.
 */
export function createStudioRenderer(host, scene) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance"
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true;

  host.innerHTML = "";
  host.appendChild(renderer.domElement);

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  const roomEnv = new RoomEnvironment();
  const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.85;
  roomEnv.dispose();
  pmremGenerator.dispose();

  return {
    renderer,
    disposeEnv() {
      scene.environment = null;
      envTarget.dispose();
    }
  };
}

/**
 * Configures 3-point studio lighting + AutoCAD camera-tracking fill light.
 */
export function createStudioLighting(scene, shadowRadius = 190) {
  const hemi = new THREE.HemisphereLight(0xffffff, 0x111111, 1.15);
  scene.add(hemi);

  const keyLight = new THREE.DirectionalLight(0xfff5e8, 2.2);
  keyLight.position.set(130, 240, 170);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 1024;
  keyLight.shadow.mapSize.height = 1024;
  keyLight.shadow.camera.near = 20;
  keyLight.shadow.camera.far = 700;
  keyLight.shadow.camera.left = -shadowRadius;
  keyLight.shadow.camera.right = shadowRadius;
  keyLight.shadow.camera.top = shadowRadius;
  keyLight.shadow.camera.bottom = -shadowRadius;
  keyLight.shadow.bias = -0.0005;
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xffffff, 1.05);
  rimLight.position.set(-150, 120, -140);
  scene.add(rimLight);

  // AutoCAD viewpoint-locked headlight fill so shadowed sides stay crisp
  const trackLight = new THREE.DirectionalLight(0xffffff, 0.9);
  trackLight.position.set(100, 140, 160);
  scene.add(trackLight);

  return {
    hemi,
    keyLight,
    rimLight,
    trackLight,
    setShadows(enabled) {
      keyLight.castShadow = enabled;
    },
    updateTracking(camera, target) {
      if (!camera) return;
      const t = target || new THREE.Vector3(0, 0, 0);
      const offset = camera.position.clone().sub(t).normalize();
      trackLight.position.copy(t).addScaledVector(offset, 260);
      trackLight.position.y += 55;
    }
  };
}

/**
 * Sets up EffectComposer + RenderPass + restrained selective UnrealBloomPass + OutputPass.
 */
export function createComposerPipeline(renderer, scene, camera) {
  const isWebGL2 = renderer.capabilities?.isWebGL2;
  const rt = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: isWebGL2 ? 4 : 0
  });

  const composer = new EffectComposer(renderer, rt);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.38, 0.3, 0.92);
  composer.addPass(bloomPass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  let composerHealthy = true;

  function resize(w, h) {
    if (!w || !h) return;
    composer.setSize(w, h);
    bloomPass.setSize(w, h);
  }

  function renderFrame(performanceMode = false) {
    if (performanceMode || !composerHealthy) {
      renderer.shadowMap.enabled = false;
      renderer.render(scene, camera);
      return;
    }
    renderer.shadowMap.enabled = true;
    try {
      composer.render();
    } catch {
      composerHealthy = false;
      renderer.render(scene, camera);
    }
  }

  function dispose() {
    composer.dispose();
    rt.dispose();
  }

  return { resize, renderFrame, dispose };
}

/**
 * Dark subtly reflective studio floor + soft shadow receiver under HP.
 */
export function createStudioFloor(yLevel = -0.65, radius = 320) {
  const group = new THREE.Group();

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 128);
  grad.addColorStop(0, "rgba(28, 34, 42, 0.42)");
  grad.addColorStop(0.55, "rgba(12, 16, 22, 0.22)");
  grad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  const discTex = new THREE.CanvasTexture(canvas);
  const discGeo = new THREE.CircleGeometry(radius, 48);
  const discMat = new THREE.MeshBasicMaterial({
    map: discTex,
    transparent: true,
    depthWrite: false
  });
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = yLevel;
  group.add(disc);

  const shadowMat = new THREE.ShadowMaterial({ opacity: 0.35 });
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(radius * 1.8, radius * 1.8), shadowMat);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = yLevel + 0.08;
  shadowPlane.receiveShadow = true;
  group.add(shadowPlane);

  return group;
}

/**
 * Sleek translucent Glass Reference Planes (VP wall + HP floor) with engraved grids & glowing XY hinge.
 */
export function buildGlassReferencePlanesIntoGroups({
  xyGroup,
  vpGroup,
  hpGroup,
  minX = -160,
  maxX = 180,
  heightSpan = 160,
  depthSpan = 150,
  gridStep = 20,
  xyLineY = 0
}) {
  const width = maxX - minX;
  const midX = (minX + maxX) / 2;

  const vpGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x080808,
    metalness: 0.1,
    roughness: 0.25,
    clearcoat: 0.5,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const hpGlassMat = vpGlassMat.clone();
  hpGlassMat.color.setHex(0x060606);
  hpGlassMat.opacity = 0.26;

  // Vertical Plane (VP Wall at Z = 0)
  const vpMesh = new THREE.Mesh(new THREE.PlaneGeometry(width, heightSpan), vpGlassMat);
  vpMesh.position.set(midX, heightSpan / 2, -0.3);
  vpMesh.receiveShadow = true;
  vpGroup.add(vpMesh);

  const vpBorder = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(width, heightSpan)),
    new THREE.LineBasicMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0.72 })
  );
  vpBorder.position.copy(vpMesh.position);
  vpGroup.add(vpBorder);

  const vpGridPts = [];
  for (let x = minX; x <= maxX; x += gridStep) {
    vpGridPts.push(x, 0, 0, x, heightSpan, 0);
  }
  for (let y = 0; y <= heightSpan; y += gridStep) {
    vpGridPts.push(minX, y, 0, maxX, y, 0);
  }
  const vpGridGeo = new THREE.BufferGeometry();
  vpGridGeo.setAttribute("position", new THREE.Float32BufferAttribute(vpGridPts, 3));
  vpGroup.add(
    new THREE.LineSegments(
      vpGridGeo,
      new THREE.LineBasicMaterial({ color: 0x1c1c1c, transparent: true, opacity: 0.48 })
    )
  );
  createSpriteLabel("VP (Front View)", new THREE.Vector3(minX + 36, heightSpan - 12, 1), "#777777", [46, 9], vpGroup);

  // Horizontal Plane (HP Floor)
  const hpMesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depthSpan), hpGlassMat);
  hpMesh.rotation.x = -Math.PI / 2;
  hpMesh.position.set(midX, -0.25, depthSpan / 2);
  hpMesh.receiveShadow = true;
  hpGroup.add(hpMesh);

  const hpBorder = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(width, depthSpan)),
    new THREE.LineBasicMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0.72 })
  );
  hpBorder.rotation.x = -Math.PI / 2;
  hpBorder.position.copy(hpMesh.position);
  hpGroup.add(hpBorder);

  const hpGridPts = [];
  for (let x = minX; x <= maxX; x += gridStep) {
    hpGridPts.push(x, 0, 0, x, 0, depthSpan);
  }
  for (let z = 0; z <= depthSpan; z += gridStep) {
    hpGridPts.push(minX, 0, z, maxX, 0, z);
  }
  const hpGridGeo = new THREE.BufferGeometry();
  hpGridGeo.setAttribute("position", new THREE.Float32BufferAttribute(hpGridPts, 3));
  hpGroup.add(
    new THREE.LineSegments(
      hpGridGeo,
      new THREE.LineBasicMaterial({ color: 0x1c1c1c, transparent: true, opacity: 0.48 })
    )
  );
  createSpriteLabel("HP (Horizontal Plane)", new THREE.Vector3(minX + 42, 1, depthSpan - 12), "#777777", [52, 9], hpGroup);

  // Glowing XY Reference Hinge Line
  const xyLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(minX - 10, xyLineY, 0.15),
      new THREE.Vector3(maxX + 10, xyLineY, 0.15)
    ]),
    new THREE.LineBasicMaterial({
      color: new THREE.Color().setRGB(1.45, 0.98, 0.34),
      toneMapped: false
    })
  );
  xyGroup.add(xyLine);
  createSpriteLabel("X", new THREE.Vector3(minX - 15, xyLineY, 2), "#f5b95d", [14, 7], xyGroup);
  createSpriteLabel("Y", new THREE.Vector3(maxX + 15, xyLineY, 2), "#f5b95d", [14, 7], xyGroup);
}
