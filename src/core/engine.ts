/**
 * 仿真引擎：组装 MMG 全部力与外载荷，RK4 定步长积分，
 * 管理车钟-主机、舵机、拖轮的一阶动态，记录航迹与事件。
 */
import type {
  ControlOrder,
  Environment,
  HullState,
  SimEvent,
  TelegraphLevel,
  TrackPoint,
} from './types';
import { FIXED_DT, BERTHING_SPEED_LIMIT } from './types';
import type { ShipParams } from './ships';
import { shallowFactors, type ShallowFactors } from './shallow';
import { hullForce, massMatrix, propellerForce, rudderForce, type MmgForce } from './mmg';
import { bankEffect } from './bank';
import { shipInteraction } from './interaction';
import { relativeWaterVelocity, windForce } from './windcurrent';
import { createTugs, tugForce, updateTug, type TugDef, type TugRuntime } from './tugs';
import { clamp, pointToSegment, wrapAngle } from './units';

export interface BerthDef {
  id: string;
  name: string;
  /** 码头线（靠船面） */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** 码头侧法向量（指向水域） */
  nx: number;
  ny: number;
}

export interface ChannelDef {
  /** 航道边线（左、右），超出即越界 */
  left: { x1: number; y1: number; x2: number; y2: number }[];
  right: { x1: number; y1: number; x2: number; y2: number }[];
}

export interface Scenario {
  id: string;
  title: string;
  brief: string;
  shipId: string;
  start: { x: number; y: number; psi: number; u: number };
  berth: BerthDef;
  channel?: ChannelDef;
  wind: { speed: number; dirFrom: number };
  current: { speed: number; dirTo: number };
  /** 限制时间 s */
  timeLimit: number;
  /** 交通船初始定义（env.traffic 的动态副本） */
  traffic: Environment['traffic'];
  depthPolygons: { depth: number; poly: { x: number; y: number }[] }[];
  banks: Environment['banks'];
}

export interface SimulatorOptions {
  recordInterval?: number;
}

interface Deriv {
  du: number;
  dv: number;
  dr: number;
}

export class Simulator {
  readonly ship: ShipParams;
  readonly scenario: Scenario;
  readonly env: Environment;
  state: HullState;
  order: ControlOrder;
  tugs: TugRuntime[];
  time = 0;
  events: SimEvent[] = [];
  track: TrackPoint[] = [];
  finished = false;
  /** 靠泊判定状态 */
  berthed = false;
  collisionCount = 0;
  groundingCount = 0;
  channelExitCount = 0;
  private recordInterval: number;
  private nextRecord = 0;
  private lastChannelSide: 0 | 1 | -1 = 0;
  /** 每步力分解（供 HUD/分析页显示） */
  forceBreakdown: MmgForce & { wind: MmgForce; bank: MmgForce; tugs: MmgForce } = {
    X: 0, Y: 0, N: 0, wind: { X: 0, Y: 0, N: 0 }, bank: { X: 0, Y: 0, N: 0 }, tugs: { X: 0, Y: 0, N: 0 },
  };
  shallowNow: ShallowFactors;

  constructor(ship: ShipParams, scenario: Scenario, env: Environment, opts: SimulatorOptions = {}) {
    this.ship = ship;
    this.scenario = scenario;
    this.env = env;
    this.recordInterval = opts.recordInterval ?? 2;
    const defs: TugDef[] = createTugs(ship);
    this.tugs = defs.map((def) => ({ def, thrust: 0 }));
    this.order = {
      telegraph: 0,
      rudderCmd: 0,
      tugs: {},
      anchor: false,
    };
    this.state = {
      x: scenario.start.x,
      y: scenario.start.y,
      psi: scenario.start.psi,
      u: scenario.start.u,
      v: 0,
      r: 0,
      rpm: 0,
      delta: 0,
      squat: 0,
      ukc: 0,
    };
    const h = env.depthAt(this.state.x, this.state.y);
    this.shallowNow = shallowFactors(ship, h, scenario.start.u);
    this.recordTrack(true);
  }

  setOrder(patch: Partial<ControlOrder>): void {
    this.order = { ...this.order, ...patch };
  }

  setTug(id: number, action: 'idle' | 'push' | 'pull', power: number): void {
    this.order.tugs = { ...this.order.tugs, [id]: { id, action, power } };
  }

  /** 推进一个定步长 */
  step(dt: number = FIXED_DT): void {
    if (this.finished) return;
    const nStep = Math.max(1, Math.round(dt / FIXED_DT));
    const h = FIXED_DT;
    for (let i = 0; i < nStep; i++) {
      this.substep(h);
      if (this.finished) break;
    }
  }

  private targetRps(level: TelegraphLevel): number {
    const tab = this.ship.aheadRps;
    if (level >= 0) return tab[level];
    // 倒车各档取正车对应档的 0.85 倍
    return -tab[-level] * 0.85;
  }

