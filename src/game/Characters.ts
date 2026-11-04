// Rider characters. Loaded from public/characters/characters.json; art from
// public/characters/<id>/<pose>.(svg|png). Adding a character = one JSON entry + its files.

export type Pose = 'idle' | 'happy' | 'hit';

export interface CharacterDef {
  id: string;
  label: string;
  price: number;
  qrOnly?: boolean;
  placeholder?: { body: string; accent: string; ears: 'round' | 'long' | 'pointy' | 'none' };
  poses?: Partial<Record<Pose, string>>;
}

export const BUILTIN_CHARACTERS: CharacterDef[] = [
  {
    id: 'lucas',
    label: 'Lucas (placeholder)',
    price: 0,
    placeholder: { body: '#ffb347', accent: '#c96f00', ears: 'round' },
  },
];

/** PURE: validate the characters.json payload; bad entries are skipped, never fatal. */
export function parseCharacters(data: unknown): CharacterDef[] {
  if (!Array.isArray(data)) return BUILTIN_CHARACTERS;
  const out: CharacterDef[] = [];
  for (const v of data) {
    if (typeof v !== 'object' || v === null) continue;
    const o = v as Record<string, unknown>;
    if (typeof o['id'] !== 'string' || !/^[a-z0-9-]{1,40}$/.test(o['id'])) continue;
    const def: CharacterDef = {
      id: o['id'],
      label: typeof o['label'] === 'string' ? o['label'] : o['id'],
      price: typeof o['price'] === 'number' && o['price'] >= 0 ? Math.floor(o['price']) : 0,
      qrOnly: o['qrOnly'] === true,
    };
    const ph = o['placeholder'];
    if (typeof ph === 'object' && ph !== null) {
      const p = ph as Record<string, unknown>;
      def.placeholder = {
        body: typeof p['body'] === 'string' ? p['body'] : '#ffb347',
        accent: typeof p['accent'] === 'string' ? p['accent'] : '#c96f00',
        ears:
          p['ears'] === 'long' || p['ears'] === 'pointy' || p['ears'] === 'none'
            ? p['ears']
            : 'round',
      };
    }
    const poses = o['poses'];
    if (typeof poses === 'object' && poses !== null) {
      def.poses = {};
      for (const pose of ['idle', 'happy', 'hit'] as Pose[]) {
        const f = (poses as Record<string, unknown>)[pose];
        if (typeof f === 'string' && /^[\w.-]+\.(svg|png)$/.test(f)) def.poses[pose] = f;
      }
    }
    if (!def.placeholder && !def.poses?.idle) def.placeholder = BUILTIN_CHARACTERS[0]?.placeholder;
    out.push(def);
  }
  return out.length ? out : BUILTIN_CHARACTERS;
}

export class CharacterRegistry {
  list: CharacterDef[] = BUILTIN_CHARACTERS;
  private images = new Map<string, HTMLImageElement>();

  async load(baseUrl: string): Promise<void> {
    try {
      const res = await fetch(`${baseUrl}characters/characters.json`);
      if (res.ok) this.list = parseCharacters(await res.json());
    } catch {
      this.list = BUILTIN_CHARACTERS;
    }
    for (const c of this.list) {
      if (!c.poses) continue;
      for (const [pose, file] of Object.entries(c.poses)) {
        const img = new Image();
        img.decoding = 'async';
        img.src = `${baseUrl}characters/${c.id}/${file}`;
        this.images.set(`${c.id}:${pose}`, img);
      }
    }
  }

  get(id: string): CharacterDef {
    return this.list.find((c) => c.id === id) ?? (this.list[0] as CharacterDef);
  }

  /** Loaded pose image, falling back to idle; null = draw the procedural placeholder. */
  image(id: string, pose: Pose): HTMLImageElement | null {
    const img = this.images.get(`${id}:${pose}`) ?? this.images.get(`${id}:idle`);
    return img && img.complete && img.naturalWidth > 0 ? img : null;
  }
}
