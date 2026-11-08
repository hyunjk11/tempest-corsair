import { avoidTerrainHeading, bestSide, desiredBroadsideHeading, intentFor, PLAYER_AIM } from './ai';
import { handlingFor, hullStats, playerShipName } from './balance';
import { normalizeAngle, turnToward } from './math';
import type { TerrainBody } from './terrain';
import type { Duty, Faction, FishSpot, Harbor, MatchData, Ship, SimState, Team, Track } from './types';
import { fireBroadside, getPlayer, moveShip } from './simulation';

export const MATCH_BOUNDS = 520;

/** Center strait plus an outer lane on each side. The south nursery stays open water. */
export const MATCH_TERRAIN: TerrainBody[] = [
  { kind: 'island', x: -110, z: 10, radius: 28 },
  { kind: 'island', x: 96, z: -16, radius: 26 },
  { kind: 'reef', x: 0, z: 24, radius: 9 },
  { kind: 'reef', x: -36, z: -30, radius: 7 },
  { kind: 'island', x: 150, z: 80, radius: 18 },
  { kind: 'coast', x: -210, z: 40, radius: 22 },
];

const DOCK_COST: Record<Track, number[]> = {
  hull: [0, 48, 100, 160],
  sails: [0, 36, 84, 140],
  cannons: [0, 54, 112, 172],
};

export function xpForLevel(level: number): number {
  return 34 + level * 26;
}

export function beginMatch(state: SimState): void {
  state.status = 'playing';
  state.stageIndex = 0;
  state.gold = 12;
  state.goldAtStageStart = 12;
  state.upgrades = { hull: 0, sails: 0, cannons: 0 };
  state.upgradeReady = false;
  state.projectiles = [];
  state.treasures = [];
  state.kraken = null;
  state.weather = { phase: 'calm', timer: 0, intensity: 0, windAngle: 0.4, windX: 0, windZ: 0 };
  state.time = 0;
  state.stageTime = 0;
  state.finale = null;
  state.finaleTimer = 0;
  state.nextId = 1;
  state.typhoonRolled = true;
  state.playerInvuln = 1.2;
  state.aiEnabled = true;
  state.shotsFired = 0;
  state.introTimer = 7;
  state.introText = '아군 항구를 떠나 고기와 중립 해적으로 배를 키워라';
  state.events = [];
  state.terrainOverride = MATCH_TERRAIN;
  state.boundsOverride = MATCH_BOUNDS;
  state.campaignCleared = false;
  const harbors: Harbor[] = [
    { id: 'home', team: 'friendly', name: '아군 항구', x: -24, z: -352, hp: 300, maxHp: 300, reload: 0.8, core: 10, dock: 30, gunRange: 26 },
    { id: 'away', team: 'enemy', name: '적 항구', x: 28, z: 352, hp: 220, maxHp: 220, reload: 0.8, core: 10, dock: 18, gunRange: 26 },
  ];
  const fish: FishSpot[] = [
    { id: 'f1', x: 42, z: -246, cooldown: 0 },
    { id: 'f2', x: -48, z: -228, cooldown: 2 },
    { id: 'f3', x: 18, z: -188, cooldown: 0 },
    { id: 'f4', x: -36, z: 250, cooldown: 0 },
    { id: 'f5', x: 48, z: 228, cooldown: 2 },
  ];
  state.match = {
    harbors,
    fish,
    level: 0,
    xp: 0,
    xpToNext: xpForLevel(0),
    respawnLeft: 0,
    downed: false,
    result: null,
    objective: '가까운 바다에서 성장하라',
    prompt: '',
    notice: '',
    noticeLeft: 0,
    docked: false,
    nearDock: false,
    strike: '',
    strikeLeft: 0,
    treasureSpawned: false,
    krakenSpawned: false,
    krakenRewarded: false,
    typhoonArmed: false,
    pirateClock: 8,
  };
  const hull = hullStats(0);
  const player = blankShip({
    id: 'player',
    faction: 'player',
    team: 'friendly',
    duty: '',
    name: playerShipName(0),
    x: 0,
    z: -318,
    heading: 0,
    hp: hull.maxHp,
    length: hull.length,
    beam: hull.beam,
    hullTier: 0,
    sailTier: 0,
    cannonTier: 0,
  });
  state.ships = [
    player,
    fleetShip(state, 'ally', 'friendly', 'defend', '등대 호위', -64, -340, 0.5, 90),
    fleetShip(state, 'ally', 'friendly', 'push', '금빛 선수', -8, -400, 0.2, 84),
    fleetShip(state, 'navy', 'enemy', 'defend', '방파제', 18, 336, Math.PI, 110),
    fleetShip(state, 'navy', 'enemy', 'push', '북풍', -16, 318, Math.PI, 96),
    fleetShip(state, 'navy', 'enemy', 'push', '철닻', 36, 312, -2.4, 96),
    pirateShip(state, 'pirate', '표류 칼', 18, -156, -1.1, 32),
    pirateShip(state, 'raider', '모래메기', -22, -172, 0.6, 32),
    pirateShip(state, 'pirate', '가운데 이빨', -24, 16, 1.2, 52),
    pirateShip(state, 'raider', '먼 그물', 40, 36, 2.1, 48),
  ];
}

