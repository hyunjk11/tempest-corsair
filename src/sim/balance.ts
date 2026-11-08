import { clamp } from './math';
import type { TerrainBody } from './terrain';
import type { Faction, SimState, Track, Upgrades } from './types';

export interface HullStats {
  maxHp: number;
  length: number;
  beam: number;
  collisionTaken: number;
  collisionDealt: number;
  label: string;
}

export interface SailStats {
  maxSpeed: number;
  turnRate: number;
  accel: number;
  label: string;
}

export interface CannonStats {
  damage: number;
  shots: number;
  reload: number;
  spread: number;
  shotSpeed: number;
  life: number;
  label: string;
}

export interface EnemySpawn {
  kind: Exclude<Faction, 'player'>;
  name: string;
  x: number;
  z: number;
  heading: number;
  hp: number;
  cannonTier: number;
  sailTier: number;
}

export interface StageDef {
  chapter: number;
  chapterTitle: string;
  name: string;
  briefing: string;
  objective: string;
  playerX: number;
  playerZ: number;
  playerHeading: number;
  enemies: EnemySpawn[];
  treasures: { x: number; z: number; gold: number }[];
  kraken?: { x: number; z: number; hp: number };
  typhoonChance: number;
  typhoonDelay: number;
  clearBonus: number;
  bounds: number;
  terrain: TerrainBody[];
}

export const HULL: HullStats[] = [
  { maxHp: 100, length: 8.4, beam: 2.55, collisionTaken: 1, collisionDealt: 1, label: '소형 선체' },
  { maxHp: 150, length: 9.2, beam: 2.8, collisionTaken: 0.9, collisionDealt: 1.15, label: '보강 늑골' },
  { maxHp: 205, length: 10.2, beam: 3.05, collisionTaken: 0.75, collisionDealt: 1.35, label: '이중 외판' },
  { maxHp: 270, length: 11.4, beam: 3.3, collisionTaken: 0.62, collisionDealt: 1.55, label: '전열 선체' },
];

export const SAILS: SailStats[] = [
  { maxSpeed: 12, turnRate: 1.28, accel: 7, label: '낡은 돛' },
  { maxSpeed: 14.5, turnRate: 1.48, accel: 8.6, label: '무명 돛' },
  { maxSpeed: 17, turnRate: 1.66, accel: 10.2, label: '쌍돛' },
  { maxSpeed: 19.5, turnRate: 1.86, accel: 12, label: '폭풍 돛' },
];

const PLAYER_CANNONS: CannonStats[] = [
  { damage: 16, shots: 1, reload: 1.28, spread: 0.04, shotSpeed: 40, life: 1.5, label: '단장 포' },
  { damage: 15, shots: 2, reload: 1.16, spread: 0.05, shotSpeed: 41, life: 1.55, label: '쌍장 포' },
  { damage: 14, shots: 3, reload: 1.04, spread: 0.055, shotSpeed: 42, life: 1.6, label: '포열' },
  { damage: 13, shots: 4, reload: 0.94, spread: 0.048, shotSpeed: 44, life: 1.65, label: '전열 포열' },
];

const PIRATE_CANNONS: CannonStats[] = [
  { damage: 7, shots: 1, reload: 2.05, spread: 0.14, shotSpeed: 32, life: 1.28, label: '해적 포' },
  { damage: 10, shots: 1, reload: 1.55, spread: 0.1, shotSpeed: 34, life: 1.38, label: '해적 포' },
  { damage: 11, shots: 2, reload: 1.45, spread: 0.09, shotSpeed: 35, life: 1.42, label: '해적 포열' },
  { damage: 12, shots: 2, reload: 1.35, spread: 0.08, shotSpeed: 36, life: 1.46, label: '해적 포열' },
];

const NAVY_CANNONS: CannonStats[] = [
  { damage: 8, shots: 1, reload: 1.95, spread: 0.045, shotSpeed: 37, life: 1.6, label: '해군 포' },
  { damage: 9, shots: 2, reload: 1.82, spread: 0.04, shotSpeed: 38, life: 1.64, label: '해군 포열' },
  { damage: 10, shots: 2, reload: 1.68, spread: 0.038, shotSpeed: 39, life: 1.68, label: '해군 포열' },
  { damage: 11, shots: 3, reload: 1.55, spread: 0.036, shotSpeed: 40, life: 1.72, label: '해군 중포' },
];

const COMPANY_CANNONS: CannonStats[] = [
  { damage: 8, shots: 1, reload: 1.9, spread: 0.05, shotSpeed: 36, life: 1.55, label: '상단 포' },
  { damage: 9, shots: 2, reload: 1.75, spread: 0.048, shotSpeed: 37, life: 1.6, label: '상단 포열' },
  { damage: 10, shots: 2, reload: 1.62, spread: 0.045, shotSpeed: 38, life: 1.64, label: '상단 포열' },
  { damage: 11, shots: 2, reload: 1.5, spread: 0.042, shotSpeed: 39, life: 1.68, label: '상단 중포' },
];

