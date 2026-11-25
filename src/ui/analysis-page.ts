/** 航迹分析页：航迹回放小地图 + 多参数时间序列曲线 + 操纵统计 */
import { store } from './store';
import { ms2kn, rad2deg } from '../core/units';
import { getPort, buildEnvironment } from '../core/ports';
import { Minimap } from '../render/minimap';
import { Simulator } from '../core/engine';

export function renderAnalysisPage(): string {
  const sim = store.state.simulator!;
  const track = sim.track;
  const maxSog = Math.max(...track.map((p) => ms2kn(p.sog)), 1);
  const maxRpm = Math.max(...track.map((p) => Math.abs(p.rpm)), 1);
  const stats = computeStats(sim);

  return `
  <div class="page">
    <h1>航迹分析</h1>
    <p class="muted">${sim.scenario.title} · 采样点 ${track.length} 个 · 历时 ${(sim.time / 60).toFixed(1)} 分钟</p>

    <div class="grid cols-2" style="margin-top:16px">
      <div class="chart-wrap">
        <h2>平面航迹</h2>
        <canvas id="analysis-map" width="600" height="380"></canvas>
      </div>
      <div class="chart-wrap">
        <h2>操纵统计</h2>
        <table>
          <tr><td>最大航速</td><td>${stats.maxSogKn.toFixed(2)} kn</td>
              <td>平均航速</td><td>${stats.avgSogKn.toFixed(2)} kn</td></tr>
          <tr><td>最大转首率</td><td>${stats.maxYawRate.toFixed(1)} °/min</td>
              <td>累计转向</td><td>${stats.totalHeadingChange.toFixed(0)}°</td></tr>
          <tr><td>最大下沉量</td><td>${stats.maxSquat.toFixed(2)} m</td>
              <td>最小 UKC</td><td>${stats.minUkc.toFixed(2)} m</td></tr>
          <tr><td>主机最高转速</td><td>${stats.maxRpm.toFixed(2)} rps</td>
              <td>最大舵角</td><td>${stats.maxRudder.toFixed(0)}°</td></tr>
          <tr><td>停车后滑行估算</td><td>${stats.coastEstimate.toFixed(0)} m (${(stats.coastEstimate / sim.ship.L).toFixed(2)}L)</td>
              <td>碰撞/触底/越界</td><td>${sim.collisionCount}/${sim.groundingCount}/${sim.channelExitCount}</td></tr>
        </table>
        <h3>车钟/舵角使用分布</h3>
        <div class="muted" style="font-size:12px">正车 ${stats.aheadPct.toFixed(0)}% · 倒车 ${stats.astPct.toFixed(0)}% · 停车 ${stats.stopPct.toFixed(0)}%；
          左舵 ${stats.portPct.toFixed(0)}% · 右舵 ${stats.stbdPct.toFixed(0)}% · 正舵 ${stats.midPct.toFixed(0)}%</div>
      </div>
    </div>

    <div class="grid cols-2" style="margin-top:16px">
      <div class="chart-wrap"><h2>航速 SOG（kn）</h2><canvas id="ch-sog" data-max="${maxSog.toFixed(1)}"></canvas></div>
      <div class="chart-wrap"><h2>船首向（°）</h2><canvas id="ch-heading"></canvas></div>
      <div class="chart-wrap"><h2>转首率（°/min）</h2><canvas id="ch-yaw"></canvas></div>
      <div class="chart-wrap"><h2>主机转速（rps）</h2><canvas id="ch-rpm" data-max="${maxRpm.toFixed(1)}"></canvas></div>
      <div class="chart-wrap"><h2>舵角（°）</h2><canvas id="ch-rudder"></canvas></div>
      <div class="chart-wrap"><h2>下沉量 squat（m）</h2><canvas id="ch-squat"></canvas></div>
    </div>

    <div style="margin-top:18px;display:flex;gap:10px">
      <button class="btn" id="back-bridge">返回驾驶台</button>
      <button class="btn secondary" id="goto-score">查看评分</button>
    </div>
  </div>`;
}