export function dockCost(track: Track, nextTier: number): number | null {
  return DOCK_COST[track][nextTier] ?? null;
}

export function canBuyUpgrade(state: SimState, track: Track): { ok: boolean; reason?: 'far' | 'gold' | 'level' | 'max' | 'closed' } {
  const match = state.match;
  const player = getPlayer(state);
  if (!match || !player?.alive || state.status !== 'playing') return { ok: false, reason: 'closed' };
  const home = match.harbors.find((harbor) => harbor.id === 'home');
  if (!home || Math.hypot(player.x - home.x, player.z - home.z) > home.dock) return { ok: false, reason: 'far' };
  const current = state.upgrades[track];
  if (current >= 3) return { ok: false, reason: 'max' };
  const next = current + 1;
  if (match.level < next) return { ok: false, reason: 'level' };
  const cost = dockCost(track, next);
  if (cost === null || state.gold < cost) return { ok: false, reason: 'gold' };
  return { ok: true };
}

export function buyUpgrade(state: SimState, track: Track): { ok: boolean; reason?: 'far' | 'gold' | 'level' | 'max' | 'closed' } {
  const check = canBuyUpgrade(state, track);
  if (!check.ok) return check;
  const match = state.match;
  const player = getPlayer(state);
  if (!match || !player) return { ok: false, reason: 'closed' };
  const current = state.upgrades[track];
  const next = current + 1;
  const cost = dockCost(track, next);
  if (cost === null) return { ok: false, reason: 'max' };
  state.gold -= cost;
  state.upgrades[track] = next;
  if (track === 'hull') {
    const stats = hullStats(next);
    const ratio = player.hp / Math.max(1, player.maxHp);
    player.maxHp = stats.maxHp;
    player.hp = Math.max(player.hp, stats.maxHp * ratio);
    player.hp = Math.min(player.maxHp, player.hp + 20);
    player.length = stats.length;
    player.beam = stats.beam;
    player.hullTier = next;
    player.name = playerShipName(next);
  } else if (track === 'sails') player.sailTier = next;
  else player.cannonTier = next;
  state.events.push({ type: 'pickup', x: player.x, z: player.z, text: '정비' });
  return { ok: true };
}

export function stepMatch(state: SimState, dt: number): void {
  const match = state.match;
  if (!match || state.status !== 'playing' || match.result) return;
  const frame = Math.max(0, dt);
  const bodies = state.terrainOverride ?? [];
  match.noticeLeft = Math.max(0, match.noticeLeft - frame);
  match.strikeLeft = Math.max(0, match.strikeLeft - frame);
  for (const spot of match.fish) spot.cooldown = Math.max(0, spot.cooldown - frame);
  match.pirateClock -= frame;
  harvestFish(state, match);
  if (state.aiEnabled) steerFleets(state, match, bodies, frame);
  fireHarborGuns(state, match, frame);
  keepShipsOffForts(state, match);
  easeDockApproach(state, match);
  tickRespawn(state, match, frame);
  maybeSpawnObjective(state, match);
  maybeTyphoon(state, match);
  refillPirates(state, match);
  refreshCopy(state, match);
  judgePorts(state, match);
}

