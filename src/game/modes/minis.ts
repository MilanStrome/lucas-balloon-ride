// Shared mini-game interface.
export interface MiniGame {
  readonly kind: 'candles' | 'sailboat' | 'bubbles';
  /** dt seconds; intensity 0..1; isBlowing from the detector. Returns SFX cue or null. */
  update(
    dt: number,
    intensity: number,
    isBlowing: boolean,
  ): 'blowout' | 'pop' | 'cheer' | 'chime' | null;
  render(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void;
  readonly done: boolean;
  readonly score: number;
}
