/**
 * 引航评分：靠泊操纵质量量化。
 * 满分 100，按碰撞、触底、越界、靠泊姿态、控速与耗时分项扣分。
 */
import type { Simulator } from './engine';
import { BERTHING_SPEED_LIMIT } from './types';
import { angleDiff, rad2deg } from './units';

export interface ScoreBreakdown {
  score: number;
  grade: 'S' | 'A' | 'B' | 'C' | 'D';
  items: { label: string; gained: number; max: number; note: string }[];
  maxApproachSpeed: number;
  berthAngleDeg: number;
  berthOffset: number;
  duration: number;
  collisions: number;
  groundings: number;
  channelExits: number;
}

export function scorePilot(sim: Simulator): ScoreBreakdown {
  const items: ScoreBreakdown['items'] = [];
  const s = sim.state;
  const berth = sim.scenario.berth;

  // 1. 碰撞（30 分）：每次重扣
  const collisionMax = 30;
  const collisionPenalty = Math.min(collisionMax, sim.collisionCount * 12);
  items.push({
    label: '靠泊碰撞控制',
    gained: collisionMax - collisionPenalty,
    max: collisionMax,
    note: sim.collisionCount === 0 ? '无撞击' : `撞击码头 ${sim.collisionCount} 次（限值 ${BERTHING_SPEED_LIMIT} m/s）`,
  });

  // 2. 触底（15 分）
  const groundMax = 15;
  const groundPenalty = Math.min(groundMax, sim.groundingCount * 5);
  items.push({
    label: '浅水富余水深',
    gained: groundMax - groundPenalty,
    max: groundMax,
    note: sim.groundingCount === 0 ? '未触底' : `触底 ${sim.groundingCount} 次`,
  });

  // 3. 航道纪律（10 分）
  const channelMax = 10;
  const channelPenalty = Math.min(channelMax, sim.channelExitCount * 4);
  items.push({
    label: '航道保持',
    gained: channelMax - channelPenalty,
    max: channelMax,
    note: sim.channelExitCount === 0 ? '全程在航道内' : `越界 ${sim.channelExitCount} 次`,
  });

  // 4. 靠泊姿态（20 分）：船首向与码头线夹角、横向偏移
  const berthAngle = Math.atan2(berth.y2 - berth.y1, berth.x2 - berth.x1);
  const angleErr = Math.abs(rad2deg(angleDiff(s.psi, berthAngle)));
  const angleScore = Math.max(0, 20 - angleErr * 1.2);
  items.push({
    label: '靠泊角度',
    gained: Math.round(angleScore),
    max: 20,
    note: `与码头夹角 ${angleErr.toFixed(1)}°（理想 <5°）`,
  });

  // 5. 贴靠速度（15 分）：取靠泊前 30s 最大法向接近速度
  const recent = sim.track.slice(-15);
  let maxApproach = 0;
  const c = Math.cos(s.psi), sn = Math.sin(s.psi);
  for (const p of recent) {
    const vx = p.u * c - p.v * sn;
    const vy = p.u * sn + p.v * c;
    const approach = -(vx * berth.nx + vy * berth.ny);
    if (approach > maxApproach) maxApproach = approach;
  }
  const speedScore = Math.max(0, 15 - Math.max(0, (maxApproach - BERTHING_SPEED_LIMIT) * 60));
  items.push({
    label: '贴靠速度',
    gained: Math.round(speedScore),
    max: 15,
    note: `最大法向速度 ${maxApproach.toFixed(2)} m/s（限值 ${BERTHING_SPEED_LIMIT}）`,
  });

  // 6. 操纵时效（10 分）
  const timeMax = 10;
  const timeRatio = sim.time / sim.scenario.timeLimit;
  const timeScore = Math.max(0, timeMax * (1 - Math.max(0, timeRatio - 0.7) * 2));
  items.push({
    label: '操纵时效',
    gained: Math.round(timeScore),
    max: timeMax,
    note: `用时 ${(sim.time / 60).toFixed(1)} 分钟，限制 ${(sim.scenario.timeLimit / 60).toFixed(0)} 分钟`,
  });

  const score = Math.max(0, Math.round(items.reduce((a, b) => a + b.gained, 0)));
  const grade: ScoreBreakdown['grade'] =
    score >= 95 ? 'S' : score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : 'D';

  return {
    score,
    grade,
    items,
    maxApproachSpeed: maxApproach,
    berthAngleDeg: angleErr,
    berthOffset: 0,
    duration: sim.time,
    collisions: sim.collisionCount,
    groundings: sim.groundingCount,
    channelExits: sim.channelExitCount,
  };
}
