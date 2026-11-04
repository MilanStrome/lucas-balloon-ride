// App: owns services (storage, mic, input, audio out, router) and the high-level flow.
import { InputManager } from './audio/InputManager';
import { MicInput, MicStartError, type MicError } from './audio/MicInput';
import { Music, type TrackId } from './audio/Music';
import { Sfx } from './audio/Sfx';
import { QuickFloor, shouldSuggestRecalibration } from './audio/Calibration';
import type { CalibrationValues } from './audio/BreathDetector';
import { RENDER } from './config';
import { CharacterRegistry } from './game/Characters';
import {
  applyPending,
  readUnlockParam,
  stripUnlockParam,
  type AppliedUnlock,
} from './game/Unlocks';
import type { CourseMode } from './game/modes/types';
import { browserBackend, SaveStore, type StorageBackend } from './storage/Storage';
import type { Profile } from './storage/schema';
import { setLanguage, t } from './ui/i18n';
import { Router, type Screen, type ScreenFactory } from './ui/Router';
import { h } from './ui/dom';
import { splashScreen } from './ui/screens/Splash';
import type { DebugOverlay } from './debug/Overlay';

export interface TestConfig {
  calibration?: CalibrationValues;
  today?: string;
  quickTimers?: boolean;
  partyTurnSec?: number;
}

declare global {
  interface Window {
    __lbrTestConfig?: TestConfig;
  }
}

type Ui = typeof import('./ui/screens/lazy');

export class App {
  private uiModule: Ui | null = null;
  private uiPromise: Promise<Ui> | null = null;

  /** Load the post-splash screens (one chunk, precached by the service worker). */
  loadUi(): Promise<Ui> {
    this.uiPromise ??= import('./ui/screens/lazy').then((m) => (this.uiModule = m));
    return this.uiPromise;
  }

  private get ui(): Ui {
    if (!this.uiModule) throw new Error('UI not loaded yet');
    return this.uiModule;
  }

  readonly root: HTMLElement;
  readonly store: SaveStore;
  readonly mic = new MicInput();
  readonly input: InputManager;
  readonly sfx: Sfx;
  readonly music: Music;
  readonly router: Router;
  readonly characters = new CharacterRegistry();
  readonly applied = new Set<string>();
  readonly debug: boolean;
  readonly isTest = import.meta.env.MODE === 'e2e';
  readonly testConfig: TestConfig =
    (import.meta.env.MODE === 'e2e' && window.__lbrTestConfig) || {};
  overlay: DebugOverlay | null = null;
  micState: 'off' | 'starting' | 'on' | 'error' = 'off';
  micError: MicError | null = null;
  updateReady: (() => void) | null = null;
  qrInvalid = false;
  suggestRecalibrate = false;
  private quickFloor: QuickFloor | null = null;
  private wasMicOn = false;
  private toastEl: HTMLElement | null = null;
  private storageNoticeShown = false;
  /** Average-fps tracker for auto quality. */
  private fpsWindow: number[] = [];
  private lastFrame = -1;
  autoLowQuality = false;

  constructor(root: HTMLElement, backend?: StorageBackend) {
    this.root = root;
    let ls: Storage | undefined;
    try {
      ls = window.localStorage;
    } catch {
      ls = undefined;
    }
    this.store = new SaveStore(backend ?? browserBackend(ls));
    this.input = new InputManager(this.mic);
    this.sfx = new Sfx(() => this.mic.ctx);
    this.music = new Music(() => this.mic.ctx);
    this.router = new Router(root);
    this.debug = new URLSearchParams(location.search).get('debug') === '1';
    this.mic.onLost = () => this.onMicLost();
    this.applySettings();
  }

  // ---------- boot & lifecycle ----------

