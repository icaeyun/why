import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createCityBackdrop, setupBloom, setGroundWet, createFrontBackdrop, setWeatherBackdrop } from "./city-backdrop.js";
import { createExteriorRain } from "./rain-effect.js";
import { initAudio } from "./audio.js";

const VERSION = "20260528050000";
const STT_DINER_PATH = "./assets/models/sttdiner.glb?v=" + VERSION;
const DINER_PATH  = "./assets/models/diners.glb?v=" + VERSION;
const RABBID_PATH = "./assets/models/animations_rabbid.glb?v=" + VERSION;

// ?? Route presets ?????????????????????????????????????????????????
// frontEntry: approach from diner entrance ??walk in ??turn left ??booth tour
const FRONT_ENTRY = [
  { id: "OUT1", x:  1.58, y: -0.7071, z:  9.20, yaw:  0.01,  pitch:  0.00, fov: 59 },
  { id: "OUT2", x:  1.58, y: -0.7071, z:  6.40, yaw:  0.01,  pitch:  0.00, fov: 58 },
  { id: "OUT3", x:  1.54, y: -0.7071, z:  3.85, yaw:  0.03,  pitch:  0.01, fov: 57 },
  { id: "IN1",   x: 1.52, y: -0.7071, z:  1.72, yaw:  0.02,  pitch:  0.02, fov: 56 },
  { id: "LOOKUP", x: 1.50, y: -0.7071, z:  0.32, yaw:  0.03,  pitch: -0.10, fov: 55 },
  { id: "TURN1", x: 1.38, y: -0.7071, z: -0.72, yaw:  0.12,  pitch:  0.04, fov: 55 },
  { id: "TURN2", x: 1.02, y: -0.7071, z: -1.18, yaw:  0.40,  pitch:  0.08, fov: 53 },
  { id: "TURN3", x: 0.52, y: -0.7071, z: -1.34, yaw:  0.66,  pitch:  0.11, fov: 52 },
  { id: "A3",   x:  0.12, y: -0.7071, z: -1.30, yaw:  0.82,  pitch:  0.14, fov: 52 },
  { id: "P01", x:  0.1622, y: -0.7071, z: -1.7685, yaw:  1.552, pitch:  0.196, fov: 52 },
  { id: "P02", x: -3.5636, y: -0.7071, z: -2.0796, yaw:  0.104, pitch:  0.150, fov: 52 },
  { id: "P03", x: -3.5636, y: -0.7071, z: -2.0796, yaw: -0.672, pitch:  0.182, fov: 52 },
  { id: "P04", x: -3.5636, y: -0.7071, z: -2.0796, yaw: -1.412, pitch:  0.196, fov: 52 },
  { id: "P05", x: -3.5636, y: -0.7071, z: -2.0796, yaw: -2.132, pitch:  0.178, fov: 52 },
  { id: "P06", x: -3.5636, y: -0.7071, z: -2.0796, yaw: -1.120, pitch:  0.165, fov: 52 },
  { id: "P07", x: -2.3200, y: -0.7071, z: -1.9700, yaw: -1.080, pitch:  0.158, fov: 52 },
  { id: "P08", x: -1.0600, y: -0.7071, z: -1.8600, yaw: -1.060, pitch:  0.150, fov: 52 },
  { id: "P09", x:  0.0800, y: -0.7071, z: -1.7600, yaw: -1.050, pitch:  0.145, fov: 52 },
  { id: "P10", x:  0.5200, y: -0.7071, z: -1.7200, yaw: -1.050, pitch:  0.145, fov: 52 },
  { id: "P11", x:  0.5200, y: -0.7071, z: -1.7200, yaw: -1.620, pitch:  0.145, fov: 52 },
  { id: "P12", x:  0.5200, y: -0.7071, z: -1.7200, yaw: -2.180, pitch:  0.150, fov: 52 },
];

