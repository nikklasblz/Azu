# SFTP Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a slide-in SFTP file browser panel to SSH panes, with directory listing, upload, download, mkdir, remove, and rename.

**Architecture:** `russh-sftp` SftpSession opens over the existing SSH connection (separate channel, no new connection). The SshManager caches SFTP sessions per connection. Six new Tauri commands expose SFTP ops. Frontend SftpPanel component slides from the right side of SSH panes.

**Tech Stack:** `russh-sftp` 2.1, `russh` 0.54, Tauri async commands, SolidJS

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src-tauri/src/ssh/sftp.rs` | **New** — SFTP types + operations (list, download, upload, mkdir, remove, rename) |
| `src-tauri/src/ssh/mod.rs` | Add `pub mod sftp` |
| `src-tauri/src/ssh/manager.rs` | Add SFTP session cache + `open_sftp()` method |
| `src-tauri/src/commands/ssh.rs` | Add 6 SFTP Tauri commands |
| `src-tauri/src/lib.rs` | Register 6 new commands |
| `src/lib/tauri-commands.ts` | Add sftp bindings inside `ssh` export |
| `src/components/Grid/SftpPanel.tsx` | **New** — file browser panel UI |
| `src/components/Grid/GridCell.tsx` | Add SFTP toggle button (visible on SSH panes only) |

---

## Task 1: SFTP Types and Operations Module

**Files:**
- Create: `src-tauri/src/ssh/sftp.rs`
- Modify: `src-tauri/src/ssh/mod.rs`

- [ ] **Step 1: Add sftp module to mod.rs**

In `src-tauri/src/ssh/mod.rs`, add after the existing modules:
```rust
pub mod sftp;
```

- [ ] **Step 2: Create sftp.rs with FileEntry type and operations**

Create `src-tauri/src/ssh/sftp.rs`:

```rust
use russh_sftp::client::SftpSession;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use russh_sftp::protocol::OpenFlags;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub size: u64,
    pub is_dir: bool,
    pub modified: Option<u64>,
}

pub async fn list_dir(sftp: &SftpSession, path: &str) -> Result<Vec<FileEntry>, String> {
    let entries = sftp.read_dir(path).await.map_err(|e| format!("SFTP readdir: {e}"))?;
    let mut result = Vec::new();
    for entry in entries {
        let name = entry.file_name();
        if name == "." || name == ".." {
            continue;
        }
        let meta = entry.metadata();
        let is_dir = entry.file_type().is_dir();
        let size = meta.size.unwrap_or(0);
        let modified = meta.mtime;
        result.push(FileEntry {
            name,
            size,
            is_dir,
            modified: modified.map(|t| t as u64),
        });
    }
    // Sort: directories first, then alphabetical
    result.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(result)
}

pub async fn download(
    sftp: &SftpSession,
    remote_path: &str,
    local_path: &str,
    app: &AppHandle,
    transfer_id: &str,
) -> Result<(), String> {
    let mut remote_file = sftp
        .open(remote_path)
        .await
        .map_err(|e| format!("SFTP open: {e}"))?;

    let meta = remote_file.metadata().await.map_err(|e| format!("SFTP metadata: {e}"))?;
    let total = meta.size.unwrap_or(0);

    let mut local_file = tokio::fs::File::create(local_path)
        .await
        .map_err(|e| format!("Local file create: {e}"))?;

    let mut downloaded: u64 = 0;
    let mut buf = vec![0u8; 32768];

    loop {
        let n = remote_file.read(&mut buf).await.map_err(|e| format!("SFTP read: {e}"))?;
        if n == 0 {
            break;
        }
        local_file.write_all(&buf[..n]).await.map_err(|e| format!("Local write: {e}"))?;
        downloaded += n as u64;
        let _ = app.emit(
            &format!("sftp-progress-{}", transfer_id),
            serde_json::json!({ "bytes": downloaded, "total": total }),
        );
    }

    Ok(())
}

