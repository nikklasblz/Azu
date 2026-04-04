// Azu — AI-Native Terminal
// Copyright (c) 2026 Nico Arriola <nico.arriola@gmail.com>
// github.com/nikklasblz/Azu

import { Component, createSignal, onMount, onCleanup, Show } from 'solid-js'
import TitleBar from './components/TitleBar/TitleBar'
import StatusBar from './components/StatusBar/StatusBar'
import GridContainer from './components/Grid/Grid'
import { gridStore, setGridStore, loadPresetsFromDisk, findNode, findAllLeaves } from './stores/grid'
import { themeStore, applyTheme } from './stores/theme'
import { pty, config } from './lib/tauri-commands'
import { initKeybindings } from './lib/keybindings'
import { loadSnippets } from './components/TitleBar/SnippetPicker'
import './styles/global.css'

// Single ptyMap — no tabs, just one grid
const [ptyMap, setPtyMap] = createSignal<Record<string, string>>({})

const App: Component = () => {
  const handleRequestPty = async (cellId: string) => {
    const node = findNode(gridStore.root, cellId)
    const cwd = node?.cwd || undefined
    const ptyId = await pty.create(24, 80, cwd)
    setPtyMap(prev => ({ ...prev, [cellId]: ptyId }))
  }

  const handleLaunchAll = async (cmd: string) => {
    const ids = Object.values(ptyMap())
    for (const id of ids) {
      pty.write(id, cmd)
      await new Promise(r => setTimeout(r, 50))
      pty.write(id, '\r')
      await new Promise(r => setTimeout(r, 100))
    }
  }

  const saveState = async () => {
    const state = {
      themeId: themeStore.activeId,
      gridRoot: JSON.parse(JSON.stringify(gridStore.root)),
    }
    await config.save('app-state', JSON.stringify(state)).catch(() => {})
  }

  onMount(async () => {
    initKeybindings({
      addTab: () => {},  // no tabs
      closeTab: () => {},
      getActiveTabId: () => 'main',
    })
    await loadPresetsFromDisk()
    await loadSnippets()

    // Auto-save
    const autoSaveInterval = setInterval(saveState, 30000)
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') saveState()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    onCleanup(() => {
      clearInterval(autoSaveInterval)
      document.removeEventListener('visibilitychange', handleVisibility)
    })

    // Restore theme
    try {
      const saved = await config.load('app-state')
      if (saved) {
        const state = JSON.parse(saved)
        if (state.themeId) applyTheme(state.themeId)
      }
    } catch {}

    // Create PTY for root cell
    const leaves = findAllLeaves(gridStore.root)
    for (const leaf of leaves) {
      await handleRequestPty(leaf.id)
    }
  })

  return (
    <div class="h-screen w-screen flex flex-col bg-surface text-text">
      <TitleBar onAddTab={() => {}} onLaunchAll={handleLaunchAll} />
      <main class="flex-1 overflow-hidden">
        <GridContainer ptyMap={ptyMap()} onRequestPty={handleRequestPty} />
      </main>
      <StatusBar />
    </div>
  )
}

export default App