function harvestFish(state: SimState, match: MatchData): void {
  const player = getPlayer(state);
  match.prompt = '';
  match.docked = false;
  match.nearDock = false;
  if (!player?.alive) return;
  const home = match.harbors.find((harbor) => harbor.id === 'home');
  if (home) {
    const dist = Math.hypot(player.x - home.x, player.z - home.z);
    match.nearDock = dist <= home.dock + 46;
    match.docked = dist <= home.dock;
  }
  for (const spot of match.fish) {
    const dist = Math.hypot(player.x - spot.x, player.z - spot.z);
    if (dist > 6.5) continue;
    if (spot.cooldown > 0) {
      if (!match.docked) match.prompt = `고기 떼가 다시 모이는 중 (${Math.ceil(spot.cooldown)}초)`;
      continue;
    }
    if (dist > 4.6) {
      if (!match.docked) match.prompt = '고기 떼가 가깝다. 더 붙으면 선체를 고친다';
      continue;
    }
    spot.cooldown = 18;
    const before = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + 26);
    state.gold += 5;
    const repaired = Math.round(player.hp - before);
    const repair = repaired > 0 ? `선체 수리 +${repaired}` : '선체는 이미 가득하다';
    const line = `고기 떼 · ${repair} · 금화 +5 · 18초 뒤에 다시 모인다`;
    state.events.push({ type: 'pickup', x: spot.x, z: spot.z, text: line });
    match.notice = line;
    match.noticeLeft = 4.2;
    match.prompt = line;
    return;
  }
}

function steerFleets(state: SimState, match: MatchData, bodies: TerrainBody[], dt: number): void {
  for (const ship of state.ships) {
    if (!ship.alive || ship.faction === 'player') continue;
    const order = orderFor(state, match, ship, bodies);
    moveShip(ship, order.throttle, order.turn, dt, state.weather);
    if (order.fire) fireBroadside(state, ship, order.fire);
  }
}

function orderFor(state: SimState, match: MatchData, ship: Ship, bodies: TerrainBody[]): { throttle: number; turn: number; fire: null | 'port' | 'starboard' } {
  if (ship.duty === 'prize') {
    const close = nearestOther(ship, state.ships, 16);
    if (close) return intentFor(ship, close, bodies);
    const desired = avoidTerrainHeading(ship, Math.atan2(ship.anchorX - ship.x, ship.anchorZ - ship.z), bodies);
    return { throttle: 0.35, turn: turnToward(ship.heading, desired), fire: null };
  }
  const aggro = ship.team === 'neutral' ? 26 : ship.duty === 'defend' ? 28 : 36;
  const foe = nearestOther(ship, state.ships, aggro);
  if (foe && (ship.team === 'neutral' || ship.duty !== 'push' || Math.hypot(foe.x - ship.x, foe.z - ship.z) < 30)) {
    return intentFor(ship, foe, bodies);
  }
  const fort = ship.duty === 'push' ? opposingFort(match, ship) : null;
  const fortOpen = ship.team === 'friendly' ? 100 : 140;
  if (fort && state.time >= fortOpen && Math.hypot(fort.x - ship.x, fort.z - ship.z) < 90 && !nearestOther(ship, state.ships, 24)) {
    return bombard(ship, fort, bodies);
  }
  const goal = waypoint(state, match, ship);
  const desired = avoidTerrainHeading(ship, Math.atan2(goal.x - ship.x, goal.z - ship.z), bodies);
  const turn = turnToward(ship.heading, desired);
  const aligned = Math.abs(normalizeAngle(desired - ship.heading)) < 0.7;
  return { throttle: aligned ? 1 : 0.72, turn, fire: null };
}

