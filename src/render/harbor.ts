import * as THREE from 'three';
import type { Harbor } from '../sim/types';

export interface HarborView {
  group: THREE.Group;
  flag: THREE.Mesh;
  id: Harbor['id'];
}

export function createHarborMesh(harbor: Harbor): HarborView {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#6a4a32', roughness: 0.86 });
  const stone = new THREE.MeshStandardMaterial({ color: harbor.team === 'friendly' ? '#c4a36a' : '#6d7f90', roughness: 0.8 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(harbor.core * 0.72, harbor.core * 0.9, 1.3, 7), stone);
  base.position.y = 0.55;
  group.add(base);
  const house = new THREE.Mesh(new THREE.BoxGeometry(harbor.core * 0.7, 1.6, harbor.core * 0.55), wood);
  house.position.y = 1.7;
  group.add(house);
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(harbor.core * 0.5, 1.1, 4),
    new THREE.MeshStandardMaterial({ color: harbor.team === 'friendly' ? '#e2c27a' : '#1d4e89', roughness: 0.7 }),
  );
  roof.position.y = 2.9;
  roof.rotation.y = Math.PI / 4;
  group.add(roof);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.4, 5), wood);
  pole.position.set(0, 3.4, 0);
  group.add(pole);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 0.62),
    new THREE.MeshStandardMaterial({
      color: harbor.team === 'friendly' ? '#f0d48a' : '#8eb7e6',
      side: THREE.DoubleSide,
      roughness: 0.6,
    }),
  );
  flag.position.set(0.55, 4.2, 0);
  group.add(flag);
  group.position.set(harbor.x, 0, harbor.z);
  return { group, flag, id: harbor.id };
}

export function createFishMesh(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 8, 6),
    new THREE.MeshStandardMaterial({ color: '#7dcea0', emissive: '#123', roughness: 0.4 }),
  );
  mesh.scale.set(1.4, 0.45, 0.8);
  return mesh;
}

export function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material?.dispose();
  });
}
