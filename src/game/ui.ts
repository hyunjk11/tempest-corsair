import { playerShipName, STAGES, upgradeCard } from '../sim/balance';
import type { Faction } from '../sim/types';
import type { SimState, Track, WeatherPhase } from '../sim/types';

export interface HudModel {
  chapter: string;
  stage: string;
  gold: number;
  enemies: number;
  enemyLabel: string;
  hull: number;
  hullText: string;
  port: number;
  starboard: number;
  kraken: number | null;
  sailHint: boolean;
  fireHint: boolean;
  banner: string;
  bannerKind: 'alert' | 'info' | 'none';
  weather: WeatherPhase;
  levelText: string;
  homeHp: number;
  awayHp: number;
  prompt: string;
  dock: null | { hull: string; sails: string; cannons: string; hullOk: boolean; sailsOk: boolean; cannonsOk: boolean };
}

export interface UiHooks {
  start: () => void;
  continueGame: () => void;
  askReset: () => void;
  confirmReset: () => void;
  cancelReset: () => void;
  resume: () => void;
  retry: () => void;
  title: () => void;
  toUpgrade: () => void;
  sail: () => void;
  buy: (track: Track) => void;
  mute: (muted: boolean) => void;
  shake: (enabled: boolean) => void;
  pause: () => void;
  toggleSound: () => void;
  zoom: () => void;
}

function must<T extends Element>(id: string): T {
  const node = document.querySelector<T>(`#${id}`);
  if (!node) throw new Error(`#${id} missing`);
  return node;
}

export class Ui {
  readonly radar = must<HTMLCanvasElement>('radar');
  private goldShown = -1;
  private legendKey = '';
  private readonly hooks: UiHooks;

  constructor(hooks: UiHooks) {
    this.hooks = hooks;
    must<HTMLButtonElement>('btn-start').addEventListener('click', hooks.start);
    must<HTMLButtonElement>('btn-continue').addEventListener('click', hooks.continueGame);
    must<HTMLButtonElement>('btn-new').addEventListener('click', hooks.askReset);
    must<HTMLButtonElement>('btn-confirm-reset').addEventListener('click', hooks.confirmReset);
    must<HTMLButtonElement>('btn-cancel-reset').addEventListener('click', hooks.cancelReset);
    must<HTMLButtonElement>('btn-resume').addEventListener('click', hooks.resume);
    must<HTMLButtonElement>('btn-retry-pause').addEventListener('click', hooks.retry);
    must<HTMLButtonElement>('btn-title-pause').addEventListener('click', hooks.title);
    must<HTMLButtonElement>('btn-to-upgrade').addEventListener('click', hooks.toUpgrade);
    must<HTMLButtonElement>('btn-sail').addEventListener('click', hooks.sail);
    must<HTMLButtonElement>('btn-retry').addEventListener('click', hooks.retry);
    must<HTMLButtonElement>('btn-title-defeat').addEventListener('click', hooks.title);
    must<HTMLButtonElement>('btn-ending-new').addEventListener('click', hooks.confirmReset);
    must<HTMLButtonElement>('btn-ending-title').addEventListener('click', hooks.title);
    must<HTMLButtonElement>('btn-pause').addEventListener('click', hooks.pause);
    must<HTMLButtonElement>('btn-touch-pause').addEventListener('click', hooks.pause);
    must<HTMLButtonElement>('btn-sound').addEventListener('click', hooks.toggleSound);
    must<HTMLButtonElement>('btn-sound-title').addEventListener('click', hooks.toggleSound);
    must<HTMLButtonElement>('btn-zoom').addEventListener('click', hooks.zoom);
    must<HTMLButtonElement>('buy-hull').addEventListener('click', () => hooks.buy('hull'));
    must<HTMLButtonElement>('buy-sails').addEventListener('click', () => hooks.buy('sails'));
    must<HTMLButtonElement>('buy-cannons').addEventListener('click', () => hooks.buy('cannons'));
    must<HTMLInputElement>('chk-mute').addEventListener('change', (event) => {
      hooks.mute((event.target as HTMLInputElement).checked);
    });
    must<HTMLInputElement>('chk-shake').addEventListener('change', (event) => {
      hooks.shake((event.target as HTMLInputElement).checked);
    });
  }

  fatal(message: string): void {
    const node = must<HTMLElement>('fatal');
    node.hidden = false;
    node.textContent = message;
  }

  setSettings(muted: boolean, shake: boolean): void {
    must<HTMLInputElement>('chk-mute').checked = muted;
    must<HTMLInputElement>('chk-shake').checked = shake;
  }

