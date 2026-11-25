/** 全局应用状态（页面间共享任务、仿真结果与评分） */
import type { Simulator } from '../core/engine';
import type { ScoreBreakdown } from '../core/scoring';

export type PageId = 'tasks' | 'bridge' | 'analysis' | 'score';

export interface AppState {
  page: PageId;
  scenarioId: string | null;
  shipId: string | null;
  portId: string | null;
  simulator: Simulator | null;
  score: ScoreBreakdown | null;
  /** 自由操练模式（不评分） */
  practice: boolean;
}

class Store {
  state: AppState = {
    page: 'tasks',
    scenarioId: null,
    shipId: null,
    portId: null,
    simulator: null,
    score: null,
    practice: false,
  };
  private listeners = new Set<() => void>();

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  patch(p: Partial<AppState>): void {
    this.state = { ...this.state, ...p };
    this.emit();
  }

  navigate(page: PageId): void {
    this.patch({ page });
    location.hash = page;
  }
}

export const store = new Store();