function waypoint(state: SimState, match: MatchData, ship: Ship): { x: number; z: number } {
  if (ship.team === 'neutral') {
    const wobble = Math.sin(state.time * 0.35 + ship.anchorX) * 6;
    return { x: ship.anchorX + wobble, z: ship.anchorZ };
  }
  if (ship.duty === 'defend') return { x: ship.anchorX, z: ship.anchorZ };
  if (match.treasureSpawned) {
    const prize = state.ships.find((other) => other.duty === 'prize' && other.alive);
    if (prize && ship.duty === 'push') return { x: prize.x, z: prize.z };
  }
  if (state.kraken?.alive && ship.duty === 'push' && state.time > 120) return { x: state.kraken.x, z: state.kraken.z };
  const t = state.time;
  const home = match.harbors.find((harbor) => harbor.id === 'home');
  const away = match.harbors.find((harbor) => harbor.id === 'away');
  if (ship.team === 'enemy') {
    if (t < 80) return { x: ship.anchorX * 0.25, z: 300 };
    if (t < 140) return { x: ship.anchorX * 0.2, z: 140 };
    return { x: home?.x ?? 0, z: (home?.z ?? -352) + 80 };
  }
  if (t < 55) return { x: ship.anchorX * 0.15, z: -410 };
  if (t < 100) return { x: ship.anchorX * 0.15, z: -40 };
  return { x: away?.x ?? 28, z: (away?.z ?? 352) - 70 };
}

function opposingFort(match: MatchData, ship: Ship): { x: number; z: number } | null {
  const id = ship.team === 'friendly' ? 'away' : ship.team === 'enemy' ? 'home' : '';
  return match.harbors.find((harbor) => harbor.id === id) ?? null;
}

function bombard(ship: Ship, fort: { x: number; z: number }, bodies: TerrainBody[]): { throttle: number; turn: number; fire: null | 'port' | 'starboard' } {
  const dx = fort.x - ship.x;
  const dz = fort.z - ship.z;
  const dist = Math.hypot(dx, dz) || 1;
  const raw = dist > 46 ? Math.atan2(dx, dz) : dist < 30 ? Math.atan2(-dx, -dz) : desiredBroadsideHeading(ship.heading, dx, dz);
  const desired = avoidTerrainHeading(ship, raw, bodies);
  const aim = bestSide(ship, fort.x, fort.z);
  const fire = aim.dist <= 56 && aim.dist >= 22 && aim.error < 0.45 ? aim.side : null;
  const aligned = Math.abs(normalizeAngle(desired - ship.heading)) < 0.7;
  return { throttle: aligned ? 0.7 : 0.85, turn: turnToward(ship.heading, desired), fire };
}

function nearestOther(ship: Ship, ships: readonly Ship[], maxDist: number): Ship | null {
  let best: Ship | null = null;
  let bestDist = maxDist;
  for (const other of ships) {
    if (!other.alive || other.id === ship.id || other.team === ship.team) continue;
    const dist = Math.hypot(other.x - ship.x, other.z - ship.z);
    if (dist < bestDist) {
      bestDist = dist;
      best = other;
    }
  }
  return best;
}

function fireHarborGuns(state: SimState, match: MatchData, dt: number): void {
  for (const harbor of match.harbors) {
    harbor.reload = Math.max(0, harbor.reload - dt);
    if (harbor.hp <= 0 || harbor.reload > 0) continue;
    let target: Ship | null = null;
    let best = harbor.gunRange;
    for (const ship of state.ships) {
      if (!ship.alive || ship.team === harbor.team) continue;
      const dist = Math.hypot(ship.x - harbor.x, ship.z - harbor.z);
      if (dist < best) {
        best = dist;
        target = ship;
      }
    }
    if (!target) continue;
    harbor.reload = 1.45;
    const dx = target.x - harbor.x;
    const dz = target.z - harbor.z;
    const dist = Math.hypot(dx, dz) || 1;
    const speed = 38;
    state.projectiles.push({
      id: state.nextId++,
      ownerId: harbor.id,
      faction: harbor.team === 'friendly' ? 'ally' : 'navy',
      team: harbor.team,
      x: harbor.x + (dx / dist) * (harbor.core + 0.8),
      z: harbor.z + (dz / dist) * (harbor.core + 0.8),
      vx: (dx / dist) * speed,
      vz: (dz / dist) * speed,
      damage: 13,
      life: 1.35,
      maxLife: 1.35,
      impact: null,
    });
    state.events.push({ type: 'fire', x: harbor.x, z: harbor.z, faction: harbor.team === 'friendly' ? 'ally' : 'navy' });
  }
}

