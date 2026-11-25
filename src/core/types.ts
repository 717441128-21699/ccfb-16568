/**
 * 全局类型定义
 *
 * 坐标系约定：
 * - 大地坐标 (x, y)：x 向东、y 向北，方位角 psi 由东轴向北逆时针为正（即数学极角）。
 * - 船体坐标：u 沿船首向（纵荡）、v 指向左舷为正（横荡）、r 逆时针转首为正（艏摇）。
 * - 左舵/右舵：右舵 δ>0，产生向右转首力矩（N>0，在本约定下右舵使船首向右/顺时针？见下）。
 *
 * 注意：在数学极角约定中，逆时针 psi 增大对应船首由东向北。右舵（starboard）使船首
 * 顺时针转，即 r<0。为了让"右舵→右转"在 UI 上符合航海直觉，舵令符号在力模型内部
 * 统一换算，所有符号以自检测试（右舵旋回应向右侧偏转）为准。
 */

/** 大地/船体运动状态 */
export interface HullState {
  /** 大地坐标 x（东向，m） */
  x: number;
  /** 大地坐标 y（北向，m） */
  y: number;
  /** 船首向（rad，数学极角，东=0，逆时针为正） */
  psi: number;
  /** 纵向速度（船体系，沿船首，m/s） */
  u: number;
  /** 横向速度（船体系，左舷为正，m/s） */
  v: number;
  /** 转首角速度（rad/s，逆时针为正） */
  r: number;
  /** 螺旋桨转速（rps，正车为正） */
  rpm: number;
  /** 实际舵角（rad，右舵为正） */
  delta: number;
  /** 当前船体下沉量 squat（m，正值表示下沉） */
  squat: number;
  /** 当前龙骨富余水深 UKC（m） */
  ukc: number;
}

/** 车钟档位：-4 紧急倒车 … 0 停车 … 4 进车全速 */
export type TelegraphLevel = -4 | -3 | -2 | -1 | 0 | 1 | 2 | 3 | 4;

export type TugAction = 'idle' | 'push' | 'pull';

export interface TugOrder {
  id: number;
  action: TugAction;
  /** 0~1 功率比例 */
  power: number;
}

/** 驾驶台操纵指令 */
export interface ControlOrder {
  /** 车钟档位 */
  telegraph: TelegraphLevel;
  /** 指令舵角（rad，右舵为正，限幅在最大舵角内） */
  rudderCmd: number;
  /** 各拖轮口令 */
  tugs: Record<number, TugOrder>;
  /** 是否抛锚（应急制动） */
  anchor: boolean;
}

export interface WindState {
  /** 风速（m/s，相对水面 10m 高度） */
  speed: number;
  /** 风向（rad，风的来向，数学极角） */
  dirFrom: number;
}

export interface CurrentState {
  /** 流速（m/s） */
  speed: number;
  /** 流向（rad，流的去向，数学极角） */
  dirTo: number;
}

/** 环境场 */
export interface Environment {
  /** 该位置水深（m，正浮状态下的静水深） */
  depthAt: (x: number, y: number) => number;
  wind: WindState;
  current: CurrentState;
  /** 岸壁/航道边线列表（用于岸壁效应与渲染） */
  banks: BankSegment[];
  /** 邻近交通船（用于船间效应） */
  traffic: TrafficShip[];
}

/** 岸壁线段（折线的一条边），normal 指向水域一侧 */
export interface BankSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** 水域侧单位法向量 */
  nx: number;
  ny: number;
}

export interface TrafficShip {
  id: string;
  x: number;
  y: number;
  psi: number;
  /** 船长 m */
  L: number;
  /** 船宽 m */
  B: number;
  /** 对地速度 m/s */
  speed: number;
}

/** 仿真事件 */
export interface SimEvent {
  t: number;
  type:
    | 'collision'
    | 'contact'
    | 'grounding'
    | 'channelExit'
    | 'anchored'
    | 'berthed'
    | 'info';
  message: string;
  x: number;
  y: number;
}

/** 航迹采样点 */
export interface TrackPoint {
  t: number;
  x: number;
  y: number;
  psi: number;
  u: number;
  v: number;
  r: number;
  rpm: number;
  delta: number;
  squat: number;
  ukc: number;
  depth: number;
  /** 对地航速 m/s */
  sog: number;
  /** 对地航向 rad */
  cog: number;
}

export const BERTHING_SPEED_LIMIT = 0.15; // m/s
export const FIXED_DT = 0.5; // 物理定步长 s
