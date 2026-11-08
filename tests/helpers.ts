import { beginStage, createCampaign } from '../src/sim/simulation';
import type { Input, SimState } from '../src/sim/types';

export const NO_INPUT: Input = {
  throttle: 0,
  turn: 0,
  firePort: false,
  fireStarboard: false,
  fireSmart: false,
};

export function fresh(stage = 0, seed = 1): SimState {
  const state = createCampaign(seed);
  beginStage(state, stage);
  return state;
}

export function memoryStore() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}
