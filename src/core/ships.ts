/**
 * 船型参数与 MMG 水动力导数
 *
 * 四艘虚构船型（船名为虚构，主尺度取自公开船型资料的量级）：
 *  1. 汊河 15000DWT 多用途杂货船
 *  2. 苍岭 50000DWT 散货船
 *  3. 云衡 8000TEU 集装箱船
 *  4. 鲸海 30 万吨级 VLCC
 *
 * 水动力导数采用 Kijima 类通用回归（由 Cb、B/d、L/B 等无量纲要素估计），
 * 数值风格参考 KVLCC2 / SR108 / Series 60 公开试验数据，再用 selfcheck
 * 标定试验（旋回圈、冲程）做整体校准（calib 乘子）。
 */

export interface ShipParams {
  id: string;
  name: string;
  type: string;
  /** 船长（两柱间长，m） */
  L: number;
  /** 船宽 m */
  B: number;
  /** 型吃水 m */
  d: number;
  /** 方形系数 */
  Cb: number;
  /** 排水体积 m³ */
  vol: number;
  /** 排水量 kg（海水 rho=1025） */
  mass: number;
  /** 重心纵向位置（船中前为正，m），通常略在中前 */
  xG: number;
  /** 舵面积 m² */
  AR: number;
  /** 舵展弦比 */
  lambda: number;
  /** 螺旋桨直径 m */
  DP: number;
  /** 盘面处伴流分数 */
  wP: number;
  /** 推力减额分数 */
  tP: number;
  /** 舵力推力减额类系数 */
  tR: number;
  /** 舵-船体干扰力臂系数（aH*L 为作用点到重心距离） */
  aH: number;
  /** 舵位置系数 xR ≈ -0.5L */
  xRoverL: number;
  /** 螺旋桨相对舵的来流加速系数 */
  gammaR: number;
  /** 直航阻力系数 R0'（无量纲，R0 = R0' * 0.5*rho*L*d*U²） */
  R0coef: number;
  /** 正车推力系数 KT0 */
  kT0: number;
  /** 倒车推力系数（绝对值） */
  kTAst: number;
  /** 附加质量 m_x'（无量纲） */
  mx: number;
  /** 附加质量 m_y'（无量纲） */
  my: number;
  /** 附加转动惯量 J_z'（无量纲） */
  Jz: number;
  /** 船体水动力导数（无量纲，符号随本项目坐标系） */
  Yv: number;
  Yr: number;
  Yvvv: number;
  Yvvr: number;
  Yvrr: number;
  Yrrr: number;
  Nv: number;
  Nr: number;
  /** 单船艏摇阻尼校准乘子（由标定试验反推，使旋回直径落入 3~5L） */
  nrCalib: number;
  Nvvv: number;
  Nvvr: number;
  Nvrr: number;
  Nrrr: number;
  /** 车钟各档对应螺旋桨转速 rps（索引 0..4 为停车->进四；倒车取负） */
  aheadRps: [number, number, number, number, number];
  /** 最大舵角 rad */
  deltaMax: number;
  /** 满舵舵速 rad/s */
  rudderRate: number;
  /** 设计航速（节，用于阻力/推力平衡校验） */
  designSpeedKn: number;
  /** 手册经验值：全速紧急倒车冲程（倍船长） */
  refCrashStopL: number;
  /** 手册经验值：满舵旋回初径（倍船长） */
  refTurningDiameterL: number;
  /** 风阻力系数相关：水线以上正面投影面积 m² */
  windAreaFront: number;
  /** 水线以上侧面投影面积 m² */
  windAreaSide: number;
  /** 上层建筑横向中心到船中距离 m（用于风压力矩） */
  windLever: number;
  /** 渲染用上层建筑高度 m */
  superstructureHeight: number;
  /** 渲染用船体色 */
  hullColor: [number, number, number];
}

const RHO = 1025;

function buildShip(p: ShipParams): ShipParams {
  return p;
}