export function bindAnalysisPage(): void {
  const sim = store.state.simulator!;
  const port = getPort(sim.scenario.portId);
  const mapCanvas = document.getElementById('analysis-map') as HTMLCanvasElement;
  const mini = new Minimap(mapCanvas, port);
  mini.draw(sim);

  const track = sim.track;
  drawSeries('ch-sog', track.map((p) => ms2kn(p.sog)), track.map((p) => p.t), '#38c6d9');
  drawSeries('ch-heading', track.map((p) => rad2deg(p.psi)), track.map((p) => p.t), '#ffd166', true);
  drawSeries('ch-yaw', track.map((p) => rad2deg(p.r) * 60), track.map((p) => p.t), '#ff8fa3');
  drawSeries('ch-rpm', track.map((p) => p.rpm), track.map((p) => p.t), '#4dd07a');
  drawSeries('ch-rudder', track.map((p) => rad2deg(p.delta)), track.map((p) => p.t), '#c792ea', true);
  drawSeries('ch-squat', track.map((p) => p.squat), track.map((p) => p.t), '#ffb020');

  document.getElementById('back-bridge')?.addEventListener('click', () => store.navigate('bridge'));
  document.getElementById('goto-score')?.addEventListener('click', () => store.navigate('score'));
}

interface Stats {
  maxSogKn: number; avgSogKn: number; maxYawRate: number; totalHeadingChange: number;
  maxSquat: number; minUkc: number; maxRpm: number; maxRudder: number; coastEstimate: number;
  aheadPct: number; astPct: number; stopPct: number; portPct: number; stbdPct: number; midPct: number;
}

function computeStats(sim: Simulator): Stats {
  const t = sim.track;
  const sog = t.map((p) => ms2kn(p.sog));
  let headingChange = 0;
  for (let i = 1; i < t.length; i++) {
    let d = t[i].psi - t[i - 1].psi;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    headingChange += Math.abs(rad2deg(d));
  }
  const ahead = t.filter((p) => p.rpm > 0.1).length;
  const ast = t.filter((p) => p.rpm < -0.1).length;
  const port = t.filter((p) => p.delta < -0.05).length;
  const stbd = t.filter((p) => p.delta > 0.05).length;
  const n = t.length || 1;
  // 停车滑行估算：u²/(2·平均减速度)，用当前 u 与阻力特征
  const u = sim.state.u;
  const coast = u > 0.5 ? (u * u) / (2 * 0.012 * Math.max(u, 1)) : 0;
  return {
    maxSogKn: Math.max(...sog, 0),
    avgSogKn: sog.reduce((a, b) => a + b, 0) / n,
    maxYawRate: Math.max(...t.map((p) => Math.abs(rad2deg(p.r) * 60)), 0),
    totalHeadingChange: headingChange,
    maxSquat: Math.max(...t.map((p) => p.squat), 0),
    minUkc: Math.min(...t.map((p) => p.ukc), 999),
    maxRpm: Math.max(...t.map((p) => Math.abs(p.rpm)), 0),
    maxRudder: Math.max(...t.map((p) => Math.abs(rad2deg(p.delta))), 0),
    coastEstimate: coast,
    aheadPct: (ahead / n) * 100,
    astPct: (ast / n) * 100,
    stopPct: 100 - ((ahead + ast) / n) * 100,
    portPct: (port / n) * 100,
    stbdPct: (stbd / n) * 100,
    midPct: 100 - ((port + stbd) / n) * 100,
  };
}

function drawSeries(canvasId: string, values: number[], times: number[], color: string, centered = false): void {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  if (!canvas) return;
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (values.length < 2) return;
  const pad = 28;
  const minV = centered ? -Math.max(...values.map(Math.abs), 1) : Math.min(...values);
  const maxV = centered ? Math.max(...values.map(Math.abs), 1) : Math.max(...values);
  const t0 = times[0], t1 = times[times.length - 1] || 1;
  const x = (i: number) => pad + (i / (values.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((v - minV) / (maxV - minV || 1)) * (H - pad * 2);

  // 网格与零轴
  ctx.strokeStyle = '#24475a';
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const gy = pad + (g / 4) * (H - pad * 2);
    ctx.beginPath(); ctx.moveTo(pad, gy); ctx.lineTo(W - pad, gy); ctx.stroke();
  }
  if (centered) {
    ctx.strokeStyle = '#5a7a88';
    const zy = y(0);
    ctx.beginPath(); ctx.moveTo(pad, zy); ctx.lineTo(W - pad, zy); ctx.stroke();
  }
  // 曲线
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  values.forEach((v, i) => { if (i === 0) ctx.moveTo(x(i), y(v)); else ctx.lineTo(x(i), y(v)); });
  ctx.stroke();
  // 坐标标注
  ctx.fillStyle = '#86a2ae';
  ctx.font = '10px Consolas, monospace';
  ctx.fillText(maxV.toFixed(1), 2, pad + 4);
  ctx.fillText(minV.toFixed(1), 2, H - pad);
  ctx.fillText(`${(t0 / 60).toFixed(1)}分`, pad, H - 8);
  ctx.fillText(`${(t1 / 60).toFixed(1)}分`, W - pad - 30, H - 8);
  void buildEnvironment;
}
