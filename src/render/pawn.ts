/**
 * Traveler pawns — the four standees from the box, as tapered 3D wedges — and
 * the hop animation that walks one along a path of board nodes.
 */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { HatStyle, Player } from '../engine/types.ts';
import { bake } from './bake.ts';
import type { BoardView } from './board3d.ts';

/** Seconds per node hop. */
const HOP_TIME = 0.22;
const HOP_HEIGHT = 0.9;

export type PawnView = {
  group: THREE.Group;
  /** Snap a pawn to a node with no animation. */
  place(playerId: number, nodeId: string): void;
  /**
   * Hop a pawn along `path`. Resolves once it lands on the final node.
   * Several pawns on one tile are fanned out so none is hidden.
   */
  move(playerId: number, path: string[]): Promise<void>;
  setActive(playerId: number): void;
  update(dt: number): void;
};

/** A woven Dhaka topi band: diamonds in the traveler's colour on a dark ground. */
function dhakaTexture(color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2a1a22';
  g.fillRect(0, 0, 256, 64);
  const inks = [color, '#f4ead2', '#d9a327', '#c8342f'];
  for (let row = 0; row < 4; row++) {
    for (let k = 0; k < 16; k++) {
      const x = k * 16 + (row % 2) * 8;
      const y = row * 16 + 8;
      g.fillStyle = inks[(k + row) % inks.length];
      g.beginPath();
      g.moveTo(x, y - 6);
      g.lineTo(x + 6, y);
      g.lineTo(x, y + 6);
      g.lineTo(x - 6, y);
      g.closePath();
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** The hat on a pawn's head, centred on the crown of the head at y = 0. */
function buildHat(style: HatStyle, base: THREE.Color, colorHex: string): THREE.Group {
  const hat = new THREE.Group();
  const felt = new THREE.MeshStandardMaterial({ color: base, roughness: 0.75 });
  const dark = new THREE.MeshStandardMaterial({ color: base.clone().multiplyScalar(0.5), roughness: 0.8 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xd9a84a, roughness: 0.3, metalness: 0.9 });
  switch (style) {
    case 'sunhat': {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.35, 0.03, 32), dark);
      brim.position.y = -0.04;
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.19, 0.16, 24), dark);
      crown.position.y = 0.05;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.192, 0.192, 0.045, 24), brass);
      band.position.y = 0.0;
      hat.add(brim, crown, band);
      break;
    }
    case 'topi': {
      // A Dhaka topi: a woven cap, taller on one side than the other.
      const geo = new THREE.CylinderGeometry(0.17, 0.205, 0.2, 28, 1, false);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) > 0) pos.setY(i, pos.getY(i) + pos.getX(i) * 0.28);
      }
      geo.computeVertexNormals();
      const weave = new THREE.MeshStandardMaterial({ map: dhakaTexture(colorHex), roughness: 0.85 });
      const cap = new THREE.Mesh(geo, [weave, dark, dark]);
      cap.position.y = 0.05;
      hat.add(cap);
      break;
    }
    case 'cap': {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.205, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), felt);
      dome.position.y = -0.04;
      dome.scale.y = 0.85;
      const bill = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.025, 24, 1, false, -Math.PI / 2, Math.PI), dark);
      bill.position.set(0, -0.035, 0.12);
      bill.scale.set(1, 1, 0.9);
      const button = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), dark);
      button.position.y = 0.135;
      hat.add(dome, bill, button);
      break;
    }
    case 'beanie': {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.205, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), felt);
      dome.position.y = -0.03;
      dome.scale.y = 1.12;
      const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.212, 0.212, 0.075, 24), dark);
      rib.position.y = -0.02;
      const pompom = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.075, 2),
        new THREE.MeshStandardMaterial({ color: 0xfff3d0, roughness: 1 }),
      );
      pompom.position.y = 0.23;
      hat.add(dome, rib, pompom);
      break;
    }
  }
  return hat;
}

/**
 * A little traveler on a game-piece base: boots, trousers, a jacket in the
 * player's colour, a white khata scarf, a backpack with a bedroll, a trekking
 * pole, a friendly face and the hat they picked at the start.
 */
