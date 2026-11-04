// Save-file shape (current schema) and defaults.
import { AUDIO_OUT } from '../config';

export const SCHEMA_VERSION = 3;

export type ControlStyle = 'hold' | 'hop';
export type Quality = 'auto' | 'high' | 'low';
export type Tri = 'auto' | 'on' | 'off';

export interface Settings {
  sensitivity: number;
  controlStyle: ControlStyle;
  deviceId: string | null;
  musicVolume: number;
  sfxVolume: number;
  vibration: boolean;
  quality: Quality;
  language: string;
  easyMode: boolean;
  humMode: boolean;
  tapMode: boolean;
  restBreaks: boolean;
  colorblind: boolean;
  reduceMotion: Tri;
  calmMusic: boolean;
  /** Every Adventure world and level open from the start. */
  unlockAll: boolean;
}

export interface CalibrationRecord {
  noiseFloorDb: number;
  maxBlowDb: number;
  at: number;
}

export interface DeviceCalibration {
  shared: CalibrationRecord | null;
  byProfile: Record<string, CalibrationRecord>;
}

export interface MiniBests {
  candles: number;
  sailboat: number;
  bubbles: number;
}

export interface Profile {
  id: string;
  name: string;
  avatar: string;
  skin: string;
  character: string;
  coins: number;
  stars: Record<string, number>;
  completed: Record<string, boolean>;
  ownedSkins: string[];
  ownedCharacters: string[];
  bestEndless: number;
  minis: MiniBests;
  createdAt: number;
}

export interface DailyState {
  streak: number;
  lastCompleted: string | null;
  rewarded: string[];
}

export interface SaveData {
  schemaVersion: number;
  profiles: Profile[];
  activeProfileId: string | null;
  settings: Settings;
  calibrationByDevice: Record<string, DeviceCalibration>;
  pendingUnlocks: string[];
  daily: Record<string, DailyState>;
}

export function defaultSettings(): Settings {
  return {
    sensitivity: 1,
    controlStyle: 'hold',
    deviceId: null,
    musicVolume: AUDIO_OUT.defaultMusicVolume,
    sfxVolume: AUDIO_OUT.defaultSfxVolume,
    vibration: true,
    quality: 'auto',
    language: 'en',
    easyMode: false,
    humMode: false,
    tapMode: false,
    restBreaks: true,
    colorblind: false,
    reduceMotion: 'auto',
    calmMusic: false,
    unlockAll: true,
  };
}

export function defaultSave(): SaveData {
  return {
    schemaVersion: SCHEMA_VERSION,
    profiles: [],
    activeProfileId: null,
    settings: defaultSettings(),
    calibrationByDevice: {},
    pendingUnlocks: [],
    daily: {},
  };
}

export const DEFAULT_SKIN = 'sunny';
export const DEFAULT_CHARACTER = 'lucas';

export function newProfile(id: string, avatar: string, name: string, now: number): Profile {
  return {
    id,
    name,
    avatar,
    skin: DEFAULT_SKIN,
    character: DEFAULT_CHARACTER,
    coins: 0,
    stars: {},
    completed: {},
    ownedSkins: [DEFAULT_SKIN],
    ownedCharacters: [DEFAULT_CHARACTER],
    bestEndless: 0,
    minis: { candles: 0, sailboat: 0, bubbles: 0 },
    createdAt: now,
  };
}

export function defaultDaily(): DailyState {
  return { streak: 0, lastCompleted: null, rewarded: [] };
}
