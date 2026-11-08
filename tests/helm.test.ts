import { describe, expect, it } from 'vitest';
import { sailingTurn } from '../src/game/input';
import { bowScreenRightRate, chaseScreenRight, forward, sideDirection } from '../src/sim/math';
import { getPlayer, step } from '../src/sim/simulation';
import { fresh, NO_INPUT } from './helpers';

describe('helm sign', () => {
  it('maps left to port and right to starboard', () => {
    expect(sailingTurn(true, false)).toBe(1);
    expect(sailingTurn(false, true)).toBe(-1);
    expect(sailingTurn(true, true)).toBe(0);
    expect(sideDirection(0, 'port').x).toBeCloseTo(1);
    expect(sideDirection(0, 'starboard').x).toBeCloseTo(-1);
    expect(chaseScreenRight(0).x).toBeCloseTo(-1);
    expect(bowScreenRightRate(0.3)).toBeCloseTo(-1);
    expect(sailingTurn(false, true) * bowScreenRightRate(0)).toBeGreaterThan(0);
    expect(sailingTurn(true, false) * bowScreenRightRate(1.2)).toBeLessThan(0);
  });

  it('yaws the bow toward screen-right when the right key is held', () => {
    const state = fresh(0);
    state.aiEnabled = false;
    const player = getPlayer(state);
    if (!player) throw new Error('player missing');
    player.heading = 0;
    player.speed = 9;
    player.x = 0;
    player.z = -16;
    const before = forward(player.heading);
    step(state, { ...NO_INPUT, throttle: 1, turn: sailingTurn(false, true) }, 0.45);
    expect(player.heading).toBeLessThan(0);
    const after = forward(player.heading);
    const right = chaseScreenRight(0);
    const swing = (after.x - before.x) * right.x + (after.z - before.z) * right.z;
    expect(swing).toBeGreaterThan(0);
    expect(player.x).toBeLessThan(0);
  });
});
