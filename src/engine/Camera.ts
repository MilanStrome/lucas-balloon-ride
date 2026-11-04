// Camera: fits the fixed 1000-unit world height to the screen; look-ahead is capped for fairness.
import { GAMEPLAY, PHYSICS, RENDER } from '../config';

export interface View {
  /** CSS pixels. */
  cssW: number;
  cssH: number;
  dpr: number;
  /** Screen pixels per world unit (CSS px). */
  scale: number;
  /** Visible world width in units. */
  viewW: number;
  /** Balloon's fixed screen position in world units from the left edge. */
  balloonScreenX: number;
  /** How far ahead of the balloon gameplay objects are shown (capped). */
  lookAhead: number;
  portrait: boolean;
}

export function computeView(cssW: number, cssH: number, devicePixelRatio: number): View {
  const w = Math.max(1, cssW);
  const hgt = Math.max(1, cssH);
  const scale = hgt / PHYSICS.worldHeight;
  const viewW = w / scale;
  const balloonScreenX = Math.min(
    viewW * GAMEPLAY.balloonScreenFraction,
    GAMEPLAY.balloonScreenMax,
  );
  const lookAhead = Math.min(viewW - balloonScreenX, GAMEPLAY.lookAheadMax);
  return {
    cssW: w,
    cssH: hgt,
    dpr: Math.min(RENDER.maxDpr, Math.max(1, devicePixelRatio || 1)),
    scale,
    viewW,
    balloonScreenX,
    lookAhead,
    portrait: hgt > w,
  };
}

/** World x of the left screen edge. */
export function cameraLeft(v: View, balloonX: number): number {
  return balloonX - v.balloonScreenX;
}

/**
 * Visibility of a gameplay object at world x: 1 inside the look-ahead, fading to 0 over the
 * last 150 units. Wider screens never reveal more gameplay than the cap.
 */
export function gameplayAlpha(v: View, balloonX: number, x: number): number {
  const ahead = x - balloonX;
  if (ahead <= v.lookAhead - 150) return 1;
  if (ahead >= v.lookAhead) return 0;
  return (v.lookAhead - ahead) / 150;
}

export function worldToScreenX(v: View, balloonX: number, x: number): number {
  return (x - cameraLeft(v, balloonX)) * v.scale;
}

export function worldToScreenY(v: View, y: number): number {
  return (PHYSICS.worldHeight - y) * v.scale;
}
