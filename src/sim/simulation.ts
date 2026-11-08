import { bestSide, intentFor, PLAYER_AIM, selectTarget } from './ai';
import {
  bountyFor,
  cannonProfile,
  handlingFor,
  hullStats,
  KRAKEN_BOUNTY,
  playerShipName,
  STAGES,
  UPGRADE_COST,
} from './balance';
import { approach, clamp, forward, nextRandom, normalizeAngle, sideDirection } from './math';
import { terrainHit } from './terrain';
import type { Faction, Input, Kraken, Ship, Side, SimState, Team, Track, Weather } from './types';

export interface UpgradeResult {
  ok: boolean;
  reason?: 'max' | 'gold' | 'closed';
  cost?: number;
  tier?: number;
}

const CALM_WEATHER = (): Weather => ({
  phase: 'calm',
  timer: 0,
  intensity: 0,
  windAngle: 0,
  windX: 0,
  windZ: 0,
});

export function createCampaign(seed = 1): SimState {
  return {
    status: 'title',
    stageIndex: 0,
    gold: 0,
    goldAtStageStart: 0,
    upgrades: { hull: 0, sails: 0, cannons: 0 },
    upgradeReady: false,
    ships: [],
    projectiles: [],
    treasures: [],
    kraken: null,
    weather: CALM_WEATHER(),
    time: 0,
    stageTime: 0,
    finale: null,
    finaleTimer: 0,
    rngState: seed >>> 0 || 1,
    nextId: 1,
    typhoonRolled: false,
    campaignCleared: false,
    playerInvuln: 0,
    aiEnabled: true,
    shotsFired: 0,
    introTimer: 0,
    introText: '',
    events: [],
    match: null,
    terrainOverride: null,
    boundsOverride: null,
  };
}

export function getPlayer(state: SimState): Ship | undefined {
  return state.ships.find((ship) => ship.faction === 'player');
}

export function threatCount(state: SimState): number {
  const ships = state.ships.filter((ship) => ship.faction !== 'player' && ship.alive).length;
  return ships + (state.kraken?.alive ? 1 : 0);
}

export function hostile(a: Faction, b: Faction): boolean {
  return a !== b;
}

export function teamsClash(a: Team, b: Team): boolean {
  return a !== b;
}

function terrainOf(state: SimState) {
  return state.terrainOverride ?? STAGES[state.stageIndex]?.terrain ?? [];
}

function rand(state: SimState): number {
  const next = nextRandom(state.rngState);
  state.rngState = next.seed;
  return next.value;
}

function makePlayer(state: SimState, stageIndex: number): Ship {
  const stage = STAGES[stageIndex];
  const hull = hullStats(state.upgrades.hull);
  if (!stage) {
    throw new Error('missing stage');
  }
  return {
    id: 'player',
    faction: 'player',
    name: playerShipName(state.upgrades.hull),
    x: stage.playerX,
    z: stage.playerZ,
    heading: stage.playerHeading,
    speed: 0,
    helm: 0,
    hp: hull.maxHp,
    maxHp: hull.maxHp,
    length: hull.length,
    beam: hull.beam,
    hullTier: state.upgrades.hull,
    sailTier: state.upgrades.sails,
    cannonTier: state.upgrades.cannons,
    reloadPort: 0,
    reloadStarboard: 0,
    alive: true,
    sinking: false,
    sinkT: 0,
    hitFlash: 0,
    collideCd: 0,
    focusId: '',
    team: 'player',
    duty: '',
    anchorX: stage.playerX,
    anchorZ: stage.playerZ,
    struckBy: '',
  };
}