  setSound(label: string, muted: boolean): void {
    for (const id of ['btn-sound', 'btn-sound-title']) {
      must<HTMLButtonElement>(id).textContent = label;
      must<HTMLButtonElement>(id).setAttribute('aria-pressed', muted ? 'true' : 'false');
    }
  }

  setLegend(items: { faction: Faction; label: string; color: string }[]): void {
    const key = items.map((item) => item.faction).join('|');
    if (key === this.legendKey) return;
    this.legendKey = key;
    const host = must<HTMLElement>('legend');
    host.replaceChildren();
    for (const item of items) {
      const chip = document.createElement('span');
      const swatch = document.createElement('i');
      swatch.style.background = item.color;
      chip.append(swatch, document.createTextNode(item.label));
      host.append(chip);
    }
  }

  showTitle(options: { canContinue: boolean; cleared: boolean }): void {
    this.hideScreens();
    must<HTMLElement>('screen-title').hidden = false;
    must<HTMLElement>('hud').hidden = true;
    document.body.classList.remove('playing');
    must<HTMLButtonElement>('btn-continue').hidden = !options.canContinue;
    must<HTMLButtonElement>('btn-new').hidden = !options.canContinue;
    must<HTMLButtonElement>('btn-start').hidden = options.canContinue;
    must<HTMLElement>('title-cleared').hidden = !options.cleared;
    must<HTMLElement>('title-confirm').hidden = true;
  }

  showResetConfirm(): void {
    must<HTMLElement>('title-confirm').hidden = false;
  }

  hideResetConfirm(): void {
    must<HTMLElement>('title-confirm').hidden = true;
  }

  showPause(): void {
    this.hideScreens();
    must<HTMLElement>('screen-pause').hidden = false;
    document.body.classList.remove('playing');
  }

  showPlay(): void {
    this.hideScreens();
    must<HTMLElement>('hud').hidden = false;
    document.body.classList.add('playing');
  }

  showVictory(name: string, gold: number, next: string | null): void {
    this.hideScreens();
    must<HTMLElement>('screen-victory').hidden = false;
    must<HTMLElement>('hud').hidden = true;
    document.body.classList.remove('playing');
    must<HTMLElement>('victory-name').textContent = name;
    must<HTMLElement>('victory-body').textContent = next
      ? `해역을 돌파했다. 정비 뒤에 다음 바다는 ${next}.`
      : '적 항구가 무너졌다. 다시 출항하면 작은 배에서 시작한다.';
    const again = document.querySelector('#btn-to-upgrade');
    if (again) again.textContent = next ? '전열 정비' : '다시 출항';
    must<HTMLElement>('victory-gold').textContent = `보유 금화 ${gold}`;
  }

  showUpgrade(state: SimState): void {
    this.hideScreens();
    must<HTMLElement>('screen-upgrade').hidden = false;
    must<HTMLElement>('hud').hidden = true;
    document.body.classList.remove('playing');
    const next = STAGES[state.stageIndex + 1];
    must<HTMLButtonElement>('btn-sail').textContent = next ? '다음 해역으로' : '귀환';
    must<HTMLElement>('upgrade-gold').textContent = `보유 금화 ${state.gold}`;
    must<HTMLElement>('upgrade-build').textContent =
      `현재 배 ${playerShipName(state.upgrades.hull)} · 선체 ${state.upgrades.hull}단 · 돛 ${state.upgrades.sails}단 · 함포 ${state.upgrades.cannons}단`;
    const host = must<HTMLElement>('upgrade-cards');
    host.replaceChildren();
    for (const track of ['hull', 'sails', 'cannons'] as const) {
      const card = upgradeCard(state, track);
      const article = document.createElement('article');
      article.className = 'upgrade';
      const title = document.createElement('h3');
      title.textContent = card.title;
      const level = document.createElement('p');
      level.textContent = card.level;
      const detail = document.createElement('p');
      detail.textContent = card.detail;
      const cost = document.createElement('p');
      cost.className = 'cost';
      cost.textContent = card.cost === null ? '최대 강화' : `금화 ${card.cost}`;
      const button = document.createElement('button');
      button.type = 'button';
      button.disabled = !card.canBuy;
      button.textContent = card.maxed ? '최대' : !state.upgradeReady ? '이번 정비 끝' : card.affordable ? '이 강화로 정비' : '금화가 부족하다';
      button.addEventListener('click', () => this.hooks.buy(track));
      article.append(title, level, detail, cost, button);
      host.append(article);
    }
  }

