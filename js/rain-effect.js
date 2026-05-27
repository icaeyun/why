import * as THREE from "three";

// ── Tunable constants ──────────────────────────────────────────────────────
const RAIN_ENABLED       = true;
const RAIN_DEBUG_HELPER  = false;

const RAIN_COUNT_DESKTOP = 1200;
const RAIN_COUNT_MOBILE  = 500;

const RAIN_HEIGHT        = 9.0;
const FLOOR_Y            = -1.35;
const DINER_CEILING_Y    = 3.2;   // approximate interior ceiling

const RAIN_SPEED         = 7.5;
const RAIN_SLANT         = 0.35;
const RAIN_OPACITY       = 0.50;
const DROP_LEN           = 0.40;

// ── Rain zones ─────────────────────────────────────────────────────────────
// cx/cz = center, hw/hd = half extents (full extent = hw*2, hd*2)
// w     = relative weight for zone selection
// isRoof= spawn above ceiling only; respawn before penetrating interior
// isFar = rendered as Points (distance mist, not streaks)
const RAIN_ZONES = [
  // 정면: z 4→12 (접근할 때 보임, 내부 진입 후 footprint exclusion으로 차단)
  { id:"front",   cx:  1.0, cz:  8.0,  hw:  7.0, hd:  6.0,  w:0.38, isRoof:false, isFar:false },
  // 좌측 창 바깥: x -14.5→-7.5
  { id:"left",    cx:-11.0, cz: -1.0,  hw:  3.5, hd:  8.0,  w:0.17, isRoof:false, isFar:false },
  // 우측 창 바깥: x 9→13
  { id:"right",   cx: 11.0, cz: -1.0,  hw:  2.0, hd:  8.0,  w:0.17, isRoof:false, isFar:false },
  // 지붕 위 (천장 위에서만 spawn)
  { id:"roof",    cx:  0.0, cz: -3.0,  hw: 11.0, hd: 11.0,  w:0.08, isRoof:true,  isFar:false },
  // 원경 안개
  { id:"farMist", cx:  0.0, cz: 20.0,  hw: 16.0, hd:  6.0,  w:0.20, isRoof:false, isFar:true  },
];

const NEAR_ZONES  = RAIN_ZONES.filter(z => !z.isFar);
const FAR_ZONES   = RAIN_ZONES.filter(z =>  z.isFar);
const NEAR_TOTAL  = NEAR_ZONES.reduce((s, z) => s + z.w, 0);
const FAR_TOTAL   = FAR_ZONES.reduce((s,  z) => s + z.w, 0);

// ── Interior / Rabbid exclusion ────────────────────────────────────────────
const INT_MIN_X = -7.5, INT_MAX_X = 9.0;
const INT_MIN_Z = -13.0, INT_MAX_Z = 4.0;

function inFootprint(x, z) {
  return x >= INT_MIN_X && x <= INT_MAX_X &&
         z >= INT_MIN_Z && z <= INT_MAX_Z;
}

function isInterior(x, y, z) {
  return inFootprint(x, z) && y < DINER_CEILING_Y;
}

const RABBID_X = 0.0501, RABBID_Z = 0.5041, RABBID_R2 = 0.36;

