import * as THREE from "three";

// ── Tunable constants ──────────────────────────────────────────────────────
const RAIN_ENABLED       = true;
const RAIN_DEBUG_HELPER  = false;

const RAIN_COUNT_DESKTOP = 1200;
const RAIN_COUNT_MOBILE  = 500;

// Rain volume center — exterior front of diner (z 2→12 is outside entrance)
const RAIN_FRONT_CX    = 0;
const RAIN_FRONT_CZ    = 7;
const RAIN_AREA_WIDTH  = 14;   // x span: -7 to +7
const RAIN_AREA_DEPTH  = 10;   // z span: 2 to 12
const RAIN_HEIGHT      = 9.0;  // fall height above floor
const FLOOR_Y          = -1.35;

const RAIN_SPEED       = 7.5;  // units/sec downward
const RAIN_SLANT_X     = 0.35; // x drift per unit of fall (wind angle)
const RAIN_OPACITY     = 0.50;
const DROP_LENGTH      = 0.40; // visual length of each streak

// Interior exclusion — approximate diner interior AABB
const INT_MIN_X = -4.0;
const INT_MAX_X =  3.0;
const INT_MIN_Z = -3.5;
const INT_MAX_Z =  2.0;

// Rabbid world-space position and exclusion radius
const RABBID_X = 0.0501;
const RABBID_Z = 0.5041;
const RABBID_R = 0.6;

// ── Helpers ────────────────────────────────────────────────────────────────
function rnd(a, b) { return a + Math.random() * (b - a); }

function isExcluded(x, z) {
  if (x >= INT_MIN_X && x <= INT_MAX_X && z >= INT_MIN_Z && z <= INT_MAX_Z) return true;
  const dx = x - RABBID_X;
  const dz = z - RABBID_Z;
  return (dx * dx + dz * dz) < (RABBID_R * RABBID_R);
}

function safeXZ(extraZ) {
  let x, z, t = 0;
  const ez = extraZ || 0;
  do {
    x = RAIN_FRONT_CX + rnd(-RAIN_AREA_WIDTH * 0.5, RAIN_AREA_WIDTH * 0.5);
    z = RAIN_FRONT_CZ + rnd(-RAIN_AREA_DEPTH * 0.5, RAIN_AREA_DEPTH * 0.5) + ez;
    t++;
  } while (isExcluded(x, z) && t < 12);
  return { x, z };
}

