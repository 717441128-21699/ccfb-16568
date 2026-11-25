/**
 * MMG 三自由度操纵运动模型
 *
 * 状态：u（纵荡）、v（横荡，左舷为正）、r（艏摇，逆时针为正）
 * 力分解：X = X_H(船体) + X_P(螺旋桨) + X_R(舵) + 外载荷
 *         Y = Y_H + Y_R + 外载荷
 *         N = N_H + N_R + 外载荷
 *
 * 全部水动力以相对水速度 (uR, vR) 计算，天然包含流的影响。
 * 舵符号约定：右舵 δ>0。右舵使船首向右（顺时针）转，即产生 r<0 的力矩，
 * 因此舵的 Y_R、N_R 与 δ 反号。
 */
import type { ShipParams } from './ships';
import type { ShallowFactors } from './shallow';

const RHO = 1025;

export interface MmgForce {
  X: number;
  Y: number;
  N: number;
}

/** 无量纲化基准量：m'=0.5ρL²d，力基准 0.5ρLdU²，力矩基准 0.5ρL²dU² */
function scales(ship: ShipParams) {
  const L = ship.L;
  const d = ship.d;
  return {
    m: 0.5 * RHO * L * L * d,
    f: 0.5 * RHO * L * d,
  };
}

/* ---------------- 螺旋桨 ---------------- */

export function propellerForce(
  ship: ShipParams,
  uR: number,
  n: number, // rps，正车为正
  shallow: ShallowFactors,
): number {
  const nAbs = Math.abs(n);
  if (nAbs < 1e-6) return 0;
  const uP = uR * (1 - ship.wP); // 伴流处来流
  let KT: number;
  if (n >= 0) {
    const J = uP / (n * ship.DP);
    KT = ship.kT0 * Math.max(0.25, 1 - 0.7 * Math.max(J, 0));
  } else {
    KT = ship.kTAst;
  }
  const T = ship.kT0 * 0 + KT * RHO * nAbs * nAbs * ship.DP ** 4 * Math.sign(n);
  // 推力减额；浅水推进效率随阻力增值折减
  return (1 - ship.tP) * T / Math.sqrt(shallow.kR);
}

/* ---------------- 舵 ---------------- */

export interface RudderForce extends MmgForce {
  alphaR: number;
  FN: number;
}

export function rudderForce(
  ship: ShipParams,
  uR: number,
  vR: number,
  r: number,
  n: number,
  delta: number,
  shallow: ShallowFactors,
): RudderForce {
  const L = ship.L;
  const uP = uR * (1 - ship.wP);

  let uRudder: number;
  if (Math.abs(n) > 0.05) {
    // 螺旋桨尾流加速（MMG 标准式）
    const propJet = Math.sqrt(
      uP * uP +
        (8 * ship.kT0 * n * n * ship.DP ** 4) / (Math.PI * ship.DP ** 2),
    );
    uRudder = ship.gammaR * propJet + (1 - ship.gammaR) * uR;
  } else {
    // 停车淌航：无尾流加速，舵效急剧下降
    uRudder = uR;
  }
  // 舵处横向来流（舵在船尾，含转首诱导速度）
  const vRudder = vR + ship.xRoverL * L * r;
  const betaR = Math.atan2(-vRudder, Math.abs(uRudder) + 0.01);
  const alphaR = delta - betaR;

  // Fujii 法向力系数（含实船试验修正系数 1.2，补偿简化来流模型）
  const fAlpha = (6.13 * ship.lambda) / (ship.lambda + 2.25) * 1.2;
  const CN = fAlpha * Math.sin(alphaR);
  const UR2 = uRudder * uRudder + vRudder * vRudder + 0.02;
  const FN = 0.5 * RHO * ship.AR * UR2 * CN * shallow.kRudder;

  // 右舵 δ>0 → FN>0 → 船首顺时针转。本项目 r 逆时针为正，故 N_R>0。
  //   Y_R = +(1+aH)(1-tR)·FN（右舵横向力向右舷）
  //   N_R = (xR+aH·L)·FN，xR≈-0.5L、aH·L 为正，括号为负 → N_R 为正
  const X = -FN * Math.sin(alphaR) * 0.7; // 舵阻力（诱导阻力部分）
  const Y_R = (1 + ship.aH) * (1 - ship.tR) * FN;
  const xR = ship.xRoverL * L;
  const N_R = (xR + ship.aH * L) * FN;

  return { X, Y: Y_R, N: N_R, alphaR, FN };
}

/* ---------------- 船体水动力 ---------------- */

export function hullForce(
  ship: ShipParams,
  uR: number,
  vR: number,
  r: number,
  shallow: ShallowFactors,
): MmgForce {
  const { f } = scales(ship);
  const L = ship.L;
  const U = Math.max(Math.hypot(uR, vR), 0.2);
  const vP = vR / U;
  const rP = (r * L) / U;

  // 直航阻力（含浅水阻力增值），与纵向运动反向
  const R0 = ship.R0coef * f * uR * uR * shallow.kR;
  const X_R = uR >= 0 ? -R0 : R0;

  const Yp =
    ship.Yv * shallow.kYv * vP +
    ship.Yr * rP +
    ship.Yvvv * vP ** 3 +
    ship.Yvvr * vP * vP * rP +
    ship.Yvrr * vP * rP * rP +
    ship.Yrrr * rP ** 3;

  const Np =
    ship.Nv * shallow.kNv * vP +
    ship.Nr * ship.nrCalib * shallow.kNr * rP +
    ship.Nvvv * vP ** 3 +
    ship.Nvvr * vP * vP * rP +
    ship.Nvrr * vP * rP * rP +
    ship.Nrrr * rP ** 3;

  const Y = Yp * f * U * U;
  const N = Np * f * L * U * U;
  return { X: X_R, Y, N };
}

/* ---------------- 质量矩阵（含浅水附加质量） ---------------- */

export interface MassMatrix {
  m11: number;
  m22: number;
  m26: number;
  m66: number;
}

export function massMatrix(ship: ShipParams, shallow: ShallowFactors): MassMatrix {
  const { m } = scales(ship);
  const L = ship.L;
  const mShip = ship.mass;
  const mx = ship.mx * m * shallow.kMx;
  const my = ship.my * m * shallow.kMy;
  const jz = ship.Jz * m * L * L * shallow.kJz;
  // 船体绕 z 轴转动惯量（经验：0.22~0.28 m L²）
  const Iz = mShip * L * L * 0.058;
  return {
    m11: mShip + mx,
    m22: mShip + my,
    m26: mShip * ship.xG,
    m66: Iz + jz,
  };
}