function makeEnemy(spawn: (typeof STAGES)[number]['enemies'][number], index: number, state: SimState): Ship {
  const heavy = spawn.kind === 'navy' || spawn.kind === 'company';
  const raider = spawn.kind === 'raider';
  return {
    id: `${spawn.kind}-${index}-${state.nextId++}`,
    faction: spawn.kind,
    name: spawn.name,
    x: spawn.x,
    z: spawn.z,
    heading: spawn.heading,
    speed: 0,
    helm: 0,
    hp: spawn.hp,
    maxHp: spawn.hp,
    length: heavy ? (spawn.kind === 'navy' ? 11.4 : 10.6) : raider ? 7.4 : 8.6,
    beam: heavy ? 3.15 : raider ? 2.35 : 2.7,
    hullTier: heavy ? 1 : 0,
    sailTier: spawn.sailTier,
    cannonTier: spawn.cannonTier,
    reloadPort: 0.4 + index * 0.2,
    reloadStarboard: 0.7 + index * 0.15,
    alive: true,
    sinking: false,
    sinkT: 0,
    hitFlash: 0,
    collideCd: 0,
    focusId: '',
    team: spawn.kind,
    duty: '',
    anchorX: spawn.x,
    anchorZ: spawn.z,
    struckBy: '',
  };
}

export function beginStage(state: SimState, index: number): void {
  const stage = STAGES[index];
  if (!stage) return;
  state.status = 'playing';
  state.stageIndex = index;
  state.upgradeReady = false;
  state.finale = null;
  state.finaleTimer = 0;
  state.projectiles = [];
  state.events = [];
  state.typhoonRolled = false;
  state.stageTime = 0;
  state.time = 0;
  state.introTimer = 4.6;
  state.introText = stage.objective;
  state.playerInvuln = 0;
  state.match = null;
  state.terrainOverride = null;
  state.boundsOverride = null;
  state.shotsFired = 0;
  state.goldAtStageStart = state.gold;
  state.weather = CALM_WEATHER();
  state.kraken = stage.kraken
    ? {
        x: stage.kraken.x,
        z: stage.kraken.z,
        hp: stage.kraken.hp,
        maxHp: stage.kraken.hp,
        alive: true,
        phase: 'idle',
        timer: 1.8,
        markers: [],
        strikeApplied: false,
        sinkT: 0,
        hitFlash: 0,
        anim: 0,
      }
    : null;
  state.treasures = stage.treasures.map((treasure, treasureIndex) => ({
    id: `gem-${index}-${treasureIndex}`,
    x: treasure.x,
    z: treasure.z,
    gold: treasure.gold,
    taken: false,
  }));
  state.ships = [makePlayer(state, index), ...stage.enemies.map((enemy, enemyIndex) => makeEnemy(enemy, enemyIndex, state))];
}

export function ellipseHit(x: number, z: number, ship: Ship): boolean {
  const dx = x - ship.x;
  const dz = z - ship.z;
  const localZ = dx * Math.sin(ship.heading) + dz * Math.cos(ship.heading);
  const localX = dx * Math.cos(ship.heading) + dz * -Math.sin(ship.heading);
  const rx = ship.beam * 0.62 + 0.85;
  const rz = ship.length * 0.46 + 0.7;
  return (localX * localX) / (rx * rx) + (localZ * localZ) / (rz * rz) <= 1;
}

export function fireBroadside(state: SimState, ship: Ship, side: Side): number {
  if (!ship.alive) return 0;
  if (side === 'port' && ship.reloadPort > 0) return 0;
  if (side === 'starboard' && ship.reloadStarboard > 0) return 0;
  const stats = cannonProfile(ship.faction, ship.cannonTier);
  const dir = sideDirection(ship.heading, side);
  const nose = forward(ship.heading);
  const baseAngle = Math.atan2(dir.x, dir.z);
  for (let i = 0; i < stats.shots; i += 1) {
    const along = stats.shots === 1 ? 0 : (i / (stats.shots - 1) - 0.5) * ship.length * 0.62;
    const jitter = (rand(state) - 0.5) * stats.spread * 2;
    const angle = baseAngle + jitter;
    const x = ship.x + dir.x * (ship.beam * 0.55 + 0.35) + nose.x * along;
    const z = ship.z + dir.z * (ship.beam * 0.55 + 0.35) + nose.z * along;
    state.projectiles.push({
      id: state.nextId++,
      ownerId: ship.id,
      faction: ship.faction,
      team: ship.team,
      x,
      z,
      vx: Math.sin(angle) * stats.shotSpeed + nose.x * ship.speed * 0.35,
      vz: Math.cos(angle) * stats.shotSpeed + nose.z * ship.speed * 0.35,
      damage: stats.damage,
      life: stats.life,
      maxLife: stats.life,
      impact: null,
    });
    state.events.push({ type: 'fire', x, z, faction: ship.faction });
  }
  if (side === 'port') ship.reloadPort = stats.reload;
  else ship.reloadStarboard = stats.reload;
  if (ship.faction === 'player') state.shotsFired += stats.shots;
  return stats.shots;
}

