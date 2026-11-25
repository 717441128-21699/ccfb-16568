/** 驾驶台页：3D 视口 + HUD + 车钟/舵令/拖轮控制台 + 小地图 + 事件日志 */
import { store } from './store';
import { SceneRenderer, type CameraMode } from '../render/renderer';
import { Minimap } from '../render/minimap';
import { getPort, buildEnvironment } from '../core/ports';
import { getShip } from '../core/ships';
import { getScenario, practiceScenario } from '../core/scenarios';
import { Simulator } from '../core/engine';
import type { TelegraphLevel } from '../core/types';
import { BERTHING_SPEED_LIMIT } from '../core/types';
import { ms2kn, rad2deg, clamp, wrapAngle } from '../core/units';
import { scorePilot } from '../core/scoring';

const TELEGRAPH_LABELS: Record<number, string> = {
  [-4]: '退四', [-3]: '退三', [-2]: '退二', [-1]: '退一',
  0: '停车',
  1: '进一', 2: '进二', 3: '进三', 4: '进四',
};

let renderer: SceneRenderer | null = null;
let minimap: Minimap | null = null;
let raf = 0;
let lastTs = 0;
let running = false;
let simAccum = 0;
const TIME_SCALE = 4; // 仿真加速倍率（实船太慢，4 倍速兼顾手感与观察）

export function renderBridgePage(): string {
  const sim = store.state.simulator!;
  const ship = sim.ship;
  const port = getPort(sim.scenario.portId);

  const tugControls = sim.tugs.map((rt) => `
    <div class="tug-row" data-tug="${rt.def.id}">
      <span class="name">${rt.def.name}</span>
      <div class="tug-btns">
        <button data-act="idle" class="active">停</button>
        <button data-act="push">顶推</button>
        <button data-act="pull" class="pull">拖拉</button>
      </div>
      <input type="range" min="0" max="100" value="60" data-power />
    </div>`).join('');

  return `
  <div class="bridge-layout">
    <div>
      <div class="viewport">
        <canvas id="glcanvas" width="980" height="620"></canvas>
        <div class="hud" id="hud"></div>
        <div class="cam-switch">
          ${(['chase', 'orbit', 'top', 'bridge'] as CameraMode[]).map((m) =>
            `<button data-cam="${m}" class="${m === 'chase' ? 'active' : ''}">${camLabel(m)}</button>`).join('')}
        </div>
      </div>
      <div class="minimap-wrap" style="margin-top:12px">
        <canvas id="minimap" width="960" height="240"></canvas>
        <div class="muted" id="minimap-info" style="margin-top:6px;font-family:Consolas,monospace;font-size:12px"></div>
      </div>
    </div>

    <div class="sidepanel">
      <div class="control-block">
        <h2 style="margin-bottom:8px">${sim.scenario.title}</h2>
        <div class="muted" style="font-size:12px">${ship.name} · ${port.name}</div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="btn" id="btn-pause">暂停</button>
          <button class="btn secondary" id="btn-reset">重置任务</button>
        </div>
        <div id="time-display" class="muted" style="margin-top:8px;font-family:Consolas,monospace"></div>
      </div>

      <div class="control-block">
        <h2>车钟</h2>
        <div class="telegraph" id="telegraph">
          ${[-4, -3, -2, -1, 0, 1, 2, 3, 4].map((lv) =>
            `<button data-level="${lv}" class="${lv === 0 ? 'active' : ''} ${lv < 0 ? 'ast' : ''}">${TELEGRAPH_LABELS[lv]}</button>`).join('')}
        </div>
        <div class="muted" style="margin-top:8px;font-size:12px">主机转速 <span id="rpm-display">0</span> rps</div>
      </div>

      <div class="control-block">
        <h2>舵令 <span id="rudder-value" class="muted" style="font-weight:400">0.0°</span></h2>
        <div class="rudder-row">
          <button id="rudder-left">左</button>
          <div class="rudder-gauge">
            <div class="mark"></div>
            <div class="needle" id="rudder-needle" style="left:50%"></div>
          </div>
          <button id="rudder-right">右</button>
        </div>
        <div class="pill-row" style="margin-top:8px">
          <button data-rudder="0" class="secondary">正舵</button>
          <button data-rudder="15" class="secondary">右15</button>
          <button data-rudder="35" class="secondary">右满舵</button>
          <button data-rudder="-15" class="secondary">左15</button>
          <button data-rudder="-35" class="secondary">左满舵</button>
        </div>
      </div>

      <div class="control-block">
        <h2>拖轮协靠（三艘）</h2>
        ${tugControls}
      </div>

      <div class="control-block">
        <h2>应急</h2>
        <div style="display:flex;gap:8px">
          <button class="btn danger" id="btn-anchor">抛应急锚</button>
          <button class="btn secondary" id="btn-finish">结束并评分</button>
        </div>
      </div>

      <div class="control-block">
        <h2>事件日志</h2>
        <div class="event-log" id="event-log"></div>
      </div>
    </div>
  </div>`;
}

