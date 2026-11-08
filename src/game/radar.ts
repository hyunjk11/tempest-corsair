import { FACTION_META, STAGES } from '../sim/balance';
import type { SimState } from '../sim/types';

const TERRAIN_COLOR = { island: '#6d8f5c', reef: '#3d6d78', coast: '#8d7348' };

export function drawRadar(ctx: CanvasRenderingContext2D, state: SimState): void {
  if (state.match && state.boundsOverride) {
    drawMatchMap(ctx, state);
    return;
  }
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

function drawMatchMap(ctx: CanvasRenderingContext2D, state: SimState): void {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const cx = width / 2;
  const cy = height / 2;
  const radius = width / 2 - 8;
  const bounds = state.boundsOverride ?? 100;
  const scale = (radius - 6) / bounds;
  ctx.clearRect(0, 0, width, height);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(7, 22, 32, 0.82)';
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 1, 0, Math.PI * 2);
  ctx.clip();
  const project = (x: number, z: number) => ({ px: cx + x * scale, py: cy - z * scale });
  for (const body of state.terrainOverride ?? []) {
    const point = project(body.x, body.z);
    ctx.fillStyle = body.kind === 'reef' ? '#3d6d78' : body.kind === 'coast' ? '#8d7348' : '#6d8f5c';
    ctx.beginPath();
    ctx.arc(point.px, point.py, Math.max(2.5, body.radius * scale), 0, Math.PI * 2);
    ctx.fill();
  }
  for (const spot of state.match?.fish ?? []) {
    const point = project(spot.x, spot.z);
    ctx.fillStyle = spot.cooldown > 0 ? '#355e49' : '#7dcea0';
    ctx.fillRect(point.px - 2, point.py - 2, 4, 4);
  }
  for (const harbor of state.match?.harbors ?? []) {
    const point = project(harbor.x, harbor.z);
    ctx.fillStyle = harbor.team === 'friendly' ? '#f0d48a' : '#8eb7e6';
    ctx.fillRect(point.px - 7, point.py - 7, 14, 14);
    ctx.strokeStyle = '#fff6df';
    ctx.lineWidth = 2;
    ctx.strokeRect(point.px - 7, point.py - 7, 14, 14);
    ctx.fillStyle = '#fffaf0';
    ctx.font = '700 12px "WenQuanYi Micro Hei", sans-serif';
    ctx.textAlign = 'left';
    const label = harbor.id === 'home' ? '아군 항구' : '적 항구';
    const textWidth = ctx.measureText(label).width;
    const inwardX = cx - point.px;
    const inwardY = cy - point.py;
    const inward = Math.hypot(inwardX, inwardY) || 1;
    let textX = point.px + (inwardX / inward) * 18 - textWidth / 2;
    let textY = point.py + (inwardY / inward) * 18;
    textX = Math.max(cx - radius + 8, Math.min(cx + radius - 8 - textWidth, textX));
    textY = Math.max(cy - radius + 14, Math.min(cy + radius - 6, textY));
    ctx.fillText(label, textX, textY);
  }
  if (state.kraken?.alive) {
    const point = project(state.kraken.x, state.kraken.z);
    ctx.fillStyle = '#7d5cff';
    ctx.beginPath();
    ctx.arc(point.px, point.py, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  const player = state.ships.find((ship) => ship.faction === 'player');
  for (const ship of state.ships) {
    if (ship.faction === 'player' || ship.sinkT > 3) continue;
    const point = project(ship.x, ship.z);
    ctx.fillStyle = ship.team === 'friendly' ? '#f0d48a' : ship.team === 'enemy' ? '#4aa3ff' : '#ff6b4a';
    ctx.beginPath();
    if (ship.team === 'neutral') {
      ctx.fillRect(point.px - 3, point.py - 3, 6, 6);
    } else {
      ctx.arc(point.px, point.py, 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (player) {
    const point = project(player.x, player.z);
    ctx.save();
    ctx.translate(point.px, point.py);
    ctx.rotate(player.heading);
    ctx.fillStyle = '#fff6df';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(226, 194, 122, 0.75)';
  ctx.lineWidth = 3;
  ctx.stroke();
}
