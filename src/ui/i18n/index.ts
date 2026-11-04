// Tiny i18n: one JSON dictionary per language, English as the fallback.
import en from './en.json';

export type Dict = Record<string, string>;

const LANGS: Record<string, Dict> = { en };
let current: Dict = en;

export const availableLanguages = (): string[] => Object.keys(LANGS);

export function setLanguage(lang: string): void {
  current = LANGS[lang] ?? en;
  if (typeof document !== 'undefined') document.documentElement.lang = LANGS[lang] ? lang : 'en';
}

/** Register a language at runtime (structure for adding more). */
export function registerLanguage(lang: string, dict: Dict): void {
  LANGS[lang] = dict;
}

export function t(key: string, vars?: Record<string, string | number>): string {
  let s = current[key] ?? (en as Dict)[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}
