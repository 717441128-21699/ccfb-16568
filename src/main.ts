/** 应用入口：hash 路由 + 顶栏 + 页面挂载 */
import { styles } from './ui/styles';
import { store, type PageId } from './ui/store';
import { renderTasksPage, bindTasksPage } from './ui/tasks-page';
import { renderBridgePage, bindBridgePage, disposeBridgePage } from './ui/bridge-page';
import { renderAnalysisPage, bindAnalysisPage } from './ui/analysis-page';
import { renderScorePage, bindScorePage } from './ui/score-page';

const PAGES: PageId[] = ['tasks', 'bridge', 'analysis', 'score'];
const LABELS: Record<PageId, string> = {
  tasks: '引航任务',
  bridge: '驾驶台',
  analysis: '航迹分析',
  score: '引航评分',
};

function mount(): void {
  const hash = (location.hash.replace('#', '') || 'tasks') as PageId;
  const page = PAGES.includes(hash) ? hash : 'tasks';
  if (page !== store.state.page) store.patch({ page });

  const hasSim = !!store.state.simulator;
  const nav = PAGES.map((p) => {
    const disabled = (p === 'bridge' || p === 'analysis' || p === 'score') && !hasSim;
    return `<button data-page="${p}" class="${p === page ? 'active' : ''}" ${disabled ? 'disabled' : ''}>${LABELS[p]}</button>`;
  }).join('');

  const app = document.getElementById('app')!;
  app.innerHTML = `
    <style>${styles}</style>
    <div class="topbar">
      <span class="brand">港 口 引 航 模 拟 器</span>
      <nav>${nav}</nav>
      <span class="muted" style="margin-left:auto;font-size:12px">MMG 操纵运动方程 · WebGL2</span>
    </div>
    <div id="page-root"></div>`;

  document.querySelectorAll<HTMLElement>('[data-page]').forEach((b) => {
    b.addEventListener('click', () => {
      if (!b.hasAttribute('disabled')) store.navigate(b.getAttribute('data-page') as PageId);
    });
  });

  const root = document.getElementById('page-root')!;
  disposeBridgePage();
  switch (page) {
    case 'tasks':
      root.innerHTML = renderTasksPage();
      bindTasksPage();
      break;
    case 'bridge':
      if (!hasSim) { store.navigate('tasks'); return; }
      root.innerHTML = renderBridgePage();
      bindBridgePage();
      break;
    case 'analysis':
      if (!hasSim) { store.navigate('tasks'); return; }
      root.innerHTML = renderAnalysisPage();
      bindAnalysisPage();
      break;
    case 'score':
      if (!hasSim) { store.navigate('tasks'); return; }
      root.innerHTML = renderScorePage();
      bindScorePage();
      break;
  }
}

window.addEventListener('hashchange', mount);
window.addEventListener('DOMContentLoaded', mount);
if (document.readyState !== 'loading') mount();
