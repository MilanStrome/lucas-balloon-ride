// Mini-games menu and a shared canvas screen that runs any MiniGame.
import type { App } from '../../App';
import { MiniBubbles } from '../../game/modes/MiniBubbles';
import { MiniCandles } from '../../game/modes/MiniCandles';
import { MiniSailboat } from '../../game/modes/MiniSailboat';
import type { MiniGame } from '../../game/modes/minis';
import { applyMiniResult } from '../../game/Progress';
import { button, h, icon } from '../dom';
import { t } from '../i18n';
import type { Screen } from '../Router';
import { makeScreen, topBar } from './common';

let miniRun = 0;

export function minisScreen(app: App): Screen {
  const s = makeScreen('minis');
  const tile = (
    label: string,
    ic: 'cake' | 'boat' | 'bubble',
    testId: string,
    make: () => MiniGame,
    hint: string,
  ) => {
    const b = h(
      'button',
      { class: 'tile t-yellow', type: 'button', 'data-testid': testId, 'aria-label': label },
      icon(ic),
      h('span', { text: label }),
    );
    b.addEventListener('click', () => app.push(() => miniScreen(app, make(), hint)));
    return b;
  };
  s.el.append(
    topBar(app, { back: true, coins: true }),
    h('h1', { text: t('minis.title') }),
    h(
      'div',
      { class: 'grid' },
      tile(
        t('minis.candles'),
        'cake',
        'mini-candles',
        () => new MiniCandles(3 + Math.floor(Math.random() * 6)),
        t('minis.candlesHint'),
      ),
      tile(
        t('minis.sailboat'),
        'boat',
        'mini-sailboat',
        () => new MiniSailboat(),
        t('minis.sailHint'),
      ),
      tile(
        t('minis.bubbles'),
        'bubble',
        'mini-bubbles',
        () => new MiniBubbles(),
        t('minis.bubbleHint'),
      ),
    ),
  );
  return s;
}

function miniScreen(app: App, game: MiniGame, hint: string): Screen {
  const runId = `mini-${game.kind}-${Date.now().toString(36)}-${miniRun++}`;
  const s = makeScreen(runId, 'game');
  s.isGameplay = true;
  const canvas = h('canvas', { 'data-testid': 'mini-canvas', role: 'img', 'aria-label': hint });
  const prompt = h('div', { class: 'big-prompt', style: 'top:12%', text: hint });
  const score = h('span', { class: 'chip', 'data-testid': 'mini-score' });
  const bar = topBar(app, { back: () => app.router.pop(true) });
  bar.lastElementChild?.append(score);
  s.el.append(canvas, prompt, bar);
  const ctx = canvas.getContext('2d');
  let last = -1;
  let t0 = -1;
  let paused = false;
  let finished = false;
  const onPause = () => {
    paused = true;
  };
  s.tick = (now) => {
    if (!ctx) return;
    if (t0 < 0) t0 = now;
    const dt = last < 0 ? 0 : Math.min(0.1, (now - last) / 1000);
    last = now;
    if (paused && app.input.isBlowing) paused = false;
    if (!paused && !finished) {
      const cue = game.update(dt, app.input.intensity, app.input.isBlowing);
      if (cue) app.sfx.play(cue);
      if (app.input.isBlowing) prompt.hidden = true;
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const hh = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
    if (canvas.height !== Math.round(hh * dpr)) canvas.height = Math.round(hh * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    game.render(ctx, w, hh, app.reduceMotion ? 0 : (now - t0) / 1000);
    const txt = `${t('minis.score')}: ${game.score}`;
    if (score.textContent !== txt) score.textContent = txt;
    if (game.done && !finished) {
      finished = true;
      let res = { best: false, coinsAdded: 0 };
      app.store.update(() => {
        res = applyMiniResult(app.p, app.applied, runId, game.kind, game.score);
      });
      app.safePoint();
      const card = h(
        'div',
        { class: 'card' },
        h('h2', { 'data-testid': 'mini-done', text: t('results.great') }),
        h('p', { class: 'text' }, `${t('minis.score')}: ${game.score}`),
        h('p', { class: 'text' }, icon('coin'), ` +${res.coinsAdded}`),
        res.best ? h('p', { class: 'text', text: t('results.newBest') }) : null,
        button(
          { icon: 'menu', label: t('results.menu'), cls: 'secondary', testId: 'mini-menu' },
          () => app.router.pop(true),
        ),
      );
      s.el.append(h('div', { class: 'overlay' }, card));
    }
  };
  s.enter = () => app.pauseListeners.add(onPause);
  s.exit = () => app.pauseListeners.delete(onPause);
  return s;
}
