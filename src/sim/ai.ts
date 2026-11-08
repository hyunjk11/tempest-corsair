import { normalizeAngle, sideDirection, turnToward } from './math';
import type { Ship, Side } from './types';

export interface Intent {
  throttle: number;
  turn: number;
  fire: Side | null;
}

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
