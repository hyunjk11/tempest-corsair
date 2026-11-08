import { describe, expect, it } from 'vitest';
import { handlingFor } from '../src/sim/balance';
import { createCampaign, fireBroadside, getPlayer, settleWorld, step } from '../src/sim/simulation';
import { aimHint, MATCH_TERRAIN, beginMatch, buyUpgrade, canBuyUpgrade, stepMatch } from '../src/sim/match';
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
    const player = state.ships.find((ship) => ship.faction === 'player');
    const fish = state.match?.fish[0];
    if (!home || !away || !player || !fish) throw new Error('missing');
    const speed = handlingFor({ faction: 'player', sailTier: 0 }).maxSpeed;
    const portSeconds = Math.hypot(home.x - away.x, home.z - away.z) / speed;
    const fishSeconds = Math.hypot(player.x - fish.x, player.z - fish.z) / speed;
    expect(portSeconds).toBeGreaterThan(50);
    expect(fishSeconds).toBeGreaterThan(5);
    expect(fishSeconds).toBeLessThan(12);
    for (const ship of state.ships) {
      if (ship.faction === 'player') continue;
      const dist = Math.hypot(ship.x - player.x, ship.z - player.z);
      if (ship.team === 'friendly') expect(ship.z).toBeLessThan(player.z);
      else expect(dist).toBeGreaterThan(140);
    }
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
    player.hp = player.maxHp;
    spot.cooldown = 0;
    tick(state, 0.05);
    expect(state.match?.prompt).toContain('선체는 이미 가득하다');
    expect(state.match?.prompt).toContain('금화 +5');
    expect(state.match?.prompt).not.toContain('수리 +0');
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
    expect(state.match.prompt).toContain(`${pirate.name} 격침`);
    expect(state.match.prompt).toContain('금화 +18');
    expect(state.match.prompt).toContain('경험 +22');
    state.match.level = 1;
    state.gold = 40;
    player.x = -16;
    player.z = -338;
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
    expect(player.hp).toBeGreaterThan(40);
    const homeAgain = state.match.harbors.find((harbor) => harbor.id === 'home');
    expect(homeAgain && Math.hypot(player.x - homeAgain.x, player.z - homeAgain.z)).toBeLessThan(40);
    expect(state.status).toBe('playing');
    player.hp = 0;
    tick(state, 0.05);
    expect(player.alive).toBe(false);
    expect(state.match.objective).toContain('침몰');
    for (let i = 0; i < 30 * 9; i += 1) tick(state, 1 / 30);
    expect(player.alive).toBe(true);
  });

  it('holds the typhoon until after the opening and steers a pusher off a rock', () => {
    const state = voyage();
    state.aiEnabled = false;
    state.time = 30;
    tick(state, 0.2);
    expect(state.weather.phase).toBe('calm');
    state.time = 100;
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

  it('aims the smart shot at a pirate even when an ally is closer', () => {
    const state = voyage();
    state.aiEnabled = false;
    const player = getPlayer(state);
    const ally = state.ships.find((ship) => ship.team === 'friendly' && ship.faction !== 'player');
    const pirate = state.ships.find((ship) => ship.team === 'neutral');
    if (!player || !ally || !pirate) throw new Error('missing');
    state.playerInvuln = 0;
    player.heading = 0;
    player.reloadPort = 0;
    ally.x = player.x - 8;
    ally.z = player.z;
    pirate.x = player.x + 8;
    pirate.z = player.z;
    pirate.hp = 16;
    const allyHp = ally.hp;
    tick(state, 0.05, { ...NO_INPUT, fireSmart: true });
    for (let i = 0; i < 40; i += 1) tick(state, 1 / 60);
    expect(ally.hp).toBe(allyHp);
    expect(pirate.alive).toBe(false);
    expect(state.match?.xp).toBeGreaterThan(0);
    expect(state.match?.strike).toContain('명중');
  });

  it('does not fire Space when the target is dead ahead', () => {
    const state = voyage();
    state.aiEnabled = false;
    const player = getPlayer(state);
    const pirate = state.ships.find((ship) => ship.team === 'neutral');
    if (!player || !pirate) throw new Error('missing');
    player.heading = 0;
    player.reloadPort = 0;
    player.reloadStarboard = 0;
    pirate.x = player.x;
    pirate.z = player.z + 20;
    const shots = state.shotsFired;
    tick(state, 0.05, { ...NO_INPUT, fireSmart: true });
    expect(state.shotsFired).toBe(shots);
    expect(aimHint(state)).toContain('돌리라');
    expect(state.match?.objective).toContain('경험');
  });

  it('lets a pusher bombard the enemy fort once the lane opens', () => {
    const state = voyage();
    const away = state.match?.harbors.find((harbor) => harbor.id === 'away');
    const pusher = state.ships.find((ship) => ship.duty === 'push' && ship.team === 'friendly');
    if (!away || !pusher || !state.match) throw new Error('missing');
    state.time = 110;
    state.aiEnabled = true;
    for (const ship of state.ships) {
      if (ship.id === pusher.id || ship.faction === 'player') continue;
      ship.x = -400;
      ship.z = -400;
    }
    pusher.x = away.x;
    pusher.z = away.z - 40;
    pusher.heading = Math.PI / 2;
    pusher.reloadPort = 0;
    pusher.reloadStarboard = 0;
    const before = away.hp;
    for (let i = 0; i < 90; i += 1) tick(state, 1 / 30);
    expect(away.hp).toBeLessThan(before);
    expect(away.maxHp).toBeLessThan(400);
    const player = getPlayer(state);
    const decoy = state.ships.find((ship) => ship.team === 'neutral');
    if (!player || !decoy) throw new Error('missing');
    decoy.alive = true;
    decoy.duty = 'prize';
    decoy.x = 0;
    decoy.z = 0;
    player.x = away.x;
    player.z = away.z - 30;
    state.time = 120;
    state.match.treasureSpawned = true;
    tick(state, 0.05);
    expect(state.match.objective).toContain('적 항구');
    expect(state.match.objective).not.toContain('보물선');
  });

  it('turns a kraken slam that empties the hull into a countdown and a second respawn', () => {
    const state = voyage();
    state.aiEnabled = false;
    const player = getPlayer(state);
    if (!player || !state.match) throw new Error('missing');
    state.playerInvuln = 0;
    player.hp = 18;
    state.kraken = {
      x: player.x,
      z: player.z + 10,
      hp: 100,
      maxHp: 100,
      alive: true,
      phase: 'telegraph',
      timer: 0.01,
      markers: [{ x: player.x, z: player.z, radius: 9 }],
      strikeApplied: false,
      sinkT: 0,
      hitFlash: 0,
      anim: 0,
    };
    tick(state, 0.05);
    expect(player.alive).toBe(false);
    expect(player.hp).toBe(0);
    expect(player.sinking).toBe(true);
    expect(state.match.downed).toBe(true);
    expect(state.match.objective).toContain('침몰');
    expect(state.status).toBe('playing');
    for (let i = 0; i < 30 * 9; i += 1) tick(state, 1 / 30);
    expect(player.alive).toBe(true);
    expect(player.hp).toBeGreaterThan(40);
  });

  it('explains a short approach and slows a rush into the service ring', () => {
    const state = voyage();
    state.aiEnabled = false;
    const player = getPlayer(state);
    const home = state.match?.harbors.find((harbor) => harbor.id === 'home');
    if (!player || !home || !state.match) throw new Error('missing');
    for (const ship of state.ships) {
      if (ship.faction === 'player' || ship.team !== 'friendly') continue;
      expect(Math.hypot(ship.x - home.x, ship.z - home.z)).toBeGreaterThan(home.dock);
    }
    player.x = home.x;
    player.z = home.z + 26;
    player.heading = Math.PI;
    player.speed = 0;
    state.gold = 35;
    tick(state, 0.05);
    expect(state.match.docked).toBe(true);
    expect(state.match.nearDock).toBe(true);
    expect(canBuyUpgrade(state, 'sails')).toMatchObject({ ok: false, reason: 'level' });
    expect(state.match.prompt).toContain('레벨 1');
    expect(state.match.prompt).toContain('경험 0/34');
    expect(state.match.objective).toContain('노란 정비 원');
    player.z = home.z + 50;
    player.heading = Math.PI;
    tick(state, 0.05);
    expect(state.match.docked).toBe(false);
    expect(state.match.nearDock).toBe(true);
    expect(state.match.prompt).toContain('노란 정비 원까지');
    expect(state.match.prompt).toContain('전진을 놓으면');
    expect(state.match.prompt).not.toContain('전속');
    expect(state.match.objective).toContain('전진을 놓으면');
    expect(canBuyUpgrade(state, 'sails')).toMatchObject({ ok: false, reason: 'far' });
    state.match.level = 1;
    state.gold = 40;
    player.z = home.z + 26;
    expect(buyUpgrade(state, 'sails')).toEqual({ ok: true });
    player.z = home.z + 40;
    player.heading = Math.PI;
    player.speed = 12;
    const hold = { ...NO_INPUT, throttle: 1 };
    for (let i = 0; i < 90; i += 1) tick(state, 1 / 30, hold);
    expect(player.speed).toBeLessThan(6);
    expect(Math.hypot(player.x - home.x, player.z - home.z)).toBeLessThan(home.dock);
  });
});
