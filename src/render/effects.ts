import * as THREE from 'three';
import { forward } from '../sim/math';
import type { SimState } from '../sim/types';
import { softCircleTexture } from './textures';

interface Puff {
  mesh: THREE.Sprite;
  life: number;
  max: number;
  vy: number;
  spin: number;
}

interface Ring {
  mesh: THREE.Mesh;
  life: number;
  max: number;
}

export class Fx {
  private readonly scene: THREE.Scene;
  private readonly smoke: Puff[] = [];
  private readonly rings: Ring[] = [];
  private readonly wakes: Puff[] = [];
  private readonly balls = new Map<number, THREE.Mesh>();
  private readonly wakeAcc = new Map<string, number>();
  private readonly ballGeo = new THREE.SphereGeometry(0.2, 8, 8);
  private readonly ballMat = new THREE.MeshStandardMaterial({ color: '#241c18', roughness: 0.35, metalness: 0.4 });
  private readonly rain: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly drops: { x: number; y: number; z: number; speed: number }[] = [];
  private smokeCursor = 0;
  private ringCursor = 0;
  private wakeCursor = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    const smokeMat = () =>
      new THREE.SpriteMaterial({
        map: softCircleTexture(),
        transparent: true,
        depthWrite: false,
        color: '#d9ddd8',
      });
    for (let i = 0; i < 36; i += 1) {
      const mesh = new THREE.Sprite(smokeMat());
      mesh.visible = false;
      mesh.scale.set(1.2, 1.2, 1);
      scene.add(mesh);
      this.smoke.push({ mesh, life: 0, max: 1, vy: 1, spin: 0 });
    }
    const ringGeo = new THREE.RingGeometry(0.45, 0.62, 22);
    for (let i = 0; i < 16; i += 1) {
      const mesh = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({
          color: '#e7f4f6',
          transparent: true,
          opacity: 0.8,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      scene.add(mesh);
      this.rings.push({ mesh, life: 0, max: 1 });
    }
    for (let i = 0; i < 40; i += 1) {
      const mesh = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: softCircleTexture(),
          transparent: true,
          depthWrite: false,
          color: '#f4fbff',
        }),
      );
      mesh.visible = false;
      scene.add(mesh);
      this.wakes.push({ mesh, life: 0, max: 1, vy: 0, spin: 0 });
    }
    const rainGeo = new THREE.PlaneGeometry(0.07, 0.85);
    const rainMat = new THREE.MeshBasicMaterial({
      color: '#d5e2ea',
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.rain = new THREE.InstancedMesh(rainGeo, rainMat, 180);
    this.rain.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    for (let i = 0; i < 180; i += 1) {
      this.drops.push({
        x: (Math.random() - 0.5) * 70,
        y: Math.random() * 30,
        z: (Math.random() - 0.5) * 70,
        speed: 18 + Math.random() * 16,
      });
    }
    scene.add(this.rain);
  }

  sync(state: SimState, dt: number, time: number, camera: THREE.Camera): void {
    for (const event of state.events) {
      if (event.type === 'fire') this.burst(event.x, 1.1, event.z, 0.9, '#cfc8bc', 1.4);
      else if (event.type === 'hit') this.burst(event.x, 1.6, event.z, 1.5, '#d9d3c8', 2.2);
      else if (event.type === 'splash' || event.type === 'slam') this.splash(event.x, event.z, event.type === 'slam' ? 2.4 : 1);
      else if (event.type === 'pickup') this.burst(event.x, 1.2, event.z, 0.8, '#f0d48a', 1.1);
    }
    this.fadePuffs(this.smoke, dt, true);
    this.fadePuffs(this.wakes, dt, false);
    for (const ring of this.rings) {
      if (ring.life <= 0) continue;
      ring.life -= dt;
      const k = Math.max(0, ring.life / ring.max);
      const scale = (1 - k) * 7 + 0.4;
      ring.mesh.scale.setScalar(scale);
      const material = ring.mesh.material;
      if (!Array.isArray(material)) material.opacity = k * 0.75;
      ring.mesh.visible = ring.life > 0;
    }
    const seen = new Set<number>();
    for (const ball of state.projectiles) {
      seen.add(ball.id);
      let mesh = this.balls.get(ball.id);
      if (!mesh) {
        mesh = new THREE.Mesh(this.ballGeo, this.ballMat);
        this.scene.add(mesh);
        this.balls.set(ball.id, mesh);
      }
      const t = 1 - ball.life / Math.max(0.001, ball.maxLife);
      mesh.position.set(ball.x, 0.85 + Math.sin(Math.max(0, Math.min(1, t)) * Math.PI) * 2.35, ball.z);
    }
    for (const [id, mesh] of this.balls) {
      if (seen.has(id)) continue;
      this.scene.remove(mesh);
      this.balls.delete(id);
    }
    for (const ship of state.ships) {
      if (!ship.alive || Math.abs(ship.speed) < 2.4) continue;
      const acc = (this.wakeAcc.get(ship.id) ?? 0) + dt;
      if (acc < 0.07) {
        this.wakeAcc.set(ship.id, acc);
        continue;
      }
      this.wakeAcc.set(ship.id, 0);
      const nose = forward(ship.heading);
      const side = ship.speed > 0 ? -1 : 1;
      this.wake(ship.x - nose.x * ship.length * 0.42, ship.z - nose.z * ship.length * 0.42, 0.8 + Math.abs(ship.speed) * 0.05);
      this.wake(ship.x - nose.x * ship.length * 0.2 + nose.z * side * 0.8, ship.z - nose.z * ship.length * 0.2 - nose.x * side * 0.8, 0.45);
    }
    this.updateRain(state.weather.intensity, dt, time, camera);
  }

  private burst(x: number, y: number, z: number, size: number, color: string, life: number): void {
    const puff = this.smoke[this.smokeCursor % this.smoke.length];
    this.smokeCursor += 1;
    if (!puff) return;
    puff.life = life;
    puff.max = life;
    puff.vy = 0.8 + Math.random();
    puff.mesh.visible = true;
    puff.mesh.position.set(x, y, z);
    puff.mesh.scale.setScalar(size);
    const material = puff.mesh.material;
    if (!Array.isArray(material)) {
      material.opacity = 0.8;
      material.color.set(color);
    }
  }

  private wake(x: number, z: number, size: number): void {
    const puff = this.wakes[this.wakeCursor % this.wakes.length];
    this.wakeCursor += 1;
    if (!puff) return;
    puff.life = 1.35;
    puff.max = 1.35;
    puff.mesh.visible = true;
    puff.mesh.position.set(x, 0.2, z);
    puff.mesh.scale.set(size, size * 0.45, 1);
    const material = puff.mesh.material;
    if (!Array.isArray(material)) material.opacity = 0.55;
  }

  private splash(x: number, z: number, scale: number): void {
    const ring = this.rings[this.ringCursor % this.rings.length];
    this.ringCursor += 1;
    if (!ring) return;
    ring.life = 0.7;
    ring.max = 0.7;
    ring.mesh.visible = true;
    ring.mesh.position.set(x, 0.18, z);
    ring.mesh.scale.setScalar(scale);
    this.burst(x, 0.4, z, 0.7 * scale, '#e7f6f8', 0.55);
  }

  private fadePuffs(list: Puff[], dt: number, rise: boolean): void {
    for (const puff of list) {
      if (puff.life <= 0) continue;
      puff.life -= dt;
      const k = Math.max(0, puff.life / puff.max);
      if (rise) puff.mesh.position.y += puff.vy * dt;
      puff.mesh.scale.multiplyScalar(1 + dt * 0.35);
      const material = puff.mesh.material;
      if (!Array.isArray(material)) material.opacity = k * 0.7;
      puff.mesh.visible = puff.life > 0;
    }
  }

  private updateRain(intensity: number, dt: number, _time: number, camera: THREE.Camera): void {
    this.rain.visible = intensity > 0.22;
    const material = this.rain.material;
    if (!Array.isArray(material)) material.opacity = 0.12 + intensity * 0.4;
    if (!this.rain.visible) return;
    const cx = camera.position.x;
    const cz = camera.position.z;
    this.drops.forEach((drop, index) => {
      drop.y -= drop.speed * dt * (0.45 + intensity);
      if (drop.y < 0) drop.y = 24 + Math.random() * 10;
      this.dummy.position.set(cx + drop.x, drop.y, cz + drop.z);
      this.dummy.quaternion.copy(camera.quaternion);
      this.dummy.rotateX(0.35);
      this.dummy.updateMatrix();
      this.rain.setMatrixAt(index, this.dummy.matrix);
    });
    this.rain.instanceMatrix.needsUpdate = true;
  }
}

export function createChest(): THREE.Group {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#6b3d22', roughness: 0.68 });
  const gold = new THREE.MeshStandardMaterial({
    color: '#f0c14a',
    metalness: 0.65,
    roughness: 0.28,
    emissive: '#8a5a10',
    emissiveIntensity: 0.45,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.68, 0.82), wood);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.26, 0.88), wood);
  lid.position.y = 0.46;
  const band = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.12, 0.9), gold);
  band.position.y = 0.16;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.95, 0.035, 6, 20),
    new THREE.MeshBasicMaterial({ color: '#f2d48a', transparent: true, opacity: 0.8 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.15;
  group.add(body, lid, band, ring);
  return group;
}
