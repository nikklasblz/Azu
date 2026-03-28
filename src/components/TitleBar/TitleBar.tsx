import { Component, createSignal } from 'solid-js'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import PresetSwitcher from '../Grid/PresetSwitcher'
import ThemePicker from '../ThemePicker/ThemePicker'
import { win } from '../../lib/tauri-commands'

interface TitleBarProps {
  onAddTab?: () => void
}

const TitleBar: Component<TitleBarProps> = (props) => {
  const [pinned, setPinned] = createSignal(false)
  const [opacity, setOpacity] = createSignal(100)

  const togglePin = async () => {
    const next = !pinned()
    setPinned(next)
    await win.setAlwaysOnTop(next)
  }

  const handleOpacity = async (value: number) => {
    setOpacity(value)
    // Real window transparency — see desktop/browser behind
    const w = getCurrentWebviewWindow()
    await w.setOpacity(value / 100)
  }

  return (
    <header
      class="h-9 flex items-center px-3 bg-surface-alt border-b border-border shrink-0 gap-1.5 select-none"
      data-tauri-drag-region
    >
      <span class="font-semibold text-accent text-xs tracking-tight mr-1" data-tauri-drag-region>Azu</span>

      <PresetSwitcher />

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
