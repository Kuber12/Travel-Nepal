/**
 * The Ashtamangal (8-sided) and 10-sided dice.
 *
 * No physics. The engine has already decided the number; the dice tumble for a
 * moment and then settle into the orientation that shows that face upward.
 * Deterministic, and it stays correct when rolls arrive from a server.
 *
 * Both dice are built face by face rather than from a primitive, because each
 * face needs its own cell of the number atlas and its own "this side up"
 * rotation. A primitive's UVs would smear the numbers across the solid.
 */

import * as THREE from 'three';

const TUMBLE_TIME = 0.95;
const SETTLE_TIME = 0.35;

export type DiceView = {
  group: THREE.Group;
  /** Tumble the dice and settle on `values`. Resolves when they have landed. */
  roll(values: number[]): Promise<void>;
  hide(): void;
  update(dt: number): void;
};

type Face = [THREE.Vector3, THREE.Vector3, THREE.Vector3];

/** The eight faces of a regular octahedron — the Ashtamangal die. */
function octahedronFaces(radius: number): Face[] {
  const faces: Face[] = [];
  for (const sx of [1, -1]) {
    for (const sy of [1, -1]) {
      for (const sz of [1, -1]) {
        const a = new THREE.Vector3(sx * radius, 0, 0);
        const b = new THREE.Vector3(0, sy * radius, 0);
        const c = new THREE.Vector3(0, 0, sz * radius);
        // Keep the winding outward so the face normal points away from centre.
        const face: Face = sx * sy * sz > 0 ? [a, b, c] : [a, c, b];
        faces.push(face);
      }
    }
  }
  return faces;
}

/**
 * The ten faces of a pentagonal bipyramid: two apexes over a five-point
 * equator. Ten triangles, ten distinct normals, one per number.
 */
function bipyramidFaces(radius: number, height: number): Face[] {
  const equator = Array.from({ length: 5 }, (_, i) => {
    const angle = (i / 5) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  });

  const top = new THREE.Vector3(0, height, 0);
  const bottom = new THREE.Vector3(0, -height, 0);

  const faces: Face[] = [];
  for (let i = 0; i < 5; i++) {
    const a = equator[i];
    const b = equator[(i + 1) % 5];
    faces.push([top, a, b]);
    faces.push([bottom, b, a]);
  }
  return faces;
}

