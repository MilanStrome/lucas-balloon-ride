// Mic Check + Calibration: quiet, then big blow, with a live meter balloon the whole time.
import type { App } from '../../App';
import { Calibration } from '../../audio/Calibration';
import type { Features } from '../../audio/features';
import { button, h } from '../dom';
import { t } from '../i18n';
import type { Screen } from '../Router';
import { balloonSvg, isLaptop, makeScreen, micHintSvg } from './common';

export function micCheckScreen(app: App, onDone: () => void): Screen {
  const s = makeScreen('mic-check');
  const cal = new Calibration();
  const title = h('h1', { 'data-testid': 'check-title', text: t('check.quiet') });
  const meterBalloon = h('div', { class: 'meter-balloon', 'data-testid': 'meter-balloon' });
  meterBalloon.innerHTML = balloonSvg('#3d8bfd', '#bde0ff');
  const meter = h(
    'div',
    { class: 'meter', 'aria-hidden': 'true' },
    h('div', { class: 'meter-track' }),
    meterBalloon,
  );
  const bar = h('div');
  const progress = h(
    'div',
    { class: 'progress', role: 'progressbar', 'aria-label': 'progress' },
    bar,
  );
  const guidance = h('div', { class: 'card', 'data-testid': 'check-guidance' });
  guidance.hidden = true;
  const actions = h('div', { class: 'row' });
  s.el.append(title, meter, progress, guidance, actions);

  let finished = false;
  let level = 0;
  let autoTimer: ReturnType<typeof setTimeout> | null = null;
  const onFrame = (f: Features, now: number) => {
    // Live meter: map loudness into the balloon height (rises when the child is heard).
    const floor = cal.phase === 'blow' ? cal.measuredFloor : -70;
    const v = Math.max(0, Math.min(1, (f.rmsDb - floor) / 35));
    level += (v - level) * 0.3;
    meterBalloon.style.bottom = `${Math.round(level * 100)}px`;
    if (cal.phase === 'quiet' || cal.phase === 'blow') {
      const prev = cal.phase;
      cal.feed(f, now);
      bar.style.width = `${Math.round(cal.progress(now) * 100)}%`;
      if (prev === 'quiet' && cal.phase === 'blow') title.textContent = t('check.blow');
      const now2 = cal.phase as string;
      if (now2 === 'done' && cal.result) succeed();
      if (now2 === 'failed') fail();
    }
  };

  // Always offered: kids who can't (or don't want to) blow can tap & hold instead.
  const anotherWay = () =>
    button(
      { icon: 'person', label: t('check.fallback'), cls: 'secondary', testId: 'check-another-way' },
      () => {
        app.store.update((d) => {
          d.settings.tapMode = true;
        });
        app.applySettings();
        onDone();
      },
    );

  const begin = () => {
    guidance.hidden = true;
    actions.replaceChildren(anotherWay());
    title.textContent = t('check.quiet');
    bar.style.width = '0';
    cal.start(performance.now());
  };

  const succeed = () => {
    if (finished || !cal.result) return;
    finished = true;
    app.saveCalibration(cal.result);
    app.sfx.play('cheer');
    title.textContent = t('check.done');
    actions.replaceChildren(
      button(
        { icon: 'play', label: t('check.continue'), cls: 'green', testId: 'check-continue' },
        () => onDone(),
      ),
    );
    // Breath-only play: continue by itself after a moment.
    autoTimer = setTimeout(() => onDone(), 1800);
  };

  const fail = () => {
    const msg = cal.failReason === 'lowRange' ? t('check.fail.lowRange') : t('check.fail.noBlow');
    const pic = h('div');
    pic.innerHTML = micHintSvg(isLaptop());
    guidance.replaceChildren(
      h('p', { class: 'text', text: msg }),
      pic,
      h('p', { class: 'text', text: t(isLaptop() ? 'check.where.laptop' : 'check.where.phone') }),
    );
    guidance.hidden = false;
    actions.replaceChildren(
      button(
        { icon: 'retry', label: t('check.retry'), cls: 'green', testId: 'check-retry' },
        begin,
      ),
    );
    actions.append(anotherWay());
  };

  s.enter = () => {
    app.input.frameListeners.add(onFrame);
    begin();
  };
  s.exit = () => {
    app.input.frameListeners.delete(onFrame);
    if (autoTimer) clearTimeout(autoTimer);
  };
  // First run: nowhere to go back to. From Settings (recalibrate): normal back.
  s.onBack = () => app.router.stack.length <= 1;
  return s;
}
