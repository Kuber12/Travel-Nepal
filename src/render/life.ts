/**
 * Things that move on their own: a flock of birds wheeling over the valley,
 * a mountain-flight airliner circling the range, paragliders riding the
 * thermals above Phewa Lake, and smoke from village chimneys.
 */

import * as THREE from 'three';
import { jet, mat, type Tick } from './props.ts';
import { seeded } from './noise.ts';

// --- birds -------------------------------------------------------------------

function bird(): { group: THREE.Group; left: THREE.Mesh; right: THREE.Mesh } {
  const group = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0.55, 0.12);
  shape.lineTo(0.5, -0.12);
  shape.lineTo(0, -0.18);
  const wingGeo = new THREE.ShapeGeometry(shape);
  wingGeo.rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({ color: 0x2c2a2e, side: THREE.DoubleSide, roughness: 0.9 });
  const right = new THREE.Mesh(wingGeo, material);
  const left = new THREE.Mesh(wingGeo, material);
  left.scale.x = -1;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.25, 3, 6), material);
  body.rotation.x = Math.PI / 2;
  group.add(left, right, body);
  group.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return { group, left, right };
}

export function flock(centre: THREE.Vector3, radius: number, count = 9): { group: THREE.Group; tick: Tick } {
  const group = new THREE.Group();
  const rnd = seeded(2024);
  const birds = Array.from({ length: count }, (_, i) => {
    const b = bird();
    b.group.scale.setScalar(0.9 + rnd() * 0.4);
    group.add(b.group);
    return {
      ...b,
      lag: i * 0.06 + rnd() * 0.05,
      dr: (rnd() - 0.5) * 3,
      dy: (rnd() - 0.5) * 1.5,
      flap: rnd() * 6,
    };
  });
  const p = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const path = (t: number, out: THREE.Vector3, dr: number, dy: number): THREE.Vector3 =>
    out.set(
      centre.x + Math.cos(t) * (radius + dr) + Math.sin(t * 2.3) * 3,
      centre.y + dy + Math.sin(t * 1.7) * 1.4,
      centre.z + Math.sin(t) * (radius * 0.7 + dr),
    );

  return {
    group,
    tick(_dt, t) {
      const base = t * 0.12;
      for (const b of birds) {
        const s = base - b.lag;
        path(s, p, b.dr, b.dy);
        path(s + 0.01, ahead, b.dr, b.dy);
        b.group.position.copy(p);
        b.group.lookAt(ahead);
        const f = Math.sin(t * 9 + b.flap) * 0.6;
        b.right.rotation.z = f;
        b.left.rotation.z = -f;
      }
    },
  };
}

// --- the mountain flight -------------------------------------------------------

export function circlingPlane(centre: THREE.Vector3, radius: number): { group: THREE.Group; tick: Tick } {
  const group = new THREE.Group();
  const plane = jet(1.1);
  plane.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  // Nose along +x; wrap it so lookAt (which aims +z) works.
  plane.rotation.y = -Math.PI / 2;
  const holder = new THREE.Group();
  holder.add(plane);
  group.add(holder);

  const p = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  return {
    group,
    tick(_dt, t) {
      const s = t * 0.05 + 1.2;
      const at = (u: number, out: THREE.Vector3): THREE.Vector3 =>
        out.set(centre.x + Math.cos(u) * radius, centre.y + Math.sin(u * 2) * 2, centre.z + Math.sin(u) * radius * 0.55);
      at(s, p);
      at(s + 0.01, ahead);
      holder.position.copy(p);
      holder.lookAt(ahead);
      holder.rotateZ(-0.22); // bank into the turn
    },
  };
}

// --- paragliders over Phewa ----------------------------------------------------

