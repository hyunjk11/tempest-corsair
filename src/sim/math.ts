/** Heading 0 faces +Z. Positive heading turns toward +X. */

export interface Vec2 {
  x: number;
  z: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeAngle(angle: number): number {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

export function approach(current: number, target: number, maxDelta: number): number {
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) return target;
  return current + Math.sign(delta) * maxDelta;
}

export function forward(heading: number): Vec2 {
  return { x: Math.sin(heading), z: Math.cos(heading) };
}

/**
 * Port is local +X, starboard is local -X.
 * At heading 0 the ship faces +Z and starboard is world -X.
 */
export function sideDirection(heading: number, side: 'port' | 'starboard'): Vec2 {
  const sign = side === 'port' ? 1 : -1;
  return { x: sign * Math.cos(heading), z: sign * -Math.sin(heading) };
}

export function turnToward(current: number, desired: number): number {
  const diff = normalizeAngle(desired - current);
  if (Math.abs(diff) < 0.05) return 0;
  return Math.sign(diff);
}

/**
 * Screen-right on the horizontal plane when the camera sits behind the ship
 * and looks along its bow. At heading 0 this is world -X, which is starboard.
 */
export function chaseScreenRight(heading: number): Vec2 {
  return { x: -Math.cos(heading), z: Math.sin(heading) };
}

/** Change in screen-right of the bow when heading increases. Negative means the bow swings screen-left. */
export function bowScreenRightRate(heading: number): number {
  const right = chaseScreenRight(heading);
  return Math.cos(heading) * right.x + -Math.sin(heading) * right.z;
}

export function nextRandom(seed: number): { value: number; seed: number } {
  let state = seed >>> 0 || 1;
  state = (Math.imul(1664525, state) + 1013904223) >>> 0;
  return { value: state / 4294967296, seed: state };
}
