/** 引航任务页：任务卡片列表 + 自由操练入口 */
import { SCENARIOS, practiceScenario } from '../core/scenarios';
import { SHIPS, getShip } from '../core/ships';
import { PORTS, getPort, buildEnvironment } from '../core/ports';
import { Simulator, type Scenario } from '../core/engine';
import { store } from './store';
import { ms2kn } from '../core/units';

export function renderTasksPage(): string {
  const cards = SCENARIOS.map((sc) => {
    const ship = getShip(sc.shipId);
    const port = getPort(sc.portId);
    // 只统计船舶实际航行区域（航道、港池）的水深，不含港外默认水深
    const navDepth = Math.min(...port.depthZones.map((z) => z.depth));
    const hT = (navDepth / ship.d).toFixed(2);
    return `
      <div class="card task-card">
        <h2>${sc.title}</h2>
        <p class="muted" style="min-height:56px">${sc.brief}</p>
        <div style="margin:10px 0">
          <span class="tag">${ship.name} · ${ship.type}</span>
          <span class="tag">${port.name}</span>
          <span class="tag ${Number(hT) < 1.5 ? 'danger' : ''}">最小 h/T ≈ ${hT}</span>
        </div>
        <table>
          <tr><td>船长 / 吃水</td><td>${ship.L}m / ${ship.d}m</td>
              <td>设计航速</td><td>${ship.designSpeedKn}kn</td></tr>
          <tr><td>风</td><td>${ms2kn(sc.wind.speed).toFixed(0)}kn</td>
              <td>流</td><td>${ms2kn(sc.current.speed).toFixed(1)}kn</td></tr>
          <tr><td>时间限制</td><td>${(sc.timeLimit / 60).toFixed(0)} 分钟</td>
              <td>交通船</td><td>${sc.traffic.length} 艘</td></tr>
        </table>
        <div style="margin-top:12px"><button class="btn" data-start="${sc.id}">开始引航</button></div>
      </div>`;
  }).join('');

  const practiceShips = SHIPS.map((s, i) =>
    `<button data-ship="${s.id}" class="${i === 0 ? 'active' : ''}">${s.name} · ${s.type}</button>`).join('');
  const practicePorts = PORTS.map((p, i) =>
    `<button data-port="${p.id}" class="${i === 0 ? 'active' : ''}">${p.name}</button>`).join('');

  return `
    <div class="page">
      <h1>引航任务</h1>
      <p class="muted">选择任务登船，把货轮从航道引进港池靠上码头。靠泊法向速度超过 0.15 m/s 即判撞击扣分。</p>
      <div class="grid cols-2" style="margin-top:18px">${cards}</div>

      <div class="card" style="margin-top:18px">
        <h2>自由操练场</h2>
        <p class="muted">无时间限制、不评分，可用于旋回圈、冲程、靠泊演练。</p>
        <h3>船型</h3>
        <div class="pill-row" id="practice-ships">${practiceShips}</div>
        <h3>港口</h3>
        <div class="pill-row" id="practice-ports">${practicePorts}</div>
        <button class="btn secondary" id="practice-start">进入操练</button>
      </div>
    </div>`;
}

export function bindTasksPage(): void {
  let practiceShip = SHIPS[0].id;
  let practicePort = PORTS[0].id;

  document.querySelectorAll<HTMLElement>('[data-start]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-start')!;
      const sc = SCENARIOS.find((q) => q.id === id)!;
      launch(sc, false);
    });
  });

  document.querySelectorAll<HTMLElement>('#practice-ships button').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#practice-ships button').forEach((q) => q.classList.remove('active'));
      b.classList.add('active');
      practiceShip = b.getAttribute('data-ship')!;
    });
  });
  document.querySelectorAll<HTMLElement>('#practice-ports button').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#practice-ports button').forEach((q) => q.classList.remove('active'));
      b.classList.add('active');
      practicePort = b.getAttribute('data-port')!;
    });
  });
  document.getElementById('practice-start')?.addEventListener('click', () => {
    launch(practiceScenario(practiceShip, practicePort), true);
  });
}

function launch(sc: Scenario, practice: boolean): void {
  const ship = getShip(sc.shipId);
  const port = getPort(sc.portId);
  const env = buildEnvironment(port, sc);
  const sim = new Simulator(ship, sc, env, { recordInterval: 2 });
  store.patch({
    scenarioId: sc.id,
    shipId: ship.id,
    portId: port.id,
    simulator: sim,
    score: null,
    practice,
    page: 'bridge',
  });
  store.navigate('bridge');
}