function paraglider(color: number, accent: number): THREE.Group {
  const group = new THREE.Group();
  const canopy = new THREE.Mesh(
    new THREE.CylinderGeometry(1.0, 1.0, 0.55, 14, 1, true, -Math.PI * 0.42, Math.PI * 0.84),
    new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.6 }),
  );
  canopy.rotation.x = Math.PI / 2;
  canopy.rotation.z = Math.PI / 2;
  canopy.position.y = 0.2;
  const stripe = new THREE.Mesh(
    new THREE.CylinderGeometry(1.005, 1.005, 0.14, 14, 1, true, -Math.PI * 0.42, Math.PI * 0.84),
    new THREE.MeshStandardMaterial({ color: accent, side: THREE.DoubleSide, roughness: 0.6 }),
  );
  stripe.rotation.copy(canopy.rotation);
  stripe.position.copy(canopy.position);
  const pilot = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.16, 3, 6), mat(0x333344, 0.8));
  pilot.position.y = -0.9;
  const lineMat = new THREE.LineBasicMaterial({ color: 0x444444, transparent: true, opacity: 0.6 });
  const pts: THREE.Vector3[] = [];
  for (const z of [-0.85, -0.3, 0.3, 0.85]) {
    pts.push(new THREE.Vector3(0, -0.85, 0), new THREE.Vector3(0, 0.95 - Math.abs(z) * 0.4, z));
  }
  const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lineMat);
  group.add(canopy, stripe, pilot, lines);
  group.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  group.scale.setScalar(0.7);
  return group;
}

export function paragliders(centre: THREE.Vector3): { group: THREE.Group; tick: Tick } {
  const group = new THREE.Group();
  const colours: [number, number][] = [
    [0xe8452c, 0xf2c230],
    [0x2b8fd8, 0xffffff],
    [0x8a3fc4, 0xf28a3c],
  ];
  const gliders = colours.map(([c, a], i) => {
    const g = paraglider(c, a);
    const holder = new THREE.Group();
    holder.add(g);
    group.add(holder);
    return { holder, phase: (i / colours.length) * Math.PI * 2, r: 3.2 + i * 1.3, h: 7 + i * 1.4 };
  });
  const p = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  return {
    group,
    tick(_dt, t) {
      for (const g of gliders) {
        const at = (u: number, out: THREE.Vector3): THREE.Vector3 =>
          out.set(centre.x + Math.cos(u) * g.r, centre.y + g.h + Math.sin(u * 3) * 0.5, centre.z + Math.sin(u) * g.r * 0.8);
        const s = t * 0.22 + g.phase;
        at(s, p);
        at(s + 0.02, ahead);
        g.holder.position.copy(p);
        g.holder.lookAt(ahead);
        g.holder.rotateZ(0.25);
      }
    },
  };
}

// --- chimney smoke -----------------------------------------------------------

const smokeMat = new THREE.MeshStandardMaterial({
  color: 0xe8e4de,
  transparent: true,
  opacity: 0.6,
  roughness: 1,
  depthWrite: false,
});
const smokeGeo = new THREE.IcosahedronGeometry(0.16, 0);

export function smoke(at: THREE.Vector3, seed = 1): { group: THREE.Group; tick: Tick } {
  const group = new THREE.Group();
  group.position.copy(at);
  const rnd = seeded(seed);
  const PUFFS = 6;
  const puffs = Array.from({ length: PUFFS }, (_, i) => {
    const m = new THREE.Mesh(smokeGeo, smokeMat.clone());
    group.add(m);
    return { m, offset: i / PUFFS, drift: rnd() * 0.3 };
  });
  return {
    group,
    tick(_dt, t) {
      for (const p of puffs) {
        const life = (t * 0.25 + p.offset) % 1;
        p.m.position.set(life * (0.7 + p.drift), life * 2.2, Math.sin(life * 6 + p.drift * 10) * 0.12);
        p.m.scale.setScalar(0.6 + life * 2.2);
        (p.m.material as THREE.MeshStandardMaterial).opacity = 0.55 * (1 - life) * Math.min(life * 6, 1);
      }
    },
  };
}
