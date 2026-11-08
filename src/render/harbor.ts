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
  const board = document.createElement('canvas');
  board.width = 512;
  board.height = 128;
  const ctx = board.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(8, 16, 24, 0.82)';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = harbor.team === 'friendly' ? '#ffe08a' : '#9ec4f0';
    ctx.font = '700 72px "WenQuanYi Micro Hei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(harbor.name, 256, 86);
  }
  const tex = new THREE.CanvasTexture(board);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sign.scale.set(16, 4, 1);
  sign.position.y = 8.5;
  group.add(sign);
  const friendly = harbor.team === 'friendly';
  const dock = new THREE.Mesh(
    new THREE.TorusGeometry(harbor.dock, friendly ? 0.55 : 0.18, 8, 48),
    new THREE.MeshBasicMaterial({ color: friendly ? '#ffe08a' : '#4aa3ff', transparent: true, opacity: friendly ? 0.95 : 0.45 }),
  );
  dock.rotation.x = Math.PI / 2;
  dock.position.y = 0.2;
  group.add(dock);
  if (friendly) {
    const buoyMat = new THREE.MeshBasicMaterial({ color: '#ffe08a' });
    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * Math.PI * 2;
      const buoy = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.6, 6), buoyMat);
      buoy.position.set(Math.cos(angle) * harbor.dock, 0.8, Math.sin(angle) * harbor.dock);
      group.add(buoy);
    }
  }
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
