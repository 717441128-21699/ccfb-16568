/** 物理模型诊断脚本：打印力平衡、特征根、舵力矩符号等中间量 */
import { SHIPS } from '../src/core/ships';
import { shallowFactors } from '../src/core/shallow';
import { hullForce, massMatrix, propellerForce, rudderForce } from '../src/core/mmg';
import { kn2ms } from '../src/core/units';

for (const ship of SHIPS) {
  console.log(`\n===== ${ship.name} (L=${ship.L}, d=${ship.d}) =====`);
  const sf = shallowFactors(ship, 60, 5);
  const M = massMatrix(ship, sf);
  const U = kn2ms(ship.designSpeedKn);
  const hull = hullForce(ship, U, 0, 0, sf);
  const n = ship.aheadRps[4];
  const thrust = propellerForce(ship, U, n, sf);
  console.log(`设计航速 U=${U.toFixed(2)}m/s, n=${n.toFixed(2)}rps`);
  console.log(`直航阻力 R=${(-hull.X / 1000).toFixed(0)}kN, 正车推力 T=${(thrust / 1000).toFixed(0)}kN, T/R=${(thrust / -hull.X).toFixed(2)}`);

  // 舵力矩（小舵角 10°）
  const rud = rudderForce(ship, U, 0, 0, n, 10 * Math.PI / 180, sf);
  console.log(`10°舵: FN=${(rud.FN / 1000).toFixed(0)}kN, Y_R=${(rud.Y / 1000).toFixed(0)}kN, N_R=${(rud.N / 1000).toFixed(0)}kN·m, alpha=${(rud.alphaR * 180 / Math.PI).toFixed(1)}°`);

  // 完整线性化（含 MMG 离心项）：
  //   m22·v̇ + m26·ṙ = Yv·v + (Yr - m11·u)·r
  //   m26·v̇ + m66·ṙ = Nv·v + (Nr - m26·u)·r
  const f = 0.5 * 1025 * ship.L * ship.d;
  const Yv = ship.Yv * f * U;
  const Yr = ship.Yr * f * ship.L * U;
  const Nv = ship.Nv * f * ship.L * U;
  const Nr = ship.Nr * f * ship.L * ship.L * U;
  const C12 = Yr - M.m11 * U;
  const C22 = Nr - M.m26 * U;
  const det = M.m22 * M.m66 - M.m26 * M.m26;
  const a11 = (Yv * M.m66 - M.m26 * Nv) / det;
  const a12 = (C12 * M.m66 - M.m26 * C22) / det;
  const a21 = (M.m22 * Nv - M.m26 * Yv) / det;
  const a22 = (M.m22 * C22 - M.m26 * C12) / det;
  const tr = a11 + a22;
  const detA = a11 * a22 - a12 * a21;
  const disc = tr * tr - 4 * detA;
  if (disc >= 0) {
    const l1 = (-tr + Math.sqrt(disc)) / 2;
    const l2 = (-tr - Math.sqrt(disc)) / 2;
    console.log(`横向特征根 λ1=${l1.toFixed(4)}, λ2=${l2.toFixed(4)} (tr=${tr.toFixed(3)}, det=${detA.toFixed(4)}; 均<0 稳定)`);
  } else {
    const re = -tr / 2;
    const im = Math.sqrt(-disc) / 2;
    console.log(`横向特征根 λ=${re.toFixed(4)}±${im.toFixed(4)}i (实部<0 稳定，振荡收敛)`);
  }
  console.log(`导数: Yv'=${ship.Yv.toFixed(3)}, Nv'=${ship.Nv.toFixed(3)}, Nr'=${ship.Nr.toFixed(3)}, Yr'=${ship.Yr.toFixed(3)}`);
}