function keepShipsOffForts(state: SimState, match: MatchData): void {
  const home = match.harbors.find((harbor) => harbor.id === 'home');
  for (const harbor of match.harbors) {
    for (const ship of state.ships) {
      if (!ship.alive || ship.team === harbor.team) continue;
      const dx = ship.x - harbor.x;
      const dz = ship.z - harbor.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      const min = harbor.core + ship.beam * 0.5 + 1.4;
      if (dist >= min) continue;
      ship.x = harbor.x + (dx / dist) * min;
      ship.z = harbor.z + (dz / dist) * min;
      ship.speed *= 0.4;
    }
  }
  if (!home) return;
  for (const ship of state.ships) {
    if (!ship.alive || ship.faction === 'player') continue;
    const dx = ship.x - home.x;
    const dz = ship.z - home.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    const min = home.dock + 2;
    if (dist >= min) continue;
    ship.x = home.x + (dx / dist) * min;
    ship.z = home.z + (dz / dist) * min;
    ship.speed *= 0.45;
  }
}

/** Rushing into the service ring settles to a speed the player can stop from. */
function easeDockApproach(state: SimState, match: MatchData): void {
  const player = getPlayer(state);
  const home = match.harbors.find((harbor) => harbor.id === 'home');
  if (!player?.alive || !home) return;
  const dx = home.x - player.x;
  const dz = home.z - player.z;
  const dist = Math.hypot(dx, dz);
  const ahead = Math.sin(player.heading) * dx + Math.cos(player.heading) * dz;
  if (dist < home.dock + 4 && ahead > 0 && player.speed > 4.2) player.speed = 4.2;
}

function tickRespawn(state: SimState, match: MatchData, dt: number): void {
  const player = getPlayer(state);
  const home = match.harbors.find((harbor) => harbor.id === 'home');
  if (!player || !home || match.result) return;
  if (!player.alive && !match.downed) {
    match.downed = true;
    match.respawnLeft = 8;
    state.gold = Math.max(0, Math.floor(state.gold * 0.75) - 8);
  }
  if (!match.downed) return;
  match.respawnLeft = Math.max(0, match.respawnLeft - dt);
  match.objective = `침몰했다. ${Math.ceil(match.respawnLeft)}초 뒤 아군 항구로 돌아간다`;
  if (match.respawnLeft > 0 || home.hp <= 0) return;
  const hull = hullStats(player.hullTier);
  player.alive = true;
  player.sinking = false;
  player.sinkT = 0;
  player.hp = Math.max(40, hull.maxHp * 0.65);
  player.maxHp = hull.maxHp;
  player.x = home.x + 6;
  player.z = home.z + 28;
  player.heading = 0;
  player.speed = 0;
  player.hitFlash = 0;
  state.playerInvuln = 2.4;
  match.downed = false;
  match.respawnLeft = 0;
}

