import { Component, For, Show, createSignal } from 'solid-js'
import { themeStore, applyTheme, getAvailableThemes } from '../../stores/theme'

const ThemePicker: Component = () => {
  const [open, setOpen] = createSignal(false)

  return (
    <div class="relative ml-auto">
      <button
        class="px-2 py-1 text-xs border border-border rounded hover:bg-surface text-text-muted"
        onClick={() => setOpen(!open())}
        title="Change theme"
      >
        ◐ Theme
      </button>
      <Show when={open()}>
        <div class="absolute top-full right-0 mt-1 bg-surface-alt border border-border rounded shadow-lg z-50 min-w-56 p-2">
          <div class="text-xs text-text-muted mb-2 px-2">Select Theme</div>
          <For each={getAvailableThemes()}>
            {(theme) => (
              <button
                class="flex items-center gap-3 w-full px-3 py-2 text-left text-sm rounded hover:bg-surface text-text"
                classList={{ 'ring-1 ring-accent': themeStore.activeId === theme.id }}
                onClick={() => { applyTheme(theme.id); setOpen(false) }}
              >
                <div class="flex gap-0.5 shrink-0">
                  <div class="w-3 h-3 rounded-full" style={{ background: theme.colors.surface }} />
                  <div class="w-3 h-3 rounded-full" style={{ background: theme.colors.accent }} />
                  <div class="w-3 h-3 rounded-full" style={{ background: theme.colors.text }} />
                </div>
                <span>{theme.name}</span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}

export default ThemePicker
