// Profile select; first run (or "new") = pick an avatar. Names are optional.
import type { App } from '../../App';
import { STORAGE } from '../../config';
import { newProfile } from '../../storage/schema';
import { AVATARS, avatarSvg } from '../avatars';
import { button, h } from '../dom';
import { t } from '../i18n';
import type { Screen } from '../Router';
import { makeScreen } from './common';

function avatarEl(id: string, big = false): HTMLElement {
  const el = h('span', { class: big ? 'avatar big' : 'avatar' });
  el.innerHTML = avatarSvg(id);
  return el;
}

export function createProfileScreen(app: App, onCreated: (id: string) => void): Screen {
  const s = makeScreen('profile-create');
  let chosen = AVATARS[0]?.id ?? 'bear';
  const grid = h('div', {
    class: 'avatar-grid',
    role: 'radiogroup',
    'aria-label': t('profiles.pick'),
  });
  const buttons: HTMLButtonElement[] = [];
  for (const a of AVATARS) {
    const b = h(
      'button',
      {
        class: 'avatar-btn',
        type: 'button',
        'aria-pressed': a.id === chosen ? 'true' : 'false',
        'aria-label': a.id,
        'data-testid': `avatar-${a.id}`,
      },
      avatarEl(a.id),
    );
    b.addEventListener('click', () => {
      chosen = a.id;
      for (const o of buttons) o.setAttribute('aria-pressed', o === b ? 'true' : 'false');
    });
    buttons.push(b);
    grid.append(b);
  }
  const name = h('input', {
    type: 'text',
    maxlength: 24,
    placeholder: t('profiles.name'),
    'aria-label': t('profiles.name'),
    autocomplete: 'off',
  });
  let created = false;
  s.el.append(
    h('h1', { text: t('profiles.pick') }),
    grid,
    name,
    button(
      { icon: 'check', label: t('profiles.create'), cls: 'green', testId: 'profile-create' },
      () => {
        if (created) return;
        created = true;
        const id = `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
        app.store.update((d) => {
          if (d.profiles.length >= STORAGE.maxProfiles) return;
          d.profiles.push(newProfile(id, chosen, name.value.trim().slice(0, 24), Date.now()));
        });
        onCreated(id);
      },
    ),
  );
  s.onBack = () => {
    if (app.store.data.profiles.length === 0) return true;
    return false;
  };
  return s;
}

export function profilesScreen(app: App): Screen {
  const profiles = app.store.data.profiles;
  if (profiles.length === 0) return createProfileScreen(app, (id) => app.selectProfile(id));
  const s = makeScreen('profiles');
  const row = h('div', { class: 'row' });
  for (const p of profiles) {
    const b = h(
      'button',
      {
        class: 'tile',
        type: 'button',
        'data-testid': `profile-${p.id}`,
        'aria-label': p.name || p.avatar,
      },
      avatarEl(p.avatar, true),
      h('span', { text: p.name || '' }),
    );
    b.addEventListener('click', () => app.selectProfile(p.id));
    row.append(b);
  }
  if (profiles.length < STORAGE.maxProfiles) {
    row.append(
      button(
        { icon: 'plus', label: t('profiles.new'), cls: 'secondary', testId: 'profile-new' },
        () => app.push(() => createProfileScreen(app, (id) => app.selectProfile(id))),
      ),
    );
  }
  s.el.append(h('h1', { text: t('profiles.title') }), row);
  s.onBack = () => true;
  return s;
}

export { avatarEl };
