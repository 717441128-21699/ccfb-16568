/**
 * 三个虚构港口与引航任务。
 *
 * 坐标：x 向东（沿航道方向）、y 向北，单位 m。
 * 每个港口由航道折线、港池、码头、水深分区、岸壁、风流与交通船组成。
 * 水深分区按列表从浅到深匹配（先命中浅水多边形优先）。
 */
import type { Scenario } from './engine';
import type { Environment } from './types';
import { pointInPoly, polylineToBanks, type Pt } from './geometry';

export interface PortDef {
  id: string;
  name: string;
  description: string;
  /** 航道中线折线 */
  fairway: Pt[];
  /** 航道半宽 m */
  fairwayHalfWidth: number;
  /** 港池多边形 */
  basin: Pt[];
  /** 水深分区（先列浅水，匹配即返回） */
  depthZones: { depth: number; poly: Pt[] }[];
  /** 默认水深（分区之外） */
  offshoreDepth: number;
  /** 岸壁折线（含航道两侧与码头岸线） */
  bankLines: { pts: Pt[]; waterSide: 'left' | 'right' }[];
  /** 陆地多边形（渲染用） */
  land: Pt[];
}

/* ------------------------------------------------------------------ */
/* 港口一：临澜河港（河口浅水港，航道窄、浅滩多，杂货船主场）             */
/* ------------------------------------------------------------------ */

function linlanPort(): PortDef {
  // 航道沿 +x 方向，中线 y=0，长 2600m
  const fairway: Pt[] = [
    { x: -1400, y: 0 },
    { x: -400, y: 0 },
    { x: 600, y: 60 },
    { x: 1100, y: 120 },
  ];
  const fairwayHalfWidth = 115;
  // 港池：航道末端东南侧的矩形回转池
  const basin: Pt[] = [
    { x: 1000, y: -260 },
    { x: 1900, y: -260 },
    { x: 1900, y: 420 },
    { x: 1000, y: 420 },
  ];
  // 码头：港池北岸（船贴北侧，码头法线朝南指向水域）
  const depthZones = [
    // 港池浅水区 13.2m（散货船吃水 12m，h/T≈1.1，控速减沉是关键）
    { depth: 13.2, poly: basin },
    // 航道乘潮水深 14.5m
    {
      depth: 14.5,
      poly: channelStrip(fairway, fairwayHalfWidth),
    },
  ];
  const land: Pt[] = [
    { x: -1600, y: 120 },
    { x: 2200, y: 120 },
    { x: 2200, y: 900 },
    { x: -1600, y: 900 },
  ];
  const bankLines = [
    // 北岸线（含码头面），沿 +x 走、水域在南侧（右侧）
    { pts: [{ x: -1600, y: 110 }, { x: 1000, y: 110 }, { x: 1900, y: 260 }], waterSide: 'right' as const },
    // 南岸线，沿 +x 走、水域在北侧（左侧）
    { pts: [{ x: -1600, y: -110 }, { x: 1000, y: -260 }, { x: 1900, y: -260 }], waterSide: 'left' as const },
  ];
  return {
    id: 'linlan',
    name: '临澜河港',
    description: '河口浅水港，航道窄、两侧浅滩，h/T 最低约 1.2，浅水效应显著，适合杂货船与小散货。',
    fairway,
    fairwayHalfWidth,
    basin,
    depthZones,
    offshoreDepth: 16,
    bankLines,
    land,
  };
}

/* ------------------------------------------------------------------ */
/* 港口二：东港新港（沿海深水港，集装箱枢纽，有横流与交会船）           */
/* ------------------------------------------------------------------ */

