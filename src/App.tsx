import { Component, createSignal, onMount, Show } from 'solid-js'
import TerminalComponent from './components/Terminal/Terminal'
import { pty } from './lib/tauri-commands'
import './styles/global.css'

const App: Component = () => {
  const [ptyId, setPtyId] = createSignal<string | null>(null)

  onMount(async () => {
    const id = await pty.create(24, 80)
    setPtyId(id)
  })

  return (
    <div class="h-screen w-screen flex flex-col bg-surface text-text">
      <header class="h-10 flex items-center px-4 bg-surface-alt border-b border-border shrink-0">
        <span class="font-bold text-accent">Azu</span>
      </header>
      <main class="flex-1 overflow-hidden">
        <Show when={ptyId()}>
          {(id) => <TerminalComponent ptyId={id()} />}
        </Show>
      </main>
      <footer class="h-6 flex items-center px-4 bg-surface-alt border-t border-border text-xs text-text-muted shrink-0">
        <span>Ready</span>
      </footer>
    </div>
  )
}

export default App
