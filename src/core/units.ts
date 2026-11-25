/** 单位与角度工具 */

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

export const deg2rad = (d: number): number => d * DEG;
export const rad2deg = (r: number): number => r * RAD;

/** 米/秒 -> 节 */
export const ms2kn = (v: number): number => v / 0.514444;
/** 节 -> 米/秒 */
export const kn2ms = (v: number): number => v * 0.514444;

/** 归一化到 [-pi, pi) */
export function wrapAngle(a: number): number {
  let r = a % (2 * Math.PI);
  if (r >= Math.PI) r -= 2 * Math.PI;
  if (r < -Math.PI) r += 2 * Math.PI;
  return r;
}

/** 航向差 b - a，归一化到 [-pi, pi) */
export function angleDiff(b: number, a: number): number {
  return wrapAngle(b - a);
}

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 点到线段距离，同时返回最近点 */
export function pointToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { dist: number; cx: number; cy: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = clamp(t, 0, 1);
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  const ex = px - cx;
  const ey = py - cy;
  return { dist: Math.hypot(ex, ey), cx, cy };
}