// backEntry: enter from back of building, walk through
const BACK_ENTRY = [
  { id: "P01", x: 0.2100, y: -0.5670, z: -0.7420, yaw: -4.340, pitch: -0.032, fov: 52 },
  { id: "P02", x: 0.7958, y: -0.0544, z: -5.3106, yaw: -3.118, pitch: -0.218, fov: 52 },
  { id: "P03", x: 0.9104, y: -0.0587, z: -9.9886, yaw: -3.108, pitch: -0.056, fov: 52 },
];

let activeRoute = FRONT_ENTRY;

for (const pt of [...FRONT_ENTRY, ...BACK_ENTRY]) {
  pt.y += 0.65;
}

// ?? Scroll state ??????????????????????????????????????????????????
let scrollTarget = 0;
let scrollSmooth = 0;
const SCROLL_PX    = 5500;
const SMOOTH_SPEED = 5.5;

let rainSystem  = { update() {}, setActive() {} };
let audioSystem = null;
let weatherMode = "rain";

let _interiorLights  = []; // [{ light, rain, sunny }]
let _dinerRoot       = null;
const _matOriginals  = new Map(); // uuid → saved sunny-state values

// ?? Scene ?????????????????????????????????????????????????????????
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07091a);

const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.002, 200);
camera.rotation.order = "YXZ";

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.60;
document.body.appendChild(renderer.domElement);

const composer = setupBloom(renderer, scene, camera);

const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

const hemLight = new THREE.HemisphereLight(0xffffff, 0x222222, 0.72);
scene.add(hemLight);
const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
keyLight.position.set(4, 7, 6);
scene.add(keyLight);
keyLight.intensity = 1.25;
const fillLight = new THREE.DirectionalLight(0xffdddd, 0.42);
fillLight.position.set(-5, 3, -4);
scene.add(fillLight);

const loader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.164.1/examples/jsm/libs/draco/");
loader.setDRACOLoader(dracoLoader);

let rabbidMixer = null;
let rabbidClips  = [];
let rabbidAction = null;
let rabbidPlayElapsed = 0;
const RABBID_PLAY_INTERVAL = 5 * 60;
const RABBID_MIXER_MAX_STEP = 1 / 30;

const clock = new THREE.Clock();

// ?? Scroll height ?????????????????????????????????????????????????
function applyScrollHeight() {
  document.documentElement.style.height = (window.innerHeight + SCROLL_PX) + "px";
}
applyScrollHeight();

window.addEventListener("scroll", () => {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  scrollTarget = max > 0 ? window.scrollY / max : 0;
});

// ?? Camera interpolation ??????????????????????????????????????????
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d >  Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(t)  { return t * t * (3 - 2 * t); }

function applyCameraFromProgress(p) {
  const route = activeRoute;
  const n = route.length - 1;
  if (n < 1) return;
  const raw  = Math.max(0, Math.min(1, p)) * n;
  const seg  = Math.min(Math.floor(raw), n - 1);
  const st   = smoothstep(raw - seg);
  const from = route[seg];
  const to   = route[seg + 1];
  camera.position.x = lerp(from.x, to.x, st);
  camera.position.y = lerp(from.y, to.y, st);
  camera.position.z = lerp(from.z, to.z, st);
  camera.rotation.x = lerp(from.pitch, to.pitch, st);
  camera.rotation.y = lerpAngle(from.yaw, to.yaw, st);
  camera.rotation.z = 0;
  camera.fov = lerp(from.fov, to.fov, st);
  if (camera.fov !== _lastFov) {
    camera.updateProjectionMatrix();
    _lastFov = camera.fov;
  }
}

// ?? UI: progress bar + waypoint dots + route buttons ?????????????
let progressFillEl = null;
let waypointEls    = [];
let hintEl         = null;
let hintFaded      = false;
let _lastSeg       = -1;
let _lastFillPct   = -1;
let _lastFov       = -1;

