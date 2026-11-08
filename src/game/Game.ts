import * as THREE from 'three';
import { cannonProfile, FACTION_META, hullStats, playerShipName, STAGES } from '../sim/balance';
import { forward, sideDirection } from '../sim/math';
import { clearSave, readAnySave, writeSave, type SettingsSave } from '../sim/persistence';
import { aimHint, beginMatch, buyUpgrade, canBuyUpgrade, dockCost, stepMatch } from '../sim/match';
import { createFishMesh, createHarborMesh, disposeObject, type HarborView } from '../render/harbor';
import {
  advanceAfterVictory,
  applyUpgrade,
  beginStage,
  coast,
  createCampaign,
  getPlayer,
  openUpgrade,
  retryStage,
  settleWorld,
  step,
  threatCount,
} from '../sim/simulation';
import type { Faction, Ship, SimState, Status, Track } from '../sim/types';
import { createChest, Fx } from '../render/effects';
import { createKrakenMesh, disposeKraken, updateKrakenMesh, type KrakenView } from '../render/krakenMesh';
import { createOcean, OCEAN_SEGMENTS, OCEAN_SIZE } from '../render/ocean';
import { createShipMesh, disposeShipView, paintShipBar, shipLookKey, type ShipSpec, type ShipView } from '../render/shipMesh';
import { createBirds, createSky, SUN_DIR, updateBirds } from '../render/sky';
import { createTerrainMesh, disposeTerrain } from '../render/terrain';
import { waveHeight } from '../render/waves';
import { Sfx, type AudioStatus } from './audio';
import { bindHold, bindStick, InputController } from './input';
import { drawRadar } from './radar';
import { Ui, type HudModel } from './ui';

interface Progress {
  stageIndex: number;
  gold: number;
  upgrades: { hull: number; sails: number; cannons: number };
  campaignCleared: boolean;
  pendingUpgrade: boolean;
  pendingPurchased: boolean;
}

function compassLabel(heading: number): string {
  const names = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
  let value = heading;
  while (value < 0) value += Math.PI * 2;
  while (value >= Math.PI * 2) value -= Math.PI * 2;
  return names[Math.round(value / (Math.PI / 4)) % 8] ?? '북';
}

