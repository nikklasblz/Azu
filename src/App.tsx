import { Component, createSignal, onMount } from 'solid-js'
import TitleBar from './components/TitleBar/TitleBar'
import StatusBar from './components/StatusBar/StatusBar'
import GridContainer from './components/Grid/Grid'
import { gridStore } from './stores/grid'
import { pty } from './lib/tauri-commands'
import { initKeybindings } from './lib/keybindings'
import './styles/global.css'

const App: Component = () => {
  const [ptyMap, setPtyMap] = createSignal<Record<string, string>>({})

  const handleRequestPty = async (cellId: string) => {
    const ptyId = await pty.create(24, 80)
    setPtyMap((prev) => ({ ...prev, [cellId]: ptyId }))
  }

  onMount(async () => {
    initKeybindings()
    const rootId = gridStore.root.id
    await handleRequestPty(rootId)
  })

  return (
    <div class="h-screen w-screen flex flex-col bg-surface text-text">
      <TitleBar />
      <main class="flex-1 overflow-hidden">
        <GridContainer ptyMap={ptyMap()} onRequestPty={handleRequestPty} />
      </main>
      <StatusBar />
    </div>
  )
}

export default App
