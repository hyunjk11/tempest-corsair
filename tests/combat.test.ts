import { describe, expect, it } from 'vitest';
import { bestSide, navyDesiredHeading, navyIntent, pirateDesiredHeading, pirateIntent } from '../src/sim/ai';
import { forward, sideDirection } from '../src/sim/math';
import { ellipseHit, fireBroadside, getPlayer, step } from '../src/sim/simulation';
import { fresh, NO_INPUT } from './helpers';

describe('broadside combat', () => {
  it('fires starboard along local -X when heading is zero', () => {
    const state = fresh(0);
    state.aiEnabled = false;
    const player = getPlayer(state);
    if (!player) throw new Error('player missing');
    player.x = 0;
    player.z = 0;
    player.heading = 0;
    const shots = fireBroadside(state, player, 'starboard');
    expect(shots).toBe(1);
    const ball = state.projectiles[0];
    if (!ball) throw new Error('ball missing');
    expect(ball.vx).toBeLessThan(0);
    expect(Math.abs(ball.vz)).toBeLessThan(Math.abs(ball.vx));
    expect(ball.x).toBeLessThan(0);
  });

  it('does not fire again until the broadside reloads', () => {
    const state = fresh(0);
    const player = getPlayer(state);
    if (!player) throw new Error('player missing');
    expect(fireBroadside(state, player, 'port')).toBe(1);
    expect(fireBroadside(state, player, 'port')).toBe(0);
    step(state, NO_INPUT, player.reloadPort);
    expect(fireBroadside(state, player, 'port')).toBe(1);
  });

  it('damages a hostile ship and ignores the owner', () => {
    const state = fresh(0);
    state.aiEnabled = false;
    const player = getPlayer(state);
    const enemy = state.ships.find((ship) => ship.faction === 'pirate');
    if (!player || !enemy) throw new Error('ships missing');
    player.x = 0;
    player.z = 0;
    player.heading = 0;
    player.speed = 0;
    enemy.x = 6;
    enemy.z = 0;
    enemy.heading = 0;
    enemy.hp = 16;
    const hp = enemy.hp;
    fireBroadside(state, player, 'port');
    for (let i = 0; i < 40; i += 1) step(state, NO_INPUT, 1 / 60);
    expect(enemy.hp).toBeLessThan(hp);
    expect(player.hp).toBe(player.maxHp);
    expect(state.projectiles.every((ball) => ball.ownerId !== enemy.id)).toBe(true);
  });

  it('does not let a shot damage the firing faction', () => {
    const state = fresh(1);
    state.aiEnabled = false;
    const pirates = state.ships.filter((ship) => ship.faction === 'pirate');
    const shooter = pirates[0];
    const ally = pirates[1];
    if (!shooter || !ally) throw new Error('pirates missing');
    shooter.x = 0;
    shooter.z = 0;
    shooter.heading = 0;
    shooter.reloadPort = 0;
    ally.x = 6;
    ally.z = 0;
    const hp = ally.hp;
    fireBroadside(state, shooter, 'port');
    for (let i = 0; i < 40; i += 1) step(state, NO_INPUT, 1 / 60);
    expect(ally.hp).toBe(hp);
    expect(ally.alive).toBe(true);
  });

  it('lets a pirate shot hurt the player', () => {
    const state = fresh(0);
    state.aiEnabled = false;
    const player = getPlayer(state);
    const pirate = state.ships.find((ship) => ship.faction === 'pirate');
    if (!player || !pirate) throw new Error('ships missing');
    pirate.x = 0;
    pirate.z = 0;
    pirate.heading = 0;
    pirate.reloadPort = 0;
    player.x = 6;
    player.z = 0;
    const hp = player.hp;
    fireBroadside(state, pirate, 'port');
    for (let i = 0; i < 40; i += 1) step(state, NO_INPUT, 1 / 60);
    expect(player.hp).toBeLessThan(hp);
  });

  it('uses an ellipse so a shot beside the bow is not a center miss', () => {
    const state = fresh(0);
    const player = getPlayer(state);
    if (!player) throw new Error('player missing');
    player.x = 0;
    player.z = 0;
    player.heading = 0;
    expect(ellipseHit(0, player.length * 0.3, player)).toBe(true);
    expect(ellipseHit(player.beam * 3, 0, player)).toBe(false);
  });

  it('declares victory once every enemy hull is gone and defeat when the player sinks', () => {
    const victory = fresh(0);
    victory.aiEnabled = false;
    const enemy = victory.ships.find((ship) => ship.faction !== 'player');
    if (!enemy) throw new Error('enemy missing');
    const before = victory.gold;
    enemy.hp = 0;
    step(victory, NO_INPUT, 0.1);
    expect(victory.status).toBe('playing');
    expect(victory.finale).toBe('victory');
    expect(victory.gold).toBeGreaterThan(before);
    step(victory, NO_INPUT, 1.2);
    expect(victory.status).toBe('victory');

    const defeat = fresh(0);
    defeat.aiEnabled = false;
    const player = getPlayer(defeat);
    if (!player) throw new Error('player missing');
    player.hp = 0;
    step(defeat, NO_INPUT, 0.05);
    expect(defeat.finale).toBe('defeat');
    step(defeat, NO_INPUT, 1);
    expect(defeat.status).toBe('defeat');
    expect(defeat.stageIndex).toBe(0);
  });
});

describe('ship behavior', () => {
  it('sends pirates after distant prey and the navy back when crowded', () => {
    expect(pirateDesiredHeading(0, 80, 0, 80)).toBeCloseTo(Math.PI / 2);
    const away = navyDesiredHeading(0, 0, 10, 10);
    expect(Math.cos(away)).toBeCloseTo(-1);
    expect(Math.sin(away)).toBeCloseTo(0);
    const mid = pirateDesiredHeading(0, 0, 24, 24);
    const offStarboard = Math.abs(mid - Math.PI / 2);
    const offPort = Math.abs(mid + Math.PI / 2);
    expect(Math.min(offStarboard, offPort)).toBeLessThan(0.01);
  });

  it('gives pirates a wider firing window than the navy', () => {
    const state = fresh(2);
    const navy = state.ships.find((ship) => ship.faction === 'navy');
    const pirateState = fresh(0);
    const pirate = pirateState.ships.find((ship) => ship.faction === 'pirate');
    if (!navy || !pirate) throw new Error('ships missing');
    navy.x = 0;
    navy.z = 0;
    navy.heading = 0;
    navy.reloadStarboard = 0;
    pirate.x = 0;
    pirate.z = 0;
    pirate.heading = 0;
    pirate.reloadStarboard = 0;
    const angle = -Math.PI / 2 + 0.34;
    const dist = 30;
    const target = { x: Math.sin(angle) * dist, z: Math.cos(angle) * dist };
    expect(bestSide(navy, target.x, target.z).error).toBeGreaterThan(0.3);
    expect(bestSide(navy, target.x, target.z).error).toBeLessThan(0.42);
    expect(pirateIntent(pirate, target).fire).toBe('starboard');
    expect(navyIntent(navy, target).fire).toBeNull();
  });

  it('keeps port and starboard opposite the bow', () => {
    const nose = forward(0.4);
    const port = sideDirection(0.4, 'port');
    const star = sideDirection(0.4, 'starboard');
    expect(nose.x * port.x + nose.z * port.z).toBeCloseTo(0);
    expect(port.x * star.x + port.z * star.z).toBeCloseTo(-1);
    expect(sideDirection(0, 'starboard').x).toBeCloseTo(-1);
  });
});