function specOf(ship: Ship): ShipSpec {
  return {
    faction: ship.faction,
    hullTier: ship.hullTier,
    sailTier: ship.sailTier,
    cannonTier: ship.cannonTier,
    length: ship.length,
    beam: ship.beam,
    name: ship.name,
  };
}

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private sim: SimState = createCampaign(1);
  private readonly ui: Ui;
  private readonly input: InputController;
  private readonly sfx = new Sfx();
  private readonly settings = { muted: false, shake: true };
  private progress: Progress = {
    stageIndex: 0,
    gold: 0,
    upgrades: { hull: 0, sails: 0, cannons: 0 },
    campaignCleared: false,
    pendingUpgrade: false,
    pendingPurchased: false,
  };
  private renderer: THREE.WebGLRenderer | null = null;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private oceanMat!: THREE.ShaderMaterial;
  private ocean!: THREE.Mesh;
  private sky!: THREE.Mesh;
  private skyMat!: THREE.ShaderMaterial;
  private birds!: THREE.Group;
  private hemi!: THREE.HemisphereLight;
  private sun!: THREE.DirectionalLight;
  private fx!: Fx;
  private attract!: ShipView;
  private attractKey = '';
  private readonly ships = new Map<string, ShipView>();
  private readonly treasures = new Map<string, THREE.Group>();
  private kraken: KrakenView | null = null;
  private terrainKey = '';
  private readonly terrainMeshes: THREE.Group[] = [];
  private readonly look = new THREE.Vector3(0, 1, 0);
  private readonly camPos = new THREE.Vector3(-42, 30, -42);
  private readonly fogColor = new THREE.Color('#f2b07a');
  private readonly calmFog = new THREE.Color('#f2b07a');
  private readonly stormFog = new THREE.Color('#5d6b73');
  private readonly calmDeep = new THREE.Color('#0b4664');
  private readonly stormDeep = new THREE.Color('#16343c');
  private readonly calmShallow = new THREE.Color('#2aa4ae');
  private readonly stormShallow = new THREE.Color('#3d6a66');
  private readonly sunWarm = new THREE.Color('#ffe0b0');
  private readonly sunCold = new THREE.Color('#9aabba');
  private time = 0;
  private last = 0;
  private shake = 0;
  private started = false;
  private wideView = false;
  private harborViews: HarborView[] = [];
  private fishMeshes: THREE.Mesh[] = [];
  private matchKey = '';

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ui = new Ui({
      start: () => this.startNew(),
      continueGame: () => this.continueGame(),
      askReset: () => this.ui.showResetConfirm(),
      confirmReset: () => this.startNew(),
      cancelReset: () => this.ui.hideResetConfirm(),
      resume: () => this.resume(),
      retry: () => this.retry(),
      title: () => this.toTitle(),
      toUpgrade: () => this.toUpgrade(),
      sail: () => this.sail(),
      buy: (track) => this.buy(track),
      mute: (muted) => this.setMuted(muted),
      shake: (enabled) => this.setShake(enabled),
      pause: () => this.pause(),
      toggleSound: () => this.toggleSound(),
      zoom: () => {
        this.wideView = !this.wideView;
      },
    });
    this.input = new InputController(() => this.sim.status === 'playing');
    this.bindTouch();
    this.canvas.addEventListener('pointerdown', (event) => {
      this.sfx.resume();
      if (event.button === 0 && this.sim.status === 'playing') this.input.setMouseSmart(true);
    });
    window.addEventListener('pointerup', () => this.input.setMouseSmart(false));
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    window.addEventListener('keydown', this.onKey);
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch {
      this.ui.fatal('이 브라우저에서 3D 화면을 만들 수 없습니다.');
      return;
    }
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor('#071018');
    this.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.ui.fatal('그래픽 장치가 초기화되었습니다. 페이지를 새로고침해 주세요.');
    });
    this.buildScene();
    this.resize();
    window.addEventListener('resize', this.resize);
    this.boot();
    this.last = performance.now();
    requestAnimationFrame(this.frame);
    this.started = true;
  }

  status(): Status {
    return this.sim.status;
  }

  debugSnapshot(): {
    status: Status;
    stage: number;
    time: number;
    gold: number;
    projectiles: number;
    weather: string;
    player: { x: number; z: number; hp: number; speed: number; heading: number; length: number; sailTier: number } | null;
    enemies: { name: string; faction: Faction; hp: number; alive: boolean; x: number; z: number }[];
    kraken: { hp: number; phase: string; alive: boolean } | null;
    match: null | {
      level: number;
      xp: number;
      xpToNext: number;
      objective: string;
      docked: boolean;
      home: number;
      away: number;
      respawn: number;
    };
  } {
    const player = getPlayer(this.sim);
    return {
      status: this.sim.status,
      stage: this.sim.stageIndex,
      time: this.sim.time,
      gold: this.sim.gold,
      projectiles: this.sim.projectiles.length,
      weather: this.sim.weather.phase,
      player: player ? { x: player.x, z: player.z, hp: player.hp, speed: player.speed, heading: player.heading, length: player.length, sailTier: player.sailTier } : null,
      enemies: this.sim.ships
        .filter((ship) => ship.faction !== 'player')
        .map((ship) => ({ name: ship.name, faction: ship.faction, hp: ship.hp, alive: ship.alive, x: ship.x, z: ship.z })),
      kraken: this.sim.kraken
        ? { hp: this.sim.kraken.hp, phase: this.sim.kraken.phase, alive: this.sim.kraken.alive }
        : null,
      match: this.sim.match
        ? {
            level: this.sim.match.level,
            xp: this.sim.match.xp,
            xpToNext: this.sim.match.xpToNext,
            objective: this.sim.match.objective,
            docked: this.sim.match.docked,
            home: this.sim.match.harbors.find((harbor) => harbor.id === 'home')?.hp ?? 0,
            away: this.sim.match.harbors.find((harbor) => harbor.id === 'away')?.hp ?? 0,
            respawn: this.sim.match.respawnLeft,
          }
        : null,
    };
  }

  setMuted(muted: boolean): void {
    this.settings.muted = muted;
    this.sfx.setMuted(muted);
    this.ui.setSettings(this.settings.muted, this.settings.shake);
    this.refreshSound();
    if (readAnySave(localStorage)) this.write();
  }

  audioStatus(): AudioStatus {
    return this.sfx.status();
  }

  unlockAudio(): void {
    this.sfx.unlock();
    this.refreshSound();
  }

  debugTone(): void {
    this.sfx.debugTone();
  }

  /** Test-only lethal hit. The next simulation frame runs the same death path as a kraken slam. */
  debugHurt(): void {
    const player = getPlayer(this.sim);
    if (!player?.alive) return;
    player.hp = 0;
  }

  private toggleSound(): void {
    this.sfx.unlock();
    this.setMuted(!this.settings.muted);
    if (!this.settings.muted) this.sfx.shot(0.8);
  }

  private refreshSound(): void {
    const status = this.sfx.status();
    const label = status.muted ? '소리 꺼짐' : status.context === 'running' ? '소리 켜짐' : '소리 대기';
    this.ui.setSound(label, status.muted);
  }

  debugStorm(): void {
    this.sim.weather.phase = 'storm';
    this.sim.weather.intensity = 1;
    this.sim.weather.timer = 9;
    this.sim.weather.windAngle = 0.7;
    this.sim.weather.windX = Math.cos(0.7) * 8;
    this.sim.weather.windZ = Math.sin(0.7) * 8;
  }

  debugStart(stage: number, tier?: number): void {
    if (!this.started && !this.renderer) return;
    this.sim = createCampaign(3);
    if (tier !== undefined && Number.isFinite(tier)) {
      const value = Math.max(0, Math.min(3, Math.round(tier)));
      this.sim.upgrades = { hull: value, sails: value, cannons: value };
    }
    beginStage(this.sim, Math.max(0, Math.min(STAGES.length - 1, Math.round(stage))));
    this.progress = this.capture(false);
    this.write();
    this.ui.showPlay();
  }

  private buildScene(): void {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(this.calmFog, 130, 340);
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 720);
    this.hemi = new THREE.HemisphereLight('#d7ecff', '#1d3a32', 0.9);
    this.sun = new THREE.DirectionalLight(this.sunWarm, 2.55);
    this.sun.position.copy(SUN_DIR).multiplyScalar(90);
    const fill = new THREE.DirectionalLight('#8fb4d8', 0.5);
    fill.position.set(-36, 20, -16);
    this.scene.add(this.hemi, this.sun, fill);
    const ocean = createOcean();
    this.ocean = ocean.mesh;
    this.oceanMat = ocean.material;
    this.scene.add(this.ocean);
    const sky = createSky();
    this.sky = sky.mesh;
    this.skyMat = sky.material;
    this.scene.add(this.sky);
    this.birds = createBirds();
    this.scene.add(this.birds);
    this.fx = new Fx(this.scene);
    this.attract = this.makeAttract();
  }

  private makeAttract(): ShipView {
    const hull = hullStats(this.sim.upgrades.hull);
    const view = createShipMesh({
      faction: 'player',
      hullTier: this.sim.upgrades.hull,
      sailTier: this.sim.upgrades.sails,
      cannonTier: this.sim.upgrades.cannons,
      length: hull.length,
      beam: hull.beam,
      name: playerShipName(this.sim.upgrades.hull),
    });
    view.group.visible = false;
    view.shadow.visible = false;
    view.sprite.visible = false;
    this.scene.add(view.group, view.shadow);
    this.attractKey = `${this.sim.upgrades.hull}-${this.sim.upgrades.sails}-${this.sim.upgrades.cannons}`;
    return view;
  }

  private boot(): void {
    const save = readAnySave(localStorage);
    if (!save) {
      this.ui.setSettings(false, true);
      this.refreshSound();
      this.ui.showTitle({ canContinue: false, cleared: false });
      return;
    }
    this.settings.muted = save.muted;
    this.settings.shake = save.shake;
    this.sfx.setMuted(save.muted);
    this.ui.setSettings(save.muted, save.shake);
    this.refreshSound();
    this.ui.showTitle({ canContinue: false, cleared: save.legacyCampaign });
  }

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    if (!this.renderer) return;
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.time += dt;
    const before = this.sim.status;
    if (this.sim.status === 'playing') {
      step(this.sim, this.input.snapshot(), dt);
      if (this.sim.match) {
        stepMatch(this.sim, dt);
        settleWorld(this.sim);
      }
    }
    else if (this.sim.status === 'victory' || this.sim.status === 'defeat' || this.sim.status === 'upgrade' || this.sim.status === 'ending') {
      coast(this.sim, dt);
    }
    this.sfx.setWind(this.sim.weather.intensity);
    this.consumeEvents();
    if (before !== this.sim.status) this.noteTransition();
    this.syncWorld(dt);
    this.sim.events = [];
    this.renderer.render(this.scene, this.camera);
  };

  private consumeEvents(): void {
    let playerShot = false;
    let otherShot = false;
    let hit = false;
    let splash = false;
    let pickup = false;
    for (const event of this.sim.events) {
      if (event.type === 'fire') {
        if (event.faction === 'player') playerShot = true;
        else otherShot = true;
      }
      if (event.type === 'hit') hit = true;
      if (event.type === 'splash' || event.type === 'slam') splash = true;
      if (event.type === 'pickup') pickup = true;
      if (!this.settings.shake) continue;
      if (event.type === 'fire' && event.faction === 'player') this.shake = Math.max(this.shake, 0.32);
      if (event.type === 'hit' && event.faction === 'player') this.shake = Math.max(this.shake, 0.55);
      if (event.type === 'slam') this.shake = Math.max(this.shake, 0.4);
    }
    if (playerShot) this.sfx.shot(1);
    else if (otherShot) this.sfx.shot(0.62);
    if (hit) this.sfx.hit();
    if (splash) this.sfx.splash();
    if (pickup) this.sfx.pickup();
  }

  private noteTransition(): void {
    if (this.sim.status === 'victory') {
      this.write();
      if (this.sim.match) this.ui.showVictory('적 항구 함락', this.sim.gold, null);
      else {
        const stage = STAGES[this.sim.stageIndex];
        this.ui.showVictory(stage?.name ?? '해역', this.sim.gold, STAGES[this.sim.stageIndex + 1]?.name ?? null);
      }
    } else if (this.sim.status === 'defeat') {
      this.ui.showDefeat(this.sim.match ? '아군 항구가 함락되었다. 다시 출항하면 작은 배로 시작한다.' : undefined);
    }
  }

  private syncWorld(dt: number): void {
    const storm = this.sim.weather.intensity;
    this.syncShips(storm);
    this.syncTreasures(storm);
    this.syncKraken();
    this.syncTerrain();
    this.syncMatchProps();
    this.updateCamera(dt);
    this.fx.sync(this.sim, dt, this.time, this.camera);
    const focusX = this.look.x;
    const focusZ = this.look.z;
    const cell = OCEAN_SIZE / OCEAN_SEGMENTS;
    this.ocean.position.set(Math.round(focusX / cell) * cell, 0, Math.round(focusZ / cell) * cell);
    this.oceanMat.uniforms.uTime.value = this.time;
    this.oceanMat.uniforms.uStorm.value = storm;
    this.sky.position.set(this.camera.position.x, 0, this.camera.position.z);
    this.skyMat.uniforms.uTime.value = this.time;
    this.skyMat.uniforms.uStorm.value = storm;
    this.fogColor.copy(this.calmFog).lerp(this.stormFog, storm);
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.copy(this.fogColor);
    (this.oceanMat.uniforms.uFogColor.value as THREE.Color).copy(this.fogColor);
    (this.oceanMat.uniforms.uDeep.value as THREE.Color).copy(this.calmDeep).lerp(this.stormDeep, storm);
    (this.oceanMat.uniforms.uShallow.value as THREE.Color).copy(this.calmShallow).lerp(this.stormShallow, storm);
    this.sun.color.copy(this.sunWarm).lerp(this.sunCold, storm);
    this.sun.intensity = 2.55 * (1 - storm * 0.72);
    this.hemi.intensity = 0.9 * (1 - storm * 0.4);
    updateBirds(this.birds, this.time, focusX, focusZ);
    this.birds.visible = storm < 0.75;
    if (this.sim.status === 'playing' || this.sim.status === 'paused') {
      this.updateHud();
      const ctx = this.ui.radar.getContext('2d');
      if (ctx) drawRadar(ctx, this.sim);
    }
    const player = getPlayer(this.sim);
    this.ui.setHit(player ? player.hitFlash / 0.22 : 0);
  }

  private syncMatchProps(): void {
    const match = this.sim.match;
    const key = match ? 'match' : '';
    if (key === this.matchKey && match) {
      for (const view of this.harborViews) {
        const harbor = match.harbors.find((item) => item.id === view.id);
        view.group.visible = Boolean(harbor && harbor.hp > 0);
      }
      match.fish.forEach((spot, index) => {
        const mesh = this.fishMeshes[index];
        if (!mesh) return;
        mesh.visible = spot.cooldown <= 0;
        mesh.position.y = 0.4 + Math.sin(this.time * 2 + index) * 0.15;
      });
      return;
    }
    for (const view of this.harborViews) {
      this.scene.remove(view.group);
      disposeObject(view.group);
    }
    for (const mesh of this.fishMeshes) {
      this.scene.remove(mesh);
      disposeObject(mesh);
    }
    this.harborViews = [];
    this.fishMeshes = [];
    this.matchKey = key;
    if (!match) return;
    for (const harbor of match.harbors) {
      const view = createHarborMesh(harbor);
      this.scene.add(view.group);
      this.harborViews.push(view);
    }
    for (const spot of match.fish) {
      const mesh = createFishMesh();
      mesh.position.set(spot.x, 0.4, spot.z);
      this.scene.add(mesh);
      this.fishMeshes.push(mesh);
    }
  }

  private syncTerrain(): void {
    if (this.sim.ships.length === 0) {
      this.clearTerrain();
      return;
    }
    const terrain = this.sim.terrainOverride ?? STAGES[this.sim.stageIndex]?.terrain ?? [];
    const key = `${this.sim.match ? 'match' : this.sim.stageIndex}:${terrain.length}`;
    if (key === this.terrainKey) return;
    this.clearTerrain();
    this.terrainKey = key;
    for (const body of terrain) {
      const mesh = createTerrainMesh(body);
      this.scene.add(mesh);
      this.terrainMeshes.push(mesh);
    }
  }

  private clearTerrain(): void {
    for (const mesh of this.terrainMeshes) {
      this.scene.remove(mesh);
      disposeTerrain(mesh);
    }
    this.terrainMeshes.length = 0;
    this.terrainKey = '';
  }

  private syncShips(storm: number): void {
    const live = new Set(this.sim.ships.map((ship) => ship.id));
    for (const [id, view] of this.ships) {
      if (live.has(id)) continue;
      this.scene.remove(view.group);
      this.scene.remove(view.shadow);
      disposeShipView(view);
      this.ships.delete(id);
    }
    for (const ship of this.sim.ships) {
      const spec = specOf(ship);
      const key = shipLookKey(spec);
      let view = this.ships.get(ship.id);
      if (!view || view.key !== key) {
        if (view) {
          this.scene.remove(view.group);
          this.scene.remove(view.shadow);
          disposeShipView(view);
        }
        view = createShipMesh(spec);
        this.ships.set(ship.id, view);
        this.scene.add(view.group, view.shadow);
      }
      const nose = forward(ship.heading);
      const port = sideDirection(ship.heading, 'port');
      const y = waveHeight(ship.x, ship.z, this.time, storm);
      const ahead = waveHeight(ship.x + nose.x * 2.2, ship.z + nose.z * 2.2, this.time, storm);
      const aside = waveHeight(ship.x + port.x * 1.3, ship.z + port.z * 1.3, this.time, storm);
      const sink = Math.min(3.4, ship.sinkT);
      view.group.visible = ship.sinkT < 4.6;
      view.shadow.visible = view.group.visible;
      view.group.position.set(ship.x, y - sink * 1.65, ship.z);
      view.group.rotation.order = 'YXZ';
      view.group.rotation.y = ship.heading;
      view.group.rotation.x = (y - ahead) * 0.55 + sink * 0.32;
      view.group.rotation.z = (aside - y) * 0.65 - ship.helm * 0.08 * Math.min(1, Math.abs(ship.speed) / 8);
      view.shadow.position.set(ship.x, 0.12, ship.z);
      view.hullMat.emissiveIntensity = ship.hitFlash > 0 ? 0.9 : 0;
      for (const sail of view.sails) {
        sail.uniforms.uTime.value = this.time;
        sail.uniforms.uWind.value = 0.35 + storm * 1.35;
      }
      const role = ship.faction === 'player' ? '나' : ship.team === 'friendly' ? '아군' : ship.team === 'enemy' ? '적군' : '해적';
      if (view.lastHp !== ship.hp || view.lastMax !== ship.maxHp || view.name !== role) paintShipBar(view, ship.hp, ship.maxHp, role);
      const player = getPlayer(this.sim);
      const dist = player ? Math.hypot(ship.x - player.x, ship.z - player.z) : 0;
      view.sprite.visible = ship.sinkT < 2.4 && (ship.faction === 'player' || dist < 90);
    }
  }

  private syncTreasures(storm: number): void {
    const ids = new Set(this.sim.treasures.map((treasure) => treasure.id));
    for (const [id, mesh] of this.treasures) {
      if (ids.has(id)) continue;
      this.scene.remove(mesh);
      this.treasures.delete(id);
    }
    for (const treasure of this.sim.treasures) {
      let mesh = this.treasures.get(treasure.id);
      if (!mesh) {
        mesh = createChest();
        this.treasures.set(treasure.id, mesh);
        this.scene.add(mesh);
      }
      mesh.visible = !treasure.taken;
      mesh.position.set(treasure.x, waveHeight(treasure.x, treasure.z, this.time, storm) + 0.4, treasure.z);
      mesh.rotation.y = this.time * 0.55 + treasure.x;
    }
  }

  private syncKraken(): void {
    if (!this.sim.kraken) {
      if (this.kraken) {
        this.scene.remove(this.kraken.group);
        disposeKraken(this.kraken);
        this.kraken = null;
      }
      return;
    }
    if (!this.kraken) {
      this.kraken = createKrakenMesh();
      this.scene.add(this.kraken.group);
    }
    updateKrakenMesh(this.kraken, this.sim.kraken, this.time);
  }

  private updateCamera(dt: number): void {
    const attractMode = this.sim.ships.length === 0 && (this.sim.status === 'title' || this.sim.status === 'upgrade' || this.sim.status === 'ending');
    if (attractMode) this.ensureAttract();
    this.attract.group.visible = attractMode;
    this.attract.shadow.visible = attractMode;
    const blend = 1 - Math.exp(-dt * (attractMode ? 1.3 : 6.2));
    if (attractMode) {
      const angle = this.time * 0.15;
      const x = 18 + Math.sin(angle) * 3;
      const z = 16 + Math.cos(angle) * 2;
      this.attract.group.position.set(x, waveHeight(x, z, this.time, this.sim.weather.intensity), z);
      this.attract.group.rotation.y = angle + Math.PI;
      for (const sail of this.attract.sails) {
        sail.uniforms.uTime.value = this.time;
        sail.uniforms.uWind.value = 0.55 + this.sim.weather.intensity;
      }
      this.camPos.lerp(new THREE.Vector3(-6, 16, -10), blend);
      this.look.lerp(new THREE.Vector3(12, 1, 10), blend);
    } else {
      const player = getPlayer(this.sim);
      if (player) {
        const nose = forward(player.heading);
        const spread = this.wideView ? 1.65 : 1;
        const zoom = (this.sim.kraken?.alive ? 1.08 : 1) * spread;
        const focus = new THREE.Vector3(player.x + nose.x * 12, 1.5, player.z + nose.z * 12);
        const desired = new THREE.Vector3(player.x - nose.x * 30 * zoom, 17.5 * zoom, player.z - nose.z * 30 * zoom);
        desired.x += Math.sin(this.time * 1.7) * 0.35 * this.sim.weather.intensity;
        desired.y += Math.cos(this.time * 2.1) * 0.22 * this.sim.weather.intensity;
        if (this.shake > 0) {
          desired.x += (Math.random() - 0.5) * this.shake * 2.2;
          desired.y += (Math.random() - 0.5) * this.shake;
          this.shake = Math.max(0, this.shake - dt * 1.5);
        }
        if (this.camPos.distanceTo(desired) > 90) {
          this.camPos.copy(desired);
          this.look.copy(focus);
        } else {
          this.camPos.lerp(desired, blend);
          this.look.lerp(focus, blend);
        }
      }
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.look);
  }

  private ensureAttract(): void {
    const key = `${this.sim.upgrades.hull}-${this.sim.upgrades.sails}-${this.sim.upgrades.cannons}`;
    if (key === this.attractKey) return;
    this.scene.remove(this.attract.group);
    this.scene.remove(this.attract.shadow);
    disposeShipView(this.attract);
    this.attract = this.makeAttract();
  }

  private updateHud(): void {
    const player = getPlayer(this.sim);
    const stage = STAGES[this.sim.stageIndex];
    if (!player || !stage) return;
    const guns = cannonProfile('player', player.cannonTier);
    const krakenAlive = Boolean(this.sim.kraken?.alive);
    const hostileShips = this.sim.ships.some((ship) => ship.faction !== 'player' && ship.alive);
    let banner = '';
    let bannerKind: HudModel['bannerKind'] = 'none';
    if (this.sim.kraken?.phase === 'telegraph') {
      banner = '바다 밑 그림자를 피하라';
      bannerKind = 'alert';
    } else if (this.sim.weather.phase === 'warning') {
      banner = '태풍이 다가온다 — 키를 잡아라';
      bannerKind = 'alert';
    } else if (this.sim.weather.phase === 'storm') {
      banner = '태풍이다. 바람이 배를 민다';
      bannerKind = 'alert';
    } else if (player.hp / player.maxHp < 0.3) {
      banner = '선체가 위험하다';
      bannerKind = 'alert';
    } else if (this.sim.introTimer > 0) {
      banner = this.sim.introText;
      bannerKind = 'info';
    }
    const match = this.sim.match;
    const home = match?.harbors.find((harbor) => harbor.id === 'home');
    const away = match?.harbors.find((harbor) => harbor.id === 'away');
    const dock = match?.nearDock
      ? {
          hull: this.dockLabel('hull'),
          sails: this.dockLabel('sails'),
          cannons: this.dockLabel('cannons'),
          hullOk: this.dockReady('hull'),
          sailsOk: this.dockReady('sails'),
          cannonsOk: this.dockReady('cannons'),
          note: match.prompt,
        }
      : null;
    if (match) {
      banner = match.objective;
      bannerKind = match.downed || this.sim.weather.phase === 'warning' || this.sim.weather.phase === 'storm' ? 'alert' : 'info';
    }
    this.ui.setHud({
      chapter: match ? '항구 공성' : `제${stage.chapter}장 · ${stage.chapterTitle}`,
      stage: match ? `Lv ${match.level} · 경험 ${match.xp}/${match.xpToNext}` : stage.name,
      gold: this.sim.gold,
      enemies: threatCount(this.sim),
      enemyLabel: krakenAlive && !hostileShips ? '크라켄' : '적선',
      hull: player.hp / player.maxHp,
      hullText: `${Math.max(0, Math.ceil(player.hp))} / ${player.maxHp}`,
      port: 1 - player.reloadPort / Math.max(0.01, guns.reload),
      starboard: 1 - player.reloadStarboard / Math.max(0.01, guns.reload),
      kraken: krakenAlive && this.sim.kraken ? this.sim.kraken.hp / this.sim.kraken.maxHp : null,
      sailHint: Boolean(match) && this.sim.time < 14 && Math.abs(player.speed) < 2.2,
      fireHint: Boolean(match) && this.sim.shotsFired === 0 && this.sim.time > 3 && this.sim.time < 20,
      banner,
      bannerKind,
      weather: this.sim.weather.phase,
      levelText: match ? `Lv ${match.level}` : '',
      homeHp: home ? home.hp / home.maxHp : 0,
      awayHp: away ? away.hp / away.maxHp : 0,
      prompt: match?.prompt ?? '',
      dock,
      helm: this.helmLine(player),
    });
    const seen = new Set<Faction>();
    const legend: { faction: Faction; label: string; color: string }[] = [];
    for (const ship of this.sim.ships) {
      if (!ship.alive || ship.faction === 'player' || seen.has(ship.faction)) continue;
      seen.add(ship.faction);
      const meta = FACTION_META[ship.faction];
      legend.push({ faction: ship.faction, label: meta.label, color: meta.color });
    }
    this.ui.setLegend(legend);
    this.refreshSound();
  }

  private helmLine(player: Ship): string {
    const speed = Math.max(0, Math.round(Math.abs(player.speed)));
    const bow = compassLabel(player.heading);
    const aim = aimHint(this.sim);
    return aim ? `속력 ${speed} · 뱃머리 ${bow} · ${aim}` : `속력 ${speed} · 뱃머리 ${bow}`;
  }

  private dockLabel(track: Track): string {
    const match = this.sim.match;
    const tier = this.sim.upgrades[track];
    const title = track === 'hull' ? '선체' : track === 'sails' ? '돛' : '함포';
    if (tier >= 3) return `${title} 최대`;
    const next = tier + 1;
    const cost = dockCost(track, next);
    if (match && match.level < next) return `${title} ${cost ?? ''} · Lv${next}`;
    if (!match?.docked) return `${title} · 원 안`;
    if (cost !== null && this.sim.gold < cost) return `${title} ${cost} · 부족`;
    return `${title} ${cost ?? ''}`;
  }

  private dockReady(track: Track): boolean {
    return canBuyUpgrade(this.sim, track).ok;
  }

  private startNew(): void {
    clearSave(localStorage);
    this.sim = createCampaign((Date.now() % 99991) + 1);
    beginMatch(this.sim);
    this.write();
    this.sfx.resume();
    this.ui.showPlay();
  }

  debugMatch(phase?: string): void {
    if (!this.renderer) return;
    this.sim = createCampaign(5);
    beginMatch(this.sim);
    const player = getPlayer(this.sim);
    const match = this.sim.match;
    if (phase === 'dock' && player && match) {
      match.level = 2;
      match.xp = 0;
      match.xpToNext = 86;
      this.sim.gold = 220;
      player.x = -16;
      player.z = -338;
    } else if (phase === 'objective' && player && match) {
      this.sim.time = 120;
      player.z = -40;
      stepMatch(this.sim, 0.05);
    } else if (phase === 'siege' && player && match) {
      match.level = 3;
      this.sim.gold = 40;
      this.sim.upgrades = { hull: 1, sails: 1, cannons: 2 };
      player.cannonTier = 2;
      player.sailTier = 1;
      player.hullTier = 1;
      player.hp = player.maxHp = 150;
      player.x = 20;
      player.z = 310;
      player.heading = 0;
    }
    this.write();
    this.ui.showPlay();
  }

  private continueGame(): void {
    this.startNew();
  }

  private pause(): void {
    if (this.sim.status !== 'playing') return;
    this.sim.status = 'paused';
    this.ui.showPause();
  }

  private resume(): void {
    if (this.sim.status !== 'paused') return;
    this.sim.status = 'playing';
    this.ui.showPlay();
  }

  private retry(): void {
    if (this.sim.match || this.sim.status === 'victory' || this.sim.status === 'defeat') {
      this.sim = createCampaign((Date.now() % 99991) + 1);
      beginMatch(this.sim);
      this.write();
      this.ui.showPlay();
      return;
    }
    if (this.sim.ships.length === 0 && this.sim.status !== 'paused') return;
    retryStage(this.sim);
    this.progress = this.capture(false);
    this.write();
    this.ui.showPlay();
  }

  private toTitle(): void {
    this.sim.status = 'title';
    const save = readAnySave(localStorage);
    this.ui.showTitle({ canContinue: false, cleared: Boolean(save?.legacyCampaign) });
  }

  private toUpgrade(): void {
    if (this.sim.match) {
      this.retry();
      return;
    }
    openUpgrade(this.sim);
    this.ui.showUpgrade(this.sim);
  }

  private buy(track: Track): void {
    if (this.sim.match) {
      const result = buyUpgrade(this.sim, track);
      if (!result.ok) return;
      this.sfx.pickup();
      return;
    }
    const result = applyUpgrade(this.sim, track);
    if (!result.ok) return;
    this.progress.gold = this.sim.gold;
    this.progress.upgrades = { ...this.sim.upgrades };
    this.progress.pendingPurchased = true;
    this.write();
    this.sfx.pickup();
    this.ui.showUpgrade(this.sim);
  }

  private sail(): void {
    const outcome = advanceAfterVictory(this.sim);
    if (outcome === 'blocked') return;
    if (outcome === 'cleared') {
      this.progress = {
        stageIndex: STAGES.length - 1,
        gold: this.sim.gold,
        upgrades: { ...this.sim.upgrades },
        campaignCleared: true,
        pendingUpgrade: false,
        pendingPurchased: false,
      };
      this.sim.campaignCleared = true;
      this.write();
      this.ui.showEnding();
      return;
    }
    this.progress = this.capture(false);
    this.write();
    this.ui.showPlay();
  }

  private capture(pending: boolean): Progress {
    return {
      stageIndex: this.sim.stageIndex,
      gold: this.sim.gold,
      upgrades: { ...this.sim.upgrades },
      campaignCleared: this.sim.campaignCleared,
      pendingUpgrade: pending,
      pendingPurchased: false,
    };
  }

  private write(): void {
    const data: SettingsSave = {
      v: 2,
      muted: this.settings.muted,
      shake: this.settings.shake,
      legacyCampaign: false,
    };
    writeSave(localStorage, data);
  }

  private setShake(enabled: boolean): void {
    this.settings.shake = enabled;
    if (readAnySave(localStorage)) this.write();
  }

  private bindTouch(): void {
    const stick = document.querySelector('#stick');
    const nub = document.querySelector('#nub');
    if (stick instanceof HTMLElement && nub instanceof HTMLElement) bindStick(stick, nub, this.input.touch);
    const port = document.querySelector('#btn-touch-port');
    const star = document.querySelector('#btn-touch-star');
    const smart = document.querySelector('#btn-touch-smart');
    if (port instanceof HTMLElement) bindHold(port, (held) => { this.input.touch.port = held; });
    if (star instanceof HTMLElement) bindHold(star, (held) => { this.input.touch.starboard = held; });
    if (smart instanceof HTMLElement) bindHold(smart, (held) => { this.input.touch.smart = held; });
  }

  private onKey = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    if (this.sim.status === 'playing' || this.sim.status === 'title') this.sfx.unlock();
    if (event.code === 'KeyZ' && this.sim.status === 'playing') {
      this.wideView = !this.wideView;
      return;
    }
    if (event.code === 'KeyR' && (this.sim.status === 'paused' || this.sim.status === 'defeat' || this.sim.status === 'victory')) {
      this.retry();
      return;
    }
    if (event.code !== 'Escape' && event.code !== 'KeyP') return;
    if (this.sim.status === 'playing') {
      event.preventDefault();
      this.pause();
    } else if (this.sim.status === 'paused') {
      event.preventDefault();
      this.resume();
    }
  };

  private resize = (): void => {
    if (!this.renderer) return;
    const width = window.innerWidth;
    const height = Math.max(1, window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(width, height);
  };
}