  private substep(dt: number): void {
    const s = this.state;

    // --- 执行机构动态 ---
    const nTarget = this.targetRps(this.order.telegraph);
    const engineTau = this.order.telegraph === 0 ? 6 : 9; // 主机响应慢
    s.rpm += (nTarget - s.rpm) * (1 - Math.exp(-dt / engineTau));

    const dMax = this.ship.deltaMax;
    const cmd = clamp(this.order.rudderCmd, -dMax, dMax);
    const rate = this.ship.rudderRate * dt;
    if (s.delta < cmd) s.delta = Math.min(cmd, s.delta + rate);
    else if (s.delta > cmd) s.delta = Math.max(cmd, s.delta - rate);

    for (const rt of this.tugs) updateTug(rt, this.order.tugs[rt.def.id], dt);

    // --- 浅水因子（步长冻结） ---
    const depth = this.env.depthAt(s.x, s.y);
    const U0 = Math.hypot(s.u, s.v);
    const sf = shallowFactors(this.ship, depth, U0);
    this.shallowNow = sf;
    s.squat = sf.squat;
    s.ukc = sf.ukc;
    if (sf.grounded) this.handleGrounding(depth);

    // --- RK4 积分速度状态 ---
    const st0 = { u: s.u, v: s.v, r: s.r };
    const k1 = this.accel(st0.u, st0.v, st0.r, sf);
    const k2 = this.accel(
      st0.u + 0.5 * dt * k1.du,
      st0.v + 0.5 * dt * k1.dv,
      st0.r + 0.5 * dt * k1.dr,
      sf,
    );
    const k3 = this.accel(
      st0.u + 0.5 * dt * k2.du,
      st0.v + 0.5 * dt * k2.dv,
      st0.r + 0.5 * dt * k2.dr,
      sf,
    );
    const k4 = this.accel(
      st0.u + dt * k3.du,
      st0.v + dt * k3.dv,
      st0.r + dt * k3.dr,
      sf,
    );
    s.u += (dt / 6) * (k1.du + 2 * k2.du + 2 * k3.du + k4.du);
    s.v += (dt / 6) * (k1.dv + 2 * k2.dv + 2 * k3.dv + k4.dv);
    s.r += (dt / 6) * (k1.dr + 2 * k2.dr + 2 * k3.dr + k4.dr);

    // 触底后强烈减速摩擦
    if (sf.grounded) {
      const friction = Math.exp(-dt * 0.35);
      s.u *= friction;
      s.v *= friction;
      s.r *= friction;
    }
    // 锚泊制动（应急锚，纵向阻力 + 回转阻尼）
    if (this.order.anchor) {
      const anchorK = 1 - Math.exp(-dt * 0.12);
      s.u -= s.u * anchorK;
      s.v -= s.v * anchorK * 0.8;
      s.r -= s.r * anchorK * 0.5;
      if (!this.events.some((e) => e.type === 'anchored')) {
        this.events.push({ t: this.time, type: 'anchored', message: '已抛应急锚', x: s.x, y: s.y });
      }
    }

    // --- 运动学 ---
    const c = Math.cos(s.psi);
    const sn = Math.sin(s.psi);
    s.x += dt * (s.u * c - s.v * sn);
    s.y += dt * (s.u * sn + s.v * c);
    s.psi = wrapAngle(s.psi + s.r * dt);

    this.time += dt;

    // --- 事件检测 ---
    this.detectBerth();
    this.detectChannel();

    // --- 航迹记录 ---
    if (this.time >= this.nextRecord) {
      this.recordTrack();
      this.nextRecord += this.recordInterval;
    }
  }

  /** 给定速度状态求加速度（力组装 + 质量矩阵求逆） */
  private accel(u: number, v: number, r: number, sf: ShallowFactors): Deriv {
    const s = this.state;
    const { uR, vR } = relativeWaterVelocity(u, v, s.psi, this.env, s.x, s.y);

    const hull = hullForce(this.ship, uR, vR, r, sf);
    const XP = propellerForce(this.ship, uR, s.rpm, sf);
    const rud = rudderForce(this.ship, uR, vR, r, s.rpm, s.delta, sf);
    const bank = bankEffect(this.ship, s.x, s.y, s.psi, Math.hypot(uR, vR), this.env);
    const inter = shipInteraction(this.ship, s.x, s.y, s.psi, Math.hypot(uR, vR), this.env);
    const wind = windForce(this.ship, u, v, s.psi, this.env);

    let tugX = 0, tugY = 0, tugN = 0;
    for (const rt of this.tugs) {
      // 船首/船尾拖轮默认横向用力；本游戏全部按横向协靠建模
      const f = tugForce(rt, false);
      tugX += f.X;
      tugY += f.Y;
      tugN += f.N;
    }

    const FX = hull.X + XP + rud.X + wind.X + tugX;
    const FY = hull.Y + rud.Y + wind.Y + bank.Y + inter.Y + tugY;
    const MN = hull.N + rud.N + wind.N + bank.N + inter.N + tugN;

    this.forceBreakdown = {
      X: FX, Y: FY, N: MN,
      wind: { X: wind.X, Y: wind.Y, N: wind.N },
      bank: { X: 0, Y: bank.Y, N: bank.N },
      tugs: { X: tugX, Y: tugY, N: tugN },
    };

    // 解耦前的运动方程（随船坐标系，含离心项）：
    //  m11·(u̇ - v·r) = FX + m22·v·r ... 采用 MMG 标准整理形式：
    const M = massMatrix(this.ship, sf);
    const m = this.ship.mass;
    // (m+mx) u̇ = FX + (m+my) v r + m xG r²
    const du =
      (FX + M.m22 * v * r + m * this.ship.xG * r * r) / M.m11;
    // (m+my) v̇ + m xG ṙ = FY - (m+mx) u r
    // m xG v̇ + (Iz+jz) ṙ = MN - m xG u r
    const rhsV = FY - M.m11 * u * r;
    const rhsR = MN - m * this.ship.xG * u * r;
    const det = M.m22 * M.m66 - M.m26 * M.m26;
    const dv = (rhsV * M.m66 - M.m26 * rhsR) / det;
    const dr = (M.m22 * rhsR - M.m26 * rhsV) / det;
    return { du, dv, dr };
  }

