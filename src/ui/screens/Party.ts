// Party Mode screens: choose players/avatars, "Pass to …" card with 3-2-1, turns, podium.
import type { App } from '../../App';
import type { Features } from '../../audio/features';
import { QuickFloor, rebaseCalibration } from '../../audio/Calibration';
import { PARTY } from '../../config';
import { CourseRunner } from '../../game/CourseRunner';
import {
  newParty,
  partyOver,
  podium,
  recordTurn,
  PARTY_TURN_SEC,
  type PartyState,
} from '../../game/modes/Party';
import type { CourseMode, RunResult } from '../../game/modes/types';
import { AVATARS } from '../avatars';
import { button, h } from '../dom';
import { t } from '../i18n';
import type { Screen } from '../Router';
import { makeScreen, topBar } from './common';
import { gameScreen } from './Game';
import { avatarEl } from './Profiles';

let partyCounter = 0;

export function partySetupScreen(app: App): Screen {
  const s = makeScreen('party-setup');
  let count = 3;
  const picks: string[] = AVATARS.map((a) => a.id);
  const countLabel = h('h2', { 'data-testid': 'party-count', text: String(count) });
  const slots = h('div', { class: 'row' });
  const renderSlots = () => {
    countLabel.textContent = String(count);
    slots.replaceChildren();
    for (let i = 0; i < count; i++) {
      const b = h(
        'button',
        {
          class: 'avatar-btn',
          type: 'button',
          'data-testid': `party-slot-${i}`,
          'aria-label': `${i + 1}`,
        },
        avatarEl(picks[i] ?? 'bear'),
      );
      b.addEventListener('click', () => {
        // Cycle through avatars: no typing needed.
        const cur = AVATARS.findIndex((a) => a.id === picks[i]);
        picks[i] = AVATARS[(cur + 1) % AVATARS.length]?.id ?? 'bear';
        renderSlots();
        (slots.children[i] as HTMLElement | undefined)?.focus();
      });
      slots.append(b);
    }
  };
  renderSlots();
  s.el.append(
    topBar(app, { back: true }),
    h('h1', { text: t('party.title') }),
    h('p', { class: 'text', text: t('party.players') }),
    h(
      'div',
      { class: 'row' },
      button(
        { icon: 'minus', cls: 'secondary round', ariaLabel: '−', testId: 'party-minus' },
        () => {
          count = Math.max(PARTY.minPlayers, count - 1);
          renderSlots();
        },
      ),
      countLabel,
      button({ icon: 'plus', cls: 'secondary round', ariaLabel: '+', testId: 'party-plus' }, () => {
        count = Math.min(PARTY.maxPlayers, count + 1);
        renderSlots();
      }),
    ),
    h('p', { class: 'text', text: t('party.pick') }),
    slots,
    button({ icon: 'play', label: t('party.go'), cls: 'green', testId: 'party-start' }, () => {
      const seed = Math.floor(Math.random() * 2 ** 31);
      const party = newParty(picks.slice(0, count), seed);
      app.playMusic('party');
      app.router.replace(() => passScreen(app, party), true);
    }),
  );
  return s;
}

function passScreen(app: App, party: PartyState): Screen {
  const s = makeScreen(`party-pass-${party.seed}-${party.turn}`);
  const player = party.players[party.turn];
  const avatar = player?.avatar ?? 'bear';
  const counter = h('div', {
    class: 'big-prompt',
    style: 'position:static;transform:none',
    'data-testid': 'party-countdown',
  });
  const startBtn = button(
    { icon: 'play', label: t('party.tapStart'), cls: 'green', testId: 'party-turn-start' },
    () => begin(),
  );
  let started = false;
  let qf: QuickFloor | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const onFrame = (f: Features, now: number) => {
    if (qf && !qf.done) qf.feed(f, now);
  };
  const begin = () => {
    if (started) return;
    started = true;
    startBtn.hidden = true;
    // Quick 0.8 s noise-floor re-check for this player while the countdown runs.
    qf = new QuickFloor();
    let n = PARTY.countdownSec;
    counter.textContent = String(n);
    const step = () => {
      n--;
      if (n > 0) {
        counter.textContent = String(n);
        app.sfx.play('click');
        timer = setTimeout(step, 1000);
      } else {
        counter.textContent = t('party.go');
        if (qf?.done)
          app.input.setCalibration(
            rebaseCalibration(app.input.detector.getCalibration(), qf.floor),
          );
        app.router.replace(() => gameScreen(app, partyTurnMode(app, party)), true);
      }
    };
    timer = setTimeout(step, app.testConfig.quickTimers ? 50 : 1000);
  };
  s.el.append(
    h('h1', { 'data-testid': 'party-pass', text: `${t('party.pass')}…` }),
    avatarEl(avatar, true),
    counter,
    startBtn,
  );
  s.enter = () => app.input.frameListeners.add(onFrame);
  s.exit = () => {
    app.input.frameListeners.delete(onFrame);
    if (timer) clearTimeout(timer);
  };
  s.onBack = () => {
    app.toMenu();
    return true;
  };
  return s;
}

function partyTurnMode(app: App, party: PartyState): CourseMode {
  const runId = `party-${party.seed}-${party.turn}-${partyCounter++}`;
  const turn = party.turn;
  const next = () => {
    if (partyOver(party)) app.router.replace(() => podiumScreen(app, party), true);
    else app.router.replace(() => passScreen(app, party), true);
  };
  return {
    kind: 'party',
    id: runId,
    music: 'party',
    easy: false,
    showDistance: true,
    timeLimitSec: app.testConfig.partyTurnSec ?? PARTY_TURN_SEC,
    hudLabel: `${turn + 1}/${party.players.length}`,
    createRunner: () => new CourseRunner({ endlessSeed: party.seed }, { easy: false }),
    finish: (r: RunResult) => {
      if (party.turn !== turn) return;
      recordTurn(party, r.distanceM);
      next();
    },
    retry: () => app.router.replace(() => gameScreen(app, partyTurnMode(app, party)), true),
  };
}

export function podiumScreen(app: App, party: PartyState): Screen {
  const s = makeScreen(`party-podium-${party.seed}`);
  app.sfx.play('cheer');
  const ranks = podium(party);
  const wrap = h('div', { class: 'podium', 'data-testid': 'podium' });
  ranks.forEach((r, i) => {
    const height = r.place === 1 ? 150 : r.place === 2 ? 110 : r.place === 3 ? 80 : 50;
    const place = h(
      'div',
      {
        class: 'place',
        'data-testid': `podium-${i}`,
        'data-place': String(r.place),
        'data-player': String(r.index),
        style: `animation-delay:${0.2 * (ranks.length - i)}s`,
      },
      avatarEl(r.player.avatar),
      h('span', { text: `${r.player.distance ?? 0} m` }),
      h('div', { class: 'block', style: `height:${height}px`, text: String(r.place) }),
    );
    wrap.append(place);
  });
  s.el.append(
    h('h1', { text: t('party.podium') }),
    wrap,
    h(
      'div',
      { class: 'row' },
      button({ icon: 'retry', label: t('party.again'), cls: 'green', testId: 'party-again' }, () =>
        app.router.replace(() => partySetupScreen(app), true),
      ),
      button(
        { icon: 'menu', label: t('results.menu'), cls: 'secondary', testId: 'party-menu' },
        () => app.toMenu(),
      ),
    ),
  );
  s.onBack = () => {
    app.toMenu();
    return true;
  };
  return s;
}
