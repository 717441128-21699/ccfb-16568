/**
 * 拖轮协靠。
 *
 * 三艘港作拖轮：船首拖轮、船中拖轮、船尾拖轮，各自挂在指定一舷。
 * 口令：顶推（push，拖轮把船推离本舷）、拖拉（pull，拖轮把船拉向本舷）、
 * 停车（idle），功率 0~100%。
 *
 * 实际推力用一阶惯性环节模拟响应延迟（时间常数 3 s，符合 ASDs 拖轮
 * 从口令到满推力的典型响应），推力作用点沿船长分布，可产生横移力与转首力矩。
 * 每艘拖轮支持横向（默认）与纵向两种用力方向。
 */
import type { ShipParams } from './ships';
import type { TugOrder } from './types';
import { clamp } from './units';

export interface TugDef {
  id: number;
  name: string;
  /** 作用点纵向位置（船体系，船中前为正，m） */
  xT: number;
  /** 所在舷：+1 左舷，-1 右舷 */
  side: 1 | -1;
  /** 最大系柱推力 N */
  fMax: number;
}

export interface TugRuntime {
  def: TugDef;
  /** 当前实际推力（带符号，正=push 方向）N */
  thrust: number;
}

const G = 9.81;
export const TUG_TAU = 3.0; // 推力响应时间常数 s

/** 按排水量配拖轮（系柱拉力，吨），VLCC 单船封顶 220t（实船大型 ASDs 可达 200t+） */
export function tugBollardTonnes(ship: ShipParams): number {
  const deltaT = ship.mass / 1000;
  return clamp(20 + 0.0009 * deltaT, 25, 220);
}

export function createTugs(ship: ShipParams): TugDef[] {
  const tonnes = tugBollardTonnes(ship);
  const fMax = tonnes * G * 1000; // 吨力 -> N
  return [
    { id: 0, name: '船首拖轮', xT: 0.42 * ship.L, side: -1, fMax },
    { id: 1, name: '船中拖轮', xT: -0.05 * ship.L, side: 1, fMax },
    { id: 2, name: '船尾拖轮', xT: -0.45 * ship.L, side: -1, fMax },
  ];
}

/** 由口令求目标推力（push 为正、pull 为负） */
export function targetThrust(order: TugOrder | undefined, fMax: number): number {
  if (!order || order.action === 'idle') return 0;
  const p = clamp(order.power, 0, 1);
  return (order.action === 'push' ? 1 : -1) * p * fMax;
}

/** 一阶惯性响应推进一个步长 */
export function updateTug(rt: TugRuntime, order: TugOrder | undefined, dt: number): void {
  const target = targetThrust(order, rt.def.fMax);
  const k = 1 - Math.exp(-dt / TUG_TAU);
  rt.thrust += (target - rt.thrust) * k;
  if (Math.abs(rt.thrust) < 1) rt.thrust = 0;
}

export interface TugForceContribution {
  X: number;
  Y: number;
  N: number;
}

/**
 * 把拖轮推力换算成船体系力与力矩。
 * push（thrust>0）：把船推离拖轮所在舷 → 横向力指向对舷。
 * 纵向模式由 order 标记（沿船首方向，push=向前）。
 */
export function tugForce(rt: TugRuntime, longitudinal: boolean): TugForceContribution {
  const t = rt.thrust;
  if (longitudinal) {
    return { X: t, Y: 0, N: 0 };
  }
  // 横向：拖轮在右舷 side=-1，push 时船向左舷运动 Y>0 → Y = -side * thrust
  const Y = -rt.def.side * t;
  const N = rt.def.xT * Y;
  return { X: 0, Y, N };
}
