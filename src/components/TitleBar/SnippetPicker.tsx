import { Component, createSignal, Show, For, onMount, onCleanup } from 'solid-js'
import { config } from '../../lib/tauri-commands'

export interface Snippet {
  name: string
  command: string
}

const [snippets, setSnippets] = createSignal<Snippet[]>([])

// Load snippets from disk
export async function loadSnippets() {
  try {
    const data = await config.load('snippets')
    if (data) setSnippets(JSON.parse(data))
  } catch {}
}

async function saveSnippets() {
  await config.save('snippets', JSON.stringify(snippets())).catch(() => {})
}

interface Props {
  onRun: (command: string) => void
}

const SnippetPicker: Component<Props> = (props) => {
  let containerRef: HTMLDivElement | undefined
  const [open, setOpen] = createSignal(false)
  const [adding, setAdding] = createSignal(false)
  const [newName, setNewName] = createSignal('')
  const [newCmd, setNewCmd] = createSignal('')

  const handleClickOutside = (e: MouseEvent) => {
    if (containerRef && !containerRef.contains(e.target as Node)) { setOpen(false); setAdding(false) }
  }
  onMount(() => document.addEventListener('mousedown', handleClickOutside))
  onCleanup(() => document.removeEventListener('mousedown', handleClickOutside))

  const addSnippet = () => {
    if (!newName().trim() || !newCmd().trim()) return
    setSnippets([...snippets(), { name: newName().trim(), command: newCmd().trim() }])
    saveSnippets()
    setNewName(''); setNewCmd(''); setAdding(false)
  }

  const removeSnippet = (idx: number) => {
    setSnippets(snippets().filter((_, i) => i !== idx))
    saveSnippets()
  }

  return (
    <div class="relative" ref={containerRef}>
      <button
        class="px-2 py-1 text-xs border border-border rounded hover:bg-surface text-text-muted"
        onClick={() => setOpen(!open())}
        title="Command snippets"
      >
        ⚡ Snippets
      </button>
      <Show when={open()}>
        <div
          class="absolute top-full left-0 mt-1 rounded shadow-lg z-50 min-w-56 p-1"
          style={{ background: 'var(--azu-surface)', border: '1px solid var(--azu-border)' }}
        >
          <Show when={snippets().length === 0 && !adding()}>
            <div class="px-3 py-2 text-xs" style={{ color: 'var(--azu-text-muted)' }}>No snippets saved</div>
          </Show>
          <For each={snippets()}>
            {(snip, idx) => (
              <div class="flex items-center group">
                <button
                  class="flex-1 px-3 py-1.5 text-left text-xs hover:bg-white/10"
                  style={{ color: 'var(--azu-text)' }}
                  onClick={() => { props.onRun(snip.command); setOpen(false) }}
                  title={snip.command}
                >
                  <div style={{ color: 'var(--azu-text)' }}>{snip.name}</div>
                  <div class="truncate" style={{ color: 'var(--azu-text-muted)', 'font-size': '10px', 'font-family': 'monospace' }}>{snip.command}</div>
                </button>
                <button
                  class="px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: 'var(--azu-error)' }}
                  onClick={(e) => { e.stopPropagation(); removeSnippet(idx()) }}
                  title="Delete"
                >✕</button>
              </div>
            )}
          </For>
          <Show when={adding()}>
            <div class="border-t p-2 flex flex-col gap-1" style={{ 'border-color': 'var(--azu-border)' }}>
              <input
                class="px-2 py-1 text-xs rounded"
                style={{ background: 'var(--azu-surface-alt)', color: 'var(--azu-text)', border: '1px solid var(--azu-border)' }}
                placeholder="Name"
                value={newName()}
                onInput={(e) => setNewName(e.target.value)}
                autofocus
              />
              <input
                class="px-2 py-1 text-xs rounded font-mono"
                style={{ background: 'var(--azu-surface-alt)', color: 'var(--azu-text)', border: '1px solid var(--azu-border)' }}
                placeholder="Command"
                value={newCmd()}
                onInput={(e) => setNewCmd(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addSnippet()}
              />
              <div class="flex gap-1 justify-end">
                <button class="px-2 py-0.5 text-xs" style={{ color: 'var(--azu-text-muted)' }} onClick={() => setAdding(false)}>Cancel</button>
                <button class="px-2 py-0.5 text-xs rounded" style={{ background: 'var(--azu-accent)', color: 'var(--azu-surface)' }} onClick={addSnippet}>Save</button>
              </div>
            </div>
          </Show>
          <Show when={!adding()}>
            <div class="border-t p-1" style={{ 'border-color': 'var(--azu-border)' }}>
              <button
                class="w-full px-3 py-1.5 text-left text-xs hover:bg-white/10"
                style={{ color: 'var(--azu-accent)' }}
                onClick={() => setAdding(true)}
              >+ Add snippet</button>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  )
}

export default SnippetPicker
