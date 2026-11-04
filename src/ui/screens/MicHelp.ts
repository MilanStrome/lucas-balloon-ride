// Mic Help: how to enable the mic per platform, retry, and a gated no-mic fallback.
import type { App } from '../../App';
import { MicInput } from '../../audio/MicInput';
import { button, h } from '../dom';
import { t } from '../i18n';
import type { Screen } from '../Router';
import { isLaptop, makeScreen, micHintSvg } from './common';

export function micHelpScreen(app: App): Screen {
  const s = makeScreen('mic-help');
  const ua = navigator.userAgent;
  const platform = /iPhone|iPad|iPod/i.test(ua)
    ? 'mic.help.ios'
    : /Android/i.test(ua)
      ? 'mic.help.android'
      : 'mic.help.desktop';
  const pic = h('div');
  pic.innerHTML = micHintSvg(isLaptop());
  const reason = app.micError === 'nodevice' ? t('mic.help.none') : t('mic.help.denied');
  s.el.append(
    h('h1', { text: t('mic.help.title') }),
    pic,
    h(
      'div',
      { class: 'card' },
      h('p', { class: 'text', 'data-testid': 'mic-help-reason', text: reason }),
      h('p', { class: 'text', text: t(platform) }),
    ),
    h(
      'div',
      { class: 'row' },
      button(
        { icon: 'retry', label: t('mic.help.retry'), cls: 'green', testId: 'mic-retry' },
        () => {
          app.mic.resume();
          void app.startMic();
        },
      ),
      button(
        { icon: 'person', label: t('mic.help.fallback'), cls: 'secondary', testId: 'mic-fallback' },
        () => {
          app.store.update((d) => {
            d.settings.tapMode = true;
          });
          app.applySettings();
          app.toProfiles();
        },
      ),
    ),
  );
  // Permission granted later from browser settings: notice on return and continue.
  let status: PermissionStatus | null = null;
  const onFocus = () => void app.retryMicSilently();
  s.enter = () => {
    window.addEventListener('focus', onFocus);
    void navigator.permissions
      ?.query({ name: 'microphone' as PermissionName })
      .then((p) => {
        status = p;
        p.onchange = () => {
          if (p.state === 'granted') void app.startMic();
        };
      })
      .catch(() => undefined);
    void MicInput.permissionState();
  };
  s.exit = () => {
    window.removeEventListener('focus', onFocus);
    if (status) status.onchange = null;
  };
  s.onBack = () => true;
  return s;
}
