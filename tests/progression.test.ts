import { describe, expect, it } from 'vitest';
import { cannonProfile, STAGES, upgradeCard } from '../src/sim/balance';
import { clearSave, parseSave, readAnySave, readSave, writeSave } from '../src/sim/persistence';
import {
  advanceAfterVictory,
  applyUpgrade,
  beginStage,
  fireBroadside,
  getPlayer,
  openUpgrade,
  retryStage,
  step,
} from '../src/sim/simulation';
import { fresh, memoryStore, NO_INPUT } from './helpers';

describe('stage progression and upgrades', () => {
  it('defines a short campaign that ends in a kraken fight', () => {
    expect(STAGES).toHaveLength(6);
    expect(STAGES[0]?.name).toBe('표류하는 약탈자');
    expect(STAGES[0]?.typhoonChance).toBe(0);
    expect(STAGES[3]?.typhoonChance).toBeGreaterThan(0.5);
    expect(STAGES[5]?.kraken).toBeTruthy();
    expect(STAGES[2]?.enemies[0]?.kind).toBe('navy');
    expect(STAGES[4]?.enemies.map((enemy) => enemy.kind).sort()).toEqual(['company', 'navy', 'pirate', 'raider']);
  });

  it('advances only after a victory and heals into the next encounter', () => {
    const state = fresh(0);
    state.aiEnabled = false;
    const enemy = state.ships.find((ship) => ship.faction !== 'player');
    if (!enemy) throw new Error('enemy missing');
    enemy.hp = 0;
    step(state, NO_INPUT, 0.2);
    step(state, NO_INPUT, 1.2);
    expect(state.status).toBe('victory');
    expect(advanceAfterVictory(state)).toBe('next');
    expect(state.stageIndex).toBe(1);
    expect(state.status).toBe('playing');
    const player = getPlayer(state);
    expect(player?.hp).toBe(player?.maxHp);
    expect(state.ships.filter((ship) => ship.faction === 'pirate' && ship.alive)).toHaveLength(2);
    expect(advanceAfterVictory(state)).toBe('blocked');
  });

  it('does not skip ahead from a defeat', () => {
    const state = fresh(2);
    state.status = 'defeat';
    expect(advanceAfterVictory(state)).toBe('blocked');
    expect(state.stageIndex).toBe(2);
  });

  it('clears the campaign after the final victory', () => {
    const state = fresh(5);
    state.aiEnabled = false;
    if (!state.kraken) throw new Error('kraken missing');
    for (const ship of state.ships) {
      if (ship.faction !== 'player') ship.hp = 0;
    }
    state.kraken.hp = 0;
    step(state, NO_INPUT, 0.2);
    step(state, NO_INPUT, 1.2);
    expect(state.status).toBe('victory');
    expect(advanceAfterVictory(state)).toBe('cleared');
    expect(state.campaignCleared).toBe(true);
    expect(state.status).toBe('ending');
  });

  it('spends gold on one upgrade and changes hull, sails, and cannons', () => {
    const state = fresh(0);
    state.gold = 39;
    state.upgradeReady = true;
    expect(applyUpgrade(state, 'sails')).toMatchObject({ ok: false, reason: 'gold' });
    state.gold = 400;
    state.upgradeReady = false;
    expect(applyUpgrade(state, 'hull')).toMatchObject({ ok: false, reason: 'closed' });
    state.upgradeReady = true;
    expect(applyUpgrade(state, 'hull')).toMatchObject({ ok: true, tier: 1 });
    expect(state.upgradeReady).toBe(false);
    const player = getPlayer(state);
    expect(player?.maxHp).toBe(150);
    expect(player?.hp).toBe(150);
    expect(player?.hullTier).toBe(1);
    expect(player?.length).toBeGreaterThan(8.4);

    state.upgradeReady = true;
    expect(applyUpgrade(state, 'cannons')).toMatchObject({ ok: true, tier: 1 });
    beginStage(state, 0);
    const rebuilt = getPlayer(state);
    if (!rebuilt) throw new Error('player missing');
    expect(rebuilt.cannonTier).toBe(1);
    expect(rebuilt.hp).toBe(150);
    expect(fireBroadside(state, rebuilt, 'port')).toBe(2);
    expect(cannonProfile('player', 1).shots).toBe(2);

    state.status = 'victory';
    state.upgradeReady = true;
    applyUpgrade(state, 'sails');
    beginStage(state, 1);
    expect(getPlayer(state)?.sailTier).toBe(1);
  });

  it('refuses upgrades past the last tier', () => {
    const state = fresh(0);
    state.gold = 2000;
    for (let i = 0; i < 3; i += 1) {
      state.upgradeReady = true;
      expect(applyUpgrade(state, 'cannons').ok).toBe(true);
    }
    state.upgradeReady = true;
    expect(applyUpgrade(state, 'cannons')).toMatchObject({ ok: false, reason: 'max' });
    expect(upgradeCard(state, 'cannons').maxed).toBe(true);
  });

  it('rolls encounter gold back when the stage is retried', () => {
    const state = fresh(0);
    const start = state.goldAtStageStart;
    state.gold += 80;
    const player = getPlayer(state);
    if (!player) throw new Error('player missing');
    player.hp = 10;
    retryStage(state);
    expect(state.gold).toBe(start);
    expect(getPlayer(state)?.hp).toBe(100);
    expect(state.status).toBe('playing');
  });

  it('migrates a chapter save into settings and does not resume that stage', () => {
    const store = memoryStore();
    store.setItem(
      'tempest-corsair-v1',
      JSON.stringify({
        v: 1,
        stageIndex: 5,
        gold: 400,
        upgrades: { hull: 3, sails: 3, cannons: 3 },
        campaignCleared: true,
        pendingUpgrade: false,
        pendingPurchased: false,
        muted: true,
        shake: false,
      }),
    );
    expect(readAnySave(store)).toEqual({ v: 2, muted: true, shake: false, legacyCampaign: true });
    const freshSave = { v: 2 as const, muted: false, shake: true, legacyCampaign: false };
    writeSave(store, freshSave);
    expect(readSave(store)).toEqual(freshSave);
    expect(parseSave('not-json')).toBeNull();
    clearSave(store);
    expect(readSave(store)).toBeNull();
    expect(store.getItem('tempest-corsair-v1')).toBeNull();
  });

  it('opens the upgrade screen only from victory', () => {
    const state = fresh(0);
    openUpgrade(state);
    expect(state.status).toBe('playing');
    state.status = 'victory';
    openUpgrade(state);
    expect(state.status).toBe('upgrade');
    expect(advanceAfterVictory(state)).toBe('next');
  });
});