function buildPawn(color: string, style: HatStyle = 'sunhat'): THREE.Group {
  const group = new THREE.Group();
  const base = new THREE.Color(color);
  const jacket = new THREE.MeshStandardMaterial({ color: base, roughness: 0.55, metalness: 0.02 });
  const enamel = new THREE.MeshPhysicalMaterial({ color: base, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15 });
  const dark = new THREE.MeshStandardMaterial({ color: base.clone().multiplyScalar(0.45), roughness: 0.7 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe8c39e, roughness: 0.62 });
  const trousers = new THREE.MeshStandardMaterial({ color: 0x4a4636, roughness: 0.85 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x5a3820, roughness: 0.6 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xd9a84a, roughness: 0.3, metalness: 0.9 });
  const khata = new THREE.MeshStandardMaterial({ color: 0xfbf5e6, roughness: 0.9, side: THREE.DoubleSide });
  const ink = new THREE.MeshStandardMaterial({ color: 0x1e1712, roughness: 0.35 });

  // The game-piece base: lacquered in the player's colour, with a brass rim.
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.47, 0.13, 36), enamel);
  disc.position.y = 0.065;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.445, 0.03, 10, 40), brass);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.13;
  const inlay = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.012, 6, 36), brass);
  inlay.rotation.x = Math.PI / 2;
  inlay.position.y = 0.132;

  const figure = new THREE.Group();
  figure.name = 'figure';
  figure.position.y = 0.13;

  for (const x of [-0.1, 0.1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.072, 0.26, 4, 10), trousers);
    leg.position.set(x, 0.24, 0);
    const boot = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.1, 4, 10), leather);
    boot.rotation.x = Math.PI / 2;
    boot.position.set(x, 0.07, 0.04);
    figure.add(leg, boot);
  }

  // A jacket shaped on a lathe: a flared hem, a waist, rounded shoulders.
  const profile = [
    [0.0, 0.36], [0.215, 0.36], [0.225, 0.42], [0.2, 0.55], [0.205, 0.7], [0.19, 0.8], [0.12, 0.86], [0.0, 0.87],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const torso = new THREE.Mesh(new THREE.LatheGeometry(profile, 28), jacket);
  torso.scale.z = 0.82;
  const zip = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.42, 0.01), brass);
  zip.position.set(0, 0.6, 0.178);

  // The white khata scarf of welcome, looped and hanging down the front.
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.035, 8, 24), khata);
  loop.rotation.x = Math.PI / 2;
  loop.position.y = 0.85;
  loop.scale.z = 0.85;
  for (const x of [-0.05, 0.06]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.3, 0.012), khata);
    tail.position.set(x, 0.7, 0.19);
    tail.rotation.set(-0.12, 0, x * 1.5);
    figure.add(tail);
  }

  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.058, 0.28, 4, 10), jacket);
    arm.position.set(side * 0.25, 0.62, 0.02);
    arm.rotation.z = side * 0.2;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.058, 12, 10), skin);
    hand.position.set(side * 0.29, 0.43, 0.04);
    figure.add(arm, hand);
  }

  // A trekking pole in the right hand.
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.82, 8), new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.3, metalness: 0.8 }));
  pole.position.set(0.31, 0.36, 0.1);
  pole.rotation.x = 0.12;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.1, 8), dark);
  grip.position.set(0.31, 0.72, 0.145);
  grip.rotation.x = 0.12;
  figure.add(pole, grip);

  // A big friendly head.
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 28, 20), skin);
  head.position.y = 1.07;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.205, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), ink);
  hair.position.y = 1.08;
  hair.rotation.x = -0.5;
  for (const x of [-0.072, 0.072]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10), ink);
    eye.position.set(x, 1.085, 0.178);
    eye.scale.z = 0.6;
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    glint.position.set(x + 0.008, 1.095, 0.194);
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 8), new THREE.MeshStandardMaterial({ color: 0xec9a8a, roughness: 0.8, transparent: true, opacity: 0.75 }));
    cheek.position.set(x * 1.45, 1.035, 0.16);
    cheek.scale.set(1, 0.6, 0.4);
    figure.add(eye, glint, cheek);
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 6, 14, Math.PI), ink);
  smile.position.set(0, 1.025, 0.19);
  smile.rotation.z = Math.PI;

  const hat = buildHat(style, base, color);
  hat.position.y = 1.2;

  // Backpack with a rolled sleeping mat on top — tells front from back.
  const pack = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.42, 0.2, 2, 0.05), dark);
  pack.position.set(0, 0.66, -0.22);
  const pocket = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.14, 0.06, 2, 0.02), jacket);
  pocket.position.set(0, 0.56, -0.33);
  const roll = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.075, 0.42, 16),
    new THREE.MeshStandardMaterial({ color: 0xe8b53c, roughness: 0.7 }),
  );
  roll.rotation.z = Math.PI / 2;
  roll.position.set(0, 0.93, -0.22);

  figure.add(torso, zip, loop, head, hair, smile, hat, pack, pocket, roll);
  group.add(disc, rim, inlay, figure);
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  // Fuse the figure's look-alike parts; it stays its own group so it can squash and stretch.
  bake(figure);
  return group;
}