const RAIDER_CANNONS: CannonStats[] = [
  { damage: 6, shots: 1, reload: 1.7, spread: 0.18, shotSpeed: 33, life: 1.2, label: '약탈 포' },
  { damage: 7, shots: 1, reload: 1.45, spread: 0.16, shotSpeed: 34, life: 1.25, label: '약탈 포' },
  { damage: 8, shots: 2, reload: 1.35, spread: 0.14, shotSpeed: 35, life: 1.3, label: '약탈 포열' },
  { damage: 9, shots: 2, reload: 1.25, spread: 0.12, shotSpeed: 36, life: 1.34, label: '약탈 포열' },
];

const CANNONS: Record<Faction, CannonStats[]> = {
  player: PLAYER_CANNONS,
  pirate: PIRATE_CANNONS,
  navy: NAVY_CANNONS,
  company: COMPANY_CANNONS,
  raider: RAIDER_CANNONS,
};

export const FACTION_META: Record<Faction, { label: string; color: string }> = {
  player: { label: '아군', color: '#f4e7c4' },
  pirate: { label: '적색 해적', color: '#e07a62' },
  navy: { label: '왕립 해군', color: '#8eb7e6' },
  company: { label: '녹색 상단', color: '#7dcea0' },
  raider: { label: '약탈선', color: '#e0b15a' },
};

export const UPGRADE_COST: Record<Track, number[]> = {
  hull: [0, 45, 90, 140],
  sails: [0, 40, 80, 125],
  cannons: [0, 50, 100, 155],
};

export const KRAKEN_BOUNTY = 90;

