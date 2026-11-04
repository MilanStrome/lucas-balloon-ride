// Gameplay host for course modes: fixed-step loop, HUD, pause, mic loss, rest breaks.
import type { App } from '../../App';
import { GAMEPLAY } from '../../config';
import { FixedLoop } from '../../engine/Loop';
import type { CourseRunner } from '../../game/CourseRunner';
import { EV } from '../../game/LevelSim';
import type { CourseMode, RunResult } from '../../game/modes/types';
import type { Pose } from '../../game/Characters';
import { Renderer } from '../../render/Renderer';
import { button, h, icon } from '../dom';
import { t } from '../i18n';
import type { Screen } from '../Router';
import { makeScreen } from './common';

export interface GameView {
  screen: string;
  started: boolean;
  paused: boolean;
  y: number;
  vy: number;
  x: number;
  hearts: number;
  stars: number;
  starsTotal: number;
  coins: number;
  distanceM: number;
  done: boolean;
  failed: boolean;
  courseId: string;
  /** Cheap fingerprint of the course layout (same seed => same value). */
  courseHash: number;
}

let rotateHintShown = false;

export function gameScreen(app: App, mode: CourseMode): Screen {
  const s = makeScreen(`game-${mode.id}`, 'game');
  s.isGameplay = true;
  const canvas = h('canvas', {
    'data-testid': 'game-canvas',
    'aria-label': t('app.title'),
    role: 'img',
  });
  const heartsEl = h('div', { class: 'group', 'data-testid': 'hud-hearts' });
  const scoreEl = h('span', { class: 'chip', 'data-testid': 'hud-score' });
  const label = mode.hudLabel ? h('span', { class: 'chip', text: mode.hudLabel }) : null;
  const pauseBtn = button(
    { icon: 'pause', cls: 'secondary round', ariaLabel: t('pause.title'), testId: 'pause' },
    () => pause('button'),
  );
  const hud = h(
    'div',
    { class: 'hud' },
    h('div', { class: 'group' }, heartsEl, scoreEl, label),
    h('div', { class: 'group' }, pauseBtn),
  );
  const prompt = h('div', {
    class: 'big-prompt',
    'data-testid': 'blow-prompt',
    text: t(
      !app.store.data.settings.tapMode
        ? 'game.blowToStart'
        : app.micState === 'on'
          ? 'game.blowOrTapToStart'
          : 'game.tapToStart',
    ),
  });
  s.el.append(canvas, hud, prompt);

  const runner: CourseRunner = mode.createRunner();
  const renderer = new Renderer(canvas);
  renderer.registry = app.characters;
  let started = false;
  let paused = false;
  let ended = false;
  let overlay: HTMLElement | null = null;
  let pausedAt = 0;
  let blowSince = -1;
  let pose: Pose = 'idle';
  let poseUntil = 0;
  let blowPlayMs = 0;
  let lastHearts = -1;
  let lastScore = '';
  let timeSec = 0;
  let resultTimer: ReturnType<typeof setTimeout> | null = null;
  const profile = app.p;
  const hop = app.store.data.settings.controlStyle === 'hop';

  const applyPrefs = () => {
    renderer.prefs = {
      quality: app.quality,
      reduceMotion: app.reduceMotion,
      colorblind: app.store.data.settings.colorblind,
    };
    renderer.particles.enabled = app.quality === 'high';
    renderer.resize();
  };
  applyPrefs();

  const update = (dtMs: number) => {
    if (paused || ended) return;
    timeSec += dtMs / 1000;
    renderer.particles.update(dtMs / 1000);
    const inp = app.input;
    if (!started) {
      if (inp.isBlowing || inp.intensity > 0.05) {
        started = true;
        prompt.hidden = true;
      } else return;
    }
    let intensity = inp.intensity;
    if (hop) {
      if (inp.onsetThisFrame) runner.hop();
      intensity = 0;
    }
    const ev = runner.step(intensity, dtMs);
    if (ev & EV.CHUNK_END) scheduleAhead();
    if (inp.isBlowing) blowPlayMs += dtMs;
    handleEvents(ev);
    if (mode.timeLimitSec && runner.state.rt >= mode.timeLimitSec) end(true);
    if (app.store.data.settings.restBreaks && blowPlayMs >= GAMEPLAY.restBreakMs) {
      blowPlayMs = 0;
      restBreak();
    }
  };

  const handleEvents = (ev: number) => {
    if (!ev) return;
    const st = runner.state;
    const sim = runner.cur;
    if (ev & EV.STAR) {
      app.sfx.play('chime');
      for (const i of sim.stepItems)
        if (i < sim.nStars)
          renderer.particles.sparkle(runner.curOffset + (sim.itemX[i] ?? 0), sim.itemY[i] ?? 0);
      pose = 'happy';
      poseUntil = timeSec + 0.6;
    }
    if (ev & EV.COIN) app.sfx.play('coin');
    if (ev & EV.POWERUP) {
      app.sfx.play('whoosh');
      renderer.particles.sparkle(runner.worldX, st.y, '#9be7ff', 14);
    }
    if (ev & (EV.HIT | EV.SHIELD_BREAK)) {
      app.sfx.play(ev & EV.GROUND ? 'bounce' : 'hit');
      app.vibrate(120);
      renderer.hit();
      pose = 'hit';
      poseUntil = timeSec + 0.8;
    } else if (ev & EV.GROUND) app.sfx.play('bounce');
    if (ev & EV.LANDED) {
      app.sfx.play('cheer');
      renderer.particles.confetti(runner.worldX, 60);
      pose = 'happy';
      poseUntil = timeSec + 99;
      end(false);
    }
    if (ev & EV.FAILED) tryAgain();
  };

  const render = (alpha: number) => {
    if (timeSec > poseUntil) pose = 'idle';
    const settings = profile;
    renderer.render(runner, alpha, timeSec, {
      skin: settings.skin,
      character: settings.character,
      intensity: started ? app.input.intensity : 0,
      isBlowing: started && app.input.isBlowing,
      pose,
    });
    const st = runner.state;
    const hearts = Number.isFinite(st.hearts) ? st.hearts : -1;
    if (hearts !== lastHearts) {
      lastHearts = hearts;
      heartsEl.replaceChildren();
      if (hearts < 0)
        heartsEl.append(h('span', { class: 'chip' }, icon('heart', 'icon heart'), '∞'));
      else
        for (let i = 0; i < GAMEPLAY.hearts; i++)
          heartsEl.append(icon('heart', i < hearts ? 'icon heart' : 'icon heart lost'));
      heartsEl.setAttribute('aria-label', `${t('common.hearts')}: ${hearts < 0 ? '∞' : hearts}`);
    }
    const score = mode.showDistance ? `${runner.distanceM} m` : `${st.stars}/${runner.starsTotal}`;
    if (score !== lastScore) {
      lastScore = score;
      scoreEl.replaceChildren(
        icon(mode.showDistance ? 'balloon' : 'star', mode.showDistance ? 'icon' : 'icon star'),
        score,
      );
    }
  };

  // Endless: pre-generate upcoming chunks outside the game step.
  const scheduleAhead = () => {
    const ric = (
      window as unknown as {
        requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      }
    ).requestIdleCallback;
    if (ric) ric(() => runner.prepareAhead(), { timeout: 2000 });
    else setTimeout(() => runner.prepareAhead(), 50);
  };
  if (runner.isEndless) scheduleAhead();

  const loop = new FixedLoop(update, render);

  const result = (quit: boolean): RunResult => {
    const st = runner.state;
    return {
      landed: st.done && !!runner.cur.course.pad,
      failed: st.failed,
      quit,
      stars: st.stars,
      starsTotal: runner.starsTotal,
      coins: st.coins,
      gentle: st.gentle,
      distanceM: runner.distanceM,
      runId: mode.id,
    };
  };

  const end = (quit: boolean) => {
    if (ended) return;
    ended = true;
    app.safePoint();
    // Let the landing celebration play for a moment.
    resultTimer = setTimeout(() => mode.finish(result(quit)), quit ? 0 : 1200);
  };

  const showOverlay = (card: HTMLElement, testId: string) => {
    overlay?.remove();
    overlay = h('div', { class: 'overlay', 'data-testid': testId }, card);
    s.el.append(overlay);
    overlay.querySelector('button')?.focus();
  };
  const closeOverlay = () => {
    overlay?.remove();
    overlay = null;
  };

  const resume = () => {
    if (!paused) return;
    paused = false;
    closeOverlay();
    loop.resetClock();
    app.mic.resume();
  };

  const pause = (why: string) => {
    if (ended || paused) return;
    paused = true;
    pausedAt = performance.now();
    blowSince = -1;
    app.store.flush();
    if (why === 'micLost') {
      const card = h('div', { class: 'card' }, h('h2', { text: t('mic.lost') }));
      card.append(
        button(
          { icon: 'mic', label: t('mic.reconnect'), cls: 'green', testId: 'mic-reconnect' },
          () => {
            void app.reconnectMic().then((ok) => {
              if (ok) {
                paused = false;
                pause('reconnected');
              }
            });
          },
        ),
        button(
          { icon: 'menu', label: t('pause.menu'), cls: 'secondary', testId: 'pause-menu' },
          () => quitToMenu(),
        ),
      );
      showOverlay(card, 'mic-lost');
      return;
    }
    const card = h(
      'div',
      { class: 'card' },
      h('h2', { text: t('pause.title') }),
      h('p', { class: 'text', text: t('pause.blow') }),
      h(
        'div',
        { class: 'row' },
        button(
          { icon: 'play', label: t('pause.resume'), cls: 'green', testId: 'pause-resume' },
          resume,
        ),
        button({ icon: 'retry', label: t('pause.retry'), cls: 'blue', testId: 'pause-retry' }, () =>
          mode.retry(),
        ),
        button(
          { icon: 'menu', label: t('pause.menu'), cls: 'secondary', testId: 'pause-menu' },
          () => quitToMenu(),
        ),
      ),
    );
    showOverlay(card, 'pause-overlay');
  };

  const quitToMenu = () => {
    if (mode.showDistance && started && !ended) {
      end(true);
      return;
    }
    ended = true;
    app.safePoint();
    app.toMenu();
  };

  const tryAgain = () => {
    if (ended) return;
    if (mode.showDistance) {
      end(false);
      return;
    }
    ended = true;
    app.safePoint();
    app.sfx.play('pop');
    const card = h(
      'div',
      { class: 'card' },
      h('h2', { 'data-testid': 'try-again', text: t('game.tryAgain') }),
      h(
        'div',
        { class: 'row' },
        button(
          { icon: 'retry', label: t('results.retry'), cls: 'green', testId: 'try-retry' },
          () => mode.retry(),
        ),
        button(
          { icon: 'menu', label: t('results.menu'), cls: 'secondary', testId: 'try-menu' },
          () => app.toMenu(),
        ),
      ),
    );
    showOverlay(card, 'try-overlay');
  };

  const restBreak = () => {
    paused = true;
    pausedAt = performance.now();
    const card = h(
      'div',
      { class: 'card' },
      h('h2', { 'data-testid': 'rest-break', text: t('game.restBreak') }),
      button({ icon: 'check', label: t('game.restOk'), cls: 'green', testId: 'rest-ok' }, resume),
    );
    showOverlay(card, 'rest-overlay');
  };

  // Resume by blowing: a fresh, sustained blow after the pause card has been up a moment.
  s.tick = (now) => {
    if (paused && !ended && overlay && overlay.dataset['testid'] !== 'mic-lost') {
      const wait = overlay.dataset['testid'] === 'rest-overlay' ? GAMEPLAY.restBreakMinMs : 700;
      if (now - pausedAt > wait && app.input.isBlowing) {
        if (blowSince < 0) blowSince = now;
        if (now - blowSince > 400) resume();
      } else if (!app.input.isBlowing) blowSince = -1;
    }
    loop.frame(now);
  };

  const onPause = (why: string) => pause(why);
  const onResize = () => renderer.resize();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
  const down = (e: PointerEvent) => {
    if (e.target === canvas) app.input.tapHeld = true;
  };
  const up = () => {
    app.input.tapHeld = false;
  };
  const onSettings = () => applyPrefs();

  s.enter = () => {
    app.pauseListeners.add(onPause);
    app.settingsListeners.add(onSettings);
    ro?.observe(canvas);
    window.addEventListener('resize', onResize);
    canvas.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    loop.resetClock();
    applyPrefs();
    if (renderer.view.portrait && !rotateHintShown) {
      rotateHintShown = true;
      const hint = h('div', {
        class: 'hint-banner',
        'data-testid': 'rotate-hint',
        text: t('game.rotate'),
      });
      s.el.append(hint);
      setTimeout(() => hint.remove(), 3500);
    }
  };
  s.exit = () => {
    app.pauseListeners.delete(onPause);
    app.settingsListeners.delete(onSettings);
    ro?.disconnect();
    window.removeEventListener('resize', onResize);
    canvas.removeEventListener('pointerdown', down);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    app.input.tapHeld = false;
    if (resultTimer) clearTimeout(resultTimer);
    renderer.particles.clear();
    if (gameRef.current === view) gameRef.current = null;
  };
  // Back during play pauses first; back on the pause card goes to the menu.
  s.onBack = () => {
    if (ended) return false;
    if (!paused) pause('back');
    else quitToMenu();
    return true;
  };

  const view = (): GameView => {
    const st = runner.state;
    return {
      screen: s.id,
      started,
      paused,
      y: st.y,
      vy: st.vy,
      x: runner.worldX,
      hearts: Number.isFinite(st.hearts) ? st.hearts : 999,
      stars: st.stars,
      starsTotal: runner.starsTotal,
      coins: st.coins,
      distanceM: runner.distanceM,
      done: st.done,
      failed: st.failed,
      courseId: runner.cur.course.id,
      courseHash: runner.cur.course.hazards.reduce(
        (a, hz) => (a * 31 + Math.round(hz.x)) % 1_000_000_007,
        runner.cur.course.stars.length,
      ),
    };
  };
  gameRef.current = view;
  return s;
}

/** Live view of the running game (for the e2e test hook and debug overlay). */
export const gameRef: { current: (() => GameView) | null } = { current: null };
