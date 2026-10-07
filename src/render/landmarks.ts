/**
 * Extra board furniture: the Maane Chowk shrine the prayer-wheel spinner
 * stands in, the face-down card decks, Dharahara, wayside shrines, mani
 * stones and butter lamps. Each returns a Group standing on y = 0.
 */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { drawSymbol } from './ashtamangala.ts';
import { GOLD, mat, prayerFlags, type Tick } from './props.ts';

function shadowed<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  return o;
}

/** A carved-stone texture band with the eight symbols in relief, for the chowk's plinth. */
function plinthTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#b9ab94';
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(${90 + Math.random() * 60}, ${80 + Math.random() * 50}, 60, 0.08)`;
    g.fillRect(Math.random() * c.width, Math.random() * c.height, 3 + Math.random() * 10, 2 + Math.random() * 4);
  }
  g.strokeStyle = 'rgba(70, 55, 40, 0.5)';
  g.lineWidth = 4;
  g.strokeRect(6, 6, c.width - 12, c.height - 12);
  for (let i = 0; i < 8; i++) {
    drawSymbol(g, i, 64 + i * 128, 64, 40, '#cfc2aa', 'rgba(70, 55, 40, 0.8)');
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** A clay butter lamp with a flickering flame. */
export function butterLamp(phase = 0): THREE.Group {
  const group = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.07, 0.08, 18), GOLD());
  bowl.position.y = 0.16;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.12, 12), GOLD());
  stem.position.y = 0.06;
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.04, 0.13, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3, 0.8) }),
  );
  flame.position.y = 0.27;
  group.add(bowl, stem, flame);
  group.userData.tick = ((_dt: number, t: number) => {
    const f = 1 + Math.sin(t * 13 + phase) * 0.12 + Math.sin(t * 7.3 + phase * 2) * 0.08;
    flame.scale.set(1, f, 1);
  }) satisfies Tick;
  return shadowed(group);
}

/**
 * Maane Chowk: a stepped stone plinth carved with the Ashtamangala, butter
 * lamps on the corners and prayer flags strung between four poles. The
 * spinner stands on top; `userData.home` is the point its base sits on.
 */
export function maaneChowk(): THREE.Group {
  const group = new THREE.Group();
  const stone = mat(0xb5a68e, 0.85);
  const carved = new THREE.MeshStandardMaterial({ map: plinthTexture(), roughness: 0.85 });

  const steps: [number, number][] = [
    [3.6, 0.18],
    [3.0, 0.2],
    [2.4, 0.26],
  ];
  let y = 0;
  steps.forEach(([w, h], i) => {
    const mats = i === 2 ? [carved, carved, stone, stone, carved, carved] : stone;
    const step = new THREE.Mesh(new RoundedBoxGeometry(w, h, w, 2, 0.03), mats);
    step.position.y = y + h / 2;
    group.add(step);
    y += h;
  });
  // A brass lotus ring the wheel stands in.
  const lotus = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const petal = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), GOLD());
    petal.scale.set(0.5, 0.25, 1);
    const a = (i / 16) * Math.PI * 2;
    petal.position.set(Math.cos(a) * 0.82, y + 0.05, Math.sin(a) * 0.82);
    petal.rotation.y = -a + Math.PI / 2;
    petal.rotation.x = -0.4;
    lotus.add(petal);
  }
  group.add(lotus);

  const half = 1.62;
  const corners: THREE.Vector3[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 2.6, 10), mat(0x7a4a22, 0.6));
      pole.position.set(sx * half, 1.3, sz * half);
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), GOLD());
      top.position.set(sx * half, 2.63, sz * half);
      group.add(pole, top);
      corners.push(new THREE.Vector3(sx * half, 2.5, sz * half));
      const lamp = butterLamp(sx * 2 + sz);
      lamp.position.set(sx * 1.25, 0.38, sz * 1.25);
      group.add(lamp);
    }
  }
  // Flags round the square (not across it, so the wheel stays in view).
  const order = [0, 1, 3, 2, 0];
  for (let i = 0; i < 4; i++) {
    group.add(prayerFlags(corners[order[i]], corners[order[i + 1]], 0.35, 10, 0.8));
  }

  group.userData.home = new THREE.Vector3(0, y, 0);
  return shadowed(group);
}

/** Card-back art for a deck: section colour, white border, the letter and name. */
function cardBack(letter: string, name: string, colour: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 360;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fbf6e9';
  g.beginPath();
  g.roundRect(0, 0, 256, 360, 22);
  g.fill();
  g.fillStyle = colour;
  g.beginPath();
  g.roundRect(14, 14, 228, 332, 14);
  g.fill();
  // A lattice like Newar window carving.
  g.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  g.lineWidth = 3;
  for (let k = -360; k < 360; k += 24) {
    g.beginPath();
    g.moveTo(14 + k, 14);
    g.lineTo(14 + k + 332, 346);
    g.moveTo(242 - k, 14);
    g.lineTo(242 - k - 332, 346);
    g.stroke();
  }
  g.fillStyle = 'rgba(0, 0, 0, 0.18)';
  g.beginPath();
  g.arc(128, 150, 78, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#f2d27a';
  g.lineWidth = 6;
  g.stroke();
  g.fillStyle = '#fff6dc';
  g.font = 'bold 110px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(letter, 128, 156);
  g.font = 'bold 26px "Trebuchet MS", Arial, sans-serif';
  g.fillText(name.toUpperCase(), 128, 282, 210);
  g.font = '18px Georgia, serif';
  g.fillStyle = 'rgba(255, 246, 220, 0.8)';
  g.fillText('TRAVEL NEPAL', 128, 316);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/**
 * A face-down deck: a slightly untidy stack of cards. Camera-facing art is
 * drawn upright for a viewer looking north.
 */
export function cardDeck(letter: string, name: string, colour: string, count = 14): THREE.Group {
  const group = new THREE.Group();
  const W = 1.05;
  const D = 1.48;
  const T = 0.022;
  const edge = mat(0xf4ecd8, 0.9);
  const back = new THREE.MeshStandardMaterial({ map: cardBack(letter, name, colour), roughness: 0.55 });
  const rnd = mulberry(letter.charCodeAt(0) + name.length);
  for (let i = 0; i < count; i++) {
    const top = i === count - 1;
    const card = new THREE.Mesh(new THREE.BoxGeometry(W, T, D), top ? [edge, edge, back, edge, edge, edge] : edge);
    card.position.set((rnd() - 0.5) * 0.04, T / 2 + i * T, (rnd() - 0.5) * 0.04);
    card.rotation.y = (rnd() - 0.5) * 0.05 + (top ? Math.PI : 0);
    group.add(card);
  }
  return shadowed(group);
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Dharahara — Kathmandu's white watch tower, rebuilt after 2015. */
export function dharahara(scale = 1): THREE.Group {
  const group = new THREE.Group();
  const white = mat(0xf6f2ea, 0.6);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 0.3, 16), mat(0xc9b9a0, 0.8));
  base.position.y = 0.15;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.42, 3.2, 16), white);
  shaft.position.y = 1.9;
  // Window slits up the shaft.
  for (let i = 0; i < 5; i++) {
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + i * 0.4;
      const r = 0.42 - (i + 0.5) * 0.04;
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.02), mat(0x3a3530, 0.5));
      w.position.set(Math.cos(a) * r, 0.7 + i * 0.55, Math.sin(a) * r);
      w.rotation.y = -a + Math.PI / 2;
      group.add(w);
    }
  }
  const balcony = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.14, 20), white);
  balcony.position.y = 3.5;
  const rail = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.02, 6, 28), mat(0x8a6a3a, 0.5, 0.4));
  rail.rotation.x = Math.PI / 2;
  rail.position.y = 3.66;
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.4, 16), white);
  lantern.position.y = 3.78;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.23, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), GOLD());
  dome.position.y = 3.98;
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.5, 12), GOLD());
  spire.position.y = 4.42;
  group.add(base, shaft, balcony, rail, lantern, dome, spire);
  group.scale.setScalar(scale);
  return shadowed(group);
}

/** A little roadside Ganesh shrine: red-washed niche, tiered roof, a bell. */
export function wayShrine(scale = 1): THREE.Group {
  const group = new THREE.Group();
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.5), mat(0xa89a84, 0.85));
  plinth.position.y = 0.09;
  const niche = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.4, 0.36), mat(0xb8382c, 0.7));
  niche.position.y = 0.38;
  const idol = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 10), mat(0xe86a1a, 0.5));
  idol.position.set(0, 0.36, -0.17);
  const roof1 = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.18, 4), mat(0x4a3a30, 0.7));
  roof1.rotation.y = Math.PI / 4;
  roof1.position.y = 0.67;
  const roof2 = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.14, 4), mat(0x4a3a30, 0.7));
  roof2.rotation.y = Math.PI / 4;
  roof2.position.y = 0.8;
  const finial = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 8), GOLD());
  finial.position.y = 0.92;
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), GOLD());
  bell.position.set(0.2, 0.5, -0.2);
  group.add(plinth, niche, idol, roof1, roof2, finial, bell);
  group.scale.setScalar(scale);
  return shadowed(group);
}

/** A pile of carved mani stones. */
export function maniStones(seed = 1): THREE.Group {
  const group = new THREE.Group();
  const rnd = mulberry(seed * 97);
  const greys = [0xd8d2c6, 0xb9b2a6, 0x9a948a, 0xe6e0d4];
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12 + rnd() * 0.08, 0), mat(greys[i % 4], 0.9, 0, true));
    s.scale.set(1.3, 0.45, 1);
    s.position.set((rnd() - 0.5) * 0.5, 0.05 + Math.floor(i / 4) * 0.08, (rnd() - 0.5) * 0.35);
    s.rotation.y = rnd() * 6;
    group.add(s);
  }
  // A painted stone on top, with the mantra's first syllable.
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.06, 14), mat(0xf2ecdf, 0.8));
  top.position.y = 0.26;
  group.add(top);
  return shadowed(group);
}