function grantFriendly(state: SimState, gold: number, xp: number): void {
  state.gold += gold;
  const match = state.match;
  if (!match) return;
  match.xp += xp;
  while (match.level < 5 && match.xp >= match.xpToNext) {
    match.xp -= match.xpToNext;
    match.level += 1;
    match.xpToNext = 34 + match.level * 26;
  }
}

function killShip(state: SimState, ship: Ship): void {
  if (!ship.alive) return;
  ship.alive = false;
  ship.sinking = true;
  ship.hp = 0;
  if (state.match) {
    if (ship.struckBy === 'friendly' && ship.team !== 'friendly') {
      if (ship.duty === 'prize') grantFriendly(state, 70, 40);
      else grantFriendly(state, ship.team === 'neutral' ? 18 : 24, ship.team === 'neutral' ? 22 : 12);
      const gold = ship.duty === 'prize' ? 70 : ship.team === 'neutral' ? 18 : 24;
      const xp = ship.duty === 'prize' ? 40 : ship.team === 'neutral' ? 22 : 12;
      const line = `${ship.name} 격침 · 금화 +${gold} · 경험 +${xp}`;
      state.match.notice = line;
      state.match.noticeLeft = 4.2;
      state.events.push({
        type: 'pickup',
        x: ship.x,
        z: ship.z,
        faction: ship.faction,
        text: line,
      });
    }
    return;
  }
  if (ship.faction !== 'player') {
    const gold = bountyFor(ship.faction, state.stageIndex);
    state.gold += gold;
    state.events.push({ type: 'pickup', x: ship.x, z: ship.z, faction: ship.faction, text: `+${gold}` });
  }
}

function damageShip(state: SimState, ship: Ship, amount: number, by: Team | '' = ''): void {
  if (!ship.alive) return;
  if (state.playerInvuln > 0 && ship.faction === 'player') return;
  ship.hp -= amount;
  ship.hitFlash = 0.16;
  if (by) ship.struckBy = by;
  state.events.push({ type: 'hit', x: ship.x, z: ship.z, faction: ship.faction });
  if (ship.hp <= 0) killShip(state, ship);
}

function integrate(ship: Ship, throttle: number, turn: number, dt: number, weather: Weather): void {
  const stats = handlingFor(ship);
  const storm = weather.intensity;
  const maxSpeed = stats.maxSpeed * (1 - 0.22 * storm);
  const turnRate = stats.turnRate * (1 - 0.12 * storm);
  const target = clamp(throttle, -0.65, 1) * maxSpeed;
  ship.speed = approach(ship.speed, target, stats.accel * dt);
  const speedFactor = 0.4 + 0.6 * Math.min(1, Math.abs(ship.speed) / Math.max(1, maxSpeed));
  ship.heading = normalizeAngle(ship.heading + clamp(turn, -1, 1) * turnRate * speedFactor * dt);
  ship.helm = clamp(turn, -1, 1);
  const nose = forward(ship.heading);
  ship.x += (nose.x * ship.speed + weather.windX) * dt;
  ship.z += (nose.z * ship.speed + weather.windZ) * dt;
}

function clampToBounds(ship: Ship, bounds: number): void {
  const dist = Math.hypot(ship.x, ship.z);
  if (dist > bounds) {
    ship.x *= bounds / dist;
    ship.z *= bounds / dist;
  }
}

