import { Component, createSignal, Show, For, onMount, onCleanup, createMemo, createEffect } from 'solid-js'
import PresetSwitcher from '../Grid/PresetSwitcher'
import ThemePicker from '../ThemePicker/ThemePicker'
import SnippetPicker from './SnippetPicker'
import LicensePanel from '../Settings/LicensePanel'
import { win } from '../../lib/tauri-commands'
import { setBgAlpha, themeStore } from '../../stores/theme'
import { pipelineStore } from '../../stores/pipeline'
import { proEnabled } from '../../stores/license'
import { findAllLeaves, gridStore } from '../../stores/grid'

interface TitleBarProps {
  onAddTab?: () => void
  onLaunchAll?: (cmd: string) => void
  onRunPipeline?: () => void
  onStopPipeline?: () => void
}

const launchOptions = [
  { label: 'Claude', cmd: 'claude' },
  { label: 'Claude (yolo)', cmd: 'claude --dangerously-skip-permissions' },
  { label: 'Codex', cmd: 'codex' },
  { label: 'Codex (full-auto)', cmd: 'codex --full-auto' },
]

const TitleBar: Component<TitleBarProps> = (props) => {
  let launchRef: HTMLDivElement | undefined
  const [pinned, setPinned] = createSignal(false)
  const [opacity, setOpacity] = createSignal(100)
  const [showLaunch, setShowLaunch] = createSignal(false)
  const [showLicense, setShowLicense] = createSignal(false)
  const [elapsed, setElapsed] = createSignal(0)

  const hasPipelineConfig = () => {
    const leaves = findAllLeaves(gridStore.root)
    return leaves.some(n => n.pipeline)
  }

  let elapsedTimer: ReturnType<typeof setInterval> | undefined
  const startElapsedTimer = () => {
    clearInterval(elapsedTimer)
    elapsedTimer = setInterval(() => {
      const start = pipelineStore.startedAt
      if (start) setElapsed(Math.floor((Date.now() - start) / 1000))
    }, 1000)
  }
  const stopElapsedTimer = () => {
    clearInterval(elapsedTimer)
    elapsedTimer = undefined
  }

  const pipelineStatusText = createMemo(() => {
    const s = pipelineStore.status
    const order = pipelineStore.currentOrder
    const max = pipelineStore.maxOrder
    const secs = elapsed()
    const mm = String(Math.floor(secs / 60)).padStart(1, '0')
    const ss = String(secs % 60).padStart(2, '0')
    const timeStr = secs > 0 ? `${mm}m ${ss}s` : ''
    if (s === 'idle') return ''
    if (s === 'running') {
      const stepPart = max > 0 ? `Step ${order}/${max} · ` : ''
      return `${stepPart}${timeStr} · running`
    }
    if (s === 'done') return `Done${timeStr ? ` · ${timeStr}` : ''}`
    if (s === 'error') return `Error${timeStr ? ` · ${timeStr}` : ''}`
    return ''
  })

  const pipelineStatusColor = createMemo(() => {
    const s = pipelineStore.status
    const t = themeStore.themes[themeStore.activeId]?.colors
    if (s === 'running') return t?.accent || '#58a6ff'
    if (s === 'done') return '#3fb950'
    if (s === 'error') return t?.error || '#f85149'
    return t?.textMuted || '#8b949e'
  })

  const handleClickOutsideLaunch = (e: MouseEvent) => {
    if (launchRef && !launchRef.contains(e.target as Node)) setShowLaunch(false)
  }
  onMount(() => document.addEventListener('mousedown', handleClickOutsideLaunch))
  onCleanup(() => {
    document.removeEventListener('mousedown', handleClickOutsideLaunch)
    stopElapsedTimer()
  })

  createEffect(() => {
    const s = pipelineStore.status
    if (s === 'running') {
      setElapsed(pipelineStore.startedAt ? Math.floor((Date.now() - pipelineStore.startedAt) / 1000) : 0)
      startElapsedTimer()
    } else {
      stopElapsedTimer()
    }
  })

  const togglePin = async () => {
    const next = !pinned()
    setPinned(next)
    await win.setAlwaysOnTop(next)
  }

  const handleOpacity = (value: number) => {
    setOpacity(value)
    setBgAlpha(value / 100)
  }

  const handleLaunchAll = (cmd: string) => {
    props.onLaunchAll?.(cmd)
    setShowLaunch(false)
  }

  return (
    <header
      class="h-10 flex items-center px-3 shrink-0 gap-2 select-none"
      style={{ background: 'var(--azu-surface-alt)', 'border-bottom': '1px solid var(--azu-border)' }}
      data-tauri-drag-region
    >
      {/* Logo — azucena lily petals */}
      <div class="flex items-center gap-1.5 mr-0.5" data-tauri-drag-region>
        <svg width="18" height="18" viewBox="0 0 32 32" style={{ 'flex-shrink': '0' }}>
          <circle cx="16" cy="16" r="15" fill="#0d1117"/>
          <ellipse cx="16" cy="12" rx="3" ry="7" fill="#6ab0ff" opacity="0.9"/>
          <ellipse cx="11" cy="20" rx="5" ry="3" transform="rotate(-20 11 20)" fill="#4a8fd4" opacity="0.8"/>
          <ellipse cx="21" cy="20" rx="5" ry="3" transform="rotate(20 21 20)" fill="#4a8fd4" opacity="0.8"/>
          <circle cx="16" cy="19" r="1" fill="#c0d0e0" opacity="0.8"/>
        </svg>
        <span
          class="text-xs font-bold tracking-widest uppercase"
          style={{ color: 'var(--azu-accent)', 'font-family': 'var(--azu-font-mono)', 'letter-spacing': '0.15em' }}
        >AZU</span>
      </div>

      <PresetSwitcher />

      {/* Pipeline Run or Launch All */}
      <Show
        when={hasPipelineConfig()}
        fallback={
          <div class="relative" ref={launchRef}>
            <button
              class="px-2 py-1 text-xs border border-accent/30 rounded hover:bg-accent/10 text-accent flex items-center gap-1"
              onClick={() => setShowLaunch(!showLaunch())}
              title="Launch CLI in all terminals"
            >
              <svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor"><polygon points="2,1 9,5 2,9" /></svg>
              All
            </button>
            <Show when={showLaunch()}>
              {(() => {
                const t = () => themeStore.themes[themeStore.activeId]?.colors
                return (
                  <div
                    class="absolute top-full left-0 rounded shadow-lg z-50 min-w-52 p-1"
                    style={{ background: t()?.surface || '#0d1117', border: `1px solid ${t()?.border || '#30363d'}` }}
                  >
                    <For each={launchOptions}>
                      {(opt) => (
                        <button
                          class="flex items-center gap-2 w-full px-3 py-2 text-left text-xs hover:bg-white/10"
                          style={{ color: t()?.text || '#c9d1d9' }}
                          onClick={() => handleLaunchAll(opt.cmd)}
                        >
                          <svg width="6" height="6" viewBox="0 0 10 10" fill={t()?.accent || '#58a6ff'}><polygon points="2,1 9,5 2,9" /></svg>
                          {opt.label}
                        </button>
                      )}
                    </For>
                  </div>
                )
              })()}
            </Show>
          </div>
        }
      >
        <div class="flex items-center gap-2">
          <Show
            when={pipelineStore.status !== 'running'}
            fallback={
              <button
                class="px-2 py-1 text-xs border border-red-500/40 rounded hover:bg-red-500/10 text-red-400 flex items-center gap-1"
                onClick={() => props.onStopPipeline?.()}
                title="Stop pipeline"
              >
                <svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor"><rect x="2" y="2" width="6" height="6" rx="0.5" /></svg>
                Stop
              </button>
            }
          >
            <button
              class="px-2 py-1 text-xs border border-accent/30 rounded hover:bg-accent/10 text-accent flex items-center gap-1"
              onClick={() => props.onRunPipeline?.()}
              title="Run pipeline"
            >
              <svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor"><polygon points="2,1 9,5 2,9" /></svg>
              Pipeline
            </button>
          </Show>
          <Show when={pipelineStatusText()}>
            <span class="text-[10px]" style={{ color: pipelineStatusColor() }}>
              {pipelineStatusText()}
            </span>
          </Show>
        </div>
      </Show>

      <div class="flex-1" data-tauri-drag-region />

      {/* Pro badge */}
      <Show
        when={proEnabled()}
        fallback={
          <button
            class="px-2 py-0.5 text-[10px] rounded"
            style={{ background: 'var(--azu-accent)', color: 'var(--azu-surface)', cursor: 'pointer', border: 'none' }}
            onClick={() => setShowLicense(true)}
          >
            PRO
          </button>
        }
      >
        <span
          class="px-1.5 py-0.5 text-[9px] rounded cursor-pointer"
          style={{ background: 'var(--azu-accent)', color: 'var(--azu-surface)', opacity: '0.7' }}
          onClick={() => setShowLicense(true)}
        >
          PRO
        </span>
      </Show>

      {/* Opacity — inline slider, always visible */}
      <div class="flex items-center gap-1 mr-1">
        <input
          type="range"
          min="20"
          max="100"
          value={opacity()}
          class="w-16 h-0.5 rounded-full appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, var(--azu-accent) ${opacity()}%, var(--azu-border) ${opacity()}%)`,
          }}
          onInput={(e) => handleOpacity(parseInt((e.target as HTMLInputElement).value))}
          title={`Opacity ${opacity()}%`}
        />
      </div>

      {/* Pin on top */}
      <button
        class="h-7 w-7 flex items-center justify-center rounded-sm transition-colors"
        classList={{
          'text-accent bg-accent/10': pinned(),
          'text-text-muted hover:text-text hover:bg-surface': !pinned(),
        }}
        onClick={togglePin}
        title={pinned() ? 'Unpin' : 'Pin on top'}
      >
        <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.146.146A.5.5 0 0 1 4.5 0h7a.5.5 0 0 1 .5.5c0 .68-.342 1.174-.646 1.479-.126.125-.25.224-.354.298v4.431l.078.048c.203.127.476.314.751.555C12.36 7.775 13 8.527 13 9.5a.5.5 0 0 1-.5.5h-4v4.5a.5.5 0 0 1-1 0V10h-4A.5.5 0 0 1 3 9.5c0-.973.64-1.725 1.17-2.189A5.921 5.921 0 0 1 5 6.708V2.277a2.77 2.77 0 0 1-.354-.298C4.342 1.674 4 1.179 4 .5a.5.5 0 0 1 .146-.354z"/>
        </svg>
      </button>

      <SnippetPicker onRun={(cmd) => props.onLaunchAll?.(cmd)} />
      <ThemePicker />

      {/* Window controls — minimal, tight */}
      <div class="flex items-center ml-1.5 -mr-3">
        <button
          class="h-9 w-11 flex items-center justify-center text-text-muted hover:bg-white/10 hover:text-text transition-colors"
          onClick={() => win.minimize()}
          title="Minimize"
        >
          <svg width="10" height="10" viewBox="0 0 10 10"><rect y="4.5" width="10" height="1" fill="currentColor" rx="0.5"/></svg>
        </button>
        <button
          class="h-9 w-11 flex items-center justify-center text-text-muted hover:bg-white/10 hover:text-text transition-colors"
          onClick={() => win.maximize()}
          title="Maximize"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1"><rect x="1" y="1" width="8" height="8" rx="0.5"/></svg>
        </button>
        <button
          class="h-9 w-11 flex items-center justify-center text-text-muted hover:bg-red-500/90 hover:text-white transition-colors"
          onClick={() => win.close()}
          title="Close"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><line x1="2" y1="2" x2="8" y2="8"/><line x1="8" y1="2" x2="2" y2="8"/></svg>
        </button>
      </div>
      <Show when={showLicense()}>
        <LicensePanel
          colors={themeStore.themes[themeStore.activeId]?.colors}
          onClose={() => setShowLicense(false)}
        />
      </Show>
    </header>
  )
}

export default TitleBar