pub async fn upload(
    sftp: &SftpSession,
    local_path: &str,
    remote_path: &str,
    app: &AppHandle,
    transfer_id: &str,
) -> Result<(), String> {
    let local_meta = tokio::fs::metadata(local_path)
        .await
        .map_err(|e| format!("Local metadata: {e}"))?;
    let total = local_meta.len();

    let mut local_file = tokio::fs::File::open(local_path)
        .await
        .map_err(|e| format!("Local open: {e}"))?;

    let mut remote_file = sftp
        .open_with_flags(remote_path, OpenFlags::CREATE | OpenFlags::TRUNCATE | OpenFlags::WRITE)
        .await
        .map_err(|e| format!("SFTP create: {e}"))?;

    let mut uploaded: u64 = 0;
    let mut buf = vec![0u8; 32768];

    loop {
        let n = local_file.read(&mut buf).await.map_err(|e| format!("Local read: {e}"))?;
        if n == 0 {
            break;
        }
        remote_file.write_all(&buf[..n]).await.map_err(|e| format!("SFTP write: {e}"))?;
        uploaded += n as u64;
        let _ = app.emit(
            &format!("sftp-progress-{}", transfer_id),
            serde_json::json!({ "bytes": uploaded, "total": total }),
        );
    }
    remote_file.flush().await.map_err(|e| format!("SFTP flush: {e}"))?;

    Ok(())
}

pub async fn mkdir(sftp: &SftpSession, path: &str) -> Result<(), String> {
    sftp.create_dir(path).await.map_err(|e| format!("SFTP mkdir: {e}"))
}

pub async fn remove(sftp: &SftpSession, path: &str) -> Result<(), String> {
    // Try file first, then directory
    match sftp.remove_file(path).await {
        Ok(()) => Ok(()),
        Err(_) => sftp.remove_dir(path).await.map_err(|e| format!("SFTP remove: {e}")),
    }
}

