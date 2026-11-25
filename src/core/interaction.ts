/**
 * 船间效应（ship-to-ship interaction）：两船交会或追越时的相互吸引与转首干扰。
 *
 * 机理与岸壁效应同源：两船中间水流加速、压力降低，互相吸引；
 * 纵向错位时产生使两船艏艉向外偏转的力矩。
 * 采用基于横向间距 sp（船中距）与纵向错位 ξ 的势流/经验混合形式。
 */
import type { ShipParams } from './ships';
import type { Environment, TrafficShip } from './types';

const RHO = 1025;

export interface InteractionForce {
  Y: number;
  N: number;
}

export function shipInteraction(
  ship: ShipParams,
  x: number,
  y: number,
  psi: number,
  U: number,
  env: Environment,
): InteractionForce {
  let Y = 0;
  let N = 0;
  const c = Math.cos(psi);
  const s = Math.sin(psi);

  for (const t of env.traffic) {
    const f = pairInteraction(ship, x, y, psi, c, s, U, t);
    Y += f.Y;
    N += f.N;
  }
  return { Y, N };
}

function pairInteraction(
  ship: ShipParams,
  x: number,
  y: number,
  psi: number,
  c: number,
  s: number,
  U: number,
  t: TrafficShip,
): InteractionForce {
  const dx = t.x - x;
  const dy = t.y - y;
  // 来船在本船坐标系中的位置
  const xi = dx * c + dy * s;   // 纵向（正=来船在本船前方）
  const eta = -dx * s + dy * c; // 横向（正=来船在本船左舷）
  const sp = Math.abs(eta);
  const meanL = (ship.L + t.L) / 2;
  if (sp > 1.2 * meanL || Math.abs(xi) > 1.6 * meanL) return { Y: 0, N: 0 };

  const sizeFactor = Math.sqrt(t.L * t.B / (ship.L * ship.B));
  const relU = Math.max(U, 1.5);
  const Fscale = 0.5 * RHO * ship.L * ship.d * relU * relU * sizeFactor;

  // 横向吸引：eta 为来船方位，吸力指向来船 → Y 与 eta 同号
  const etaN = sp / meanL;
  const suction = 0.05 * Math.exp(-2.2 * etaN) / (0.3 + etaN);
  const Y = Math.sign(eta || 1) * suction * Fscale;

  // 转首力矩：来船在前方时艏被推开（斥），在后方时艉被吸
  const xiN = xi / meanL;
  const momentShape = -Math.tanh(1.6 * xiN); // 前方 xi>0 → 负号力矩（艏向外）
  const CN = 0.035 * Math.exp(-2.0 * etaN) * momentShape;
  const N = CN * Fscale * ship.L;

  void psi;
  return { Y, N };
}
