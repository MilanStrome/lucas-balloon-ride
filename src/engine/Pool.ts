// Fixed-capacity object pool: all objects are allocated up front, none in the hot loop.

export class Pool<T extends { active: boolean }> {
  readonly items: T[];
  private cursor = 0;

  constructor(capacity: number, create: () => T) {
    this.items = Array.from({ length: capacity }, create);
  }

  /** Returns an inactive object marked active, or null when full (the caller just skips). */
  acquire(): T | null {
    const n = this.items.length;
    for (let k = 0; k < n; k++) {
      const i = (this.cursor + k) % n;
      const it = this.items[i];
      if (it && !it.active) {
        it.active = true;
        this.cursor = (i + 1) % n;
        return it;
      }
    }
    return null;
  }

  release(it: T): void {
    it.active = false;
  }

  releaseAll(): void {
    for (const it of this.items) it.active = false;
  }

  get activeCount(): number {
    let c = 0;
    for (const it of this.items) if (it.active) c++;
    return c;
  }

  forEachActive(fn: (it: T) => void): void {
    for (const it of this.items) if (it.active) fn(it);
  }
}