function camLabel(m: CameraMode): string {
  return { chase: '尾随', orbit: '环绕', top: '俯视', bridge: '驾驶台' }[m];
}

export function bindBridgePage(): void {
  const sim = store.state.simulator!;
  const port = getPort(sim.scenario.portId);
  const canvas = document.getElementById('glcanvas') as HTMLCanvasElement;
  renderer = new SceneRenderer(canvas, port, sim.ship);
  minimap = new Minimap(document.getElementById('minimap') as HTMLCanvasElement, port);

  running = true;
  lastTs = performance.now();
  simAccum = 0;
  cancelAnimationFrame(raf);
  loop();

  // --- 车钟 ---
  document.querySelectorAll<HTMLElement>('#telegraph button').forEach((b) => {
    b.addEventListener('click', () => {
      const lv = Number(b.getAttribute('data-level')) as TelegraphLevel;
      sim.setOrder({ telegraph: lv });
      document.querySelectorAll('#telegraph button').forEach((q) => q.classList.remove('active'));
      b.classList.add('active');
    });
  });

  // --- 舵 ---
  const setRudder = (deg: number) => {
    const cmd = clamp(deg, -35, 35) * Math.PI / 180;
    sim.setOrder({ rudderCmd: cmd });
  };
  document.getElementById('rudder-left')?.addEventListener('click', () => {
    setRudder(rad2deg(sim.order.rudderCmd) - 5);
  });
  document.getElementById('rudder-right')?.addEventListener('click', () => {
    setRudder(rad2deg(sim.order.rudderCmd) + 5);
  });
  document.querySelectorAll<HTMLElement>('[data-rudder]').forEach((b) => {
    b.addEventListener('click', () => setRudder(Number(b.getAttribute('data-rudder'))));
  });

  // --- 拖轮 ---
  document.querySelectorAll<HTMLElement>('.tug-row').forEach((row) => {
    const id = Number(row.getAttribute('data-tug'));
    const powerInput = row.querySelector<HTMLInputElement>('[data-power]')!;
    const apply = (action: 'idle' | 'push' | 'pull') => {
      sim.setTug(id, action, Number(powerInput.value) / 100);
      row.querySelectorAll('.tug-btns button').forEach((q) => q.classList.remove('active'));
      row.querySelector(`[data-act="${action}"]`)?.classList.add('active');
    };
    row.querySelectorAll<HTMLElement>('.tug-btns button').forEach((b) => {
      b.addEventListener('click', () => apply(b.getAttribute('data-act') as 'idle' | 'push' | 'pull'));
    });
    powerInput.addEventListener('input', () => {
      const current = sim.order.tugs[id]?.action ?? 'idle';
      if (current !== 'idle') sim.setTug(id, current, Number(powerInput.value) / 100);
    });
  });

  // --- 应急/流程 ---
  document.getElementById('btn-anchor')?.addEventListener('click', (e) => {
    const on = !sim.order.anchor;
    sim.setOrder({ anchor: on });
    (e.target as HTMLButtonElement).textContent = on ? '起锚' : '抛应急锚';
  });
  document.getElementById('btn-pause')?.addEventListener('click', (e) => {
    running = !running;
    (e.target as HTMLButtonElement).textContent = running ? '暂停' : '继续';
    if (running) { lastTs = performance.now(); loop(); }
  });
  document.getElementById('btn-reset')?.addEventListener('click', () => {
    // 用当前任务/船型/港口重建一个全新仿真
    const st = store.state;
    if (!st.scenarioId) return;
    const sc = st.practice
      ? practiceScenario(st.shipId!, st.portId!)
      : getScenario(st.scenarioId);
    const ship = getShip(sc.shipId);
    const port = getPort(sc.portId);
    const env = buildEnvironment(port, sc);
    const fresh = new Simulator(ship, sc, env, { recordInterval: 2 });
    store.patch({ simulator: fresh, score: null });
    // 重新挂载当前页以重建渲染循环
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  document.getElementById('btn-finish')?.addEventListener('click', () => finishAndScore(sim));

  // --- 相机 ---
  document.querySelectorAll<HTMLElement>('[data-cam]').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('[data-cam]').forEach((q) => q.classList.remove('active'));
      b.classList.add('active');
      renderer?.setCamera(b.getAttribute('data-cam') as CameraMode);
    });
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    renderer?.zoom(e.deltaY > 0 ? 1.1 : 0.9);
  }, { passive: false });
  let dragging = false, lastX = 0;
  canvas.addEventListener('mousedown', (e) => { dragging = true; lastX = e.clientX; });
  window.addEventListener('mouseup', () => { dragging = false; });
  canvas.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    renderer?.orbit((e.clientX - lastX) * 0.01);
    lastX = e.clientX;
  });

  // 键盘快捷键
  window.addEventListener('keydown', onKey);
}