function donggangPort(): PortDef {
  const fairway: Pt[] = [
    { x: -2600, y: 0 },
    { x: -800, y: 0 },
    { x: 400, y: -120 },
    { x: 1400, y: -120 },
  ];
  const fairwayHalfWidth = 160;
  const basin: Pt[] = [
    { x: 1200, y: -700 },
    { x: 2600, y: -700 },
    { x: 2600, y: 300 },
    { x: 1200, y: 300 },
  ];
  const depthZones = [
    { depth: 16.5, poly: basin },
    { depth: 17.5, poly: channelStrip(fairway, fairwayHalfWidth) },
  ];
  const land: Pt[] = [
    { x: 1200, y: 300 },
    { x: 2800, y: 300 },
    { x: 2800, y: 1100 },
    { x: 1000, y: 1100 },
  ];
  const bankLines = [
    {
      pts: [{ x: -2800, y: 170 }, { x: 1200, y: 50 }, { x: 1200, y: 300 }, { x: 2600, y: 300 }],
      waterSide: 'right' as const,
    },
    {
      pts: [{ x: -2800, y: -170 }, { x: 1200, y: -290 }, { x: 1200, y: -700 }, { x: 2600, y: -700 }],
      waterSide: 'left' as const,
    },
  ];
  return {
    id: 'donggang',
    name: '东港新港',
    description: '沿海深水集装箱枢纽，航道横流明显，港池内有交通船交会，岸壁效应强。',
    fairway,
    fairwayHalfWidth,
    basin,
    depthZones,
    offshoreDepth: 22,
    bankLines,
    land,
  };
}

/* ------------------------------------------------------------------ */
/* 港口三：黑石屿油港（开敞式岛港，30 万吨 VLCC 专用，风浪大）          */
/* ------------------------------------------------------------------ */

function heishiPort(): PortDef {
  const fairway: Pt[] = [
    { x: -3600, y: 0 },
    { x: -1200, y: 0 },
    { x: 800, y: 200 },
  ];
  const fairwayHalfWidth = 220;
  const basin: Pt[] = [
    { x: 600, y: -500 },
    { x: 2400, y: -500 },
    { x: 2400, y: 700 },
    { x: 600, y: 700 },
  ];
  const depthZones = [
    { depth: 25, poly: basin },
    { depth: 26, poly: channelStrip(fairway, fairwayHalfWidth) },
  ];
  const land: Pt[] = [
    { x: 2400, y: -800 },
    { x: 3200, y: -800 },
    { x: 3200, y: 1200 },
    { x: 2400, y: 1200 },
  ];
  const bankLines = [
    // 岛式码头（栈桥式），两侧都有岸壁效应，用两条平行短线模拟
    { pts: [{ x: 800, y: 260 }, { x: 2200, y: 260 }], waterSide: 'right' as const },
    { pts: [{ x: 800, y: 140 }, { x: 2200, y: 140 }], waterSide: 'left' as const },
    {
      pts: [{ x: -3800, y: 230 }, { x: 600, y: 430 }, { x: 600, y: 700 }, { x: 2400, y: 700 }],
      waterSide: 'right' as const,
    },
  ];
  return {
    id: 'heishi',
    name: '黑石屿油港',
    description: '开敞式岛港，VLCC 专用泊位，风浪大、冲程长，三艘大马力拖轮协靠。',
    fairway,
    fairwayHalfWidth,
    basin,
    depthZones,
    offshoreDepth: 40,
    bankLines,
    land,
  };
}

/** 沿折线生成等宽航道条带多边形 */
function channelStrip(line: Pt[], halfWidth: number): Pt[] {
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < line.length; i++) {
    const p = line[i];
    const prev = line[Math.max(0, i - 1)];
    const next = line[Math.min(line.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    left.push({ x: p.x + nx * halfWidth, y: p.y + ny * halfWidth });
    right.push({ x: p.x - nx * halfWidth, y: p.y - ny * halfWidth });
  }
  return [...left, ...right.reverse()];
}

export const PORTS: PortDef[] = [linlanPort(), donggangPort(), heishiPort()];

export function getPort(id: string): PortDef {
  const p = PORTS.find((q) => q.id === id);
  if (!p) throw new Error(`未知港口: ${id}`);
  return p;
}

/** 构造环境场（闭包捕获港口数据） */
export function buildEnvironment(port: PortDef, scenario: Scenario): Environment {
  const banks = port.bankLines.flatMap((b) => polylineToBanks(b.pts, b.waterSide));
  const depthAt = (x: number, y: number): number => {
    const p: Pt = { x, y };
    // 从浅到深匹配
    for (const z of port.depthZones) {
      if (pointInPoly(p, z.poly)) return z.depth;
    }
    return port.offshoreDepth;
  };
  return {
    depthAt,
    wind: { speed: scenario.wind.speed, dirFrom: scenario.wind.dirFrom },
    current: { speed: scenario.current.speed, dirTo: scenario.current.dirTo },
    banks,
    traffic: scenario.traffic.map((t) => ({ ...t })),
  };
}