  private handleGrounding(depth: number): void {
    this.groundingCount++;
    if (this.groundingCount <= 3) {
      this.events.push({
        t: this.time,
        type: 'grounding',
        message: `船体触底！水深 ${depth.toFixed(1)}m，吃水 ${this.ship.d.toFixed(1)}m，下沉 ${this.state.squat.toFixed(2)}m`,
        x: this.state.x,
        y: this.state.y,
      });
    }
  }

  private detectBerth(): void {
    const b = this.scenario.berth;
    const s = this.state;
    const q = pointToSegment(s.x, s.y, b.x1, b.y1, b.x2, b.y2);
    // 船中到码头线距离
    const gap = q.dist;
    // 沿码头法向的接近速度（船体系 v 在法向上的投影）
    const c = Math.cos(s.psi);
    const sn = Math.sin(s.psi);
    const vx = s.u * c - s.v * sn;
    const vy = s.u * sn + s.v * c;
    const approach = -(vx * b.nx + vy * b.ny); // 朝向码头为正
    const beam = this.ship.B / 2;

    if (gap < beam + 3) {
      const sog = Math.hypot(s.u, s.v);
      if (approach > BERTHING_SPEED_LIMIT || sog > BERTHING_SPEED_LIMIT * 1.6) {
        this.collisionCount++;
        this.events.push({
          t: this.time,
          type: 'collision',
          message: `撞击码头！法向接近速度 ${approach.toFixed(2)} m/s（限值 ${BERTHING_SPEED_LIMIT} m/s）`,
          x: s.x,
          y: s.y,
        });
        // 弹性反冲
        s.u *= 0.7;
        s.v *= 0.5;
      } else if (!this.berthed) {
        this.berthed = true;
        this.events.push({
          t: this.time,
          type: 'berthed',
          message: '平稳贴上码头，靠泊完成',
          x: s.x,
          y: s.y,
        });
        this.finish();
      }
    }
  }

  private detectChannel(): void {
    const ch = this.scenario.channel;
    if (!ch) return;
    const s = this.state;
    // 用船首点判断是否越过任一边线（简化：检查船中与边线的相对侧）
    const side = this.channelSide();
    if (side !== 0 && side !== this.lastChannelSide && this.lastChannelSide !== 0) {
      this.channelExitCount++;
      this.events.push({
        t: this.time,
        type: 'channelExit',
        message: side === 1 ? '驶出航道左侧边线' : '驶出航道右侧边线',
        x: s.x,
        y: s.y,
      });
    }
    if (side !== 0) this.lastChannelSide = side;
  }

  private channelSide(): 0 | 1 | -1 {
    const ch = this.scenario.channel;
    if (!ch) return 0;
    const s = this.state;
    const check = (segs: { x1: number; y1: number; x2: number; y2: number }[], expectSign: number): boolean => {
      for (const g of segs) {
        const cross = (g.x2 - g.x1) * (s.y - g.y1) - (g.y2 - g.y1) * (s.x - g.x1);
        if (cross * expectSign < 0) return true;
      }
      return false;
    };
    if (check(ch.left, 1)) return 1;
    if (check(ch.right, -1)) return -1;
    return 0;
  }

  private recordTrack(force = false): void {
    const s = this.state;
    if (!force && this.time < this.nextRecord) return;
    const c = Math.cos(s.psi);
    const sn = Math.sin(s.psi);
    const vx = s.u * c - s.v * sn;
    const vy = s.u * sn + s.v * c;
    this.track.push({
      t: this.time,
      x: s.x,
      y: s.y,
      psi: s.psi,
      u: s.u,
      v: s.v,
      r: s.r,
      rpm: s.rpm,
      delta: s.delta,
      squat: s.squat,
      depth: this.env.depthAt(s.x, s.y),
      sog: Math.hypot(vx, vy),
      cog: Math.atan2(vy, vx),
    });
  }

  finish(): void {
    this.finished = true;
    this.recordTrack(true);
  }
}
