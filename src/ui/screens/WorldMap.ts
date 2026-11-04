// World map and level select.
import type { App } from '../../App';
import { adventureMode } from '../../game/modes/Adventure';
import {
  WORLDS,
  LEVELS_PER_WORLD,
  completedInWorld,
  isLevelUnlocked,
  isWorldUnlocked,
  levelId,
} from '../../game/Progress';
import { h, icon } from '../dom';
import { t } from '../i18n';
import type { Screen } from '../Router';
import { makeScreen, topBar } from './common';

const WORLD_ICONS = ['balloon', 'infinity', 'party', 'bubble', 'moon', 'star'] as const;

export function worldMapScreen(app: App): Screen {
  const s = makeScreen('world-map');
  const grid = h('div', { class: 'grid' });
  const render = () => {
    grid.replaceChildren();
    for (let w = 1; w <= WORLDS; w++) {
      const unlocked = isWorldUnlocked(app.p, w, app.store.data.settings.unlockAll);
      const done = completedInWorld(app.p, w);
      const b = h(
        'button',
        {
          class: `tile ${unlocked ? 't-blue' : 'locked'}`,
          type: 'button',
          'data-testid': `world-${w}`,
          'aria-label': `${t(`world.${w}`)}${unlocked ? '' : ` (${t('world.locked')})`}`,
          'aria-disabled': unlocked ? undefined : 'true',
        },
        icon(unlocked ? (WORLD_ICONS[w - 1] ?? 'balloon') : 'lock'),
        h('span', { text: t(`world.${w}`) }),
        h('span', { text: `${done}/${LEVELS_PER_WORLD}` }),
      );
      b.addEventListener('click', () => {
        if (unlocked) app.push(() => levelSelectScreen(app, w));
        else app.toast(t('world.locked'));
      });
      grid.append(b);
    }
  };
  render();
  s.enter = render;
  s.el.append(
    topBar(app, { back: true, coins: true }),
    h('h1', { text: t('menu.adventure') }),
    grid,
  );
  return s;
}

export function levelSelectScreen(app: App, world: number): Screen {
  const s = makeScreen(`levels-${world}`);
  const row = h('div', { class: 'grid' });
  const render = () => {
    row.replaceChildren();
    for (let l = 1; l <= LEVELS_PER_WORLD; l++) {
      const id = levelId(world, l);
      const unlocked = isLevelUnlocked(app.p, id, app.store.data.settings.unlockAll);
      const stars = app.p.stars[id] ?? 0;
      const starRow = h('span', { class: 'row', 'aria-hidden': 'true' });
      for (let i = 0; i < 3; i++)
        starRow.append(icon('star', i < stars ? 'icon mini-star on' : 'icon mini-star'));
      const b = h(
        'button',
        {
          class: `tile ${unlocked ? 't-yellow' : 'locked'}`,
          type: 'button',
          'data-testid': `level-${id}`,
          'aria-label': `${t('common.level')} ${id}, ${stars} ${t('common.stars')}`,
        },
        unlocked ? h('span', { style: 'font-size:34px', text: String(l) }) : icon('lock'),
        starRow,
      );
      b.addEventListener('click', () => {
        if (unlocked) app.play(adventureMode(app, id));
      });
      row.append(b);
    }
  };
  render();
  s.enter = render;
  s.el.append(
    topBar(app, { back: true, coins: true }),
    h('h1', { text: t(`world.${world}`) }),
    row,
  );
  return s;
}
