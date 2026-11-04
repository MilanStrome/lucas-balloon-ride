// Daily Sky intro: streak, today's status, play.
import type { App } from '../../App';
import { dailyMode } from '../../game/modes/Daily';
import { dailyStatus } from '../../game/Progress';
import { button, h, icon } from '../dom';
import { t } from '../i18n';
import type { Screen } from '../Router';
import { makeScreen, topBar } from './common';

export function dailyScreen(app: App): Screen {
  const s = makeScreen('daily');
  const body = h('div', { class: 'card' });
  const render = () => {
    const st = dailyStatus(app.store.dailyFor(app.p.id), app.today());
    const kids: (HTMLElement | null)[] = [
      h('h2', { 'data-testid': 'daily-date', text: app.today() }),
      h(
        'p',
        { class: 'text', 'data-testid': 'daily-streak' },
        icon('star'),
        ` ${t('daily.streak')}: ${st.streak}`,
      ),
      st.doneToday ? h('p', { class: 'text', text: t('daily.done') }) : null,
      st.missed ? h('p', { class: 'text', text: t('daily.missed') }) : null,
      button({ icon: 'play', label: t('common.play'), cls: 'green', testId: 'daily-play' }, () =>
        app.play(dailyMode(app)),
      ),
    ];
    body.replaceChildren(...kids.filter((k): k is HTMLElement => k !== null));
  };
  render();
  s.enter = render;
  s.el.append(topBar(app, { back: true, coins: true }), h('h1', { text: t('daily.title') }), body);
  return s;
}