  showDefeat(text?: string): void {
    if (text) {
      const body = document.querySelector('#screen-defeat p');
      if (body) body.textContent = text;
    }
    this.hideScreens();
    must<HTMLElement>('screen-defeat').hidden = false;
    must<HTMLElement>('hud').hidden = true;
    document.body.classList.remove('playing');
  }

  showEnding(): void {
    this.hideScreens();
    must<HTMLElement>('screen-ending').hidden = false;
    must<HTMLElement>('hud').hidden = true;
    document.body.classList.remove('playing');
  }

  setHud(model: HudModel): void {
    must<HTMLElement>('hud-chapter').textContent = model.chapter;
    must<HTMLElement>('hud-stage').textContent = model.stage;
    const gold = must<HTMLElement>('hud-gold');
    gold.textContent = `금화 ${model.gold}`;
    if (this.goldShown >= 0 && model.gold !== this.goldShown) gold.animate([{ transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 220 });
    this.goldShown = model.gold;
    const enemies = document.querySelector('#hud-enemies');
    if (enemies) enemies.textContent = `${model.enemyLabel} ${model.enemies}`;
    must<HTMLElement>('hull-text').textContent = model.hullText;
    must<HTMLElement>('hull-fill').style.width = `${Math.max(0, Math.min(1, model.hull)) * 100}%`;
    must<HTMLElement>('port-fill').style.width = `${Math.max(0, Math.min(1, model.port)) * 100}%`;
    must<HTMLElement>('star-fill').style.width = `${Math.max(0, Math.min(1, model.starboard)) * 100}%`;
    const kraken = must<HTMLElement>('kraken-wrap');
    kraken.hidden = model.kraken === null;
    if (model.kraken !== null) must<HTMLElement>('kraken-fill').style.width = `${model.kraken * 100}%`;
    must<HTMLElement>('sail-hint').hidden = !model.sailHint;
    must<HTMLElement>('fire-hint').hidden = !model.fireHint;
    const banner = must<HTMLElement>('banner');
    banner.hidden = model.bannerKind === 'none';
    banner.classList.toggle('alert', model.bannerKind === 'alert');
    banner.classList.toggle('info', model.bannerKind === 'info');
    must<HTMLElement>('banner-text').textContent = model.banner;
    const chip = must<HTMLElement>('weather-chip');
    chip.hidden = model.weather === 'calm';
    chip.textContent = model.weather === 'warning' ? '태풍 경보' : model.weather === 'storm' ? '태풍' : '바람 잦아드는 중';
    const level = document.querySelector('#hud-level');
    if (level) level.textContent = model.levelText;
    const home = document.querySelector<HTMLElement>('#home-fill');
    const away = document.querySelector<HTMLElement>('#away-fill');
    if (home) home.style.width = `${Math.max(0, Math.min(1, model.homeHp)) * 100}%`;
    if (away) away.style.width = `${Math.max(0, Math.min(1, model.awayHp)) * 100}%`;
    const ports = document.querySelector<HTMLElement>('#ports');
    if (ports) ports.hidden = model.levelText === '';
    const prompt = document.querySelector<HTMLElement>('#harvest-prompt');
    if (prompt) {
      prompt.hidden = model.prompt === '';
      prompt.textContent = model.prompt;
    }
    const downed = document.querySelector<HTMLElement>('#downed');
    if (downed) {
      const sinking = model.banner.includes('침몰');
      downed.hidden = !sinking;
      downed.textContent = sinking ? model.banner : '';
    }
    const dock = document.querySelector<HTMLElement>('#dock');
    if (dock) {
      dock.hidden = model.dock === null;
      if (model.dock) {
        const hull = must<HTMLButtonElement>('buy-hull');
        const sails = must<HTMLButtonElement>('buy-sails');
        const cannons = must<HTMLButtonElement>('buy-cannons');
        hull.textContent = model.dock.hull;
        sails.textContent = model.dock.sails;
        cannons.textContent = model.dock.cannons;
        hull.disabled = !model.dock.hullOk;
        sails.disabled = !model.dock.sailsOk;
        cannons.disabled = !model.dock.cannonsOk;
      }
    }
  }

  setHit(amount: number): void {
    must<HTMLElement>('hit-flash').style.opacity = String(Math.max(0, Math.min(1, amount)));
  }

  private hideScreens(): void {
    for (const id of ['screen-title', 'screen-pause', 'screen-victory', 'screen-upgrade', 'screen-defeat', 'screen-ending']) {
      must<HTMLElement>(id).hidden = true;
    }
  }
}
