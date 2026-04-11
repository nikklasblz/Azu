import { Component, createSignal, onMount, onCleanup, For, Show } from 'solid-js'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { ssh } from '../../lib/tauri-commands'

interface FileEntry {
  name: string
  is_dir: boolean
  size: number
  permissions: string
}

interface SftpPanelProps {
  connectionId: string
  colors: any
  onClose: () => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}M`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}G`
}

const SftpPanel: Component<SftpPanelProps> = (props) => {
  const [path, setPath] = createSignal('~')
  const [entries, setEntries] = createSignal<FileEntry[]>([])
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [mkdirMode, setMkdirMode] = createSignal(false)
  const [mkdirName, setMkdirName] = createSignal('')
  const [transferProgress, setTransferProgress] = createSignal<{ bytes: number; total: number } | null>(null)
  const [transferring, setTransferring] = createSignal(false)

  let unlistenFns: UnlistenFn[] = []

  const navigate = async (newPath: string) => {
    setLoading(true)
    setError(null)
    try {
      const result = await ssh.sftpListDir(props.connectionId, newPath)
      // Sort: directories first, then files, alphabetically
      const sorted = [...result].sort((a, b) => {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      setEntries(sorted)
      setPath(newPath)
    } catch (e: any) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const goUp = () => {
    const current = path()
    if (current === '/' || current === '~') return
    const normalized = current.replace(/\/$/, '')
    const parent = normalized.lastIndexOf('/') > 0
      ? normalized.slice(0, normalized.lastIndexOf('/'))
      : '/'
    navigate(parent)
  }

  const goHome = () => navigate('~')

  const handleEntryClick = async (entry: FileEntry) => {
    if (entry.is_dir) {
      const current = path().replace(/\/$/, '')
      const next = current === '~' || current === '' ? `~/${entry.name}` : `${current}/${entry.name}`
      navigate(next)
    } else {
      // Download file
      try {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const savePath = await save({ defaultPath: entry.name })
        if (!savePath) return

        const current = path().replace(/\/$/, '')
        const remotePath = current === '~' || current === ''
          ? `~/${entry.name}`
          : `${current}/${entry.name}`

        setTransferring(true)
        setTransferProgress(null)
        setError(null)

        const transferId = await ssh.sftpDownload(props.connectionId, remotePath, savePath)

        // Listen to progress events
        const unlisten = await listen<{ bytes: number; total: number }>(
          `sftp-progress-${transferId}`,
          (event) => {
            setTransferProgress(event.payload)
            if (event.payload.bytes >= event.payload.total && event.payload.total > 0) {
              setTransferring(false)
              setTransferProgress(null)
              // unlisten is set below after await, capture via closure
            }
          }
        )
        unlistenFns.push(unlisten)
      } catch (e: any) {
        setError(String(e))
        setTransferring(false)
      }
    }
  }

  const handleRightClick = async (e: MouseEvent, entry: FileEntry) => {
    e.preventDefault()
    const what = entry.is_dir ? 'directory' : 'file'
    if (!confirm(`Delete ${what} "${entry.name}"?`)) return

    const current = path().replace(/\/$/, '')
    const targetPath = current === '~' || current === ''
      ? `~/${entry.name}`
      : `${current}/${entry.name}`

    setError(null)
    try {
      await ssh.sftpRemove(props.connectionId, targetPath)
      await navigate(path())
    } catch (e: any) {
      setError(String(e))
    }
  }

  const handleMkdir = async () => {
    const name = mkdirName().trim()
    if (!name) return
    const current = path().replace(/\/$/, '')
    const newDir = current === '~' || current === ''
      ? `~/${name}`
      : `${current}/${name}`
    setError(null)
    try {
      await ssh.sftpMkdir(props.connectionId, newDir)
      setMkdirMode(false)
      setMkdirName('')
      await navigate(path())
    } catch (e: any) {
      setError(String(e))
    }
  }

  const handleUpload = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({ multiple: false })
      if (!selected) return

      const localPath = typeof selected === 'string' ? selected : selected[0]
      const fileName = localPath.replace(/\\/g, '/').split('/').pop() || 'file'
      const current = path().replace(/\/$/, '')
      const remotePath = current === '~' || current === ''
        ? `~/${fileName}`
        : `${current}/${fileName}`

      setTransferring(true)
      setTransferProgress(null)
      setError(null)

      const transferId = await ssh.sftpUpload(props.connectionId, localPath, remotePath)

      const unlisten = await listen<{ bytes: number; total: number }>(
        `sftp-progress-${transferId}`,
        (event) => {
          setTransferProgress(event.payload)
          if (event.payload.bytes >= event.payload.total && event.payload.total > 0) {
            setTransferring(false)
            setTransferProgress(null)
            navigate(path())
          }
        }
      )
      unlistenFns.push(unlisten)
    } catch (e: any) {
      setError(String(e))
      setTransferring(false)
    }
  }

  onMount(() => {
    navigate('~')
  })

  onCleanup(() => {
    for (const fn of unlistenFns) fn()
  })

  const progressPercent = () => {
    const p = transferProgress()
    if (!p || p.total === 0) return 0
    return Math.round((p.bytes / p.total) * 100)
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: '0',
        right: '0',
        bottom: '0',
        width: '240px',
        'z-index': '50',
        display: 'flex',
        'flex-direction': 'column',
        background: props.colors.surface,
        'border-left': `1px solid ${props.colors.border}`,
        'box-shadow': '-4px 0 12px rgba(0,0,0,0.4)',
        'font-family': 'var(--azu-font-ui, monospace)',
      }}
    >
      {/* Header */}
      <div
        style={{
          'background-color': props.colors.surfaceAlt,
          'border-bottom': `1px solid ${props.colors.border}`,
          padding: '4px 6px',
          display: 'flex',
          'align-items': 'center',
          gap: '2px',
          'flex-shrink': '0',
        }}
      >
        {/* Up button */}
        <button
          onClick={goUp}
          title="Up"
          style={{
            background: 'none',
            border: 'none',
            color: props.colors.textMuted,
            cursor: 'pointer',
            padding: '2px 4px',
            'border-radius': '3px',
            'font-size': '12px',
            'line-height': '1',
          }}
        >
          ↑
        </button>
        {/* Home button */}
        <button
          onClick={goHome}
          title="Home"
          style={{
            background: 'none',
            border: 'none',
            color: props.colors.textMuted,
            cursor: 'pointer',
            padding: '2px 4px',
            'border-radius': '3px',
            'font-size': '11px',
            'line-height': '1',
          }}
        >
          ~
        </button>
        {/* Mkdir button */}
        <button
          onClick={() => setMkdirMode(!mkdirMode())}
          title="New directory"
          style={{
            background: 'none',
            border: 'none',
            color: props.colors.textMuted,
            cursor: 'pointer',
            padding: '2px 4px',
            'border-radius': '3px',
            'font-size': '13px',
            'line-height': '1',
          }}
        >
          +
        </button>
        {/* Path display */}
        <span
          style={{
            flex: '1',
            'font-size': '10px',
            color: props.colors.textMuted,
            overflow: 'hidden',
            'text-overflow': 'ellipsis',
            'white-space': 'nowrap',
            'text-align': 'center',
          }}
          title={path()}
        >
          {path()}
        </span>
        {/* Close button */}
        <button
          onClick={props.onClose}
          title="Close"
          style={{
            background: 'none',
            border: 'none',
            color: props.colors.error,
            cursor: 'pointer',
            padding: '2px 4px',
            'border-radius': '3px',
            'font-size': '12px',
            'line-height': '1',
          }}
        >
          ✕
        </button>
      </div>

      {/* Mkdir input */}
      <Show when={mkdirMode()}>
        <div
          style={{
            padding: '4px 8px',
            'border-bottom': `1px solid ${props.colors.border}`,
            display: 'flex',
            gap: '4px',
            'flex-shrink': '0',
          }}
        >
          <input
            type="text"
            value={mkdirName()}
            onInput={(e) => setMkdirName((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleMkdir()
              if (e.key === 'Escape') { setMkdirMode(false); setMkdirName('') }
            }}
            placeholder="directory name"
            autofocus
            style={{
              flex: '1',
              background: props.colors.surfaceAlt,
              color: props.colors.text,
              border: `1px solid ${props.colors.border}`,
              'border-radius': '3px',
              padding: '3px 6px',
              'font-size': '11px',
              outline: 'none',
            }}
          />
          <button
            onClick={handleMkdir}
            style={{
              background: props.colors.accent,
              color: props.colors.surface,
              border: 'none',
              'border-radius': '3px',
              padding: '3px 8px',
              'font-size': '11px',
              cursor: 'pointer',
            }}
          >
            OK
          </button>
        </div>
      </Show>

      {/* Error display */}
      <Show when={error()}>
        <div
          style={{
            padding: '4px 8px',
            'font-size': '10px',
            color: props.colors.error,
            'border-bottom': `1px solid ${props.colors.border}`,
            'flex-shrink': '0',
            'word-break': 'break-all',
          }}
        >
          {error()}
        </div>
      </Show>

      {/* File list */}
      <div
        style={{
          flex: '1',
          'overflow-y': 'auto',
        }}
      >
        <Show when={loading()}>
          <div
            style={{
              padding: '12px',
              'text-align': 'center',
              color: props.colors.textMuted,
              'font-size': '11px',
            }}
          >
            Loading...
          </div>
        </Show>

        <Show when={!loading() && entries().length === 0 && !error()}>
          <div
            style={{
              padding: '12px',
              'text-align': 'center',
              color: props.colors.textMuted,
              'font-size': '11px',
            }}
          >
            Empty directory
          </div>
        </Show>

        <For each={entries()}>
          {(entry) => (
            <button
              class="w-full text-left hover:bg-white/8"
              onClick={() => handleEntryClick(entry)}
              onContextMenu={(e) => handleRightClick(e, entry)}
              title={entry.is_dir ? entry.name : `${entry.name} (${formatSize(entry.size)})`}
              style={{
                display: 'flex',
                'align-items': 'center',
                gap: '6px',
                padding: '3px 8px',
                color: entry.is_dir ? props.colors.accent : props.colors.text,
                'font-size': '11px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                width: '100%',
                'box-sizing': 'border-box',
                'white-space': 'nowrap',
                overflow: 'hidden',
              }}
            >
              <span style={{ 'flex-shrink': '0', 'font-size': '12px' }}>
                {entry.is_dir ? '📁' : '📄'}
              </span>
              <span
                style={{
                  flex: '1',
                  overflow: 'hidden',
                  'text-overflow': 'ellipsis',
                }}
              >
                {entry.name}
              </span>
              <Show when={!entry.is_dir}>
                <span
                  style={{
                    color: props.colors.textMuted,
                    'font-size': '10px',
                    'flex-shrink': '0',
                  }}
                >
                  {formatSize(entry.size)}
                </span>
              </Show>
            </button>
          )}
        </For>
      </div>

      {/* Bottom area: progress + upload */}
      <div
        style={{
          'border-top': `1px solid ${props.colors.border}`,
          'flex-shrink': '0',
        }}
      >
        {/* Transfer progress */}
        <Show when={transferring() || transferProgress()}>
          <div style={{ padding: '4px 8px' }}>
            <div
              style={{
                'font-size': '10px',
                color: props.colors.textMuted,
                'margin-bottom': '3px',
              }}
            >
              {transferring() ? `${progressPercent()}%` : 'Done'}
            </div>
            <div
              style={{
                height: '3px',
                background: props.colors.surfaceAlt,
                'border-radius': '2px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${progressPercent()}%`,
                  background: props.colors.accent,
                  transition: 'width 0.1s ease',
                }}
              />
            </div>
          </div>
        </Show>

        {/* Upload button */}
        <button
          onClick={handleUpload}
          disabled={transferring()}
          style={{
            display: 'block',
            width: '100%',
            padding: '6px',
            background: 'none',
            border: 'none',
            color: transferring() ? props.colors.textMuted : props.colors.accent,
            'font-size': '11px',
            cursor: transferring() ? 'default' : 'pointer',
            'text-align': 'center',
            opacity: transferring() ? '0.5' : '1',
          }}
        >
          ↑ Upload file
        </button>
      </div>
    </div>
  )
}

export default SftpPanel