/** A floating name plate over a pawn, always the same size on screen. */
function nameTag(name: string, color: string): { sprite: THREE.Sprite; setActive(on: boolean): void } {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 112;
  const g = c.getContext('2d')!;
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const draw = (active: boolean): void => {
    g.clearRect(0, 0, c.width, c.height);
    g.font = 'bold 50px "Avenir Next", "Segoe UI", system-ui, sans-serif';
    const w = Math.min(500, g.measureText(name).width + 110);
    const x0 = (c.width - w) / 2;
    g.fillStyle = active ? 'rgba(255, 248, 228, 0.97)' : 'rgba(253, 248, 236, 0.86)';
    g.strokeStyle = active ? '#e2b23a' : 'rgba(90, 60, 30, 0.35)';
    g.lineWidth = active ? 9 : 4;
    g.beginPath();
    g.roundRect(x0, 10, w, 92, 46);
    g.fill();
    g.stroke();
    g.fillStyle = color;
    g.beginPath();
    g.arc(x0 + 46, 56, 18, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2a1f16';
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillText(name, x0 + 78, 58, w - 96);
    texture.needsUpdate = true;
  };
  draw(false);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, sizeAttenuation: false }),
  );
  sprite.renderOrder = 20;
  sprite.center.set(0.5, 0);
  let shown: boolean | null = null;
  return {
    sprite,
    setActive(on) {
      if (shown === on) return;
      shown = on;
      draw(on);
      sprite.scale.set(on ? 0.15 : 0.12, on ? 0.033 : 0.026, 1);
    },
  };
}

/** Dust kicked up when a pawn lands. */
const dustGeo = new THREE.IcosahedronGeometry(0.09, 0);
type Puff = { mesh: THREE.Mesh; vel: THREE.Vector3; life: number };

/** Spread pawns sharing a tile around a small circle. */
function fanOffset(index: number, total: number): THREE.Vector3 {
  if (total <= 1) return new THREE.Vector3();
  const angle = (index / total) * Math.PI * 2;
  const radius = 0.46;
  return new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
}

