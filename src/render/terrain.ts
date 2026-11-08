import * as THREE from 'three';
import type { TerrainBody } from '../sim/terrain';

export function createTerrainMesh(body: TerrainBody): THREE.Group {
  const group = new THREE.Group();
  group.position.set(body.x, 0, body.z);
  if (body.kind === 'reef') {
    const rockMat = new THREE.MeshStandardMaterial({ color: '#3d5158', roughness: 0.95 });
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(body.radius * 0.55, 0), rockMat);
    rock.scale.set(1.35, 0.32, 1.05);
    rock.position.y = 0.28;
    group.add(rock);
    const second = new THREE.Mesh(new THREE.DodecahedronGeometry(body.radius * 0.32, 0), rockMat);
    second.position.set(body.radius * 0.38, 0.16, body.radius * 0.22);
    second.scale.set(1, 0.4, 0.8);
    group.add(second);
    return group;
  }
  const coast = body.kind === 'coast';
  const height = coast ? 6.2 : 3.6;
  const mound = new THREE.Mesh(
    new THREE.ConeGeometry(body.radius * (coast ? 0.96 : 0.82), height, coast ? 8 : 6),
    new THREE.MeshStandardMaterial({ color: coast ? '#8d7348' : '#6d8f5c', roughness: 0.94 }),
  );
  mound.position.y = height * 0.26;
  group.add(mound);
  const sand = new THREE.Mesh(
    new THREE.CylinderGeometry(body.radius, body.radius * 0.94, 0.4, 8),
    new THREE.MeshStandardMaterial({ color: '#d9c39a', roughness: 1 }),
  );
  sand.position.y = 0.08;
  group.add(sand);
  return group;
}

export function disposeTerrain(group: THREE.Object3D): void {
  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material?.dispose();
  });
}
