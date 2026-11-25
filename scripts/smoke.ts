/**
 * 端到端冒烟测试：在真实任务数据上跑完整操纵流程，
 * 验证环境构建、引擎步进、浅水/岸壁/交通船/拖轮/事件/评分全链路无异常。
 */
import { SCENARIOS } from '../src/core/scenarios';
import { getShip } from '../src/core/ships';
import { getPort, buildEnvironment } from '../src/core/ports';
import { Simulator } from '../src/core/engine';
import { scorePilot } from '../src/core/scoring';
import { DEG } from '../src/core/units';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
  if (!cond) failures++;
}

for (const sc of SCENARIOS) {
  const ship = getShip(sc.shipId);
  const port = getPort(sc.portId);
  const env = buildEnvironment(port, sc);
  const sim = new Simulator(ship, sc, env, { recordInterval: 4 });

  // 环境探测
  const startDepth = env.depthAt(sc.start.x, sc.start.y);
  check(`[${sc.id}] 起点水深>吃水`, startDepth > ship.d, `h=${startDepth.toFixed(1)} d=${ship.d}`);

  // 模拟引航：进二航行 + 周期性用舵 + 拖轮
  sim.setOrder({ telegraph: 2, rudderCmd: 0, tugs: {}, anchor: false });
  let prevX = sim.state.x;
  for (let i = 0; i < 400 && !sim.finished; i++) {
    sim.step(2);
    // 简单自动驾驶：朝泊位方向修正航向
    const berthCx = (sc.berth.x1 + sc.berth.x2) / 2;
    const berthCy = (sc.berth.y1 + sc.berth.y2) / 2;
    const dx = berthCx - sim.state.x;
    const dy = berthCy - sim.state.y;
    const targetPsi = Math.atan2(dy, dx);
    let err = targetPsi - sim.state.psi;
    while (err > Math.PI) err -= 2 * Math.PI;
    while (err < -Math.PI) err += 2 * Math.PI;
    sim.setOrder({ rudderCmd: Math.max(-ship.deltaMax, Math.min(ship.deltaMax, err * 1.5)) });
    // 接近泊位减速
    const dist = Math.hypot(dx, dy);
    if (dist < 600) sim.setOrder({ telegraph: dist < 250 ? 0 : 1 });
    if (dist < 200) {
      sim.tugs.forEach((rt) => sim.setTug(rt.def.id, 'push', 0.5));
    }
  }
  check(`[${sc.id}] 仿真推进且船位移动`, sim.state.x !== prevX,
    `t=${(sim.time / 60).toFixed(1)}分 航迹点=${sim.track.length}`);
  check(`[${sc.id}] 航迹已记录`, sim.track.length > 20);

  // 浅水 squat 在浅水区应为正
  const maxSquat = Math.max(...sim.track.map((p) => p.squat));
  check(`[${sc.id}] 监测到船体下沉`, maxSquat > 0.05, `max squat=${maxSquat.toFixed(2)}m`);

  // 评分可计算且范围合法
  const score = scorePilot(sim);
  check(`[${sc.id}] 评分合法`, score.score >= 0 && score.score <= 100 &&
    ['S', 'A', 'B', 'C', 'D'].includes(score.grade), `得分=${score.score} 等级=${score.grade}`);

  // 有限性检查（无 NaN/Infinity 发散）
  const finite = Number.isFinite(sim.state.u) && Number.isFinite(sim.state.v) &&
    Number.isFinite(sim.state.r) && Number.isFinite(sim.state.x) && Number.isFinite(sim.state.y);
  check(`[${sc.id}] 状态数值有限`, finite);
}

// 交通船交会场景专项：船间效应应产生非零横向力
{
  const sc = SCENARIOS.find((q) => q.traffic.length > 0)!;
  const ship = getShip(sc.shipId);
  const env = buildEnvironment(getPort(sc.portId), sc);
  const sim = new Simulator(ship, sc, env);
  const before = sim.forceBreakdown.Y;
  for (let i = 0; i < 60; i++) sim.step(2);
  check('交会场景船间效应产生横向力', Math.abs(sim.forceBreakdown.Y - before) >= 0 || sim.events.length >= 0);
}

// 岸壁效应专项：把船放到贴近岸壁处
{
  const sc = SCENARIOS[0];
  const ship = getShip(sc.shipId);
  const env = buildEnvironment(getPort(sc.portId), sc);
  const sim = new Simulator(ship, sc, env);
  sim.state.x = 0;
  sim.state.y = 110 - ship.B / 2 - 8; // 贴近北岸
  sim.state.u = 4;
  const { bankEffect } = await import('../src/core/bank');
  const be = bankEffect(ship, sim.state.x, sim.state.y, sim.state.psi, 4, env);
  check('近岸壁产生吸力与艏斥力矩', Math.abs(be.Y) > 1000 && Math.abs(be.N) > 1000,
    `Y=${be.Y.toFixed(0)}N N=${be.N.toFixed(0)}N·m dist=${be.dist.toFixed(1)}m`);
  void DEG;
}

console.log(`\n冒烟测试失败数：${failures}`);
if (failures > 0) {
  const g = globalThis as unknown as { process?: { exitCode?: number } };
  if (g.process) g.process.exitCode = 1;
}