export function buildPawns(players: Player[], board: BoardView): PawnView {
  const group = new THREE.Group();
  const meshes = new Map<number, THREE.Group>();
  /** Where each pawn currently stands, used to fan out shared tiles. */
  const standingOn = new Map<number, string>();

  const tags = new Map<number, ReturnType<typeof nameTag>>();
  for (const player of players) {
    const pawn = buildPawn(player.color, player.hat);
    group.add(pawn);
    meshes.set(player.id, pawn);
    const tag = nameTag(player.name, player.color);
    tag.setActive(false);
    group.add(tag.sprite);
    tags.set(player.id, tag);
  }
  /** Name tags stack upward (in screen space) when travelers share a tile, so none hides another. */
  const tagLift = new Map<number, number>();

  let activeId = players[0]?.id ?? 0;
  let bob = 0;

  // The whose-turn-is-it marker: a spinning gem over the head, a glowing ring underfoot.
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.2, 0),
    new THREE.MeshStandardMaterial({ color: 0xffd36b, emissive: 0xffb020, emissiveIntensity: 2.2, roughness: 0.2, metalness: 0.4 }),
  );
  gem.scale.y = 1.5;
  const glow = new THREE.Mesh(
    new THREE.RingGeometry(0.52, 0.7, 40),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3.6, 1.2), transparent: true, opacity: 0.8, depthWrite: false }),
  );
  glow.rotation.x = -Math.PI / 2;
  group.add(gem, glow);

  const puffs: Puff[] = [];
  const dustMat = new THREE.MeshStandardMaterial({ color: 0xe9dcc0, roughness: 1, transparent: true, depthWrite: false });
  function kickDust(at: THREE.Vector3): void {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + Math.random();
      const mesh = new THREE.Mesh(dustGeo, dustMat.clone());
      mesh.position.copy(at).add(new THREE.Vector3(Math.cos(a) * 0.25, 0.05, Math.sin(a) * 0.25));
      group.add(mesh);
      puffs.push({ mesh, vel: new THREE.Vector3(Math.cos(a) * 1.2, 0.8 + Math.random() * 0.5, Math.sin(a) * 1.2), life: 0 });
    }
  }

  /** Pawns mid-hop; their Y is owned by the tween, not by the idle bob. */
  const moving = new Set<number>();

  /** Re-fan every pawn so co-located travelers stay visible. */
  function restack(): void {
    const byNode = new Map<string, number[]>();
    for (const [id, nodeId] of standingOn) {
      const list = byNode.get(nodeId) ?? [];
      list.push(id);
      byNode.set(nodeId, list);
    }
    for (const [nodeId, ids] of byNode) {
      ids.sort((a, b) => a - b);
      const base = board.standPos(nodeId);
      ids.forEach((id, i) => {
        tagLift.set(id, i);
        const mesh = meshes.get(id);
        if (!mesh || moving.has(id)) return;
        mesh.position.copy(base).add(fanOffset(i, ids.length));
      });
    }
  }

  type Tween = {
    playerId: number;
    from: THREE.Vector3;
    to: THREE.Vector3;
    elapsed: number;
    resolve: () => void;
  };
  let tweens: Tween[] = [];

  function hop(playerId: number, toNodeId: string): Promise<void> {
    const mesh = meshes.get(playerId);
    if (!mesh) return Promise.resolve();
    return new Promise((resolve) => {
      tweens.push({
        playerId,
        from: mesh.position.clone(),
        to: board.standPos(toNodeId),
        elapsed: 0,
        resolve,
      });
    });
  }

  return {
    group,

    place(playerId, nodeId) {
      standingOn.set(playerId, nodeId);
      const mesh = meshes.get(playerId);
      if (mesh) {
        mesh.position.copy(board.standPos(nodeId));
        mesh.rotation.y = Math.PI; // face the players at the table
      }
      restack();
    },

    async move(playerId, path) {
      if (path.length === 0) return;
      moving.add(playerId);
      for (const nodeId of path) {
        await hop(playerId, nodeId);
        standingOn.set(playerId, nodeId);
      }
      moving.delete(playerId);
      restack();
    },

    setActive(playerId) {
      activeId = playerId;
    },

    update(dt) {
      bob += dt * 2.5;

      // Dust settles.
      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i];
        p.life += dt / 0.55;
        p.vel.y -= dt * 2.2;
        p.mesh.position.addScaledVector(p.vel, dt);
        p.mesh.scale.setScalar(1 + p.life * 2.2);
        (p.mesh.material as THREE.MeshStandardMaterial).opacity = Math.max(0, 0.75 * (1 - p.life));
        if (p.life >= 1) {
          group.remove(p.mesh);
          (p.mesh.material as THREE.Material).dispose();
          puffs.splice(i, 1);
        }
      }

      // Name tags ride above every head.
      for (const [id, mesh] of meshes) {
        const tag = tags.get(id);
        if (!tag) continue;
        tag.setActive(id === activeId);
        tag.sprite.position.set(mesh.position.x, mesh.position.y + 1.9, mesh.position.z);
        // Tags are a fixed size on screen, so stack them by their own height, not in world units.
        tag.sprite.center.set(0.5, -(tagLift.get(id) ?? 0) * 1.12);
      }

      // Follow the active traveler with the gem and the ring.
      const active = meshes.get(activeId);
      if (active) {
        gem.position.set(active.position.x, active.position.y + 2.75 + Math.sin(bob * 1.2) * 0.12, active.position.z);
        gem.rotation.y += dt * 2.4;
        const standing = standingOn.get(activeId);
        const floor = standing ? board.standPos(standing).y : active.position.y;
        glow.position.set(active.position.x, floor + 0.03, active.position.z);
        glow.scale.setScalar(1 + Math.sin(bob * 1.6) * 0.08);
        glow.visible = !moving.has(activeId);
      }

      // Gentle idle bob on the traveler whose turn it is.
      for (const [id, mesh] of meshes) {
        mesh.scale.setScalar(id === activeId ? 1.22 : 1.12);

        const nodeId = standingOn.get(id);
        if (moving.has(id) || !nodeId) continue; // the tween owns Y while hopping

        const lift = id === activeId ? Math.sin(bob) * 0.06 + 0.06 : 0;
        mesh.position.y = board.standPos(nodeId).y + lift;
      }

      if (tweens.length === 0) return;

      const done: Tween[] = [];
      for (const tween of tweens) {
        tween.elapsed += dt;
        const t = Math.min(tween.elapsed / HOP_TIME, 1);
        const mesh = meshes.get(tween.playerId);
        if (mesh) {
          mesh.position.lerpVectors(tween.from, tween.to, t);
          // A parabola over the gap — the pawn hops rather than slides.
          mesh.position.y += Math.sin(t * Math.PI) * HOP_HEIGHT;
          // Stretch in the air, squash on take-off and landing.
          const figure = mesh.getObjectByName('figure');
          if (figure) {
            const stretch = 1 + Math.sin(t * Math.PI) * 0.12 - (t > 0.85 ? (t - 0.85) * 1.2 : 0);
            figure.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));
          }
          if (t < 1) {
            mesh.rotation.y = Math.atan2(
              tween.to.x - tween.from.x,
              tween.to.z - tween.from.z,
            );
          }
        }
        if (t >= 1) done.push(tween);
      }

      if (done.length > 0) {
        tweens = tweens.filter((t) => !done.includes(t));
        for (const tween of done) {
          meshes.get(tween.playerId)?.getObjectByName('figure')?.scale.set(1, 1, 1);
          kickDust(tween.to);
          tween.resolve();
        }
      }
    },
  };
}
