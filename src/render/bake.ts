/**
 * Static batching. Props are built from many small primitives — a pagoda is
 * twenty boxes and cones — and every one is a draw call (two, with shadows).
 * `bake` merges the parts of a prop that look the same (same kind of
 * material, same colour, same texture) into one mesh, so a prop costs a few
 * draw calls instead of dozens. It looks identical.
 *
 * Only for things that don't move inside themselves. A part marked
 * `userData.keep` (or `blink`) is left whole — it moves on its own — though
 * its own insides are baked separately, since they only ever move with it.
 * A prop with a `tick` is baked only if it opts in with `userData.bakeable`
 * after marking the parts its tick moves. (A baked prop can still move as a
 * whole — only its insides are fused.)
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function materialKey(m: THREE.Material): string {
  const s = m as THREE.MeshStandardMaterial & THREE.MeshPhysicalMaterial & THREE.MeshBasicMaterial;
  return [
    m.type,
    s.color?.getHexString(),
    s.emissive?.getHexString(),
    s.emissiveIntensity,
    s.roughness,
    s.metalness,
    s.clearcoat,
    s.map?.uuid,
    s.alphaMap?.uuid,
    s.normalMap?.uuid,
    s.flatShading,
    s.vertexColors,
    m.side,
    m.transparent,
    m.opacity,
    m.depthWrite,
  ].join('|');
}

/** True if anything in this subtree animates itself. */
export function animates(root: THREE.Object3D): boolean {
  let found = false;
  root.traverse((o) => {
    if (typeof o.userData.tick === 'function') found = true;
  });
  return found;
}

/** Merge look-alike parts of a static prop. Returns the same object, slimmer. */
export function bake<T extends THREE.Object3D>(root: T): T {
  root.updateMatrixWorld(true);
  const toLocal = root.matrixWorld.clone().invert();
  type Bucket = { material: THREE.Material; parts: THREE.Mesh[]; cast: boolean; receive: boolean };
  const buckets = new Map<string, Bucket>();
  const kept: THREE.Object3D[] = [];
  const visit = (o: THREE.Object3D): void => {
    if (o !== root && (o.userData.keep || o.userData.blink)) {
      // It moves on its own: leave it whole, and bake inside it separately.
      kept.push(o);
      return;
    }
    for (const child of o.children) visit(child);
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || o === root) return;
    if (Array.isArray(mesh.material)) return;
    if ((mesh.material as THREE.ShaderMaterial).isShaderMaterial) return;
    const key = `${materialKey(mesh.material)}|${mesh.castShadow}|${mesh.receiveShadow}|${mesh.renderOrder}`;
    let b = buckets.get(key);
    if (!b) {
      b = { material: mesh.material, parts: [], cast: mesh.castShadow, receive: mesh.receiveShadow };
      buckets.set(key, b);
    }
    b.parts.push(mesh);
  };
  visit(root);
  for (const k of kept) if (!(k as THREE.Mesh).isMesh) bake(k);

  const m = new THREE.Matrix4();
  for (const b of buckets.values()) {
    if (b.parts.length < 2) continue;
    const vertexColors = Boolean((b.material as THREE.MeshStandardMaterial).vertexColors);
    const geos = b.parts.map((part) => {
      m.multiplyMatrices(toLocal, part.matrixWorld);
      const g = (part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone()).applyMatrix4(m);
      // Keep only what every part has, so they can be merged.
      for (const name of Object.keys(g.attributes)) {
        if (name !== 'position' && name !== 'normal' && name !== 'uv' && !(vertexColors && name === 'color')) g.deleteAttribute(name);
      }
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.attributes.position.count) * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      g.clearGroups();
      return g;
    });
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, b.material);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    for (const part of b.parts) part.removeFromParent();
    root.add(mesh);
  }
  // Drop groups left empty by the merge.
  const empties: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o !== root && !(o as THREE.Mesh).isMesh && o.children.length === 0 && o.type === 'Group' && !o.userData.keep) empties.push(o);
  });
  for (const e of empties) e.removeFromParent();
  return root;
}
