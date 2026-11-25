/** 多边形/折线几何工具 */
import type { BankSegment } from './types';

export interface Pt {
  x: number;
  y: number;
}

/** 射线法点在多边形内 */
export function pointInPoly(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect =
      yi > p.y !== yj > p.y &&
      p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * 折线转岸壁线段。水域侧由 waterSide 指定：
 * 'left' 表示沿折线行进方向水域在左侧（法向量左转 90°）。
 */
export function polylineToBanks(points: Pt[], waterSide: 'left' | 'right'): BankSegment[] {
  const out: BankSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    const len = Math.hypot(dx, dy) || 1;
    const tx = dx / len;
    const ty = dy / len;
    let nx: number, ny: number;
    if (waterSide === 'left') {
      nx = -ty;
      ny = tx;
    } else {
      nx = ty;
      ny = -tx;
    }
    out.push({ x1: points[i].x, y1: points[i].y, x2: points[i + 1].x, y2: points[i + 1].y, nx, ny });
  }
  return out;
}

/** 矩形多边形（中心+长宽+旋转角） */
export function rectPoly(cx: number, cy: number, w: number, h: number, rot = 0): Pt[] {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const local = [
    { x: -w / 2, y: -h / 2 },
    { x: w / 2, y: -h / 2 },
    { x: w / 2, y: h / 2 },
    { x: -w / 2, y: h / 2 },
  ];
  return local.map((p) => ({ x: cx + p.x * c - p.y * s, y: cy + p.x * s + p.y * c }));
}

/** 两点距离 */
export const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

/** 多边形面积（带符号） */
export function polygonArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    a += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
  }
  return a / 2;
}