function isExcluded(x, y, z) {
  if (isInterior(x, y, z)) return true;
  const dx = x - RABBID_X, dz = z - RABBID_Z;
  return (dx * dx + dz * dz) < RABBID_R2;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function rnd(a, b) { return a + Math.random() * (b - a); }

function pickZone(zones, total) {
  const r = Math.random() * total;
  let cum = 0;
  for (const z of zones) {
    cum += z.w;
    if (r <= cum) return z;
  }
  return zones[zones.length - 1];
}

function spawnInZone(zone) {
  let x, y, z, tries = 0;
  do {
    x = zone.cx + rnd(-zone.hw, zone.hw);
    z = zone.cz + rnd(-zone.hd, zone.hd);
    y = zone.isRoof
      ? DINER_CEILING_Y + DROP_LEN + rnd(0.1, 5.0)
      : rnd(FLOOR_Y, FLOOR_Y + RAIN_HEIGHT);
    tries++;
  } while (isExcluded(x, y - DROP_LEN, z) && tries < 15);
  return { x, y, z };
}

function spawnNear() { return spawnInZone(pickZone(NEAR_ZONES, NEAR_TOTAL)); }
function spawnFar()  { return spawnInZone(pickZone(FAR_ZONES,  FAR_TOTAL));  }

// ── Splash spawn ───────────────────────────────────────────────────────────
const SPLASH_ZONES = [
  { cx:  1.0, cz:  8.0, hw: 7.0, hd: 6.0 },
  { cx:-11.0, cz: -1.0, hw: 3.5, hd: 8.0 },
  { cx:  8.0, cz: -1.0, hw: 2.0, hd: 8.0 },
];

function spawnSplash() {
  const zone = SPLASH_ZONES[Math.floor(Math.random() * SPLASH_ZONES.length)];
  let x, z, tries = 0;
  do {
    x = zone.cx + rnd(-zone.hw, zone.hw);
    z = zone.cz + rnd(-zone.hd, zone.hd);
    tries++;
  } while (inFootprint(x, z) && tries < 10);
  return { x, z };
}

// ── createExteriorRain ─────────────────────────────────────────────────────
export function createExteriorRain(scene, _camera, opts) {
  if (!RAIN_ENABLED) return { update() {}, setActive() {} };

  const isMobile = typeof navigator !== "undefined" &&
    /Android|iPhone|iPad/i.test(navigator.userAgent);
  const total   = (opts && opts.count) ? opts.count
                : (isMobile ? RAIN_COUNT_MOBILE : RAIN_COUNT_DESKTOP);

  const nearN   = Math.floor(total * 0.80);
  const farN    = total - nearN;
  const splashN = 80;
  const gndLine = FLOOR_Y + 0.05;

  const group  = new THREE.Group();
  group.name   = "exteriorRainGroup";

  // ── Near streaks (LineSegments) ──────────────────────────────────────────
  // Each drop = 2 vertices (top + bot): 6 floats per drop
  const nBuf = new Float32Array(nearN * 6);
  for (let i = 0; i < nearN; i++) {
    const { x, y, z } = spawnNear();
    const b = i * 6;
    nBuf[b]   = x;                       nBuf[b+1] = y;           nBuf[b+2] = z;
    nBuf[b+3] = x - DROP_LEN * RAIN_SLANT; nBuf[b+4] = y - DROP_LEN; nBuf[b+5] = z;
  }

  const nGeo  = new THREE.BufferGeometry();
  nGeo.setAttribute("position", new THREE.BufferAttribute(nBuf, 3));

  const nMat  = new THREE.LineBasicMaterial({
    color: 0xc0d8ff,
    transparent: true,
    opacity: RAIN_OPACITY,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const nMesh = new THREE.LineSegments(nGeo, nMat);
  nMesh.frustumCulled = false;
  group.add(nMesh);

  // ── Far mist (Points) ────────────────────────────────────────────────────
  const fBuf = new Float32Array(farN * 3);
  for (let i = 0; i < farN; i++) {
    const { x, y, z } = spawnFar();
    const b = i * 3;
    fBuf[b] = x; fBuf[b+1] = y; fBuf[b+2] = z;
  }

  const fGeo  = new THREE.BufferGeometry();
  fGeo.setAttribute("position", new THREE.BufferAttribute(fBuf, 3));

  const fMat  = new THREE.PointsMaterial({
    color: 0x88aacc,
    size: 0.06,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const fMesh = new THREE.Points(fGeo, fMat);
  fMesh.frustumCulled = false;
  group.add(fMesh);

  // ── Splash (exterior ground shimmer) ────────────────────────────────────
  const spBuf = new Float32Array(splashN * 3);
  for (let i = 0; i < splashN; i++) {
    const { x, z } = spawnSplash();
    spBuf[i*3] = x; spBuf[i*3+1] = FLOOR_Y + 0.01; spBuf[i*3+2] = z;
  }

  const spGeo  = new THREE.BufferGeometry();
  spGeo.setAttribute("position", new THREE.BufferAttribute(spBuf, 3));

  const spMat  = new THREE.PointsMaterial({
    color: 0xaaccff,
    size: 0.05,
    transparent: true,
    opacity: 0.38,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const spMesh = new THREE.Points(spGeo, spMat);
  spMesh.frustumCulled = false;
  group.add(spMesh);

  // ── Debug helpers (RAIN_DEBUG_HELPER = true 로 활성화) ───────────────────
  if (RAIN_DEBUG_HELPER) {
    for (const zone of RAIN_ZONES) {
      const col  = zone.isRoof ? 0xffff00 : (zone.isFar ? 0x0088ff : 0x00ff88);
      const h    = zone.isRoof ? 5.0 : RAIN_HEIGHT;
      const midY = zone.isRoof
        ? DINER_CEILING_Y + h * 0.5
        : FLOOR_Y + h * 0.5;
      const dbg = new THREE.Mesh(
        new THREE.BoxGeometry(zone.hw * 2, h, zone.hd * 2),
        new THREE.MeshBasicMaterial({ color: col, wireframe: true, transparent: true, opacity: 0.10 })
      );
      dbg.position.set(zone.cx, midY, zone.cz);
      scene.add(dbg);
    }
    // Interior exclusion box
    const exW = INT_MAX_X - INT_MIN_X;
    const exH = DINER_CEILING_Y - FLOOR_Y;
    const exD = INT_MAX_Z - INT_MIN_Z;
    const exb = new THREE.Mesh(
      new THREE.BoxGeometry(exW, exH, exD),
      new THREE.MeshBasicMaterial({ color: 0xff2244, wireframe: true, transparent: true, opacity: 0.15 })
    );
    exb.position.set(
      (INT_MIN_X + INT_MAX_X) * 0.5,
      (FLOOR_Y + DINER_CEILING_Y) * 0.5,
      (INT_MIN_Z + INT_MAX_Z) * 0.5
    );
    scene.add(exb);
  }

  scene.add(group);
  let active  = true;
  let splashT = 0;

  return {
    update(delta) {
      if (!active) return;
      const fall  = RAIN_SPEED * delta;
      const slant = fall * RAIN_SLANT;

      // Near streaks
      const np = nGeo.attributes.position.array;
      for (let i = 0; i < nearN; i++) {
        const b = i * 6;
        np[b+1] -= fall;
        np[b+4] -= fall;
        np[b]   += slant;
        np[b+3] += slant;

        const botY = np[b+4];
        const bx   = np[b];
        const bz   = np[b+2];

        if (botY < gndLine || (inFootprint(bx, bz) && botY < DINER_CEILING_Y)) {
          const { x, y, z } = spawnNear();
          np[b]   = x;                         np[b+1] = y;           np[b+2] = z;
          np[b+3] = x - DROP_LEN * RAIN_SLANT; np[b+4] = y - DROP_LEN; np[b+5] = z;
        }
      }
      nGeo.attributes.position.needsUpdate = true;

      // Far mist
      const fp = fGeo.attributes.position.array;
      for (let i = 0; i < farN; i++) {
        const b = i * 3;
        fp[b+1] -= fall;
        fp[b]   += slant;
        if (fp[b+1] < gndLine) {
          const { x, y, z } = spawnFar();
          fp[b] = x; fp[b+1] = y; fp[b+2] = z;
        }
      }
      fGeo.attributes.position.needsUpdate = true;

      // Splash shimmer
      splashT    += delta;
      spMat.opacity = 0.26 + 0.14 * Math.abs(Math.sin(splashT * 2.3));
      spMat.size    = 0.038 + 0.016 * Math.abs(Math.cos(splashT * 3.7));
    },

    setActive(val) {
      active        = val;
      group.visible = val;
    },
  };
}
