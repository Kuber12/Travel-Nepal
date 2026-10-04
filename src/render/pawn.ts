/**
 * Traveler pawns — the four standees from the box, as tapered 3D wedges — and
 * the hop animation that walks one along a path of board nodes.
 */

import * as THREE from 'three';
import type { Player } from '../engine/types.ts';
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

/**
 * A little traveler on a game-piece base: boots, trousers, a jacket in the
 * player's colour, a backpack with a bedroll, and a sun hat.
 */
function buildPawn(color: string): THREE.Group {
  const group = new THREE.Group();
  const base = new THREE.Color(color);
  const jacket = new THREE.MeshStandardMaterial({ color: base, roughness: 0.5, metalness: 0.05 });
  const dark = new THREE.MeshStandardMaterial({ color: base.clone().multiplyScalar(0.45), roughness: 0.7 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe8c39e, roughness: 0.6 });
  const trousers = new THREE.MeshStandardMaterial({ color: 0x3b3f4a, roughness: 0.8 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xd9a84a, roughness: 0.3, metalness: 0.9 });

  // The game-piece base, in the player's colour with a brass rim.
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.12, 28), jacket);
  disc.position.y = 0.06;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.03, 8, 28), brass);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.12;

  const figure = new THREE.Group();
  figure.name = 'figure';
  figure.position.y = 0.12;

  for (const x of [-0.11, 0.11]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.32, 4, 8), trousers);
    leg.position.set(x, 0.24, 0);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.2), dark);
    boot.position.set(x, 0.04, 0.03);
    figure.add(leg, boot);
  }

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.3, 6, 14), jacket);
  torso.position.y = 0.66;
  torso.scale.z = 0.8;
  for (const x of [-0.26, 0.26]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.3, 4, 8), jacket);
    arm.position.set(x, 0.62, 0.02);
    arm.rotation.z = x > 0 ? 0.18 : -0.18;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), skin);
    hand.position.set(x * 1.12, 0.42, 0.03);
    figure.add(arm, hand);
  }

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 14), skin);
  head.position.y = 1.03;

  // A wide-brimmed sun hat.
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.025, 24), dark);
  brim.position.y = 1.13;
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 0.12, 18), dark);
  crown.position.y = 1.2;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.162, 0.162, 0.04, 18), brass);
  band.position.y = 1.15;

  // Backpack with a rolled sleeping mat on top — tells front from back.
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.2), dark);
  pack.position.set(0, 0.68, -0.22);
  const roll = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 0.42, 12),
    new THREE.MeshStandardMaterial({ color: 0xe8b53c, roughness: 0.7 }),
  );
  roll.rotation.z = Math.PI / 2;
  roll.position.set(0, 0.95, -0.22);

  figure.add(torso, head, brim, crown, band, pack, roll);
  group.add(disc, rim, figure);
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  // Big enough to read from the default camera.
  group.scale.setScalar(1.15);
  return group;
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

  for (const player of players) {
    const pawn = buildPawn(player.color);
    group.add(pawn);
    meshes.set(player.id, pawn);
  }

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

      // Follow the active traveler with the gem and the ring.
      const active = meshes.get(activeId);
      if (active) {
        gem.position.set(active.position.x, active.position.y + 2.05 + Math.sin(bob * 1.2) * 0.12, active.position.z);
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
