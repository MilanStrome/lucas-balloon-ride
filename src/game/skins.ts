// Balloon skins (patterns + colours). Prices in coins; 0 = owned from the start.

export type Pattern =
  'stripes' | 'dots' | 'zigzag' | 'hearts' | 'stars' | 'checks' | 'rainbow' | 'swirl' | 'solid';

export interface SkinDef {
  id: string;
  label: string;
  colors: [string, string];
  pattern: Pattern;
  price: number;
  /** Only obtainable through a QR puzzle-box code. */
  qrOnly?: boolean;
}

export const SKINS: SkinDef[] = [
  { id: 'sunny', label: 'Sunny', colors: ['#ff6b6b', '#ffd23f'], pattern: 'stripes', price: 0 },
  { id: 'ocean', label: 'Ocean', colors: ['#3d8bfd', '#bde0ff'], pattern: 'stripes', price: 20 },
  { id: 'minty', label: 'Minty', colors: ['#4cc36b', '#e3ffe9'], pattern: 'dots', price: 25 },
  { id: 'grape', label: 'Grape', colors: ['#9b6bff', '#f1e8ff'], pattern: 'zigzag', price: 30 },
  { id: 'lovely', label: 'Lovely', colors: ['#ff8fb1', '#fff0f5'], pattern: 'hearts', price: 35 },
  { id: 'starry', label: 'Starry', colors: ['#23345c', '#ffd23f'], pattern: 'stars', price: 40 },
  { id: 'picnic', label: 'Picnic', colors: ['#ff5050', '#ffffff'], pattern: 'checks', price: 45 },
  {
    id: 'rainbow',
    label: 'Rainbow',
    colors: ['#ff6b6b', '#3d8bfd'],
    pattern: 'rainbow',
    price: 60,
  },
  { id: 'lemon', label: 'Lemon', colors: ['#ffe14d', '#fff9d6'], pattern: 'swirl', price: 30 },
  {
    id: 'tangerine',
    label: 'Tangerine',
    colors: ['#ff9a3c', '#ffe0c2'],
    pattern: 'dots',
    price: 30,
  },
  { id: 'berry', label: 'Berry', colors: ['#d6336c', '#ffd6e5'], pattern: 'stripes', price: 35 },
  { id: 'cloudy', label: 'Cloudy', colors: ['#ffffff', '#cfe3ff'], pattern: 'swirl', price: 50 },
  { id: 'galaxy', label: 'Galaxy', colors: ['#2b1d5c', '#b48cff'], pattern: 'stars', price: 80 },
  {
    id: 'puzzle',
    label: 'Puzzle Box',
    colors: ['#00a6a6', '#ffcf56'],
    pattern: 'checks',
    price: 0,
    qrOnly: true,
  },
  {
    id: 'golden',
    label: 'Golden',
    colors: ['#e0a800', '#fff3c4'],
    pattern: 'zigzag',
    price: 0,
    qrOnly: true,
  },
];

export function skinDef(id: string): SkinDef {
  return SKINS.find((s) => s.id === id) ?? (SKINS[0] as SkinDef);
}
