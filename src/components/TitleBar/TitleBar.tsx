import { Component, createSignal, Show } from 'solid-js'
import PresetSwitcher from '../Grid/PresetSwitcher'
import ThemePicker from '../ThemePicker/ThemePicker'
import { win } from '../../lib/tauri-commands'

interface TitleBarProps {
  onAddTab?: () => void
}

const TitleBar: Component<TitleBarProps> = (props) => {
  const [pinned, setPinned] = createSignal(false)
  const [opacity, setOpacity] = createSignal(100)
  const [showOpacity, setShowOpacity] = createSignal(false)

  const togglePin = async () => {
    const next = !pinned()
    setPinned(next)
    await win.setAlwaysOnTop(next)
  }

  const handleOpacity = (value: number) => {
    setOpacity(value)
    // Apply opacity only to terminal containers, not UI chrome
    document.querySelectorAll('.xterm').forEach(el => {
      (el as HTMLElement).style.opacity = (value / 100).toString()
    })
  }

  return (
    <header
      class="h-9 flex items-center px-3 bg-surface-alt border-b border-border shrink-0 gap-2 select-none"
      data-tauri-drag-region
    >
      <span class="font-bold text-accent text-sm tracking-tight" data-tauri-drag-region>Azu</span>

      <PresetSwitcher />

      <div class="flex-1" data-tauri-drag-region />

      {/* Opacity control */}
      <div class="relative"
        onMouseLeave={() => setShowOpacity(false)}
      >
        <button
          class="h-6 px-1.5 text-xs rounded hover:bg-surface text-text-muted flex items-center gap-1"
          onClick={() => setShowOpacity(!showOpacity())}
          title={`Terminal opacity: ${opacity()}%`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" opacity="0.5"/>
            <path d="M12 2a10 10 0 0 1 0 20V2z"/>
          </svg>
          <Show when={opacity() < 100}>
            <span>{opacity()}</span>
          </Show>
        </button>
        <Show when={showOpacity()}>
          <div class="absolute top-full right-0 mt-1 bg-surface-alt border border-border rounded-lg shadow-lg z-50 p-3 w-40">
            <div class="text-[10px] text-text-muted mb-2 uppercase tracking-wider">Opacity</div>
            <input
              type="range"
              min="20"
              max="100"
              value={opacity()}
              class="w-full h-1 rounded-full appearance-none cursor-pointer accent-accent"
              style={{ background: `linear-gradient(to right, var(--azu-accent) ${opacity()}%, var(--azu-border) ${opacity()}%)` }}
              onInput={(e) => handleOpacity(parseInt((e.target as HTMLInputElement).value))}
            />
            <div class="text-center text-xs text-text mt-1">{opacity()}%</div>
          </div>
        </Show>
      </div>

      {/* Pin on top */}
      <button
        class="h-6 w-6 flex items-center justify-center rounded hover:bg-surface transition-colors"
        classList={{
          'text-accent': pinned(),
          'text-text-muted': !pinned(),
        }}
        onClick={togglePin}
        title={pinned() ? 'Unpin from top' : 'Pin on top'}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill={pinned() ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2">
          <path d="M12 2L12 22M12 2L8 6M12 2L16 6" transform={pinned() ? '' : 'rotate(45 12 12)'}/>
          <circle cx="12" cy="14" r="4"/>
        </svg>
      </button>

      <ThemePicker />

      {/* Window controls */}
      <div class="flex items-center ml-1">
        {/* Minimize */}
        <button
          class="h-8 w-10 flex items-center justify-center hover:bg-surface text-text-muted hover:text-text transition-colors"
          onClick={() => win.minimize()}
          title="Minimize"
        >
          <svg width="10" height="1" viewBox="0 0 10 1">
            <rect width="10" height="1" fill="currentColor"/>
          </svg>
        </button>
        {/* Maximize */}
        <button
          class="h-8 w-10 flex items-center justify-center hover:bg-surface text-text-muted hover:text-text transition-colors"
          onClick={() => win.maximize()}
          title="Maximize"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1">
            <rect x="0.5" y="0.5" width="9" height="9"/>
          </svg>
        </button>
        {/* Close */}
        <button
          class="h-8 w-10 flex items-center justify-center hover:bg-red-600 text-text-muted hover:text-white transition-colors rounded-tr"
          onClick={() => win.close()}
          title="Close"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" stroke-width="1.2">
            <line x1="1" y1="1" x2="9" y2="9"/>
            <line x1="9" y1="1" x2="1" y2="9"/>
          </svg>
        </button>
      </div>
    </header>
  )
}

export default TitleBar
