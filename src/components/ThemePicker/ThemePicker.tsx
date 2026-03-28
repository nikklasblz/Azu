import { Component, For, Show, createSignal, onMount, onCleanup } from 'solid-js'
import { themeStore, applyTheme, getAvailableThemes } from '../../stores/theme'

const ThemePicker: Component = () => {
  let containerRef: HTMLDivElement | undefined
  const [open, setOpen] = createSignal(false)

  const handleClickOutside = (e: MouseEvent) => {
    if (containerRef && !containerRef.contains(e.target as Node)) {
      setOpen(false)
    }
  }

  onMount(() => document.addEventListener('mousedown', handleClickOutside))
  onCleanup(() => document.removeEventListener('mousedown', handleClickOutside))

  return (
    <div class="relative ml-auto" ref={containerRef}>
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
                class="flex items-center gap-3 w-full px-3 py-2 text-left text-sm rounded hover:bg-surface"
                classList={{ 'ring-1 ring-accent': themeStore.activeId === theme.id }}
                style={{ color: theme.colors.text, background: themeStore.activeId === theme.id ? theme.colors.surface : undefined }}
                onClick={() => { applyTheme(theme.id); setOpen(false) }}
              >
                <div class="flex gap-1 shrink-0">
                  <div class="w-3.5 h-3.5 rounded-full border border-white/20" style={{ background: theme.colors.surface }} />
                  <div class="w-3.5 h-3.5 rounded-full" style={{ background: theme.colors.accent }} />
                  <div class="w-3.5 h-3.5 rounded-full" style={{ background: theme.colors.text }} />
                </div>
                <span class="font-medium">{theme.name}</span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}

export default ThemePicker