/** Numbers 1..n painted into a grid atlas, one cell per face. */
function numberAtlas(faceCount: number, tint: string): { texture: THREE.Texture; cols: number; rows: number } {
  const cell = 128;
  const cols = Math.ceil(Math.sqrt(faceCount));
  const rows = Math.ceil(faceCount / cols);

  const canvas = document.createElement('canvas');
  canvas.width = cell * cols;
  canvas.height = cell * rows;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#2a2016';
  ctx.font = `bold ${cell * 0.46}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < faceCount; i++) {
    const cx = (i % cols) * cell + cell / 2;
    const cy = Math.floor(i / cols) * cell + cell / 2;
    ctx.fillText(String(i + 1), cx, cy);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, cols, rows };
}

type Die = {
  mesh: THREE.Mesh;
  /** Rotation that turns each numbered face upward. */
  rotations: THREE.Quaternion[];
  faceCount: number;
};

function buildDie(faces: Face[], tint: string): Die {
  const { texture, cols, rows } = numberAtlas(faces.length, tint);

  const positions = new Float32Array(faces.length * 9);
  const uvs = new Float32Array(faces.length * 6);
  const rotations: THREE.Quaternion[] = [];

  const up = new THREE.Vector3(0, 1, 0);
  const edge1 = new THREE.Vector3();
  const edge2 = new THREE.Vector3();
  const normal = new THREE.Vector3();

  // Triangle inside each atlas cell, chosen to sit over the printed number.
  const cellUvs: Array<[number, number]> = [
    [0.5, 0.94],
    [0.04, 0.08],
    [0.96, 0.08],
  ];

  faces.forEach((face, i) => {
    face.forEach((vertex, v) => {
      positions.set([vertex.x, vertex.y, vertex.z], i * 9 + v * 3);

      // Canvas rows run top-down; texture V runs bottom-up, hence the flip.
      const [u, w] = cellUvs[v];
      const col = i % cols;
      const row = Math.floor(i / cols);
      uvs.set([(col + u) / cols, 1 - (row + 1 - w) / rows], i * 6 + v * 2);
    });

    edge1.subVectors(face[1], face[0]);
    edge2.subVectors(face[2], face[0]);
    normal.crossVectors(edge1, edge2).normalize();
    rotations.push(new THREE.Quaternion().setFromUnitVectors(normal, up));
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshPhysicalMaterial({
      map: texture,
      roughness: 0.3,
      metalness: 0.0,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      sheen: 0.3,
    }),
  );
  mesh.castShadow = true;

  return { mesh, rotations, faceCount: faces.length };
}

export function buildDice(): DiceView {
  const group = new THREE.Group();
  group.visible = false;

  const dice: Die[] = [
    buildDie(octahedronFaces(0.62), '#f6efdd'),
    buildDie(bipyramidFaces(0.56, 0.78), '#e4d2f2'),
  ];
  dice.forEach((die, i) => {
    die.mesh.position.set((i - 0.5) * 1.8, 0, 0);
    group.add(die.mesh);
  });

  // A golden halo that swells under the dice once they settle on a result.
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(1.5, 1.9, 48),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(4.5, 3.4, 1.2),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = -0.82;
  group.add(halo);
  let haloT = 0;

  type Anim = {
    die: Die;
    from: THREE.Quaternion;
    to: THREE.Quaternion;
    spin: THREE.Vector3;
    elapsed: number;
  };
  let anims: Anim[] = [];
  let resolveRoll: (() => void) | null = null;

  return {
    group,

    roll(values) {
      group.visible = true;

      anims = values.map((value, i) => {
        const die = dice[Math.min(i, dice.length - 1)];
        const faceIndex = (value - 1 + die.faceCount) % die.faceCount;
        return {
          die,
          from: die.mesh.quaternion.clone(),
          to: die.rotations[faceIndex].clone(),
          // A different tumble axis per die so they don't move in lockstep.
          spin: new THREE.Vector3(7 + i * 2, 11 - i * 3, 5 + i),
          elapsed: 0,
        };
      });

      // Dice not used this roll (single-die turns) step aside.
      dice.forEach((die, i) => {
        die.mesh.visible = i < values.length;
      });

      return new Promise((resolve) => {
        resolveRoll = resolve;
      });
    },

    hide() {
      group.visible = false;
      anims = [];
      resolveRoll?.();
      resolveRoll = null;
    },

    update(dt) {
      if (group.visible && anims.length === 0) {
        haloT = Math.min(haloT + dt * 3, 1);
      } else if (anims.length > 0) {
        haloT = 0;
      }
      halo.scale.setScalar(0.6 + haloT * 0.5);
      (halo.material as THREE.MeshBasicMaterial).opacity = haloT * 0.85;
      if (anims.length === 0) return;

      let allDone = true;
      for (const anim of anims) {
        anim.elapsed += dt;
        const { elapsed } = anim;

        if (elapsed < TUMBLE_TIME) {
          // Free tumble, slowing as it goes.
          const decay = 1 - elapsed / TUMBLE_TIME;
          anim.die.mesh.rotateX(anim.spin.x * dt * decay);
          anim.die.mesh.rotateY(anim.spin.y * dt * decay);
          anim.die.mesh.rotateZ(anim.spin.z * dt * decay);
          anim.die.mesh.position.y = Math.abs(Math.sin(elapsed * 9)) * (1.4 * decay);
          anim.from.copy(anim.die.mesh.quaternion);
          allDone = false;
        } else if (elapsed < TUMBLE_TIME + SETTLE_TIME) {
          // Ease into the orientation that shows the engine's number.
          const t = (elapsed - TUMBLE_TIME) / SETTLE_TIME;
          const eased = 1 - Math.pow(1 - t, 3);
          anim.die.mesh.quaternion.slerpQuaternions(anim.from, anim.to, eased);
          anim.die.mesh.position.y *= 1 - eased;
          allDone = false;
        } else {
          anim.die.mesh.quaternion.copy(anim.to);
          anim.die.mesh.position.y = 0;
        }
      }

      if (allDone) {
        anims = [];
        resolveRoll?.();
        resolveRoll = null;
      }
    },
  };
}
