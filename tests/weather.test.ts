import { describe, expect, it } from 'vitest';
import { STAGES } from '../src/sim/balance';
import { nextRandom } from '../src/sim/math';
import { getPlayer, step } from '../src/sim/simulation';
import { fresh, NO_INPUT } from './helpers';

function seedForChance(chance: number): number {
  let seed = 1;
  for (let i = 0; i < 50; i += 1) {
    if (nextRandom(seed).value < chance) return seed;
    seed = nextRandom(seed).seed;
  }
  throw new Error('no typhoon seed');
}

describe('treasure, kraken, and typhoon', () => {
  it('grants gold when the hull sails over a chest', () => {
    const state = fresh(0);
    state.aiEnabled = false;
    const player = getPlayer(state);
    const chest = state.treasures[0];
    if (!player || !chest) throw new Error('missing');
    const before = state.gold;
    player.x = chest.x;
    player.z = chest.z;
    step(state, NO_INPUT, 0.05);
    expect(chest.taken).toBe(true);
    expect(state.gold).toBe(before + chest.gold);
    step(state, NO_INPUT, 0.05);
    expect(state.gold).toBe(before + chest.gold);
  });

  it('damages the player only after a kraken telegraph resolves on top of them', () => {
    const calm = fresh(5);
    const player = getPlayer(calm);
    if (!player || !calm.kraken) throw new Error('boss missing');
    calm.kraken.phase = 'telegraph';
    calm.kraken.timer = 2;
    calm.kraken.markers = [{ x: player.x, z: player.z, radius: 8 }];
    step(calm, NO_INPUT, 0.05);
    expect(player.hp).toBe(player.maxHp);

    const hit = fresh(5);
    const victim = getPlayer(hit);
    if (!victim || !hit.kraken) throw new Error('boss missing');
    hit.kraken.phase = 'telegraph';
    hit.kraken.timer = 0.01;
    hit.kraken.markers = [{ x: victim.x, z: victim.z, radius: 8 }];
    const before = victim.hp;
    step(hit, NO_INPUT, 0.05);
    expect(victim.hp).toBeLessThan(before);
    expect(hit.kraken.phase).toBe('strike');

    const dodge = fresh(5);
    const sailor = getPlayer(dodge);
    if (!sailor || !dodge.kraken) throw new Error('boss missing');
    dodge.kraken.phase = 'telegraph';
    dodge.kraken.timer = 0.01;
    dodge.kraken.markers = [{ x: sailor.x + 40, z: sailor.z + 40, radius: 8 }];
    const safe = sailor.hp;
    step(dodge, NO_INPUT, 0.05);
    expect(sailor.hp).toBe(safe);
  });

  it('lets cannon fire injure the kraken', () => {
    const state = fresh(5);
    state.aiEnabled = false;
    const player = getPlayer(state);
    if (!player || !state.kraken) throw new Error('boss missing');
    state.kraken.phase = 'idle';
    state.kraken.timer = 30;
    player.x = state.kraken.x - 8;
    player.z = state.kraken.z;
    player.heading = 0;
    player.speed = 0;
    const before = state.kraken.hp;
    step(state, { ...NO_INPUT, firePort: true }, 0.2);
    expect(state.kraken.hp).toBeLessThan(before);
    expect(state.kraken.alive).toBe(true);
  });

  it('keeps the first stage calm and raises a readable typhoon later', () => {
    const opening = fresh(0);
    for (let i = 0; i < 80; i += 1) step(opening, NO_INPUT, 0.5);
    expect(opening.weather.phase).toBe('calm');
    expect(opening.weather.intensity).toBe(0);

    const stage = STAGES[3];
    if (!stage) throw new Error('stage missing');
    const stormy = fresh(3, seedForChance(stage.typhoonChance));
    stormy.aiEnabled = false;
    stormy.rngState = seedForChance(stage.typhoonChance);
    step(stormy, NO_INPUT, stage.typhoonDelay + 0.2);
    expect(stormy.weather.phase).toBe('warning');
    expect(stormy.events.some((event) => event.type === 'typhoon')).toBe(true);
    const player = getPlayer(stormy);
    if (!player) throw new Error('player missing');
    const origin = { x: player.x, z: player.z };
    step(stormy, NO_INPUT, 5);
    expect(stormy.weather.phase).toBe('storm');
    for (let i = 0; i < 20; i += 1) step(stormy, NO_INPUT, 0.2);
    expect(Math.hypot(stormy.weather.windX, stormy.weather.windZ)).toBeGreaterThan(4);
    const moved = Math.hypot(player.x - origin.x, player.z - origin.z);
    expect(moved).toBeGreaterThan(2);
  });
});