// ── createExteriorRain ─────────────────────────────────────────────────────
export function createExteriorRain(scene, _camera, options) {
  if (!RAIN_ENABLED) {
    return { update() {}, setActive() {} };
  }

  const isMobile = typeof navigator !== "undefined" &&
    /Android|iPhone|iPad/i.test(navigator.userAgent);
  const total  = (options && options.count) ? options.count
               : (isMobile ? RAIN_COUNT_MOBILE : RAIN_COUNT_DESKTOP);

  const nearN = Math.floor(total * 0.70);
  const farN  = total - nearN;
  const topY  = FLOOR_Y + RAIN_HEIGHT;

  const group = new THREE.Group();
  group.name  = "exteriorRainGroup";

  // ── Near rain streaks (LineSegments) ──────────────────────────────────────
  // Each drop = 2 vertices (top + bottom of streak): 6 floats per drop
  const nBuf = new Float32Array(nearN * 6);
  for (let i = 0; i < nearN; i++) {
    const { x, z } = safeXZ();
    const y = rnd(FLOOR_Y, topY);
    const b = i * 6;
    nBuf[b]     = x;
    nBuf[b + 1] = y;
    nBuf[b + 2] = z;
    nBuf[b + 3] = x - DROP_LENGTH * RAIN_SLANT_X;
    nBuf[b + 4] = y - DROP_LENGTH;
    nBuf[b + 5] = z;
  }

  const nGeo = new THREE.BufferGeometry();
  nGeo.setAttribute("position", new THREE.BufferAttribute(nBuf, 3));

  const nMat = new THREE.LineBasicMaterial({
    color: 0xc0d8ff,
    transparent: true,
    opacity: RAIN_OPACITY,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const nMesh = new THREE.LineSegments(nGeo, nMat);
  nMesh.frustumCulled = false;
  group.add(nMesh);

  // ── Far mist points ────────────────────────────────────────────────────────
  const fBuf = new Float32Array(farN * 3);
  for (let i = 0; i < farN; i++) {
    const { x, z } = safeXZ(rnd(0, 6));
    const b = i * 3;
    fBuf[b]     = x;
    fBuf[b + 1] = rnd(FLOOR_Y, topY);
    fBuf[b + 2] = z;
  }

  const fGeo = new THREE.BufferGeometry();
  fGeo.setAttribute("position", new THREE.BufferAttribute(fBuf, 3));

  const fMat = new THREE.PointsMaterial({
    color: 0x88aacc,
    size: 0.06,
    transparent: true,
    opacity: 0.24,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const fMesh = new THREE.Points(fGeo, fMat);
  fMesh.frustumCulled = false;
  group.add(fMesh);

  // ── Debug helpers (RAIN_DEBUG_HELPER = true 로 활성화) ─────────────────────
  if (RAIN_DEBUG_HELPER) {
    const volMesh = new THREE.Mesh(
      new THREE.BoxGeometry(RAIN_AREA_WIDTH, RAIN_HEIGHT, RAIN_AREA_DEPTH),
      new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true, transparent: true, opacity: 0.10 })
    );
    volMesh.position.set(RAIN_FRONT_CX, FLOOR_Y + RAIN_HEIGHT * 0.5, RAIN_FRONT_CZ);
    scene.add(volMesh);

    const exW = INT_MAX_X - INT_MIN_X;
    const exD = INT_MAX_Z - INT_MIN_Z;
    const exMesh = new THREE.Mesh(
      new THREE.BoxGeometry(exW, 6, exD),
      new THREE.MeshBasicMaterial({ color: 0xff2244, wireframe: true, transparent: true, opacity: 0.15 })
    );
    exMesh.position.set(
      (INT_MIN_X + INT_MAX_X) * 0.5, 1.5,
      (INT_MIN_Z + INT_MAX_Z) * 0.5
    );
    scene.add(exMesh);
  }

  scene.add(group);
  let active = true;

  return {
    update(delta) {
      if (!active) return;
      const fall   = RAIN_SPEED * delta;
      const slant  = fall * RAIN_SLANT_X;
      const ground = FLOOR_Y + 0.05;

      // Update near streaks
      const np = nGeo.attributes.position.array;
      for (let i = 0; i < nearN; i++) {
        const b = i * 6;
        np[b + 1] -= fall;    // top y
        np[b + 4] -= fall;    // bot y
        np[b]     += slant;   // top x drift
        np[b + 3] += slant;   // bot x drift

        if (np[b + 4] < ground) {
          const { x, z } = safeXZ();
          const ny = topY + rnd(0, RAIN_HEIGHT * 0.45);
          np[b]     = x;
          np[b + 1] = ny;
          np[b + 2] = z;
          np[b + 3] = x - DROP_LENGTH * RAIN_SLANT_X;
          np[b + 4] = ny - DROP_LENGTH;
          np[b + 5] = z;
        }
      }
      nGeo.attributes.position.needsUpdate = true;

      // Update far mist
      const fp = fGeo.attributes.position.array;
      for (let i = 0; i < farN; i++) {
        const b = i * 3;
        fp[b + 1] -= fall;
        fp[b]     += slant;
        if (fp[b + 1] < ground) {
          const { x, z } = safeXZ(rnd(0, 6));
          fp[b]     = x;
          fp[b + 1] = topY + rnd(0, RAIN_HEIGHT * 0.35);
          fp[b + 2] = z;
        }
      }
      fGeo.attributes.position.needsUpdate = true;
    },

    setActive(val) {
      active       = val;
      group.visible = val;
    },
  };
}
