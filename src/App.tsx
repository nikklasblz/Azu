import { Component } from 'solid-js'

const App: Component = () => {
  return (
    <div class="h-screen w-screen flex flex-col bg-surface text-text">
      <header class="h-10 flex items-center px-4 bg-surface-alt border-b border-border">
        <span class="font-bold text-accent">Azu</span>
      </header>
      <main class="flex-1">
        <p class="p-4 text-text-muted">Terminal grid will render here.</p>
      </main>
      <footer class="h-6 flex items-center px-4 bg-surface-alt border-t border-border text-xs text-text-muted">
        <span>Ready</span>
      </footer>
    </div>
  )
}

export default App
