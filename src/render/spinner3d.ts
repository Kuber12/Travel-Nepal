/**
 * The Maane — an eight-sided brass prayer wheel that replaces the dice for
 * movement. Each face carries a number 1–8 (with its Devanagari numeral) on a
 * lacquered panel. It whirls, slows, and settles with the engine's number
 * turned toward the camera under a little brass pointer.
 *
 * Like the dice, it decides nothing: the reducer has already picked the
 * number; this only shows it.
 */

import * as THREE from 'three';

const SIDES = 8;
const RADIUS = 0.78;
const HEIGHT = 1.5;
const SPIN_TIME = 1.9;
const DEVANAGARI = ['१', '२', '३', '४', '५', '६', '७', '८'];
const PANEL_COLOURS = ['#b2283a', '#1f5fa8', '#2f8a4a', '#d98a1c', '#b2283a', '#1f5fa8', '#2f8a4a', '#d98a1c'];

export type SpinnerView = {
  group: THREE.Group;
  /** Whirl the wheel and settle on `values[0]`. Resolves when it stops. */
  roll(values: number[]): Promise<void>;
  /** Which way the face should end up pointing (usually toward the camera). */
  faceToward(point: THREE.Vector3): void;
  hide(): void;
  update(dt: number): void;
};

/** Eight panels side by side, one per face of the octagonal drum. */
function drumTexture(): THREE.CanvasTexture {
  const cell = 256;
  const canvas = document.createElement('canvas');
  canvas.width = cell * SIDES;
  canvas.height = 384;
  const g = canvas.getContext('2d')!;

  // Brass ground.
  const brass = g.createLinearGradient(0, 0, 0, canvas.height);
  brass.addColorStop(0, '#f6d77a');
  brass.addColorStop(0.5, '#d9a84a');
  brass.addColorStop(1, '#a8741e');
  g.fillStyle = brass;
  g.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < SIDES; i++) {
    const x = i * cell;
    // Engraved bands top and bottom.
    g.fillStyle = 'rgba(90, 50, 10, 0.35)';
    for (const y of [22, 344]) g.fillRect(x, y, cell, 6);
    g.fillStyle = 'rgba(255, 245, 200, 0.5)';
    for (let k = 0; k < 8; k++) {
      g.beginPath();
      g.arc(x + 16 + k * 32, 46, 6, 0, Math.PI * 2);
      g.arc(x + 16 + k * 32, 338, 6, 0, Math.PI * 2);
      g.fill();
    }

    // Lacquered panel with the number.
    g.fillStyle = PANEL_COLOURS[i];
    g.beginPath();
    g.roundRect(x + 30, 70, cell - 60, 248, 26);
    g.fill();
    g.strokeStyle = '#fff1c4';
    g.lineWidth = 7;
    g.stroke();

    g.fillStyle = '#fff6d8';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'bold 150px Georgia, serif';
    g.fillText(String(i + 1), x + cell / 2, 178);
    g.font = 'bold 54px "Noto Sans Devanagari", "Kohinoor Devanagari", sans-serif';
    g.fillStyle = 'rgba(255, 238, 190, 0.9)';
    g.fillText(DEVANAGARI[i], x + cell / 2, 278);

    // A seam between faces.
    g.fillStyle = 'rgba(80, 40, 5, 0.45)';
    g.fillRect(x, 0, 3, canvas.height);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function buildSpinner(): SpinnerView {
  const group = new THREE.Group();
  group.visible = false;

  const brass = new THREE.MeshStandardMaterial({ color: 0xd9a84a, roughness: 0.28, metalness: 0.9 });
  const darkBrass = new THREE.MeshStandardMaterial({ color: 0x9a6a1c, roughness: 0.35, metalness: 0.85 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b3a1c, roughness: 0.6 });

  // The wheel spins inside this holder, around the vertical axle.
  const wheel = new THREE.Group();
  group.add(wheel);

  const drum = new THREE.Mesh(
    new THREE.CylinderGeometry(RADIUS, RADIUS, HEIGHT, SIDES, 1, true),
    new THREE.MeshStandardMaterial({ map: drumTexture(), roughness: 0.32, metalness: 0.55, side: THREE.DoubleSide }),
  );
  drum.castShadow = true;
  wheel.add(drum);

  for (const y of [HEIGHT / 2, -HEIGHT / 2]) {
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(RADIUS * 1.08, RADIUS * 1.08, 0.12, SIDES), darkBrass);
    rim.position.y = y;
    rim.castShadow = true;
    wheel.add(rim);
  }
  const dome = new THREE.Mesh(new THREE.SphereGeometry(RADIUS * 0.9, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), brass);
  dome.scale.y = 0.45;
  dome.position.y = HEIGHT / 2 + 0.05;
  const finial = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.38, 12), brass);
  finial.position.y = HEIGHT / 2 + 0.55;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), brass);
  knob.position.y = HEIGHT / 2 + 0.78;
  wheel.add(dome, finial, knob);

  // The weight on its chain, flung outward as the wheel spins.
  const chainPivot = new THREE.Group();
  chainPivot.position.set(RADIUS * 1.05, HEIGHT * 0.2, 0);
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 6), darkBrass);
  chain.position.y = -0.25;
  const weight = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), darkBrass);
  weight.position.y = -0.52;
  chainPivot.add(chain, weight);
  wheel.add(chainPivot);

  // Fixed parts: axle, handle and base.
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, HEIGHT + 1.6, 10), darkBrass);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.16, 24), wood);
  base.position.y = -HEIGHT / 2 - 0.5;
  axle.position.y = -0.1;
  base.castShadow = true;
  group.add(axle, base);

  // The pointer, standing in front of the drum on the camera's side.
  const pointerHolder = new THREE.Group();
  // A bracket off the axle top, with a red pointer hanging over the front face.
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, RADIUS + 0.2), darkBrass);
  post.position.set(0, HEIGHT / 2 + 0.95, (RADIUS + 0.2) / 2);
  const drop = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 8), darkBrass);
  drop.position.set(0, HEIGHT / 2 + 0.62, RADIUS + 0.2);
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 4), new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.4 }));
  arrow.rotation.x = Math.PI;
  arrow.position.set(0, HEIGHT / 2 + 0.2, RADIUS + 0.2);
  const glow = new THREE.Mesh(
    new THREE.RingGeometry(1.1, 1.35, 48),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(4.5, 3.4, 1.2), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -HEIGHT / 2 - 0.4;
  pointerHolder.add(post, drop, arrow);
  group.add(pointerHolder, glow);

  let facing = 0; // yaw of the side that should show the number
  let spin: { t: number; from: number; to: number; resolve: () => void } | null = null;
  let settled = 0;

  /** Wheel rotation that turns face `value` to `facing`. */
  function angleFor(value: number): number {
    // Face k is centred at theta = (k + 0.5) * 2π / SIDES, normal (sin θ, 0, cos θ).
    const theta = ((value - 1 + 0.5) * Math.PI * 2) / SIDES;
    return facing - theta;
  }

  return {
    group,

    faceToward(point) {
      const dx = point.x - group.position.x;
      const dz = point.z - group.position.z;
      facing = Math.atan2(dx, dz);
      pointerHolder.rotation.y = facing;
    },

    roll(values) {
      group.visible = true;
      settled = 0;
      const value = values[0] ?? 1;
      const from = wheel.rotation.y;
      // At least four whole turns, landing exactly on the number.
      let to = angleFor(value);
      const turns = Math.PI * 2;
      while (to < from + turns * 4) to += turns;
      return new Promise((resolve) => {
        spin = { t: 0, from, to, resolve };
      });
    },

    hide() {
      group.visible = false;
      spin?.resolve();
      spin = null;
    },

    update(dt) {
      if (!group.visible) return;
      if (spin) {
        spin.t = Math.min(spin.t + dt / SPIN_TIME, 1);
        // Fast start, long easing finish — like a hand-flicked wheel.
        const k = 1 - Math.pow(1 - spin.t, 3.2);
        const prev = wheel.rotation.y;
        wheel.rotation.y = spin.from + (spin.to - spin.from) * k;
        const speed = (wheel.rotation.y - prev) / Math.max(dt, 1e-4);
        // The weight swings out with speed.
        chainPivot.rotation.z = -Math.min(speed * 0.12, 1.2);
        group.position.y += 0; // stays put
        if (spin.t >= 1) {
          const done = spin.resolve;
          spin = null;
          done();
        }
        (glow.material as THREE.MeshBasicMaterial).opacity = 0;
      } else {
        settled = Math.min(settled + dt * 3, 1);
        chainPivot.rotation.z *= 0.9;
        (glow.material as THREE.MeshBasicMaterial).opacity = settled * 0.85;
        glow.scale.setScalar(0.7 + settled * 0.4);
      }
    },
  };
}