function nearestThreat(state: SimState, player: Ship): { x: number; z: number } | null {
  let best: { x: number; z: number } | null = null;
  let bestDist = Infinity;
  for (const ship of state.ships) {
    if (!ship.alive || ship.team === player.team) continue;
    const dist = Math.hypot(ship.x - player.x, ship.z - player.z);
    if (dist < bestDist) {
      bestDist = dist;
      best = ship;
    }
  }
  if (state.kraken?.alive) {
    const dist = Math.hypot(state.kraken.x - player.x, state.kraken.z - player.z);
    if (dist < bestDist) best = state.kraken;
  }
  return best;
}

function controlPlayer(state: SimState, player: Ship, input: Input, dt: number): void {
  if (state.finale === 'defeat') return;
  integrate(player, input.throttle, input.turn, dt, state.weather);
  if (input.firePort) fireBroadside(state, player, 'port');
  if (input.fireStarboard) fireBroadside(state, player, 'starboard');
  if (input.fireSmart) {
    const target = nearestThreat(state, player);
    if (target) {
      const aim = bestSide(player, target.x, target.z);
      if (aim.error < PLAYER_AIM.error && aim.dist < PLAYER_AIM.max && aim.dist > PLAYER_AIM.min) fireBroadside(state, player, aim.side);
    }
  }
}

export function moveShip(ship: Ship, throttle: number, turn: number, dt: number, weather: Weather): void {
  integrate(ship, throttle, turn, dt, weather);
}

export function settleWorld(state: SimState): void {
  resolveTerrain(state);
  const stage = STAGES[state.stageIndex];
  const bounds = state.boundsOverride ?? stage?.bounds ?? 90;
  for (const ship of state.ships) {
    if (ship.alive) clampToBounds(ship, bounds);
  }
}

function controlEnemies(state: SimState, _player: Ship, dt: number): void {
  if (state.match || !state.aiEnabled || state.finale === 'defeat') return;
  const bodies = terrainOf(state);
  for (const ship of state.ships) {
    if (!ship.alive || ship.faction === 'player') continue;
    const target = selectTarget(ship, state.ships);
    if (!target) {
      integrate(ship, 0.35, 0, dt, state.weather);
      continue;
    }
    ship.focusId = target.id;
    const intent = intentFor(ship, target, bodies);
    integrate(ship, intent.throttle, intent.turn, dt, state.weather);
    if (intent.fire && state.finale === null) fireBroadside(state, ship, intent.fire);
  }
}

function resolveTerrain(state: SimState): void {
  const bodies = terrainOf(state);
  if (bodies.length === 0) return;
  for (const ship of state.ships) {
    if (!ship.alive) continue;
    for (let pass = 0; pass < 3; pass += 1) {
      for (const body of bodies) {
        const real = Math.hypot(ship.x - body.x, ship.z - body.z);
        let dx = ship.x - body.x;
        let dz = ship.z - body.z;
        if (real < 0.001) {
          dx = 1;
          dz = 0;
        }
        const dist = Math.hypot(dx, dz) || 1;
        const min = body.radius + ship.beam * 0.42;
        if (real >= min) continue;
        const nx = dx / dist;
        const nz = dz / dist;
        ship.x += nx * (min - real);
        ship.z += nz * (min - real);
        const nose = forward(ship.heading);
        const outward = nose.x * nx + nose.z * nz;
        const impact = Math.max(0, -ship.speed * outward);
        if (impact > 5.5 && ship.collideCd <= 0) {
          const taken = ship.faction === 'player' ? hullStats(ship.hullTier).collisionTaken : 1;
          damageShip(state, ship, (5 + impact * 0.45) * taken);
          ship.collideCd = 1.15;
        }
        if (outward < 0) ship.speed *= 0.28;
      }
    }
  }
}

function placeMarker(kraken: Kraken, player: Ship, offsetX: number, offsetZ: number) {
  let x = player.x + Math.sin(player.heading) * player.speed * 0.45 + offsetX;
  let z = player.z + Math.cos(player.heading) * player.speed * 0.45 + offsetZ;
  const dx = x - kraken.x;
  const dz = z - kraken.z;
  const dist = Math.hypot(dx, dz) || 1;
  const reach = 44;
  if (dist > reach) {
    x = kraken.x + (dx / dist) * reach;
    z = kraken.z + (dz / dist) * reach;
  }
  const enraged = kraken.hp < kraken.maxHp * 0.4;
  return { x, z, radius: enraged ? 7 : 8.2 };
}