/**
 * 由主尺度生成一套通用 MMG 导数。
 * 基准量级取自 Kijima(1990) 回归与 KVLCC2 公开数据，
 * 再按方形系数与 B/d 做修正；calib 在各船定义里整体微调。
 */
function genericDerivatives(Cb: number, Bd: number, LB: number, calib = 1) {
  // 横向力：肥大型船（Cb 大）横向阻尼更大
  const Yv = -(0.5 * Math.PI * (1 + 0.35 * Cb)) * calib;
  const Yr = (0.08 - 0.06 * Cb) * calib;
  const Yvvv = -0.32 * (0.6 + Cb) * calib;
  const Yvvr = -0.38 * Cb * calib;
  const Yvrr = 0.18 * (Bd / 3) * calib;
  const Yrrr = 0.04 * (LbFactor(LB)) * calib;

  // 转首力矩。本项目 v 向左舷为正、r 逆时针为正。
  // 航向静稳定要求：左舷横移 v>0 时船首产生逆时针恢复力矩(N>0)，故 Nv>0；
  // 艏摇阻尼 Nr<0。肥大型船 Cb 大时旋回阻尼矩相对减弱（实船旋回圈反而更小），
  // 故 Nr 随 Cb 增大而绝对值减小。符号由 selfcheck 特征根与右舵旋回试验校准。
  const Nv = (0.12 - 0.04 * Cb) * calib;
  const Nr = -(0.085 - 0.045 * Cb) * calib;
  const nrCalib = 1; // 各船定义里覆盖
  const Nvvv = -0.09 * Cb * calib;
  const Nvvr = -0.30 * (0.5 + Cb) * calib;
  const Nvrr = 0.05 * (Bd / 3) * calib;
  const Nrrr = -0.025 * (LbFactor(LB)) * calib;
  return { Yv, Yr, Yvvv, Yvvr, Yvrr, Yrrr, Nv, Nr, nrCalib, Nvvv, Nvvr, Nvrr, Nrrr };
}

function LbFactor(LB: number): number {
  return 6.5 / LB;
}

export function createShip(cfg: ShipParams): ShipParams {
  return buildShip(cfg);
}

/* ------------------------------------------------------------------ */
/* 四艘船                                                              */
/* ------------------------------------------------------------------ */

function cargo15k(): ShipParams {
  const L = 139, B = 21, d = 8.6, Cb = 0.72;
  const vol = L * B * d * Cb; // ≈ 18040 m³
  const mass = vol * RHO;
  const der = genericDerivatives(Cb, B / d, L / B, 1.0);
  const AR = 36;
  return buildShip({
    id: 'cargo-15k',
    name: '汊河号',
    type: '15000DWT 多用途杂货船',
    L, B, d, Cb, vol, mass,
    xG: 1.2,
    AR,
    lambda: 1.6,
    DP: 4.6,
    wP: 0.28,
    tP: 0.2,
    tR: 0.24,
    aH: 0.28,
    xRoverL: -0.5,
    gammaR: 0.31,
    R0coef: 0.011,
    kT0: 0.55,
    kTAst: 0.52,
    mx: 0.045,
    my: 0.28,
    Jz: 0.032,
    ...der,
    nrCalib: 1.0,
    aheadRps: [0, 0.72, 1.08, 1.45, 1.85],
    deltaMax: 35 * Math.PI / 180,
    rudderRate: 2.8 * Math.PI / 180,
    designSpeedKn: 14.5,
    refCrashStopL: 7.5,
    refTurningDiameterL: 3.6,
    windAreaFront: 320,
    windAreaSide: 1500,
    windLever: 8,
    superstructureHeight: 16,
    hullColor: [0.16, 0.28, 0.36],
  });
}

