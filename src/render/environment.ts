/**
 * The world around the board: a painted sky dome with a morning sun, the
 * green valley the board sits in — rice terraces and mustard fields on the
 * foothills, mixed forest with rhododendron in bloom, villages dotted on the
 * ridges — and the Himalaya all round: three rows of snow giants to the north
 * with Machhapuchhre's fishtail and Everest trailing its plume, and lower
 * ranges wrapping east and west. Clouds drift across the range. Pure
 * decoration; knows nothing about the rules.
 */

import * as THREE from 'three';
import { massif } from './mountains.ts';
import { fbm, ridged, seeded } from './noise.ts';
import { SKY_BOTTOM, SKY_TOP } from './palette.ts';

export type EnvironmentView = {
  group: THREE.Group;
  update(dt: number, elapsed: number): void;
};

/** Where the sun sits, as a direction — shared by the sky glow and the light. */
export const SUN_DIRECTION = new THREE.Vector3(0.62, 0.66, 0.3).normalize();

// --- sky ---------------------------------------------------------------------

function skyDome(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(SKY_TOP) },
      bottom: { value: new THREE.Color(SKY_BOTTOM) },
      sunDir: { value: SUN_DIRECTION },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 top;
      uniform vec3 bottom;
      uniform vec3 sunDir;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 col = mix(bottom, top, pow(h, 0.55));
        float sun = max(dot(normalize(vDir), sunDir), 0.0);
        col += vec3(1.0, 0.86, 0.6) * pow(sun, 18.0) * 0.45;   // warm halo
        col += vec3(1.0, 0.95, 0.85) * pow(sun, 900.0) * 1.6;  // the disc
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(460, 32, 16), material);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

// --- terrain -----------------------------------------------------------------

/** Rounded-rectangle distance: 0 inside the board's footprint, growing outside. */
function outside(x: number, z: number, box: THREE.Box3, margin: number): number {
  const dx = Math.max(box.min.x - margin - x, 0, x - box.max.x - margin);
  const dz = Math.max(box.min.z - margin - z, 0, z - box.max.z - margin);
  return Math.hypot(dx, dz);
}

/**
 * Height of the world at (x, z). The board sits on a flat valley floor;
 * terraced hills roll out from it, and to the north the ground climbs into
 * the Himalaya.
 */
function heightAt(x: number, z: number, box: THREE.Box3): number {
  const d = outside(x, z, box, 3);
  const ramp = THREE.MathUtils.smoothstep(d, 2, 30);

  // Rolling middle hills all around, low near the board.
  let h = (fbm(x * 0.02, z * 0.02, 4, 7) - 0.3) * 9 * ramp + ramp * ramp * 4;

  // The range, north of the board.
  // Forested foothills climbing toward the range; the peaks themselves are
  // separate meshes standing on top.
  const north = THREE.MathUtils.smoothstep(z, box.max.z + 4, box.max.z + 40);
  const range = ridged(x * 0.03 + 3.1, z * 0.03, 4, 11);
  h += north * (range * 14 + 6);

  return Math.max(h, -0.6) - 0.62;
}

const C_VALLEY = new THREE.Color(0x6aa241);
const C_PADDY = new THREE.Color(0x86bd4e);
const C_FIELD_A = new THREE.Color(0x84b84e);
const C_FIELD_B = new THREE.Color(0x5e9139);
const C_MUSTARD = new THREE.Color(0xe2c23a);
const C_FOREST = new THREE.Color(0x3d7536);
const C_ROCK = new THREE.Color(0x868a92);
const C_ROCK_DARK = new THREE.Color(0x60656f);
const C_SNOW = new THREE.Color(0xf7fbff);
const C_EARTH = new THREE.Color(0xa8875a);

