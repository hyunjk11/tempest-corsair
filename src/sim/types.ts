import type { TerrainBody } from './terrain';

export type Faction = 'player' | 'pirate' | 'navy' | 'company' | 'raider' | 'ally';
export type Team = 'friendly' | 'enemy' | 'neutral' | Faction;
export type Duty = '' | 'defend' | 'push' | 'hunt' | 'prize';
export type Side = 'port' | 'starboard';
export type Track = 'hull' | 'sails' | 'cannons';
export type Status = 'title' | 'playing' | 'paused' | 'victory' | 'defeat' | 'upgrade' | 'ending';
export type WeatherPhase = 'calm' | 'warning' | 'storm' | 'clearing';
export type KrakenPhase = 'idle' | 'telegraph' | 'strike' | 'recover';

export interface Harbor {
  id: 'home' | 'away';
  team: 'friendly' | 'enemy';
  name: string;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  reload: number;
  /** Cannonballs must reach this radius to hurt the fort. */
  core: number;
  /** Friendly ships buy upgrades inside this radius. */
  dock: number;
  gunRange: number;
}

export interface FishSpot {
  id: string;
  x: number;
  z: number;
  cooldown: number;
}

export interface MatchData {
  harbors: Harbor[];
  fish: FishSpot[];
  level: number;
  xp: number;
  xpToNext: number;
  respawnLeft: number;
  downed: boolean;
  result: null | 'victory' | 'defeat';
  objective: string;
  prompt: string;
  /** Short reward line that stays on the prompt after a kill or haul. */
  notice: string;
  noticeLeft: number;
  /** Inside the yellow service ring. Purchases work here. */
  docked: boolean;
  /** Close enough to show the shop and the braking instruction. */
  nearDock: boolean;
  treasureSpawned: boolean;
  krakenSpawned: boolean;
  krakenRewarded: boolean;
  typhoonArmed: boolean;
  pirateClock: number;
}

export interface Ship {
  id: string;
  faction: Faction;
  name: string;
  x: number;
  z: number;
  heading: number;
  speed: number;
  helm: number;
  hp: number;
  maxHp: number;
  length: number;
  beam: number;
  hullTier: number;
  sailTier: number;
  cannonTier: number;
  reloadPort: number;
  reloadStarboard: number;
  alive: boolean;
  sinking: boolean;
  sinkT: number;
  hitFlash: number;
  collideCd: number;
  focusId: string;
  team: Team;
  duty: Duty;
  anchorX: number;
  anchorZ: number;
  struckBy: Team | '';
}

export interface Projectile {
  id: number;
  ownerId: string;
  faction: Faction;
  team: Team;
  x: number;
  z: number;
  vx: number;
  vz: number;
  damage: number;
  life: number;
  maxLife: number;
  impact: null | 'ship' | 'water' | 'kraken';
}

export interface Treasure {
  id: string;
  x: number;
  z: number;
  gold: number;
  taken: boolean;
}

export interface SlamMarker {
  x: number;
  z: number;
  radius: number;
}

export interface Kraken {
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  phase: KrakenPhase;
  timer: number;
  markers: SlamMarker[];
  strikeApplied: boolean;
  sinkT: number;
  hitFlash: number;
  anim: number;
}

export interface Weather {
  phase: WeatherPhase;
  timer: number;
  intensity: number;
  windAngle: number;
  windX: number;
  windZ: number;
}

export interface Upgrades {
  hull: number;
  sails: number;
  cannons: number;
}

export interface Input {
  throttle: number;
  turn: number;
  firePort: boolean;
  fireStarboard: boolean;
  fireSmart: boolean;
}

export interface SimEvent {
  type: 'splash' | 'hit' | 'fire' | 'pickup' | 'slam' | 'typhoon';
  x: number;
  z: number;
  faction?: Faction;
  text?: string;
}

export interface SimState {
  status: Status;
  stageIndex: number;
  gold: number;
  goldAtStageStart: number;
  upgrades: Upgrades;
  upgradeReady: boolean;
  ships: Ship[];
  projectiles: Projectile[];
  treasures: Treasure[];
  kraken: Kraken | null;
  weather: Weather;
  time: number;
  stageTime: number;
  finale: null | 'victory' | 'defeat';
  finaleTimer: number;
  rngState: number;
  nextId: number;
  typhoonRolled: boolean;
  campaignCleared: boolean;
  /** When set, the voyage is one harbor match instead of a chapter. */
  match: MatchData | null;
  terrainOverride: TerrainBody[] | null;
  boundsOverride: number | null;
  playerInvuln: number;
  aiEnabled: boolean;
  shotsFired: number;
  introTimer: number;
  introText: string;
  events: SimEvent[];
}
