/**
 * 引航任务想定。每个任务绑定船型与港口，给出起始点、风流、
 * 交通船、时间限制与目标泊位。
 */
import type { Scenario } from './engine';
import { DEG } from './units';
import { getPort } from './ports';

function channelEdges(portId: string) {
  const port = getPort(portId);
  // 由航道条带反推左右边线（取 depthZones 中航道多边形的两半）
  const strip = port.depthZones.find((z) => z.depth !== Math.max(...port.depthZones.map((q) => q.depth)));
  void strip;
  // 直接用 fairway 折线 ±halfWidth 生成
  const fw = port.fairway;
  const hw = port.fairwayHalfWidth;
  const left = [];
  const right = [];
  for (let i = 0; i < fw.length; i++) {
    const p = fw[i];
    const prev = fw[Math.max(0, i - 1)];
    const next = fw[Math.min(fw.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    left.push({ x1: p.x + nx * hw, y1: p.y + ny * hw, x2: 0, y2: 0 });
    right.push({ x1: p.x - nx * hw, y1: p.y - ny * hw, x2: 0, y2: 0 });
  }
  const toSegs = (arr: { x1: number; y1: number }[]) =>
    arr.slice(0, -1).map((p, i) => ({ x1: p.x1, y1: p.y1, x2: arr[i + 1].x1, y2: arr[i + 1].y1 }));
  return { left: toSegs(left), right: toSegs(right) };
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'task-linlan-cargo',
    title: '临澜河港 · 杂货船靠泊',
    brief: '汊河号杂货船乘潮进港，航道窄且浅（h/T≈1.22），注意浅水舵效下降与北岸岸壁吸力，三拖轮协助靠 1 号泊位。',
    shipId: 'cargo-15k',
    portId: 'linlan',
    start: { x: -1200, y: 0, psi: 0, u: 4.6 },
    berth: {
      id: 'linlan-1',
      name: '临澜 1 号泊位',
      x1: 1050, y1: 110, x2: 1850, y2: 110,
      nx: 0, ny: -1,
    },
    channel: channelEdges('linlan'),
    wind: { speed: 6, dirFrom: 40 * DEG },
    current: { speed: 0.8, dirTo: 5 * DEG },
    timeLimit: 1500,
    traffic: [],
    depthPolygons: [],
    banks: [],
  },
  {
    id: 'task-linlan-bulker',
    title: '临澜河港 · 散货船极限吃水',
    brief: '苍岭号散货船吃水 12m，港池水深仅 13.2m（h/T≈1.1）—— 进池后必须控速减沉，速度稍高 squat 增大就会触底。体会浅水下沉与制动距离的矛盾。',
    shipId: 'bulker-50k',
    portId: 'linlan',
    start: { x: -1200, y: 0, psi: 0, u: 4.2 },
    berth: {
      id: 'linlan-2',
      name: '临澜 2 号泊位',
      x1: 1050, y1: 110, x2: 1850, y2: 110,
      nx: 0, ny: -1,
    },
    channel: channelEdges('linlan'),
    wind: { speed: 8, dirFrom: -30 * DEG },
    current: { speed: 1.0, dirTo: 0 },
    timeLimit: 1800,
    traffic: [],
    depthPolygons: [],
    banks: [],
  },
  {
    id: 'task-donggang-container',
    title: '东港新港 · 集装箱船交会进港',
    brief: '云衡号 8000TEU 进港，途中与出港集装箱船交会，港池口门横流 1.2kn，注意船间吸引与流压。',
    shipId: 'container-8k',
    portId: 'donggang',
    start: { x: -2400, y: 0, psi: 0, u: 6.2 },
    berth: {
      id: 'donggang-a3',
      name: '东港 A3 集装箱泊位',
      x1: 1300, y1: 300, x2: 2500, y2: 300,
      nx: 0, ny: -1,
    },
    channel: channelEdges('donggang'),
    wind: { speed: 9, dirFrom: 80 * DEG },
    current: { speed: 0.6, dirTo: 95 * DEG },
    timeLimit: 2100,
    traffic: [
      {
        id: 'outbound-1',
        x: -200, y: -60, psi: Math.PI,
        L: 280, B: 40, speed: 5.5,
      },
    ],
    depthPolygons: [],
    banks: [],
  },
  {
    id: 'task-donggang-bulker',
    title: '东港新港 · 大风散货靠泊',
    brief: '苍岭号在 7 级横风中靠泊，风压把船压向码头，拖轮要顶住风，靠泊角度与速度控制是关键。',
    shipId: 'bulker-50k',
    portId: 'donggang',
    start: { x: -2400, y: 0, psi: 0, u: 4.8 },
    berth: {
      id: 'donggang-b1',
      name: '东港 B1 散货泊位',
      x1: 1300, y1: 300, x2: 2500, y2: 300,
      nx: 0, ny: -1,
    },
    channel: channelEdges('donggang'),
    wind: { speed: 15, dirFrom: 90 * DEG },
    current: { speed: 0.5, dirTo: 80 * DEG },
    timeLimit: 2100,
    traffic: [],
    depthPolygons: [],
    banks: [],
  },
  {
    id: 'task-heishi-vlcc',
    title: '黑石屿油港 · VLCC 大风浪靠泊',
    brief: '鲸海号 30 万吨油轮进岛港，万吨惯性带来超长冲程，岛式码头两侧都有岸壁效应，160t 级三拖轮协靠。',
    shipId: 'vlcc-300k',
    portId: 'heishi',
    start: { x: -3400, y: 0, psi: 0, u: 5.0 },
    berth: {
      id: 'heishi-oil-1',
      name: '黑石屿 1 号油泊位',
      x1: 850, y1: 260, x2: 2150, y2: 260,
      nx: 0, ny: -1,
    },
    channel: channelEdges('heishi'),
    wind: { speed: 12, dirFrom: 60 * DEG },
    current: { speed: 0.7, dirTo: 20 * DEG },
    timeLimit: 3000,
    traffic: [],
    depthPolygons: [],
    banks: [],
  },
];

/** 自由操练场（无时间限制、无评分扣分的标定/练习场景） */
export function practiceScenario(shipId: string, portId: string): Scenario {
  const port = getPort(portId);
  const start = port.fairway[0];
  const next = port.fairway[1];
  const psi = Math.atan2(next.y - start.y, next.x - start.x);
  const basin = port.basin;
  const by = Math.max(...basin.map((p) => p.y));
  const bx1 = basin[0].x + 100;
  const bx2 = basin[2].x - 100;
  return {
    id: `practice-${portId}-${shipId}`,
    title: `自由操练 · ${port.name}`,
    brief: '自由操纵练习：可做旋回圈、冲程、靠泊演练，不评分。',
    shipId,
    portId,
    start: { x: start.x + 200, y: start.y, psi, u: 0 },
    berth: {
      id: 'practice-berth',
      name: '练习泊位',
      x1: bx1, y1: by, x2: bx2, y2: by,
      nx: 0, ny: -1,
    },
    channel: channelEdges(portId),
    wind: { speed: 0, dirFrom: 0 },
    current: { speed: 0, dirTo: 0 },
    timeLimit: 86400,
    traffic: [],
    depthPolygons: [],
    banks: [],
  };
}

export function getScenario(id: string): Scenario {
  const s = SCENARIOS.find((q) => q.id === id);
  if (!s) throw new Error(`未知任务: ${id}`);
  return s;
}
