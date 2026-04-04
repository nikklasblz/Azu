// Azu — AI-Native Terminal
// Copyright (c) 2026 Nico Arriola <nico.arriola@gmail.com>
// github.com/nikklasblz/Azu

import { Component, createSignal, onMount, onCleanup, For, Show } from 'solid-js'
import TitleBar from './components/TitleBar/TitleBar'
import StatusBar from './components/StatusBar/StatusBar'
import GridContainer from './components/Grid/Grid'
import { gridStore, setGridStore, loadPresetsFromDisk, resetGrid, findNode, findAllLeaves } from './stores/grid'
import { themeStore, applyTheme } from './stores/theme'
import { pty, config } from './lib/tauri-commands'
import { destroyTerminal } from './components/Terminal/Terminal'
import { initKeybindings } from './lib/keybindings'
import { loadSnippets } from './components/TitleBar/SnippetPicker'
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
    // Kill all PTYs in the closing tab
    const closing = tabs().find(t => t.id === tabId)
    if (closing) {
      Object.values(closing.ptyMap).forEach(ptyId => {
        destroyTerminal(ptyId)
        pty.close(ptyId).catch(() => {})
      })
    }
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

  const saveState = async () => {
    const state = {
      tabs: tabs().map(t => ({ id: t.id, name: t.name })),
      activeTabId: activeTabId(),
      themeId: themeStore.activeId,
      gridRoot: JSON.parse(JSON.stringify(gridStore.root)),
    }
    await config.save('app-state', JSON.stringify(state)).catch(() => {})
  }

  onMount(async () => {
    initKeybindings({ addTab, closeTab, getActiveTabId: () => activeTabId() })
    await loadPresetsFromDisk()
    await loadSnippets()

    // Auto-save state periodically
    const autoSaveInterval = setInterval(saveState, 30000)
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') saveState()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    onCleanup(() => {
      clearInterval(autoSaveInterval)
      document.removeEventListener('visibilitychange', handleVisibility)
    })

    // Restore previous state if available
    try {
      const saved = await config.load('app-state')
      if (saved) {
        const state = JSON.parse(saved)
        if (state.themeId) applyTheme(state.themeId)
        // Restore grid and create PTYs for all leaves
        if (state.gridRoot) {
          setGridStore('root', state.gridRoot)
        }
      }
    } catch {}

    // Create PTYs for all leaves in the grid
    const leaves = findAllLeaves(gridStore.root)
    for (const leaf of leaves) {
      await handleRequestPty(leaf.id)
    }
  })

  return (
    <div class="h-screen w-screen flex flex-col bg-surface text-text">
      <TitleBar onAddTab={addTab} onLaunchAll={handleLaunchAll} />
      {/* Tab bar */}
      <div class="h-9 flex items-center shrink-0 overflow-x-auto" style={{ background: 'var(--azu-surface)', 'border-bottom': '1px solid var(--azu-border)' }}>
        <For each={tabs()}>
          {(tab) => {
            const [editing, setEditing] = createSignal(false)
            const isActive = () => activeTabId() === tab.id
            return (
              <div
                class="flex items-center h-full px-4 text-xs cursor-pointer gap-1.5 shrink-0 max-w-44 relative"
                style={{
                  color: isActive() ? 'var(--azu-text)' : 'var(--azu-text-muted)',
                  background: isActive() ? 'var(--azu-surface-alt)' : 'transparent',
                  'font-family': 'var(--azu-font-ui)',
                  'font-weight': isActive() ? '600' : '400',
                  'border-right': '1px solid var(--azu-border)',
                }}
                draggable={true}
                onDragStart={(e) => {
                  e.dataTransfer?.setData('text/azu-tab-id', tab.id)
                  e.dataTransfer!.effectAllowed = 'move'
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const sourceId = e.dataTransfer?.getData('text/azu-tab-id')
                  if (sourceId && sourceId !== tab.id) {
                    setTabs(prev => {
                      const arr = [...prev]
                      const fromIdx = arr.findIndex(t => t.id === sourceId)
                      const toIdx = arr.findIndex(t => t.id === tab.id)
                      if (fromIdx === -1 || toIdx === -1) return prev
                      const [moved] = arr.splice(fromIdx, 1)
                      arr.splice(toIdx, 0, moved)
                      return arr
                    })
                  }
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
                      if (e.key === 'Escape') {
                        (e.target as HTMLInputElement).dataset.cancelled = 'true'
                        setEditing(false)
                      }
                    }}
                    onBlur={(e) => {
                      if (e.target.dataset.cancelled !== 'true') {
                        renameTab(tab.id, e.target.value)
                      }
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
          class="px-3 h-full text-xs hover:bg-white/5"
          style={{ color: 'var(--azu-text-muted)', 'font-size': '16px', 'line-height': '1' }}
          onClick={addTab}
          title="New tab (Ctrl+T)"
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
