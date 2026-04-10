// Azu — AI-Native Terminal
// Copyright (c) 2026 Nico Arriola <nico.arriola@gmail.com>
// github.com/nikklasblz/Azu

import { Component, createSignal, onMount, onCleanup, Show } from 'solid-js'
import TitleBar from './components/TitleBar/TitleBar'
import StatusBar from './components/StatusBar/StatusBar'
import GridContainer from './components/Grid/Grid'
import { gridStore, setGridStore, loadPresetsFromDisk, findNode, findAllLeaves } from './stores/grid'
import { themeStore, applyTheme } from './stores/theme'
import { pty, config, pipeline as pipelineCmd } from './lib/tauri-commands'
import { initKeybindings } from './lib/keybindings'
import { initPipelineListeners } from './stores/pipeline'
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

  const handleRunPipeline = async () => {
    const leaves = findAllLeaves(gridStore.root)
    const map = ptyMap()
    const panes = leaves
      .filter(n => n.pipeline)
      .map(n => ({
        cellId: n.id,
        ptyId: map[n.id] || '',
        cwd: n.cwd || '',
        config: n.pipeline!,
      }))
      .filter(p => p.ptyId)
    if (panes.length === 0) return
    await pipelineCmd.start(panes)
  }

  const handleStopPipeline = async () => {
    await pipelineCmd.stop()
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
    initPipelineListeners()
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
      <TitleBar onAddTab={() => {}} onLaunchAll={handleLaunchAll} onRunPipeline={handleRunPipeline} onStopPipeline={handleStopPipeline} />
      <main class="flex-1 overflow-hidden">
        <GridContainer ptyMap={ptyMap()} onRequestPty={handleRequestPty} />
      </main>
      <StatusBar />
    </div>
  )
}

export default App
