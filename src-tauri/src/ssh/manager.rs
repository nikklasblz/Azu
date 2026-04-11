// Azu — SSH Manager
// Manages SSH connections, authentication, and data flow.

use std::collections::HashMap;
use std::sync::Arc;

use russh::client::{self, Msg};
use russh::{ChannelWriteHalf, Disconnect};
use russh_sftp::client::SftpSession;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::ssh::config_parser::{
    default_azu_hosts_path, default_ssh_config_path, load_azu_hosts, merge_hosts,
    parse_ssh_config, save_azu_hosts,
};
use crate::ssh::connection::AzuSshHandler;
use crate::ssh::types::{SshConnectionInfo, SshHostConfig};
use crate::ssh::{connection, session};

// ---------------------------------------------------------------------------
// ActiveConnection
// ---------------------------------------------------------------------------

/// A live SSH connection stored in the registry.
pub struct ActiveConnection {
    /// Connection metadata (serialisable, sent to frontend).
    pub info: SshConnectionInfo,
    /// The russh client handle (drives the SSH state machine).
    pub handle: client::Handle<AzuSshHandler>,
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
}

impl SshManager {
    pub fn new() -> Self {
        Self {
            connections: Arc::new(Mutex::new(HashMap::new())),
            hosts: Arc::new(Mutex::new(Vec::new())),
            sftp_sessions: Arc::new(Mutex::new(HashMap::new())),
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

        // Open interactive shell channel
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

        // Open a new SFTP channel while holding the connections lock.
        // tokio::Mutex supports holding across .await points, so this is safe.
        let channel: russh::Channel<Msg> = {
            let conns = self.connections.lock().await;
            let active = conns
                .get(conn_id)
                .ok_or_else(|| format!("Connection '{}' not found", conn_id))?;
            active
                .handle
                .channel_open_session()
                .await
                .map_err(|e| format!("SFTP channel: {e}"))?
        };

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

    /// Disconnect a connection by id.
    pub async fn disconnect(&self, conn_id: &str, app: AppHandle) -> Result<(), String> {
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

        // Gracefully close the SSH session
        let _ = active
            .handle
            .disconnect(Disconnect::ByApplication, "Azu session closed", "en")
            .await;

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
