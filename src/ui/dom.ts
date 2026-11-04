// Small DOM helpers for screens. No framework.
import { ICONS, type IconName } from './icons';

type Attrs = Record<string, string | number | boolean | undefined>;
type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'text') el.textContent = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

export function icon(name: IconName, cls = 'icon'): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = cls;
  s.innerHTML = ICONS[name];
  return s;
}

export interface ButtonOpts {
  icon?: IconName;
  label?: string;
  cls?: string;
  testId?: string;
  ariaLabel?: string;
  /** Guard against double-taps: ignore clicks for this many ms after one fires. */
  cooldownMs?: number;
}

/** Big kid-friendly button (>= 56 px). Clicks are debounced so rapid taps fire once. */
export function button(opts: ButtonOpts, onClick: (ev: MouseEvent) => void): HTMLButtonElement {
  const b = h('button', {
    class: `btn ${opts.cls ?? ''}`.trim(),
    type: 'button',
    'data-testid': opts.testId,
    'aria-label': opts.ariaLabel ?? opts.label,
  });
  if (opts.icon) b.append(icon(opts.icon));
  if (opts.label) b.append(h('span', { class: 'btn-label', text: opts.label }));
  let last = -Infinity;
  const cooldown = opts.cooldownMs ?? 400;
  b.addEventListener('click', (ev) => {
    const now = performance.now();
    if (now - last < cooldown) return;
    last = now;
    onClick(ev);
  });
  return b;
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}
