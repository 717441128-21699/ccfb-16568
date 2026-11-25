/**
 * 靠泊闭环测试：三阶段引航自动驾驶。
 *  approach：驶向泊位外档等待点（码头法线方向、距码头 2 倍船宽的水域）
 *  align：   在等待点把船首向转到与码头平行、控速到 1m/s 级
 *  squeeze： 拖轮横推，低速贴向码头，触发靠泊/碰撞
 */
import { SCENARIOS } from '../src/core/scenarios';
import { getShip } from '../src/core/ships';
import { getPort, buildEnvironment } from '../src/core/ports';
import { Simulator } from '../src/core/engine';
import { scorePilot } from '../src/core/scoring';
import { angleDiff, clamp, rad2deg } from '../src/core/units';

let failures = 0;
const check = (n: boolean, msg: string): void => {
  console.log(`${n ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!n) failures++;
};

for (const sc of SCENARIOS.slice(0, 3)) {
  const ship = getShip(sc.shipId);
  const env = buildEnvironment(getPort(sc.portId), sc);
  const sim = new Simulator(ship, sc, env, { recordInterval: 4 });
  const berth = sc.berth;
  const bcx = (berth.x1 + berth.x2) / 2;
  const bcy = (berth.y1 + berth.y2) / 2;
  const berthAng = Math.atan2(berth.y2 - berth.y1, berth.x2 - berth.x1);
  // 外档等待点：沿码头法线（指向水域）退 2.5 倍船宽
  const waitX = bcx + berth.nx * ship.B * 2.5;
  const waitY = bcy + berth.ny * ship.B * 2.5;

  let phase: 'approach' | 'align' | 'squeeze' = 'approach';
  let steps = 0;
  const maxSteps = 6000;

  while (!sim.finished && steps < maxSteps) {
    const s = sim.state;
    const sog = Math.hypot(s.u, s.v);
    const distWait = Math.hypot(waitX - s.x, waitY - s.y);
    const gap = Math.abs((s.x - berth.x1) * berth.nx + (s.y - berth.y1) * berth.ny);

    if (phase === 'approach') {
      const targetPsi = Math.atan2(waitY - s.y, waitX - s.x);
      const err = angleDiff(targetPsi, s.psi);
      sim.setOrder({ rudderCmd: clamp(-err * 1.8, -ship.deltaMax, ship.deltaMax) });
      sim.setOrder({ telegraph: distWait > 500 ? (sog < 5 ? 3 : 2) : (sog > 2 ? -1 : 1) });
      sim.tugs.forEach((rt) => sim.setTug(rt.def.id, 'idle', 0));
      if (distWait < ship.B * 1.2 && sog < 2.2) phase = 'align';
    } else if (phase === 'align') {
      const alignErr = angleDiff(berthAng, s.psi);
      sim.setOrder({ rudderCmd: clamp(-alignErr * 2.2, -ship.deltaMax, ship.deltaMax) });
      if (sog > 1.2) sim.setOrder({ telegraph: -1 });
      else if (sog < 0.5) sim.setOrder({ telegraph: 1 });
      else sim.setOrder({ telegraph: 0 });
      if (Math.abs(rad2deg(alignErr)) < 8 && sog < 1.3) phase = 'squeeze';
    } else {
      const alignErr = angleDiff(berthAng, s.psi);
      sim.setOrder({ rudderCmd: 0, telegraph: sog > 1.0 ? -2 : 0 });
      const p = 0.5;
      sim.setTug(0, alignErr > 0.05 ? 'pull' : 'push', p);
      sim.setTug(1, 'push', p);
      sim.setTug(2, alignErr < -0.05 ? 'pull' : 'push', p);
    }
    sim.step(2);
    steps++;
    if (steps % 600 === 0) {
      console.log(`  [${sc.id}] ${phase} t=${(sim.time / 60).toFixed(0)}分 wait=${distWait.toFixed(0)} gap=${gap.toFixed(0)} sog=${sog.toFixed(2)} 航向=${rad2deg(s.psi).toFixed(0)}°`);
    }
  }

  const result = scorePilot(sim);
  const endDist = Math.hypot(bcx - sim.state.x, bcy - sim.state.y);
  console.log(`\n--- ${sc.title} ---`);
  check(sim.berthed || sim.collisionCount > 0,
    `靠泊流程触发完成（berthed=${sim.berthed}, 碰撞=${sim.collisionCount}）`);
  check(Number.isFinite(sim.state.x), '终态数值有限');
  check(result.score >= 0 && result.score <= 100, `评分合法 ${result.score}（${result.grade}）`);
  console.log(`  历时 ${(sim.time / 60).toFixed(1)} 分，终态距泊位 ${endDist.toFixed(0)}m，SOG=${Math.hypot(sim.state.u, sim.state.v).toFixed(2)}，` +
    `夹角 ${result.berthAngleDeg.toFixed(1)}°，最大贴靠 ${result.maxApproachSpeed.toFixed(2)}m/s，事件 ${sim.events.length} 条`);
}

console.log(`\n靠泊闭环测试失败数：${failures}`);
if (failures) {
  const g = globalThis as unknown as { process?: { exitCode?: number } };
  if (g.process) g.process.exitCode = 1;
}
