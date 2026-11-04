// Settings (behind the parental gate): breath control, sound & display, accessibility, data.
import type { App } from '../../App';
import { DETECTOR } from '../../config';
import type { Features } from '../../audio/features';
import { availableLanguages, t } from '../i18n';
import { button, h } from '../dom';
import { parentalGate } from '../ParentalGate';
import type { Screen } from '../Router';
import type { Settings } from '../../storage/schema';
import { makeScreen, topBar } from './common';
import { micCheckScreen } from './MicCheck';
import { privacyScreen } from './Privacy';
import { avatarEl, profilesScreen } from './Profiles';
import { AVATARS } from '../avatars';
import { totalStars } from '../../game/Progress';

type BoolKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

export function settingsScreen(app: App): Screen {
  const s = makeScreen('settings', 'settings');
  const set = (fn: (st: Settings) => void) => {
    app.store.update((d) => fn(d.settings));
    app.applySettings();
  };
  const row = (label: string, control: HTMLElement) =>
    h('div', { class: 'setting' }, h('span', { text: label }), control);
  const toggle = (key: BoolKey, label: string, gated = false) => {
    const b = button(
      { label: '', cls: 'toggle small', testId: `toggle-${key}`, ariaLabel: label },
      () => {
        const next = !app.store.data.settings[key];
        const apply = () => {
          set((st) => {
            st[key] = next;
          });
          sync();
        };
        // Turning a fallback ON needs the gate again (fallbacks change how the game is played).
        if (gated && next) void parentalGate(s.el).then((ok) => ok && apply());
        else apply();
      },
    );
    const sync = () => {
      const on = app.store.data.settings[key];
      b.setAttribute('aria-pressed', String(on));
      b.textContent = on ? '✓' : '✗';
    };
    sync();
    return row(label, b);
  };
  const slider = (
    label: string,
    min: number,
    max: number,
    step: number,
    get: () => number,
    put: (v: number) => void,
    testId: string,
  ) => {
    const input = h('input', {
      type: 'range',
      min,
      max,
      step,
      value: get(),
      'aria-label': label,
      'data-testid': testId,
    });
    input.addEventListener('input', () => set(() => put(Number(input.value))));
    return row(label, input);
  };
  const select = (
    label: string,
    options: [string, string][],
    get: () => string,
    put: (v: string) => void,
    testId: string,
  ) => {
    const sel = h('select', { 'aria-label': label, 'data-testid': testId });
    for (const [v, text] of options)
      sel.append(h('option', { value: v, text, selected: v === get() }));
    sel.addEventListener('change', () => set(() => put(sel.value)));
    return row(label, sel);
  };

  // Live mic meter.
  const meterFill = h('div');
  const meter = h(
    'div',
    { class: 'progress', 'aria-label': t('settings.meter'), role: 'meter' },
    meterFill,
  );
  const onFrame = (f: Features) => {
    const cal = app.input.detector.getCalibration();
    const v = Math.max(
      0,
      Math.min(1, (f.rmsDb - cal.noiseFloorDb) / Math.max(6, cal.maxBlowDb - cal.noiseFloorDb)),
    );
    meterFill.style.width = `${Math.round(v * 100)}%`;
    meterFill.style.background = app.input.isBlowing ? 'var(--green)' : 'var(--blue)';
  };

  const deviceSlot = h('div', { class: 'setting' });
  const fillDevices = async () => {
    const devices = await app.mic.listDevices();
    if (devices.length <= 1) return;
    const sel = h('select', { 'aria-label': t('settings.device'), 'data-testid': 'device-select' });
    for (const d of devices)
      sel.append(
        h('option', {
          value: d.deviceId,
          text: d.label || d.deviceId.slice(0, 8),
          selected: d.deviceId === app.mic.deviceId,
        }),
      );
    sel.addEventListener('change', () => {
      set((st) => {
        st.deviceId = sel.value;
      });
      void app.startMicForSettings();
    });
    deviceSlot.replaceChildren(h('span', { text: t('settings.device') }), sel);
  };

  const p = app.p;
  let resetStage = 0;
  const resetBtn = button(
    { label: t('settings.reset'), cls: 'small', testId: 'reset-progress' },
    () => {
      if (resetStage === 0) {
        resetStage = 1;
        resetBtn.textContent = t('settings.resetConfirm1');
        return;
      }
      if (resetStage === 1) {
        resetStage = 2;
        resetBtn.textContent = t('settings.resetConfirm2');
        return;
      }
      void parentalGate(s.el).then((ok) => {
        if (!ok) return;
        doReset();
      });
    },
  );
  const doReset = () => {
    app.store.update(() => {
      p.stars = {};
      p.completed = {};
      p.coins = 0;
      p.bestEndless = 0;
      p.minis = { candles: 0, sailboat: 0, bubbles: 0 };
    });
    app.store.flush();
    resetStage = 0;
    resetBtn.textContent = t('settings.reset');
    app.toast('✓');
  };

  const sec = (title: string, ...children: HTMLElement[]) =>
    h('section', { class: 'card' }, h('h2', { text: title }), ...children);
  s.el.append(
    topBar(app, { back: true, title: t('settings.title') }),
    sec(
      t('settings.breath'),
      slider(
        t('settings.sensitivity'),
        DETECTOR.sensitivityMin,
        DETECTOR.sensitivityMax,
        0.1,
        () => app.store.data.settings.sensitivity,
        (v) => (app.store.data.settings.sensitivity = v),
        'sensitivity',
      ),
      row(t('settings.meter'), meter),
      row(
        t('settings.recalibrate'),
        button(
          {
            icon: 'mic',
            label: t('settings.recalibrate'),
            cls: 'blue small',
            testId: 'recalibrate',
          },
          () => app.push(() => micCheckScreen(app, () => app.router.pop(true))),
        ),
      ),
      select(
        t('settings.controlStyle'),
        [
          ['hold', t('settings.hold')],
          ['hop', t('settings.hop')],
        ],
        () => app.store.data.settings.controlStyle,
        (v) => (app.store.data.settings.controlStyle = v === 'hop' ? 'hop' : 'hold'),
        'control-style',
      ),
      deviceSlot,
    ),
    sec(
      t('settings.sound'),
      slider(
        t('settings.music'),
        0,
        1,
        0.05,
        () => app.store.data.settings.musicVolume,
        (v) => (app.store.data.settings.musicVolume = v),
        'music-volume',
      ),
      slider(
        t('settings.sfx'),
        0,
        1,
        0.05,
        () => app.store.data.settings.sfxVolume,
        (v) => (app.store.data.settings.sfxVolume = v),
        'sfx-volume',
      ),
      'vibrate' in navigator ? toggle('vibration', t('settings.vibration')) : h('div'),
      select(
        t('settings.quality'),
        (['auto', 'high', 'low'] as const).map((q) => [q, t(`settings.quality.${q}`)]),
        () => app.store.data.settings.quality,
        (v) => (app.store.data.settings.quality = v === 'high' || v === 'low' ? v : 'auto'),
        'quality',
      ),
      select(
        t('settings.language'),
        availableLanguages().map((l) => [l, l.toUpperCase()]),
        () => app.store.data.settings.language,
        (v) => (app.store.data.settings.language = v),
        'language',
      ),
    ),
    sec(
      t('settings.access'),
      toggle('easyMode', t('settings.easy')),
      toggle('humMode', t('settings.hum'), true),
      toggle('tapMode', t('settings.tap'), true),
      toggle('restBreaks', t('settings.rest')),
      toggle('colorblind', t('settings.colorblind')),
      select(
        t('settings.reduceMotion'),
        (['auto', 'on', 'off'] as const).map((m) => [m, t(`settings.motion.${m}`)]),
        () => app.store.data.settings.reduceMotion,
        (v) => (app.store.data.settings.reduceMotion = v === 'on' || v === 'off' ? v : 'auto'),
        'reduce-motion',
      ),
    ),
    sec(
      t('settings.profile'),
      h('p', {
        class: 'text',
        'data-testid': 'progress-summary',
        text: `${t('settings.progress')}: ★ ${totalStars(p)} · ${Object.keys(p.completed).length}/30 · ${t('endless.best')} ${p.bestEndless} m`,
      }),
      row(
        t('settings.avatar'),
        (() => {
          const b = h(
            'button',
            {
              class: 'avatar-btn',
              type: 'button',
              'data-testid': 'change-avatar',
              'aria-label': t('settings.avatar'),
            },
            avatarEl(p.avatar),
          );
          b.addEventListener('click', () => {
            const i = AVATARS.findIndex((a) => a.id === p.avatar);
            app.store.update(() => {
              p.avatar = AVATARS[(i + 1) % AVATARS.length]?.id ?? 'bear';
            });
            b.replaceChildren(avatarEl(p.avatar));
          });
          return b;
        })(),
      ),
      row(
        t('settings.profiles'),
        button(
          {
            icon: 'person',
            label: t('settings.profiles'),
            cls: 'secondary small',
            testId: 'manage-profiles',
          },
          () => app.router.reset(() => profilesScreen(app), true),
        ),
      ),
      row(
        t('settings.delete'),
        button({ label: t('settings.delete'), cls: 'small', testId: 'delete-profile' }, () => {
          app.store.update((d) => {
            d.profiles = d.profiles.filter((x) => x.id !== p.id);
            d.activeProfileId = null;
            d.daily = Object.fromEntries(Object.entries(d.daily).filter(([k]) => k !== p.id));
          });
          app.store.flush();
          app.toProfiles();
        }),
      ),
      row(t('settings.reset'), resetBtn),
      h('p', { class: 'text', text: t('settings.privacyShort') }),
      row(
        t('settings.privacy'),
        button(
          { label: t('settings.privacy'), cls: 'secondary small', testId: 'open-privacy' },
          () => app.push(() => privacyScreen(app)),
        ),
      ),
    ),
  );
  s.enter = () => {
    app.input.frameListeners.add(onFrame);
    void fillDevices();
  };
  s.exit = () => app.input.frameListeners.delete(onFrame);
  return s;
}
