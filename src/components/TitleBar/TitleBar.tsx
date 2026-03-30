import { Component, createSignal, Show, For, onMount, onCleanup, createMemo, createEffect } from 'solid-js'
import PresetSwitcher from '../Grid/PresetSwitcher'
import ThemePicker from '../ThemePicker/ThemePicker'
import SnippetPicker from './SnippetPicker'
import { win } from '../../lib/tauri-commands'
import { setBgAlpha, themeStore } from '../../stores/theme'

interface TitleBarProps {
  onAddTab?: () => void
  onLaunchAll?: (cmd: string) => void
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

  const handleClickOutsideLaunch = (e: MouseEvent) => {
    if (launchRef && !launchRef.contains(e.target as Node)) setShowLaunch(false)
  }
  onMount(() => document.addEventListener('mousedown', handleClickOutsideLaunch))
  onCleanup(() => document.removeEventListener('mousedown', handleClickOutsideLaunch))

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
      <span
        class="text-xs font-bold tracking-widest uppercase mr-0.5"
        style={{ color: 'var(--azu-accent)', 'font-family': 'var(--azu-font-mono)', 'letter-spacing': '0.15em' }}
        data-tauri-drag-region
      >AZU</span>

      <PresetSwitcher />

      {/* Launch All — sends command to every open shell */}
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

      <div class="flex-1" data-tauri-drag-region />

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
    </header>
  )
}

export default TitleBar
