// Azu — SSH Manager
// Manages SSH connections, authentication, and data flow.

use std::collections::HashMap;
use std::sync::Arc;

use russh::client::{self, Msg};
use russh::{ChannelWriteHalf, Disconnect};
use russh_sftp::client::SftpSession;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use crate::ssh::config_parser::{
    default_azu_hosts_path, default_ssh_config_path, load_azu_hosts, merge_hosts,
    parse_ssh_config, save_azu_hosts,
};
use crate::ssh::connection::AzuSshHandler;
use crate::ssh::forwarding::{
    start_local_forward, start_remote_forward, stop_remote_forward, ForwardConfig, ForwardStatus,
};
use crate::ssh::types::{SshConnectionInfo, SshHostConfig};
use crate::ssh::{connection, session};

// ---------------------------------------------------------------------------
// ActiveConnection
// ---------------------------------------------------------------------------

/// A live SSH connection stored in the registry.
pub struct ActiveConnection {
    /// Connection metadata (serialisable, sent to frontend).
    pub info: SshConnectionInfo,
    /// The russh client handle wrapped in Arc<Mutex> so forwarding tasks can
    /// share it without cloning (Handle<H> is not Clone).
    pub handle: Arc<Mutex<client::Handle<AzuSshHandler>>>,
    /// Write half of the shell channel — used for data and window-change.
    pub write_half: ChannelWriteHalf<Msg>,
}

// ---------------------------------------------------------------------------
// SshManager
// ---------------------------------------------------------------------------

/// Tauri-managed state object for all SSH connections.
pub struct SshManager {
    connections: Arc<Mutex<HashMap<String, ActiveConnection>>>,
    hosts: Arc<Mutex<Vec<SshHostConfig>>>,
    sftp_sessions: Arc<Mutex<HashMap<String, Arc<SftpSession>>>>,
    /// forward_id → (config, cancellation token)
    forwards: Arc<Mutex<HashMap<String, (ForwardConfig, CancellationToken)>>>,
}