function buildProgressUI(route) {
  // Remove old elements
  const old = document.getElementById("progressTrack");
  if (old) old.remove();
  waypointEls  = [];
  _lastSeg     = -1;
  _lastFillPct = -1;

  const track = document.createElement("div");
  track.id = "progressTrack";

  const fill = document.createElement("div");
  fill.id = "progressFill";
  track.appendChild(fill);
  progressFillEl = fill;

  // Waypoint dots along the track
  route.forEach((pt, i) => {
    const dot = document.createElement("div");
    dot.className = "wp-dot";
    dot.style.top = (i / (route.length - 1) * 100) + "%";
    track.appendChild(dot);
    waypointEls.push(dot);
  });

  document.body.appendChild(track);
}

function updateProgressUI(p) {
  if (progressFillEl) {
    const pct = Math.round(p * 10000) / 100;
    if (Math.abs(pct - _lastFillPct) > 0.05) {
      progressFillEl.style.height = pct + "%";
      _lastFillPct = pct;
    }
  }

  const n = activeRoute.length - 1;
  const seg = Math.min(Math.floor(p * n), n);
  if (seg !== _lastSeg) {
    waypointEls.forEach((dot, i) => dot.classList.toggle("active", i <= seg));
    _lastSeg = seg;
  }

  if (!hintFaded && p > 0.02 && hintEl) {
    hintEl.style.opacity = "0";
    hintFaded = true;
  }
}

function createUI() {
  // Route buttons
  const ui = document.createElement("div");
  ui.id = "routeUI";
  ui.innerHTML = `
    <button id="btnFront" class="route-btn active">Entrance</button>
    <button id="btnBack"  class="route-btn">Rear</button>
  `;
  document.body.appendChild(ui);

  function switchRoute(route, activeId, inactiveId) {
    activeRoute  = route;
    scrollTarget = 0;
    scrollSmooth = 0;
    window.scrollTo({ top: 0, behavior: "instant" });
    document.getElementById(activeId).classList.add("active");
    document.getElementById(inactiveId).classList.remove("active");
    hintFaded = false;
    if (hintEl) hintEl.style.opacity = "1";
    applyCameraFromProgress(0);
    buildProgressUI(route);
  }

  document.getElementById("btnFront").onclick = () => switchRoute(FRONT_ENTRY, "btnFront", "btnBack");
  document.getElementById("btnBack").onclick  = () => switchRoute(BACK_ENTRY,  "btnBack",  "btnFront");

  // Scroll hint
  hintEl = document.getElementById("hint");

  // Initial progress track
  buildProgressUI(FRONT_ENTRY);
}

// ?? Model helpers ?????????????????????????????????????????????????
function setWeatherMode(mode) {
  weatherMode = mode;
  const isRain = mode === "rain";

  rainSystem.setActive(isRain);
  setGroundWet(isRain);
  setWeatherBackdrop(isRain);
  if (audioSystem) audioSystem.setMode(mode);

  // Material-level treatment (fixtures, signs, chrome, glass, floor)
  if (_dinerRoot) {
    if (isRain) _applyRainMaterials(_dinerRoot);
    else        _applySunnyMaterials(_dinerRoot);
  }

  hemLight.color.setHex(isRain ? 0xffeedd : 0xffffff);
  hemLight.groundColor.setHex(isRain ? 0x060304 : 0x222222);
  hemLight.intensity  = isRain ? 0.04 : 0.72;
  keyLight.intensity  = isRain ? 0.00 : 1.25;
  fillLight.intensity = isRain ? 0.00 : 0.42;
  renderer.toneMappingExposure = isRain ? 0.54 : 0.60;

  for (const { light, rain, sunny } of _interiorLights) {
    light.intensity = isRain ? rain : sunny;
  }
}

