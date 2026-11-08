import * as THREE from 'three';
import { cannonProfile, FACTION_META } from '../sim/balance';
import type { Faction } from '../sim/types';
import { softCircleTexture } from './textures';

export interface ShipSpec {
  faction: Faction;
  hullTier: number;
  sailTier: number;
  cannonTier: number;
  length: number;
  beam: number;
  name: string;
}

export interface ShipView {
  group: THREE.Group;
  shadow: THREE.Mesh;
  sails: THREE.ShaderMaterial[];
  hullMat: THREE.MeshStandardMaterial;
  hpCanvas: HTMLCanvasElement;
  hpTex: THREE.CanvasTexture;
  sprite: THREE.Sprite;
  lastHp: number;
  lastMax: number;
  key: string;
  name: string;
  faction: Faction;
}

interface Palette {
  above: string;
  below: string;
  rail: string;
  deck: string;
  sail: string;
  sailAlt: string;
  flag: string;
  stripe: string;
  torn: number;
}

const PALETTE: Record<Faction, Palette> = {
  player: {
    above: '#c48955',
    below: '#6a4330',
    rail: '#f3e6c8',
    deck: '#d7b07a',
    sail: '#f7f3ea',
    sailAlt: '#efe2cc',
    flag: '#2c62b5',
    stripe: '#f7f4ee',
    torn: 0,
  },
  ally: {
    above: '#d7b07a',
    below: '#7a5436',
    rail: '#f7f1e2',
    deck: '#e6d3a8',
    sail: '#fff8ea',
    sailAlt: '#f0e2c0',
    flag: '#e2c27a',
    stripe: '#2c62b5',
    torn: 0,
  },
  pirate: {
    above: '#b15a45',
    below: '#5a2822',
    rail: '#e7cbb0',
    deck: '#c49262',
    sail: '#a32e2e',
    sailAlt: '#e6d3b4',
    flag: '#161616',
    stripe: '#6a2424',
    torn: 1,
  },
  navy: {
    above: '#5d7ea3',
    below: '#24384e',
    rail: '#f0e6cc',
    deck: '#d9d3c4',
    sail: '#fbfaf6',
    sailAlt: '#e7e2d6',
    flag: '#f7f8fb',
    stripe: '#e0c36a',
    torn: 0,
  },
  company: {
    above: '#3f7a62',
    below: '#1d3b32',
    rail: '#efe6cf',
    deck: '#cbb892',
    sail: '#e7f6ee',
    sailAlt: '#b7d7c6',
    flag: '#1f8a4c',
    stripe: '#e6c45a',
    torn: 0,
  },
  raider: {
    above: '#a7844a',
    below: '#4a351c',
    rail: '#e6d3b0',
    deck: '#c4a36a',
    sail: '#e6c36a',
    sailAlt: '#8d6a32',
    flag: '#1a120c',
    stripe: '#c47a2c',
    torn: 1,
  },
};

