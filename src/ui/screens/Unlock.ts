// QR unlock celebration (or "You already have this!").
import type { App } from '../../App';
import type { AppliedUnlock } from '../../game/Unlocks';
import { button, h, icon } from '../dom';
import { t } from '../i18n';
import type { Screen } from '../Router';
import { makeScreen } from './common';

export function unlockScreen(app: App, unlocks: AppliedUnlock[]): Screen {
  const s = makeScreen('unlock');
  const anyNew = unlocks.some((u) => u.result === 'applied');
  if (anyNew) app.sfx.play('cheer');
  const list = h('div', { class: 'card' });
  for (const u of unlocks) {
    list.append(
      h(
        'p',
        { class: 'text', 'data-testid': `unlock-${u.entry.id}` },
        icon(u.entry.type === 'skin' ? 'balloon' : 'person'),
        ' ',
        u.entry.label,
        ' — ',
        u.result === 'applied' ? t('results.unlocked') : t('unlock.owned'),
      ),
    );
  }
  s.el.append(
    h('h1', {
      'data-testid': 'unlock-title',
      text: anyNew ? t('unlock.celebrate') : t('unlock.owned'),
    }),
    list,
    button({ icon: 'check', label: t('unlock.ok'), cls: 'green', testId: 'unlock-ok' }, () =>
      app.router.pop(true),
    ),
  );
  return s;
}
