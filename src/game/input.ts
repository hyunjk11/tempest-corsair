import { clamp } from '../sim/math';
import type { Input } from '../sim/types';

/**
 * Ship-relative helm.
 * Positive turn increases heading, which yaws toward port (ship left, screen left
 * with the chase camera). Right / starboard is therefore negative.
 */
export function sailingTurn(left: boolean, right: boolean): number {
  let turn = 0;
  if (left) turn += 1;
  if (right) turn -= 1;
  return clamp(turn, -1, 1);
}

const GAME_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'KeyQ',
  'KeyE',
  'Space',
]);

export class InputController {
  private readonly keys = new Set<string>();
  readonly touch = { up: false, down: false, left: false, right: false, port: false, starboard: false, smart: false };
  private mouseSmart = false;
  private readonly getPlaying: () => boolean;

  constructor(getPlaying: () => boolean) {
    this.getPlaying = getPlaying;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.clear);
  }

  snapshot(): Input {
    const up = this.keys.has('KeyW') || this.keys.has('ArrowUp') || this.touch.up;
    const down = this.keys.has('KeyS') || this.keys.has('ArrowDown') || this.touch.down;
    const left = this.keys.has('KeyA') || this.keys.has('ArrowLeft') || this.touch.left;
    const right = this.keys.has('KeyD') || this.keys.has('ArrowRight') || this.touch.right;
    let throttle = 0;
    if (up) throttle += 1;
    if (down) throttle -= 0.55;
    return {
      throttle: clamp(throttle, -0.55, 1),
      turn: sailingTurn(left, right),
      firePort: this.keys.has('KeyQ') || this.touch.port,
      fireStarboard: this.keys.has('KeyE') || this.touch.starboard,
      fireSmart: this.keys.has('Space') || this.touch.smart || this.mouseSmart,
    };
  }

  setMouseSmart(down: boolean): void {
    this.mouseSmart = down;
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    if (this.getPlaying() && GAME_KEYS.has(event.code)) event.preventDefault();
    this.keys.add(event.code);
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private clear = (): void => {
    this.keys.clear();
    this.mouseSmart = false;
    this.touch.up = false;
    this.touch.down = false;
    this.touch.left = false;
    this.touch.right = false;
    this.touch.port = false;
    this.touch.starboard = false;
    this.touch.smart = false;
  };
}

export function bindHold(button: HTMLElement, set: (held: boolean) => void): void {
  const down = (event: PointerEvent) => {
    event.preventDefault();
    set(true);
    button.setPointerCapture(event.pointerId);
  };
  const up = () => set(false);
  button.addEventListener('pointerdown', down);
  button.addEventListener('pointerup', up);
  button.addEventListener('pointercancel', up);
  button.addEventListener('lostpointercapture', up);
}

export function bindStick(root: HTMLElement, nub: HTMLElement, touch: InputController['touch']): void {
  let pointer: number | null = null;
  const move = (event: PointerEvent) => {
    if (pointer !== event.pointerId) return;
    const rect = root.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = event.clientX - cx;
    let dy = event.clientY - cy;
    const max = rect.width * 0.34;
    const mag = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(mag, max);
    dx = (dx / mag) * clamped;
    dy = (dy / mag) * clamped;
    nub.style.transform = `translate(${dx}px, ${dy}px)`;
    touch.right = dx > 14;
    touch.left = dx < -14;
    touch.up = dy < -14;
    touch.down = dy > 14;
  };
  const end = (event: PointerEvent) => {
    if (pointer !== event.pointerId) return;
    pointer = null;
    nub.style.transform = 'translate(0, 0)';
    touch.up = false;
    touch.down = false;
    touch.left = false;
    touch.right = false;
  };
  root.addEventListener('pointerdown', (event) => {
    pointer = event.pointerId;
    root.setPointerCapture(event.pointerId);
    move(event);
  });
  root.addEventListener('pointermove', move);
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);
}
