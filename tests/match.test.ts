import { describe, expect, it } from 'vitest';
import { createCampaign, fireBroadside, getPlayer, settleWorld, step } from '../src/sim/simulation';
import { MATCH_TERRAIN, beginMatch, buyUpgrade, stepMatch } from '../src/sim/match';
import { terrainBlocks } from '../src/sim/terrain';
import { NO_INPUT } from './helpers';

function voyage() {
  const state = createCampaign(3);
  beginMatch(state);
  return state;
}

function tick(state: ReturnType<typeof voyage>, dt = 1 / 30, input = NO_INPUT) {
  step(state, input, dt);
  stepMatch(state, dt);
  settleWorld(state);
}

describe('harbor match', () => {
  it('keeps spawns, fish, and forts out of the rocks', () => {
    const state = voyage();
    const pads = [
      ...state.ships.map((ship) => ({ x: ship.x, z: ship.z, pad: ship.beam })),
      ...(state.match?.fish ?? []).map((spot) => ({ x: spot.x, z: spot.z, pad: 1.2 })),
      ...(state.match?.harbors ?? []).map((harbor) => ({ x: harbor.x, z: harbor.z, pad: harbor.core })),
    ];
    for (const point of pads) expect(terrainBlocks(point.x, point.z, point.pad, MATCH_TERRAIN)).toBe(false);
    const home = state.match?.harbors.find((harbor) => harbor.id === 'home');
    const away = state.match?.harbors.find((harbor) => harbor.id === 'away');
    expect(home && away && Math.hypot(home.x - away.x, home.z - away.z)).toBeGreaterThan(120);
  });

  it('heals from a fish once and then waits out the cooldown', () => {
    const state = voyage();
    state.aiEnabled = false;
    const player = getPlayer(state);
    const spot = state.match?.fish[0];
    if (!player || !spot) throw new Error('missing');
    player.hp = 40;
    player.x = spot.x;
    player.z = spot.z;
    const gold = state.gold;
    const xp = state.match?.xp ?? 0;
    tick(state, 0.05);
    expect(player.hp).toBeGreaterThan(40);
    expect(state.gold).toBe(gold + 5);
    expect(state.match?.xp).toBe(xp);
    const healed = player.hp;
    tick(state, 0.05);
    expect(player.hp).toBe(healed);
    expect(state.gold).toBe(gold + 5);
    spot.cooldown = 0;
    player.hp = 40;
    tick(state, 0.05);
    expect(player.hp).toBeGreaterThan(40);
  });

  it('levels from a neutral kill and spends that level at the friendly port', () => {
    const state = voyage();
    state.aiEnabled = false;
    const player = getPlayer(state);
    const pirate = state.ships.find((ship) => ship.team === 'neutral');
    if (!player || !pirate || !state.match) throw new Error('missing');
    pirate.x = player.x + 7;
    pirate.z = player.z;
    pirate.hp = 16;
    player.heading = 0;
    player.reloadPort = 0;
    state.playerInvuln = 0;
    fireBroadside(state, player, 'port');
    for (let i = 0; i < 40; i += 1) tick(state, 1 / 60);
    expect(pirate.alive).toBe(false);
    expect(state.match.level).toBe(0);
    expect(state.gold).toBeGreaterThan(12);
    state.match.level = 1;
    state.gold = 40;
    player.x = -8;
    player.z = -62;
    expect(buyUpgrade(state, 'sails')).toEqual({ ok: true });
    expect(player.sailTier).toBe(1);
    expect(buyUpgrade(state, 'hull')).toMatchObject({ ok: false, reason: 'gold' });
    player.x = 40;
    player.z = 40;
    state.gold = 200;
    expect(buyUpgrade(state, 'hull')).toMatchObject({ ok: false, reason: 'far' });
  });

  it('does not let friendlies hurt each other, and neutrals do fight both sides', () => {
    const state = voyage();
    state.aiEnabled = false;
    const player = getPlayer(state);
    const ally = state.ships.find((ship) => ship.team === 'friendly' && ship.faction !== 'player');
    const pirate = state.ships.find((ship) => ship.team === 'neutral');
    if (!player || !ally || !pirate) throw new Error('missing');
    ally.x = 8;
    ally.z = 0;
    ally.heading = 0;
    player.x = 0;
    player.z = 0;
    player.heading = 0;
    const allyHp = ally.hp;
    fireBroadside(state, player, 'port');
    for (let i = 0; i < 30; i += 1) tick(state, 1 / 60);
    expect(ally.hp).toBe(allyHp);
    ally.x = 80;
    ally.z = 80;
    pirate.x = 8;
    pirate.z = 0;
    pirate.heading = Math.PI;
    pirate.reloadPort = 0;
    const playerHp = player.hp;
    state.playerInvuln = 0;
    fireBroadside(state, pirate, 'port');
    for (let i = 0; i < 40; i += 1) tick(state, 1 / 60);
    expect(player.hp).toBeLessThan(playerHp);
  });

  it('damages the enemy fort once and declares victory a single time', () => {
    const state = voyage();
    state.aiEnabled = false;
    const away = state.match?.harbors.find((harbor) => harbor.id === 'away');
    const player = getPlayer(state);
    if (!away || !player) throw new Error('missing');
    player.x = away.x + away.core + 4;
    player.z = away.z;
    player.heading = 0;
    player.reloadStarboard = 0;
    away.hp = 10;
    fireBroadside(state, player, 'starboard');
    tick(state, 0.4);
    expect(away.hp).toBeLessThan(10);
    away.hp = 0;
    tick(state, 0.05);
    expect(state.match?.result).toBe('victory');
    const gold = state.gold;
    tick(state, 2);
    expect(state.status).toBe('victory');
    expect(state.gold).toBe(gold);
    tick(state, 1);
    expect(state.status).toBe('victory');
  });

  it('loses when the home fort falls and respawns a sunk player without ending the match', () => {
    const lost = voyage();
    const home = lost.match?.harbors.find((harbor) => harbor.id === 'home');
    if (!home || !lost.match) throw new Error('missing');
    home.hp = 0;
    tick(lost, 0.05);
    expect(lost.match.result).toBe('defeat');
    tick(lost, 1);
    expect(lost.status).toBe('defeat');

    const state = voyage();
    state.aiEnabled = false;
    const player = getPlayer(state);
    if (!player || !state.match) throw new Error('missing');
    state.gold = 40;
    state.playerInvuln = 0;
    player.alive = false;
    player.hp = 0;
    tick(state, 0.05);
    expect(state.status).toBe('playing');
    expect(state.match.downed).toBe(true);
    expect(state.gold).toBeLessThan(40);
    tick(state, 8.2);
    expect(player.alive).toBe(true);
    expect(player.z).toBeGreaterThan(-74);
    expect(state.status).toBe('playing');
  });

  it('holds the typhoon until after the opening and steers a pusher off a rock', () => {
    const state = voyage();
    state.aiEnabled = false;
    state.time = 30;
    tick(state, 0.2);
    expect(state.weather.phase).toBe('calm');
    state.time = 86;
    tick(state, 0.2);
    expect(state.weather.phase).toBe('warning');
    const pusher = state.ships.find((ship) => ship.duty === 'push' && ship.team === 'enemy');
    const island = MATCH_TERRAIN[0];
    if (!pusher || !island) throw new Error('missing');
    pusher.x = island.x;
    pusher.z = island.z + island.radius + 2;
    pusher.heading = Math.PI;
    const before = pusher.z;
    for (let i = 0; i < 20; i += 1) tick(state, 1 / 20);
    expect(terrainBlocks(pusher.x, pusher.z, pusher.beam * 0.4, MATCH_TERRAIN)).toBe(false);
    expect(pusher.z).toBeLessThan(before + 1);
  });
});
