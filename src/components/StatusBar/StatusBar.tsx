import { Component, createMemo, createSignal, Show, For, onMount, onCleanup } from 'solid-js'
import { gridStore } from '../../stores/grid'
import { themeStore } from '../../stores/theme'
import { env } from '../../lib/tauri-commands'
import { updateAvailable, updateVersion, downloading, progress, readyToRestart, updateError, downloadAndInstall, restartApp } from '../../stores/updater'

interface ToolStatus {
  name: string
  installed: boolean
  version: string | null
}

function countLeaves(node: any): number {
  if (node.type === 'leaf') return 1
  return (node.children || []).reduce((acc: number, c: any) => acc + countLeaves(c), 0)
}

const StatusBar: Component = () => {
  let panelRef: HTMLDivElement | undefined
  const paneCount = createMemo(() => countLeaves(gridStore.root))
  const [showEnv, setShowEnv] = createSignal(false)
  const [tools, setTools] = createSignal<ToolStatus[]>([])
  const [loading, setLoading] = createSignal(false)

  const handleClickOutside = (e: MouseEvent) => {
    if (panelRef && !panelRef.contains(e.target as Node)) setShowEnv(false)
  }
  onMount(() => document.addEventListener('mousedown', handleClickOutside))
  onCleanup(() => document.removeEventListener('mousedown', handleClickOutside))

  const detectTools = async () => {
    setLoading(true)
    setShowEnv(true)
    try {
      const result = await env.detect()
      setTools(result)
    } catch { setTools([]) }
    setLoading(false)
  }

  return (
    <footer class="h-7 flex items-center px-4 text-xs shrink-0 gap-4 select-none" style={{ background: 'var(--azu-surface)', 'border-top': '1px solid var(--azu-border)', color: 'var(--azu-text-muted)', 'font-family': 'var(--azu-font-ui)', 'font-size': '11px' }}>
      <span class="text-success">● Ready</span>
      <span>{paneCount()} pane{paneCount() > 1 ? 's' : ''}</span>
      <span>{gridStore.activePreset || 'No preset'}</span>

      {/* Environment detection */}
      <div class="relative" ref={panelRef}>
        <button
          class="hover:text-text transition-colors"
          onClick={detectTools}
          title="Detect environment"
        >
          ⚡ Env
        </button>
        <Show when={showEnv()}>
          <div
            class="absolute bottom-full left-0 mb-1 rounded shadow-lg z-50 min-w-56 p-2"
            style={{ background: 'var(--azu-surface)', border: '1px solid var(--azu-border)' }}
          >
            <div class="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--azu-text-muted)' }}>
              Environment
            </div>
            <Show when={loading()}>
              <div class="text-xs animate-pulse" style={{ color: 'var(--azu-text-muted)' }}>Detecting...</div>
            </Show>
            <Show when={!loading()}>
              <For each={tools()}>
                {(tool) => (
                  <div class="flex items-center gap-2 py-0.5 text-xs">
                    <span style={{ color: tool.installed ? 'var(--azu-success)' : 'var(--azu-error)' }}>
                      {tool.installed ? '✓' : '✗'}
                    </span>
                    <span style={{ color: 'var(--azu-text)' }}>{tool.name}</span>
                    <span class="flex-1" />
                    <span style={{ color: 'var(--azu-text-muted)', 'font-size': '10px' }}>
                      {tool.version || (tool.installed ? '' : 'not found')}
                    </span>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </Show>
      </div>

      <div class="flex-1" />

      {/* Update badge */}
      <Show when={updateError()}>
        <span style={{ color: 'var(--azu-error)', cursor: 'default' }}>{updateError()}</span>
      </Show>
      <Show when={readyToRestart()}>
        <button
          class="hover:underline"
          style={{ color: 'var(--azu-accent)', cursor: 'pointer', background: 'none', border: 'none', padding: '0', font: 'inherit' }}
          onClick={restartApp}
          title="Restart to apply update"
        >
          Restart to update
        </button>
      </Show>
      <Show when={downloading() && !readyToRestart()}>
        <span style={{ color: 'var(--azu-accent)' }}>
          ↑ {progress()}%
        </span>
      </Show>
      <Show when={updateAvailable() && !downloading() && !readyToRestart()}>
        <button
          class="hover:underline"
          style={{ color: 'var(--azu-accent)', cursor: 'pointer', background: 'none', border: 'none', padding: '0', font: 'inherit' }}
          onClick={downloadAndInstall}
          title={`Update to ${updateVersion()}`}
        >
          ↑ v{updateVersion()}
        </button>
      </Show>

      <span>{themeStore.activeId}</span>
      <span>UTF-8</span>
    </footer>
  )
}

export default StatusBar