function openTelegraph(state: SimState, kraken: Kraken, player: Ship): void {
  const enraged = kraken.hp < kraken.maxHp * 0.4;
  const jitter = () => (rand(state) - 0.5) * 4.4;
    const markers = [placeMarker(kraken, player, jitter(), jitter())];
    if (enraged) {
      const side = sideDirection(player.heading, 'port');
      markers.push(placeMarker(kraken, player, side.x * 11 + jitter() * 0.4, side.z * 11 + jitter() * 0.4));
    }
  kraken.markers = markers;
  kraken.phase = 'telegraph';
  kraken.timer = enraged ? 1.05 : 1.5;
  kraken.strikeApplied = false;
}

function applySlam(state: SimState, kraken: Kraken, player: Ship): void {
  for (const marker of kraken.markers) {
    state.events.push({ type: 'slam', x: marker.x, z: marker.z });
  }
  if (state.playerInvuln > 0) return;
  const enraged = kraken.hp < kraken.maxHp * 0.4;
  for (const marker of kraken.markers) {
    if (Math.hypot(player.x - marker.x, player.z - marker.z) <= marker.radius) {
      player.hp -= enraged ? 26 : 18;
      player.hitFlash = 0.22;
      state.playerInvuln = 0.5;
      player.struckBy = 'neutral';
      state.events.push({ type: 'hit', x: player.x, z: player.z, faction: 'player' });
      if (player.hp <= 0) killShip(state, player);
      break;
    }
  }
}

function stepKraken(state: SimState, player: Ship, dt: number): void {
  const kraken = state.kraken;
  if (!kraken?.alive || !player.alive) return;
  kraken.anim += dt;
  kraken.hitFlash = Math.max(0, kraken.hitFlash - dt);
  const dx = player.x - kraken.x;
  const dz = player.z - kraken.z;
  const dist = Math.hypot(dx, dz) || 1;
  let move = 0;
  if (dist > 21) move = 1;
  else if (dist < 14) move = -1;
  const slow = kraken.phase === 'telegraph' ? 0.35 : 1;
  kraken.x += (dx / dist) * 5.2 * slow * move * dt;
  kraken.z += (dz / dist) * 5.2 * slow * move * dt;
  const bounds = STAGES[state.stageIndex]?.bounds ?? 100;
  const bodyDist = Math.hypot(kraken.x, kraken.z);
  if (bodyDist > bounds) {
    kraken.x *= bounds / bodyDist;
    kraken.z *= bounds / bodyDist;
  }

  if (kraken.phase === 'idle') {
    kraken.timer -= dt;
    if (kraken.timer <= 0 && state.finale === null) openTelegraph(state, kraken, player);
    return;
  }
  if (kraken.phase === 'telegraph') {
    kraken.timer -= dt;
    if (kraken.timer <= 0) {
      kraken.phase = 'strike';
      kraken.timer = 0.28;
      kraken.strikeApplied = true;
      applySlam(state, kraken, player);
    }
    return;
  }
  if (kraken.phase === 'strike') {
    kraken.timer -= dt;
    if (kraken.timer <= 0) {
      kraken.phase = 'recover';
      kraken.timer = kraken.hp < kraken.maxHp * 0.4 ? 0.48 : 0.85;
      kraken.markers = [];
    }
    return;
  }
  kraken.timer -= dt;
  if (kraken.timer <= 0) {
    kraken.phase = 'idle';
    kraken.timer = kraken.hp < kraken.maxHp * 0.4 ? 0.32 : 0.7;
  }
}

