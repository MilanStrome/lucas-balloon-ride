// Main menu: big icon tiles. Settings sit behind the parental gate.
import type { App } from '../../App';
import { button, h, icon } from '../dom';
import type { IconName } from '../icons';
import { t } from '../i18n';
import { parentalGate } from '../ParentalGate';
import type { Screen } from '../Router';
import { coinChip, makeScreen } from './common';
import { avatarEl } from './Profiles';
import { worldMapScreen } from './WorldMap';
import { endlessMode } from '../../game/modes/EndlessSky';
import { dailyScreen } from './Daily';
import { minisScreen } from './Minis';
import { calmSetupScreen } from './Calm';
import { partySetupScreen } from './Party';
import { shopScreen } from './Shop';
import { settingsScreen } from './Settings';
import { micCheckScreen } from './MicCheck';

function tile(
  label: string,
  ic: IconName,
  color: string,
  testId: string,
  onClick: () => void,
): HTMLButtonElement {
  const b = h(
    'button',
    { class: `tile t-${color}`, type: 'button', 'data-testid': testId, 'aria-label': label },
    icon(ic),
    h('span', { text: label }),
  );
  let last = -Infinity;
  b.addEventListener('click', () => {
    const now = performance.now();
    if (now - last < 500) return;
    last = now;
    onClick();
  });
  return b;
}

export function mainMenuScreen(app: App): Screen {
  const s = makeScreen('menu');
  const p = app.p;
  const profileBtn = h(
    'button',
    {
      class: 'avatar-btn',
      type: 'button',
      'data-testid': 'switch-profile',
      'aria-label': t('profiles.title'),
    },
    avatarEl(p.avatar),
  );
  profileBtn.addEventListener('click', () => app.toProfiles());
  let chip = coinChip(p.coins);
  const top = h('div', { class: 'topbar' }, profileBtn, chip);
  s.enter = () => {
    const fresh = coinChip(app.p.coins);
    chip.replaceWith(fresh);
    chip = fresh;
  };
  const grid = h(
    'div',
    { class: 'grid' },
    tile(t('menu.adventure'), 'balloon', 'red', 'menu-adventure', () =>
      app.push(() => worldMapScreen(app)),
    ),
    tile(t('menu.endless'), 'infinity', 'blue', 'menu-endless', () =>
      app.play(endlessMode(app, null)),
    ),
    tile(t('menu.daily'), 'calendar', 'green', 'menu-daily', () =>
      app.push(() => dailyScreen(app)),
    ),
    tile(t('menu.minis'), 'cake', 'yellow', 'menu-minis', () => app.push(() => minisScreen(app))),
    tile(t('menu.calm'), 'moon', 'purple', 'menu-calm', () => app.push(() => calmSetupScreen(app))),
    tile(t('menu.party'), 'party', 'red', 'menu-party', () =>
      app.push(() => partySetupScreen(app)),
    ),
    tile(t('menu.shop'), 'shop', 'yellow', 'menu-shop', () => app.push(() => shopScreen(app))),
    tile(t('menu.settings'), 'gear', 'blue', 'menu-settings', () => {
      void parentalGate(s.el).then((ok) => {
        if (ok) app.push(() => settingsScreen(app));
      });
    }),
  );
  s.el.append(top, h('h1', { text: t('app.title') }), grid);
  if (app.updateReady) {
    const apply = app.updateReady;
    s.el.append(
      button(
        { icon: 'retry', label: t('menu.update'), cls: 'blue small', testId: 'update-ready' },
        () => apply(),
      ),
    );
  }
  if (app.suggestRecalibrate) {
    s.el.append(
      button(
        { icon: 'mic', label: t('check.suggest'), cls: 'secondary small', testId: 'suggest-recal' },
        () => app.push(() => micCheckScreen(app, () => app.toMenu())),
      ),
    );
  }
  s.onBack = () => true;
  return s;
}
