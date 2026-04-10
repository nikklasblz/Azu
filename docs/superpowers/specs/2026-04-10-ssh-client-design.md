# SSH Client Design — Phase 1: Native SSH in Azu

## Overview

Native SSH client using `russh` (pure Rust). No dependency on system OpenSSH binary. Integrates into existing grid panes — any pane can be local terminal or SSH remote. Includes shell, SFTP, and port forwarding.

## Architecture

### Rust Backend — Three Layers

#### 1. `src-tauri/src/ssh/connection.rs`

Wrapper over `russh`. Manages connect, auth, keep-alive, reconnect.

- `SshConnection` struct holds the `russh::client::Handle` and connection metadata
- Each connection runs in its own tokio task
- Keep-alive every 30s
- Reconnect: 3 retries with backoff (2s, 5s, 10s) on disconnect

Auth order (automatic):
1. SSH agent (if available)
2. Key file specified in host config
3. Default keys (`~/.ssh/id_ed25519`, `~/.ssh/id_rsa`)
4. Password prompt (inline in the pane, not OS popup)

#### 2. `src-tauri/src/ssh/session.rs`

Channel multiplexor over a single connection. One `SshSession` can have multiple concurrent channels:
- Shell channel (interactive PTY)
- SFTP channel
- Port forward channels (local and remote)

Each channel is independent. Channels can be opened/closed without affecting others.

#### 3. `src-tauri/src/ssh/manager.rs`

Global registry managed by Tauri (`.manage(SshManager)`):
- Active connections registry
- Host config loader (merges `~/.ssh/config` + `~/.azu/ssh-hosts.json`)
- Tauri commands: `ssh_connect`, `ssh_disconnect`, `ssh_write`, `ssh_resize`, `ssh_list_hosts`, `ssh_add_host`, `ssh_remove_host`

#### 4. `src-tauri/src/ssh/config_parser.rs`

Parser for `~/.ssh/config`:
- Reads `Host`, `HostName`, `User`, `Port`, `IdentityFile`, `ProxyJump`
- Read-only, never modifies the file
- Re-parsed when user opens SSH host selector

### Rust Backend — SFTP

#### 5. `src-tauri/src/ssh/sftp.rs`

SFTP operations over a dedicated channel on the same SSH connection:
- `sftp_list_dir` — list remote directory
- `sftp_download` — download file to local path (with progress events)
- `sftp_upload` — upload local file to remote path (with progress events)
- `sftp_mkdir`, `sftp_remove` — basic file operations

No remote editing — transfer only.

### Rust Backend — Port Forwarding

#### 6. `src-tauri/src/ssh/forwarding.rs`

Port forward channels on the same SSH connection:
- Local forward: binds local port, tunnels to remote host:port
- Remote forward: requests remote side to forward to local host:port
- Each forward is a separate tokio task
- `ssh_add_forward`, `ssh_remove_forward`, `ssh_list_forwards` commands
- Forwards can be started/stopped in-flight without reconnecting

### Frontend

#### `src/stores/ssh.ts`

Reactive store:
- `hosts: SshHost[]` — merged list from ssh config + azu config
- `connections: Record<string, SshConnectionState>` — active connections by id
- `connectionState(id)` — 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

Functions:
- `loadHosts()` — call backend to parse configs
- `connect(hostId)` — connect + open shell channel
- `disconnect(connectionId)` — close connection
- `initSshListeners()` — listen for `ssh-output-{id}`, `ssh-status-{id}` events

#### `src/stores/grid.ts` changes

GridNode gains optional field:
```typescript
ssh?: {
  hostId: string
  connectionId: string
}
```

When a pane has `ssh`, Terminal component receives output from `ssh-output-{id}` events instead of `pty-output-{id}`. User input writes via `ssh_write` command instead of `write_pty`.

#### `src/components/Grid/SshHostPicker.tsx` (new)

Dropdown triggered from pane toolbar:
- Lists hosts from `~/.ssh/config` + `~/.azu/ssh-hosts.json`
- "Add new host..." option at bottom → inline form (host, user, port, key path)
- Selecting a host: closes local PTY, connects SSH, converts pane to remote

