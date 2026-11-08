import { avoidTerrainHeading, intentFor } from './ai';
import { hullStats, playerShipName } from './balance';
import { normalizeAngle, turnToward } from './math';
import type { TerrainBody } from './terrain';
import type { Duty, Faction, FishSpot, Harbor, MatchData, Ship, SimState, Team, Track } from './types';
import { fireBroadside, getPlayer, moveShip } from './simulation';

export const MATCH_BOUNDS = 102;

export const MATCH_TERRAIN: TerrainBody[] = [
  { kind: 'island', x: -18, z: 2, radius: 10 },
  { kind: 'island', x: 22, z: 6, radius: 9 },
  { kind: 'reef', x: 2, z: 10, radius: 3.4 },
  { kind: 'reef', x: -8, z: -12, radius: 3.6 },
  { kind: 'reef', x: 30, z: -36, radius: 4 },
  { kind: 'coast', x: -48, z: -20, radius: 8 },
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
    { id: 'home', team: 'friendly', name: '아군 항구', x: -10, z: -70, hp: 480, maxHp: 480, reload: 0.6, core: 6.4, dock: 18, gunRange: 23 },
    { id: 'away', team: 'enemy', name: '적 항구', x: 10, z: 70, hp: 480, maxHp: 480, reload: 0.6, core: 6.4, dock: 18, gunRange: 23 },
  ];
  const fish: FishSpot[] = [
    { id: 'f1', x: -14, z: -64, cooldown: 0 },
    { id: 'f2', x: 12, z: -58, cooldown: 1.5 },
    { id: 'f3', x: -2, z: -46, cooldown: 0 },
    { id: 'f4', x: 14, z: 64, cooldown: 0 },
    { id: 'f5', x: -12, z: 58, cooldown: 1.5 },
    { id: 'f6', x: 2, z: 46, cooldown: 0 },
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
    docked: false,
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
    x: 2,
    z: -54,
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
    fleetShip(state, 'ally', 'friendly', 'defend', '등대 호위', 8, -66, Math.PI, 90),
    fleetShip(state, 'ally', 'friendly', 'push', '금빛 선수', -10, -50, 0.2, 84),
    fleetShip(state, 'navy', 'enemy', 'defend', '방파제', -6, 64, Math.PI, 110),
    fleetShip(state, 'navy', 'enemy', 'push', '북풍', -12, 54, Math.PI, 96),
    fleetShip(state, 'navy', 'enemy', 'push', '철닻', 14, 52, -2.6, 96),
    pirateShip(state, 'raider', '모래메기', -22, -34, 0.4, 42),
    pirateShip(state, 'pirate', '표류 칼', 18, -30, -1.2, 46),
    pirateShip(state, 'pirate', '가운데 이빨', -16, 24, 1.4, 48),
    pirateShip(state, 'raider', '먼 그물', 24, 34, 2.2, 44),
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
  for (const spot of match.fish) spot.cooldown = Math.max(0, spot.cooldown - frame);
  match.pirateClock -= frame;
  harvestFish(state, match);
  if (state.aiEnabled) steerFleets(state, match, bodies, frame);
  fireHarborGuns(state, match, frame);
  keepShipsOffForts(state, match);
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
  if (!player?.alive) return;
  const home = match.harbors.find((harbor) => harbor.id === 'home');
  if (home && Math.hypot(player.x - home.x, player.z - home.z) <= home.dock) {
    match.docked = true;
    match.prompt = '아군 항구. 레벨이 되면 선체·돛·함포를 살 수 있다';
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
    state.events.push({ type: 'pickup', x: spot.x, z: spot.z, text: `식량 +${Math.round(player.hp - before)}` });
    match.prompt = '고기를 건졌다. 선체가 회복되고 금화 5를 얻었다';
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
  if (ship.team === 'enemy') {
    const z = t < 38 ? 34 : t < 78 ? 4 : -48;
    return { x: ship.anchorX * 0.35, z };
  }
  const z = t < 38 ? -28 : t < 78 ? 0 : 46;
  return { x: ship.anchorX * 0.35, z };
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
  player.x = home.x + 2;
  player.z = home.z + home.dock * 0.55;
  player.heading = 0;
  player.speed = 0;
  player.hitFlash = 0;
  state.playerInvuln = 2.4;
  match.downed = false;
  match.respawnLeft = 0;
}

function maybeSpawnObjective(state: SimState, match: MatchData): void {
  if (!match.treasureSpawned && state.time >= 70) {
    match.treasureSpawned = true;
    state.ships.push(fleetShip(state, 'company', 'neutral', 'prize', '보물선', 4, 8, 1.2, 210, 2, 1));
    state.events.push({ type: 'pickup', x: 4, z: 8, text: '보물선' });
  }
  if (!match.krakenSpawned && state.time >= 118) {
    match.krakenSpawned = true;
    state.kraken = {
      x: -6,
      z: 14,
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
  if (state.time < 85 || match.typhoonArmed || state.weather.phase !== 'calm') return;
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
    { kind: 'pirate' as const, name: '새 칼', x: -22, z: -34 },
    { kind: 'raider' as const, name: '새 그물', x: 18, z: -30 },
    { kind: 'pirate' as const, name: '돌아온 이빨', x: -16, z: 24 },
    { kind: 'raider' as const, name: '먼 메기', x: 24, z: 34 },
  ];
  const open = camps.find((camp) => !state.ships.some((ship) => ship.alive && ship.team === 'neutral' && Math.hypot(ship.x - camp.x, ship.z - camp.z) < 14));
  if (!open) {
    match.pirateClock = 8;
    return;
  }
  state.ships.push(pirateShip(state, open.kind, open.name, open.x, open.z, 0.5, 44));
  match.pirateClock = 32;
}

function refreshCopy(state: SimState, match: MatchData): void {
  if (match.downed) return;
  const prize = state.ships.some((ship) => ship.alive && ship.duty === 'prize');
  const kraken = Boolean(state.kraken?.alive);
  if (match.docked) match.objective = '아군 항구에서 배를 고친다';
  else if (kraken) match.objective = '크라켄을 포격하면 큰 포상이 있다';
  else if (prize) match.objective = '보물선이 가운데 수로에 있다. 적보다 먼저 쳐라';
  else if (state.time < 55) match.objective = '고기와 중립 해적으로 레벨을 올려라';
  else match.objective = '적 항구를 부숴라. 섬 사이 수로와 바깥 뱃길이 있다';
  const player = getPlayer(state);
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