function colourAt(x: number, z: number, h: number, slope: number, out: THREE.Color): THREE.Color {
  const snowLine = 24 + fbm(x * 0.05, z * 0.05, 3, 23) * 10;
  if (h > snowLine - slope * 10) return out.copy(C_SNOW);
  if (h > 15) return out.copy(C_ROCK).lerp(C_ROCK_DARK, Math.min(slope, 1));
  if (h > 8.5) return out.copy(C_FOREST).lerp(C_ROCK, THREE.MathUtils.smoothstep(h, 11, 15));
  if (h > 0.4) {
    // Contour bands read as the terraced fields of the middle hills: young
    // rice in bright green, older terraces darker, a few golden with mustard.
    const band = Math.floor(h * 1.6) % 2 === 0;
    out.copy(C_FIELD_A).lerp(C_FIELD_B, band ? 0.1 : 0.6);
    const crop = fbm(x * 0.06 + 40, z * 0.06, 2, 61);
    if (crop > 0.66 && h < 6) out.lerp(C_MUSTARD, 0.75);
    else if (crop < 0.3) out.lerp(C_FOREST, 0.55);
    if (slope > 0.9) out.lerp(C_EARTH, 0.45);
    return out;
  }
  // The valley floor: paddies, brighter where the water stands.
  const paddy = fbm(x * 0.12, z * 0.12, 2, 5);
  return out.copy(C_VALLEY).lerp(C_PADDY, paddy * 0.8);
}

function terrain(box: THREE.Box3): THREE.Mesh {
  const W = 520;
  const D = 380;
  const SEG_X = 260;
  const SEG_Z = 190;
  const centreZ = box.max.z + 40;

  const geo = new THREE.PlaneGeometry(W, D, SEG_X, SEG_Z);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, centreZ);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, heightAt(pos.getX(i), pos.getZ(i), box));
  }

  geo.computeVertexNormals();

  // Colour per vertex from height and slope: valley, terraced fields,
  // forest, rock, snow.
  const normals = geo.attributes.normal as THREE.BufferAttribute;
  const colours = new Float32Array(pos.count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const slope = (1 - normals.getY(i)) * 3;
    colourAt(pos.getX(i), pos.getZ(i), pos.getY(i), slope, col);
    col.toArray(colours, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));

  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }),
  );
  mesh.receiveShadow = true;
  return mesh;
}

/** Trees over the middle hills — pines up high, broadleaf and rhododendron lower — in two instanced draws. */
function forest(box: THREE.Box3): THREE.Group {
  const group = new THREE.Group();
  const rnd = seeded(31337);
  const COUNT = 3600;

  const cone = new THREE.ConeGeometry(0.9, 2.6, 7);
  cone.translate(0, 2.1, 0);
  const crown = new THREE.IcosahedronGeometry(1.15, 1);
  crown.scale(1, 0.9, 1);
  crown.translate(0, 2.0, 0);
  const trunk = new THREE.CylinderGeometry(0.14, 0.2, 1, 5);
  trunk.translate(0, 0.5, 0);

  const cones = new THREE.InstancedMesh(cone, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), COUNT);
  const crowns = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), COUNT);
  const trunks = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: 0x5b4030, roughness: 1 }), COUNT);
  cones.castShadow = crowns.castShadow = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const tint = new THREE.Color();
  let nc = 0;
  let nb = 0;
  let nt = 0;
  let guard = 0;
  while (nc + nb < COUNT && guard++ < 40000) {
    const x = (rnd() - 0.5) * 330;
    const z = box.min.z - 80 + rnd() * 200;
    if (outside(x, z, box, 4) < 3) continue;
    const y = heightAt(x, z, box);
    if (y < 0.3 || y > 14) continue;
    // Clump them: only plant where a low-frequency noise says "woodland".
    if (fbm(x * 0.04, z * 0.04, 2, 99) < (z > box.max.z ? 0.34 : 0.42)) continue;

    p.set(x, y - 0.2, z);
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rnd() * Math.PI);
    const k = 0.35 + rnd() * 0.45;
    s.set(k, k * (0.85 + rnd() * 0.4), k);
    m.compose(p, q, s);
    const conifer = y > 6 || rnd() < 0.25;
    if (conifer && nc < COUNT) {
      cones.setMatrixAt(nc, m);
      cones.setColorAt(nc++, tint.setHSL(0.32 + rnd() * 0.05, 0.42, 0.24 + rnd() * 0.08));
    } else if (nb < COUNT) {
      crowns.setMatrixAt(nb, m);
      // Rhododendron, Nepal's national flower, in bloom on a few of them.
      if (rnd() < 0.07) crowns.setColorAt(nb++, tint.setHSL(0.98, 0.62, 0.45));
      else crowns.setColorAt(nb++, tint.setHSL(0.24 + rnd() * 0.07, 0.5, 0.28 + rnd() * 0.1));
    }
    if (nt < COUNT) trunks.setMatrixAt(nt++, m);
  }
  cones.count = nc;
  crowns.count = nb;
  trunks.count = nt;
  group.add(cones, crowns, trunks);
  return group;
}

