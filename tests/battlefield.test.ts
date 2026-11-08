import { describe, expect, it } from 'vitest';
import { audioCanSound } from '../src/game/audio';
import { avoidTerrainHeading, selectTarget } from '../src/sim/ai';
import { STAGES } from '../src/sim/balance';
import { terrainBlocks } from '../src/sim/terrain';
import { fireBroadside, getPlayer, step } from '../src/sim/simulation';
import { fresh, NO_INPUT } from './helpers';

describe('audio gate', () => {
  it('stays silent until a running context is unlocked and unmute', () => {
    expect(audioCanSound({ muted: false, unlocked: false, context: 'running' })).toBe(false);
    expect(audioCanSound({ muted: false, unlocked: true, context: 'suspended' })).toBe(false);
    expect(audioCanSound({ muted: false, unlocked: true, context: 'none' })).toBe(false);
    expect(audioCanSound({ muted: true, unlocked: true, context: 'running' })).toBe(false);
    expect(audioCanSound({ muted: false, unlocked: true, context: 'running' })).toBe(true);
  });
});

describe('rival fleets and terrain', () => {
  it('keeps every spawn, chest, and kraken out of the rocks', () => {
    for (const stage of STAGES) {
      const points = [
        { x: stage.playerX, z: stage.playerZ, pad: 3.2 },
        ...stage.enemies.map((enemy) => ({ x: enemy.x, z: enemy.z, pad: 4 })),
        ...stage.treasures.map((treasure) => ({ x: treasure.x, z: treasure.z, pad: 1.4 })),
        ...(stage.kraken ? [{ x: stage.kraken.x, z: stage.kraken.z, pad: 8 }] : []),
      ];
      for (const point of points) {
        expect(terrainBlocks(point.x, point.z, point.pad, stage.terrain)).toBe(false);
      }
    }
  });

  it('pushes a grounded hull back into open water', () => {
    const state = fresh(0);
    state.aiEnabled = false;
    const player = getPlayer(state);
    const island = STAGES[0]?.terrain.find((body) => body.kind === 'island');
    if (!player || !island) throw new Error('missing');
    player.x = island.x;
    player.z = island.z;
    player.speed = 0;
    const before = player.hp;
    step(state, NO_INPUT, 0.05);
    const dist = Math.hypot(player.x - island.x, player.z - island.z);
    expect(dist).toBeGreaterThanOrEqual(island.radius + player.beam * 0.42 - 0.05);
    expect(player.hp).toBe(before);
  });

  it('stops a broadside on the island before it reaches a ship behind it', () => {
    const state = fresh(0);
    state.aiEnabled = false;
    const player = getPlayer(state);
    const enemy = state.ships.find((ship) => ship.faction === 'pirate');
    const island = STAGES[0]?.terrain.find((body) => body.kind === 'island');
    if (!player || !enemy || !island) throw new Error('missing');
    player.x = island.x - island.radius - 6;
    player.z = island.z;
    player.heading = 0;
    player.speed = 0;
    enemy.x = island.x + island.radius + 8;
    enemy.z = island.z;
    enemy.heading = 0;
    const hp = enemy.hp;
    expect(fireBroadside(state, player, 'port')).toBe(1);
    let blocked = false;
    for (let i = 0; i < 50; i += 1) {
      step(state, NO_INPUT, 1 / 60);
      if (state.events.some((event) => event.type === 'splash' && event.text === 'terrain')) blocked = true;
    }
    expect(enemy.hp).toBe(hp);
    expect(blocked).toBe(true);
  });

  it('sends a pirate after a nearby navy ship instead of a distant player', () => {
    const state = fresh(2);
    state.aiEnabled = false;
    const player = getPlayer(state);
    const pirate = state.ships.find((ship) => ship.faction === 'pirate');
    const navy = state.ships.find((ship) => ship.faction === 'navy');
    const raider = state.ships.find((ship) => ship.faction === 'raider');
    if (!player || !pirate || !navy || !raider) throw new Error('ships missing');
    player.x = 0;
    player.z = -90;
    raider.x = 90;
    raider.z = 90;
    pirate.x = 0;
    pirate.z = 0;
    pirate.heading = 0;
    pirate.reloadPort = 0;
    pirate.speed = 0;
    navy.x = 18;
    navy.z = 0;
    navy.heading = Math.PI;
    const playerHp = player.hp;
    expect(selectTarget(pirate, state.ships)?.id).toBe(navy.id);
    state.aiEnabled = true;
    step(state, NO_INPUT, 0.35);
    expect(pirate.focusId).toBe(navy.id);
    expect(player.hp).toBe(playerHp);
    state.aiEnabled = false;
    pirate.x = 0;
    pirate.z = 0;
    pirate.heading = 0;
    pirate.speed = 0;
    pirate.reloadPort = 0;
    navy.x = 18;
    navy.z = 0;
    navy.alive = true;
    const navyHp = navy.hp;
    fireBroadside(state, pirate, 'port');
    for (let i = 0; i < 50; i += 1) step(state, NO_INPUT, 1 / 60);
    expect(navy.hp).toBeLessThan(navyHp);
  });

  it('steers an approaching ship off a rock instead of holding the collision course', () => {
    const island = { kind: 'island' as const, x: 0, z: 20, radius: 8 };
    const ship = { x: 0, z: 0, heading: 0, beam: 2.6 };
    const adjusted = avoidTerrainHeading(ship, 0, [island]);
    expect(Math.abs(adjusted)).toBeGreaterThan(0.4);
    const noseX = Math.sin(adjusted);
    const noseZ = Math.cos(adjusted);
    expect(terrainBlocks(ship.x + noseX * 14, ship.z + noseZ * 14, ship.beam * 0.55, [island])).toBe(false);
  });
});
