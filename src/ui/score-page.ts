/** 引航评分页：总分、等级、分项扣分与操纵复盘 */
import { store } from './store';
import { scorePilot } from '../core/scoring';
import { BERTHING_SPEED_LIMIT } from '../core/types';

export function renderScorePage(): string {
  const sim = store.state.simulator!;
  const result = store.state.score ?? scorePilot(sim);
  const gradeColor: Record<string, string> = {
    S: '#4dd07a', A: '#38c6d9', B: '#ffd166', C: '#ffb020', D: '#ff5c5c',
  };

  const items = result.items.map((it) => `
    <tr>
      <td>${it.label}</td>
      <td style="width:120px">
        <div class="bar"><div style="width:${(it.gained / it.max) * 100}%"></div></div>
      </td>
      <td style="width:70px;text-align:right">${it.gained}/${it.max}</td>
      <td class="muted" style="width:260px">${it.note}</td>
    </tr>`).join('');

  return `
  <div class="page" style="max-width:1100px">
    <h1>引航评分</h1>
    <p class="muted">${sim.scenario.title} · ${sim.ship.name}</p>

    <div class="card score-hero" style="margin-top:16px">
      <span class="num">${result.score}</span><span class="muted">/100</span>
      <span class="grade" style="color:${gradeColor[result.grade]}">${result.grade}</span>
      <div class="muted" style="margin-top:10px">
        ${result.grade === 'S' ? '完美靠泊，引航员水准！'
          : result.grade === 'A' ? '操纵规范，仅有微小瑕疵。'
          : result.grade === 'B' ? '完成靠泊，部分环节需要改进。'
          : result.grade === 'C' ? '靠泊成功但风险较多，建议复盘。'
          : '操纵存在严重问题，请重新训练。'}
      </div>
    </div>

    <div class="grid cols-2" style="margin-top:16px">
      <div class="card">
        <h2>分项评分</h2>
        <table>${items}</table>
      </div>
      <div class="card">
        <h2>关键指标</h2>
        <table>
          <tr><td>最大法向贴靠速度</td>
              <td class="${result.maxApproachSpeed > BERTHING_SPEED_LIMIT ? '' : ''}">
                <span style="color:${result.maxApproachSpeed > BERTHING_SPEED_LIMIT ? 'var(--danger)' : 'var(--ok)'}">
                  ${result.maxApproachSpeed.toFixed(2)} m/s</span>
                <span class="muted">（限值 ${BERTHING_SPEED_LIMIT}）</span></td></tr>
          <tr><td>靠泊夹角</td><td>${result.berthAngleDeg.toFixed(1)}°（理想 ≤5°）</td></tr>
          <tr><td>碰撞次数</td><td style="color:${result.collisions ? 'var(--danger)' : 'var(--ok)'}">${result.collisions}</td></tr>
          <tr><td>触底次数</td><td style="color:${result.groundings ? 'var(--warn)' : 'var(--ok)'}">${result.groundings}</td></tr>
          <tr><td>航道越界</td><td>${result.channelExits}</td></tr>
          <tr><td>操纵用时</td><td>${(result.duration / 60).toFixed(1)} 分钟</td></tr>
        </table>

        <h2>事件时间线</h2>
        <div class="event-log">
          ${sim.events.length === 0 ? '<div class="muted">无特殊事件，操纵平稳。</div>'
            : sim.events.map((e) => {
              const c = e.type === 'collision' || e.type === 'grounding' ? 'danger'
                : e.type === 'channelExit' ? 'warn' : 'ok';
              return `<div class="e ${c}">[${(e.t / 60).toFixed(1)}分] ${e.message}</div>`;
            }).join('')}
        </div>
      </div>
    </div>

    <div style="margin-top:18px;display:flex;gap:10px">
      <button class="btn" id="score-analysis">查看航迹分析</button>
      <button class="btn secondary" id="score-retry">重试本任务</button>
      <button class="btn secondary" id="score-tasks">返回任务列表</button>
    </div>
  </div>`;
}

export function bindScorePage(): void {
  document.getElementById('score-analysis')?.addEventListener('click', () => store.navigate('analysis'));
  document.getElementById('score-tasks')?.addEventListener('click', () => store.navigate('tasks'));
  document.getElementById('score-retry')?.addEventListener('click', () => {
    // 重新构造同一任务的仿真
    location.hash = 'tasks';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}