export const STAGES: StageDef[] = [
  {
    chapter: 1,
    chapterTitle: '출항',
    name: '표류하는 약탈자',
    briefing: '섬과 암초 사이의 수로에 작은 해적선 한 척이 떠 있다.',
    objective: '수로를 지나 해적선 한 척을 격침하라',
    playerX: 0,
    playerZ: -16,
    playerHeading: 0,
    enemies: [
      { kind: 'pirate', name: '밤까마귀', x: 10, z: 30, heading: Math.PI, hp: 36, cannonTier: 0, sailTier: 0 },
    ],
    treasures: [
      { x: 4, z: -2, gold: 48 },
      { x: 22, z: 36, gold: 28 },
    ],
    typhoonChance: 0,
    typhoonDelay: 999,
    clearBonus: 24,
    bounds: 78,
    terrain: [
      { kind: 'island', x: -12, z: 8, radius: 8 },
      { kind: 'reef', x: 18, z: 6, radius: 4.2 },
    ],
  },
  {
    chapter: 1,
    chapterTitle: '출항',
    name: '쌍돛의 습격',
    briefing: '적색 해적 두 척과 황갈 약탈선이 열린 수로에서 맞붙는다.',
    objective: '해적과 약탈선을 격침하라',
    playerX: 0,
    playerZ: -18,
    playerHeading: 0,
    enemies: [
      { kind: 'pirate', name: '붉은 돛', x: -22, z: 24, heading: 0.5, hp: 50, cannonTier: 0, sailTier: 1 },
      { kind: 'pirate', name: '소금이빨', x: 20, z: 38, heading: -2.4, hp: 52, cannonTier: 1, sailTier: 1 },
      { kind: 'raider', name: '모래벼룩', x: 2, z: 20, heading: 2.4, hp: 40, cannonTier: 0, sailTier: 1 },
    ],
    treasures: [
      { x: 6, z: 2, gold: 36 },
      { x: -8, z: 46, gold: 32 },
    ],
    typhoonChance: 0.4,
    typhoonDelay: 32,
    clearBonus: 30,
    bounds: 86,
    terrain: [
      { kind: 'coast', x: -36, z: 4, radius: 10 },
      { kind: 'reef', x: 28, z: 14, radius: 5 },
    ],
  },
  {
    chapter: 1,
    chapterTitle: '출항',
    name: '왕립 초계',
    briefing: '왕립 해군이 해적과 약탈선 사이에서 거리를 유지한다. 서쪽 해안은 좌초한다.',
    objective: '해군과 그 싸움에 낀 배들을 격침하라',
    playerX: 0,
    playerZ: -14,
    playerHeading: 0,
    enemies: [
      { kind: 'navy', name: 'HMS 갈매기', x: 6, z: 42, heading: Math.PI, hp: 100, cannonTier: 1, sailTier: 0 },
      { kind: 'pirate', name: '갈고리', x: -16, z: 24, heading: 0.4, hp: 48, cannonTier: 1, sailTier: 1 },
      { kind: 'raider', name: '짧은 닻', x: 18, z: 18, heading: -1.2, hp: 38, cannonTier: 0, sailTier: 1 },
    ],
    treasures: [
      { x: 8, z: 4, gold: 40 },
      { x: -6, z: 52, gold: 26 },
    ],
    typhoonChance: 0.28,
    typhoonDelay: 26,
    clearBonus: 36,
    bounds: 88,
    terrain: [
      { kind: 'coast', x: -48, z: 0, radius: 16 },
      { kind: 'reef', x: 22, z: -2, radius: 4.5 },
    ],
  },
  {
    chapter: 2,
    chapterTitle: '항로',
    name: '금빛 물마루',
    briefing: '녹색 상단과 해적, 약탈선이 암초 사이에서 보물을 다툰다. 태풍이 잦다.',
    objective: '세 깃발을 격침하라. 태풍과 암초를 피하라',
    playerX: 0,
    playerZ: -20,
    playerHeading: 0.15,
    enemies: [
      { kind: 'pirate', name: '표류자', x: -18, z: 18, heading: 1.05, hp: 62, cannonTier: 1, sailTier: 1 },
      { kind: 'company', name: '청자호', x: 16, z: 36, heading: Math.PI, hp: 90, cannonTier: 1, sailTier: 1 },
      { kind: 'raider', name: '물떼새', x: 0, z: 28, heading: 0.2, hp: 44, cannonTier: 1, sailTier: 2 },
    ],
    treasures: [
      { x: 12, z: -4, gold: 44 },
      { x: -6, z: 48, gold: 38 },
      { x: 28, z: 24, gold: 42 },
    ],
    typhoonChance: 0.85,
    typhoonDelay: 16,
    clearBonus: 34,
    bounds: 94,
    terrain: [
      { kind: 'reef', x: -8, z: 8, radius: 5 },
      { kind: 'reef', x: 24, z: 12, radius: 4.5 },
      { kind: 'island', x: -34, z: 42, radius: 9 },
    ],
  },
  {
    chapter: 2,
    chapterTitle: '항로',
    name: '교차 사격',
    briefing: '해적, 해군, 상단, 약탈선이 두 섬 사이의 바다에서 서로를 친다.',
    objective: '네 깃발을 모두 격침하라. 그들의 교전을 이용하라',
    playerX: 0,
    playerZ: -22,
    playerHeading: 0,
    enemies: [
      { kind: 'pirate', name: '검은 닻', x: -24, z: 18, heading: 0.85, hp: 74, cannonTier: 1, sailTier: 2 },
      { kind: 'navy', name: 'HMS 창끝', x: 10, z: 48, heading: Math.PI, hp: 128, cannonTier: 2, sailTier: 1 },
      { kind: 'company', name: '녹풍', x: -8, z: 36, heading: 0.4, hp: 96, cannonTier: 1, sailTier: 1 },
      { kind: 'raider', name: '톱날', x: 22, z: 28, heading: -2.2, hp: 46, cannonTier: 1, sailTier: 2 },
    ],
    treasures: [
      { x: 4, z: 8, gold: 36 },
      { x: -4, z: 58, gold: 34 },
    ],
    typhoonChance: 0.55,
    typhoonDelay: 20,
    clearBonus: 42,
    bounds: 98,
    terrain: [
      { kind: 'island', x: -16, z: 28, radius: 7 },
      { kind: 'island', x: 18, z: 40, radius: 7 },
    ],
  },
  {
    chapter: 3,
    chapterTitle: '심연',
    name: '크라켄의 눈',
    briefing: '남쪽 수로만 열려 있다. 입구의 약탈선들이 먼저 싸우고, 분지 안에는 크라켄이 있다.',
    objective: '수로로 들어가 약탈선을 지나 크라켄을 쓰러뜨려라',
    playerX: 0,
    playerZ: -26,
    playerHeading: 0,
    enemies: [
      { kind: 'raider', name: '심연 까마귀', x: -16, z: -2, heading: 0.6, hp: 42, cannonTier: 1, sailTier: 1 },
      { kind: 'raider', name: '검은 부리', x: 14, z: 0, heading: -2.2, hp: 42, cannonTier: 1, sailTier: 1 },
    ],
    treasures: [
      { x: -18, z: -16, gold: 40 },
      { x: 20, z: -14, gold: 40 },
    ],
    kraken: { x: 0, z: 16, hp: 520 },
    typhoonChance: 0.45,
    typhoonDelay: 28,
    clearBonus: 80,
    bounds: 100,
    terrain: [
      { kind: 'reef', x: -24, z: 10, radius: 6 },
      { kind: 'reef', x: 24, z: 10, radius: 6 },
      { kind: 'reef', x: -10, z: 28, radius: 4.5 },
      { kind: 'reef', x: 12, z: 30, radius: 4.5 },
      { kind: 'island', x: 0, z: 42, radius: 8 },
    ],
  },
];