#### `src/components/Grid/SftpPanel.tsx` (new)

Slide-out panel from SSH pane toolbar:
- File list of remote directory with navigation
- Upload: drag & drop or button → file picker
- Download: click file → save dialog
- Progress indicator for transfers

## Data Flow

```
User clicks SSH icon in pane toolbar → SshHostPicker dropdown
→ selects host → ssh_connect command → SshManager.connect()
→ SshConnection authenticates → SshSession.open_shell(rows, cols)
→ channel reader thread emits "ssh-output-{id}" events
→ Terminal component renders (same as local PTY)
→ user types → ssh_write command → channel write → remote server
```

Terminal component is unchanged — it receives output from either `pty-output-{id}` or `ssh-output-{id}` via the same Tauri event mechanism.

## Host Configuration

### `~/.ssh/config` (read-only)

Parsed fields: `Host`, `HostName`, `User`, `Port`, `IdentityFile`, `ProxyJump`.

### `~/.azu/ssh-hosts.json` (read-write)

```json
[
  {
    "id": "lightsail-1",
    "name": "Lightsail Prod",
    "host": "52.14.xxx.xxx",
    "port": 22,
    "user": "ubuntu",
    "identityFile": "~/.ssh/lightsail.pem",
    "tags": ["aws", "prod"],
    "forwards": [
      { "type": "local", "localPort": 3000, "remoteHost": "localhost", "remotePort": 3000 },
      { "type": "remote", "remotePort": 8080, "localHost": "localhost", "localPort": 8080 }
    ]
  }
]
```

Merge strategy: `~/.ssh/config` hosts appear first, then `~/.azu/ssh-hosts.json` additions. If both define the same host, Azu config fields override ssh config fields.

## UI Integration

### Pane Toolbar (SSH mode)

When pane is SSH:
- Connection badge: green/yellow/red dot + `user@host`
- SFTP button (opens SftpPanel)
- Port Forwards button (dropdown: active forwards + "Add forward...")
- Disconnect button (replaces folder picker)

### Pane Toolbar (local mode, new button)

- SSH button: terminal icon with arrow `→`, opens SshHostPicker
- Positioned after the Launch CLI button

### Visual indicators for remote panes

- 2px accent-colored top border on the pane
- Label shows `user@host` instead of local cwd
- StatusBar shows count of active SSH connections

### Presets

- Presets save `ssh.hostId` on panes
- Loading a preset with SSH panes auto-reconnects
- If reconnect fails, pane shows "Reconnecting..." with retry button

## Port Forwarding UI

- StatusBar indicator: `L:3000→3000` with active/inactive state
- Per-pane dropdown to add/remove forwards in-flight
- Pre-configured forwards from host config activate on connect

## Implementation Order

1. **Shell interactivo** — connection, auth, channel, Terminal integration
2. **Host config** — parser for `~/.ssh/config`, Azu config CRUD, host picker UI
3. **SFTP panel** — file listing, upload, download
4. **Port forwarding** — local/remote forwards, UI controls

## Dependencies

- `russh = "0.46"` — SSH protocol implementation
- `russh-sftp = "2"` — SFTP over russh
- `russh-keys = "0.46"` — Key parsing and SSH agent

## Testing

- Unit tests: SSH config parser (`~/.ssh/config` format edge cases)
- Unit tests: host config CRUD (load, save, merge)
- Unit tests: auth order logic
- Unit tests: forward config validation
- Frontend tests: ssh store signals, host picker state
- Integration tests: connect/auth/shell against mock SSH server (if russh provides test utilities, otherwise deferred)

## Error Handling

- Auth failure: show error inline in pane, offer retry with different method
- Connection timeout (10s default): show error, no auto-retry on first connect
- Disconnect during session: auto-reconnect with backoff, visual feedback
- SFTP errors: show in panel inline, don't affect shell channel
- Port forward bind failure: show error in StatusBar indicator, skip that forward

## Out of Scope (this spec)

- SSH tunneling as VPN / SOCKS proxy
- Remote file editing (open remote file in local editor)
- SSH key generation
- Cloud provider API integration (Phase 2: Lightsail/cloud-focused)
- Connection manager UI with drag-to-reorder (Phase 3)
