// ALL tunable numbers live here. Final tuned values and their reasons are in DECISIONS.md.

export const DETECTOR = {
  fftSize: 2048,
  /** dB above the calibrated noise floor a frame must reach to count as a candidate. */
  marginDb: 6,
  /** Minimum spectral flatness (100–4000 Hz, per frame) for a noise-like breath. */
  flatnessMin: 0.08,
  /** Minimum share of 20–4000 Hz energy that must sit in 20–500 Hz. */
  lowBandMin: 0.4,
  /** Maximum normalized autocorrelation peak (80–400 Hz lags); voices and music are higher. */
  tonalityMax: 0.4,
  onsetMs: 80,
  releaseMs: 120,
  attackTauMs: 40,
  releaseTauMs: 150,
  sensitivityMin: 0.5,
  sensitivityMax: 2.0,
  /** Defaults used before calibration has ever run. */
  defaultNoiseFloorDb: -60,
  defaultMaxBlowDb: -20,
} as const;

export const HUM = {
  tonalityMin: 0.7,
  pitchMinHz: 80,
  pitchMaxHz: 400,
  sustainMs: 150,
  releaseMs: 120,
} as const;

export const CALIBRATION = {
  quietMs: 1500,
  blowMs: 2000,
  quickFloorMs: 800,
  minDynamicRangeDb: 12,
  minCandidateFrames: 6,
  maxFailuresBeforeFallback: 3,
  floorShiftSuggestDb: 10,
  /** Auto (no-screen) calibration never sets the floor above this, so a blow during the
   *  short room measurement cannot hide later blows. */
  autoFloorMaxDb: -42,
} as const;

export const PHYSICS = {
  worldHeight: 1000,
  gravity: 500,
  liftMax: 1100,
  drag: 1.5,
  vMax: 450,
  balloonRadius: 42,
  ceilingY: 940,
  ceilingPush: 1800,
  groundY: 0,
  hopImpulse: 260,
  easyGravityScale: 0.7,
  spaceGravityScale: 0.45,
  rainWeight: 220,
} as const;

export const GAMEPLAY = {
  hearts: 3,
  invulnMs: 1500,
  bounceSpeed: 320,
  groundBounceSpeed: 360,
  gentleLandingVy: -170,
  starThresholds: [0.4, 0.7, 0.95] as const,
  coinsPerStar: 1,
  coinValue: 1,
  landingBonusCoins: 5,
  levelCompleteCoins: 5,
  magnetMs: 8000,
  magnetRadius: 260,
  slowMoMs: 5000,
  slowMoScale: 0.6,
  restBreakMs: 3 * 60 * 1000,
  /** The rest card ignores blow-to-continue for this long, so the break is a real break. */
  restBreakMinMs: 10_000,
  starRadius: 30,
  coinRadius: 24,
  powerUpRadius: 34,
  lookAheadMax: 1400,
  balloonScreenFraction: 0.3,
  balloonScreenMax: 420,
  nightVisibilityRadius: 330,
  fireflyLightRadius: 220,
} as const;

export const SPEEDS = {
  adventure: [170, 180, 185, 190, 185, 175] as const,
  endlessStart: 190,
  endlessMax: 300,
  endlessRampPerKm: 9,
} as const;

export const DAILY = {
  lengthSec: 60,
  rewardCoins: 25,
} as const;

export const PARTY = {
  minPlayers: 2,
  maxPlayers: 6,
  countdownSec: 3,
} as const;

export const CALM = {
  bandLow: 0.15,
  bandHigh: 0.6,
  patterns: [
    [3, 5],
    [4, 6],
    [4, 7],
  ] as const,
  defaultPattern: 1,
  sessionMinutes: [1, 3, 5] as const,
} as const;

export const MINI = {
  candleThreshold: 0.35,
  candleHoldMs: 400,
  bubbleGrowThreshold: 0.12,
  bubblePopThreshold: 0.85,
  boatTimeSec: 45,
} as const;

export const AUDIO_OUT = {
  defaultMusicVolume: 0.4,
  defaultSfxVolume: 0.8,
  duckFactor: 0.5,
} as const;

export const LOOP = {
  stepMs: 1000 / 60,
  maxFrameMs: 100,
} as const;

export const RENDER = {
  maxDpr: 2,
  lowFpsThreshold: 40,
  lowFpsWindowMs: 5000,
} as const;

export const STORAGE = {
  key: 'lbr.save',
  debounceMs: 1000,
  maxProfiles: 4,
} as const;
