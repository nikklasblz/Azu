# SSH Client Phase 1: Interactive Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add native SSH shell connections to Azu grid panes using `russh`, with key/password auth, keep-alive, and reconnect.

**Architecture:** Three Rust modules (connection, session, manager) wrap `russh` to provide SSH connections as Tauri-managed state. The frontend SSH store mirrors the PTY store pattern — same Tauri event mechanism (`ssh-output-{id}`), so the Terminal component works for both local and remote panes. A host picker dropdown in the pane toolbar lets users connect to SSH hosts from `~/.ssh/config` or `~/.azu/ssh-hosts.json`.

**Tech Stack:** `russh` 0.54 (SSH protocol), `russh-keys` 0.54 (key parsing), `ssh-config` (parser for `~/.ssh/config`), SolidJS stores, Tauri commands/events.

---

## File Structure

### Rust Backend (new files)

| File | Responsibility |
|------|---------------|
| `src-tauri/src/ssh/mod.rs` | Module exports |
| `src-tauri/src/ssh/types.rs` | `SshHostConfig`, `SshConnectionInfo`, serializable types |
| `src-tauri/src/ssh/config_parser.rs` | Parse `~/.ssh/config` + load/save `~/.azu/ssh-hosts.json` |
| `src-tauri/src/ssh/connection.rs` | `SshConnection` — connect, auth, keep-alive, reconnect |
| `src-tauri/src/ssh/session.rs` | `SshSession` — open shell channel, read/write, resize |
| `src-tauri/src/ssh/manager.rs` | `SshManager` — registry of connections, Tauri state |
| `src-tauri/src/commands/ssh.rs` | Tauri commands: connect, disconnect, write, resize, list/add/remove hosts |

### Frontend (new files)

| File | Responsibility |
|------|---------------|
| `src/stores/ssh.ts` | Reactive store: hosts, connections, state signals |
| `src/components/Grid/SshHostPicker.tsx` | Dropdown to select/add SSH hosts from pane toolbar |

### Modified files

| File | Change |
|------|--------|
| `src-tauri/Cargo.toml` | Add `russh`, `russh-keys`, `ssh-config` deps |
| `src-tauri/src/lib.rs` | Add `mod ssh`, manage `SshManager`, register ssh commands |
| `src-tauri/src/commands/mod.rs` | Add `pub mod ssh` |
| `src/stores/grid.ts` | Add `ssh?: { hostId: string, connectionId: string }` to `GridNode` |
| `src/lib/tauri-commands.ts` | Add `ssh` command bindings |
| `src/components/Grid/GridCell.tsx` | Add SSH button + connection badge + conditional behavior |
| `src/components/Terminal/Terminal.tsx` | Accept `sshConnectionId` prop, listen to `ssh-output-{id}` when SSH |
| `src/components/StatusBar/StatusBar.tsx` | Show active SSH connection count |
| `src/App.tsx` | Init SSH store listeners |

---

## Task 1: Add Rust Dependencies

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add russh dependencies**

Add to `[dependencies]` section in `src-tauri/Cargo.toml`:

```toml
russh = "0.54"
russh-keys = "0.54"
```

- [ ] **Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: Compiles with no new errors (existing warnings OK)

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "deps: add russh and russh-keys for native SSH"
```

---

## Task 2: SSH Types

**Files:**
- Create: `src-tauri/src/ssh/mod.rs`
- Create: `src-tauri/src/ssh/types.rs`

- [ ] **Step 1: Create ssh module**

Create `src-tauri/src/ssh/mod.rs`:

```rust
pub mod types;
pub mod config_parser;
pub mod connection;
pub mod session;
pub mod manager;