function maybeSpawnObjective(state: SimState, match: MatchData): void {
  const player = getPlayer(state);
  const leftNursery = !player || player.z > -180;
  if (!match.treasureSpawned && state.time >= 110 && leftNursery) {
    match.treasureSpawned = true;
    state.ships.push(fleetShip(state, 'company', 'neutral', 'prize', '보물선', 16, -8, 1.2, 210, 2, 1));
    state.events.push({ type: 'pickup', x: 16, z: -8, text: '보물선이 가운데 수로에 나타났다' });
  }
  if (!match.krakenSpawned && state.time >= 160 && leftNursery) {
    match.krakenSpawned = true;
    state.kraken = {
      x: -8,
      z: 48,
      hp: 360,
      maxHp: 360,
      alive: true,
      phase: 'idle',
      timer: 2.2,
      markers: [],
      strikeApplied: false,
      sinkT: 0,
      hitFlash: 0,
      anim: 0,
    };
  }
  if (state.kraken && state.kraken.hp <= 0 && state.kraken.alive) {
    state.kraken.alive = false;
    state.kraken.hp = 0;
  }
  if (state.kraken && !state.kraken.alive && !match.krakenRewarded && match.krakenSpawned) {
    match.krakenRewarded = true;
    state.gold += 90;
    addXp(match, 48);
    state.events.push({ type: 'pickup', x: state.kraken.x, z: state.kraken.z, text: '크라켄 포상' });
  }
}

function maybeTyphoon(state: SimState, match: MatchData): void {
  if (state.time < 95 || match.typhoonArmed || state.weather.phase !== 'calm') return;
  match.typhoonArmed = true;
  state.weather.phase = 'warning';
  state.weather.timer = 5;
  state.weather.intensity = 0.08;
  state.weather.windAngle = 0.8;
  state.events.push({ type: 'typhoon', x: 0, z: 0, text: 'warning' });
}

function refillPirates(state: SimState, match: MatchData): void {
  if (match.pirateClock > 0) return;
  const neutrals = state.ships.filter((ship) => ship.alive && ship.team === 'neutral' && ship.duty !== 'prize');
  if (neutrals.length >= 4) {
    match.pirateClock = 6;
    return;
  }
  const camps = [
    { kind: 'pirate' as const, name: '새 칼', x: 18, z: -156 },
    { kind: 'raider' as const, name: '새 그물', x: -22, z: -172 },
    { kind: 'pirate' as const, name: '돌아온 이빨', x: -24, z: 16 },
    { kind: 'raider' as const, name: '먼 메기', x: 40, z: 36 },
  ];
  const open = camps.find((camp) => !state.ships.some((ship) => ship.alive && ship.team === 'neutral' && Math.hypot(ship.x - camp.x, ship.z - camp.z) < 14));
  if (!open) {
    match.pirateClock = 8;
    return;
  }
  state.ships.push(pirateShip(state, open.kind, open.name, open.x, open.z, 0.5, 44));
  match.pirateClock = 32;
}

export function aimHint(state: SimState): string {
  const match = state.match;
  const player = getPlayer(state);
  if (!match || !player?.alive) return '';
  if (match.strikeLeft > 0 && match.strike) return match.strike;
  let name = '';
  let x = 0;
  let z = 0;
  let best = 80;
  for (const ship of state.ships) {
    if (!ship.alive || ship.team === player.team) continue;
    const dist = Math.hypot(ship.x - player.x, ship.z - player.z);
    if (dist < best) {
      best = dist;
      name = ship.name;
      x = ship.x;
      z = ship.z;
    }
  }
  if (!name) {
    const fort = match.harbors.find((harbor) => harbor.team !== player.team && harbor.hp > 0);
    if (fort) {
      const dist = Math.hypot(fort.x - player.x, fort.z - player.z);
      if (dist < 90) {
        name = fort.name;
        x = fort.x;
        z = fort.z;
        best = dist;
      }
    }
  }
  if (!name) return '';
  const aim = bestSide(player, x, z);
  const side = aim.side === 'port' ? '좌현' : '우현';
  if (aim.error < PLAYER_AIM.error && aim.dist < PLAYER_AIM.max && aim.dist > PLAYER_AIM.min) return `${side} 조준 · ${name}`;
  if (best < 80) return `${name} · ${side}으로 돌리라`;
  return '';
}