pub async fn rename(sftp: &SftpSession, old_path: &str, new_path: &str) -> Result<(), String> {
    sftp.rename(old_path, new_path).await.map_err(|e| format!("SFTP rename: {e}"))
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd /d/Azu/src-tauri && cargo check`
Expected: Compiles (warnings about unused OK)

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/ssh/sftp.rs src-tauri/src/ssh/mod.rs
git commit -m "feat(sftp): types + operations module — list, download, upload, mkdir, remove, rename"
```

---

## Task 2: SFTP Session Cache in SshManager

**Files:**
- Modify: `src-tauri/src/ssh/manager.rs`

- [ ] **Step 1: Add SFTP session cache field**

Add import at top of `manager.rs`:
```rust
use russh_sftp::client::SftpSession;
```

Add to `SshManager` struct:
```rust
sftp_sessions: Arc<Mutex<HashMap<String, SftpSession>>>,
```

Initialize in `SshManager::new()`:
```rust
sftp_sessions: Arc::new(Mutex::new(HashMap::new())),
```

- [ ] **Step 2: Add open_sftp method**

Add method to `SshManager` impl:
```rust
/// Open or return cached SFTP session for a connection.
/// Opens a new channel with the "sftp" subsystem on the existing SSH connection.
pub async fn open_sftp(&self, conn_id: &str) -> Result<SftpSession, String> {
    // Check cache first
    {
        let cache = self.sftp_sessions.lock().await;
        if let Some(session) = cache.get(conn_id) {
            return Ok(session.clone());
        }
    }

    // Open new SFTP channel on the existing SSH connection
    let handle = {
        let conns = self.connections.lock().await;
        let active = conns.get(conn_id)
            .ok_or_else(|| format!("Connection '{}' not found", conn_id))?;
        active.handle.clone()
    };

    let channel = handle
        .channel_open_session()
        .await
        .map_err(|e| format!("SFTP channel open: {e}"))?;

    channel
        .request_subsystem(true, "sftp")
        .await
        .map_err(|e| format!("SFTP subsystem request: {e}"))?;

    let sftp = SftpSession::new(channel.into_stream())
        .await
        .map_err(|e| format!("SFTP session init: {e}"))?;

    // Cache it
    self.sftp_sessions.lock().await.insert(conn_id.to_string(), sftp.clone());

    Ok(sftp)
}
```

- [ ] **Step 3: Clean up SFTP cache on disconnect**

In the `disconnect` method, add before removing from connections:
```rust
// Remove cached SFTP session
self.sftp_sessions.lock().await.remove(conn_id);
```

- [ ] **Step 4: Verify compilation**

Run: `cd /d/Azu/src-tauri && cargo check`
Expected: Compiles

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/ssh/manager.rs
git commit -m "feat(sftp): SFTP session cache in SshManager + open_sftp method"
```

---

## Task 3: Tauri SFTP Commands

**Files:**
- Modify: `src-tauri/src/commands/ssh.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add 6 SFTP commands to ssh.rs**

Add import at top:
```rust
use crate::ssh::sftp::{self, FileEntry};
```

Add these commands after the existing SSH commands:

```rust
// ---------------------------------------------------------------------------
// SFTP operations
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn sftp_list_dir(
    connection_id: String,
    path: String,
    manager: State<'_, SshManager>,
) -> Result<Vec<FileEntry>, String> {
    let session = manager.open_sftp(&connection_id).await?;
    sftp::list_dir(&session, &path).await
}

#[tauri::command]
pub async fn sftp_download(
    connection_id: String,
    remote_path: String,
    local_path: String,
    app: AppHandle,
    manager: State<'_, SshManager>,
) -> Result<String, String> {
    let session = manager.open_sftp(&connection_id).await?;
    let transfer_id = uuid::Uuid::new_v4().to_string();
    let tid = transfer_id.clone();
    sftp::download(&session, &remote_path, &local_path, &app, &tid).await?;
    Ok(transfer_id)
}

#[tauri::command]
pub async fn sftp_upload(
    connection_id: String,
    local_path: String,
    remote_path: String,
    app: AppHandle,
    manager: State<'_, SshManager>,
) -> Result<String, String> {
    let session = manager.open_sftp(&connection_id).await?;
    let transfer_id = uuid::Uuid::new_v4().to_string();
    let tid = transfer_id.clone();
    sftp::upload(&session, &local_path, &remote_path, &app, &tid).await?;
    Ok(transfer_id)
}

#[tauri::command]
pub async fn sftp_mkdir(
    connection_id: String,
    path: String,
    manager: State<'_, SshManager>,
) -> Result<(), String> {
    let session = manager.open_sftp(&connection_id).await?;
    sftp::mkdir(&session, &path).await
}

#[tauri::command]
pub async fn sftp_remove(
    connection_id: String,
    path: String,
    manager: State<'_, SshManager>,
) -> Result<(), String> {
    let session = manager.open_sftp(&connection_id).await?;
    sftp::remove(&session, &path).await
}

#[tauri::command]
pub async fn sftp_rename(
    connection_id: String,
    old_path: String,
    new_path: String,
    manager: State<'_, SshManager>,
) -> Result<(), String> {
    let session = manager.open_sftp(&connection_id).await?;
    sftp::rename(&session, &old_path, &new_path).await
}
```

- [ ] **Step 2: Register commands in lib.rs**

Add to the `invoke_handler` array in `src-tauri/src/lib.rs`:
```rust
commands::ssh::sftp_list_dir,
commands::ssh::sftp_download,
commands::ssh::sftp_upload,
commands::ssh::sftp_mkdir,
commands::ssh::sftp_remove,
commands::ssh::sftp_rename,
```

- [ ] **Step 3: Verify compilation and tests**

Run: `cd /d/Azu/src-tauri && cargo check && cargo test`
Expected: Compiles, all existing tests pass

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/ssh.rs src-tauri/src/lib.rs
git commit -m "feat(sftp): 6 Tauri commands — list, download, upload, mkdir, remove, rename"
```

---

## Task 4: Frontend SFTP Bindings

**Files:**
- Modify: `src/lib/tauri-commands.ts`

- [ ] **Step 1: Add sftp methods to ssh export**

Add inside the `ssh` object in `src/lib/tauri-commands.ts`, after `listConnections`:

```typescript
  // SFTP operations
  sftpListDir: (connectionId: string, path: string): Promise<any[]> =>
    invoke('sftp_list_dir', { connectionId, path }),
  sftpDownload: (connectionId: string, remotePath: string, localPath: string): Promise<string> =>
    invoke('sftp_download', { connectionId, remotePath, localPath }),
  sftpUpload: (connectionId: string, localPath: string, remotePath: string): Promise<string> =>
    invoke('sftp_upload', { connectionId, localPath, remotePath }),
  sftpMkdir: (connectionId: string, path: string): Promise<void> =>
    invoke('sftp_mkdir', { connectionId, path }),
  sftpRemove: (connectionId: string, path: string): Promise<void> =>
    invoke('sftp_remove', { connectionId, path }),
  sftpRename: (connectionId: string, oldPath: string, newPath: string): Promise<void> =>
    invoke('sftp_rename', { connectionId, oldPath, newPath }),
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/tauri-commands.ts
git commit -m "feat(sftp): frontend Tauri command bindings"
```

---

## Task 5: SftpPanel Component

**Files:**
- Create: `src/components/Grid/SftpPanel.tsx`

- [ ] **Step 1: Create the SFTP panel component**

Create `src/components/Grid/SftpPanel.tsx`:

```tsx
import { Component, createSignal, Show, For, onMount } from 'solid-js'
import { ssh as sshCmd } from '../../lib/tauri-commands'
import { listen } from '@tauri-apps/api/event'

interface FileEntry {
  name: string
  size: number
  is_dir: boolean
  modified: number | null
}

interface SftpPanelProps {
  connectionId: string
  colors: any
  onClose: () => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

const SftpPanel: Component<SftpPanelProps> = (props) => {
  const [path, setPath] = createSignal('.')
  const [files, setFiles] = createSignal<FileEntry[]>([])
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal('')
  const [transferring, setTransferring] = createSignal(false)
  const [transferProgress, setTransferProgress] = createSignal(0)
  const [transferName, setTransferName] = createSignal('')

  const loadDir = async (dir: string) => {
    setLoading(true)
    setError('')
    try {
      const entries = await sshCmd.sftpListDir(props.connectionId, dir)
      setFiles(entries)
      setPath(dir)
    } catch (e: any) {
      setError(String(e))
    }
    setLoading(false)
  }

  onMount(() => loadDir('.'))

  const navigate = (entry: FileEntry) => {
    if (entry.is_dir) {
      const newPath = path() === '.' ? entry.name : `${path()}/${entry.name}`
      loadDir(newPath)
    }
  }

  const goUp = () => {
    const parts = path().split('/')
    if (parts.length > 1) {
      parts.pop()
      loadDir(parts.join('/') || '.')
    } else {
      loadDir('..')
    }
  }

  const goHome = () => loadDir('.')

  const handleDownload = async (entry: FileEntry) => {
    const remotePath = path() === '.' ? entry.name : `${path()}/${entry.name}`
    // Use Tauri save dialog
    const { save } = await import('@tauri-apps/plugin-dialog')
    const localPath = await save({ defaultPath: entry.name })
    if (!localPath) return

    setTransferring(true)
    setTransferName(entry.name)
    setTransferProgress(0)

    try {
      const transferId = await sshCmd.sftpDownload(props.connectionId, remotePath, localPath)
      const unlisten = await listen<{ bytes: number; total: number }>(
        `sftp-progress-${transferId}`,
        (e) => {
          if (e.payload.total > 0) {
            setTransferProgress(Math.round((e.payload.bytes / e.payload.total) * 100))
          }
        }
      )
      // Download is synchronous from the command side, so it's already done
      unlisten()
    } catch (e: any) {
      setError(String(e))
    }
    setTransferring(false)
  }

  const handleUpload = async () => {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({ multiple: false })
    if (!selected) return

    const localPath = typeof selected === 'string' ? selected : selected.path
    const fileName = localPath.split(/[/\\]/).pop() || 'upload'
    const remotePath = path() === '.' ? fileName : `${path()}/${fileName}`

    setTransferring(true)
    setTransferName(fileName)
    setTransferProgress(0)

    try {
      const transferId = await sshCmd.sftpUpload(props.connectionId, localPath, remotePath)
      const unlisten = await listen<{ bytes: number; total: number }>(
        `sftp-progress-${transferId}`,
        (e) => {
          if (e.payload.total > 0) {
            setTransferProgress(Math.round((e.payload.bytes / e.payload.total) * 100))
          }
        }
      )
      unlisten()
      await loadDir(path()) // refresh
    } catch (e: any) {
      setError(String(e))
    }
    setTransferring(false)
  }

  const handleMkdir = async () => {
    const name = prompt('Directory name:')
    if (!name) return
    const newPath = path() === '.' ? name : `${path()}/${name}`
    try {
      await sshCmd.sftpMkdir(props.connectionId, newPath)
      await loadDir(path())
    } catch (e: any) {
      setError(String(e))
    }
  }

  const handleDelete = async (entry: FileEntry) => {
    if (!confirm(`Delete ${entry.name}?`)) return
    const target = path() === '.' ? entry.name : `${path()}/${entry.name}`
    try {
      await sshCmd.sftpRemove(props.connectionId, target)
      await loadDir(path())
    } catch (e: any) {
      setError(String(e))
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: '0',
        right: '0',
        width: '240px',
        height: '100%',
        background: props.colors.surface,
        'border-left': `1px solid ${props.colors.border}`,
        'box-shadow': '-4px 0 12px rgba(0,0,0,0.3)',
        display: 'flex',
        'flex-direction': 'column',
        'z-index': '50',
        'font-size': '11px',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '6px 8px',
          'border-bottom': `1px solid ${props.colors.border}`,
          display: 'flex',
          'align-items': 'center',
          gap: '4px',
        }}
      >
        <button
          onClick={goUp}
          style={{ background: 'none', border: 'none', color: props.colors.textMuted, cursor: 'pointer', padding: '2px' }}
          title="Go up"
        >
          ↑
        </button>
        <button
          onClick={goHome}
          style={{ background: 'none', border: 'none', color: props.colors.textMuted, cursor: 'pointer', padding: '2px' }}
          title="Home"
        >
          ~
        </button>
        <span
          style={{
            flex: '1',
            color: props.colors.text,
            overflow: 'hidden',
            'text-overflow': 'ellipsis',
            'white-space': 'nowrap',
            'font-family': 'monospace',
            'font-size': '10px',
          }}
          title={path()}
        >
          {path()}
        </span>
        <button
          onClick={handleMkdir}
          style={{ background: 'none', border: 'none', color: props.colors.accent, cursor: 'pointer', padding: '2px', 'font-size': '12px' }}
          title="New directory"
        >
          +
        </button>
        <button
          onClick={props.onClose}
          style={{ background: 'none', border: 'none', color: props.colors.error, cursor: 'pointer', padding: '2px' }}
          title="Close"
        >
          ✕
        </button>
      </div>

      {/* Error */}
      <Show when={error()}>
        <div style={{ padding: '4px 8px', color: props.colors.error, 'font-size': '10px' }}>{error()}</div>
      </Show>

      {/* File list */}
      <div style={{ flex: '1', 'overflow-y': 'auto' }}>
        <Show when={loading()}>
          <div style={{ padding: '8px', color: props.colors.textMuted, 'text-align': 'center' }}>Loading...</div>
        </Show>
        <Show when={!loading()}>
          <For each={files()}>
            {(entry) => (
              <div
                style={{
                  display: 'flex',
                  'align-items': 'center',
                  padding: '3px 8px',
                  cursor: 'pointer',
                  gap: '6px',
                  color: props.colors.text,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                onClick={() => entry.is_dir ? navigate(entry) : handleDownload(entry)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  handleDelete(entry)
                }}
                title={entry.is_dir ? 'Open directory' : `Download (${formatSize(entry.size)})\nRight-click to delete`}
              >
                <span style={{ color: entry.is_dir ? props.colors.accent : props.colors.textMuted, 'font-size': '10px', width: '14px' }}>
                  {entry.is_dir ? '📁' : '📄'}
                </span>
                <span style={{ flex: '1', overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}>
                  {entry.name}
                </span>
                <Show when={!entry.is_dir}>
                  <span style={{ color: props.colors.textMuted, 'font-size': '9px', 'flex-shrink': '0' }}>
                    {formatSize(entry.size)}
                  </span>
                </Show>
              </div>
            )}
          </For>
        </Show>
      </div>

      {/* Transfer progress */}
      <Show when={transferring()}>
        <div style={{ padding: '6px 8px', 'border-top': `1px solid ${props.colors.border}` }}>
          <div style={{ color: props.colors.text, 'font-size': '10px', 'margin-bottom': '3px' }}>
            {transferName()} — {transferProgress()}%
          </div>
          <div style={{ height: '3px', background: props.colors.border, 'border-radius': '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${transferProgress()}%`, background: props.colors.accent, transition: 'width 0.2s' }} />
          </div>
        </div>
      </Show>

      {/* Upload button */}
      <div style={{ padding: '6px 8px', 'border-top': `1px solid ${props.colors.border}` }}>
        <button
          onClick={handleUpload}
          disabled={transferring()}
          style={{
            width: '100%',
            padding: '4px 0',
            background: props.colors.accent,
            color: props.colors.surface,
            border: 'none',
            'border-radius': '3px',
            'font-size': '10px',
            cursor: transferring() ? 'default' : 'pointer',
            opacity: transferring() ? '0.5' : '1',
          }}
        >
          Upload file
        </button>
      </div>
    </div>
  )
}

export default SftpPanel
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Grid/SftpPanel.tsx
git commit -m "feat(sftp): SftpPanel component — file browser, upload, download, progress"
```

---

## Task 6: GridCell SFTP Button + Dialog Plugin

**Files:**
- Modify: `src/components/Grid/GridCell.tsx`

- [ ] **Step 1: Install dialog plugin for save/open dialogs**

The SftpPanel uses `@tauri-apps/plugin-dialog` for file picker. Install it:

```bash
npm install @tauri-apps/plugin-dialog
```

Add to `src-tauri/Cargo.toml`:
```toml
tauri-plugin-dialog = "2"
```

Add to `src-tauri/src/lib.rs` plugin chain:
```rust
.plugin(tauri_plugin_dialog::init())
```

- [ ] **Step 2: Add SFTP button and panel to GridCell**

Add import in `GridCell.tsx`:
```typescript
import SftpPanel from './SftpPanel'
```

Add signal:
```typescript
const [showSftp, setShowSftp] = createSignal(false)
```

Add to `onMouseLeave` handler: `setShowSftp(false)`

Add SFTP button in toolbar, visible only when SSH is connected — place it after the SSH button:
```tsx
<Show when={sshStatus() === 'connected'}>
  <button
    class="w-7 h-6 flex items-center justify-center rounded hover:bg-white/6"
    style={{ color: showSftp() ? colors().accent : toolbarColor(colors()) }}
    onClick={() => setShowSftp(!showSftp())}
    title="SFTP file browser"
  >
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2">
      <path d="M1 2h4l1.5 1.5H11v7H1V2z" />
    </svg>
  </button>
</Show>
```

Add the SftpPanel inside the terminal area div (before the `</div>` that closes the `flex-1 overflow-hidden` container), so it overlays the terminal:
```tsx
<Show when={showSftp() && props.node.ssh}>
  <SftpPanel
    connectionId={props.node.ssh!.connectionId}
    colors={colors()}
    onClose={() => setShowSftp(false)}
  />
</Show>
```

- [ ] **Step 3: Verify compilation and tests**

Run: `cd /d/Azu/src-tauri && cargo check`
Run: `npx vitest run`
Expected: Everything passes

- [ ] **Step 4: Commit**

```bash
git add src/components/Grid/GridCell.tsx src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs package.json package-lock.json
git commit -m "feat(sftp): SFTP button in GridCell + dialog plugin for file picker"
```

---

## Task 7: Integration Smoke Test

- [ ] **Step 1: Full build**

Run: `cd /d/Azu/src-tauri && cargo build`
Expected: Builds successfully

- [ ] **Step 2: Run all tests**

Run: `cd /d/Azu/src-tauri && cargo test`
Run: `cd /d/Azu && npx vitest run`
Expected: All pass

- [ ] **Step 3: Commit final fixes if needed**

```bash
git add -A
git commit -m "fix(sftp): integration fixes from smoke test"
```
