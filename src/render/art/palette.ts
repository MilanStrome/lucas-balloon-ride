// World colour themes for the 3-layer parallax backgrounds.

export interface Theme {
  skyTop: string;
  skyBottom: string;
  far: string;
  mid: string;
  near: string;
  ground: string;
  groundTop: string;
  cloud: string;
  sun: string | null;
  stars: boolean;
}

const SUNNY: Theme = {
  skyTop: '#6cc7ff',
  skyBottom: '#d8f6ff',
  far: '#b9e6a8',
  mid: '#8fd47a',
  near: '#5fbf55',
  ground: '#6dbb4a',
  groundTop: '#8ed96a',
  cloud: '#ffffff',
  sun: '#ffe066',
  stars: false,
};
const NIGHT: Theme = {
  skyTop: '#0e1838',
  skyBottom: '#2a3a72',
  far: '#22305e',
  mid: '#1b2750',
  near: '#141e40',
  ground: '#1d2a4f',
  groundTop: '#2a3a68',
  cloud: '#5a6aa0',
  sun: null,
  stars: true,
};

export const THEMES: Record<number, Theme> = {
  1: SUNNY,
  2: {
    skyTop: '#7fb8ff',
    skyBottom: '#e6f2ff',
    far: '#c4d9b0',
    mid: '#a5c98a',
    near: '#7fb267',
    ground: '#8aa95a',
    groundTop: '#a6c776',
    cloud: '#f4f8ff',
    sun: '#fff1a8',
    stars: false,
  },
  3: {
    skyTop: '#8fd0c8',
    skyBottom: '#e9fbf2',
    far: '#7fbf8a',
    mid: '#4f9f62',
    near: '#2f7f4a',
    ground: '#3f8a46',
    groundTop: '#5aa85c',
    cloud: '#ffffff',
    sun: '#fff3b0',
    stars: false,
  },
  4: {
    skyTop: '#7d8ca8',
    skyBottom: '#c9d3e3',
    far: '#9aa8b8',
    mid: '#7e9087',
    near: '#5d7a62',
    ground: '#5e7f55',
    groundTop: '#78996a',
    cloud: '#dfe5ef',
    sun: null,
    stars: false,
  },
  5: NIGHT,
  6: {
    skyTop: '#05040f',
    skyBottom: '#1d1446',
    far: '#3a2d6e',
    mid: '#2a2058',
    near: '#4b3f7a',
    ground: '#8b86a8',
    groundTop: '#b5b0cf',
    cloud: '#6b5fa0',
    sun: null,
    stars: true,
  },
};

export const CALM_THEME: Theme = { ...NIGHT, skyTop: '#0b1430', skyBottom: '#33407a' };

export function theme(world: number, night: boolean): Theme {
  if (night && world !== 6) return NIGHT;
  return THEMES[world] ?? SUNNY;
}