/** Hamlets on the ridges: whitewashed houses with tin and slate roofs, in two instanced draws. */
function villages(box: THREE.Box3): THREE.Group {
  const group = new THREE.Group();
  const rnd = seeded(4401);
  const COUNT = 220;
  const walls = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.4, 1, 1.1).translate(0, 0.5, 0),
    new THREE.MeshStandardMaterial({ color: 0xf2ece0, roughness: 0.9 }),
    COUNT,
  );
  const roofs = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1.1, 0.7, 4).rotateY(Math.PI / 4).translate(0, 1.35, 0),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, flatShading: true }),
    COUNT,
  );
  const ROOFS = [0xb5402f, 0x2b5fa8, 0x6a6560, 0xb5402f, 0x8a8f96];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  let n = 0;
  let guard = 0;
  while (n < COUNT && guard++ < 20000) {
    // A hamlet centre, then a few houses around it.
    const hx = (rnd() - 0.5) * 300;
    const hz = box.min.z - 60 + rnd() * 160;
    if (outside(hx, hz, box, 6) < 6) continue;
    const hy = heightAt(hx, hz, box);
    if (hy < 1 || hy > 9) continue;
    const houses = 2 + Math.floor(rnd() * 5);
    for (let i = 0; i < houses && n < COUNT; i++) {
      const x = hx + (rnd() - 0.5) * 7;
      const z = hz + (rnd() - 0.5) * 7;
      const y = heightAt(x, z, box);
      if (Math.abs(y - hy) > 2.5) continue;
      p.set(x, y - 0.1, z);
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rnd() * Math.PI);
      const k = 0.55 + rnd() * 0.35;
      sc.set(k, k, k);
      m.compose(p, q, sc);
      walls.setMatrixAt(n, m);
      roofs.setMatrixAt(n, m);
      roofs.setColorAt(n, c.setHex(ROOFS[Math.floor(rnd() * ROOFS.length)]));
      n++;
    }
  }
  walls.count = roofs.count = n;
  walls.castShadow = roofs.castShadow = true;
  group.add(walls, roofs);
  return group;
}

// --- clouds ------------------------------------------------------------------

function cloud(rnd: () => number): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfff4ea,
    emissiveIntensity: 0.35,
    roughness: 1,
    flatShading: true,
    transparent: true,
    opacity: 0.94,
  });
  const puffs = 4 + Math.floor(rnd() * 4);
  for (let i = 0; i < puffs; i++) {
    const r = 2.2 + rnd() * 2.6;
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), material);
    puff.position.set((i - puffs / 2) * 2.6 + rnd(), rnd() * 1.6, (rnd() - 0.5) * 3);
    puff.scale.y = 0.62;
    group.add(puff);
  }
  return group;
}

