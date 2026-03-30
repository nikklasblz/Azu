// Azu — AI-Native Terminal
// Copyright (c) 2026 Nico Arriola <nico.arriola@gmail.com>

import { Component, For, Show, createSignal, onMount, onCleanup } from 'solid-js'
import { themeStore, applyTheme, getAvailableThemes } from '../../stores/theme'

const ThemePicker: Component = () => {
  let containerRef: HTMLDivElement | undefined
  const [open, setOpen] = createSignal(false)

  const handleClickOutside = (e: MouseEvent) => {
    if (containerRef && !containerRef.contains(e.target as Node)) setOpen(false)
  }
  onMount(() => document.addEventListener('mousedown', handleClickOutside))
  onCleanup(() => document.removeEventListener('mousedown', handleClickOutside))

  return (
    <div class="relative" ref={containerRef}>
      <button
        class="px-2 py-1 text-xs rounded hover:bg-white/6"
        style={{ color: 'var(--azu-text-muted)', border: '1px solid var(--azu-border)' }}
        onClick={() => setOpen(!open())}
        title="Change theme"
      >
        Theme
      </button>
      <Show when={open()}>
        <div
          class="absolute top-full right-0 mt-1 rounded-lg shadow-xl z-50 min-w-60 p-1.5 dropdown-enter"
          style={{ background: 'var(--azu-surface)', border: '1px solid var(--azu-border)' }}
        >
          <div class="px-2 py-1 text-[10px] uppercase tracking-wider" style={{ color: 'var(--azu-text-muted)' }}>Select Theme</div>
          <For each={getAvailableThemes()}>
            {(theme) => {
              const isActive = () => themeStore.activeId === theme.id
              return (
                <button
                  class="flex items-center gap-3 w-full px-2.5 py-2 text-left rounded-md"
                  style={{
                    // Each theme previews with ITS OWN colors — always readable
                    background: theme.colors.surfaceAlt,
                    color: theme.colors.text,
                    border: isActive() ? `1.5px solid ${theme.colors.accent}` : '1.5px solid transparent',
                    'margin-bottom': '2px',
                    'font-size': '13px',
                  }}
                  onClick={() => { applyTheme(theme.id); setOpen(false) }}
                >
                  <div class="flex gap-1 shrink-0">
                    <div class="w-3 h-3 rounded-full" style={{ background: theme.colors.surface, border: `1px solid ${theme.colors.border}` }} />
                    <div class="w-3 h-3 rounded-full" style={{ background: theme.colors.accent }} />
                    <div class="w-3 h-3 rounded-full" style={{ background: theme.colors.terminalBg, border: `1px solid ${theme.colors.border}` }} />
                  </div>
                  <span style={{ 'font-weight': isActive() ? '600' : '400' }}>{theme.name}</span>
                  {isActive() && <span style={{ 'margin-left': 'auto', color: theme.colors.accent, 'font-size': '11px' }}>active</span>}
                </button>
              )
            }}
          </For>
        </div>
      </Show>
    </div>
  )
}

export default ThemePicker
