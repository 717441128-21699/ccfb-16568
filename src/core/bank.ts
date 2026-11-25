/**
 * 岸壁效应（bank effect）。
 *
 * 物理机理：船与岸壁之间的过水断面收窄，一侧水流加速、压力降低，
 * 把船体横向吸向岸壁（吸力）；同时吸力作用点在重心之前（船前体排水量大），
 * 产生把船首推开的力矩（艏斥 / 岸推）。
 *
 * 采用 Norrbin/Li 类经验的工程化形式，按"船中到最近岸壁距离 yB / 船长 L"
 * 无量纲化，吸力量级在 yB≈0.35L 时已明显，yB≈1L 外基本消失。
 */
import type { ShipParams } from './ships';
import type { BankSegment, Environment } from './types';
import { pointToSegment } from './units';

export interface BankEffect {
  /** 船体系横向力（左舷为正）N */
  Y: number;
  /** 转首力矩 N·m */
  N: number;
  /** 最近岸壁距离 m */
  dist: number;
  /** 岸壁位于左舷还是右舷（+1 左舷，-1 右舷，0 无） */
  side: number;
}

const RHO = 1025;

export function bankEffect(
  ship: ShipParams,
  x: number,
  y: number,
  psi: number,
  U: number,
  env: Environment,
): BankEffect {
  let best: { dist: number; nx: number; ny: number } | null = null;
  let bestSeg: BankSegment | null = null;

  for (const seg of env.banks) {
    const q = pointToSegment(x, y, seg.x1, seg.y1, seg.x2, seg.y2);
    if (!best || q.dist < best.dist) {
      best = { dist: q.dist, nx: seg.nx, ny: seg.ny };
      bestSeg = seg;
    }
  }
  if (!best || !bestSeg) return { Y: 0, N: 0, dist: Infinity, side: 0 };

  // 岸壁在船体坐标系中的横向方位：法向量指向水域，即由岸指向船
  const c = Math.cos(psi);
  const s = Math.sin(psi);
  // 船体 y 轴（左舷）大地分量
  const byX = -s;
  const byY = c;
  const sideX = best.nx;
  const sideY = best.ny;
  // side>0：岸在左舷方向；<0：右舷
  const sideSign = sideX * byX + sideY * byY >= 0 ? 1 : -1;

  const eta = best.dist / ship.L;
  if (eta > 1.2) return { Y: 0, N: 0, dist: best.dist, side: sideSign };

  // 吸力系数：随距离缩小快速增大，近壁处平滑限幅
  const g = Math.exp(-2.6 * eta) / (0.25 + eta); // eta=1 -> ~0.061；eta=0.35 -> ~0.86
  const Fscale = 0.5 * RHO * ship.L * ship.d * Math.max(U, 0.5) ** 2;
  const CY = 0.085 * g;
  // 吸力指向岸壁：岸在右舷（sideSign=-1）时 Y 为负
  const Y = -sideSign * CY * Fscale;

  // 艏斥力矩：把船首推离岸壁，符号与吸力横向力相反
  // 力臂约 0.35L（吸力合力作用点在重心之前）
  const CN = 0.06 * g;
  const N = sideSign * CN * Fscale * ship.L * 0.35;

  return { Y, N, dist: best.dist, side: sideSign };
}