function hitProjectile(state: SimState, projectileIndex: number): boolean {
  const projectile = state.projectiles[projectileIndex];
  if (!projectile || projectile.life <= 0) return false;
  for (const ship of state.ships) {
    if (!ship.alive || ship.id === projectile.ownerId) continue;
    if (!ellipseHit(projectile.x, projectile.z, ship)) continue;
    if (!teamsClash(projectile.team, ship.team)) continue;
    if (projectile.faction === 'player') notePlayerHit(state, ship.name, projectile.damage);
    damageShip(state, ship, projectile.damage, projectile.team);
    projectile.impact = 'ship';
    projectile.life = 0;
    return true;
  }
  const kraken = state.kraken;
  if (kraken?.alive && Math.hypot(projectile.x - kraken.x, projectile.z - kraken.z) < 8) {
    kraken.hp -= projectile.damage;
    kraken.hitFlash = 0.14;
    projectile.impact = 'kraken';
    projectile.life = 0;
    state.events.push({ type: 'hit', x: kraken.x, z: kraken.z });
    return true;
  }
  return false;
}

function advanceProjectiles(state: SimState, dt: number): void {
  const substeps = Math.max(1, Math.ceil(dt / 0.016));
  const stepDt = dt / substeps;
  for (let sub = 0; sub < substeps; sub += 1) {
    for (let i = 0; i < state.projectiles.length; i += 1) {
      const projectile = state.projectiles[i];
      if (!projectile || projectile.life <= 0) continue;
      projectile.x += projectile.vx * stepDt;
      projectile.z += projectile.vz * stepDt;
      projectile.life -= stepDt;
      if (projectile.life <= 0) continue;
      const bodies = terrainOf(state);
      if (hitHarbor(state, projectile)) continue;
      if (terrainHit(projectile.x, projectile.z, 0.35, bodies)) {
        projectile.impact = 'water';
        projectile.life = 0;
        state.events.push({ type: 'splash', x: projectile.x, z: projectile.z, text: 'terrain' });
        continue;
      }
      hitProjectile(state, i);
    }
  }
  for (const projectile of state.projectiles) {
    if (projectile.life <= 0 && projectile.impact === null) {
      projectile.impact = 'water';
      state.events.push({ type: 'splash', x: projectile.x, z: projectile.z });
    }
  }
  state.projectiles = state.projectiles.filter((projectile) => projectile.life > 0);
}

function resolveRams(state: SimState): void {
  const ships = state.ships.filter((ship) => ship.alive);
  for (let i = 0; i < ships.length; i += 1) {
    for (let j = i + 1; j < ships.length; j += 1) {
      const a = ships[i];
      const b = ships[j];
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const dist = Math.hypot(dx, dz) || 0.0001;
      const minDist = a.beam * 0.55 + b.beam * 0.55 + 1.15;
      if (dist >= minDist) continue;
      const nx = dx / dist;
      const nz = dz / dist;
      const push = (minDist - dist) * 0.5;
      a.x -= nx * push;
      a.z -= nz * push;
      b.x += nx * push;
      b.z += nz * push;
      if (a.collideCd > 0 || b.collideCd > 0) continue;
      const relative = Math.abs(a.speed) + Math.abs(b.speed);
      if (relative < 4.5) continue;
      const base = 5 + relative * 0.28;
      const dealt = (ship: Ship) => (ship.faction === 'player' ? hullStats(ship.hullTier).collisionDealt : 1);
      const taken = (ship: Ship) => (ship.faction === 'player' ? hullStats(ship.hullTier).collisionTaken : 1);
      damageShip(state, a, base * dealt(b) * taken(a), b.team);
      damageShip(state, b, base * dealt(a) * taken(b), a.team);
      a.collideCd = 0.85;
      b.collideCd = 0.85;
    }
  }
}

function collectTreasure(state: SimState, player: Ship): void {
  for (const treasure of state.treasures) {
    if (treasure.taken) continue;
    if (Math.hypot(player.x - treasure.x, player.z - treasure.z) > 3.4) continue;
    treasure.taken = true;
    state.gold += treasure.gold;
    state.events.push({ type: 'pickup', x: treasure.x, z: treasure.z, text: `+${treasure.gold}` });
  }
}

function separateFromKraken(player: Ship, kraken: Kraken | null): void {
  if (!kraken?.alive) return;
  const dx = player.x - kraken.x;
  const dz = player.z - kraken.z;
  const dist = Math.hypot(dx, dz) || 0.001;
  const minDist = 7.2;
  if (dist < minDist) {
    player.x = kraken.x + (dx / dist) * minDist;
    player.z = kraken.z + (dz / dist) * minDist;
  }
}