function plankTexture(base: string, seam: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d unavailable');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 32, 128);
  ctx.fillStyle = seam;
  for (let y = 0; y < 128; y += 16) ctx.fillRect(0, y, 32, 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function shipLookKey(spec: ShipSpec): string {
  return `${spec.faction}:${spec.hullTier}:${spec.sailTier}:${spec.cannonTier}:${spec.length.toFixed(2)}:${spec.beam.toFixed(2)}`;
}

function beamScale(t: number): number {
  const bow = t > 0.72 ? 1 - (t - 0.72) ** 1.35 * 2.6 : 1;
  const stern = t < 0.16 ? 0.58 + (t / 0.16) * 0.42 : 1;
  const mid = Math.sin(Math.PI * Math.min(1, t * 0.92 + 0.04)) ** 0.72;
  return Math.max(0.12, mid * Math.max(0.16, bow) * stern);
}

function createHullGeometry(length: number, beam: number, palette: Palette): THREE.BufferGeometry {
  const slices = 18;
  const profile = [
    { x: 0, y: -0.95 },
    { x: 0.58, y: -0.42 },
    { x: 1.08, y: 0.08 },
    { x: 1.0, y: 0.62 },
    { x: 1.16, y: 1.05 },
  ];
  const stride = profile.length * 2 - 1;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const above = new THREE.Color(palette.above);
  const below = new THREE.Color(palette.below);
  const rail = new THREE.Color(palette.rail);
  const push = (x: number, y: number, z: number, shade: number) => {
    positions.push(x, y, z);
    const color = y > 0.72 ? rail : y > 0.02 ? above : below;
    colors.push(color.r * shade, color.g * shade, color.b * shade);
  };
  for (let i = 0; i < slices; i += 1) {
    const t = i / (slices - 1);
    const z = (t - 0.5) * length;
    const scale = beamScale(t);
    const sheer = (Math.abs(t - 0.45) ** 2) * 0.28 + (t > 0.82 ? (t - 0.82) * 0.7 : 0);
    const shade = 0.9 + (i % 4) * 0.03;
    const pts = profile.map((point) => ({ x: point.x * beam * 0.62 * scale, y: point.y + sheer }));
    for (let r = pts.length - 1; r >= 1; r -= 1) {
      const point = pts[r];
      if (!point) continue;
      push(-point.x, point.y, z, shade);
    }
    const keel = pts[0];
    if (keel) push(0, keel.y, z, shade);
    for (let r = 1; r < pts.length; r += 1) {
      const point = pts[r];
      if (!point) continue;
      push(point.x, point.y, z, shade);
    }
  }
  for (let i = 0; i < slices - 1; i += 1) {
    for (let k = 0; k < stride - 1; k += 1) {
      const a = i * stride + k;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const keelOffset = profile.length - 1;
  for (let k = 0; k < stride - 1; k += 1) {
    indices.push(keelOffset, k, k + 1);
    const bow = (slices - 1) * stride;
    indices.push(bow + keelOffset, bow + k + 1, bow + k);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createDeckGeometry(length: number, beam: number, y: number): THREE.BufferGeometry {
  const slices = 14;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < slices; i += 1) {
    const t = 0.06 + (i / (slices - 1)) * 0.88;
    const z = (t - 0.5) * length;
    const half = beam * 0.5 * beamScale(t) * 0.9;
    positions.push(-half, y, z, half, y, z);
    uvs.push(0, t * 4, 1, t * 4);
  }
  for (let i = 0; i < slices - 1; i += 1) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function sailMaterial(color: string, torn: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uWind: { value: 0.4 },
      uColor: { value: new THREE.Color(color) },
      uTorn: { value: torn },
      uSunDir: { value: new THREE.Vector3(-0.42, 0.84, -0.32).normalize() },
    },
    vertexShader: `
      uniform float uTime;
      uniform float uWind;
      varying vec3 vWorld;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 pos = position;
        float billow = sin(uv.y * 3.14159) * (0.14 + uWind * 0.24);
        billow += sin(uv.x * 6.0 + uv.y * 9.0 + uTime * (1.5 + uWind * 2.2)) * (0.035 + uWind * 0.04);
        pos.z += billow;
        vec4 world = modelMatrix * vec4(pos, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform vec3 uSunDir;
      uniform float uTorn;
      varying vec3 vWorld;
      varying vec2 vUv;
      void main() {
        vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        vec3 V = normalize(cameraPosition - vWorld);
        if (dot(N, V) < 0.0) N = -N;
        float light = 0.55 + 0.6 * max(dot(N, normalize(uSunDir)), 0.0);
        if (uTorn > 0.5) {
          float noise = sin(vUv.x * 26.0 + vUv.y * 11.0) * sin(vUv.y * 18.0 + 1.7);
          if (noise > 0.72 && vUv.y < 0.8 && vUv.x > 0.12 && vUv.x < 0.9) discard;
        }
        vec3 col = toneMapping(uColor * light);
        gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
      }
    `,
  });
}

function rope(a: THREE.Vector3, b: THREE.Vector3, material: THREE.Material): THREE.Mesh {
  const direction = new THREE.Vector3().subVectors(b, a);
  const length = Math.max(0.1, direction.length());
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, length, 5), material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

function drawBar(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  name: string,
  hp: number,
  maxHp: number,
  faction: Faction,
): void {
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(8, 16, 24, 0.78)';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = FACTION_META[faction].color;
  const ratio = Math.max(0, Math.min(1, hp / Math.max(1, maxHp)));
  ctx.fillRect(8, 22, (width - 16) * ratio, 10);
  ctx.fillStyle = '#f6f1e6';
  ctx.font = '700 16px "WenQuanYi Micro Hei", sans-serif';
  ctx.fillText(name, 8, 16);
}

export function paintShipBar(view: ShipView, hp: number, maxHp: number): void {
  const ctx = view.hpCanvas.getContext('2d');
  if (!ctx) return;
  drawBar(ctx, view.hpCanvas, view.name, hp, maxHp, view.faction);
  view.hpTex.needsUpdate = true;
  view.lastHp = hp;
  view.lastMax = maxHp;
}

export function createShipMesh(spec: ShipSpec): ShipView {
  const palette = PALETTE[spec.faction];
  const group = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.78,
    metalness: 0.04,
    side: THREE.DoubleSide,
    emissive: new THREE.Color('#fff1d6'),
    emissiveIntensity: 0,
  });
  const hull = new THREE.Mesh(createHullGeometry(spec.length, spec.beam, palette), hullMat);
  group.add(hull);
  const deckMat = new THREE.MeshStandardMaterial({
    color: palette.deck,
    roughness: 0.72,
    map: plankTexture(palette.deck, '#5c3d28'),
  });
  const deck = new THREE.Mesh(createDeckGeometry(spec.length, spec.beam, 0.78), deckMat);
  group.add(deck);

  const stripeMat = new THREE.MeshStandardMaterial({ color: palette.stripe, roughness: 0.45, metalness: 0.15 });
  for (const side of [-1, 1]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, spec.length * 0.46), stripeMat);
    stripe.position.set(side * spec.beam * 0.46, 0.08, 0);
    group.add(stripe);
  }

  if (spec.hullTier >= 1) {
    const cabinH = 0.42 + spec.hullTier * 0.12;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(spec.beam * 0.62, cabinH, spec.length * 0.24), deckMat);
    cabin.position.set(0, 0.78 + cabinH / 2, -spec.length * 0.26);
    group.add(cabin);
  }
  if (spec.hullTier >= 2) {
    const wheel = new THREE.Mesh(
      new THREE.TorusGeometry(0.22, 0.04, 8, 14),
      new THREE.MeshStandardMaterial({ color: '#c7a36a', roughness: 0.4, metalness: 0.25 }),
    );
    wheel.position.set(0, 0.78, -spec.length * 0.18);
    group.add(wheel);
  }
  if (spec.hullTier >= 3) {
    const castle = new THREE.Mesh(new THREE.BoxGeometry(spec.beam * 0.5, 0.38, spec.length * 0.16), deckMat);
    castle.position.set(0, 0.7, spec.length * 0.28);
    group.add(castle);
  }

  const wood = new THREE.MeshStandardMaterial({ color: '#5a3a28', roughness: 0.7 });
  const sprit = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.07, spec.length * 0.28, 6), wood);
  sprit.rotation.x = Math.PI / 2;
  sprit.position.set(0, 0.62, spec.length * 0.5 + spec.length * 0.08);
  group.add(sprit);

  const sails: THREE.ShaderMaterial[] = [];
  const masts = mastLayout(spec.length, spec.sailTier);
  masts.forEach((mast, index) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, mast.h, 7), wood);
    pole.position.set(0, 0.78 + mast.h / 2, mast.z);
    group.add(pole);
    const material = sailMaterial(index % 2 === 0 ? palette.sail : palette.sailAlt, palette.torn);
    sails.push(material);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(mast.w, mast.sailH, 8, 10), material);
    cloth.position.set(0, 1.15 + mast.sailH / 2, mast.z);
    group.add(cloth);
    const yard = new THREE.Mesh(new THREE.BoxGeometry(mast.w * 1.05, 0.06, 0.06), wood);
    yard.position.set(0, 1.15 + mast.sailH, mast.z);
    group.add(yard);
    if (mast.top) {
      const topMat = sailMaterial(palette.sailAlt, palette.torn);
      sails.push(topMat);
      const topsail = new THREE.Mesh(new THREE.PlaneGeometry(mast.w * 0.62, mast.sailH * 0.42, 6, 6), topMat);
      topsail.position.set(0, 0.75 + mast.sailH + mast.sailH * 0.24, mast.z);
      group.add(topsail);
    }
    group.add(rope(new THREE.Vector3(0, 0.78 + mast.h, mast.z), new THREE.Vector3(0, 0.9, spec.length * 0.48), wood));
    group.add(rope(new THREE.Vector3(0, 0.78 + mast.h * 0.92, mast.z), new THREE.Vector3(0, 0.9, -spec.length * 0.42), wood));
  });

  const flagMat = sailMaterial(palette.flag, 0);
  sails.push(flagMat);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.42, 4, 3), flagMat);
  const main = masts[0];
  flag.position.set(0.38, 0.9 + (main?.h ?? 5), (main?.z ?? 0) + 0.05);
  group.add(flag);
  const emblemMat = new THREE.MeshBasicMaterial({
    color:
      spec.faction === 'navy'
        ? '#1d4e89'
        : spec.faction === 'company'
          ? '#f2d56b'
          : spec.faction === 'raider'
            ? '#e6c36a'
            : '#f0e2c4',
    side: THREE.DoubleSide,
  });
  if (spec.faction === 'navy') {
    const canton = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.16), emblemMat);
    canton.position.set(-0.2, 0.1, 0.02);
    flag.add(canton);
  } else if (spec.faction === 'company') {
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.08), emblemMat);
    bar.position.z = 0.02;
    flag.add(bar);
  } else if (spec.faction === 'raider') {
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.16, 3), emblemMat);
    tooth.position.z = 0.02;
    flag.add(tooth);
  } else if (spec.faction === 'ally') {
    const sun = new THREE.Mesh(new THREE.CircleGeometry(0.09, 10), emblemMat);
    sun.position.z = 0.02;
    flag.add(sun);
  } else if (spec.faction === 'pirate') {
    const mark = new THREE.Mesh(new THREE.CircleGeometry(0.08, 10), emblemMat);
    mark.position.z = 0.02;
    flag.add(mark);
  }

  const shots = cannonProfile(spec.faction, spec.cannonTier).shots;
  const iron = new THREE.MeshStandardMaterial({ color: '#2a2724', roughness: 0.4, metalness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: '#120e0c', roughness: 0.8 });
  for (const side of [-1, 1]) {
    for (let i = 0; i < shots; i += 1) {
      const z = shots === 1 ? spec.length * 0.02 : (i / (shots - 1) - 0.5) * spec.length * 0.5;
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.72, 8), iron);
      barrel.rotation.z = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      barrel.position.set(side * (spec.beam * 0.55), 0.62, z);
      group.add(barrel);
      const port = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.3), dark);
      port.position.set(side * spec.beam * 0.52, 0.58, z);
      group.add(port);
    }
  }

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(spec.beam * 1.8, spec.length * 0.82),
    new THREE.MeshBasicMaterial({
      map: softCircleTexture(),
      transparent: true,
      depthWrite: false,
      color: '#061018',
      opacity: 0.4,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;

  const hpCanvas = document.createElement('canvas');
  hpCanvas.width = 256;
  hpCanvas.height = 40;
  const hpTex = new THREE.CanvasTexture(hpCanvas);
  hpTex.colorSpace = THREE.SRGBColorSpace;
  const spriteMat = new THREE.SpriteMaterial({ map: hpTex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(6.4, 1.05, 1);
  sprite.position.y = 1.5 + (main?.h ?? 5);
  sprite.renderOrder = 2;
  group.add(sprite);

  const view: ShipView = {
    group,
    shadow,
    sails,
    hullMat,
    hpCanvas,
    hpTex,
    sprite,
    lastHp: -1,
    lastMax: -1,
    key: shipLookKey(spec),
    name: spec.name,
    faction: spec.faction,
  };
  paintShipBar(view, 1, 1);
  return view;
}

function mastLayout(length: number, tier: number): { z: number; h: number; w: number; sailH: number; top: boolean }[] {
  if (tier <= 0) return [{ z: -0.2, h: 5.15, w: length * 0.42, sailH: 3.25, top: false }];
  if (tier === 1) {
    return [
      { z: -0.35, h: 5.6, w: length * 0.46, sailH: 3.55, top: false },
      { z: length * 0.32, h: 4.15, w: length * 0.24, sailH: 2.45, top: false },
    ];
  }
  if (tier === 2) {
    return [
      { z: -0.7, h: 6.05, w: length * 0.4, sailH: 3.85, top: false },
      { z: length * 0.28, h: 5.15, w: length * 0.32, sailH: 3.15, top: false },
    ];
  }
  return [
    { z: -1.2, h: 6.45, w: length * 0.36, sailH: 3.5, top: true },
    { z: length * 0.26, h: 5.45, w: length * 0.3, sailH: 3.15, top: false },
    { z: -length * 0.34, h: 4.35, w: length * 0.24, sailH: 2.35, top: false },
  ];
}

export function disposeShipView(view: ShipView): void {
  view.group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material?.dispose();
  });
  view.shadow.geometry.dispose();
  const shadowMat = view.shadow.material;
  if (!Array.isArray(shadowMat)) shadowMat.dispose();
  view.hpTex.dispose();
}
