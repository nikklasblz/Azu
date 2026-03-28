import { Component, createSignal, onMount } from 'solid-js'
import GridContainer from './components/Grid/Grid'
import { gridStore } from './stores/grid'
import { pty } from './lib/tauri-commands'
import './styles/global.css'

const App: Component = () => {
  const [ptyMap, setPtyMap] = createSignal<Record<string, string>>({})

  const handleRequestPty = async (cellId: string) => {
    const ptyId = await pty.create(24, 80)
    setPtyMap((prev) => ({ ...prev, [cellId]: ptyId }))
  }

  onMount(async () => {
    const rootId = gridStore.root.id
    await handleRequestPty(rootId)
  })

  return (
    <div class="h-screen w-screen flex flex-col bg-surface text-text">
      <header class="h-10 flex items-center px-4 bg-surface-alt border-b border-border shrink-0">
        <span class="font-bold text-accent">Azu</span>
      </header>
      <main class="flex-1 overflow-hidden">
        <GridContainer ptyMap={ptyMap()} onRequestPty={handleRequestPty} />
      </main>
      <footer class="h-6 flex items-center px-4 bg-surface-alt border-t border-border text-xs text-text-muted shrink-0">
        <span>Ready</span>
      </footer>
    </div>
  )
}

export default App
