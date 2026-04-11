import { Component, Show, For, createSignal } from 'solid-js'
import SftpPanel from './SftpPanel'
import { GridNode, splitHorizontal, splitVertical, removeCell, setCellLabel, setCellTheme, setCellCwd, swapCells, gridStore, findAllLeaves } from '../../stores/grid'
import { getAvailableThemes, themeStore, bgColor, toolbarColor } from '../../stores/theme'
import { dialog, pty } from '../../lib/tauri-commands'
import { pipelineStore, proEnabled } from '../../stores/pipeline'
import { connections, forwards, addForward, removeForward } from '../../stores/ssh'
import TerminalComponent from '../Terminal/Terminal'
import PipelineConfigPanel from './PipelineConfigPanel'
import SshHostPicker from './SshHostPicker'

interface GridCellProps {
  node: GridNode
  ptyId?: string
  onRequestPty: (cellId: string) => void
  onSplit?: () => void
}

const GridCell: Component<GridCellProps> = (props) => {
  const [hovered, setHovered] = createSignal(false)
  const [editing, setEditing] = createSignal(false)
  const [showThemeMenu, setShowThemeMenu] = createSignal(false)
  const [showLaunchMenu, setShowLaunchMenu] = createSignal(false)
  const [showSwapMenu, setShowSwapMenu] = createSignal(false)
  const [showPipelineConfig, setShowPipelineConfig] = createSignal(false)
  const [showSshPicker, setShowSshPicker] = createSignal(false)
  const [showSftp, setShowSftp] = createSignal(false)
  const [showForwards, setShowForwards] = createSignal(false)
  const [fwdType, setFwdType] = createSignal<'local' | 'remote'>('local')
  const [fwdLocalPort, setFwdLocalPort] = createSignal('')
  const [fwdRemoteHostPort, setFwdRemoteHostPort] = createSignal('')

  const paneStatus = () => pipelineStore.paneStates[props.node.id]?.status

  const sshConnection = () => {
    const s = props.node.ssh
    if (!s) return null
    return connections[s.connectionId] || null
  }
  const sshStatus = () => sshConnection()?.status

  const otherLeaves = () => findAllLeaves(gridStore.root).filter(n => n.id !== props.node.id)

  const launchOptions = [
    { label: 'Claude', cmd: 'claude' },
    { label: 'Claude (yolo)', cmd: 'claude --dangerously-skip-permissions' },
    { label: 'Codex', cmd: 'codex' },
    { label: 'Codex (full-auto)', cmd: 'codex --full-auto' },
  ]

  const sendCommand = async (cmd: string) => {
    if (!props.ptyId) return
    await pty.write(props.ptyId, cmd)
    await new Promise(r => setTimeout(r, 50))
    await pty.write(props.ptyId, '\r')
    setShowLaunchMenu(false)
  }

  const handleSplit = (direction: 'h' | 'v') => {
    if (direction === 'h') splitHorizontal(props.node.id)
    else splitVertical(props.node.id)
    if (props.onSplit) setTimeout(() => props.onSplit!(), 50)
  }

  const handlePickFolder = async () => {
    const folder = await dialog.pickFolder()
    if (folder && props.ptyId) {
      setCellCwd(props.node.id, folder)
      const id = props.ptyId
      // Delay after native dialog — ConPTY needs time to restore input state
      await new Promise(r => setTimeout(r, 200))
      // PowerShell-safe: single quotes prevent variable expansion; works across drives natively
      const safePath = folder.replace(/'/g, "''")
      await pty.write(id, `cd '${safePath}'`)
      await new Promise(r => setTimeout(r, 50))
      await pty.write(id, '\r')
    }
  }

  const abbreviatedCwd = () => {
    const cwd = props.node.cwd
    if (!cwd) return null
    const parts = cwd.replace(/\\/g, '/').split('/').filter(Boolean)
    if (parts.length <= 2) return parts.join('/')
    return '.../' + parts.slice(-2).join('/')
  }

  const cellTheme = () => {
    const tid = props.node.themeId
    if (tid) return themeStore.themes[tid]
    return null
  }

  // Always returns solid colors — never CSS variables
  const colors = () => {
    const t = cellTheme() || themeStore.themes[themeStore.activeId]
    return t?.colors || { surface: '#0d1117', surfaceAlt: '#161b22', border: '#30363d', text: '#c9d1d9', textMuted: '#8b949e', accent: '#58a6ff', error: '#f85149' } as any
  }

  const cellStyle = () => {
    const t = cellTheme()
    if (!t) return {}
    return {
      '--azu-surface': bgColor(t.colors.surface),
      '--azu-surface-alt': bgColor(t.colors.surfaceAlt),
      '--azu-border': t.colors.border,
      '--azu-text': t.colors.text,
      '--azu-text-muted': t.colors.textMuted,
      '--azu-accent': t.colors.accent,
      '--azu-success': t.colors.success,
      '--azu-error': t.colors.error,
      'background-color': bgColor(t.colors.surface),
      'color': t.colors.text,
    } as Record<string, string>
  }

  return (
    <div
      class="relative w-full h-full overflow-hidden flex flex-col"
      style={{
        ...cellStyle(),
        ...(sshStatus() === 'connected' ? { 'border-top': '2px solid #3fb950' } : {}),
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setShowThemeMenu(false); setShowLaunchMenu(false); setShowSwapMenu(false); setShowPipelineConfig(false); setShowSshPicker(false); setShowSftp(false); setShowForwards(false) }}
    >
      {/* Cell toolbar */}
      <div
        class="h-7 flex items-center px-1.5 shrink-0 gap-1"
        style={{
          'background-color': bgColor(colors().surfaceAlt),
          'border-bottom': `1px solid ${colors().border}`,
          color: toolbarColor(colors()),
          'font-family': 'var(--azu-font-ui)',
        }}
      >
        {/* Swap pane position */}
        <Show when={otherLeaves().length > 0}>
          <div class="relative">
            <button
              class="w-7 h-6 flex items-center justify-center rounded hover:bg-white/6"
              style={{ color: toolbarColor(colors()) }}
              onClick={() => setShowSwapMenu(!showSwapMenu())}
              title="Swap with another pane"
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2">
                <path d="M2 4L5 1L8 4" /><line x1="5" y1="1" x2="5" y2="8" />
                <path d="M10 8L7 11L4 8" /><line x1="7" y1="11" x2="7" y2="4" />
              </svg>
            </button>
            <Show when={showSwapMenu()}>
              <div
                class="absolute top-full left-0 rounded shadow-lg z-50 min-w-36 p-1"
                style={{ background: colors().surface, border: `1px solid ${colors().border}` }}
              >
                <div class="px-2 py-1 text-[10px]" style={{ color: colors().textMuted }}>Swap with</div>
                <For each={otherLeaves()}>
                  {(leaf) => (
                    <button
                      class="w-full px-2 py-1 text-left text-xs hover:bg-white/10"
                      style={{ color: colors().text }}
                      onClick={() => {
                        swapCells(props.node.id, leaf.id)
                        setShowSwapMenu(false)
                      }}
                    >
                      {leaf.label || leaf.cwd?.split(/[/\\]/).pop() || leaf.id}
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </Show>
        <button
          class="w-7 h-6 flex items-center justify-center rounded hover:bg-white/6"
          style={{ color: toolbarColor(colors()) }}
          onClick={() => handleSplit('h')}
          title="Split Right"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2">
            <rect x="1" y="1" width="10" height="10" />
            <line x1="6" y1="1" x2="6" y2="11" />
          </svg>
        </button>
        <button
          class="w-7 h-6 flex items-center justify-center rounded hover:bg-white/6"
          style={{ color: toolbarColor(colors()) }}
          onClick={() => handleSplit('v')}
          title="Split Down"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2">
            <rect x="1" y="1" width="10" height="10" />
            <line x1="1" y1="6" x2="11" y2="6" />
          </svg>
        </button>
        <button
          class="w-7 h-6 flex items-center justify-center rounded hover:bg-white/6"
          style={{ color: toolbarColor(colors()) }}
          onClick={handlePickFolder}
          title={props.node.cwd || 'Set project folder'}
        >
          <svg width="11" height="11" viewBox="0 0 16 14" fill="none" stroke="currentColor" stroke-width="1.2">
            <path d="M1 2h5l2 2h6v8H1V2z" />
          </svg>
        </button>

        {/* Launch CLI */}
        <div class="relative">
          <button
            class="w-7 h-6 flex items-center justify-center rounded hover:bg-white/6"
            style={{ color: colors().accent }}
            onClick={() => setShowLaunchMenu(!showLaunchMenu())}
            title="Launch CLI"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor">
              <polygon points="3,1 10,6 3,11" />
            </svg>
          </button>
          <Show when={showLaunchMenu()}>
            <div
              class="absolute top-full left-0 mt-1 rounded shadow-lg z-50 min-w-48 p-1"
              style={{
                background: colors().surface,
                border: `1px solid ${colors().border}`,
              }}
            >
              <div class="px-3 py-1 text-[10px] font-medium" style={{ color: colors().textMuted }}>Launch CLI</div>
              <For each={launchOptions}>
                {(opt) => (
                  <button
                    class="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs hover:bg-white/10"
                    style={{ color: colors().text }}
                    onClick={() => sendCommand(opt.cmd)}
                  >
                    {opt.label}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>

        {/* SSH button */}
        <div class="relative">
          <button
            class="w-7 h-6 flex items-center justify-center rounded hover:bg-white/6"
            onClick={() => setShowSshPicker(!showSshPicker())}
            title={sshConnection() ? `SSH: ${sshConnection()!.user}@${sshConnection()!.host}` : 'SSH connect'}
            style={{
              color: sshStatus() === 'connected'
                ? '#3fb950'
                : sshStatus() === 'reconnecting'
                  ? '#d29922'
                  : toolbarColor(colors()),
            }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2">
              <rect x="1" y="3" width="7" height="6" rx="1" />
              <line x1="8" y1="6" x2="11" y2="6" />
              <path d="M9.5 4.5L11 6L9.5 7.5" />
            </svg>
          </button>
          <Show when={showSshPicker()}>
            <SshHostPicker
              cellId={props.node.id}
              colors={colors()}
              onClose={() => setShowSshPicker(false)}
              onConnected={(connectionId) => setShowSshPicker(false)}
            />
          </Show>
        </div>

        {/* SFTP button — only when SSH connected */}
        <Show when={sshStatus() === 'connected'}>
          <button
            class="w-7 h-6 flex items-center justify-center rounded hover:bg-white/6"
            onClick={() => setShowSftp(!showSftp())}
            title="SFTP file browser"
            style={{
              color: showSftp() ? colors().accent : toolbarColor(colors()),
            }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2">
              <path d="M1 2h4l1.5 1.5H11v6.5H1V2z" />
              <line x1="4" y1="7" x2="8" y2="7" />
              <line x1="6" y1="5" x2="6" y2="9" />
            </svg>
          </button>
        </Show>

        {/* Port forwards button — only when SSH connected */}
        <Show when={sshStatus() === 'connected'}>
          <div class="relative">
            <button
              class="w-7 h-6 flex items-center justify-center rounded hover:bg-white/6"
              style={{ color: forwards().length > 0 ? colors().accent : toolbarColor(colors()) }}
              onClick={() => setShowForwards(!showForwards())}
              title="Port forwards"
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2">
                <path d="M1 6h10M8 3l3 3-3 3" />
              </svg>
            </button>
            <Show when={showForwards()}>
              <div
                class="absolute top-full left-0 mt-1 rounded shadow-lg z-50 min-w-64 p-2"
                style={{
                  background: colors().surface,
                  border: `1px solid ${colors().border}`,
                }}
              >
                <div class="px-1 py-1 text-[10px] uppercase tracking-wider" style={{ color: colors().textMuted }}>
                  Port Forwards
                </div>
                {/* Active forwards list */}
                <Show when={forwards().length === 0}>
                  <div class="px-1 py-1 text-xs" style={{ color: colors().textMuted }}>No active forwards</div>
                </Show>
                <For each={forwards()}>
                  {(fwd) => (
                    <div class="flex items-center gap-1 px-1 py-0.5">
                      <span class="text-xs flex-1" style={{ color: fwd.active ? colors().accent : colors().textMuted }}>
                        {fwd.config.forward_type === 'local' ? 'L' : 'R'}:{fwd.config.local_port}→{fwd.config.remote_host}:{fwd.config.remote_port}
                        {fwd.error && <span style={{ color: colors().error }}> ({fwd.error})</span>}
                      </span>
                      <button
                        class="px-1 text-xs hover:opacity-80"
                        style={{ color: colors().error }}
                        title="Remove forward"
                        onClick={() => removeForward(props.node.ssh!.connectionId, fwd.config.id)}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </For>
                {/* Add new forward form */}
                <div style={{ 'border-top': `1px solid ${colors().border}`, 'margin-top': '4px', 'padding-top': '4px' }}>
                  <div class="flex gap-1 items-center flex-wrap">
                    <select
                      class="text-xs px-1 py-0.5 rounded"
                      style={{ background: colors().surfaceAlt, color: colors().text, border: `1px solid ${colors().border}` }}
                      value={fwdType()}
                      onChange={(e) => setFwdType(e.currentTarget.value as 'local' | 'remote')}
                    >
                      <option value="local">Local</option>
                      <option value="remote">Remote</option>
                    </select>
                    <input
                      class="text-xs px-1 py-0.5 rounded w-16"
                      style={{ background: colors().surfaceAlt, color: colors().text, border: `1px solid ${colors().border}` }}
                      placeholder="L-port"
                      value={fwdLocalPort()}
                      onInput={(e) => setFwdLocalPort(e.currentTarget.value)}
                    />
                    <input
                      class="text-xs px-1 py-0.5 rounded flex-1 min-w-24"
                      style={{ background: colors().surfaceAlt, color: colors().text, border: `1px solid ${colors().border}` }}
                      placeholder="host:port"
                      value={fwdRemoteHostPort()}
                      onInput={(e) => setFwdRemoteHostPort(e.currentTarget.value)}
                    />
                    <button
                      class="text-xs px-2 py-0.5 rounded hover:opacity-80"
                      style={{ background: colors().accent, color: colors().surface }}
                      onClick={async () => {
                        const localPort = parseInt(fwdLocalPort(), 10)
                        const parts = fwdRemoteHostPort().split(':')
                        const remoteHost = parts.slice(0, -1).join(':') || parts[0]
                        const remotePort = parseInt(parts[parts.length - 1], 10)
                        if (!localPort || !remoteHost || !remotePort) return
                        await addForward(props.node.ssh!.connectionId, fwdType(), localPort, remoteHost, remotePort)
                        setFwdLocalPort('')
                        setFwdRemoteHostPort('')
                      }}
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            </Show>
          </div>
        </Show>

        {/* Pipeline status indicator */}
        <Show when={paneStatus()}>
          <div
            class="w-4 h-5 flex items-center justify-center shrink-0"
            title={`Pipeline: ${paneStatus()}`}
          >
            <div
              style={{
                width: '7px',
                height: '7px',
                'border-radius': '50%',
                background: paneStatus() === 'running'
                  ? '#3fb950'
                  : paneStatus() === 'done'
                    ? '#3fb950'
                    : paneStatus() === 'error'
                      ? colors().error
                      : colors().textMuted,
                animation: paneStatus() === 'running' ? 'pulse 1.2s ease-in-out infinite' : 'none',
                opacity: paneStatus() === 'done' ? '0.6' : '1',
              }}
            />
          </div>
        </Show>

        {/* Editable label / cwd display */}
        <Show when={editing()} fallback={
          <span
            class="flex-1 text-center cursor-pointer truncate px-1 text-xs"
            style={{ color: colors().text }}
            onDblClick={() => setEditing(true)}
            title={props.node.cwd || 'Double-click to rename'}
          >
            <Show
              when={sshStatus() === 'connected' && sshConnection()}
              fallback={props.node.label || abbreviatedCwd() || 'Terminal'}
            >
              {sshConnection()!.user}@{sshConnection()!.host}
            </Show>
            <Show when={props.node.pipeline}>
              {' '}
              <span style={{ color: colors().textMuted, 'font-size': '9px' }}>
                step {props.node.pipeline!.order}
              </span>
            </Show>
          </span>
        }>
          <input
            class="flex-1 text-center text-xs px-1 rounded border-none outline-none"
            style={{
              background: colors().surface,
              color: colors().text,
            }}
            value={props.node.label || 'Terminal'}
            autofocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setCellLabel(props.node.id, (e.target as HTMLInputElement).value)
                setEditing(false)
              }
              if (e.key === 'Escape') {
                (e.target as HTMLInputElement).dataset.cancelled = 'true'
                setEditing(false)
              }
            }}
            onBlur={(e) => {
              if (e.target.dataset.cancelled !== 'true') {
                setCellLabel(props.node.id, e.target.value)
              }
              setEditing(false)
            }}
          />
        </Show>

        {/* Per-pane theme selector */}
        <div class="relative">
          <button
            class="w-7 h-6 flex items-center justify-center rounded hover:bg-white/6"
            style={{ color: toolbarColor(colors()) }}
            onClick={() => setShowThemeMenu(!showThemeMenu())}
            title="Pane theme"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1" />
              <path d="M6 6 L6 1.5 A4.5 4.5 0 0 1 6 10.5 Z" fill="currentColor" />
            </svg>
          </button>
          <Show when={showThemeMenu()}>
            <div
              class="absolute top-full right-0 mt-1 rounded shadow-lg z-50 min-w-44 p-1 max-h-64 overflow-y-auto"
              style={{
                background: colors().surfaceAlt,
                border: `1px solid ${colors().border}`,
              }}
            >
              <button
                class="flex items-center gap-2 w-full px-2 py-1 text-left text-xs rounded hover:opacity-80"
                style={{ color: colors().textMuted }}
                onClick={() => { setCellTheme(props.node.id, ''); setShowThemeMenu(false) }}
              >
                ↩ Use global theme
              </button>
              <For each={getAvailableThemes()}>
                {(theme) => (
                  <button
                    class="flex items-center gap-2 w-full px-2 py-1 text-left text-xs rounded hover:opacity-80"
                    style={{
                      color: props.node.themeId === theme.id
                        ? (colors().accent)
                        : (colors().text),
                    }}
                    onClick={() => { setCellTheme(props.node.id, theme.id); setShowThemeMenu(false) }}
                  >
                    <div class="flex gap-0.5 shrink-0">
                      <div class="w-2.5 h-2.5 rounded-full" style={{ background: theme.colors.surface, border: '1px solid ' + theme.colors.border }} />
                      <div class="w-2.5 h-2.5 rounded-full" style={{ background: theme.colors.accent }} />
                    </div>
                    <span>{theme.name}</span>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>

        {/* Pipeline config button (Pro) */}
        <div class="relative">
          <button
            class="w-7 h-6 flex items-center justify-center rounded hover:bg-white/6"
            onClick={() => proEnabled() && setShowPipelineConfig(!showPipelineConfig())}
            title={proEnabled() ? 'Pipeline config' : 'Pro feature'}
            style={{
              color: props.node.pipeline ? colors().accent : toolbarColor(colors()),
              opacity: proEnabled() ? '1' : '0.3',
              cursor: proEnabled() ? 'pointer' : 'default',
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="5" cy="5" r="1.5" />
              <path d="M5 1v1M5 8v1M1 5h1M8 5h1M2.22 2.22l.7.7M7.08 7.08l.7.7M7.78 2.22l-.7.7M2.92 7.08l-.7.7" />
            </svg>
          </button>
          <Show when={showPipelineConfig()}>
            <PipelineConfigPanel
              cellId={props.node.id}
              pipeline={props.node.pipeline}
              colors={colors()}
              onClose={() => setShowPipelineConfig(false)}
            />
          </Show>
        </div>

        {/* Close button */}
        <button
          class="w-7 h-6 flex items-center justify-center rounded hover:bg-white/6"
          style={{ color: colors().error }}
          onClick={() => removeCell(props.node.id)}
          title="Close"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round">
            <line x1="3" y1="3" x2="9" y2="9" />
            <line x1="9" y1="3" x2="3" y2="9" />
          </svg>
        </button>
      </div>

      {/* Terminal — auto-request PTY if missing */}
      <div class="flex-1 overflow-hidden relative">
        <Show when={props.ptyId} fallback={
          <div class="flex items-center justify-center h-full" style={{ color: colors().textMuted }}>
            <span class="text-xs animate-pulse">Starting terminal...</span>
          </div>
        }>
          <TerminalComponent
            ptyId={props.ptyId!}
            themeId={props.node.themeId}
            sshConnectionId={props.node.ssh?.connectionId}
          />
        </Show>

        {/* SFTP Panel overlay */}
        <Show when={showSftp() && props.node.ssh}>
          <SftpPanel
            connectionId={props.node.ssh!.connectionId}
            colors={colors()}
            onClose={() => setShowSftp(false)}
          />
        </Show>
      </div>
    </div>
  )
}

export default GridCell