function bulker50k(): ShipParams {
  const L = 190, B = 32, d = 12, Cb = 0.82;
  const vol = L * B * d * Cb;
  const mass = vol * RHO;
  const der = genericDerivatives(Cb, B / d, L / B, 1.02);
  const AR = 69;
  return buildShip({
    id: 'bulker-50k',
    name: '苍岭号',
    type: '50000DWT 散货船',
    L, B, d, Cb, vol, mass,
    xG: 1.8,
    AR,
    lambda: 1.7,
    DP: 6.2,
    wP: 0.32,
    tP: 0.23,
    tR: 0.28,
    aH: 0.3,
    xRoverL: -0.5,
    gammaR: 0.29,
    R0coef: 0.0105,
    kT0: 0.52,
    kTAst: 0.55,
    mx: 0.04,
    my: 0.32,
    Jz: 0.034,
    ...der,
    nrCalib: 1.0,
    aheadRps: [0, 0.55, 0.85, 1.14, 1.44],
    deltaMax: 35 * Math.PI / 180,
    rudderRate: 2.5 * Math.PI / 180,
    designSpeedKn: 14.2,
    refCrashStopL: 8.5,
    refTurningDiameterL: 3.4,
    windAreaFront: 420,
    windAreaSide: 2100,
    windLever: 10,
    superstructureHeight: 18,
    hullColor: [0.2, 0.22, 0.25],
  });
}

function container8k(): ShipParams {
  const L = 333, B = 42.8, d = 13, Cb = 0.66;
  const vol = L * B * d * Cb;
  const mass = vol * RHO;
  const der = genericDerivatives(Cb, B / d, L / B, 0.96);
  const AR = 130;
  return buildShip({
    id: 'container-8k',
    name: '云衡号',
    type: '8000TEU 集装箱船',
    L, B, d, Cb, vol, mass,
    xG: 2.5,
    AR,
    lambda: 1.85,
    DP: 8.6,
    wP: 0.24,
    tP: 0.18,
    tR: 0.2,
    aH: 0.24,
    xRoverL: -0.5,
    gammaR: 0.34,
    R0coef: 0.009,
    kT0: 0.58,
    kTAst: 0.44,
    mx: 0.05,
    my: 0.24,
    Jz: 0.03,
    ...der,
    nrCalib: 1.18,
    aheadRps: [0, 0.55, 0.85, 1.15, 1.45],
    deltaMax: 35 * Math.PI / 180,
    rudderRate: 2.6 * Math.PI / 180,
    designSpeedKn: 24.5,
    refCrashStopL: 9.5,
    refTurningDiameterL: 4.2,
    windAreaFront: 950,
    windAreaSide: 5200,
    windLever: 22,
    superstructureHeight: 34,
    hullColor: [0.1, 0.14, 0.2],
  });
}

function vlcc300k(): ShipParams {
  const L = 320, B = 60, d = 20.5, Cb = 0.83;
  const vol = L * B * d * Cb;
  const mass = vol * RHO;
  const der = genericDerivatives(Cb, B / d, L / B, 1.04);
  const AR = 197;
  return buildShip({
    id: 'vlcc-300k',
    name: '鲸海号',
    type: '300000DWT 超大型油轮',
    L, B, d, Cb, vol, mass,
    xG: 3.4,
    AR,
    lambda: 1.55,
    DP: 9.8,
    wP: 0.35,
    tP: 0.26,
    tR: 0.3,
    aH: 0.32,
    xRoverL: -0.5,
    gammaR: 0.27,
    R0coef: 0.010,
    kT0: 0.5,
    kTAst: 0.48,
    mx: 0.035,
    my: 0.34,
    Jz: 0.036,
    ...der,
    nrCalib: 0.52,
    aheadRps: [0, 0.42, 0.66, 0.88, 1.08],
    deltaMax: 35 * Math.PI / 180,
    rudderRate: 2.3 * Math.PI / 180,
    designSpeedKn: 15.8,
    refCrashStopL: 11,
    refTurningDiameterL: 3.3,
    windAreaFront: 780,
    windAreaSide: 3600,
    windLever: 12,
    superstructureHeight: 24,
    hullColor: [0.18, 0.12, 0.1],
  });
}

export const SHIPS: ShipParams[] = [cargo15k(), bulker50k(), container8k(), vlcc300k()];

export function getShip(id: string): ShipParams {
  const s = SHIPS.find((q) => q.id === id);
  if (!s) throw new Error(`未知船型: ${id}`);
  return s;
}
