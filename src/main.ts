import './style.css';
import { Game } from './game/Game';

const canvas = document.querySelector<HTMLCanvasElement>('#sea');
if (!canvas) throw new Error('canvas missing');

const game = new Game(canvas);
const params = new URLSearchParams(location.search);
if (params.has('mute')) game.setMuted(true);
if (params.has('autostart')) {
  const stage = Number(params.get('stage') ?? '0');
  const upgrades = params.has('upgrades') ? Number(params.get('upgrades')) : undefined;
  game.debugStart(Number.isFinite(stage) ? stage : 0, upgrades);
}

declare global {
  interface Window {
    __CORSAIR__?: {
      startStage: (stage: number, upgrades?: number) => void;
      status: () => string;
      snapshot: () => unknown;
      storm: () => void;
      audio: () => { muted: boolean; unlocked: boolean; context: string; voices: number; audible: boolean; level: number };
      unlockAudio: () => void;
      debugTone: () => void;
    };
  }
}

window.__CORSAIR__ = {
  startStage: (stage, upgrades) => game.debugStart(stage, upgrades),
  status: () => game.status(),
      snapshot: () => game.debugSnapshot(),
      storm: () => game.debugStorm(),
      audio: () => game.audioStatus(),
      unlockAudio: () => game.unlockAudio(),
      debugTone: () => game.debugTone(),
    };