function shopLine(state: SimState, match: MatchData): string {
  const next = state.upgrades.sails + 1;
  const cost = dockCost('sails', next);
  if (next > 3) return '정비 원 안이다. 돛은 이미 최대다';
  if (match.level < next) {
    return `정비 원 안. 돛은 레벨 ${next} · 경험 ${match.xp}/${match.xpToNext}. 중립 해적을 더 격침하라`;
  }
  if (cost !== null && state.gold < cost) return `정비 원 안. 돛은 금화 ${cost}, 지금 금화 ${state.gold}`;
  return '정비 원 안이다. 아래 돛 버튼으로 살 수 있다';
}

function refreshCopy(state: SimState, match: MatchData): void {
  if (match.downed) return;
  const player = getPlayer(state);
  const home = match.harbors.find((harbor) => harbor.id === 'home');
  const prize = state.ships.some((ship) => ship.alive && ship.duty === 'prize');
  const kraken = Boolean(state.kraken?.alive);
  const away = match.harbors.find((harbor) => harbor.id === 'away');
  const dx = player && home ? home.x - player.x : 0;
  const dz = player && home ? home.z - player.z : 0;
  const dist = player && home ? Math.hypot(dx, dz) : Infinity;
  const ahead = player ? Math.sin(player.heading) * dx + Math.cos(player.heading) * dz : 0;
  const onFort = Boolean(player && away && Math.hypot(player.x - away.x, player.z - away.z) < 140);
  if (match.docked) match.objective = '노란 정비 원 안이다. 아래 버튼으로 선체·돛·함포를 사라';
  else if (player && dist < 170 && ahead > 6) match.objective = '아군 항구의 노란 원으로 들어가라. 전진을 놓으면 그 안에 선다';
  else if (onFort) match.objective = '적 항구가 앞이다. 섬에 포탄이 맞으면 체력이 깎이고, 무너지면 이긴다';
  else if (kraken) match.objective = '크라켄은 가운데 바다에 있다. 초보 어장에는 오지 않는다';
  else if (prize) match.objective = '보물선이 가운데 수로에 있다. 적보다 먼저 쳐라';
  else if (match.level < 1) {
    const remain = match.xpToNext - match.xp;
    match.objective = remain > 22
      ? `가까운 해적을 격침하라. 경험 ${match.xp}/${match.xpToNext}`
      : `해적 한 척만 더. 경험 ${match.xp}/${match.xpToNext}이면 항구에서 돛`;
  } else if (state.upgrades.sails < 1 && state.gold >= 36) match.objective = '금화가 돛값이다. 아군 항구 노란 원에서 사라';
  else if (player && player.z > 200) match.objective = '적 항구가 앞이다. 섬에 포탄이 맞으면 체력이 깎이고, 무너지면 이긴다';
  else match.objective = '가운데에서 적 함대와 붙어라. 그 다음 북쪽 적 항구를 포격한다';
  if (player?.alive && home && dist < Infinity) {
    const side = Math.cos(player.heading) * dx - Math.sin(player.heading) * dz;
    const where = ahead > 8 ? '뱃머리 쪽' : ahead < -8 ? '고물 쪽' : side > 0 ? '좌현' : '우현';
    if (match.docked) match.prompt = shopLine(state, match);
    else if (match.nearDock) {
      const gap = Math.max(1, Math.round(dist - home.dock));
      match.prompt = `노란 정비 원까지 ${gap}. 전진을 놓으면 배가 선다`;
    } else if (dist > home.dock) {
      const speed = Math.max(8, handlingFor(player).maxSpeed);
      const guide = `아군 항구 ${Math.round(dist)} · ${where} · 전속 약 ${Math.max(1, Math.round(dist / speed))}초`;
      match.prompt = match.prompt ? `${match.prompt} · ${guide}` : guide;
    }
  }
  if (match.noticeLeft > 0 && match.notice && !match.prompt.includes(match.notice)) {
    match.prompt = match.prompt ? `${match.notice} · ${match.prompt}` : match.notice;
  }
  if (player?.alive && state.playerInvuln > 0) player.hitFlash = Math.max(player.hitFlash, 0.05);
}

