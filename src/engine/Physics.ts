// PURE: balloon forces and integration (semi-implicit Euler). World y is altitude (up).
import { PHYSICS } from '../config';

export interface Body {
  y: number;
  vy: number;
}

export interface PhysicsParams {
  gravity: number;
  liftMax: number;
  drag: number;
  vMax: number;
  ceilingY: number;
  ceilingPush: number;
  topY: number;
}

export const DEFAULT_PHYSICS: PhysicsParams = {
  gravity: PHYSICS.gravity,
  liftMax: PHYSICS.liftMax,
  drag: PHYSICS.drag,
  vMax: PHYSICS.vMax,
  ceilingY: PHYSICS.ceilingY,
  ceilingPush: PHYSICS.ceilingPush,
  topY: PHYSICS.worldHeight - PHYSICS.balloonRadius,
};

/** Intensity at which lift exactly cancels gravity (plus extra downward weight). */
export function equilibriumIntensity(p: PhysicsParams, gravityScale = 1, extraDown = 0): number {
  return (p.gravity * gravityScale + extraDown) / p.liftMax;
}

/**
 * One fixed step.
 * @param intensity 0..1 breath intensity
 * @param dt seconds
 * @param gravityScale world/easy-mode gravity multiplier
 * @param extraAccel zone forces (wind up/down, rain weight as negative) in units/s²
 */
export function stepBody(
  b: Body,
  intensity: number,
  dt: number,
  p: PhysicsParams,
  gravityScale = 1,
  extraAccel = 0,
): void {
  const i = intensity < 0 ? 0 : intensity > 1 ? 1 : intensity;
  let a = -p.gravity * gravityScale + i * p.liftMax - p.drag * b.vy + extraAccel;
  // Soft ceiling: a gentle spring pushes the balloon back down, no damage.
  if (b.y > p.ceilingY) a -= p.ceilingPush * ((b.y - p.ceilingY) / (p.topY - p.ceilingY + 1));
  b.vy += a * dt;
  if (b.vy > p.vMax) b.vy = p.vMax;
  else if (b.vy < -p.vMax) b.vy = -p.vMax;
  b.y += b.vy * dt;
  if (b.y > p.topY) {
    b.y = p.topY;
    if (b.vy > 0) b.vy = 0;
  }
}
