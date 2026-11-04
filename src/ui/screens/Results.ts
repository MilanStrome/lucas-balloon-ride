// Results: stars (or distance), coins, new unlocks; retry / next / menu. Big icons, little text.
import type { App } from '../../App';
import { button, h, icon } from '../dom';
import { t } from '../i18n';
import type { Screen } from '../Router';
import { makeScreen } from './common';

export interface ResultsData {
  id: string;
  stars: number | null;
  distanceM?: number;
  best?: number;
  coins: number;
  gentle: boolean;
  newBest: boolean;
  unlocked: string | null;
  streak?: number;
  retry: () => void;
  next: (() => void) | null;
}

export function resultsScreen(app: App, r: ResultsData): Screen {
  const s = makeScreen('results');
  s.id = r.id;
  app.playMusic('menu');
  const card = h('div', { class: 'card' });
  if (r.stars !== null) {
    const row = h('div', {
      class: 'row stars-row',
      'data-testid': 'result-stars',
      'data-stars': String(r.stars),
      'aria-label': `${t('common.stars')}: ${r.stars}`,
    });
    for (let i = 0; i < 3; i++) {
      const st = icon('star', i < r.stars ? 'icon on' : 'icon');
      st.style.animationDelay = `${0.2 + i * 0.25}s`;
      row.append(st);
    }
    card.append(row);
  }
  if (r.distanceM !== undefined) {
    card.append(
      h('h2', {
        'data-testid': 'result-distance',
        text: `${t('results.distance')}: ${r.distanceM} m`,
      }),
    );
    if (r.best !== undefined)
      card.append(h('p', { class: 'text', text: `${t('endless.best')}: ${Math.floor(r.best)} m` }));
  }
  card.append(
    h('p', { class: 'text', 'data-testid': 'result-coins' }, icon('coin'), ` +${r.coins}`),
  );
  if (r.gentle) card.append(h('p', { class: 'text', text: t('results.gentle') }));
  if (r.newBest) card.append(h('p', { class: 'text', text: t('results.newBest') }));
  if (r.streak !== undefined)
    card.append(
      h('p', {
        class: 'text',
        'data-testid': 'result-streak',
        text: `${t('daily.streak')}: ${r.streak}`,
      }),
    );
  if (r.unlocked)
    card.append(
      h(
        'p',
        { class: 'text', 'data-testid': 'result-unlocked' },
        icon('lock'),
        ` ${t('results.unlocked')} ${t(r.unlocked)}`,
      ),
    );
  const buttons = h(
    'div',
    { class: 'row' },
    button(
      {
        icon: 'retry',
        cls: 'blue',
        ariaLabel: t('results.retry'),
        label: t('results.retry'),
        testId: 'results-retry',
      },
      r.retry,
    ),
    r.next
      ? button(
          {
            icon: 'next',
            cls: 'green',
            ariaLabel: t('results.next'),
            label: t('results.next'),
            testId: 'results-next',
          },
          r.next,
        )
      : null,
    button(
      {
        icon: 'menu',
        cls: 'secondary',
        ariaLabel: t('results.menu'),
        label: t('results.menu'),
        testId: 'results-menu',
      },
      () => app.toMenu(),
    ),
  );
  s.el.append(h('h1', { text: t('results.great') }), card, buttons);
  s.onBack = () => {
    app.toMenu();
    return true;
  };
  return s;
}
