export const SAVE_KEY = 'tempest-corsair-v2';

export interface SettingsSave {
  v: 2;
  muted: boolean;
  shake: boolean;
  /** A chapter save from the previous voyage. It does not resume a stage. */
  legacyCampaign: boolean;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function parseSave(raw: string | null): SettingsSave | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as { v?: unknown; muted?: unknown; shake?: unknown; stageIndex?: unknown };
    if (data.v === 1 && typeof data.stageIndex === 'number') {
      return { v: 2, muted: data.muted === true, shake: data.shake !== false, legacyCampaign: true };
    }
    if (data.v !== 2) return null;
    return { v: 2, muted: data.muted === true, shake: data.shake !== false, legacyCampaign: false };
  } catch {
    return null;
  }
}

export function writeSave(store: KeyValueStore, data: SettingsSave): void {
  store.setItem(SAVE_KEY, JSON.stringify(data));
}

export function readSave(store: KeyValueStore): SettingsSave | null {
  return parseSave(store.getItem(SAVE_KEY));
}

/** Reads whichever key is present so an old chapter save still migrates. */
export function readAnySave(store: KeyValueStore): SettingsSave | null {
  return parseSave(store.getItem(SAVE_KEY) ?? store.getItem('tempest-corsair-v1'));
}

export function clearSave(store: KeyValueStore): void {
  store.removeItem(SAVE_KEY);
  store.removeItem('tempest-corsair-v1');
}
