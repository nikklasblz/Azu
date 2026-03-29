import { Component, For, createSignal, Show, onMount, onCleanup } from 'solid-js'
import { gridStore, savePreset, loadPreset, deletePreset } from '../../stores/grid'

const PresetSwitcher: Component = () => {
  let dropdownRef: HTMLDivElement | undefined
  const [showDropdown, setShowDropdown] = createSignal(false)
  const [newName, setNewName] = createSignal('')

  const presetNames = () => Object.keys(gridStore.presets)

  const handleSave = () => {
    const name = newName().trim()
    if (name) {
      savePreset(name)
      setNewName('')
    }
  }

  const handleUpdate = () => {
    const name = gridStore.activePreset
    if (name) {
      savePreset(name)
    }
  }

  // Close dropdown on click outside
  const handleClickOutside = (e: MouseEvent) => {
    if (dropdownRef && !dropdownRef.contains(e.target as Node)) {
      setShowDropdown(false)
    }
  }

  onMount(() => document.addEventListener('mousedown', handleClickOutside))
  onCleanup(() => document.removeEventListener('mousedown', handleClickOutside))

  return (
    <div class="relative" ref={dropdownRef}>
      <button
        class="px-2 py-1 text-xs border border-border rounded hover:bg-surface text-text-muted"
        onClick={() => setShowDropdown(!showDropdown())}
      >
        {gridStore.activePreset || 'Layouts'} ▾
      </button>
      <Show when={showDropdown()}>
        <div class="absolute top-full left-0 mt-1 bg-surface-alt border border-border rounded shadow-lg z-50 min-w-52">
          <Show when={presetNames().length === 0}>
            <div class="px-4 py-3 text-xs text-text-muted">No saved layouts</div>
          </Show>
          <For each={presetNames()}>
            {(name) => (
              <div class="flex items-center hover:bg-surface group">
                <button
                  class="flex-1 px-4 py-2 text-left text-sm"
                  classList={{
                    'text-accent font-medium': gridStore.activePreset === name,
                    'text-text': gridStore.activePreset !== name,
                  }}
                  onClick={() => { loadPreset(name); setShowDropdown(false) }}
                >
                  {name}
                </button>
                <button
                  class="px-2 py-2 text-text-muted opacity-0 group-hover:opacity-100 hover:text-error transition-opacity"
                  onClick={(e) => { e.stopPropagation(); deletePreset(name) }}
                  title="Delete layout"
                >
                  <svg width="8" height="8" viewBox="0 0 10 10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
                    <line x1="2" y1="2" x2="8" y2="8" />
                    <line x1="8" y1="2" x2="2" y2="8" />
                  </svg>
                </button>
              </div>
            )}
          </For>
          {/* Update active preset */}
          <Show when={gridStore.activePreset}>
            <div class="border-t border-border p-2">
              <button
                class="w-full px-2 py-1.5 text-xs bg-accent/15 text-accent rounded hover:bg-accent/25"
                onClick={() => { handleUpdate(); setShowDropdown(false) }}
              >
                Update "{gridStore.activePreset}"
              </button>
            </div>
          </Show>
          {/* Save as new */}
          <div class="border-t border-border p-2 flex gap-1">
            <input
              class="flex-1 px-2 py-1.5 text-xs bg-surface border border-border rounded text-text"
              placeholder="Save as new..."
              value={newName()}
              onInput={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
            <button
              class="px-3 py-1.5 text-xs bg-accent text-surface rounded font-medium"
              onClick={handleSave}
            >
              Save Layout
            </button>
          </div>
        </div>
      </Show>
    </div>
  )
}

export default PresetSwitcher