  async boot(): Promise<void> {
    const qr = readUnlockParam(location.search, this.store.data);
    if (qr.kind !== 'none') {
      if (qr.kind === 'invalid') this.qrInvalid = true;
      else this.store.update(() => undefined);
      history.replaceState(history.state, '', stripUnlockParam(location.href));
    }
    if (this.debug) {
      const { DebugOverlay } = await import('./debug/Overlay');
      this.overlay = new DebugOverlay(this);
    }
    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('blur', () => this.pauseGameplay('blur'));
    window.addEventListener('pagehide', () => this.store.flush());
    window.addEventListener('storage', (e) => this.onStorageEvent(e));
    window.addEventListener('orientationchange', () => this.pauseGameplay('orientation'));
    // Every gesture resumes a suspended AudioContext (iOS Safari).
    const resume = () => this.mic.resume();
    window.addEventListener('pointerdown', resume, true);
    window.addEventListener('keydown', resume, true);
    // Browser back = in-app back; keep a guard entry so back never leaves mid-level.
    history.pushState({ lbr: 1 }, '');
    window.addEventListener('popstate', () => {
      history.pushState({ lbr: 1 }, '');
      this.handleBack();
    });
    this.keyboardFallback();
    this.router.reset(() => splashScreen(this), true);
    requestAnimationFrame((now) => this.frame(now));
  }

  private frame(now: number): void {
    requestAnimationFrame((n) => this.frame(n));
    this.input.update(now);
    if (this.quickFloor) {
      this.quickFloor.feed(this.input.features, now);
      if (this.quickFloor.done) {
        const cal = this.input.detector.getCalibration();
        this.suggestRecalibrate = shouldSuggestRecalibration(cal, this.quickFloor.floor);
        this.quickFloor = null;
      }
    }
    this.music.setDucked(this.input.isBlowing);
    this.music.tick();
    this.trackFps(now);
    this.router.tick(now);
    this.overlay?.update(now);
  }

  private trackFps(now: number): void {
    if (this.lastFrame >= 0 && this.router.top?.isGameplay) {
      const dt = now - this.lastFrame;
      if (dt > 0 && dt < 1000) this.fpsWindow.push(dt);
      const total = this.fpsWindow.reduce((a, b) => a + b, 0);
      if (total > RENDER.lowFpsWindowMs) {
        const fps = (1000 * this.fpsWindow.length) / total;
        if (
          fps < RENDER.lowFpsThreshold &&
          this.store.data.settings.quality === 'auto' &&
          !this.autoLowQuality
        ) {
          this.autoLowQuality = true;
          this.applySettings();
        }
        this.fpsWindow.length = 0;
      }
    }
    this.lastFrame = now;
  }

  /** Effective graphics quality after the auto rule. */
  get quality(): 'high' | 'low' {
    const q = this.store.data.settings.quality;
    if (q === 'auto') return this.autoLowQuality ? 'low' : 'high';
    return q;
  }

  get reduceMotion(): boolean {
    const r = this.store.data.settings.reduceMotion;
    if (r === 'on') return true;
    if (r === 'off') return false;
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }

  applySettings(): void {
    const s = this.store.data.settings;
    setLanguage(s.language);
    document.body.classList.toggle('cb', s.colorblind);
    document.body.classList.toggle('reduce-motion', this.reduceMotion);
    this.sfx.setVolume(s.sfxVolume);
    this.music.setVolume(s.musicVolume);
    this.input.setSensitivity(s.sensitivity);
    this.input.humEnabled = s.humMode;
    this.input.tapEnabled = s.tapMode;
    for (const l of this.settingsListeners) l();
  }

  readonly settingsListeners = new Set<() => void>();

  private onVisibility(): void {
    if (document.hidden) {
      this.pauseGameplay('hidden');
      this.store.flush();
      this.wasMicOn = this.mic.active;
      this.mic.suspend();
    } else if (this.wasMicOn) {
      void this.mic.reacquire().then((ok) => {
        if (!ok) this.onMicLost();
      });
    } else if (this.micState === 'error') {
      // Permission may have been granted from browser settings meanwhile.
      void this.retryMicSilently();
    }
  }

  private onStorageEvent(e: StorageEvent): void {
    if (e.key !== 'lbr.save') return;
    // Last writer wins; reload only when it is safe (not mid-level).
    if (this.router.top?.isGameplay) {
      this.pendingReload = true;
      return;
    }
    this.store.reload();
    this.applySettings();
  }