function updateWeather(state: SimState, dt: number): void {
  const stage = STAGES[state.stageIndex];
  const weather = state.weather;
  if (!stage) return;
  if (!state.typhoonRolled && stage.typhoonChance > 0 && state.stageTime > stage.typhoonDelay) {
    state.typhoonRolled = true;
    if (rand(state) < stage.typhoonChance) {
      weather.phase = 'warning';
      weather.timer = 4.5;
      weather.windAngle = rand(state) * Math.PI * 2;
      weather.intensity = Math.min(0.12, dt * 0.18);
      state.events.push({ type: 'typhoon', x: 0, z: 0, text: 'warning' });
      const gust = weather.intensity * 8;
      weather.windX = Math.cos(weather.windAngle) * gust;
      weather.windZ = Math.sin(weather.windAngle) * gust;
      return;
    }
  }
  if (weather.phase === 'warning') {
    weather.intensity = approach(weather.intensity, 0.38, dt * 0.18);
    weather.timer -= dt;
    if (weather.timer <= 0) {
      weather.phase = 'storm';
      weather.timer = 14;
      state.events.push({ type: 'typhoon', x: 0, z: 0, text: 'storm' });
    }
  } else if (weather.phase === 'storm') {
    weather.intensity = approach(weather.intensity, 1, dt * 0.28);
    weather.timer -= dt;
    if (weather.timer <= 0) {
      weather.phase = 'clearing';
      weather.timer = 3.4;
    }
  } else if (weather.phase === 'clearing') {
    weather.intensity = approach(weather.intensity, 0, dt * 0.4);
    weather.timer -= dt;
    if (weather.timer <= 0) {
      weather.phase = 'calm';
      weather.intensity = 0;
      weather.timer = 0;
    }
  } else {
    weather.intensity = approach(weather.intensity, 0, dt * 0.5);
  }
  const windSpeed = weather.intensity * 8;
  weather.windX = Math.cos(weather.windAngle) * windSpeed;
  weather.windZ = Math.sin(weather.windAngle) * windSpeed;
}

function notePlayerHit(state: SimState, name: string, damage: number): void {
  if (!state.match) return;
  state.match.strike = `${name} 명중 ${Math.round(damage)}`;
  state.match.strikeLeft = 1.4;
}

function hitHarbor(state: SimState, projectile: SimState['projectiles'][number]): boolean {
  if (!state.match || projectile.life <= 0) return false;
  for (const harbor of state.match.harbors) {
    if (harbor.hp <= 0 || harbor.team === projectile.team) continue;
    if (Math.hypot(projectile.x - harbor.x, projectile.z - harbor.z) > harbor.core) continue;
    harbor.hp = Math.max(0, harbor.hp - projectile.damage);
    if (projectile.faction === 'player') notePlayerHit(state, harbor.name, projectile.damage);
    projectile.impact = 'ship';
    projectile.life = 0;
    state.events.push({ type: 'hit', x: harbor.x, z: harbor.z, text: harbor.id });
    return true;
  }
  return false;
}

function evaluateFinale(state: SimState): void {
  if (state.match) return;
  const stage = STAGES[state.stageIndex];
  const player = getPlayer(state);
  if (!stage || !player) return;
  for (const ship of state.ships) {
    if (ship.alive && ship.hp <= 0) killShip(state, ship);
  }
  if (state.kraken?.alive && state.kraken.hp <= 0) {
    state.kraken.alive = false;
    state.kraken.hp = 0;
    state.gold += KRAKEN_BOUNTY;
    state.events.push({ type: 'pickup', x: state.kraken.x, z: state.kraken.z, text: `+${KRAKEN_BOUNTY}` });
  }
  if (!player.alive) {
    if (state.finale === 'victory') state.gold = Math.max(state.goldAtStageStart, state.gold - stage.clearBonus);
    if (state.finale !== 'defeat') {
      state.finale = 'defeat';
      state.finaleTimer = 0.7;
    }
  } else if (threatCount(state) === 0 && state.finale === null) {
    state.finale = 'victory';
    state.finaleTimer = 1.05;
    state.gold += stage.clearBonus;
  }
}