function prepareMaterials(root, opts = {}) {
  root.traverse(obj => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach(mat => {
      if (!mat) return;
      if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
      const materialName = ((mat.name || "") + " " + (obj.name || "")).toLowerCase();
      const isGlassLike = /glass|window|pane/.test(materialName);
      const isDoorLike = /door/.test(materialName);
      const isFixtureLight = /lights?|emissor|emissive|lamp|ceiling/.test(materialName);
      const isSignLight = /sign|sing_diner|neon/.test(materialName);
      if (opts.dimEmissive && "emissiveIntensity" in mat) {
        if (isFixtureLight) {
          mat.emissiveIntensity = 1.35;
        } else if (isSignLight) {
          mat.emissiveIntensity = 0.32;
        } else if (isGlassLike || isDoorLike) {
          mat.emissiveIntensity = 0.10;
        } else {
          mat.emissiveIntensity = Math.min(Math.max(mat.emissiveIntensity || 0, 0.08), 0.42);
        }
      }
      if (opts.dimEmissive && mat.emissive) {
        if (isFixtureLight) {
          mat.emissive.lerp(new THREE.Color(0xffd9a4), 0.65);
        } else if (isSignLight) {
          mat.emissive.multiplyScalar(0.50);
        } else if (isGlassLike || isDoorLike) {
          mat.emissive.multiplyScalar(0.14);
        } else {
          mat.emissive.multiplyScalar(0.48);
          mat.emissive.lerp(new THREE.Color(0xffc78a), 0.10);
        }
      }
      if (opts.makeGlassReadable && /glass|window|pane/.test(materialName)) {
        mat.transparent = true;
        mat.opacity = Math.min(mat.opacity ?? 1, 0.48);
        mat.depthWrite = false;
        mat.roughness = Math.max(mat.roughness ?? 0, 0.58);
        mat.metalness = 0;
      } else {
        mat.transparent = false;
        mat.depthWrite = true;
      }

      mat.needsUpdate = true;
    });
  });
}

function centerModel(model) {
  const box = new THREE.Box3().setFromObject(model);
  const c = box.getCenter(new THREE.Vector3());
  model.position.x -= c.x;
  model.position.y -= c.y;
  model.position.z -= c.z;
}

function loadGltf(path, label) {
  return new Promise((resolve, reject) => {
    loader.load(path, resolve, undefined, err =>
      reject(new Error(label + " load failed: " + String(err.message || err)))
    );
  });
}

function loadFirstGltf(paths, label) {
  return paths.reduce(
    (chain, path) => chain.catch(() => loadGltf(path, label)),
    Promise.reject(new Error(label + " fallback chain start"))
  );
}

const loadingEl = document.getElementById("loading");
function showLoading(msg) { if (loadingEl) loadingEl.innerHTML = msg; }

// ?? Rabbid: play once every 5 minutes ????????????????????????????
function playRabbidOnce() {
  if (!rabbidAction) return;
  rabbidAction.enabled = true;
  rabbidAction.paused = false;
  rabbidAction.reset().play();
}

function loadRabbid() {
  loadGltf(RABBID_PATH, "rabbid")
    .then(gltf => {
      const rabbid = gltf.scene;
      prepareMaterials(rabbid);
      rabbid.position.set(0.0501, -0.4850, 0.5041);
      rabbid.scale.setScalar(0.038);
      rabbid.rotation.y = -4.676 + Math.PI;
      scene.add(rabbid);
      addRabbidSoftLight(rabbid.position);
      if (gltf.animations && gltf.animations.length) {
        rabbidMixer = new THREE.AnimationMixer(rabbid);
        rabbidClips  = gltf.animations;
        rabbidAction = rabbidMixer.clipAction(rabbidClips[0]);
        rabbidAction.setLoop(THREE.LoopOnce, 1);
        rabbidAction.clampWhenFinished = false;
        rabbidAction.enabled = true;
        rabbidMixer.addEventListener("finished", event => {
          if (event.action === rabbidAction) rabbidAction.enabled = false;
        });
      }
    })
    .catch(err => console.error("Rabbid:", err));
}

