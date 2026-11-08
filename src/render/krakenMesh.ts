import * as THREE from 'three';
import type { Kraken } from '../sim/types';

export interface KrakenView {
  group: THREE.Group;
  body: THREE.MeshStandardMaterial;
  tentacles: THREE.Mesh[][];
  rings: THREE.Mesh[];
  fills: THREE.Mesh[];
}

export function createKrakenMesh(): KrakenView {
  const group = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({
    color: '#3c8f78',
    roughness: 0.32,
    metalness: 0.12,
    emissive: '#ffd8b0',
    emissiveIntensity: 0,
  });
  const underside = new THREE.MeshStandardMaterial({ color: '#102820', roughness: 0.55 });
  const mantle = new THREE.Mesh(new THREE.SphereGeometry(3.3, 22, 16), body);
  mantle.scale.set(1.25, 0.72, 1.15);
  mantle.position.y = 0.55;
  group.add(mantle);
  const hump = new THREE.Mesh(new THREE.SphereGeometry(1.7, 16, 12), body);
  hump.scale.set(1.1, 1.25, 0.9);
  hump.position.y = 2.1;
  group.add(hump);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(2.4, 16, 12), underside);
  belly.scale.set(1.1, 0.45, 1);
  belly.position.y = -0.35;
  group.add(belly);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 8), new THREE.MeshStandardMaterial({ color: '#d8c7a4', roughness: 0.4 }));
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.4, 2.6);
  group.add(beak);
  const eyeMat = new THREE.MeshStandardMaterial({ color: '#d6ff4a', emissive: '#d6ff4a', emissiveIntensity: 0.8, roughness: 0.2 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), eyeMat);
    eye.position.set(side * 0.7, 2.35, 1.15);
    group.add(eye);
  }

  const suckerMat = new THREE.MeshStandardMaterial({ color: '#d7b07a', roughness: 0.45 });
  const tentacles: THREE.Mesh[][] = [];
  for (let t = 0; t < 6; t += 1) {
    const segments: THREE.Mesh[] = [];
    for (let i = 0; i < 8; i += 1) {
      const radius = 0.82 - i * 0.07;
      const segment = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.12, radius), 10, 8), body);
      group.add(segment);
      segments.push(segment);
      if (i % 2 === 0) {
        const sucker = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), suckerMat);
        segment.add(sucker);
        sucker.position.y = -radius * 0.8;
      }
    }
    tentacles.push(segments);
  }

  const rings: THREE.Mesh[] = [];
  const fills: THREE.Mesh[] = [];
  for (let i = 0; i < 2; i += 1) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.08, 8, 28),
      new THREE.MeshBasicMaterial({ color: '#ff9a3c', transparent: true, opacity: 0.9, depthWrite: false }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.visible = false;
    const fill = new THREE.Mesh(
      new THREE.CircleGeometry(1, 28),
      new THREE.MeshBasicMaterial({ color: '#ff7a2a', transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }),
    );
    fill.rotation.x = -Math.PI / 2;
    fill.visible = false;
    group.add(ring, fill);
    rings.push(ring);
    fills.push(fill);
  }
  return { group, body, tentacles, rings, fills };
}

export function updateKrakenMesh(view: KrakenView, kraken: Kraken, time: number): void {
  view.group.position.set(kraken.x, -Math.min(4, kraken.sinkT) * 1.8, kraken.z);
  view.group.visible = kraken.sinkT < 4.2;
  const bob = Math.sin(time * 0.8 + kraken.anim) * 0.18;
  view.group.position.y += bob;
  view.body.emissiveIntensity = kraken.hitFlash > 0 ? 0.85 : 0;
  const enraged = kraken.hp < kraken.maxHp * 0.4;
  view.tentacles.forEach((segments, tentacle) => {
    const base = (tentacle / view.tentacles.length) * Math.PI * 2;
    const marker = kraken.markers[tentacle] ?? (tentacle === 0 ? kraken.markers[0] : undefined);
    const reaching = Boolean(marker) && (kraken.phase === 'telegraph' || kraken.phase === 'strike') && tentacle < kraken.markers.length;
    const reach = !reaching ? 0 : kraken.phase === 'strike' ? 1 : 1 - Math.max(0, Math.min(1, kraken.timer / (enraged ? 1.05 : 1.5)));
    segments.forEach((segment, index) => {
      const along = index / Math.max(1, segments.length - 1);
      let x = Math.cos(base + Math.sin(time * 0.9 + index + tentacle) * 0.18) * (2.8 + along * 10.5);
      let z = Math.sin(base + Math.sin(time * 0.7 + tentacle) * 0.2) * (2.8 + along * 10.5);
      let y = 0.6 + Math.sin(along * Math.PI) * (2.6 + Math.sin(time * 1.3 + tentacle) * 0.45);
      if (reaching && marker) {
        const tx = marker.x - kraken.x;
        const tz = marker.z - kraken.z;
        x = x * (1 - along * reach) + tx * along * reach;
        z = z * (1 - along * reach) + tz * along * reach;
        const arc = kraken.phase === 'strike' ? 0.4 : 3.4 * (1 - reach * 0.85);
        y = Math.sin(along * Math.PI) * arc;
      }
      segment.position.set(x, y, z);
      const scale = 1 - along * 0.35;
      segment.scale.setScalar(scale);
    });
  });
  view.rings.forEach((ring, index) => {
    const marker = kraken.markers[index];
    const fill = view.fills[index];
    const visible = Boolean(marker) && (kraken.phase === 'telegraph' || kraken.phase === 'strike');
    ring.visible = visible;
    if (fill) fill.visible = visible;
    if (!marker || !fill) return;
    ring.position.set(marker.x - kraken.x, 0.25 - bob, marker.z - kraken.z);
    fill.position.set(marker.x - kraken.x, 0.18 - bob, marker.z - kraken.z);
    ring.scale.setScalar(marker.radius);
    fill.scale.setScalar(marker.radius);
    const pulse = kraken.phase === 'telegraph' && kraken.timer < 0.45 ? 0.55 + Math.sin(time * 22) * 0.45 : 0.75 + Math.sin(time * 5) * 0.2;
    const ringMat = ring.material;
    const fillMat = fill.material;
    if (!Array.isArray(ringMat)) ringMat.opacity = pulse;
    if (!Array.isArray(fillMat)) fillMat.opacity = 0.16 + pulse * 0.12;
  });
}

export function disposeKraken(view: KrakenView): void {
  view.group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material?.dispose();
  });
}
