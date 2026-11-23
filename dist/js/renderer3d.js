import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
export function createRenderer(host) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  host.append(renderer.domElement);
  const scene = new THREE.Scene(),
    camera = new THREE.OrthographicCamera(-150, 150, 150, -150, 0.1, 4000),
    controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minZoom = 0.25;
  controls.maxZoom = 8;
  const group = new THREE.Group();
  scene.add(group);
  scene.add(new THREE.HemisphereLight(0xb3faff, 0x172c43, 2));
  const light = new THREE.DirectionalLight(0xffffff, 3);
  light.position.set(100, 250, 200);
  scene.add(light);
  let extent = 150,
    center = new THREE.Vector3(0, 45, 45),
    preset = "iso",
    dirty = true,
    disposed = false;
  function label(value, position, color = "#8aafc0") {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const c = canvas.getContext("2d");
    c.font = "28px Segoe UI";
    c.fillStyle = color;
    c.textAlign = "center";
    c.fillText(value, 128, 43);
    const texture = new THREE.CanvasTexture(canvas),
      sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          depthTest: false,
        }),
      );
    sprite.scale.set(45, 11, 1);
    sprite.position.copy(position);
    group.add(sprite);
  }
  function disposeGroup() {
    for (const o of [...group.children]) {
      group.remove(o);
      o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        m?.map?.dispose();
        m?.dispose();
      }
    }
  }
  function update(model) {
    disposeGroup();
    const verts = [];
    for (const f of model.faces)
      for (let i = 1; i < f.ids.length - 1; i++)
        for (const id of [f.ids[0], f.ids[i], f.ids[i + 1]])
          verts.push(...model.vertices[id]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(verts, 3),
    );
    geometry.computeVertexNormals();
    group.add(
      new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: 0x127f8e,
          metalness: 0.25,
          roughness: 0.42,
          transparent: true,
          opacity: 0.88,
          side: THREE.DoubleSide,
        }),
      ),
    );
    const eg = new THREE.EdgesGeometry(geometry, model.curved ? 20 : 1);
    group.add(
      new THREE.LineSegments(
        eg,
        new THREE.LineBasicMaterial({ color: 0x4cf9ff }),
      ),
    );
    const box = new THREE.Box3().setFromPoints(
      model.vertices.map((p) => new THREE.Vector3(...p)),
    );
    box.getCenter(center);
    const size = box.getSize(new THREE.Vector3());
    extent = Math.max(100, size.x, size.y, size.z, box.max.y, box.max.z) * 1.18;
    const planeMaterial = new THREE.MeshBasicMaterial({
      color: 0x287f9b,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const hp = new THREE.Mesh(
      new THREE.PlaneGeometry(extent * 2, extent),
      planeMaterial,
    );
    hp.rotation.x = -Math.PI / 2;
    hp.position.z = extent / 2;
    group.add(hp);
    const vp = new THREE.Mesh(
      new THREE.PlaneGeometry(extent * 2, extent),
      planeMaterial.clone(),
    );
    vp.position.y = extent / 2;
    group.add(vp);
    const points = [];
    for (let x = -extent; x <= extent; x += 20) {
      points.push(x, 0, 0, x, 0, extent, x, 0, 0, x, extent, 0);
    }
    for (let z = 0; z <= extent; z += 20) {
      points.push(-extent, 0, z, extent, 0, z, -extent, z, 0, extent, z, 0);
    }
    const grid = new THREE.BufferGeometry();
    grid.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    group.add(
      new THREE.LineSegments(
        grid,
        new THREE.LineBasicMaterial({
          color: 0x264250,
          transparent: true,
          opacity: 0.5,
        }),
      ),
    );
    const xy = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-extent, 0, 0),
      new THREE.Vector3(extent, 0, 0),
    ]);
    group.add(
      new THREE.Line(xy, new THREE.LineBasicMaterial({ color: 0xf5b95d })),
    );
    const axis = new THREE.BufferGeometry().setFromPoints(
      model.axis.map((p) => new THREE.Vector3(...p)),
    );
    const al = new THREE.Line(
      axis,
      new THREE.LineDashedMaterial({
        color: 0xf5b95d,
        dashSize: 6,
        gapSize: 3,
        depthTest: false,
      }),
    );
    al.computeLineDistances();
    group.add(al);
    label("HP", new THREE.Vector3(extent * 0.8, 0, extent * 0.8));
    label("VP", new THREE.Vector3(-extent * 0.7, extent * 0.8, 0));
    label("X", new THREE.Vector3(-extent - 5, 0, 0), "#f5b95d");
    label("Y", new THREE.Vector3(extent + 5, 0, 0), "#f5b95d");
    dirty = true;
    resize();
  }
  function resize() {
    const w = host.clientWidth,
      h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.left = (-extent * w) / h;
    camera.right = (extent * w) / h;
    camera.top = extent;
    camera.bottom = -extent;
    camera.updateProjectionMatrix();
    dirty = true;
  }
  function view(name = "iso") {
    preset = name;
    controls.target.copy(center);
    const directions = {
      iso: [1, 1, 1],
      front: [0, 0, 1],
      top: [0, 1, 0.00001],
      side: [1, 0, 0],
    };
    camera.position
      .copy(center)
      .add(new THREE.Vector3(...directions[name]).multiplyScalar(500));
    camera.up.set(0, 1, 0);
    camera.zoom = 1;
    controls.update();
    resize();
    dirty = true;
  }
  controls.addEventListener("change", () => (dirty = true));
  const observer = new ResizeObserver(resize);
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
  frame();
  return {
    update,
    view,
    resize,
    dispose() {
      disposed = true;
      observer.disconnect();
      controls.dispose();
      disposeGroup();
      renderer.dispose();
    },
    get preset() {
      return preset;
    },
  };
}