function addRabbidSoftLight(pos) {
  const underFace = new THREE.PointLight(0xffdfbd, 0.88, 2.0);
  underFace.position.set(pos.x + 0.06, pos.y + 0.16, pos.z + 0.34);
  scene.add(underFace);

  const softFill = new THREE.PointLight(0xffffff, 0.28, 1.7);
  softFill.position.set(pos.x - 0.18, pos.y + 0.32, pos.z + 0.50);
  scene.add(softFill);

  const rim = new THREE.PointLight(0xb8ccff, 0.22, 2.1);
  rim.position.set(pos.x + 0.55, pos.y + 0.85, pos.z - 0.45);
  scene.add(rim);
}

function _addInteriorLight(color, x, y, z, distance, rain, sunny) {
  const light = new THREE.PointLight(color, sunny, distance);
  light.position.set(x, y, z);
  scene.add(light);
  _interiorLights.push({ light, rain, sunny });
}

function addDinerInteriorGlow() {
  _interiorLights = [];

  // Main ceiling — warm tungsten overhead (primary light source)
  _addInteriorLight(0xFFD7A0,  0.0, 2.4, -0.6, 7.0, 0.62, 0.18);
  _addInteriorLight(0xFFD7A0,  0.0, 2.4, -2.2, 7.0, 0.58, 0.15);
  _addInteriorLight(0xFFD7A0,  0.0, 2.4, -3.6, 6.5, 0.50, 0.12);

  // Neon sign spill — cherry red, subtle
  _addInteriorLight(0xFF3040,  0.4, 2.2,  0.9, 6.0, 0.20, 0.00);

  // Rainy window reflection — muted steel blue, not electric
  _addInteriorLight(0x4A7FA8,  3.3, 1.5, -0.3, 8.0, 0.16, 0.00);
  _addInteriorLight(0x4A7FA8,  3.3, 1.5, -1.9, 8.0, 0.14, 0.00);

  // Under-counter warm strip
  _addInteriorLight(0xFFB86B,  0.3, 0.7, -0.9, 5.0, 0.34, 0.20);
  _addInteriorLight(0xFFB86B,  0.3, 0.7, -2.3, 5.0, 0.30, 0.16);

  // Left wall seam — magenta/purple accent (low)
  _addInteriorLight(0xC400E8, -3.4, 1.95,  0.1, 5.5, 0.22, 0.00);
  _addInteriorLight(0x451070, -3.4, 1.95, -1.5, 5.5, 0.18, 0.00);
  _addInteriorLight(0xC400E8, -3.4, 1.95, -3.0, 5.5, 0.20, 0.00);

  // Right wall seam — purple/magenta accent (low)
  _addInteriorLight(0x451070,  3.4, 1.95,  0.1, 5.5, 0.18, 0.00);
  _addInteriorLight(0xC400E8,  3.4, 1.95, -1.5, 5.5, 0.22, 0.00);
  _addInteriorLight(0x451070,  3.4, 1.95, -3.0, 5.5, 0.18, 0.00);

  // Counter edge — very subtle magenta underfill
  _addInteriorLight(0xC400E8,  0.3, 0.55, -0.8, 4.5, 0.18, 0.00);
  _addInteriorLight(0x451070,  0.3, 0.55, -2.0, 4.5, 0.15, 0.00);
}

// ── Rain material system ───────────────────────────────────────────────────
function _saveMaterialOriginals(root) {
  root.traverse(obj => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach(mat => {
      if (!mat || _matOriginals.has(mat.uuid)) return;
      _matOriginals.set(mat.uuid, {
        emissiveIntensity:  mat.emissiveIntensity ?? 0,
        emissive:           mat.emissive  ? mat.emissive.clone()  : null,
        roughness:          mat.roughness ?? 1,
        metalness:          mat.metalness ?? 0,
        color:              mat.color     ? mat.color.clone()     : null,
        envMapIntensity:    mat.envMapIntensity ?? 1,
        map:                mat.map       ?? null,
      });
    });
  });
}