impl SshManager {
    pub fn new() -> Self {
        Self {
            connections: Arc::new(Mutex::new(HashMap::new())),
            hosts: Arc::new(Mutex::new(Vec::new())),
            sftp_sessions: Arc::new(Mutex::new(HashMap::new())),
            forwards: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    // -----------------------------------------------------------------------
    // Host management
    // -----------------------------------------------------------------------

    /// Load hosts from `~/.ssh/config` and `~/.azu/ssh-hosts.json` and cache them.
    pub async fn load_hosts(&self) -> Vec<SshHostConfig> {
        let ssh_hosts = parse_ssh_config(&default_ssh_config_path());
        let azu_hosts = load_azu_hosts(&default_azu_hosts_path());
        let merged = merge_hosts(ssh_hosts, azu_hosts);

        let mut lock = self.hosts.lock().await;
        *lock = merged.clone();
        merged
    }

    /// Add or replace a host in the Azu-managed list and persist it.
    pub async fn add_host(&self, host: SshHostConfig) -> Result<(), String> {
        let azu_path = default_azu_hosts_path();
        let mut azu_hosts = load_azu_hosts(&azu_path);

        // Replace if same id, otherwise append
        if let Some(existing) = azu_hosts.iter_mut().find(|h| h.id == host.id) {
            *existing = host.clone();
        } else {
            azu_hosts.push(host.clone());
        }
        save_azu_hosts(&azu_path, &azu_hosts)?;

        // Refresh the in-memory cache
        let ssh_hosts = parse_ssh_config(&default_ssh_config_path());
        let merged = merge_hosts(ssh_hosts, azu_hosts);
        *self.hosts.lock().await = merged;

        Ok(())
    }

    /// Remove a host by id from the Azu-managed list and persist.
    pub async fn remove_host(&self, host_id: &str) -> Result<(), String> {
        let azu_path = default_azu_hosts_path();
        let mut azu_hosts = load_azu_hosts(&azu_path);
        let before = azu_hosts.len();
        azu_hosts.retain(|h| h.id != host_id);

        if azu_hosts.len() == before {
            return Err(format!("Host '{}' not found in azu hosts", host_id));
        }
        save_azu_hosts(&azu_path, &azu_hosts)?;

        // Refresh cache
        let ssh_hosts = parse_ssh_config(&default_ssh_config_path());
        let merged = merge_hosts(ssh_hosts, azu_hosts);
        *self.hosts.lock().await = merged;

        Ok(())
    }

    /// Return the cached host list (loads from disk if empty).
    pub async fn list_hosts(&self) -> Vec<SshHostConfig> {
        let lock = self.hosts.lock().await;
        if lock.is_empty() {
            drop(lock);
            return self.load_hosts().await;
        }
        lock.clone()
    }

    // -----------------------------------------------------------------------
    // Connection management
    // -----------------------------------------------------------------------

    /// Connect to the host identified by `host_id`, open a shell channel, and
    /// store the connection in the registry.
    ///
    /// Emits `ssh-status` events with the `SshConnectionInfo` payload.
    pub async fn connect(
        &self,
        host_id: &str,
        password: Option<&str>,
        rows: u16,
        cols: u16,
        app: AppHandle,
    ) -> Result<String, String> {
        // Find host config
        let host = {
            let lock = self.hosts.lock().await;
            lock.iter()
                .find(|h| h.id == host_id)
                .cloned()
                .ok_or_else(|| format!("Host '{}' not found", host_id))?
        };

        let conn_id = Uuid::new_v4().to_string();

        // Emit "connecting" status
        let info_connecting = SshConnectionInfo {
            id: conn_id.clone(),
            host_id: host_id.to_string(),
            status: "connecting".to_string(),
            host: host.host.clone(),
            user: host.user.clone(),
            connected_at: None,
        };
        let _ = app.emit("ssh-status", &info_connecting);

        // Establish TCP + SSH handshake + authentication
        let handle = connection::connect(&host, password).await.map_err(|e| {
            let info_err = SshConnectionInfo {
                status: "error".to_string(),
                ..info_connecting.clone()
            };
            let _ = app.emit("ssh-status", &info_err);
            e
        })?;

        // Open interactive shell channel (session::open takes &Handle)
        let shell = session::open(&handle, app.clone(), conn_id.clone(), rows, cols)
            .await
            .map_err(|e| {
                let info_err = SshConnectionInfo {
                    status: "error".to_string(),
                    ..info_connecting.clone()
                };
                let _ = app.emit("ssh-status", &info_err);
                e
            })?;

        let connected_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .ok();

        let info_connected = SshConnectionInfo {
            id: conn_id.clone(),
            host_id: host_id.to_string(),
            status: "connected".to_string(),
            host: host.host.clone(),
            user: host.user.clone(),
            connected_at,
        };
        let _ = app.emit("ssh-status", &info_connected);

        // Wrap handle in Arc<Mutex> so forwarding tasks can share it.
        let handle = Arc::new(Mutex::new(handle));

        // Store in registry
        let active = ActiveConnection {
            info: info_connected,
            handle,
            write_half: shell.write_half,
        };
        self.connections.lock().await.insert(conn_id.clone(), active);

        Ok(conn_id)
    }

    /// Open (or reuse a cached) SFTP session for the given connection id.
    pub async fn open_sftp(&self, conn_id: &str) -> Result<Arc<SftpSession>, String> {
        // Check cache first
        {
            let cache = self.sftp_sessions.lock().await;
            if let Some(session) = cache.get(conn_id) {
                return Ok(session.clone());
            }
        }

        // Open a new SFTP channel.
        // Acquire the connections lock to get the handle Arc, then drop the
        // connections lock before awaiting on the handle to avoid holding two
        // locks simultaneously for long.
        let handle_arc = {
            let conns = self.connections.lock().await;
            let active = conns
                .get(conn_id)
                .ok_or_else(|| format!("Connection '{}' not found", conn_id))?;
            active.handle.clone()
        };

        let channel: russh::Channel<Msg> = handle_arc
            .lock()
            .await
            .channel_open_session()
            .await
            .map_err(|e| format!("SFTP channel: {e}"))?;

        channel
            .request_subsystem(true, "sftp")
            .await
            .map_err(|e| format!("SFTP subsystem: {e}"))?;

        let sftp = SftpSession::new(channel.into_stream())
            .await
            .map_err(|e| format!("SFTP init: {e}"))?;

        let sftp = Arc::new(sftp);

        // Cache the session
        self.sftp_sessions
            .lock()
            .await
            .insert(conn_id.to_string(), sftp.clone());

        Ok(sftp)
    }

    // -----------------------------------------------------------------------
    // Port forwarding
    // -----------------------------------------------------------------------

    /// Start a new port-forward rule for the connection identified by `conn_id`.
    ///
    /// For local forwards the listener is bound immediately and a background
    /// task is spawned.  For remote forwards a `tcpip-forward` request is sent
    /// to the server.  The rule is stored in the registry keyed by
    /// `config.id`.
    pub async fn add_forward(&self, conn_id: &str, config: ForwardConfig) -> Result<(), String> {
        let handle_arc: Arc<Mutex<client::Handle<AzuSshHandler>>> = {
            let conns = self.connections.lock().await;
            let active = conns
                .get(conn_id)
                .ok_or_else(|| format!("Connection '{}' not found", conn_id))?;
            active.handle.clone()
        };

        let token = match config.forward_type.as_str() {
            "local" => start_local_forward(handle_arc, config.clone()).await?,
            "remote" => {
                start_remote_forward(handle_arc, &config).await?;
                // For remote forwards the token is a no-op sentinel; the
                // actual teardown goes through cancel_tcpip_forward.
                CancellationToken::new()
            }
            other => return Err(format!("Unknown forward_type '{other}'")),
        };

        self.forwards
            .lock()
            .await
            .insert(config.id.clone(), (config, token));

        Ok(())
    }

    /// Stop and remove the forward rule identified by `forward_id`.
    pub async fn remove_forward(&self, conn_id: &str, forward_id: &str) -> Result<(), String> {
        let (config, token) = self
            .forwards
            .lock()
            .await
            .remove(forward_id)
            .ok_or_else(|| format!("Forward '{}' not found", forward_id))?;

        // Cancel the listener task (local forward) or any associated token.
        token.cancel();

        // For remote forwards, tell the server to stop listening.
        if config.forward_type == "remote" {
            let handle_arc: Option<Arc<Mutex<client::Handle<AzuSshHandler>>>> = {
                let conns = self.connections.lock().await;
                conns.get(conn_id).map(|a| a.handle.clone())
            };
            if let Some(h) = handle_arc {
                let _ = stop_remote_forward(h, &config).await;
            }
        }

        Ok(())
    }

    /// Return a snapshot of all registered forward rules and their status.
    pub async fn list_forwards(&self) -> Vec<ForwardStatus> {
        self.forwards
            .lock()
            .await
            .values()
            .map(|(cfg, token)| ForwardStatus {
                config: cfg.clone(),
                active: !token.is_cancelled(),
                error: None,
            })
            .collect()
    }

    /// Disconnect a connection by id.
    pub async fn disconnect(&self, conn_id: &str, app: AppHandle) -> Result<(), String> {
        // Cancel all forward rules (currently global; a production version
        // would filter by conn_id).
        {
            let mut fwd_lock = self.forwards.lock().await;
            for (_, (_, token)) in fwd_lock.drain() {
                token.cancel();
            }
        }

        // Clean up any cached SFTP session first
        self.sftp_sessions.lock().await.remove(conn_id);

        let active = self
            .connections
            .lock()
            .await
            .remove(conn_id)
            .ok_or_else(|| format!("Connection '{}' not found", conn_id))?;

        let info_disconnected = SshConnectionInfo {
            status: "disconnected".to_string(),
            ..active.info
        };
        let _ = app.emit("ssh-status", &info_disconnected);

        // Gracefully close the SSH session.
        // unwrap_or_else handles the unlikely case where a forwarding task
        // still holds the Arc — we try, but don't block on it.
        match Arc::try_unwrap(active.handle) {
            Ok(mutex) => {
                let _ = mutex
                    .into_inner()
                    .disconnect(Disconnect::ByApplication, "Azu session closed", "en")
                    .await;
            }
            Err(arc) => {
                // Another task still holds a reference; send disconnect best-effort.
                let _ = arc
                    .lock()
                    .await
                    .disconnect(Disconnect::ByApplication, "Azu session closed", "en")
                    .await;
            }
        }

        Ok(())
    }

    /// Send raw bytes to the shell channel of `conn_id`.
    pub async fn write(&self, conn_id: &str, data: Vec<u8>) -> Result<(), String> {
        let lock = self.connections.lock().await;
        let active = lock
            .get(conn_id)
            .ok_or_else(|| format!("Connection '{}' not found", conn_id))?;

        let result: Result<(), russh::Error> = active
            .write_half
            .data(std::io::Cursor::new(data))
            .await;
        result.map_err(|e| format!("Failed to send data to SSH channel: {e}"))
    }

    /// Notify the remote side of a terminal resize.
    pub async fn resize(&self, conn_id: &str, rows: u16, cols: u16) -> Result<(), String> {
        let lock = self.connections.lock().await;
        let active = lock
            .get(conn_id)
            .ok_or_else(|| format!("Connection '{}' not found", conn_id))?;

        let result: Result<(), russh::Error> = active
            .write_half
            .window_change(cols as u32, rows as u32, 0, 0)
            .await;
        result.map_err(|e| format!("Failed to send window change: {e}"))
    }

    /// List all active connections.
    pub async fn list_connections(&self) -> Vec<SshConnectionInfo> {
        self.connections
            .lock()
            .await
            .values()
            .map(|c| c.info.clone())
            .collect()
    }
}
