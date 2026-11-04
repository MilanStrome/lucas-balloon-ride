// Screen stack with idempotent transitions and keyboard navigation.

export interface Screen {
  /** Stable id; navigating to the screen already on top is a no-op. */
  id: string;
  el: HTMLElement;
  enter?(): void;
  exit?(): void;
  /** Return true if the screen handled Back itself. */
  onBack?(): boolean;
  /** Called every animation frame while on top. */
  tick?(nowMs: number): void;
  /** Gameplay screens are never interrupted by update banners and pause on back. */
  isGameplay?: boolean;
}

export type ScreenFactory = () => Screen;

const TRANSITION_LOCK_MS = 250;

export class Router {
  readonly stack: Screen[] = [];
  private lockedUntil = -Infinity;
  onChange: (top: Screen | null) => void = () => undefined;

  constructor(
    private readonly root: HTMLElement,
    private readonly now: () => number = () => performance.now(),
  ) {
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  get top(): Screen | null {
    return this.stack[this.stack.length - 1] ?? null;
  }

  private locked(force: boolean): boolean {
    if (force) return false;
    return this.now() < this.lockedUntil;
  }

  private lock(): void {
    this.lockedUntil = this.now() + TRANSITION_LOCK_MS;
  }

  /** Push a screen. Ignored during a transition or if the same screen id is already on top. */
  push(factory: ScreenFactory, force = false): boolean {
    if (this.locked(force)) return false;
    const next = factory();
    if (this.top?.id === next.id) return false;
    this.lock();
    const prev = this.top;
    if (prev) {
      prev.exit?.();
      prev.el.remove();
    }
    this.stack.push(next);
    this.mount(next);
    return true;
  }

  /** Replace the top screen. */
  replace(factory: ScreenFactory, force = false): boolean {
    if (this.locked(force)) return false;
    const next = factory();
    if (this.top?.id === next.id) return false;
    this.lock();
    const prev = this.stack.pop();
    if (prev) {
      prev.exit?.();
      prev.el.remove();
    }
    this.stack.push(next);
    this.mount(next);
    return true;
  }

  /** Clear the stack and show one screen. */
  reset(factory: ScreenFactory, force = false): boolean {
    if (this.locked(force)) return false;
    const next = factory();
    if (this.stack.length === 1 && this.top?.id === next.id) return false;
    this.lock();
    while (this.stack.length) {
      const s = this.stack.pop();
      s?.exit?.();
      s?.el.remove();
    }
    this.stack.push(next);
    this.mount(next);
    return true;
  }

  /** Pop the top screen and re-show the one beneath. */
  pop(force = false): boolean {
    if (this.stack.length <= 1 || this.locked(force)) return false;
    this.lock();
    const s = this.stack.pop();
    s?.exit?.();
    s?.el.remove();
    const top = this.top;
    if (top) this.mount(top);
    return true;
  }

  /** In-app back: let the screen handle it, else pop. */
  back(): boolean {
    const top = this.top;
    if (!top) return false;
    if (top.onBack?.()) return true;
    return this.pop();
  }

  private mount(s: Screen): void {
    // Screens with a top bar reserve room for it so it never covers content on short screens.
    if (s.el.querySelector(':scope > .topbar') && !s.el.classList.contains('game'))
      s.el.classList.add('has-topbar');
    this.root.append(s.el);
    s.enter?.();
    this.onChange(s);
    // Focus the first control so laptops can drive menus with the keyboard.
    // (Deferred a frame so it never forces a synchronous layout inside the navigation task.)
    requestAnimationFrame(() => {
      if (this.top !== s || s.el.contains(document.activeElement)) return;
      const first = s.el.querySelector<HTMLElement>(
        '[autofocus], button:not([disabled]), [tabindex="0"]',
      );
      first?.focus({ preventScroll: true });
    });
  }

  tick(nowMs: number): void {
    this.top?.tick?.(nowMs);
  }

  private onKey(e: KeyboardEvent): void {
    const top = this.top;
    if (!top) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      this.back();
      return;
    }
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) return;
    const items = Array.from(
      top.el.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]'),
    ).filter((el) => el.offsetParent !== null);
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLElement);
    const dir = e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 1;
    const next = items[(idx + dir + items.length) % items.length];
    next?.focus();
    e.preventDefault();
  }
}
