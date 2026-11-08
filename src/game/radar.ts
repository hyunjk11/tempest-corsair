import { FACTION_META, STAGES } from '../sim/balance';
import type { SimState } from '../sim/types';

const TERRAIN_COLOR = { island: '#6d8f5c', reef: '#3d6d78', coast: '#8d7348' };

export function drawRadar(ctx: CanvasRenderingContext2D, state: SimState): void {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const cx = width / 2;
  const cy = height / 2;
  const radius = width / 2 - 8;
  ctx.clearRect(0, 0, width, height);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(7, 22, 32, 0.78)';
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 1, 0, Math.PI * 2);
  ctx.clip();

  const player = state.ships.find((ship) => ship.faction === 'player');
  const originX = player?.x ?? 0;
  const originZ = player?.z ?? 0;
  const heading = player?.heading ?? 0;
  const bounds = STAGES[state.stageIndex]?.bounds ?? 80;
  const scale = radius / (bounds * 0.55);
  ctx.translate(cx, cy);
  ctx.rotate(-heading);
  const project = (x: number, z: number) => ({
    px: (x - originX) * scale,
    py: -(z - originZ) * scale,
  });

  for (const body of STAGES[state.stageIndex]?.terrain ?? []) {
    const point = project(body.x, body.z);
    ctx.fillStyle = TERRAIN_COLOR[body.kind];
    ctx.globalAlpha = body.kind === 'reef' ? 0.9 : 0.8;
    ctx.beginPath();
    ctx.arc(point.px, point.py, Math.max(3, body.radius * scale), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const treasure of state.treasures) {
    if (treasure.taken) continue;
    const point = project(treasure.x, treasure.z);
    ctx.fillStyle = '#f0c14a';
    ctx.fillRect(point.px - 2.5, point.py - 2.5, 5, 5);
  }
  if (state.kraken) {
    const point = project(state.kraken.x, state.kraken.z);
    ctx.fillStyle = state.kraken.alive ? '#7d5cff' : '#445';
    ctx.beginPath();
    ctx.arc(point.px, point.py, 6, 0, Math.PI * 2);
    ctx.fill();
    for (const marker of state.kraken.markers) {
      const slam = project(marker.x, marker.z);
      ctx.strokeStyle = '#ff9a3c';
      ctx.beginPath();
      ctx.arc(slam.px, slam.py, marker.radius * scale, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  for (const ship of state.ships) {
    if (ship.faction === 'player' || ship.sinkT > 3) continue;
    const point = project(ship.x, ship.z);
    ctx.fillStyle = FACTION_META[ship.faction].color;
    ctx.beginPath();
    ctx.arc(point.px, point.py, ship.alive ? 4.5 : 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#f4e7c4';
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(5, 6);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(226, 194, 122, 0.75)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = 'rgba(244, 231, 196, 0.85)';
  ctx.beginPath();
  ctx.moveTo(cx, cy - radius + 4);
  ctx.lineTo(cx - 4, cy - radius + 12);
  ctx.lineTo(cx + 4, cy - radius + 12);
  ctx.closePath();
  ctx.fill();
}
