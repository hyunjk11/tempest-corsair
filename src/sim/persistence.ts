import type { Upgrades } from './types';

export const SAVE_KEY = 'tempest-corsair-v1';

export interface SaveData {
  v: 1;
  stageIndex: number;
  gold: number;
  upgrades: Upgrades;
  campaignCleared: boolean;
  pendingUpgrade: boolean;
  pendingPurchased: boolean;
  muted: boolean;
  shake: boolean;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function isTier(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 3;
}

export function parseSave(raw: string | null): SaveData | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<SaveData>;
    if (data.v !== 1) return null;
    if (typeof data.stageIndex !== 'number' || !Number.isInteger(data.stageIndex) || data.stageIndex < 0 || data.stageIndex > 5) {
      return null;
    }
    if (typeof data.gold !== 'number' || !Number.isFinite(data.gold) || data.gold < 0) return null;
    const upgrades = data.upgrades;
    if (!upgrades || !isTier(upgrades.hull) || !isTier(upgrades.sails) || !isTier(upgrades.cannons)) return null;
    if (typeof data.campaignCleared !== 'boolean') return null;
    if (typeof data.pendingUpgrade !== 'boolean') return null;
    if (typeof data.pendingPurchased !== 'boolean') return null;
    return {
      v: 1,
      stageIndex: data.stageIndex,
      gold: data.gold,
      upgrades: { hull: upgrades.hull, sails: upgrades.sails, cannons: upgrades.cannons },
      campaignCleared: data.campaignCleared,
      pendingUpgrade: data.pendingUpgrade,
      pendingPurchased: data.pendingPurchased,
      muted: data.muted === true,
      shake: data.shake !== false,
    };
  } catch {
    return null;
  }
}

export function writeSave(store: KeyValueStore, data: SaveData): void {
  store.setItem(SAVE_KEY, JSON.stringify(data));
}

export function readSave(store: KeyValueStore): SaveData | null {
  return parseSave(store.getItem(SAVE_KEY));
}

export function clearSave(store: KeyValueStore): void {
  store.removeItem(SAVE_KEY);
}
