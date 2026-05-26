import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

const SYNTH_TEX = "./references/synthcity/assets/textures/";
const TL = new THREE.TextureLoader();

function loadTex(file, wrap) {
  const t = TL.load(SYNTH_TEX + file);
  t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function rnd(a, b) {
  return a + Math.random() * (b - a);
}

export function createCityBackdrop(scene) {
  scene.background = new THREE.Color(0x07091a);
  scene.fog = new THREE.Fog(0x07091a, 20, 85);

  const FLOOR_Y = -1.35;

  const gMap = loadTex("ground.jpg", true);
  gMap.repeat.set(32, 32);
  const gEm = loadTex("ground_em.jpg", true);
  gEm.repeat.set(32, 32);

  const gnd = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 260),
    new THREE.MeshStandardMaterial({
      map: gMap,
      emissiveMap: gEm,
      color: new THREE.Color(0x020204),
      emissive: new THREE.Color(0x0044aa),
      emissiveIntensity: 0.38,
      roughness: 0.98,
      metalness: 0,
      envMapIntensity: 0,
    })
  );
  gnd.rotation.x = -Math.PI / 2;
  gnd.position.y = FLOOR_Y;
  scene.add(gnd);

  function band(col, op, w, h, y, z) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: op,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    mesh.position.set(0, y, z);
    scene.add(mesh);
  }

  band(0x0d1e50, 0.38, 300, 32, 7, -35);
  band(0x070f28, 0.24, 260, 18, 3, -28);
  band(0x040918, 0.16, 220, 48, 0, -20);

  const sPts = [];
  for (let i = 0; i < 700; i++) {
    const th = rnd(0, Math.PI * 2);
    const ph = rnd(0.04, Math.PI * 0.44);
    const r = rnd(70, 130);
    sPts.push(Math.sin(ph) * Math.cos(th) * r, Math.cos(ph) * r, Math.sin(ph) * Math.sin(th) * r);
  }

  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.Float32BufferAttribute(sPts, 3));
  scene.add(
    new THREE.Points(
      sg,
      new THREE.PointsMaterial({
        color: 0x9aaad0,
        size: 0.18,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.60,
      })
    )
  );
}

export function setupBloom(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.42,
    0.30,
    0.90
  );
  composer.addPass(bloom);
  return composer;
}
