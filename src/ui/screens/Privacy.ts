// Privacy notice (also published as /privacy.html for the store listing).
import type { App } from '../../App';
import { h } from '../dom';
import { t } from '../i18n';
import type { Screen } from '../Router';
import { makeScreen, topBar } from './common';

export function privacyScreen(app: App): Screen {
  const s = makeScreen('privacy');
  s.el.append(
    topBar(app, { back: true }),
    h('h1', { text: t('privacy.title') }),
    h(
      'div',
      { class: 'card' },
      h('p', { class: 'text', text: t('privacy.body1') }),
      h('p', { class: 'text', text: t('privacy.body2') }),
      h('p', { class: 'text', text: t('privacy.body3') }),
    ),
  );
  return s;
}
