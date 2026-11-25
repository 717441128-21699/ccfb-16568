/**
 * 程序化网格建造（统一 Z-up 坐标系）：
 * 顶点 (x, y, z)：x 东、y 北、z 天（高度）。
 * 船体站线放样、长方体、多边形棱柱、水面网格、灯浮标。
 * 全部输出位置+法线交错顶点与索引，供 gl.ts 上传。
 */
import { createMesh, type Mesh } from './gl';
import type { Pt } from '../core/geometry';

interface Builder {
  v: number[];
  idx: number[];
}

function newBuilder(): Builder {
  return { v: [], idx: [] };
}

function pushVert(b: Builder, x: number, y: number, z: number, nx: number, ny: number, nz: number): number {
  const i = b.v.length / 6;
  b.v.push(x, y, z, nx, ny, nz);
  return i;
}

function pushQuad(b: Builder, a: number[], btm: number[], c: number[], d: number[], n: number[]): void {
  const base = b.v.length / 6;
  [a, btm, c, d].forEach((p) => pushVert(b, p[0], p[1], p[2], n[0], n[1], n[2]));
  b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/**
 * 长方体（中心在原点）。
 * @param sx x 方向尺寸（船长方向）
 * @param sy y 方向尺寸（船宽/横向）
 * @param sz z 方向尺寸（竖直高度）
 */
export function boxMesh(gl: WebGL2RenderingContext, sx: number, sy: number, sz: number): Mesh {
  const b = newBuilder();
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  // 顶面 +z、底面 -z、四个侧面
  pushQuad(b, [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz], [0, 0, 1]);
  pushQuad(b, [hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz], [0, 0, -1]);
  pushQuad(b, [-hx, hy, -hz], [hx, hy, -hz], [hx, hy, hz], [-hx, hy, hz], [0, 1, 0]);
  pushQuad(b, [hx, -hy, -hz], [-hx, -hy, -hz], [-hx, -hy, hz], [hx, -hy, hz], [0, -1, 0]);
  pushQuad(b, [hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [1, 0, 0]);
  pushQuad(b, [-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-1, 0, 0]);
  return createMesh(gl, new Float32Array(b.v), new Uint32Array(b.idx));
}

/**
 * 船体站线放样（Z-up）。
 * 船体系：x 沿船长（船首 +x）、y 左舷为正（横向）、z 竖直向上，
 * 龙骨在 -d，甲板在 deckZ。
 */
export function hullMesh(
  gl: WebGL2RenderingContext,
  L: number,
  B: number,
  d: number,
  depth: number,
): Mesh {
  const b = newBuilder();
  const stations = 14;
  const ring = 10;
  const halfB = B / 2;
  const deckZ = depth * 0.35;

  const xs: number[] = [];
  const widths: number[] = [];
  for (let i = 0; i <= stations; i++) {
    const t = i / stations;
    const x = (t - 0.5) * L;
    let wf: number;
    if (t < 0.12) wf = 0.25 + 0.75 * (t / 0.12);
    else if (t > 0.88) wf = 0.25 + 0.75 * ((1 - t) / 0.12);
    else wf = 1;
    wf = Math.max(0.08, Math.sin(wf * Math.PI * 0.5));
    xs.push(x);
    widths.push(halfB * wf);
  }

  // 外壳环：q 从左舷(-1)绕过船底到右舷(+1)，z 为高度
  for (let i = 0; i <= stations; i++) {
    const w = widths[i];
    for (let j = 0; j <= ring; j++) {
      const q = -1 + (2 * j) / ring;
      const absQ = Math.abs(q);
      const y = q * w; // 横向半宽
      // 龙骨中线 z=-d，舷侧上抬到甲板
      const keel = -d * (1 - 0.85 * Math.pow(absQ, 2.2));
      const z = deckZ - (deckZ - keel) * Math.pow(absQ, 0.7);
      // 法线近似径向朝外（横向分量为主，底部带向下分量）
      const nz = 0.5 * (1 - absQ) + 0.15;
      pushVert(b, xs[i], y, z, 0, q * 0.9, nz);
    }
  }
  const stride = ring + 1;
  for (let i = 0; i < stations; i++) {
    for (let j = 0; j < ring; j++) {
      const a = i * stride + j;
      const c = a + stride;
      b.idx.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
  // 甲板面（z=deckZ）
  const deckBase = b.v.length / 6;
  for (let i = 0; i <= stations; i++) {
    pushVert(b, xs[i], widths[i], deckZ, 0, 0, 1);
    pushVert(b, xs[i], -widths[i], deckZ, 0, 0, 1);
  }
  for (let i = 0; i < stations; i++) {
    const a = deckBase + i * 2;
    const c = a + 2;
    b.idx.push(a, c, a + 1, a + 1, c, c + 1);
  }
  // 首/尾封板（x 法向）
  cap(b, xs[0], widths[0], deckZ, d, -1);
  cap(b, xs[stations], widths[stations], deckZ, d, 1);

  return createMesh(gl, new Float32Array(b.v), new Uint32Array(b.idx));
}

function cap(b: Builder, x: number, w: number, deckZ: number, d: number, sign: number): void {
  const base = b.v.length / 6;
  const pts: [number, number][] = [
    [w, deckZ], [-w, deckZ], [-w * 0.5, -d * 0.85], [0, -d], [w * 0.5, -d * 0.85],
  ];
  pts.forEach(([y, z]) => pushVert(b, x, y, z, sign, 0, 0));
  for (let i = 1; i < pts.length - 1; i++) {
    b.idx.push(base, base + i, base + i + 1);
  }
}

/** 多边形棱柱（陆地/港池底板），poly 在 x-y 水平面，z 从 bottom 到 top */
export function prismMesh(
  gl: WebGL2RenderingContext,
  poly: Pt[],
  top: number,
  bottom: number,
): Mesh {
  const b = newBuilder();
  // 顶面（法线 +z）
  const topBase = b.v.length / 6;
  poly.forEach((p) => pushVert(b, p.x, p.y, top, 0, 0, 1));
  for (let i = 1; i < poly.length - 1; i++) b.idx.push(topBase, topBase + i, topBase + i + 1);
  // 底面（法线 -z）
  const botBase = b.v.length / 6;
  poly.forEach((p) => pushVert(b, p.x, p.y, bottom, 0, 0, -1));
  for (let i = 1; i < poly.length - 1; i++) b.idx.push(botBase, botBase + i + 1, botBase + i);
  // 侧面
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    const p = poly[i], q = poly[j];
    const dx = q.x - p.x, dy = q.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = dy / len, ny = -dx / len;
    pushQuad(
      b,
      [p.x, p.y, bottom], [q.x, q.y, bottom], [q.x, q.y, top], [p.x, p.y, top],
      [nx, ny, 0],
    );
  }
  return createMesh(gl, new Float32Array(b.v), new Uint32Array(b.idx));
}

/** 矩形水面网格（x-y 水平面，z=0，波动在顶点着色器沿 z 位移） */
export function waterMesh(gl: WebGL2RenderingContext, size: number, cells: number): Mesh {
  const b = newBuilder();
  const step = (size * 2) / cells;
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const x0 = -size + i * step, x1 = x0 + step;
      const y0 = -size + j * step, y1 = y0 + step;
      pushQuad(
        b,
        [x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0],
        [0, 0, 1],
      );
    }
  }
  return createMesh(gl, new Float32Array(b.v), new Uint32Array(b.idx));
}

/** 灯浮标部件 */
export function buoyPoleMesh(gl: WebGL2RenderingContext): Mesh {
  return boxMesh(gl, 1.6, 1.6, 6);
}
export function buoyTopMesh(gl: WebGL2RenderingContext): Mesh {
  return boxMesh(gl, 3, 3, 3);
}
