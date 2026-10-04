/**
 * The world around the board: a painted sky dome with a morning sun, the
 * Kathmandu valley the board sits in — terraced foothills, scattered pines —
 * the Himalaya rising behind it with Machhapuchhre's fishtail, and clouds
 * drifting across the range. Pure decoration; knows nothing about the rules.
 */

import * as THREE from 'three';
import { fbm, ridged, seeded } from './noise.ts';
import { peak } from './props.ts';
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

const C_VALLEY = new THREE.Color(0x8fb35c);
const C_FIELD_A = new THREE.Color(0xa6c46a);
const C_FIELD_B = new THREE.Color(0x7ea24e);
const C_FOREST = new THREE.Color(0x4f7d45);
const C_ROCK = new THREE.Color(0x7d8696);
const C_ROCK_DARK = new THREE.Color(0x5e6676);
const C_SNOW = new THREE.Color(0xf7fbff);
const C_EARTH = new THREE.Color(0xb59a6a);

function colourAt(x: number, z: number, h: number, slope: number, out: THREE.Color): THREE.Color {
  const snowLine = 26 + fbm(x * 0.05, z * 0.05, 3, 23) * 10;
  if (h > snowLine - slope * 10) return out.copy(C_SNOW);
  if (h > 16) return out.copy(C_ROCK).lerp(C_ROCK_DARK, Math.min(slope, 1));
  if (h > 9) return out.copy(C_FOREST).lerp(C_ROCK, THREE.MathUtils.smoothstep(h, 11, 16));
  if (h > 0.4) {
    // Soft contour bands read as the terraced fields of the middle hills.
    const band = Math.floor(h * 1.1) % 2 === 0;
    out.copy(C_FIELD_A).lerp(C_FIELD_B, band ? 0.15 : 0.55);
    if (slope > 0.9) out.lerp(C_EARTH, 0.4);
    return out;
  }
  return out.copy(C_VALLEY).lerp(C_FIELD_A, fbm(x * 0.1, z * 0.1, 2, 5) * 0.6);
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

/** Machhapuchhre — the fishtail — standing apart, behind Pokhara. */
function fishtail(): THREE.Group {
  const group = new THREE.Group();
  const rnd = seeded(4242);
  const make = (h: number, r: number, x: number): void => {
    // Squarer, steeper than the others — it's a famous silhouette.
    const geo = new THREE.ConeGeometry(r, h, 9, 6).toNonIndexed();
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colours = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < h / 2 - 0.01) {
        const k = 1 + (rnd() - 0.5) * 0.28;
        pos.setX(i, pos.getX(i) * k);
        pos.setZ(i, pos.getZ(i) * k);
      }
    }
    for (let i = 0; i < pos.count; i += 3) {
      const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3 + h / 2;
      const c = y > h * 0.42 ? C_SNOW : C_ROCK;
      for (let k = 0; k < 3; k++) c.toArray(colours, (i + k) * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 }),
    );
    mesh.position.set(x, h / 2, 0);
    mesh.castShadow = true;
    group.add(mesh);
  };
  make(54, 13, 0);
  make(46, 9, -6.5);
  return group;
}

/** Pines scattered over the middle hills, all in one instanced draw. */
function forest(box: THREE.Box3): THREE.Group {
  const group = new THREE.Group();
  const rnd = seeded(31337);
  const COUNT = 1600;

  const crown = new THREE.ConeGeometry(0.9, 2.6, 6);
  crown.translate(0, 2.1, 0);
  const trunk = new THREE.CylinderGeometry(0.14, 0.2, 1, 5);
  trunk.translate(0, 0.5, 0);

  const crowns = new THREE.InstancedMesh(
    crown,
    new THREE.MeshStandardMaterial({ color: 0x3f6f3a, roughness: 0.9, flatShading: true }),
    COUNT,
  );
  const trunks = new THREE.InstancedMesh(
    trunk,
    new THREE.MeshStandardMaterial({ color: 0x5b4030, roughness: 1 }),
    COUNT,
  );
  crowns.castShadow = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const tint = new THREE.Color();
  let placed = 0;
  let guard = 0;
  while (placed < COUNT && guard++ < 20000) {
    const x = (rnd() - 0.5) * 300;
    const z = box.min.z - 70 + rnd() * 190;
    if (outside(x, z, box, 4) < 3) continue;
    const y = heightAt(x, z, box);
    if (y < 0.3 || y > 14) continue;
    // Clump them: only plant where a low-frequency noise says "woodland".
    if (fbm(x * 0.04, z * 0.04, 2, 99) < (z > box.max.z ? 0.36 : 0.45)) continue;

    p.set(x, y - 0.2, z);
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rnd() * Math.PI);
    const k = 0.35 + rnd() * 0.45;
    s.set(k, k * (0.85 + rnd() * 0.4), k);
    m.compose(p, q, s);
    crowns.setMatrixAt(placed, m);
    trunks.setMatrixAt(placed, m);
    crowns.setColorAt(placed, tint.setHSL(0.3 + rnd() * 0.06, 0.38, 0.28 + rnd() * 0.1));
    placed++;
  }
  crowns.count = trunks.count = placed;
  group.add(crowns, trunks);
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

  // The Himalaya: two rows of distinct, faceted giants behind the foothills.
  const rangeRnd = seeded(1953);
  for (let row = 0; row < 3; row++) {
    const count = [16, 13, 10][row];
    for (let i = 0; i < count; i++) {
      const x = -180 + (i + 0.5) * (360 / count) + (rangeRnd() - 0.5) * 16;
      if (row === 0 && Math.abs(x - 14) < 14) continue; // leave room for the fishtail
      const z = box.max.z + [30, 52, 76][row] + rangeRnd() * 10;
      const h = [20, 34, 46][row] + rangeRnd() * [12, 18, 22][row];
      const r = h * (0.5 + rangeRnd() * 0.2);
      const p = peak(h, r, 100 + row * 40 + i);
      p.position.set(x, heightAt(x, z, box) - 3, z);
      p.rotation.y = rangeRnd() * Math.PI;
      p.traverse((o) => {
        o.castShadow = false;
        o.receiveShadow = false;
      });
      group.add(p);
    }
  }

  const tail = fishtail();
  // Behind Pokhara (screen-left of centre, since screen-right is -x).
  tail.position.set(14, heightAt(14, box.max.z + 40, box) - 4, box.max.z + 40);
  group.add(tail);

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
    },
  };
}