function judgePorts(state: SimState, match: MatchData): void {
  if (match.result) return;
  const home = match.harbors.find((harbor) => harbor.id === 'home');
  const away = match.harbors.find((harbor) => harbor.id === 'away');
  if (!home || !away) return;
  if (away.hp <= 0) {
    away.hp = 0;
    match.result = 'victory';
    state.finale = 'victory';
    state.finaleTimer = 1.05;
  } else if (home.hp <= 0) {
    home.hp = 0;
    match.result = 'defeat';
    state.finale = 'defeat';
    state.finaleTimer = 0.8;
  }
}

export function addXp(match: MatchData, amount: number): void {
  match.xp += amount;
  while (match.level < 5 && match.xp >= match.xpToNext) {
    match.xp -= match.xpToNext;
    match.level += 1;
    match.xpToNext = xpForLevel(match.level);
  }
}

export function awardMatchKill(state: SimState, ship: Ship): void {
  const match = state.match;
  if (!match || ship.struckBy !== 'friendly' || ship.team === 'friendly') return;
  if (ship.duty === 'prize') {
    state.gold += 70;
    addXp(match, 40);
    state.events.push({ type: 'pickup', x: ship.x, z: ship.z, faction: ship.faction, text: '+70 보물' });
    return;
  }
  const neutral = ship.team === 'neutral';
  const gold = neutral ? 18 : 24;
  state.gold += gold;
  addXp(match, neutral ? 22 : 12);
  state.events.push({ type: 'pickup', x: ship.x, z: ship.z, faction: ship.faction, text: `+${gold}` });
}

function blankShip(spec: {
  id: string;
  faction: Faction;
  team: Team;
  duty: Duty;
  name: string;
  x: number;
  z: number;
  heading: number;
  hp: number;
  length: number;
  beam: number;
  hullTier: number;
  sailTier: number;
  cannonTier: number;
}): Ship {
  return {
    id: spec.id,
    faction: spec.faction,
    team: spec.team,
    duty: spec.duty,
    name: spec.name,
    x: spec.x,
    z: spec.z,
    heading: spec.heading,
    speed: 0,
    helm: 0,
    hp: spec.hp,
    maxHp: spec.hp,
    length: spec.length,
    beam: spec.beam,
    hullTier: spec.hullTier,
    sailTier: spec.sailTier,
    cannonTier: spec.cannonTier,
    reloadPort: 0.2,
    reloadStarboard: 0.4,
    alive: true,
    sinking: false,
    sinkT: 0,
    hitFlash: 0,
    collideCd: 0,
    focusId: '',
    anchorX: spec.x,
    anchorZ: spec.z,
    struckBy: '',
  };
}

function fleetShip(
  state: SimState,
  faction: Faction,
  team: Team,
  duty: Duty,
  name: string,
  x: number,
  z: number,
  heading: number,
  hp: number,
  cannonTier = 1,
  sailTier = 1,
): Ship {
  const heavy = faction === 'navy' || faction === 'company';
  const ship = blankShip({
    id: `${duty}-${state.nextId++}`,
    faction,
    team,
    duty,
    name,
    x,
    z,
    heading,
    hp,
    length: heavy ? 10.4 : 8.2,
    beam: heavy ? 3 : 2.5,
    hullTier: heavy ? 1 : 0,
    sailTier,
    cannonTier,
  });
  ship.reloadPort = 0.8;
  return ship;
}

function pirateShip(state: SimState, faction: 'pirate' | 'raider', name: string, x: number, z: number, heading: number, hp: number): Ship {
  return blankShip({
    id: `neutral-${state.nextId++}`,
    faction,
    team: 'neutral',
    duty: 'hunt',
    name,
    x,
    z,
    heading,
    hp,
    length: faction === 'raider' ? 7.4 : 8.2,
    beam: 2.4,
    hullTier: 0,
    sailTier: 1,
    cannonTier: 0,
  });
}
