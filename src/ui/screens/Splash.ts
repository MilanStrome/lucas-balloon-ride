// Splash: one big tap starts audio and (with a friendly picture first) asks for the mic.
import type { App } from '../../App';
import { h, icon } from '../dom';
import { t } from '../i18n';
import type { Screen } from '../Router';
import { balloonSvg, makeScreen } from './common';

export function splashScreen(app: App): Screen {
  const s = makeScreen('splash');
  const art = h('div', { class: 'avatar big' });
  art.innerHTML = balloonSvg();
  const go = h(
    'button',
    { class: 'btn green', type: 'button', 'data-testid': 'splash-start', autofocus: true },
    icon('play'),
    h('span', { text: t('splash.tap') }),
  );
  const asking = h('p', { class: 'text', text: t('mic.asking') });
  asking.hidden = true;
  let tapped = false;
  const start = () => {
    if (tapped) return;
    tapped = true;
    go.disabled = true;
    asking.hidden = false;
    app.onSplashTap();
  };
  go.addEventListener('click', start);
  s.el.addEventListener('click', (e) => {
    if (e.target === s.el) start();
  });
  s.el.append(
    h('h1', { text: t('app.title') }),
    art,
    go,
    h('p', { class: 'text' }, icon('mic'), ' ', t('splash.micNote')),
    asking,
    h('p', { class: 'text', style: 'font-size:15px;color:var(--ink-soft)', text: t('app.brand') }),
  );
  s.onBack = () => true;
  return s;
}
