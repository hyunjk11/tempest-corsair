import * as THREE from 'three';

let soft: THREE.CanvasTexture | null = null;

export function softCircleTexture(): THREE.CanvasTexture {
  if (soft) return soft;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d unavailable');
  const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.35)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  soft = new THREE.CanvasTexture(canvas);
  soft.needsUpdate = true;
  return soft;
}
