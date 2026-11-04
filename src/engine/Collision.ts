// PURE: circle vs rect / circle / convex polygon. Touching (tangent) counts as a hit.

export interface Circle {
  x: number;
  y: number;
  r: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function circleCircle(a: Circle, b: Circle): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const r = a.r + b.r;
  return dx * dx + dy * dy <= r * r;
}

/** Circle vs axis-aligned rect (x,y = min corner). */
export function circleRect(c: Circle, r: Rect): boolean {
  const cx = c.x < r.x ? r.x : c.x > r.x + r.w ? r.x + r.w : c.x;
  const cy = c.y < r.y ? r.y : c.y > r.y + r.h ? r.y + r.h : c.y;
  const dx = c.x - cx;
  const dy = c.y - cy;
  return dx * dx + dy * dy <= c.r * c.r;
}

/** Closest point on a rect to (x, y), written to out. */
export function closestOnRect(x: number, y: number, r: Rect, out: { x: number; y: number }): void {
  out.x = x < r.x ? r.x : x > r.x + r.w ? r.x + r.w : x;
  out.y = y < r.y ? r.y : y > r.y + r.h ? r.y + r.h : y;
}

function pointInPolygon(
  px: number,
  py: number,
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  n: number,
): boolean {
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = xs[i] ?? 0;
    const yi = ys[i] ?? 0;
    const xj = xs[j] ?? 0;
    const yj = ys[j] ?? 0;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  let t = len2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = px - (ax + t * vx);
  const dy = py - (ay + t * vy);
  return dx * dx + dy * dy;
}

/** Circle vs polygon given as parallel x/y arrays of `n` vertices (any simple polygon). */
export function circlePolygon(
  c: Circle,
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  n = xs.length,
): boolean {
  if (n < 3) return false;
  if (pointInPolygon(c.x, c.y, xs, ys, n)) return true;
  const r2 = c.r * c.r;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    if (segDist2(c.x, c.y, xs[j] ?? 0, ys[j] ?? 0, xs[i] ?? 0, ys[i] ?? 0) <= r2) return true;
  }
  return false;
}

/** Regular polygon vertices around (cx, cy), rotated by `rot`, written into xs/ys. */
export function regularPolygon(
  cx: number,
  cy: number,
  r: number,
  sides: number,
  rot: number,
  xs: Float64Array,
  ys: Float64Array,
  jitter?: ArrayLike<number>,
): void {
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    const rr = r * (jitter ? (jitter[i] ?? 1) : 1);
    xs[i] = cx + Math.cos(a) * rr;
    ys[i] = cy + Math.sin(a) * rr;
  }
}
