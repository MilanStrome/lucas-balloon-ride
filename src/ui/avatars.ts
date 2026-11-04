// Procedural avatar faces (SVG strings) for profiles and party players.

export interface AvatarDef {
  id: string;
  face: string;
  ear: 'round' | 'long' | 'pointy' | 'none' | 'tuft';
  accent: string;
}

export const AVATARS: AvatarDef[] = [
  { id: 'bear', face: '#c98b4e', ear: 'round', accent: '#8a5a2b' },
  { id: 'bunny', face: '#f3eee9', ear: 'long', accent: '#f6a6c1' },
  { id: 'cat', face: '#ffb347', ear: 'pointy', accent: '#e07b00' },
  { id: 'frog', face: '#7bd36b', ear: 'none', accent: '#3f9a32' },
  { id: 'panda', face: '#ffffff', ear: 'round', accent: '#333333' },
  { id: 'fox', face: '#ff8040', ear: 'pointy', accent: '#ffffff' },
  { id: 'owl', face: '#a98bd1', ear: 'tuft', accent: '#6b4c9a' },
  { id: 'pig', face: '#ffb6c8', ear: 'pointy', accent: '#e9809c' },
];

export function avatarDef(id: string): AvatarDef {
  return AVATARS.find((a) => a.id === id) ?? (AVATARS[0] as AvatarDef);
}

export function avatarSvg(id: string): string {
  const a = avatarDef(id);
  let ears = '';
  if (a.ear === 'round')
    ears = `<circle cx="14" cy="14" r="9" fill="${a.accent}"/><circle cx="50" cy="14" r="9" fill="${a.accent}"/>`;
  if (a.ear === 'long')
    ears = `<ellipse cx="22" cy="10" rx="6" ry="15" fill="${a.face}" stroke="${a.accent}" stroke-width="3"/><ellipse cx="42" cy="10" rx="6" ry="15" fill="${a.face}" stroke="${a.accent}" stroke-width="3"/>`;
  if (a.ear === 'pointy')
    ears = `<path d="M8 26 L14 4 L28 16 Z" fill="${a.accent}"/><path d="M56 26 L50 4 L36 16 Z" fill="${a.accent}"/>`;
  if (a.ear === 'tuft')
    ears = `<path d="M12 20 L16 6 L24 16 Z M52 20 L48 6 L40 16 Z" fill="${a.accent}"/>`;
  const eyes =
    a.id === 'frog'
      ? `<circle cx="20" cy="22" r="8" fill="#fff"/><circle cx="44" cy="22" r="8" fill="#fff"/><circle cx="21" cy="23" r="4" fill="#222"/><circle cx="45" cy="23" r="4" fill="#222"/>`
      : a.id === 'panda'
        ? `<ellipse cx="22" cy="32" rx="7" ry="8" fill="#333"/><ellipse cx="42" cy="32" rx="7" ry="8" fill="#333"/><circle cx="23" cy="32" r="3" fill="#fff"/><circle cx="41" cy="32" r="3" fill="#fff"/>`
        : `<circle cx="23" cy="31" r="4" fill="#222"/><circle cx="41" cy="31" r="4" fill="#222"/><circle cx="24.5" cy="29.5" r="1.4" fill="#fff"/><circle cx="42.5" cy="29.5" r="1.4" fill="#fff"/>`;
  const snout =
    a.id === 'pig'
      ? `<ellipse cx="32" cy="42" rx="8" ry="6" fill="${a.accent}"/><circle cx="29" cy="42" r="1.6" fill="#7a3346"/><circle cx="35" cy="42" r="1.6" fill="#7a3346"/>`
      : `<ellipse cx="32" cy="40" rx="3.5" ry="2.6" fill="#3a2a22"/>`;
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><g>${ears}<circle cx="32" cy="36" r="24" fill="${a.face}" stroke="${a.accent}" stroke-width="3"/>${eyes}${snout}<path d="M25 47 Q32 53 39 47" fill="none" stroke="#3a2a22" stroke-width="3" stroke-linecap="round"/><circle cx="16" cy="42" r="4" fill="#ff8fa3" opacity="0.6"/><circle cx="48" cy="42" r="4" fill="#ff8fa3" opacity="0.6"/></g></svg>`;
}
