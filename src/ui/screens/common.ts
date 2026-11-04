import type { App } from '../../App';
import { button, h, icon } from '../dom';
import { t } from '../i18n';
import type { Screen } from '../Router';

export function makeScreen(id: string, cls = ''): Screen {
  const el = h('div', {
    class: `screen ${cls}`.trim(),
    'data-screen': id,
    'data-testid': `screen-${id}`,
  });
  return { id, el };
}

export function backButton(app: App, onBack?: () => void): HTMLButtonElement {
  return button(
    { icon: 'back', cls: 'secondary round', ariaLabel: t('common.back'), testId: 'back' },
    () => {
      if (onBack) onBack();
      else app.router.back();
    },
  );
}

export function topBar(
  app: App,
  opts: { back?: boolean | (() => void); coins?: boolean; title?: string } = {},
): HTMLElement {
  const left = h('div', { class: 'row' });
  if (opts.back)
    left.append(backButton(app, typeof opts.back === 'function' ? opts.back : undefined));
  if (opts.title) left.append(h('h2', { text: opts.title }));
  const right = h('div', { class: 'row' });
  if (opts.coins && app.profile) right.append(coinChip(app.profile.coins));
  return h('div', { class: 'topbar' }, left, right);
}

export function coinChip(n: number): HTMLElement {
  return h(
    'span',
    { class: 'chip', 'data-testid': 'coins', 'aria-label': `${t('common.coins')}: ${n}` },
    icon('coin'),
    String(n),
  );
}

export function balloonSvg(color = '#ff6b6b', stripe = '#ffd23f'): string {
  return `<svg viewBox="0 0 120 160" aria-hidden="true"><path d="M60 110 C10 85 10 10 60 8 C110 10 110 85 60 110Z" fill="${color}"/><path d="M60 110 C40 85 38 10 60 8 C82 10 80 85 60 110Z" fill="${stripe}"/><path d="M60 110 C54 85 54 10 60 8 C66 10 66 85 60 110Z" fill="${color}"/><path d="M40 98 L50 128 M80 98 L70 128" stroke="#6b4a2b" stroke-width="3"/><rect x="46" y="126" width="28" height="22" rx="5" fill="#b5773a"/></svg>`;
}

export function micHintSvg(laptop: boolean): string {
  return laptop
    ? `<svg class="mic-hint" viewBox="0 0 180 120" aria-hidden="true"><rect x="30" y="10" width="120" height="76" rx="8" fill="#23345c"/><rect x="38" y="18" width="104" height="60" rx="4" fill="#9fd8ff"/><circle class="pulse" cx="90" cy="14" r="4" fill="#ff6b6b"/><path d="M14 92 H166 L176 106 H4 Z" fill="#4b5f8c"/><circle class="pulse" cx="90" cy="99" r="5" fill="#ff6b6b"/></svg>`
    : `<svg class="mic-hint" viewBox="0 0 180 120" aria-hidden="true"><rect x="62" y="4" width="56" height="112" rx="10" fill="#23345c"/><rect x="68" y="14" width="44" height="86" rx="4" fill="#9fd8ff"/><circle class="pulse" cx="90" cy="109" r="5" fill="#ff6b6b"/></svg>`;
}

export const isLaptop = (): boolean =>
  !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) &&
  !('ontouchstart' in window && navigator.maxTouchPoints > 1);
