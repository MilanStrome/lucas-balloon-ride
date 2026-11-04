// Calm Breathing: setup (pattern, minutes, music) and the session itself.
import type { App } from '../../App';
import { CALM } from '../../config';
import { CalmSession, calmPattern } from '../../game/modes/CalmBreathing';
import { drawBalloon } from '../../render/art/balloon';
import { hash01 } from '../../render/art/background';
import { skinDef } from '../../game/skins';
import { button, h } from '../dom';
import { t } from '../i18n';
import type { Screen } from '../Router';
import { makeScreen, topBar } from './common';

export function calmSetupScreen(app: App): Screen {
  const s = makeScreen('calm-setup');
  let pattern: number = CALM.defaultPattern;
  let minutes: number = CALM.sessionMinutes[0];
  const patRow = h('div', { class: 'row', role: 'group', 'aria-label': t('calm.pattern') });
  const minRow = h('div', { class: 'row', role: 'group', 'aria-label': t('calm.length') });
  const music = button({ label: `${t('calm.music')}`, cls: 'toggle', testId: 'calm-music' }, () => {
    app.store.update((d) => {
      d.settings.calmMusic = !d.settings.calmMusic;
    });
    music.setAttribute('aria-pressed', String(app.store.data.settings.calmMusic));
  });
  music.setAttribute('aria-pressed', String(app.store.data.settings.calmMusic));
  const render = () => {
    patRow.replaceChildren(
      ...CALM.patterns.map((p, i) => {
        const b = button(
          {
            label: `${p[0]}/${p[1]}`,
            cls: i === pattern ? 'green' : 'secondary',
            testId: `calm-pattern-${i}`,
          },
          () => {
            pattern = i;
            render();
          },
        );
        b.setAttribute('aria-pressed', String(i === pattern));
        return b;
      }),
    );
    minRow.replaceChildren(
      ...CALM.sessionMinutes.map((m) => {
        const b = button(
          { label: String(m), cls: m === minutes ? 'green' : 'secondary', testId: `calm-min-${m}` },
          () => {
            minutes = m;
            render();
          },
        );
        b.setAttribute('aria-pressed', String(m === minutes));
        return b;
      }),
    );
  };
  render();
  s.el.append(
    topBar(app, { back: true }),
    h('h1', { text: t('calm.title') }),
    h('p', { class: 'text', text: t('calm.pattern') }),
    patRow,
    h('p', { class: 'text', text: t('calm.length') }),
    minRow,
    music,
    button({ icon: 'play', label: t('calm.start'), cls: 'purple', testId: 'calm-start' }, () =>
      app.push(() => calmScreen(app, pattern, minutes)),
    ),
  );
  return s;
}

export function calmScreen(app: App, patternIdx: number, minutes: number): Screen {
  const s = makeScreen(`calm-${Date.now()}`, 'game');
  s.isGameplay = true;
  const [inS, outS] = calmPattern(patternIdx);
  const session = new CalmSession(inS, outS, minutes);
  const canvas = h('canvas', {
    'data-testid': 'calm-canvas',
    role: 'img',
    'aria-label': t('calm.title'),
  });
  const cue = h('div', { class: 'big-prompt', style: 'top:14%', 'data-testid': 'calm-cue' });
  const backBtn = topBar(app, { back: () => app.router.pop(true) });
  s.el.append(canvas, cue, backBtn);
  const ctx = canvas.getContext('2d');
  let last = -1;
  let finished = false;
  let paused = false;
  const prevTrack = app.music.current;
  const onPause = () => {
    paused = true;
    last = -1;
  };
  const resumeOnTap = () => {
    paused = false;
  };
  s.tick = (now) => {
    if (!ctx) return;
    const dt = last < 0 ? 0 : Math.min(0.1, (now - last) / 1000);
    last = now;
    if (paused && app.input.isBlowing) paused = false;
    if (!paused) session.update(dt, app.input.intensity);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const hgt = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
    if (canvas.height !== Math.round(hgt * dpr)) canvas.height = Math.round(hgt * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, hgt);
    g.addColorStop(0, '#0b1430');
    g.addColorStop(1, '#33407a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, hgt);
    const tt = app.reduceMotion ? 0 : session.t;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 60; i++) {
      const x = (((hash01(i) * w + tt * (3 + hash01(i + 3) * 4)) % w) + w) % w;
      const y = hash01(i + 50) * hgt * 0.8;
      ctx.globalAlpha = 0.3 + 0.5 * hash01(i + 9);
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;
    const cx = w / 2;
    const cy = hgt * 0.5;
    const unit = Math.min(w, hgt) * 0.32;
    if (session.phase === 'in' || session.phase === 'out') {
      ctx.strokeStyle = 'rgba(180,200,255,0.85)';
      ctx.lineWidth = 10;
      ctx.shadowColor = '#9fb6ff';
      ctx.shadowBlur = 24;
      ctx.beginPath();
      ctx.arc(cx, cy, unit * session.ring, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      const txt = session.phase === 'in' ? t('calm.in') : t('calm.out');
      if (cue.textContent !== txt) cue.textContent = txt;
    }
    if (session.phase === 'ending' || session.phase === 'done') {
      ctx.fillStyle = '#fff6c9';
      ctx.beginPath();
      ctx.arc(w * 0.78, hgt * 0.2, unit * 0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0b1430';
      ctx.beginPath();
      ctx.arc(w * 0.78 + unit * 0.1, hgt * 0.18, unit * 0.22, 0, Math.PI * 2);
      ctx.fill();
      cue.textContent = '';
    }
    ctx.fillStyle = '#1b2750';
    ctx.fillRect(0, hgt * 0.9, w, hgt * 0.1);
    const by = hgt * (1 - session.balloonY) - unit * 0.1;
    drawBalloon(ctx, cx, by, unit * 0.22, {
      skin: skinDef(app.p.skin),
      character: app.characters.get(app.p.character),
      registry: app.characters,
      pose: 'idle',
      flame: session.phase === 'out' ? app.input.intensity : 0,
      squash: 0,
      wobble: app.reduceMotion ? 0 : Math.sin(session.t * 12) * 0.15 * session.wobble,
      alpha: 1,
      shield: false,
      timeSec: session.t,
    });
    if (session.phase === 'done' && !finished) {
      finished = true;
      const card = h(
        'div',
        { class: 'card' },
        h('h2', { 'data-testid': 'calm-goodnight', text: t('calm.goodnight') }),
        h('p', { class: 'text', text: `${session.breaths} ✦ ${session.steadiness}%` }),
        button(
          { icon: 'menu', label: t('results.menu'), cls: 'secondary', testId: 'calm-menu' },
          () => app.toMenu(),
        ),
      );
      s.el.append(h('div', { class: 'overlay' }, card));
    }
  };
  s.enter = () => {
    app.playMusic(app.store.data.settings.calmMusic ? 'calm' : null);
    app.pauseListeners.add(onPause);
    canvas.addEventListener('pointerdown', resumeOnTap);
  };
  s.exit = () => {
    app.pauseListeners.delete(onPause);
    canvas.removeEventListener('pointerdown', resumeOnTap);
    app.playMusic(prevTrack ?? 'menu');
  };
  return s;
}