function _applyRainMaterials(root) {
  root.traverse(obj => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach(mat => {
      if (!mat) return;
      const orig = _matOriginals.get(mat.uuid);
      if (!orig) return;
      const n = ((mat.name || '') + ' ' + (obj.name || '')).toLowerCase();

      // Toilet sign — always restore original, never tint
      if (/toilet/.test(n)) {
        mat.emissiveIntensity = orig.emissiveIntensity;
        if (orig.emissive && mat.emissive) mat.emissive.copy(orig.emissive);
        mat.roughness = orig.roughness;
        mat.metalness = orig.metalness;
        mat.needsUpdate = true;
        return;
      }

      // Armchair/booth seating — cherry red vinyl, rain only
      if (/armchair/.test(n)) {
        if (mat.color) mat.color.setHex(0xD14A43);
        mat.roughness = 0.40;
        mat.metalness = 0;
        mat.emissiveIntensity = 0;
        if (mat.emissive) mat.emissive.set(0, 0, 0);
        mat.needsUpdate = true;
        return;
      }

      // ── Actual ceiling mesh — emissive red glow panel, rain only ──
      const _isCeil = (() => {
        if (/sign|sing|emissor|emissive|neon|menu|letter|logo|billboard|light|glass|window|door|metal|chrome|exterior|outside|stool|chair|booth|floor|tile|counter|railing|trim|frame/.test(n)) return false;
        const box = new THREE.Box3().setFromObject(obj);
        const sz  = new THREE.Vector3(); box.getSize(sz);
        const ct  = new THREE.Vector3(); box.getCenter(ct);
        return ct.y > 1.2 && sz.y < 0.5 && sz.x > 1.5 && sz.z > 1.5
            && sz.y < sz.x * 0.4 && sz.y < sz.z * 0.4;
      })();
      if (_isCeil) {
        mat.map   = null;
        mat.aoMap = null;
        obj.receiveShadow = false;
        if (mat.color)    mat.color.setHex(0xE7B9B2);
        if (mat.emissive) mat.emissive.setHex(0xB84A42);
        mat.emissiveIntensity = 0.45;
        mat.roughness = 0.90;
        mat.metalness = 0;
        mat.needsUpdate = true;
        return;
      }

      const isFixture = /light|lamp|bulb|fixture|emissor|fluor|tube/.test(n)
                     || orig.emissiveIntensity >= 1.0;
      const isSign    = /\bneon\b|sing_/.test(n);
      const isGlass   = /glass|window|pane/.test(n)
                     || (mat.transparent && (mat.opacity ?? 1) < 0.7);
      const isChrome  = /chrome|metal|steel|stainless|aluminum|trim|edge/.test(n)
                     || (orig.metalness > 0.45 && orig.roughness < 0.40);
      const isFloor   = /floor|tile|linoleum/.test(n) && !/wood|chair|table|booth|seat|cabinet|wall|ceil/.test(n);
      const isCounter = /counter|tabletop|diner_top|bar_top/.test(n);

      if (isFixture) {
        // Tube fluorescents (Lights / Lights_01) → warm cherry red glow
        // Pendant emissor (Emissor, Emissor.001 …) → keeps cyan blue
        const isRedTube = /^lights(_01)?$/i.test(mat.name || '');
        mat.emissiveIntensity = isRedTube ? 4.5 : 6.0;
        if (mat.emissive) mat.emissive.setHex(isRedTube ? 0xFF3838 : 0x00C8FF);
      } else if (isSign) {
        // Cherry red neon accent only
        mat.emissiveIntensity = Math.min(orig.emissiveIntensity * 1.3, 1.1);
        if (mat.emissive) mat.emissive.setHex(0xFF2A3D);
      } else if (isGlass) {
        mat.roughness = 0.06;
        mat.metalness = 0.10;
        mat.emissiveIntensity = 0.02;
        if (mat.emissive) mat.emissive.setHex(0x02060c);
      } else if (isChrome) {
        mat.roughness = Math.min(orig.roughness, 0.04);
        mat.metalness = Math.max(orig.metalness, 0.94);
        mat.envMapIntensity = 2.8;
        mat.emissiveIntensity = 0;
      } else if (isFloor) {
        // Tint via color multiply — texture stays visible, just slightly cooler+darker
        if (orig.color && mat.color) {
          mat.color.copy(orig.color).multiplyScalar(0.72).lerp(new THREE.Color(0x8898AA), 0.18);
        }
        mat.roughness = Math.min(orig.roughness, 0.38);
        mat.metalness = Math.max(orig.metalness, 0.04);
        mat.envMapIntensity = (orig.envMapIntensity ?? 1) * 1.4;
        if (mat.emissive) mat.emissive.setHex(0x050810);
        mat.emissiveIntensity = 0.0;
      } else if (isCounter) {
        mat.roughness = Math.min(orig.roughness, 0.22);
        mat.metalness = Math.max(orig.metalness, 0.12);
      } else {
        // Walls, ceiling, booths — stay near original warm cream tones, just slightly dimmed
        mat.emissiveIntensity = orig.emissiveIntensity * 0.55;
        if (orig.emissive && mat.emissive) mat.emissive.copy(orig.emissive);
      }

      mat.needsUpdate = true;
    });
  });
}

