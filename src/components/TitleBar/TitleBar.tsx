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
    document.body.style.opacity = (value / 100).toString()
  }

  return (
    <header
      class="h-10 flex items-center px-3 bg-surface-alt border-b border-border shrink-0 gap-2 select-none"
      data-tauri-drag-region
    >
      <span class="font-bold text-accent text-sm" data-tauri-drag-region>Azu</span>

      <PresetSwitcher />

      <div class="flex-1" data-tauri-drag-region />

      {/* Opacity slider */}
      <div class="relative">
        <button
          class="px-1.5 py-0.5 text-xs rounded hover:bg-surface text-text-muted"
          onClick={() => setShowOpacity(!showOpacity())}
          title={`Opacity: ${opacity()}%`}
        >
          {opacity() < 100 ? `${opacity()}%` : '◧'}
        </button>
        <Show when={showOpacity()}>
          <div class="absolute top-full right-0 mt-1 bg-surface-alt border border-border rounded shadow-lg z-50 p-2 min-w-36">
            <div class="text-xs text-text-muted mb-1">Opacity: {opacity()}%</div>
            <input
              type="range"
              min="30"
              max="100"
              value={opacity()}
              class="w-full accent-accent"
              onInput={(e) => handleOpacity(parseInt((e.target as HTMLInputElement).value))}
            />
          </div>
        </Show>
      </div>

      {/* Always on top toggle */}
      <button
        class="px-1.5 py-0.5 text-xs rounded hover:bg-surface"
        classList={{
          'text-accent': pinned(),
          'text-text-muted': !pinned(),
        }}
        onClick={togglePin}
        title={pinned() ? 'Unpin from top' : 'Pin on top'}
      >
        📌
      </button>

      <ThemePicker />

      {/* Window controls */}
      <div class="flex items-center gap-0.5 ml-2">
        <button
          class="w-7 h-7 flex items-center justify-center rounded hover:bg-surface text-text-muted hover:text-text text-xs"
          onClick={() => win.minimize()}
          title="Minimize"
        >─</button>
        <button
          class="w-7 h-7 flex items-center justify-center rounded hover:bg-surface text-text-muted hover:text-text text-xs"
          onClick={() => win.maximize()}
          title="Maximize"
        >□</button>
        <button
          class="w-7 h-7 flex items-center justify-center rounded hover:bg-error/20 text-text-muted hover:text-error text-xs"
          onClick={() => win.close()}
          title="Close"
        >✕</button>
      </div>
    </header>
  )
}

export default TitleBar
