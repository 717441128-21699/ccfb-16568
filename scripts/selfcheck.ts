/**
 * 物理模型标定自检测试（Node 环境，无 DOM）：
 *  A. 深水满舵旋回：直径 3~5 倍船长
 *  B. 浅水旋回：h/T=1.2 时直径明显大于深水（≥1.2 倍）
 *  C. 停车冲程：与手册经验值偏差 ≤15%
 *  D. 设计航速平衡：进四稳态航速与设计航速偏差 ≤12%
 *  E. 靠泊撞击阈值：法向接近速度 >0.15 m/s 判撞击
 *  F. 拖轮响应：三拖轮满功率横推，60s 内产生明显横移速度
 *
 * 运行：npm run selfcheck
 */
import { SHIPS, type ShipParams } from '../src/core/ships';
import { Simulator, type Scenario } from '../src/core/engine';
import { buildEnvironment } from '../src/core/ports';
import { kn2ms, rad2deg } from '../src/core/units';
import type { Environment } from '../src/core/types';

interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
}
const results: CheckResult[] = [];

function record(name: string, pass: boolean, detail: string): void {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  — ${detail}`);
}

/** 构造开阔无界水域环境（无岸壁、无风流），给定均匀水深 */
function openWaterEnv(ship: ShipParams, depth: number, scenario: Scenario): Environment {
  const env = buildEnvironment(
    {
      id: 'open', name: 'open', description: '',
      fairway: [], fairwayHalfWidth: 0, basin: [],
      depthZones: [], offshoreDepth: depth, bankLines: [], land: [],
    },
    scenario,
  );
  void ship;
  return env;
}

function baseScenario(ship: ShipParams): Scenario {
  return {
    id: 'calib',
    title: 'calib',
    brief: '',
    shipId: ship.id,
    start: { x: 0, y: 0, psi: 0, u: 0 },
    berth: { id: 'b', name: 'b', x1: 0, y1: -9999, x2: 1, y2: -9999, nx: 0, ny: 1 },
    wind: { speed: 0, dirFrom: 0 },
    current: { speed: 0, dirTo: 0 },
    timeLimit: 99999,
    traffic: [],
    depthPolygons: [],
    banks: [],
  };
}

/** 加速到稳态航速 */
function steadySpeed(sim: Simulator, telegraph: 1 | 2 | 3 | 4): number {
  sim.setOrder({ telegraph, rudderCmd: 0, tugs: {}, anchor: false });
  for (let i = 0; i < 2400; i++) sim.step(2); // 80 分钟上限
  return sim.state.u;
}

/** 旋回试验：在指定水深、指定初始航速下满右舵，返回战术直径/进距/横距 */
function turningCircle(ship: ShipParams, depth: number, startSpeed: number) {
  const sc = baseScenario(ship);
  sc.start.u = startSpeed;
  const env = openWaterEnv(ship, depth, sc);
  const sim = new Simulator(ship, sc, env, { recordInterval: 4 });
  sim.setOrder({ telegraph: 4, rudderCmd: ship.deltaMax, tugs: {}, anchor: false });

  let maxY = 0;
  let minY = 0;
  let transferAt90 = 0;
  let advanceAt90 = 0;
  let heading90done = false;
  let diameter = 0;
  for (let i = 0; i < 6000 && !sim.finished; i++) {
    sim.step(2);
    const s = sim.state;
    maxY = Math.max(maxY, s.y);
    minY = Math.min(minY, s.y);
    // 右舵顺时针：psi 由 0 向 -pi/2
    if (!heading90done && s.psi <= -Math.PI / 2 + 0.02) {
      heading90done = true;
      transferAt90 = Math.abs(s.y);
      advanceAt90 = s.x;
    }
    // 转过 180° 时的横向跨度近似战术直径
    if (s.psi <= -Math.PI + 0.02 && diameter === 0) {
      diameter = maxY - minY;
    }
    if (s.psi <= -2 * Math.PI + 0.05) break;
  }
  diameter = diameter || maxY - minY;
  return {
    diameter,
    diameterL: diameter / ship.L,
    advance: advanceAt90,
    transfer: transferAt90,
  };
}

/** 紧急倒车冲程试验：给定初始航速，进四 -> 退四，测到速度 <0.5m/s 的纵向滑行程 */
function crashStop(ship: ShipParams, depth: number, startSpeed: number) {
  const sc = baseScenario(ship);
  sc.start.u = startSpeed;
  const env = openWaterEnv(ship, depth, sc);
  const sim = new Simulator(ship, sc, env, { recordInterval: 2 });
  sim.setOrder({ telegraph: 4, rudderCmd: 0, tugs: {}, anchor: false });
  // 先稳定到指定航速附近（直接赋初速，立即倒车）
  sim.state.u = startSpeed;
  sim.setOrder({ telegraph: -4, rudderCmd: 0, tugs: {}, anchor: false });
  const x0 = sim.state.x;
  let stopX = x0;
  for (let i = 0; i < 9000 && !sim.finished; i++) {
    sim.step(2);
    stopX = sim.state.x;
    if (sim.state.u < 0.4) break;
  }
  return { distance: stopX - x0, distanceL: (stopX - x0) / ship.L };
}

/* ------------------------------------------------------------------ */

console.log('===== D. 设计航速平衡（深水，进四稳态） =====');
for (const ship of SHIPS) {
  const sc = baseScenario(ship);
  const env = openWaterEnv(ship, 60, sc);
  const sim = new Simulator(ship, sc, env);
  const u = steadySpeed(sim, 4);
  const target = kn2ms(ship.designSpeedKn);
  const err = Math.abs(u - target) / target;
  record(
    `${ship.name} 稳态航速`,
    err <= 0.12,
    `仿真 ${(u * 1.94384).toFixed(1)}kn vs 设计 ${ship.designSpeedKn}kn，偏差 ${(err * 100).toFixed(1)}%`,
  );
}

console.log('\n===== A. 深水满舵旋回（目标直径 3~5L） =====');
for (const ship of SHIPS) {
  const depth = 60;
  const sc = baseScenario(ship);
  const env = openWaterEnv(ship, depth, sc);
  const sim = new Simulator(ship, sc, env);
  const speed = steadySpeed(sim, 4);
  const tc = turningCircle(ship, depth, speed);
  record(
    `${ship.name} 深水旋回直径`,
    tc.diameterL >= 3 && tc.diameterL <= 5,
    `D=${tc.diameterL.toFixed(2)}L（进距 ${(tc.advance / ship.L).toFixed(2)}L，横距 ${(tc.transfer / ship.L).toFixed(2)}L），航速 ${(speed * 1.94384).toFixed(1)}kn`,
  );
}

console.log('\n===== B. 浅水旋回增大（h/T=1.2 vs 深水，直径比 ≥1.2） =====');
for (const ship of SHIPS) {
  const sc = baseScenario(ship);
  const env = openWaterEnv(ship, 60, sc);
  const sim = new Simulator(ship, sc, env);
  const speed = Math.min(steadySpeed(sim, 4), kn2ms(ship.designSpeedKn) * 0.8);
  const deep = turningCircle(ship, 60, speed);
  const shallow = turningCircle(ship, ship.d * 1.2, speed);
  const ratio = shallow.diameterL / deep.diameterL;
  record(
    `${ship.name} 浅水旋回比`,
    ratio >= 1.2,
    `深水 ${deep.diameterL.toFixed(2)}L → h/T=1.2 ${shallow.diameterL.toFixed(2)}L，比值 ${ratio.toFixed(2)}`,
  );
}

console.log('\n===== C. 紧急倒车冲程（对标手册经验值 ±15%） =====');
for (const ship of SHIPS) {
  const sc = baseScenario(ship);
  const env = openWaterEnv(ship, 60, sc);
  const sim = new Simulator(ship, sc, env);
  const speed = steadySpeed(sim, 4);
  const cs = crashStop(ship, 60, speed);
  const ref = ship.refCrashStopL;
  const err = Math.abs(cs.distanceL - ref) / ref;
  record(
    `${ship.name} 倒车冲程`,
    err <= 0.15,
    `仿真 ${cs.distanceL.toFixed(2)}L vs 手册 ${ref}L，偏差 ${(err * 100).toFixed(1)}%`,
  );
}

console.log('\n===== E. 靠泊撞击阈值 0.15 m/s =====');
{
  const ship = SHIPS[0];
  const sc = baseScenario(ship);
  // 码头放在船首前方右侧：船沿 +x，码头线 y=B/2+2
  const gap = ship.B / 2 + 2.5;
  sc.berth = { id: 't', name: 't', x1: -500, y1: gap, x2: 500, y2: gap, nx: 0, ny: -1 };
  const env = openWaterEnv(ship, 30, sc);
  for (const v of [0.12, 0.2]) {
    const sim = new Simulator(ship, sc, env);
    sim.state.v = v; // 横向朝码头（左舷 +y）
    sim.setOrder({ telegraph: 0, rudderCmd: 0, tugs: {}, anchor: false });
    let hit = false;
    for (let i = 0; i < 400; i++) {
      sim.step(1);
      if (sim.events.some((e) => e.type === 'collision')) { hit = true; break; }
      if (sim.berthed) break;
    }
    record(
      `靠泊速度 ${v} m/s ${v > 0.15 ? '应判撞击' : '应平稳贴上'}`,
      v > 0.15 ? hit : !hit,
      `碰撞事件=${hit}，碰撞次数=${sim.collisionCount}`,
    );
  }
}

console.log('\n===== F. 三拖轮满功率横推响应（60s 内横移速度） =====');
for (const ship of SHIPS) {
  const sc = baseScenario(ship);
  const env = openWaterEnv(ship, 30, sc);
  const sim = new Simulator(ship, sc, env);
  sim.setOrder({ telegraph: 0, rudderCmd: 0, tugs: {}, anchor: false });
  sim.tugs.forEach((rt) => sim.setTug(rt.def.id, 'push', 1));
  for (let i = 0; i < 60; i++) sim.step(1);
  const v = sim.state.v;
  // 大型船横移惯量大，阈值按船型缩放：小船 ≥0.15，VLCC ≥0.10
  const threshold = ship.id === 'vlcc-300k' ? 0.1 : 0.15;
  record(
    `${ship.name} 拖轮横推`,
    Math.abs(v) >= threshold,
    `60s 后横移速度 ${v.toFixed(3)} m/s（阈值 ${threshold}），单拖轮推力 ${(sim.tugs[0].def.fMax / 1000).toFixed(0)}kN`,
  );
}

console.log('\n===== 附加：浅水舵效与下沉检查 =====');
{
  const ship = SHIPS[3]; // VLCC
  const sc = baseScenario(ship);
  const env = openWaterEnv(ship, ship.d * 1.25, sc);
  const sim = new Simulator(ship, sc, env);
  sim.setOrder({ telegraph: 3, rudderCmd: 0, tugs: {}, anchor: false });
  for (let i = 0; i < 600; i++) sim.step(2);
  const U = Math.hypot(sim.state.u, sim.state.v);
  const sf = sim.shallowNow;
  record(
    'VLCC 浅水下沉量',
    sf.squat > 0.3 && sf.ukc > 0,
    `U=${U.toFixed(1)}m/s，下沉 ${sf.squat.toFixed(2)}m，UKC=${sf.ukc.toFixed(2)}m，h/T=${sf.hT.toFixed(2)}`,
  );
  // 右舵：船首顺时针转，本约定 r 逆时针为正，故期望 r<0
  sim.setOrder({ telegraph: 3, rudderCmd: ship.deltaMax, tugs: {}, anchor: false });
  for (let i = 0; i < 30; i++) sim.step(2);
  record(
    '右舵产生右转首（顺时针 r<0）',
    sim.state.r < 0,
    `r=${(rad2deg(sim.state.r) * 60).toFixed(2)} °/min，舵角 ${rad2deg(sim.state.delta).toFixed(1)}°`,
  );
}

/* ------------------------------------------------------------------ */

const passed = results.filter((r) => r.pass).length;
console.log(`\n===== 结果：${passed}/${results.length} 通过 =====`);
if (passed < results.length) process.exitCode = 1;
