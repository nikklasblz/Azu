import { createStore } from 'solid-js/store'
import { listen } from '@tauri-apps/api/event'
import { proEnabled } from './license'

export { proEnabled }

interface PaneRunState {
  status: 'waiting' | 'running' | 'done' | 'error'
  exitCode?: number
  startedAt?: number
  finishedAt?: number
}

interface PipelineState {
  status: 'idle' | 'running' | 'paused' | 'done' | 'error'
  currentOrder: number
  maxOrder: number
  startedAt?: number
  paneStates: Record<string, PaneRunState>
}

const [pipelineStore, setPipelineStore] = createStore<PipelineState>({
  status: 'idle',
  currentOrder: 0,
  maxOrder: 0,
  paneStates: {},
})

export function initPipelineListeners() {
  listen<{ paneId: string; order: number }>('pipeline-step-started', (e) => {
    setPipelineStore('paneStates', e.payload.paneId, {
      status: 'running',
      startedAt: Date.now(),
    })
  })

  listen<{ paneId: string; order: number; exitCode: number }>('pipeline-step-done', (e) => {
    setPipelineStore('paneStates', e.payload.paneId, {
      status: e.payload.exitCode === 0 ? 'done' : 'error',
      exitCode: e.payload.exitCode,
      finishedAt: Date.now(),
    })
  })

  listen<{ paneId: string; error: string }>('pipeline-error', (e) => {
    setPipelineStore('status', 'error')
    setPipelineStore('paneStates', e.payload.paneId, 'status', 'error')
  })

  listen<{ totalTime: number }>('pipeline-complete', () => {
    setPipelineStore('status', 'done')
  })
}

export function resetPipeline() {
  setPipelineStore({
    status: 'idle',
    currentOrder: 0,
    maxOrder: 0,
    startedAt: undefined,
    paneStates: {},
  })
}

export { pipelineStore }