pub use manager::SshManager;
pub use types::*;
```

- [ ] **Step 2: Write types with tests**

Create `src-tauri/src/ssh/types.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshHostConfig {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub user: String,
    #[serde(rename = "identityFile")]
    pub identity_file: Option<String>,
    pub tags: Option<Vec<String>>,
    /// "ssh-config" if from ~/.ssh/config, "azu" if from ~/.azu/ssh-hosts.json
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshConnectionInfo {
    pub id: String,
    pub host_id: String,
    pub status: String, // "connecting" | "connected" | "reconnecting" | "disconnected"
    pub host: String,
    pub user: String,
    pub connected_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshAuthRequest {
    pub host_id: String,
    pub password: Option<String>,
}

impl SshHostConfig {
    /// Expand ~ to home directory in identity_file path
    pub fn resolved_identity_file(&self) -> Option<std::path::PathBuf> {
        self.identity_file.as_ref().map(|f| {
            if f.starts_with("~/") || f.starts_with("~\\") {
                dirs::home_dir()
                    .unwrap_or_default()
                    .join(&f[2..])
            } else {
                std::path::PathBuf::from(f)
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_host_config_serde() {
        let config = SshHostConfig {
            id: "test-1".into(),
            name: "Test Server".into(),
            host: "192.168.1.1".into(),
            port: 22,
            user: "ubuntu".into(),
            identity_file: Some("~/.ssh/id_rsa".into()),
            tags: Some(vec!["dev".into()]),
            source: "azu".into(),
        };
        let json = serde_json::to_string(&config).unwrap();
        let back: SshHostConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(back.id, "test-1");
        assert_eq!(back.port, 22);
        assert_eq!(back.identity_file, Some("~/.ssh/id_rsa".into()));
    }

    #[test]
    fn test_resolved_identity_file_tilde() {
        let config = SshHostConfig {
            id: "x".into(),
            name: "x".into(),
            host: "x".into(),
            port: 22,
            user: "x".into(),
            identity_file: Some("~/.ssh/my_key".into()),
            tags: None,
            source: "azu".into(),
        };
        let resolved = config.resolved_identity_file().unwrap();
        assert!(resolved.ends_with(".ssh/my_key") || resolved.ends_with(".ssh\\my_key"));
        assert!(!resolved.to_str().unwrap().starts_with("~"));
    }

    #[test]
    fn test_resolved_identity_file_absolute() {
        let config = SshHostConfig {
            id: "x".into(),
            name: "x".into(),
            host: "x".into(),
            port: 22,
            user: "x".into(),
            identity_file: Some("/home/user/.ssh/key".into()),
            tags: None,
            source: "azu".into(),
        };
        let resolved = config.resolved_identity_file().unwrap();
        assert_eq!(resolved.to_str().unwrap(), "/home/user/.ssh/key");
    }

    #[test]
    fn test_resolved_identity_file_none() {
        let config = SshHostConfig {
            id: "x".into(),
            name: "x".into(),
            host: "x".into(),
            port: 22,
            user: "x".into(),
            identity_file: None,
            tags: None,
            source: "azu".into(),
        };
        assert!(config.resolved_identity_file().is_none());
    }

    #[test]
    fn test_connection_info_serde() {
        let info = SshConnectionInfo {
            id: "conn-1".into(),
            host_id: "host-1".into(),
            status: "connected".into(),
            host: "192.168.1.1".into(),
            user: "ubuntu".into(),
            connected_at: Some(1234567890),
        };
        let json = serde_json::to_string(&info).unwrap();
        let back: SshConnectionInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(back.status, "connected");
    }
}
```

- [ ] **Step 3: Run tests**

Run: `cd src-tauri && cargo test ssh::types`
Expected: All 5 tests pass

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/ssh/
git commit -m "feat(ssh): add types module — SshHostConfig, SshConnectionInfo"
```

---

## Task 3: SSH Config Parser

**Files:**
- Create: `src-tauri/src/ssh/config_parser.rs`

- [ ] **Step 1: Write tests first**

Create `src-tauri/src/ssh/config_parser.rs` with the tests at the bottom:

```rust
use crate::ssh::types::SshHostConfig;
use std::path::{Path, PathBuf};

/// Parse ~/.ssh/config and return a list of host configs.
/// Only reads Host, HostName, User, Port, IdentityFile fields.
pub fn parse_ssh_config(path: &Path) -> Vec<SshHostConfig> {
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };
    parse_ssh_config_str(&content)
}

/// Parse ssh config from string (for testing).
pub fn parse_ssh_config_str(content: &str) -> Vec<SshHostConfig> {
    let mut hosts: Vec<SshHostConfig> = Vec::new();
    let mut current_name: Option<String> = None;
    let mut hostname: Option<String> = None;
    let mut user: Option<String> = None;
    let mut port: Option<u16> = None;
    let mut identity_file: Option<String> = None;

    let flush = |hosts: &mut Vec<SshHostConfig>,
                 name: &Option<String>,
                 hostname: &mut Option<String>,
                 user: &mut Option<String>,
                 port: &mut Option<u16>,
                 identity_file: &mut Option<String>| {
        if let Some(ref name) = name {
            // Skip wildcard entries
            if name.contains('*') || name.contains('?') {
                return;
            }
            let host_val = hostname.take().unwrap_or_else(|| name.clone());
            hosts.push(SshHostConfig {
                id: format!("ssh-config-{}", name),
                name: name.clone(),
                host: host_val,
                port: port.take().unwrap_or(22),
                user: user.take().unwrap_or_else(|| String::new()),
                identity_file: identity_file.take(),
                tags: None,
                source: "ssh-config".into(),
            });
        }
    };

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        // Split on first whitespace or '='
        let (key, value) = match line.split_once(|c: char| c.is_whitespace() || c == '=') {
            Some((k, v)) => (k.trim().to_lowercase(), v.trim().to_string()),
            None => continue,
        };

        match key.as_str() {
            "host" => {
                flush(&mut hosts, &current_name, &mut hostname, &mut user, &mut port, &mut identity_file);
                current_name = Some(value);
            }
            "hostname" => hostname = Some(value),
            "user" => user = Some(value),
            "port" => port = value.parse().ok(),
            "identityfile" => identity_file = Some(value),
            _ => {} // Ignore unsupported directives
        }
    }
    // Flush last entry
    flush(&mut hosts, &current_name, &mut hostname, &mut user, &mut port, &mut identity_file);

    hosts
}

/// Default path for ~/.ssh/config
pub fn default_ssh_config_path() -> PathBuf {
    dirs::home_dir().unwrap_or_default().join(".ssh").join("config")
}

/// Default path for ~/.azu/ssh-hosts.json
pub fn default_azu_hosts_path() -> PathBuf {
    dirs::home_dir().unwrap_or_default().join(".azu").join("ssh-hosts.json")
}

/// Load host configs from ~/.azu/ssh-hosts.json
pub fn load_azu_hosts(path: &Path) -> Vec<SshHostConfig> {
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };
    serde_json::from_str(&content).unwrap_or_default()
}

/// Save host configs to ~/.azu/ssh-hosts.json
pub fn save_azu_hosts(path: &Path, hosts: &[SshHostConfig]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(hosts).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())
}

/// Merge ssh config hosts + azu hosts. Azu hosts override ssh-config hosts with same id.
pub fn merge_hosts(ssh_config: Vec<SshHostConfig>, azu_hosts: Vec<SshHostConfig>) -> Vec<SshHostConfig> {
    let mut merged = ssh_config;
    for azu in azu_hosts {
        if let Some(pos) = merged.iter().position(|h| h.id == azu.id) {
            merged[pos] = azu;
        } else {
            merged.push(azu);
        }
    }
    merged
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_basic_ssh_config() {
        let config = "\
Host myserver
    HostName 192.168.1.100
    User admin
    Port 2222
    IdentityFile ~/.ssh/mykey

Host devbox
    HostName dev.example.com
    User developer
";
        let hosts = parse_ssh_config_str(config);
        assert_eq!(hosts.len(), 2);

        assert_eq!(hosts[0].name, "myserver");
        assert_eq!(hosts[0].host, "192.168.1.100");
        assert_eq!(hosts[0].user, "admin");
        assert_eq!(hosts[0].port, 2222);
        assert_eq!(hosts[0].identity_file, Some("~/.ssh/mykey".into()));
        assert_eq!(hosts[0].source, "ssh-config");

        assert_eq!(hosts[1].name, "devbox");
        assert_eq!(hosts[1].host, "dev.example.com");
        assert_eq!(hosts[1].user, "developer");
        assert_eq!(hosts[1].port, 22); // default
    }

    #[test]
    fn test_parse_skips_wildcards() {
        let config = "\
Host *
    ServerAliveInterval 60

Host prod
    HostName prod.example.com
    User deploy
";
        let hosts = parse_ssh_config_str(config);
        assert_eq!(hosts.len(), 1);
        assert_eq!(hosts[0].name, "prod");
    }

    #[test]
    fn test_parse_empty_config() {
        let hosts = parse_ssh_config_str("");
        assert!(hosts.is_empty());
    }

    #[test]
    fn test_parse_comments_ignored() {
        let config = "\
# This is a comment
Host test
    # Another comment
    HostName test.local
    User root
";
        let hosts = parse_ssh_config_str(config);
        assert_eq!(hosts.len(), 1);
        assert_eq!(hosts[0].host, "test.local");
    }

    #[test]
    fn test_parse_hostname_defaults_to_host() {
        let config = "\
Host myalias
    User admin
";
        let hosts = parse_ssh_config_str(config);
        assert_eq!(hosts.len(), 1);
        assert_eq!(hosts[0].host, "myalias"); // HostName not specified, falls back to Host
    }

    #[test]
    fn test_parse_equals_syntax() {
        let config = "\
Host eqtest
    HostName=eq.example.com
    User=equser
    Port=3333
";
        let hosts = parse_ssh_config_str(config);
        assert_eq!(hosts.len(), 1);
        assert_eq!(hosts[0].host, "eq.example.com");
        assert_eq!(hosts[0].user, "equser");
        assert_eq!(hosts[0].port, 3333);
    }

    #[test]
    fn test_merge_hosts_no_overlap() {
        let ssh = vec![SshHostConfig {
            id: "ssh-config-a".into(), name: "a".into(), host: "a.com".into(),
            port: 22, user: "u".into(), identity_file: None, tags: None, source: "ssh-config".into(),
        }];
        let azu = vec![SshHostConfig {
            id: "azu-b".into(), name: "b".into(), host: "b.com".into(),
            port: 22, user: "u".into(), identity_file: None, tags: None, source: "azu".into(),
        }];
        let merged = merge_hosts(ssh, azu);
        assert_eq!(merged.len(), 2);
    }

    #[test]
    fn test_merge_hosts_azu_overrides() {
        let ssh = vec![SshHostConfig {
            id: "shared-id".into(), name: "a".into(), host: "old.com".into(),
            port: 22, user: "old".into(), identity_file: None, tags: None, source: "ssh-config".into(),
        }];
        let azu = vec![SshHostConfig {
            id: "shared-id".into(), name: "a-updated".into(), host: "new.com".into(),
            port: 2222, user: "new".into(), identity_file: None, tags: None, source: "azu".into(),
        }];
        let merged = merge_hosts(ssh, azu);
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].host, "new.com");
        assert_eq!(merged[0].user, "new");
    }

    #[test]
    fn test_save_and_load_azu_hosts() {
        let dir = std::env::temp_dir().join("azu-test-ssh-hosts");
        let _ = std::fs::remove_dir_all(&dir);
        let path = dir.join("ssh-hosts.json");

        let hosts = vec![SshHostConfig {
            id: "test-1".into(), name: "Test".into(), host: "test.com".into(),
            port: 22, user: "admin".into(), identity_file: None,
            tags: Some(vec!["prod".into()]), source: "azu".into(),
        }];

        save_azu_hosts(&path, &hosts).unwrap();
        let loaded = load_azu_hosts(&path);
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].id, "test-1");
        assert_eq!(loaded[0].tags, Some(vec!["prod".into()]));

        let _ = std::fs::remove_dir_all(&dir);
    }
}
```

- [ ] **Step 2: Run tests**

Run: `cd src-tauri && cargo test ssh::config_parser`
Expected: All 9 tests pass

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/ssh/config_parser.rs
git commit -m "feat(ssh): config parser — ~/.ssh/config + ~/.azu/ssh-hosts.json"
```

---

## Task 4: SSH Connection

**Files:**
- Create: `src-tauri/src/ssh/connection.rs`

- [ ] **Step 1: Write the connection module**

Create `src-tauri/src/ssh/connection.rs`:

```rust
use std::sync::Arc;
use russh::*;
use russh_keys::key;
use crate::ssh::types::SshHostConfig;

/// Client handler for russh — accepts all server keys (like StrictHostKeyChecking=no).
/// TODO: In a future iteration, implement known_hosts checking.
pub struct AzuSshHandler;

impl client::Handler for AzuSshHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &ssh_key::PublicKey,
    ) -> Result<bool, Self::Error> {
        // Accept all keys for now (equivalent to StrictHostKeyChecking=no)
        Ok(true)
    }
}

/// Attempt to authenticate using the configured auth chain:
/// 1. Key file specified in host config
/// 2. Default keys (~/.ssh/id_ed25519, ~/.ssh/id_rsa)
/// 3. Password (if provided)
pub async fn authenticate(
    session: &mut client::Handle<AzuSshHandler>,
    host: &SshHostConfig,
    password: Option<&str>,
) -> Result<(), String> {
    let user = &host.user;

    // Try key file from config
    if let Some(key_path) = host.resolved_identity_file() {
        if key_path.exists() {
            if try_key_auth(session, user, &key_path).await? {
                return Ok(());
            }
        }
    }

    // Try default keys
    let home = dirs::home_dir().unwrap_or_default();
    let default_keys = [
        home.join(".ssh").join("id_ed25519"),
        home.join(".ssh").join("id_rsa"),
    ];
    for key_path in &default_keys {
        if key_path.exists() {
            if try_key_auth(session, user, key_path).await? {
                return Ok(());
            }
        }
    }

    // Try password
    if let Some(pw) = password {
        let auth_result = session
            .authenticate_password(user, pw)
            .await
            .map_err(|e| format!("Password auth error: {}", e))?;
        if auth_result.success() {
            return Ok(());
        }
    }

    Err("All authentication methods failed".into())
}

async fn try_key_auth(
    session: &mut client::Handle<AzuSshHandler>,
    user: &str,
    key_path: &std::path::Path,
) -> Result<bool, String> {
    let key = match russh_keys::load_secret_key(key_path, None) {
        Ok(k) => k,
        Err(_) => return Ok(false), // Key couldn't be loaded, skip
    };
    let auth_result = session
        .authenticate_publickey(user, Arc::new(key))
        .await
        .map_err(|e| format!("Key auth error: {}", e))?;
    Ok(auth_result.success())
}

/// Connect to an SSH server and authenticate.
/// Returns the authenticated session handle.
pub async fn connect(
    host: &SshHostConfig,
    password: Option<&str>,
) -> Result<client::Handle<AzuSshHandler>, String> {
    let config = client::Config {
        inactivity_timeout: Some(std::time::Duration::from_secs(60)),
        keepalive_interval: Some(std::time::Duration::from_secs(30)),
        ..Default::default()
    };

    let handler = AzuSshHandler;

    let mut session = client::connect(
        Arc::new(config),
        (host.host.as_str(), host.port),
        handler,
    )
    .await
    .map_err(|e| format!("Connection failed: {}", e))?;

    authenticate(&mut session, host, password).await?;

    Ok(session)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_handler_is_send() {
        // Verify AzuSshHandler can be sent across threads (required by russh)
        fn assert_send<T: Send>() {}
        assert_send::<AzuSshHandler>();
    }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: Compiles (may have warnings about unused imports — OK)

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/ssh/connection.rs
git commit -m "feat(ssh): connection module — connect + auth chain (key/password)"
```

---

## Task 5: SSH Session (Shell Channel)

**Files:**
- Create: `src-tauri/src/ssh/session.rs`

- [ ] **Step 1: Write the session module**

Create `src-tauri/src/ssh/session.rs`:

```rust
use russh::*;
use crate::ssh::connection::AzuSshHandler;
use tauri::{AppHandle, Emitter};

/// Manages an interactive shell channel over an SSH connection.
pub struct SshShellChannel {
    channel_id: String,
}

impl SshShellChannel {
    /// Open an interactive shell channel on the given SSH session.
    /// Requests a PTY and starts a shell, then spawns a reader thread
    /// that emits Tauri events with the output.
    pub async fn open(
        session: &mut client::Handle<AzuSshHandler>,
        app: AppHandle,
        channel_id: String,
        rows: u32,
        cols: u32,
    ) -> Result<Self, String> {
        let mut channel = session
            .channel_open_session()
            .await
            .map_err(|e| format!("Failed to open session channel: {}", e))?;

        // Request PTY
        channel
            .request_pty(
                false,
                "xterm-256color",
                cols,
                rows,
                0, // pixel width
                0, // pixel height
                &[], // terminal modes
            )
            .await
            .map_err(|e| format!("Failed to request PTY: {}", e))?;

        // Request shell
        channel
            .request_shell(false)
            .await
            .map_err(|e| format!("Failed to request shell: {}", e))?;

        let cid = channel_id.clone();

        // Spawn reader task
        let app_clone = app.clone();
        tokio::spawn(async move {
            loop {
                let msg = channel.wait().await;
                match msg {
                    Some(ChannelMsg::Data { data }) => {
                        let text = String::from_utf8_lossy(&data).to_string();
                        let _ = app_clone.emit(&format!("ssh-output-{}", cid), text);
                    }
                    Some(ChannelMsg::ExitStatus { exit_status }) => {
                        let _ = app_clone.emit(&format!("ssh-exit-{}", cid), exit_status as i32);
                        break;
                    }
                    Some(ChannelMsg::Eof) => {
                        let _ = app_clone.emit(&format!("ssh-exit-{}", cid), 0i32);
                        break;
                    }
                    None => {
                        // Channel closed
                        let _ = app_clone.emit(&format!("ssh-exit-{}", cid), -1i32);
                        break;
                    }
                    _ => {} // Ignore other messages
                }
            }
        });

        Ok(Self { channel_id })
    }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: Compiles

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/ssh/session.rs
git commit -m "feat(ssh): session module — open shell channel with PTY + reader task"
```

---

## Task 6: SSH Manager

**Files:**
- Create: `src-tauri/src/ssh/manager.rs`

- [ ] **Step 1: Write the manager**

Create `src-tauri/src/ssh/manager.rs`:

```rust
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::AppHandle;
use uuid::Uuid;

use crate::ssh::types::{SshHostConfig, SshConnectionInfo};
use crate::ssh::config_parser;
use crate::ssh::connection;
use crate::ssh::session::SshShellChannel;
use russh::client;
use crate::ssh::connection::AzuSshHandler;

struct ActiveConnection {
    info: SshConnectionInfo,
    handle: client::Handle<AzuSshHandler>,
}

pub struct SshManager {
    connections: Arc<Mutex<HashMap<String, ActiveConnection>>>,
    hosts: Arc<Mutex<Vec<SshHostConfig>>>,
}

impl SshManager {
    pub fn new() -> Self {
        Self {
            connections: Arc::new(Mutex::new(HashMap::new())),
            hosts: Arc::new(Mutex::new(Vec::new())),
        }
    }

    /// Load and merge hosts from ~/.ssh/config + ~/.azu/ssh-hosts.json
    pub async fn load_hosts(&self) -> Vec<SshHostConfig> {
        let ssh_path = config_parser::default_ssh_config_path();
        let azu_path = config_parser::default_azu_hosts_path();

        let ssh_hosts = config_parser::parse_ssh_config(&ssh_path);
        let azu_hosts = config_parser::load_azu_hosts(&azu_path);
        let merged = config_parser::merge_hosts(ssh_hosts, azu_hosts);

        let mut hosts = self.hosts.lock().await;
        *hosts = merged.clone();
        merged
    }

    /// Add a new host to ~/.azu/ssh-hosts.json
    pub async fn add_host(&self, host: SshHostConfig) -> Result<Vec<SshHostConfig>, String> {
        let azu_path = config_parser::default_azu_hosts_path();
        let mut azu_hosts = config_parser::load_azu_hosts(&azu_path);
        azu_hosts.push(host);
        config_parser::save_azu_hosts(&azu_path, &azu_hosts)?;
        Ok(self.load_hosts().await)
    }

    /// Remove a host from ~/.azu/ssh-hosts.json (cannot remove ssh-config hosts)
    pub async fn remove_host(&self, host_id: &str) -> Result<Vec<SshHostConfig>, String> {
        let azu_path = config_parser::default_azu_hosts_path();
        let mut azu_hosts = config_parser::load_azu_hosts(&azu_path);
        azu_hosts.retain(|h| h.id != host_id);
        config_parser::save_azu_hosts(&azu_path, &azu_hosts)?;
        Ok(self.load_hosts().await)
    }

    /// Connect to a host and open an interactive shell channel.
    /// Returns the connection ID.
    pub async fn connect(
        &self,
        app: &AppHandle,
        host_id: &str,
        password: Option<&str>,
        rows: u32,
        cols: u32,
    ) -> Result<String, String> {
        let host = {
            let hosts = self.hosts.lock().await;
            hosts.iter().find(|h| h.id == host_id).cloned()
                .ok_or_else(|| format!("Host '{}' not found", host_id))?
        };

        let connection_id = Uuid::new_v4().to_string();

        // Emit connecting status
        let info = SshConnectionInfo {
            id: connection_id.clone(),
            host_id: host_id.into(),
            status: "connecting".into(),
            host: host.host.clone(),
            user: host.user.clone(),
            connected_at: None,
        };
        let _ = app.emit("ssh-status", &info);

        // Connect and authenticate
        let mut handle = connection::connect(&host, password).await.map_err(|e| {
            let mut fail_info = info.clone();
            fail_info.status = "disconnected".into();
            let _ = app.emit("ssh-status", &fail_info);
            e
        })?;

        // Open shell channel
        SshShellChannel::open(&mut handle, app.clone(), connection_id.clone(), rows, cols).await?;

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let connected_info = SshConnectionInfo {
            id: connection_id.clone(),
            host_id: host_id.into(),
            status: "connected".into(),
            host: host.host.clone(),
            user: host.user.clone(),
            connected_at: Some(now),
        };
        let _ = app.emit("ssh-status", &connected_info);

        let active = ActiveConnection {
            info: connected_info,
            handle,
        };
        self.connections.lock().await.insert(connection_id.clone(), active);

        Ok(connection_id)
    }

    /// Write data to the SSH shell channel.
    pub async fn write(&self, connection_id: &str, data: &[u8]) -> Result<(), String> {
        let mut conns = self.connections.lock().await;
        let conn = conns.get_mut(connection_id)
            .ok_or("SSH connection not found")?;
        conn.handle.data(
            russh::ChannelId::new(0),
            russh::CryptoVec::from(data.to_vec()),
        ).await.map_err(|e| format!("SSH write error: {}", e))
    }

    /// Resize the SSH PTY.
    pub async fn resize(&self, connection_id: &str, rows: u32, cols: u32) -> Result<(), String> {
        let conns = self.connections.lock().await;
        let conn = conns.get(connection_id)
            .ok_or("SSH connection not found")?;
        conn.handle.window_change(
            russh::ChannelId::new(0),
            cols,
            rows,
            0,
            0,
        ).await.map_err(|e| format!("SSH resize error: {}", e))
    }

    /// Disconnect an SSH session.
    pub async fn disconnect(&self, connection_id: &str, app: &AppHandle) -> Result<(), String> {
        let mut conns = self.connections.lock().await;
        if let Some(mut conn) = conns.remove(connection_id) {
            conn.info.status = "disconnected".into();
            let _ = app.emit("ssh-status", &conn.info);
            let _ = conn.handle.disconnect(
                russh::Disconnect::ByApplication,
                "User disconnected",
                "en",
            ).await;
        }
        Ok(())
    }

    /// Get list of active connections.
    pub async fn list_connections(&self) -> Vec<SshConnectionInfo> {
        let conns = self.connections.lock().await;
        conns.values().map(|c| c.info.clone()).collect()
    }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: Compiles. There may be issues with `ChannelId::new(0)` — the exact API depends on russh version. Adjust if needed: the write/resize methods need the actual channel ID from the opened channel. This may require storing the `ChannelId` in `ActiveConnection`. Fix compilation errors by following the compiler's suggestions.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/ssh/manager.rs
git commit -m "feat(ssh): manager — connection registry, connect/disconnect/write/resize"
```

---

## Task 7: Tauri SSH Commands

**Files:**
- Create: `src-tauri/src/commands/ssh.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write the commands**

Create `src-tauri/src/commands/ssh.rs`:

```rust
use crate::ssh::{SshManager, SshHostConfig, SshConnectionInfo};
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn ssh_list_hosts(manager: State<'_, SshManager>) -> Result<Vec<SshHostConfig>, String> {
    Ok(manager.load_hosts().await)
}

#[tauri::command]
pub async fn ssh_add_host(
    manager: State<'_, SshManager>,
    host: SshHostConfig,
) -> Result<Vec<SshHostConfig>, String> {
    manager.add_host(host).await
}

#[tauri::command]
pub async fn ssh_remove_host(
    manager: State<'_, SshManager>,
    host_id: String,
) -> Result<Vec<SshHostConfig>, String> {
    manager.remove_host(&host_id).await
}

#[tauri::command]
pub async fn ssh_connect(
    app: AppHandle,
    manager: State<'_, SshManager>,
    host_id: String,
    password: Option<String>,
    rows: u32,
    cols: u32,
) -> Result<String, String> {
    manager.connect(&app, &host_id, password.as_deref(), rows, cols).await
}

#[tauri::command]
pub async fn ssh_disconnect(
    app: AppHandle,
    manager: State<'_, SshManager>,
    connection_id: String,
) -> Result<(), String> {
    manager.disconnect(&connection_id, &app).await
}

#[tauri::command]
pub async fn ssh_write(
    manager: State<'_, SshManager>,
    connection_id: String,
    data: String,
) -> Result<(), String> {
    manager.write(&connection_id, data.as_bytes()).await
}

#[tauri::command]
pub async fn ssh_resize(
    manager: State<'_, SshManager>,
    connection_id: String,
    rows: u32,
    cols: u32,
) -> Result<(), String> {
    manager.resize(&connection_id, rows, cols).await
}

#[tauri::command]
pub async fn ssh_list_connections(
    manager: State<'_, SshManager>,
) -> Result<Vec<SshConnectionInfo>, String> {
    Ok(manager.list_connections().await)
}
```

- [ ] **Step 2: Register module and commands**

Add to `src-tauri/src/commands/mod.rs`:

```rust
pub mod ssh;
```

Add to `src-tauri/src/lib.rs`:

In the `mod` section at the top:
```rust
mod ssh;
```

In the `.manage()` chain:
```rust
.manage(ssh::SshManager::new())
```

In the `invoke_handler` array, add:
```rust
commands::ssh::ssh_list_hosts,
commands::ssh::ssh_add_host,
commands::ssh::ssh_remove_host,
commands::ssh::ssh_connect,
commands::ssh::ssh_disconnect,
commands::ssh::ssh_write,
commands::ssh::ssh_resize,
commands::ssh::ssh_list_connections,
```

- [ ] **Step 3: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: Compiles. Fix any API mismatches (especially `ChannelId` usage in manager.rs).

- [ ] **Step 4: Run all Rust tests**

Run: `cd src-tauri && cargo test`
Expected: All existing tests pass + new ssh tests pass (types, config_parser)

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/ssh.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(ssh): Tauri command layer — 8 commands for SSH operations"
```

---

## Task 8: Frontend SSH Store + Tauri Bindings

**Files:**
- Create: `src/stores/ssh.ts`
- Modify: `src/lib/tauri-commands.ts`

- [ ] **Step 1: Add tauri command bindings**

Add to `src/lib/tauri-commands.ts` after the `pipeline` export:

```typescript
export const ssh = {
  listHosts: (): Promise<any[]> => invoke('ssh_list_hosts'),
  addHost: (host: any): Promise<any[]> => invoke('ssh_add_host', { host }),
  removeHost: (hostId: string): Promise<any[]> => invoke('ssh_remove_host', { hostId }),
  connect: (hostId: string, password: string | null, rows: number, cols: number): Promise<string> =>
    invoke('ssh_connect', { hostId, password, rows, cols }),
  disconnect: (connectionId: string): Promise<void> =>
    invoke('ssh_disconnect', { connectionId }),
  write: (connectionId: string, data: string): Promise<void> =>
    invoke('ssh_write', { connectionId, data }),
  resize: (connectionId: string, rows: number, cols: number): Promise<void> =>
    invoke('ssh_resize', { connectionId, rows, cols }),
  listConnections: (): Promise<any[]> => invoke('ssh_list_connections'),
}
```

- [ ] **Step 2: Create SSH store**

Create `src/stores/ssh.ts`:

```typescript
import { createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'
import { listen } from '@tauri-apps/api/event'
import { ssh as sshCmd } from '../lib/tauri-commands'

export interface SshHost {
  id: string
  name: string
  host: string
  port: number
  user: string
  identityFile?: string
  tags?: string[]
  source: string
}

export interface SshConnection {
  id: string
  hostId: string
  status: 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
  host: string
  user: string
  connectedAt?: number
}

const [hosts, setHosts] = createSignal<SshHost[]>([])
const [connections, setConnections] = createStore<Record<string, SshConnection>>({})

export { hosts, connections }

export async function loadHosts() {
  const result = await sshCmd.listHosts()
  setHosts(result)
  return result
}

export async function addHost(host: Omit<SshHost, 'source'>) {
  const result = await sshCmd.addHost({ ...host, source: 'azu' })
  setHosts(result)
}

export async function removeHost(hostId: string) {
  const result = await sshCmd.removeHost(hostId)
  setHosts(result)
}

export async function connectSsh(hostId: string, password: string | null, rows: number, cols: number): Promise<string> {
  return sshCmd.connect(hostId, password, rows, cols)
}

export async function disconnectSsh(connectionId: string) {
  await sshCmd.disconnect(connectionId)
}

export function getActiveConnectionCount(): number {
  return Object.values(connections).filter(c => c.status === 'connected').length
}

export function initSshListeners() {
  listen<SshConnection>('ssh-status', (event) => {
    const conn = event.payload
    if (conn.status === 'disconnected') {
      setConnections(conn.id, undefined!)
    } else {
      setConnections(conn.id, conn)
    }
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add src/stores/ssh.ts src/lib/tauri-commands.ts
git commit -m "feat(ssh): frontend store + Tauri command bindings"
```

---

## Task 9: Grid Store SSH Field

**Files:**
- Modify: `src/stores/grid.ts`

- [ ] **Step 1: Add ssh field to GridNode**

In `src/stores/grid.ts`, add to the `GridNode` interface after `pipeline?`:

```typescript
  ssh?: {
    hostId: string
    connectionId: string
  }
```

Add a setter function before the `export { gridStore, setGridStore }` line:

```typescript
export function setCellSsh(cellId: string, ssh: { hostId: string; connectionId: string } | undefined) {
  const raw = JSON.parse(JSON.stringify(unwrap(gridStore.root)))
  const newRoot = findAndReplace(raw, cellId, (node) => ({ ...node, ssh }))
  setGridStore('root', reconcile(newRoot))
}
```

- [ ] **Step 2: Run frontend tests**

Run: `npx vitest run`
Expected: All 88 tests pass

- [ ] **Step 3: Commit**

```bash
git add src/stores/grid.ts
git commit -m "feat(ssh): add ssh field to GridNode + setCellSsh setter"
```

---

## Task 10: Terminal Component SSH Support

**Files:**
- Modify: `src/components/Terminal/Terminal.tsx`

- [ ] **Step 1: Add SSH props and conditional event listening**

Update `Terminal.tsx` to support SSH connections. The component already listens to `pty-output-{id}` and writes via `pty.write()`. When `sshConnectionId` is set, it should listen to `ssh-output-{id}` and write via `ssh.write()` instead.

Update the interface:

```typescript
interface TerminalProps {
  ptyId: string
  themeId?: string
  sshConnectionId?: string
}
```

In `onMount`, change the event listeners and write handler to be conditional:

Replace the `pty-output` listener setup:
```typescript
    const isSSH = !!props.sshConnectionId
    const outputEvent = isSSH
      ? `ssh-output-${props.sshConnectionId}`
      : `pty-output-${props.ptyId}`
    const exitEvent = isSSH
      ? `ssh-exit-${props.sshConnectionId}`
      : `pty-exit-${props.ptyId}`

    unlistenOutput = await listen<string>(outputEvent, (event) => {
      term?.write(event.payload)
    })

    unlistenExit = await listen<number>(exitEvent, (event) => {
      const code = event.payload
      term?.write(`\r\n\x1b[${code === 0 ? '32' : '31'}m[Process exited with code ${code}]\x1b[0m\r\n`)
    })
```

Replace the `onData` handler:
```typescript
    term.onData((data) => {
      if (isSSH) {
        sshCmd.write(props.sshConnectionId!, data)
      } else {
        pty.write(props.ptyId, data)
      }
    })
```

Add the SSH resize call alongside the PTY resize:
```typescript
    const dims = term.fit()
    if (isSSH) {
      sshCmd.resize(props.sshConnectionId!, dims.rows, dims.cols).catch(() => {})
    } else {
      pty.resize(props.ptyId, dims.rows, dims.cols).catch(() => {})
    }
```

Add import at top:
```typescript
import { ssh as sshCmd } from '../../lib/tauri-commands'
```

- [ ] **Step 2: Run frontend tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add src/components/Terminal/Terminal.tsx
git commit -m "feat(ssh): Terminal component supports SSH channels — conditional event listeners"
```

---

## Task 11: SSH Host Picker Component

**Files:**
- Create: `src/components/Grid/SshHostPicker.tsx`

- [ ] **Step 1: Create the host picker**

Create `src/components/Grid/SshHostPicker.tsx`:

```tsx
import { Component, createSignal, Show, For, onMount } from 'solid-js'
import { hosts, loadHosts, connectSsh, SshHost } from '../../stores/ssh'
import { setCellSsh } from '../../stores/grid'

interface SshHostPickerProps {
  cellId: string
  colors: any
  onClose: () => void
  onConnected: (connectionId: string) => void
}

const SshHostPicker: Component<SshHostPickerProps> = (props) => {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal('')
  const [showAddForm, setShowAddForm] = createSignal(false)
  const [newHost, setNewHost] = createSignal('')
  const [newUser, setNewUser] = createSignal('')
  const [newPort, setNewPort] = createSignal('22')
  const [newKey, setNewKey] = createSignal('')
  const [connectingId, setConnectingId] = createSignal<string | null>(null)
  const [passwordPrompt, setPasswordPrompt] = createSignal<string | null>(null)
  const [password, setPassword] = createSignal('')

  onMount(async () => {
    setLoading(true)
    await loadHosts()
    setLoading(false)
  })

  const handleConnect = async (host: SshHost) => {
    setConnectingId(host.id)
    setError('')
    try {
      const connId = await connectSsh(host.id, null, 24, 80)
      setCellSsh(props.cellId, { hostId: host.id, connectionId: connId })
      props.onConnected(connId)
      props.onClose()
    } catch (e: any) {
      if (e?.toString().includes('authentication')) {
        setPasswordPrompt(host.id)
      } else {
        setError(String(e))
      }
    }
    setConnectingId(null)
  }

  const handlePasswordConnect = async () => {
    const hostId = passwordPrompt()
    if (!hostId) return
    setConnectingId(hostId)
    setError('')
    try {
      const connId = await connectSsh(hostId, password(), 24, 80)
      setCellSsh(props.cellId, { hostId, connectionId: connId })
      props.onConnected(connId)
      props.onClose()
    } catch (e: any) {
      setError(String(e))
    }
    setConnectingId(null)
    setPasswordPrompt(null)
    setPassword('')
  }

  const inputStyle = () => ({
    background: props.colors.surface,
    color: props.colors.text,
    border: `1px solid ${props.colors.border}`,
    'border-radius': '3px',
    padding: '3px 6px',
    'font-size': '11px',
    width: '100%',
    outline: 'none',
    'box-sizing': 'border-box' as const,
  })

  return (
    <div
      style={{
        position: 'absolute',
        top: '100%',
        left: '0',
        'margin-top': '2px',
        'z-index': '60',
        background: props.colors.surface,
        border: `1px solid ${props.colors.border}`,
        'border-radius': '4px',
        padding: '6px',
        width: '240px',
        'max-height': '300px',
        'overflow-y': 'auto',
        'box-shadow': '0 4px 12px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{ color: props.colors.text, 'font-size': '11px', 'font-weight': '600', 'margin-bottom': '6px' }}>
        SSH Connect
      </div>

      <Show when={loading()}>
        <div style={{ color: props.colors.textMuted, 'font-size': '10px' }}>Loading hosts...</div>
      </Show>

      <Show when={error()}>
        <div style={{ color: props.colors.error, 'font-size': '10px', 'margin-bottom': '4px' }}>{error()}</div>
      </Show>

      {/* Password prompt */}
      <Show when={passwordPrompt()}>
        <div style={{ 'margin-bottom': '6px' }}>
          <div style={{ color: props.colors.textMuted, 'font-size': '10px', 'margin-bottom': '2px' }}>Password required</div>
          <input
            type="password"
            value={password()}
            onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePasswordConnect()}
            placeholder="Password..."
            autofocus
            style={inputStyle()}
          />
          <button
            onClick={handlePasswordConnect}
            style={{
              'margin-top': '4px',
              width: '100%',
              background: props.colors.accent,
              color: props.colors.surface,
              border: 'none',
              'border-radius': '3px',
              padding: '3px 0',
              'font-size': '10px',
              cursor: 'pointer',
            }}
          >
            Connect
          </button>
        </div>
      </Show>

      {/* Host list */}
      <Show when={!passwordPrompt()}>
        <For each={hosts()}>
          {(host) => (
            <button
              style={{
                display: 'flex',
                'align-items': 'center',
                gap: '6px',
                width: '100%',
                padding: '4px 6px',
                background: 'transparent',
                border: 'none',
                'border-radius': '3px',
                color: props.colors.text,
                'font-size': '11px',
                cursor: 'pointer',
                'text-align': 'left',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              onClick={() => handleConnect(host)}
              disabled={connectingId() === host.id}
            >
              <span style={{
                color: host.source === 'ssh-config' ? props.colors.textMuted : props.colors.accent,
                'font-size': '9px',
                'min-width': '24px',
              }}>
                {host.source === 'ssh-config' ? 'SSH' : 'AZU'}
              </span>
              <span style={{ flex: '1', 'white-space': 'nowrap', overflow: 'hidden', 'text-overflow': 'ellipsis' }}>
                {connectingId() === host.id ? 'Connecting...' : `${host.user}@${host.name}`}
              </span>
              <span style={{ color: props.colors.textMuted, 'font-size': '9px' }}>
                :{host.port}
              </span>
            </button>
          )}
        </For>

        {/* Add new host inline form */}
        <Show
          when={showAddForm()}
          fallback={
            <button
              style={{
                width: '100%',
                padding: '4px 6px',
                background: 'transparent',
                border: `1px dashed ${props.colors.border}`,
                'border-radius': '3px',
                color: props.colors.textMuted,
                'font-size': '10px',
                cursor: 'pointer',
                'margin-top': '4px',
              }}
              onClick={() => setShowAddForm(true)}
            >
              + Add new host
            </button>
          }
        >
          <div style={{ 'margin-top': '6px', 'border-top': `1px solid ${props.colors.border}`, 'padding-top': '6px' }}>
            <input value={newHost()} onInput={(e) => setNewHost((e.target as HTMLInputElement).value)} placeholder="hostname or IP" style={{ ...inputStyle(), 'margin-bottom': '4px' }} />
            <input value={newUser()} onInput={(e) => setNewUser((e.target as HTMLInputElement).value)} placeholder="user" style={{ ...inputStyle(), 'margin-bottom': '4px' }} />
            <div style={{ display: 'flex', gap: '4px', 'margin-bottom': '4px' }}>
              <input value={newPort()} onInput={(e) => setNewPort((e.target as HTMLInputElement).value)} placeholder="port" style={{ ...inputStyle(), width: '60px' }} />
              <input value={newKey()} onInput={(e) => setNewKey((e.target as HTMLInputElement).value)} placeholder="~/.ssh/key (optional)" style={inputStyle()} />
            </div>
            <button
              onClick={async () => {
                const { addHost } = await import('../../stores/ssh')
                await addHost({
                  id: `azu-${Date.now()}`,
                  name: newHost(),
                  host: newHost(),
                  port: parseInt(newPort()) || 22,
                  user: newUser(),
                  identityFile: newKey() || undefined,
                  tags: [],
                })
                setShowAddForm(false)
                setNewHost(''); setNewUser(''); setNewPort('22'); setNewKey('')
              }}
              style={{
                width: '100%',
                background: props.colors.accent,
                color: props.colors.surface,
                border: 'none',
                'border-radius': '3px',
                padding: '3px 0',
                'font-size': '10px',
                cursor: 'pointer',
              }}
            >
              Add & Connect
            </button>
          </div>
        </Show>
      </Show>
    </div>
  )
}

export default SshHostPicker
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Grid/SshHostPicker.tsx
git commit -m "feat(ssh): SshHostPicker component — host list + add form + password prompt"
```

---

## Task 12: GridCell SSH Integration

**Files:**
- Modify: `src/components/Grid/GridCell.tsx`

- [ ] **Step 1: Add SSH button and connection state**

Add imports at top of GridCell.tsx:

```typescript
import { connections } from '../../stores/ssh'
import SshHostPicker from './SshHostPicker'
```

Add state signal after existing signals:

```typescript
const [showSshPicker, setShowSshPicker] = createSignal(false)
```

Add to the `onMouseLeave` handler:

```typescript
setShowSshPicker(false)
```

Add SSH connection status helper:

```typescript
const sshConnection = () => {
  const s = props.node.ssh
  if (!s) return null
  return connections[s.connectionId] || null
}

const sshStatus = () => sshConnection()?.status
```

Add SSH button in the toolbar, after the Launch CLI div and before the pipeline status indicator:

```tsx
{/* SSH connect button */}
<div class="relative">
  <button
    class="w-7 h-6 flex items-center justify-center rounded hover:bg-white/6"
    style={{ color: sshStatus() === 'connected' ? '#3fb950' : sshStatus() === 'reconnecting' ? '#d29922' : toolbarColor(colors()) }}
    onClick={() => setShowSshPicker(!showSshPicker())}
    title={sshConnection() ? `SSH: ${sshConnection()!.user}@${sshConnection()!.host}` : 'SSH connect'}
  >
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2">
      <path d="M1 6h4M8 3l3 3-3 3" />
      <rect x="5" y="2" width="2" height="8" rx="0.5" fill="currentColor" stroke="none" />
    </svg>
  </button>
  <Show when={showSshPicker()}>
    <SshHostPicker
      cellId={props.node.id}
      colors={colors()}
      onClose={() => setShowSshPicker(false)}
      onConnected={(connId) => {
        // Terminal will switch to SSH mode via the grid node update
      }}
    />
  </Show>
</div>
```

If pane has SSH, show `user@host` label instead of cwd. Replace the label fallback content:

```tsx
{props.node.ssh && sshConnection()
  ? `${sshConnection()!.user}@${sshConnection()!.host}`
  : props.node.label || abbreviatedCwd() || 'Terminal'}
```

If pane is SSH, add 2px accent top border. Update `cellStyle()`:

```typescript
const cellStyle = () => {
  const t = cellTheme()
  const base: Record<string, string> = {}
  if (props.node.ssh) {
    base['border-top'] = `2px solid ${colors().accent}`
  }
  if (!t) return base
  return {
    ...base,
    '--azu-surface': bgColor(t.colors.surface),
    // ... rest of existing styles
  }
}
```

- [ ] **Step 2: Pass sshConnectionId to Terminal**

Update the `TerminalComponent` usage inside GridCell:

```tsx
<TerminalComponent
  ptyId={props.ptyId!}
  themeId={props.node.themeId}
  sshConnectionId={props.node.ssh?.connectionId}
/>
```

- [ ] **Step 3: Run frontend tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/components/Grid/GridCell.tsx
git commit -m "feat(ssh): GridCell SSH button, connection badge, remote label, accent border"
```

---

## Task 13: App + StatusBar Integration

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/StatusBar/StatusBar.tsx`

- [ ] **Step 1: Init SSH listeners in App.tsx**

Add import:

```typescript
import { initSshListeners } from './stores/ssh'
```

Add in `onMount` after `initPipelineListeners()`:

```typescript
initSshListeners()
```

- [ ] **Step 2: Add SSH count to StatusBar**

Add import in `StatusBar.tsx`:

```typescript
import { connections } from '../../stores/ssh'
```

Add after the `paneCount` line:

```typescript
const sshCount = () => Object.values(connections).filter(c => c.status === 'connected').length
```

Add in the footer, after the `{gridStore.activePreset || 'No preset'}` span:

```tsx
<Show when={sshCount() > 0}>
  <span style={{ color: 'var(--azu-accent)' }}>
    SSH: {sshCount()}
  </span>
</Show>
```

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

Run: `cd src-tauri && cargo test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/StatusBar/StatusBar.tsx
git commit -m "feat(ssh): init listeners in App + SSH connection count in StatusBar"
```

---

## Task 14: Integration Smoke Test

- [ ] **Step 1: Verify Rust builds clean**

Run: `cd src-tauri && cargo build`
Expected: Builds successfully

- [ ] **Step 2: Verify Tauri dev server starts**

Run: `npm run tauri dev`
Expected: App window opens, no crashes. SSH button visible in pane toolbar.

- [ ] **Step 3: Verify host picker loads**

Click the SSH button (terminal with arrow icon) in any pane toolbar.
Expected: Dropdown appears showing hosts from `~/.ssh/config` if it exists, plus "Add new host" button.

- [ ] **Step 4: Commit final state if any fixes were needed**

```bash
git add -A
git commit -m "fix(ssh): integration fixes from smoke test"
```
