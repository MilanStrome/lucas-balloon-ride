// Shop: balloon skins and riders for coins earned in play (no real money anywhere).
import type { App } from '../../App';
import { buyItem } from '../../game/Progress';
import { SKINS, type SkinDef } from '../../game/skins';
import type { CharacterDef } from '../../game/Characters';
import { drawBalloon } from '../../render/art/balloon';
import { button, h, icon } from '../dom';
import { t } from '../i18n';
import type { Screen } from '../Router';
import { coinChip, makeScreen, topBar } from './common';

function preview(app: App, skin: SkinDef, character: CharacterDef): HTMLCanvasElement {
  const c = h('canvas', { width: 192, height: 240, 'aria-hidden': 'true' });
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.scale(2, 2);
    drawBalloon(ctx, 48, 52, 30, {
      skin,
      character,
      registry: app.characters,
      pose: 'happy',
      flame: 0.5,
      squash: 0,
      wobble: 0,
      alpha: 1,
      shield: false,
      timeSec: 0,
    });
  }
  return c;
}

export function shopScreen(app: App): Screen {
  const s = makeScreen('shop');
  let tab: 'skins' | 'characters' = 'skins';
  const grid = h('div', { class: 'grid' });
  const coinsSlot = h('div');
  const tabs = h('div', { class: 'row' });
  const render = () => {
    const p = app.p;
    coinsSlot.replaceChildren(coinChip(p.coins));
    tabs.replaceChildren(
      button(
        {
          icon: 'balloon',
          label: t('shop.skins'),
          cls: tab === 'skins' ? 'green' : 'secondary',
          testId: 'shop-tab-skins',
        },
        () => {
          tab = 'skins';
          render();
        },
      ),
      button(
        {
          icon: 'person',
          label: t('shop.characters'),
          cls: tab === 'characters' ? 'green' : 'secondary',
          testId: 'shop-tab-characters',
        },
        () => {
          tab = 'characters';
          render();
        },
      ),
    );
    grid.replaceChildren();
    const items =
      tab === 'skins'
        ? SKINS.filter((sk) => !sk.qrOnly || p.ownedSkins.includes(sk.id)).map((sk) => ({
            id: sk.id,
            label: sk.label,
            price: sk.price,
            skin: sk,
            ch: app.characters.get(p.character),
          }))
        : app.characters.list
            .filter((c) => !c.qrOnly || p.ownedCharacters.includes(c.id))
            .map((c) => ({
              id: c.id,
              label: c.label,
              price: c.price,
              skin: SKINS.find((k) => k.id === p.skin) ?? (SKINS[0] as SkinDef),
              ch: c,
            }));
    for (const it of items) {
      const owned =
        tab === 'skins' ? p.ownedSkins.includes(it.id) : p.ownedCharacters.includes(it.id);
      const inUse = tab === 'skins' ? p.skin === it.id : p.character === it.id;
      const action = inUse
        ? h('span', { class: 'chip', text: t('shop.inUse') })
        : owned
          ? button(
              { icon: 'check', label: t('shop.use'), cls: 'green small', testId: `use-${it.id}` },
              () => {
                app.store.update(() => {
                  if (tab === 'skins') p.skin = it.id;
                  else p.character = it.id;
                });
                render();
              },
            )
          : button(
              {
                icon: 'coin',
                label: `${it.price}`,
                cls: p.coins >= it.price ? 'blue small' : 'secondary small',
                testId: `buy-${it.id}`,
                ariaLabel: `${t('shop.buy')} ${it.label} ${it.price}`,
              },
              () => {
                let r = 'poor';
                app.store.update(() => {
                  r = buyItem(p, tab === 'skins' ? 'skin' : 'character', it.id, it.price);
                });
                if (r === 'bought') app.sfx.play('cheer');
                else app.sfx.play('pop');
                render();
              },
            );
      grid.append(
        h(
          'div',
          { class: 'tile shop-item', 'data-testid': `shop-${it.id}` },
          preview(app, it.skin, it.ch),
          h('span', { text: it.label }),
          action,
        ),
      );
    }
  };
  render();
  s.enter = render;
  s.el.append(
    topBar(app, { back: true }),
    h('div', { class: 'row' }, h('h1', { text: t('shop.title') }), coinsSlot),
    tabs,
    grid,
  );
  void icon;
  return s;
}