export function step(state: SimState, input: Input, dt: number): void {
  state.events = [];
  if (state.status !== 'playing') return;
  const stage = STAGES[state.stageIndex];
  const player = getPlayer(state);
  if (!stage || !player) return;
  const frame = Math.max(0, dt);
  state.time += frame;
  state.stageTime += frame;
  state.introTimer = Math.max(0, state.introTimer - frame);
  state.playerInvuln = Math.max(0, state.playerInvuln - frame);
  for (const ship of state.ships) {
    ship.reloadPort = Math.max(0, ship.reloadPort - frame);
    ship.reloadStarboard = Math.max(0, ship.reloadStarboard - frame);
    ship.hitFlash = Math.max(0, ship.hitFlash - frame);
    ship.collideCd = Math.max(0, ship.collideCd - frame);
    if (ship.sinking) ship.sinkT += frame;
  }
  if (state.kraken && !state.kraken.alive) state.kraken.sinkT += frame;
  updateWeather(state, frame);
  if (player.alive) controlPlayer(state, player, input, frame);
  controlEnemies(state, player, frame);
  if (player.alive) stepKraken(state, player, frame);
  advanceProjectiles(state, frame);
  resolveRams(state);
  resolveTerrain(state);
  if (player.alive) {
    collectTreasure(state, player);
    separateFromKraken(player, state.kraken);
  }
  for (const ship of state.ships) clampToBounds(ship, state.boundsOverride ?? stage.bounds);
  for (const ship of state.ships) {
    if (ship.alive && ship.hp <= 0) killShip(state, ship);
  }
  evaluateFinale(state);
  if (state.finale) {
    state.finaleTimer -= frame;
    if (state.finaleTimer <= 0) {
      state.status = state.finale;
      if (state.finale === 'victory') state.upgradeReady = true;
      state.finale = null;
    }
  }
}

export function coast(state: SimState, dt: number): void {
  const frame = Math.max(0, dt);
  for (const ship of state.ships) {
    if (ship.sinking) ship.sinkT += frame;
    ship.hitFlash = Math.max(0, ship.hitFlash - frame);
  }
  if (state.kraken) {
    state.kraken.hitFlash = Math.max(0, state.kraken.hitFlash - frame);
    if (!state.kraken.alive) state.kraken.sinkT += frame;
    else state.kraken.anim += frame * 0.35;
  }
}

export function applyUpgrade(state: SimState, track: Track): UpgradeResult {
  if (!state.upgradeReady) return { ok: false, reason: 'closed' };
  const current = state.upgrades[track];
  if (current >= 3) return { ok: false, reason: 'max' };
  const next = current + 1;
  const cost = UPGRADE_COST[track][next];
  if (cost === undefined || state.gold < cost) return { ok: false, reason: 'gold' };
  state.gold -= cost;
  state.upgrades[track] = next;
  state.upgradeReady = false;
  const player = getPlayer(state);
  if (player) {
    if (track === 'hull') {
      const stats = hullStats(next);
      player.maxHp = stats.maxHp;
      player.hp = stats.maxHp;
      player.length = stats.length;
      player.beam = stats.beam;
      player.hullTier = next;
      player.name = playerShipName(next);
    } else if (track === 'sails') player.sailTier = next;
    else player.cannonTier = next;
  }
  return { ok: true, cost, tier: next };
}

export function advanceAfterVictory(state: SimState): 'next' | 'cleared' | 'blocked' {
  if (state.status !== 'victory' && state.status !== 'upgrade') return 'blocked';
  if (state.stageIndex >= STAGES.length - 1) {
    state.campaignCleared = true;
    state.status = 'ending';
    state.upgradeReady = false;
    return 'cleared';
  }
  beginStage(state, state.stageIndex + 1);
  return 'next';
}

export function retryStage(state: SimState): void {
  state.gold = state.goldAtStageStart;
  beginStage(state, state.stageIndex);
}

export function openUpgrade(state: SimState): void {
  if (state.status === 'victory') state.status = 'upgrade';
}
