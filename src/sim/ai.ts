import { forward, normalizeAngle, sideDirection, turnToward } from './math';
import { terrainBlocks, type TerrainBody } from './terrain';
import type { Ship, Side } from './types';

export interface Intent {
  throttle: number;
  turn: number;
  fire: Side | null;
}

/** Space fires only when a broadside is actually pointed at the target. */
export const PLAYER_AIM = { min: 5.5, max: 52, error: 0.5 };

export const PIRATE_FIRE = { min: 7, max: 46, error: 0.46 };
export const NAVY_FIRE = { min: 18, max: 54, error: 0.27 };

export interface Aim {
  side: Side;
  error: number;
  dist: number;
}

export function bestSide(ship: Pick<Ship, 'x' | 'z' | 'heading'>, targetX: number, targetZ: number): Aim {
  const dx = targetX - ship.x;
  const dz = targetZ - ship.z;
  const dist = Math.hypot(dx, dz) || 0.0001;
  const ux = dx / dist;
  const uz = dz / dist;
  let side: Side = 'port';
  let error = Infinity;
  for (const candidate of ['port', 'starboard'] as const) {
    const dir = sideDirection(ship.heading, candidate);
    const dot = Math.max(-1, Math.min(1, dir.x * ux + dir.z * uz));
    const err = Math.acos(dot);
    if (err < error) {
      error = err;
      side = candidate;
    }
  }
  return { side, error, dist };
}

function broadsideHeading(tx: number, tz: number, which: Side): number {
  const dist = Math.hypot(tx, tz) || 1;
  const ux = tx / dist;
  const uz = tz / dist;
  if (which === 'starboard') return Math.atan2(uz, -ux);
  return Math.atan2(-uz, ux);
}

export function desiredBroadsideHeading(heading: number, dx: number, dz: number): number {
  const port = broadsideHeading(dx, dz, 'port');
  const star = broadsideHeading(dx, dz, 'starboard');
  const portCost = Math.abs(normalizeAngle(port - heading));
  const starCost = Math.abs(normalizeAngle(star - heading));
  return portCost <= starCost ? port : star;
}

export function pirateDesiredHeading(heading: number, dx: number, dz: number, dist: number): number {
  if (dist > 36) return Math.atan2(dx, dz);
  if (dist < 12) return Math.atan2(-dx, -dz);
  return desiredBroadsideHeading(heading, dx, dz);
}

export function navyDesiredHeading(heading: number, dx: number, dz: number, dist: number): number {
  if (dist > 44) return Math.atan2(dx, dz);
  if (dist < 26) return Math.atan2(-dx, -dz);
  return desiredBroadsideHeading(heading, dx, dz);
}

function intentFrom(
  ship: Ship,
  target: { x: number; z: number },
  desired: number,
  throttle: number,
  window: { min: number; max: number; error: number },
): Intent {
  const aim = bestSide(ship, target.x, target.z);
  const aligned = aim.dist <= window.max && aim.dist >= window.min && aim.error <= window.error;
  const reload = aim.side === 'port' ? ship.reloadPort : ship.reloadStarboard;
  return {
    throttle,
    turn: turnToward(ship.heading, desired),
    fire: aligned && reload <= 0 ? aim.side : null,
  };
}

export function pirateIntent(ship: Ship, target: { x: number; z: number }): Intent {
  const dx = target.x - ship.x;
  const dz = target.z - ship.z;
  const dist = Math.hypot(dx, dz);
  const desired = pirateDesiredHeading(ship.heading, dx, dz, dist);
  const throttle = dist > 36 ? 1 : dist < 12 ? 0.9 : 0.78;
  return intentFrom(ship, target, desired, throttle, PIRATE_FIRE);
}

export function navyIntent(ship: Ship, target: { x: number; z: number }): Intent {
  const dx = target.x - ship.x;
  const dz = target.z - ship.z;
  const dist = Math.hypot(dx, dz);
  const desired = navyDesiredHeading(ship.heading, dx, dz, dist);
  const throttle = dist > 44 ? 1 : 0.72;
  return intentFrom(ship, target, desired, throttle, NAVY_FIRE);
}

const STANDOFF = new Set<Ship['faction']>(['navy', 'company']);

export function selectTarget(ship: Ship, ships: readonly Ship[]): Ship | null {
  let best: Ship | null = null;
  let bestScore = Infinity;
  for (const other of ships) {
    if (!other.alive || other.id === ship.id || other.team === ship.team) continue;
    let score = Math.hypot(other.x - ship.x, other.z - ship.z);
    if (ship.faction !== 'raider' && other.faction === 'player') score += 16;
    if (other.id === ship.focusId) score -= 10;
    if (score < bestScore) {
      bestScore = score;
      best = other;
    }
  }
  return best;
}

export function avoidTerrainHeading(ship: Pick<Ship, 'x' | 'z' | 'heading' | 'beam'>, desired: number, bodies: readonly TerrainBody[]): number {
  const padding = ship.beam * 0.55;
  const clear = (heading: number, distance: number) => {
    const nose = forward(heading);
    return !terrainBlocks(ship.x + nose.x * distance, ship.z + nose.z * distance, padding, bodies);
  };
  if (clear(desired, 16) && clear(ship.heading, 9)) return desired;
  let best = desired;
  let bestScore = -Infinity;
  for (let step = -8; step <= 8; step += 1) {
    const heading = desired + step * 0.32;
    let score = 0;
    if (clear(heading, 7)) score += 3;
    if (clear(heading, 14)) score += 2;
    if (clear(heading, 22)) score += 1;
    score -= Math.abs(normalizeAngle(heading - desired)) * 0.35;
    if (score > bestScore) {
      bestScore = score;
      best = heading;
    }
  }
  return best;
}

export function intentFor(ship: Ship, target: { x: number; z: number }, bodies: readonly TerrainBody[]): Intent {
  const dx = target.x - ship.x;
  const dz = target.z - ship.z;
  const dist = Math.hypot(dx, dz);
  const standoff = STANDOFF.has(ship.faction);
  const raw = standoff ? navyDesiredHeading(ship.heading, dx, dz, dist) : pirateDesiredHeading(ship.heading, dx, dz, dist);
  const desired = avoidTerrainHeading(ship, raw, bodies);
  const window = standoff ? NAVY_FIRE : PIRATE_FIRE;
  const throttle = standoff ? (dist > 44 ? 1 : 0.72) : dist > 36 ? 1 : dist < 12 ? 0.9 : 0.78;
  return intentFrom(ship, target, desired, throttle, window);
}
