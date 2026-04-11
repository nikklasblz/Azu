# SFTP Panel Design — SSH Phase 2

## Overview

File browser panel that slides from the right side of SSH panes. Uses `russh-sftp` over the existing SSH connection (no new connection). Supports directory listing, upload, download, mkdir, remove, rename.

## Backend

### `src-tauri/src/ssh/sftp.rs` (new)

SFTP operations module. Opens an SFTP subsystem channel on the existing SSH connection via `russh-sftp`.

Types:
```rust
struct FileEntry {
    name: String,
    size: u64,
    is_dir: bool,
    modified: Option<u64>,  // unix timestamp
    permissions: Option<u32>,
}
```

Operations:
- `list_dir(sftp_session, path) -> Vec<FileEntry>`
- `download(sftp_session, remote_path, local_path, app, transfer_id)` — reads remote file, writes locally, emits `sftp-progress-{transfer_id}` events with `{ bytes, total }`
- `upload(sftp_session, local_path, remote_path, app, transfer_id)` — reads local file, writes remotely, emits `sftp-progress-{transfer_id}` events
- `mkdir(sftp_session, path)`
- `remove(sftp_session, path)` — removes file or empty directory
- `rename(sftp_session, old_path, new_path)`

### `src-tauri/src/ssh/manager.rs` (modified)

Adds SFTP session caching:
- `sftp_sessions: Arc<Mutex<HashMap<String, SftpSession>>>` — keyed by connection_id
- `open_sftp(connection_id) -> SftpSession` — opens SFTP subsystem on first call, returns cached session on subsequent calls
- SFTP session is removed when SSH connection disconnects

### Tauri Commands (6 new in `src-tauri/src/commands/ssh.rs`)

- `sftp_list_dir(connection_id, path) -> Vec<FileEntry>`
- `sftp_download(connection_id, remote_path, local_path) -> String` (returns transfer_id)
- `sftp_upload(connection_id, local_path, remote_path) -> String` (returns transfer_id)
- `sftp_mkdir(connection_id, path)`
- `sftp_remove(connection_id, path)`
- `sftp_rename(connection_id, old_path, new_path)`

## Frontend

### `src/components/Grid/SftpPanel.tsx` (new)

Right-side slide-in panel, 240px wide, visible only when toggled from SSH pane toolbar.

Layout:
- **Header**: current path (breadcrumb-style), back button, home (~) button, close (X) button
- **File list**: scrollable list of FileEntry items
  - Folder icon + name → click to navigate
  - File icon + name + size → click to download (opens save dialog)
  - Right-click or long-press: context menu (rename, delete)
- **Upload zone**: "Drop files here or click to upload" at bottom, uses `<input type="file">` + drag events
- **Progress bar**: inline at bottom during active transfer, shows filename + percentage
- **Error display**: inline red text, auto-dismiss after 5s

Styling: matches existing panel patterns (PipelineConfigPanel, SshHostPicker) — dark surface, border, shadow.

### `src/components/Grid/GridCell.tsx` (modified)

Adds SFTP toggle button in toolbar, visible only when pane has active SSH connection:
- Folder icon, accent color when panel is open
- Click toggles SftpPanel visibility
- Panel renders inside the cell div, absolutely positioned on the right

### `src/lib/tauri-commands.ts` (modified)

Adds sftp command bindings inside the existing `ssh` export:
```typescript
sftp: {
  listDir: (connectionId, path) => invoke('sftp_list_dir', { connectionId, path }),
  download: (connectionId, remotePath, localPath) => invoke('sftp_download', { connectionId, remotePath, localPath }),
  upload: (connectionId, localPath, remotePath) => invoke('sftp_upload', { connectionId, localPath, remotePath }),
  mkdir: (connectionId, path) => invoke('sftp_mkdir', { connectionId, path }),
  remove: (connectionId, path) => invoke('sftp_remove', { connectionId, path }),
  rename: (connectionId, oldPath, newPath) => invoke('sftp_rename', { connectionId, oldPath, newPath }),
}
```

## Dependencies

- `russh-sftp = "2"` added to `Cargo.toml`

## Error Handling

- SFTP errors display inline in the panel, never affect the shell channel
- If SSH connection drops, panel shows "Disconnected" and disables all buttons
- Upload/download failures show error message + retry action
- Permission denied errors show clear message

## Out of Scope

- Remote file editing (open in local editor)
- Recursive directory download/upload
- File permissions editing
- Symlink resolution