export function hullStats(tier: number): HullStats {
  return HULL[clamp(Math.round(tier), 0, HULL.length - 1)] ?? HULL[0];
}

export function cannonProfile(faction: Faction, tier: number): CannonStats {
  const table = CANNONS[faction];
  return table[clamp(Math.round(tier), 0, table.length - 1)] ?? table[0];
}

export function handlingFor(ship: { faction: Faction; sailTier: number }): { maxSpeed: number; turnRate: number; accel: number } {
  const sail = SAILS[clamp(ship.sailTier, 0, SAILS.length - 1)] ?? SAILS[0];
  if (ship.faction === 'navy') {
    return { maxSpeed: sail.maxSpeed * 0.72, turnRate: sail.turnRate * 0.78, accel: sail.accel * 0.8 };
  }
  if (ship.faction === 'company') {
    return { maxSpeed: sail.maxSpeed * 0.8, turnRate: sail.turnRate * 0.84, accel: sail.accel * 0.86 };
  }
  if (ship.faction === 'raider') {
    return { maxSpeed: sail.maxSpeed * 1.05, turnRate: sail.turnRate * 1.12, accel: sail.accel };
  }
  if (ship.faction === 'pirate') {
    return { maxSpeed: sail.maxSpeed * 0.96, turnRate: sail.turnRate * 1.05, accel: sail.accel * 0.95 };
  }
  return { maxSpeed: sail.maxSpeed, turnRate: sail.turnRate, accel: sail.accel };
}

export function playerShipName(hullTier: number): string {
  return ['작은 범선', '보강 범선', '쌍층 범선', '폭풍 전열함'][clamp(hullTier, 0, 3)] ?? '범선';
}

export function bountyFor(faction: Faction, stageIndex: number): number {
  if (faction === 'navy') return 36 + stageIndex * 4;
  if (faction === 'company') return 32 + stageIndex * 4;
  if (faction === 'pirate') return 22 + stageIndex * 3;
  if (faction === 'raider') return 16 + stageIndex * 2;
  return 0;
}

export interface UpgradeCard {
  track: Track;
  title: string;
  level: string;
  detail: string;
  cost: number | null;
  maxed: boolean;
  affordable: boolean;
  canBuy: boolean;
}

const TRACK_TITLE: Record<Track, string> = {
  hull: '선체',
  sails: '돛',
  cannons: '함포',
};

function nextDetail(track: Track, next: number): string {
  if (track === 'hull') {
    const prev = hullStats(next - 1);
    const stats = hullStats(next);
    const note = next >= 2 ? '충돌 피해를 덜 받고 더 세게 박는다.' : '뱃전이 높아지고 내구가 늘어난다.';
    return `${stats.label}. 최대 선체 ${prev.maxHp} → ${stats.maxHp}. ${note}`;
  }
  if (track === 'sails') {
    const prev = SAILS[next - 1] ?? SAILS[0];
    const stats = SAILS[next] ?? SAILS[0];
    const note = next >= 2 ? '돛대가 늘어 배의 실루엣이 달라진다.' : '가속과 선회가 좋아진다.';
    return `${stats.label}. 최대 속력 ${prev.maxSpeed.toFixed(0)} → ${stats.maxSpeed.toFixed(0)}. ${note}`;
  }
  const prev = cannonProfile('player', next - 1);
  const stats = cannonProfile('player', next);
  return `${stats.label}. 현측 포문 ${prev.shots} → ${stats.shots}. 일제사 피해 ${prev.shots * prev.damage} → ${stats.shots * stats.damage}.`;
}

export function upgradeCard(state: Pick<SimState, 'gold' | 'upgrades' | 'upgradeReady'>, track: Track): UpgradeCard {
  const tier = state.upgrades[track];
  const maxed = tier >= 3;
  const next = maxed ? null : tier + 1;
  const cost = next === null ? null : (UPGRADE_COST[track][next] ?? null);
  const affordable = cost !== null && state.gold >= cost;
  return {
    track,
    title: TRACK_TITLE[track],
    level: maxed ? '최대' : `${tier}단 → ${next}단`,
    detail: maxed ? '이 부분은 더 손볼 곳이 없다.' : nextDetail(track, next ?? tier),
    cost,
    maxed,
    affordable,
    canBuy: state.upgradeReady && !maxed && affordable,
  };
}

export function emptyUpgrades(): Upgrades {
  return { hull: 0, sails: 0, cannons: 0 };
}
