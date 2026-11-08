import { STAGES } from '../sim/balance';
import type { SimState } from '../sim/types';

export function drawRadar(ctx: CanvasRenderingContext2D, state: SimState): void {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const cx = width / 2;
  const cy = height / 2;
  const radius = width / 2 - 8;
  ctx.clearRect(0, 0, width, height);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(7, 22, 32, 0.72)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(226, 194, 122, 0.75)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy - radius);
  ctx.lineTo(cx, cy + radius);
  ctx.moveTo(cx - radius, cy);
  ctx.lineTo(cx + radius, cy);
  ctx.strokeStyle = 'rgba(226, 194, 122, 0.18)';
  ctx.lineWidth = 1;
  ctx.stroke();
  const bounds = STAGES[state.stageIndex]?.bounds ?? 80;
  const scale = radius / bounds;
  const project = (x: number, z: number) => ({ px: cx + x * scale, py: cy - z * scale });
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
    ctx.fillStyle = ship.faction === 'navy' ? '#8eb7e6' : '#e07a62';
    ctx.beginPath();
    ctx.arc(point.px, point.py, ship.alive ? 4.5 : 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  const player = state.ships.find((ship) => ship.faction === 'player');
  if (!player) return;
  const point = project(player.x, player.z);
  ctx.save();
  ctx.translate(point.px, point.py);
  ctx.rotate(player.heading);
  ctx.fillStyle = '#f4e7c4';
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 6);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  if (state.weather.intensity > 0.15) {
    ctx.strokeStyle = '#9fd0ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(state.weather.windAngle) * 18, cy - Math.sin(state.weather.windAngle) * 18);
    ctx.stroke();
  }
}
