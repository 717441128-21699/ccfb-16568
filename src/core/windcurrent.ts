/**
 * 风与流载荷。
 *
 * 风：用相对风（真风 - 船速）在船体坐标系的攻角，按 Isherwood 类
 * 回归系数的简化版计算 X/Y 风力与转首力矩，受风面积由船型给出。
 * 流：均匀流（任务可设流向流速），通过相对水速度 uR/vR 进入全部
 * 水动力项；这里另提供流场采样接口，供后续非均匀流扩展。
 */
import type { ShipParams } from './ships';
import type { Environment } from './types';
import { angleDiff, wrapAngle } from './units';

const RHO_AIR = 1.225;

export interface WindForce {
  X: number;
  Y: number;
  N: number;
  /** 相对风舷角 rad（0=顶风，正=左舷来风） */
  angleOfAttack: number;
  /** 相对风速 m/s */
  relSpeed: number;
}

export function windForce(
  ship: ShipParams,
  u: number,
  v: number,
  psi: number,
  env: Environment,
): WindForce {
  const w = env.wind;
  // 风的速度矢量（去向 = 来向 + pi）
  const wTo = w.dirFrom + Math.PI;
  const wx = w.speed * Math.cos(wTo);
  const wy = w.speed * Math.sin(wTo);
  // 船速大地分量
  const sx = u * Math.cos(psi) - v * Math.sin(psi);
  const sy = u * Math.sin(psi) + v * Math.cos(psi);
  // 相对风 = 风 - 船速
  const rwx = wx - sx;
  const rwy = wy - sy;
  const relSpeed = Math.hypot(rwx, rwy);
  if (relSpeed < 0.05) return { X: 0, Y: 0, N: 0, angleOfAttack: 0, relSpeed: 0 };

  // 相对风在船体系的分量
  const c = Math.cos(psi);
  const s = Math.sin(psi);
  const uWind = rwx * c + rwy * s;   // 沿船首
  const vWind = -rwx * s + rwy * c;  // 左舷为正
  // 风舷角：0 顶风；左舷来风为正
  const aoa = Math.atan2(vWind, uWind);

  const q = 0.5 * RHO_AIR * relSpeed * relSpeed;
  const af = Math.abs(Math.sin(aoa));
  const al = Math.abs(Math.cos(aoa));

  // 简化 Isherwood 风格系数（量级回归，随船型受风面积分布）
  const Cx = -(0.75 * al + 0.12 * af) * Math.sign(Math.cos(aoa) || 1);
  const Cy = (0.65 * af + 0.1 * Math.sin(2 * aoa));
  const Cn = -0.12 * Math.sin(2 * aoa) + 0.05 * Math.sin(aoa);

  const X = Cx * q * ship.windAreaFront * (0.6 + 0.4 * al);
  const Y = Cy * q * ship.windAreaSide * 0.28; // 侧面力按等效投影折算
  const N = Cn * q * ship.windAreaSide * ship.windLever;

  return { X, Y, N, angleOfAttack: wrapAngle(aoa), relSpeed };
}

/** 采样流场（大地系速度分量），当前为均匀流 */
export function currentVector(env: Environment, _x: number, _y: number): { cx: number; cy: number } {
  const c = env.current;
  return {
    cx: c.speed * Math.cos(c.dirTo),
    cy: c.speed * Math.sin(c.dirTo),
  };
}

/**
 * 把大地系流速转换到船体系，得到相对水速度。
 * 全部水动力（船体/桨/舵）都必须使用相对水速度。
 */
export function relativeWaterVelocity(
  u: number,
  v: number,
  psi: number,
  env: Environment,
  x: number,
  y: number,
): { uR: number; vR: number } {
  const { cx, cy } = currentVector(env, x, y);
  const cs = Math.cos(psi);
  const sn = Math.sin(psi);
  // 流在船体系分量
  const cu = cx * cs + cy * sn;
  const cv = -cx * sn + cy * cs;
  return { uR: u - cu, vR: v - cv };
}

/** 流压角（船首向与对地航向之差），供 HUD 显示 */
export function leewayAngle(psi: number, u: number, v: number): number {
  return angleDiff(Math.atan2(v, u), 0);
}
