/**
 * 浅水效应：水深吃水比 h/T 驱动的水动力修正与船体下沉（squat）。
 *
 * 修正规律（Clarke/Millward 类经验的工程化版本，由 selfcheck 标定试验校准）：
 *  - 附加质量随水深减小显著增大（横向比纵向敏感得多）；
 *  - 横向阻尼 |Yv| 增大、转首阻尼 |Nr| 增大，舵效下降；
 *  - 阻力因回流与压差增大（浅水阻力增值）；
 *  - 旋回阻尼力矩增大 → 旋回圈直径明显变大；
 *  - 船底流速增大产生 Bernoulli 下沉，Barrass 类公式 squat = Cb * U² / (g * UKC_eff)。
 */
import type { ShipParams } from './ships';
import { clamp } from './units';

export interface ShallowFactors {
  /** 水深吃水比 h/T（含下沉后的瞬时值另算） */
  hT: number;
  /** 附加质量乘子（纵 / 横 / 艏摇） */
  kMx: number;
  kMy: number;
  kJz: number;
  /** 横向力导数乘子 */
  kYv: number;
  /** 转首力矩导数乘子 */
  kNv: number;
  kNr: number;
  /** 直航阻力乘子 */
  kR: number;
  /** 舵力乘子（浅水舵效降低） */
  kRudder: number;
  /** 下沉量 m */
  squat: number;
  /** 富余水深 m（静水深 - 吃水 - 下沉） */
  ukc: number;
  /** 是否触底 */
  grounded: boolean;
}

const DEEP_LIMIT = 3; // h/T >= 3 视为深水
const CRITICAL = 1.15; // h/T 接近 1.15 为临界浅水

/**
 * 计算浅水因子。
 * @param h 静水深 m
 * @param U 船底对水速度 m/s
 */
export function shallowFactors(ship: ShipParams, h: number, U: number): ShallowFactors {
  const hT0 = h / ship.d;
  // 先用一次近似 squat 迭代两次
  let squat = 0;
  for (let i = 0; i < 2; i++) {
    const hEff = h - squat;
    const hT = hEff / ship.d;
    if (hT >= DEEP_LIMIT) {
      squat = barrassSquat(ship, U, hEff);
      continue;
    }
    squat = barrassSquat(ship, U, hEff);
  }
  const hEff = h - squat;
  const hT = clamp(hEff / ship.d, 1.01, 8);

  let kMx = 1, kMy = 1, kJz = 1, kYv = 1, kNv = 1, kNr = 1, kR = 1, kRudder = 1;

  if (hT < DEEP_LIMIT) {
    // 0（深水）-> 1（临界）的浅水强度
    const s = clamp((DEEP_LIMIT - hT) / (DEEP_LIMIT - CRITICAL), 0, 1);
    const s2 = s * s;
    kMx = 1 + 0.35 * s2;
    kMy = 1 + 1.35 * s2;        // 横向附加质量对浅水极敏感
    kJz = 1 + 1.05 * s2;
    kYv = 1 + 0.9 * s2;         // 横向阻尼增大
    kNv = 1 + 0.55 * s2;
    kNr = 1 + 0.85 * s2;        // 转首阻尼增大 → 旋回圈变大
    kRudder = 1 - 0.22 * s;     // 舵效降低
    // 浅水阻力增值：临界浅水可增大到深水的 ~1.9 倍
    kR = 1 + 0.9 * s2;
  }

  const ukc = h - ship.d - squat;
  return {
    hT,
    kMx, kMy, kJz,
    kYv, kNv, kNr,
    kR, kRudder,
    squat,
    ukc,
    grounded: ukc <= 0,
  };
}

/**
 * Barrass 类下沉公式：
 *   squat = Cb * U^2 / (g * (h/T - 1) * d) 的工程改写。
 * 宽航道（船宽/航道宽很小）系数取 1.0，窄航道效应由岸壁模块另行体现。
 */
function barrassSquat(ship: ShipParams, U: number, h: number): number {
  const g = 9.81;
  const hT = h / ship.d;
  if (hT <= 1.02) return h - ship.d; // 已贴底
  const denom = (hT - 1) * ship.d;
  const s = (ship.Cb * U * U) / (g * denom) * 1.15;
  return clamp(s, 0, h - ship.d - 0.05);
}