  pendingReload = false;

  /** Called by screens when gameplay ends, to apply a deferred cross-tab reload. */
  safePoint(): void {
    if (this.pendingReload) {
      this.pendingReload = false;
      this.store.reload();
      this.applySettings();
    }
    this.store.flush();
  }

  readonly pauseListeners = new Set<(why: string) => void>();

  pauseGameplay(why: string): void {
    this.store.flush();
    for (const l of this.pauseListeners) l(why);
  }

  handleBack(): void {
    this.router.back();
  }

  private keyboardFallback(): void {
    window.addEventListener('keydown', (e) => {
      if (e.key === ' ' && this.router.top?.isGameplay) {
        this.input.tapHeld = true;
        e.preventDefault();
      }
      if (this.debug && /^[0-9]$/.test(e.key)) this.input.debugLevel = Number(e.key) / 9;
      if (this.debug && e.key === 'Backspace') this.input.debugLevel = null;
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === ' ') this.input.tapHeld = false;
    });
  }

  // ---------- mic flow ----------

  /** First tap: must create the AudioContext synchronously inside the gesture. */
  onSplashTap(): void {
    try {
      this.mic.ensureContext();
    } catch {
      // No Web Audio: the mic path will report 'unsupported'.
    }
    this.music.play('menu');
    void this.characters.load(import.meta.env.BASE_URL);
    void this.loadUi();
    void this.startMic();
  }

  /** Native hook (Capacitor): request RECORD_AUDIO before getUserMedia. */
  beforeMic: (() => Promise<boolean>) | null = null;

  async startMic(): Promise<void> {
    if (this.micState === 'starting') return;
    this.micState = 'starting';
    try {
      if (this.beforeMic && !(await this.beforeMic()))
        throw new MicStartError('denied', 'RECORD_AUDIO denied');
      await this.mic.start(this.store.data.settings.deviceId);
      this.micState = 'on';
      this.micError = null;
      await this.loadUi();
      this.afterMic();
    } catch (e) {
      await this.loadUi();
      this.micState = 'error';
      this.micError = e instanceof MicStartError ? e.kind : 'other';
      if (this.store.data.settings.tapMode) {
        // A grown-up already enabled tap mode: carry on without the mic.
        this.toProfiles();
        return;
      }
      this.router.reset(() => this.ui.micHelpScreen(this), true);
    }
  }

  /** Switch to the device chosen in Settings and load its calibration. */
  async startMicForSettings(): Promise<void> {
    try {
      await this.mic.start(this.store.data.settings.deviceId);
      this.micState = 'on';
      const cal = this.store.getCalibration(this.mic.deviceId, this.store.data.activeProfileId);
      if (cal) this.input.setCalibration(cal);
      else this.toast(t('check.suggest'));
    } catch {
      this.onMicLost();
    }
  }

  async retryMicSilently(): Promise<void> {
    const state = await MicInput.permissionState();
    if (state === 'granted' || state === 'unknown') await this.startMic();
  }

  private onMicLost(): void {
    this.micState = 'error';
    this.pauseGameplay('micLost');
    if (!this.router.top?.isGameplay) this.showMicLost();
  }

  /** Full-screen "Mic lost, tap to reconnect" (outside gameplay). */
  showMicLost(): void {
    const ov = h(
      'div',
      { class: 'overlay', 'data-testid': 'mic-lost' },
      h('div', { class: 'card' }, h('h2', { text: t('mic.lost') })),
    );
    ov.addEventListener('click', () => {
      this.mic.resume();
      void this.mic.reacquire().then((ok) => {
        if (ok) {
          this.micState = 'on';
          ov.remove();
        }
      });
    });
    this.root.append(ov);
  }

  async reconnectMic(): Promise<boolean> {
    this.mic.resume();
    const ok = await this.mic.reacquire();
    if (ok) this.micState = 'on';
    return ok;
  }

  /** After the mic is live: use a stored calibration for this device, or calibrate. */
  afterMic(): void {
    const cal =
      this.testConfig.calibration ??
      this.store.getCalibration(this.mic.deviceId, this.store.data.activeProfileId);
    if (cal) {
      this.input.setCalibration(cal);
      this.quickFloor = new QuickFloor();
      this.toProfiles();
    } else {
      this.router.reset(() => this.ui.micCheckScreen(this, () => this.toProfiles()), true);
    }
  }

  saveCalibration(cal: CalibrationValues): void {
    this.input.setCalibration(cal);
    this.store.setCalibration(this.mic.deviceId, this.store.data.activeProfileId, cal);
    this.suggestRecalibrate = false;
  }

  // ---------- profiles & navigation ----------

  get profile(): Profile | null {
    return this.store.activeProfile;
  }

  /** Always non-null inside menus (guarded by the flow). */
  get p(): Profile {
    const p = this.store.activeProfile;
    if (!p) throw new Error('no active profile');
    return p;
  }

  toProfiles(): void {
    this.router.reset(() => this.ui.profilesScreen(this), true);
  }

  selectProfile(id: string): void {
    this.store.update((d) => {
      d.activeProfileId = id;
    });
    const devCal = this.store.getCalibration(this.mic.deviceId, id);
    if (devCal && !this.testConfig.calibration) this.input.setCalibration(devCal);
    const unlocks = applyPending(this.store.data, this.p);
    this.store.update(() => undefined);
    this.store.flush();
    this.toMenu();
    if (unlocks.length) this.celebrate(unlocks);
  }

  /** A QR link opened while the app is running (Android App Links / deep link). */
  handleUnlockUrl(search: string): void {
    const r = readUnlockParam(search, this.store.data);
    if (r.kind === 'none') return;
    if (r.kind === 'invalid') {
      this.toast(t('unlock.invalid'), 'qr-invalid');
      return;
    }
    this.store.update(() => undefined);
    const p = this.profile;
    // Apply now if a profile is active and nobody is mid-level; otherwise it stays pending.
    if (p && !this.router.top?.isGameplay && this.uiModule) {
      const unlocks = applyPending(this.store.data, p);
      this.store.flush();
      if (unlocks.length) this.celebrate(unlocks);
    }
  }

  celebrate(unlocks: AppliedUnlock[]): void {
    this.router.push(() => this.ui.unlockScreen(this, unlocks), true);
  }

  toMenu(): void {
    this.music.play('menu');
    this.router.reset(() => this.ui.mainMenuScreen(this), true);
    if (this.store.noticePending && !this.storageNoticeShown) {
      this.storageNoticeShown = true;
      this.store.noticePending = false;
      this.toast(t('menu.storageNotice'));
    } else if (this.store.recoveredFromCorruption) {
      this.store.recoveredFromCorruption = false;
      this.toast(t('menu.restoreNotice'));
    }
    if (this.qrInvalid) {
      this.qrInvalid = false;
      this.toast(t('unlock.invalid'), 'qr-invalid');
    }
  }

  push(f: ScreenFactory): boolean {
    return this.router.push(f);
  }

  play(mode: CourseMode): void {
    this.music.play(mode.music);
    this.router.push(() => this.ui.gameScreen(this, mode));
  }

  playMusic(id: TrackId | null): void {
    this.music.play(id);
  }

  toast(text: string, testId = 'toast'): void {
    this.toastEl?.remove();
    const el = h('div', { class: 'toast', role: 'status', 'data-testid': testId, text });
    this.root.append(el);
    this.toastEl = el;
    setTimeout(() => el.remove(), 4000);
  }

  vibrate(ms: number): void {
    if (this.store.data.settings.vibration && 'vibrate' in navigator) {
      try {
        navigator.vibrate(ms);
      } catch {
        // Not supported: ignore.
      }
    }
  }

  /** Today's local date key (overridable in e2e tests). */
  today(): string {
    if (this.testConfig.today) return this.testConfig.today;
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  get topScreen(): Screen | null {
    return this.router.top;
  }
}