function onKey(e: KeyboardEvent): void {
  const sim = store.state.simulator;
  if (!sim || store.state.page !== 'bridge') return;
  if (e.key === 'ArrowLeft') sim.setOrder({ rudderCmd: sim.order.rudderCmd - 5 * Math.PI / 180 });
  if (e.key === 'ArrowRight') sim.setOrder({ rudderCmd: sim.order.rudderCmd + 5 * Math.PI / 180 });
  if (e.key === ' ') { e.preventDefault(); running = !running; document.getElementById('btn-pause')!.textContent = running ? '暂停' : '继续'; if (running) { lastTs = performance.now(); loop(); } }
}

function finishAndScore(sim: Simulator): void {
  sim.finish();
  if (store.state.practice) {
    store.navigate('analysis');
    return;
  }
  store.patch({ score: scorePilot(sim) });
  store.navigate('score');
}

function loop(): void {
  if (!running || !renderer || !minimap) return;
  const now = performance.now();
  const realDt = Math.min(0.1, (now - lastTs) / 1000);
  lastTs = now;

  const sim = store.state.simulator!;
  // 固定步长累积，TIME_SCALE 加速
  simAccum += realDt * TIME_SCALE;
  const step = 0.5;
  let guard = 0;
  while (simAccum >= step && guard < 40) {
    sim.step(step);
    simAccum -= step;
    guard++;
    if (sim.finished) {
      running = false;
      if (!store.state.practice) {
        store.patch({ score: scorePilot(sim) });
        setTimeout(() => store.navigate('score'), 600);
      }
      break;
    }
  }

  renderer.render(sim, realDt);
  minimap.draw(sim);
  updateHud(sim);
  raf = requestAnimationFrame(loop);
}

function updateHud(sim: Simulator): void {
  const s = sim.state;
  const sog = Math.hypot(s.u, s.v);
  const depth = sim.env.depthAt(s.x, s.y);
  const hT = depth / sim.ship.d;
  const cls = (v: number, warn: number, danger: number) =>
    v >= danger ? 'danger' : v >= warn ? 'warn' : 'ok';
  const html = `
    <div class="row"><span class="k">对地航速 SOG</span><span class="v">${ms2kn(sog).toFixed(2)} kn (${sog.toFixed(2)} m/s)</span></div>
    <div class="row"><span class="k">纵向 u / 横向 v</span><span class="v">${s.u.toFixed(2)} / ${s.v.toFixed(2)} m/s</span></div>
    <div class="row"><span class="k">船首向</span><span class="v">${rad2deg(wrapAngle(s.psi)).toFixed(1)}°</span></div>
    <div class="row"><span class="k">转首角速度</span><span class="v">${(rad2deg(s.r) * 60).toFixed(1)} °/min</span></div>
    <div class="row"><span class="k">实际舵角</span><span class="v">${rad2deg(s.delta).toFixed(1)}°</span></div>
    <div class="row"><span class="k">水深 / h-T 比</span><span class="v ${cls(hT, 2, 1.4)}">${depth.toFixed(1)}m / ${hT.toFixed(2)}</span></div>
    <div class="row"><span class="k">下沉 squat</span><span class="v ${cls(s.squat, 0.5, 1.2)}">${s.squat.toFixed(2)} m</span></div>
    <div class="row"><span class="k">富余水深 UKC</span><span class="v ${cls(-s.ukc, 0, 0)}">${s.ukc.toFixed(2)} m</span></div>
    <div class="row"><span class="k">靠泊限值</span><span class="v muted">${BERTHING_SPEED_LIMIT} m/s</span></div>`;
  const hud = document.getElementById('hud');
  if (hud) hud.innerHTML = html;

  const rudderDeg = rad2deg(s.delta);
  const needle = document.getElementById('rudder-needle');
  if (needle) needle.style.left = `${50 + (rudderDeg / 35) * 48}%`;
  const rv = document.getElementById('rudder-value');
  if (rv) rv.textContent = `${rudderDeg.toFixed(1)}°`;
  const rpmEl = document.getElementById('rpm-display');
  if (rpmEl) rpmEl.textContent = s.rpm.toFixed(2);
  const timeEl = document.getElementById('time-display');
  if (timeEl) {
    const limitText = sim.scenario.timeLimit >= 99999 ? '不限' : `${(sim.scenario.timeLimit / 60).toFixed(0)} 分钟`;
    timeEl.textContent = `任务时间 ${(sim.time / 60).toFixed(1)} 分钟 / 限制 ${limitText}`;
  }

  // 事件日志
  const log = document.getElementById('event-log');
  if (log) {
    log.innerHTML = sim.events.slice(-30).reverse().map((e) => {
      const c = e.type === 'collision' || e.type === 'grounding' ? 'danger'
        : e.type === 'channelExit' || e.type === 'anchored' ? 'warn' : 'ok';
      return `<div class="e ${c}">[${(e.t / 60).toFixed(1)}分] ${e.message}</div>`;
    }).join('');
  }
  const info = document.getElementById('minimap-info');
  if (info && minimap) info.textContent = minimap.headingInfo(sim);
}

export function disposeBridgePage(): void {
  cancelAnimationFrame(raf);
  running = false;
  renderer = null;
  minimap = null;
  window.removeEventListener('keydown', onKey);
}
