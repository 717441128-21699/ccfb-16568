/**
 * 2D 俯视小地图：航道、港池、码头、航标、本船航迹与船位、交通船。
 * 独立于 WebGL2 主画面，用 Canvas2D 绘制。
 */
import type { PortDef } from '../core/ports';
import type { Simulator } from '../core/engine';
import { rad2deg } from '../core/units';

export class Minimap {
  private ctx: CanvasRenderingContext2D;
  private port: PortDef;
  private scale = 1;
  private offX = 0;
  private offY = 0;

  constructor(private canvas: HTMLCanvasElement, port: PortDef) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建 2D 上下文');
    this.ctx = ctx;
    this.port = port;
    this.fitView();
  }

  private fitView(): void {
    const fw = this.port.fairway;
    const xs = fw.map((p) => p.x).concat(this.port.basin.map((p) => p.x));
    const ys = fw.map((p) => p.y).concat(this.port.basin.map((p) => p.y));
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const w = maxX - minX || 1;
    const h = maxY - minY || 1;
    this.scale = Math.min(this.canvas.width / (w + 300), this.canvas.height / (h + 300));
    this.offX = (this.canvas.width - w * this.scale) / 2 - minX * this.scale;
    this.offY = (this.canvas.height - h * this.scale) / 2 + maxY * this.scale;
  }

  private tx(x: number): number {
    return x * this.scale + this.offX;
  }
  private ty(y: number): number {
    return -y * this.scale + this.offY;
  }

  draw(sim: Simulator): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0e2430';
    ctx.fillRect(0, 0, w, h);

    // 港池
    ctx.beginPath();
    this.port.basin.forEach((p, i) => {
      const X = this.tx(p.x), Y = this.ty(p.y);
      if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(70,120,130,0.5)';
    ctx.fill();

    // 航道条带
    ctx.strokeStyle = 'rgba(120,180,190,0.7)';
    ctx.lineWidth = this.port.fairwayHalfWidth * 2 * this.scale;
    ctx.beginPath();
    this.port.fairway.forEach((p, i) => {
      const X = this.tx(p.x), Y = this.ty(p.y);
      if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    });
    ctx.stroke();

    // 码头/岸线
    ctx.strokeStyle = '#c9b88a';
    ctx.lineWidth = 3;
    for (const line of this.port.bankLines) {
      ctx.beginPath();
      line.pts.forEach((p, i) => {
        const X = this.tx(p.x), Y = this.ty(p.y);
        if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
      });
      ctx.stroke();
    }

    // 航迹
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    sim.track.forEach((p, i) => {
      const X = this.tx(p.x), Y = this.ty(p.y);
      if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    });
    ctx.stroke();

    // 交通船
    for (const t of sim.env.traffic) {
      this.drawArrow(this.tx(t.x), this.ty(t.y), t.psi, '#8ea6c8', 8);
    }

    // 本船
    const s = sim.state;
    this.drawArrow(this.tx(s.x), this.ty(s.y), s.psi, '#ff6b6b', 11);

    // 北向标
    ctx.fillStyle = '#ddd';
    ctx.font = '12px monospace';
    ctx.fillText('N ↑', 8, 16);
    ctx.fillText(`比例尺 ${(100 * this.scale).toFixed(0)}px=100m`, 8, h - 8);
  }

  private drawArrow(x: number, y: number, psi: number, color: string, size: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-psi);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.7, size * 0.55);
    ctx.lineTo(-size * 0.4, 0);
    ctx.lineTo(-size * 0.7, -size * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  headingInfo(sim: Simulator): string {
    return `船位 (${sim.state.x.toFixed(0)}, ${sim.state.y.toFixed(0)})  航向 ${rad2deg(sim.state.psi).toFixed(1)}°`;
  }
}