export function buildEnvironment(box: THREE.Box3): EnvironmentView {
  const group = new THREE.Group();
  group.add(skyDome());
  group.add(terrain(box));
  group.add(forest(box));

  group.add(villages(box));

  // The Himalaya: three rows of snow giants behind the foothills, getting
  // taller and paler with distance, and lower ranges wrapping round the valley.
  const rangeRnd = seeded(1953);
  const place = (x: number, z: number, h: number, r: number, seed: number, extra: Partial<Parameters<typeof massif>[0]> = {}): THREE.Mesh => {
    const peak = massif({ height: h, radius: r, seed, spurs: 4 + Math.floor(rangeRnd() * 3), sharpness: 1.3 + rangeRnd() * 0.5, snowline: 0.42, treeline: 0.06, rings: 14, segments: 40, ...extra });
    peak.position.set(x, heightAt(x, z, box) - 3, z);
    peak.rotation.y = rangeRnd() * Math.PI * 2;
    peak.castShadow = false;
    peak.receiveShadow = false;
    group.add(peak);
    return peak;
  };
  const rows = [
    { count: 20, z: 34, h: [18, 12], spread: 210 },
    { count: 16, z: 58, h: [30, 18], spread: 220 },
    { count: 13, z: 86, h: [44, 24], spread: 230 },
  ];
  rows.forEach((row, ri) => {
    for (let i = 0; i < row.count; i++) {
      const x = -row.spread + (i + 0.5) * ((row.spread * 2) / row.count) + (rangeRnd() - 0.5) * 14;
      if (ri === 2 && (Math.abs(x - 22) < 16 || Math.abs(x + 46) < 16)) continue; // room for the fishtail and Everest
      const z = box.max.z + row.z + rangeRnd() * 12;
      const h = row.h[0] + rangeRnd() * row.h[1];
      place(x, z, h, h * (0.6 + rangeRnd() * 0.2), 100 + ri * 40 + i);
    }
  });
  // East and west, lower ranges close the valley in, so the snows show from any side.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const x = side * (150 + rangeRnd() * 50);
      const z = box.min.z - 60 + i * 26 + rangeRnd() * 10;
      const h = 22 + rangeRnd() * 20;
      place(x, z, h, h * 0.7, 300 + i * 3 + (side + 1) * 50);
    }
  }

  // Machhapuchhre — the fishtail — behind Pokhara (screen-left, since screen-right is −x).
  place(22, box.max.z + 92, 64, 26, 4242, { twin: { angle: -0.4, distance: 0.42, height: 0.86 }, sharpness: 2.1, spurs: 3, snowline: 0.34 });
  // Sagarmatha · Everest, far to the east, trailing its plume of snow.
  const everest = place(-46, box.max.z + 98, 72, 40, 8848, { spurs: 3, sharpness: 1.35, snowline: 0.36 });
  everest.rotation.y = 0.6;
  everest.updateMatrix();
  const summit = (everest.userData.summit as THREE.Vector3).clone().applyMatrix4(everest.matrix);
  const plume: { mesh: THREE.Mesh; t: number }[] = [];
  for (let i = 0; i < 9; i++) {
    const puff = new THREE.Mesh(
      new THREE.IcosahedronGeometry(3 + i * 0.8, 1),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4f6ff, emissiveIntensity: 0.4, transparent: true, depthWrite: false, roughness: 1 }),
    );
    group.add(puff);
    plume.push({ mesh: puff, t: i / 9 });
  }

  const rnd = seeded(777);
  const clouds: { mesh: THREE.Group; speed: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const c = cloud(rnd);
    const far = i < 8;
    c.position.set(
      (rnd() - 0.5) * 300,
      far ? 34 + rnd() * 26 : 16 + rnd() * 8,
      far ? box.max.z + 50 + rnd() * 90 : box.max.z + 25 + rnd() * 30,
    );
    c.scale.setScalar(far ? 1.4 + rnd() * 1.4 : 1 + rnd() * 0.6);
    group.add(c);
    clouds.push({ mesh: c, speed: 0.8 + rnd() * 1.4 });
  }

  return {
    group,
    update(dt) {
      for (const c of clouds) {
        c.mesh.position.x -= c.speed * dt;
        if (c.mesh.position.x < -170) c.mesh.position.x = 170;
      }
      // The jet stream tears a long white flag off Everest's summit.
      for (const p of plume) {
        p.t = (p.t + dt * 0.05) % 1;
        p.mesh.position.set(summit.x - p.t * 36, summit.y - p.t * 5 - 1, summit.z + p.t * 6);
        p.mesh.scale.set(1.6 + p.t * 1.5, 0.5 + p.t * 0.4, 0.8 + p.t * 0.6);
        (p.mesh.material as THREE.MeshStandardMaterial).opacity = 0.55 * Math.sin(Math.PI * Math.min(1, p.t * 1.4 + 0.05));
      }
    },
  };
}