function _applySunnyMaterials(root) {
  root.traverse(obj => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach(mat => {
      if (!mat) return;
      const orig = _matOriginals.get(mat.uuid);
      if (!orig) return;
      mat.emissiveIntensity = orig.emissiveIntensity;
      if (orig.emissive && mat.emissive) mat.emissive.copy(orig.emissive);
      if (orig.color && mat.color) mat.color.copy(orig.color);
      mat.roughness = orig.roughness;
      mat.metalness = orig.metalness;
      mat.envMapIntensity = orig.envMapIntensity ?? 1;
      mat.map = orig.map ?? null;
      mat.needsUpdate = true;
    });
  });
}


function loadDiner() {
  showLoading("Loading...");
  loadFirstGltf([STT_DINER_PATH, DINER_PATH], "diner")
    .then(gltf => {
      const diner = gltf.scene;
      prepareMaterials(diner, { dimEmissive: true, makeGlassReadable: true });
      centerModel(diner);
      diner.position.z += 11.1;
      scene.add(diner);
      diner.updateMatrixWorld(true);


      _dinerRoot = diner;
      _saveMaterialOriginals(diner); // snapshot after prepareMaterials = sunny baseline
      addDinerInteriorGlow();
      setWeatherMode(weatherMode);
      createCityBackdrop(scene);
      createFrontBackdrop(scene);
      setGroundWet(weatherMode === "rain");
      rainSystem = createExteriorRain(scene, camera);
      rainSystem.setActive(weatherMode === "rain");
      applyCameraFromProgress(0);
      if (loadingEl) loadingEl.style.display = "none";
      loadRabbid();
    })
    .catch(err => showLoading("LOAD FAILED<br>" + String(err.message || err)));
}

// ?? Resize ????????????????????????????????????????????????????????
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  composer.setSize(window.innerWidth, window.innerHeight);
  applyScrollHeight();
});

// ?? Render loop ???????????????????????????????????????????????????
function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  scrollSmooth += (scrollTarget - scrollSmooth) * Math.min(delta * SMOOTH_SPEED, 1);
  applyCameraFromProgress(scrollSmooth);
  updateProgressUI(scrollSmooth);
  rainSystem.update(delta);
  if (rabbidMixer) {
    rabbidMixer.update(Math.min(delta, RABBID_MIXER_MAX_STEP));
    rabbidPlayElapsed += delta;
    if (rabbidPlayElapsed >= RABBID_PLAY_INTERVAL && (!rabbidAction || !rabbidAction.isRunning())) {
      rabbidPlayElapsed = 0;
      playRabbidOnce();
    }
  }
  composer.render();
}

createUI();
audioSystem = initAudio(setWeatherMode);
loadDiner();
animate();




