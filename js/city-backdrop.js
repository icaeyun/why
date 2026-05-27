import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

const SYNTH_TEX = "./references/synthcity/assets/textures/";
const TL = new THREE.TextureLoader();

let _gndMesh   = null;
let _scene     = null;
let _nightGroup = null;
let _frontGroup = null;

export function setGroundWet(wet) {
  if (!_gndMesh) return;
  const m = _gndMesh.material;
  m.roughness = wet ? 0.06 : 0.98;
  m.metalness = wet ? 0.28 : 0;
  m.needsUpdate = true;
}

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
  _scene = scene;
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
  _gndMesh = gnd;

  _nightGroup = new THREE.Group();
  _nightGroup.name = "nightGroup";

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
    _nightGroup.add(mesh);
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
  _nightGroup.add(
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

  scene.add(_nightGroup);
}

// ── Front city backdrop ────────────────────────────────────────────────────
const FB_FLOOR_Y    = -1.35;
const FB_NEAR_Z     = 24;
const FB_MID_Z      = 42;
const FB_FAR_Z      = 62;
const FB_COUNT_NEAR = 8;   // spawned per side (left/right of approach corridor)
const FB_COUNT_MID  = 11;
const FB_COUNT_FAR  = 7;
const FB_COUNT_SIDE = 7;   // per side window wall
const FB_DEBUG      = false;

function _fbRnd(a, b) { return a + Math.random() * (b - a); }
function _fbRi(a, b)  { return Math.floor(_fbRnd(a, b + 0.99)); }

function _winTex(cols, rows, dens) {
  const S = 512;
  const cv = document.createElement("canvas");
  cv.width = S; cv.height = S;
  const ctx = cv.getContext("2d");
  // transparent background — black pixels contribute nothing in AdditiveBlending
  ctx.clearRect(0, 0, S, S);
  const cw = S / cols, rh = S / rows;
  const pw = cw * 0.58, ph = rh * 0.52;   // window size within cell
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (Math.random() > dens) continue;
      const warm = Math.random() < 0.72;
      // warm: bright amber-white  |  cool: blue-white
      ctx.fillStyle = warm
        ? `rgba(255,${_fbRi(200, 240)},${_fbRi(100, 160)},1.0)`
        : `rgba(${_fbRi(160, 200)},${_fbRi(200, 230)},255,0.90)`;
      ctx.fillRect(col * cw + (cw - pw) * 0.5, row * rh + (rh - ph) * 0.5, pw, ph);
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;   // crisp pixel edges, no blur
  return t;
}

export function createFrontBackdrop(scene) {
  const group = new THREE.Group();
  group.name  = "frontBackdropGroup";

  const r   = _fbRnd;
  const gBx = new THREE.BoxGeometry(1, 1, 1);

  const matN = new THREE.MeshBasicMaterial({ color: 0x1c2535 });
  const matM = new THREE.MeshBasicMaterial({ color: 0x111a26 });
  const matF = new THREE.MeshBasicMaterial({ color: 0x080c16 });

  function bld(mat, x, z, w, h, d, face) {
    const mesh = new THREE.Mesh(gBx, mat);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, FB_FLOOR_Y + h * 0.5, z);
    group.add(mesh);

    // window facade plane
    const cols = Math.max(5, Math.floor(w * 2.2));
    const rows = Math.max(5, Math.floor(h * 1.6));
    const tex  = _winTex(cols, rows, r(0.30, 0.55));
    const wm   = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: 1.0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const wp = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), wm);
    wp.frustumCulled = false;
    if (face === "front") {
      wp.scale.set(w * 0.92, h * 0.90, 1);
      wp.position.set(x, FB_FLOOR_Y + h * 0.5 + 0.1, z - d * 0.5 - 0.03);
      wp.rotation.y = Math.PI;
    } else if (face === "lside") {
      wp.scale.set(d * 0.92, h * 0.90, 1);
      wp.position.set(x + w * 0.5 + 0.03, FB_FLOOR_Y + h * 0.5 + 0.1, z);
      wp.rotation.y = -Math.PI / 2;
    } else {
      wp.scale.set(d * 0.92, h * 0.90, 1);
      wp.position.set(x - w * 0.5 - 0.03, FB_FLOOR_Y + h * 0.5 + 0.1, z);
      wp.rotation.y = Math.PI / 2;
    }
    group.add(wp);
  }

  // near: low storefronts / parking garage, split left+right of approach corridor
  for (let i = 0; i < FB_COUNT_NEAR; i++) {
    const z = r(FB_NEAR_Z - 4, FB_NEAR_Z + 6);
    const w = r(5, 12), h = r(4, 8), d = r(4, 7);
    bld(matN, r(-44, -10), z, w, h, d, "front");
    bld(matN, r( 12,  44), z, w, h, d, "front");
  }

  // mid: office / apartment blocks
  for (let i = 0; i < FB_COUNT_MID; i++) {
    bld(matM, r(-48, 48), r(FB_MID_Z - 7, FB_MID_Z + 8),
        r(5, 14), r(8, 20), r(4, 8), "front");
  }

  // far: skyline silhouette
  for (let i = 0; i < FB_COUNT_FAR; i++) {
    bld(matF, r(-52, 52), r(FB_FAR_Z - 10, FB_FAR_Z + 14),
        r(7, 18), r(16, 32), r(5, 10), "front");
  }

  // left side: visible through diner left windows
  for (let i = 0; i < FB_COUNT_SIDE; i++) {
    bld(matN, r(-15, -34), r(-12, 12), r(4, 10), r(5, 15), r(4, 9), "lside");
  }

  // right side: visible through diner right windows
  for (let i = 0; i < FB_COUNT_SIDE; i++) {
    bld(matN, r( 14,  34), r(-12, 12), r(4, 10), r(5, 15), r(4, 9), "rside");
  }

  _frontGroup = group;
  scene.add(group);
  return group;
}

export function setWeatherBackdrop(isRain) {
  if (!_scene) return;
  if (isRain) {
    _scene.background.set(0x07091a);
    if (_scene.fog) { _scene.fog.color.set(0x07091a); _scene.fog.near = 20; _scene.fog.far = 85; }
    if (_nightGroup) _nightGroup.visible = true;
    if (_frontGroup) _frontGroup.visible = true;
  } else {
    _scene.background.set(0x7ab0d4);
    if (_scene.fog) { _scene.fog.color.set(0x8ec5dc); _scene.fog.near = 18; _scene.fog.far = 130; }
    if (_nightGroup) _nightGroup.visible = false;
    if (_frontGroup) _frontGroup.visible = false;
  }
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
