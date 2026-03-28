import { Component, createSignal, onMount, For, Show } from 'solid-js'
import TitleBar from './components/TitleBar/TitleBar'
import StatusBar from './components/StatusBar/StatusBar'
import GridContainer from './components/Grid/Grid'
import { gridStore, loadPresetsFromDisk, resetGrid, findNode } from './stores/grid'
import { pty } from './lib/tauri-commands'
import { initKeybindings } from './lib/keybindings'
import './styles/global.css'

interface Tab {
  id: string
  name: string
  ptyMap: Record<string, string>
}

let tabCounter = 1

const App: Component = () => {
  const [tabs, setTabs] = createSignal<Tab[]>([
    { id: 'tab-1', name: 'Terminal 1', ptyMap: {} }
  ])
  const [activeTabId, setActiveTabId] = createSignal('tab-1')

  const activeTab = () => tabs().find(t => t.id === activeTabId())

  const handleRequestPty = async (cellId: string) => {
    const node = findNode(gridStore.root, cellId)
    const cwd = node?.cwd || undefined
    const ptyId = await pty.create(24, 80, cwd)
    setTabs(prev => prev.map(t =>
      t.id === activeTabId()
        ? { ...t, ptyMap: { ...t.ptyMap, [cellId]: ptyId } }
        : t
    ))
  }

  const addTab = () => {
    tabCounter++
    const newTab: Tab = {
      id: `tab-${tabCounter}`,
      name: `Terminal ${tabCounter}`,
      ptyMap: {},
    }
    setTabs(prev => [...prev, newTab])
    setActiveTabId(newTab.id)
    resetGrid()
    // Auto-create PTY for new root
    setTimeout(async () => {
      const rootId = gridStore.root.id
      await handleRequestPty(rootId)
    }, 50)
  }

  const closeTab = (tabId: string) => {
    const remaining = tabs().filter(t => t.id !== tabId)
    if (remaining.length === 0) return // don't close last tab
    setTabs(remaining)
    if (activeTabId() === tabId) {
      setActiveTabId(remaining[0].id)
    }
  }

  const renameTab = (tabId: string, name: string) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, name } : t))
  }

  const handleLaunchAll = async (cmd: string) => {
    const tab = activeTab()
    if (!tab) return
    const ptyIds = Object.values(tab.ptyMap)
    for (const id of ptyIds) {
      pty.write(id, cmd)
      await new Promise(r => setTimeout(r, 50))
      pty.write(id, '\r')
      await new Promise(r => setTimeout(r, 100))
    }
  }

  onMount(async () => {
    initKeybindings()
    await loadPresetsFromDisk()
    const rootId = gridStore.root.id
    await handleRequestPty(rootId)
  })

  return (
    <div class="h-screen w-screen flex flex-col bg-surface text-text">
      <TitleBar onAddTab={addTab} onLaunchAll={handleLaunchAll} />
      {/* Tab bar */}
      <div class="h-8 flex items-center bg-surface-alt border-b border-border shrink-0 overflow-x-auto">
        <For each={tabs()}>
          {(tab) => {
            const [editing, setEditing] = createSignal(false)
            return (
              <div
                class="flex items-center h-full px-3 text-xs cursor-pointer border-r border-border gap-1 shrink-0 max-w-40"
                classList={{
                  'bg-surface text-text': activeTabId() === tab.id,
                  'text-text-muted hover:bg-surface/50': activeTabId() !== tab.id,
                }}
                onClick={() => setActiveTabId(tab.id)}
              >
                <Show when={editing()} fallback={
                  <span
                    class="truncate"
                    onDblClick={(e) => { e.stopPropagation(); setEditing(true) }}
                  >
                    {tab.name}
                  </span>
                }>
                  <input
                    class="w-20 text-xs bg-transparent border-none outline-none text-text"
                    value={tab.name}
                    autofocus
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        renameTab(tab.id, (e.target as HTMLInputElement).value)
                        setEditing(false)
                      }
                      if (e.key === 'Escape') setEditing(false)
                    }}
                    onBlur={(e) => {
                      renameTab(tab.id, e.target.value)
                      setEditing(false)
                    }}
                  />
                </Show>
                <Show when={tabs().length > 1}>
                  <button
                    class="text-text-muted hover:text-error ml-1"
                    onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
                  >✕</button>
                </Show>
              </div>
            )
          }}
        </For>
        <button
          class="px-3 h-full text-xs text-text-muted hover:text-text hover:bg-surface/50"
          onClick={addTab}
          title="New tab"
        >+</button>
      </div>
      <main class="flex-1 overflow-hidden">
        <Show when={activeTab()}>
          {(tab) => (
            <GridContainer ptyMap={tab().ptyMap} onRequestPty={handleRequestPty} />
          )}
        </Show>
      </main>
      <StatusBar />
    </div>
  )
}

export default App
