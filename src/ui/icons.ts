// Inline SVG icons (chunky, rounded). Strings are static and trusted.
const svg = (body: string, vb = '0 0 48 48') =>
  `<svg viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;

export const ICONS = {
  play: svg(
    '<path d="M16 10 L38 24 L16 38 Z" fill="currentColor" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>',
  ),
  back: svg(
    '<path d="M28 10 L14 24 L28 38" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>',
  ),
  next: svg(
    '<path d="M18 10 L32 24 L18 38" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>',
  ),
  retry: svg(
    '<path d="M36 18 A14 14 0 1 0 38 28" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><path d="M38 8 L38 20 L26 20" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>',
  ),
  menu: svg(
    '<rect x="8" y="10" width="32" height="6" rx="3" fill="currentColor"/><rect x="8" y="21" width="32" height="6" rx="3" fill="currentColor"/><rect x="8" y="32" width="32" height="6" rx="3" fill="currentColor"/>',
  ),
  gear: svg(
    '<circle cx="24" cy="24" r="8" fill="none" stroke="currentColor" stroke-width="6"/><path d="M24 4v8M24 36v8M4 24h8M36 24h8M10 10l6 6M32 32l6 6M38 10l-6 6M10 38l6-6" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>',
  ),
  star: svg(
    '<path d="M24 5 L29.5 17.5 L43 18.5 L32.5 27.5 L35.5 41 L24 34 L12.5 41 L15.5 27.5 L5 18.5 L18.5 17.5 Z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>',
  ),
  coin: svg(
    '<circle cx="24" cy="24" r="17" fill="currentColor"/><circle cx="24" cy="24" r="10" fill="none" stroke="#fff8" stroke-width="4"/>',
  ),
  heart: svg(
    '<path d="M24 41 C10 31 5 24 5 16 A9.5 9.5 0 0 1 24 12 A9.5 9.5 0 0 1 43 16 C43 24 38 31 24 41 Z" fill="currentColor"/>',
  ),
  balloon: svg(
    '<ellipse cx="24" cy="18" rx="15" ry="16" fill="currentColor"/><path d="M14 30 L20 38 M34 30 L28 38" stroke="currentColor" stroke-width="3"/><rect x="18" y="37" width="12" height="8" rx="2" fill="currentColor"/>',
  ),
  infinity: svg(
    '<path d="M14 16 C4 16 4 32 14 32 C22 32 26 16 34 16 C44 16 44 32 34 32 C26 32 22 16 14 16 Z" fill="none" stroke="currentColor" stroke-width="6" stroke-linejoin="round"/>',
  ),
  calendar: svg(
    '<rect x="6" y="10" width="36" height="32" rx="6" fill="none" stroke="currentColor" stroke-width="5"/><path d="M6 20h36M16 5v10M32 5v10" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><circle cx="24" cy="31" r="5" fill="currentColor"/>',
  ),
  cake: svg(
    '<rect x="8" y="24" width="32" height="18" rx="5" fill="currentColor"/><path d="M16 22v-8M24 22v-8M32 22v-8" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="16" cy="9" r="3" fill="currentColor"/><circle cx="24" cy="9" r="3" fill="currentColor"/><circle cx="32" cy="9" r="3" fill="currentColor"/>',
  ),
  boat: svg(
    '<path d="M6 30 H42 L36 40 H12 Z" fill="currentColor"/><path d="M24 6 V28 M24 8 L38 26 H24" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>',
  ),
  bubble: svg(
    '<circle cx="22" cy="24" r="16" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="16" cy="18" r="4" fill="currentColor"/><circle cx="40" cy="10" r="5" fill="none" stroke="currentColor" stroke-width="3"/>',
  ),
  moon: svg('<path d="M30 6 A18 18 0 1 0 42 32 A14 14 0 1 1 30 6 Z" fill="currentColor"/>'),
  party: svg(
    '<path d="M8 42 L18 14 L34 30 Z" fill="currentColor"/><circle cx="34" cy="10" r="3" fill="currentColor"/><circle cx="42" cy="20" r="3" fill="currentColor"/><path d="M26 8 Q30 14 26 18 M38 26 Q32 30 40 34" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/>',
  ),
  shop: svg(
    '<path d="M8 18 H40 L37 42 H11 Z" fill="currentColor"/><path d="M17 18 V13 A7 7 0 0 1 31 13 V18" fill="none" stroke="currentColor" stroke-width="4"/>',
  ),
  lock: svg(
    '<rect x="10" y="22" width="28" height="20" rx="5" fill="currentColor"/><path d="M16 22 V16 A8 8 0 0 1 32 16 V22" fill="none" stroke="currentColor" stroke-width="5"/>',
  ),
  pause: svg(
    '<rect x="12" y="10" width="9" height="28" rx="3" fill="currentColor"/><rect x="27" y="10" width="9" height="28" rx="3" fill="currentColor"/>',
  ),
  mic: svg(
    '<rect x="17" y="5" width="14" height="24" rx="7" fill="currentColor"/><path d="M10 22 A14 14 0 0 0 38 22 M24 36 V43 M16 43 H32" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>',
  ),
  check: svg(
    '<path d="M10 25 L20 35 L38 13" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>',
  ),
  person: svg(
    '<circle cx="24" cy="15" r="9" fill="currentColor"/><path d="M8 44 A16 16 0 0 1 40 44 Z" fill="currentColor"/>',
  ),
  plus: svg(
    '<path d="M24 10 V38 M10 24 H38" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>',
  ),
  minus: svg(
    '<path d="M10 24 H38" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>',
  ),
} as const;

export type IconName = keyof typeof ICONS;
