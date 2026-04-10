// Azu — SSH Tauri Commands
// Eight async commands exposing SSH host management and session control.

use tauri::{AppHandle, State};

use crate::ssh::manager::SshManager;
use crate::ssh::types::{SshConnectionInfo, SshHostConfig};

// ---------------------------------------------------------------------------
// Host management
// ---------------------------------------------------------------------------

/// Return the merged list of SSH hosts (from ~/.ssh/config + ~/.azu/ssh-hosts.json).
#[tauri::command]
pub async fn ssh_list_hosts(manager: State<'_, SshManager>) -> Result<Vec<SshHostConfig>, String> {
    Ok(manager.list_hosts().await)
}

/// Add or update an Azu-managed SSH host.
#[tauri::command]
pub async fn ssh_add_host(
    host: SshHostConfig,
    manager: State<'_, SshManager>,
) -> Result<(), String> {
    manager.add_host(host).await
}

/// Remove an Azu-managed SSH host by its id.
#[tauri::command]
pub async fn ssh_remove_host(
    host_id: String,
    manager: State<'_, SshManager>,
) -> Result<(), String> {
    manager.remove_host(&host_id).await
}

// ---------------------------------------------------------------------------
// Connection management
// ---------------------------------------------------------------------------

/// Connect to the host identified by `host_id` and open an interactive shell.
/// Returns the new connection id (UUID string).
///
/// The manager emits `ssh-status` events and the session reader emits
/// `ssh-output-{connection_id}` / `ssh-exit-{connection_id}` events.
#[tauri::command]
pub async fn ssh_connect(
    host_id: String,
    password: Option<String>,
    rows: u16,
    cols: u16,
    app: AppHandle,
    manager: State<'_, SshManager>,
) -> Result<String, String> {
    // Ensure hosts are loaded (no-op if already cached)
    manager.load_hosts().await;

    manager
        .connect(&host_id, password.as_deref(), rows, cols, app)
        .await
}

/// Disconnect an active SSH connection by its connection id.
#[tauri::command]
pub async fn ssh_disconnect(
    connection_id: String,
    app: AppHandle,
    manager: State<'_, SshManager>,
) -> Result<(), String> {
    manager.disconnect(&connection_id, app).await
}

/// Send raw bytes to the shell of an active SSH connection.
#[tauri::command]
pub async fn ssh_write(
    connection_id: String,
    data: Vec<u8>,
    manager: State<'_, SshManager>,
) -> Result<(), String> {
    manager.write(&connection_id, data).await
}

/// Notify the remote side of a terminal resize.
#[tauri::command]
pub async fn ssh_resize(
    connection_id: String,
    rows: u16,
    cols: u16,
    manager: State<'_, SshManager>,
) -> Result<(), String> {
    manager.resize(&connection_id, rows, cols).await
}

/// List all currently active SSH connections.
#[tauri::command]
pub async fn ssh_list_connections(
    manager: State<'_, SshManager>,
) -> Result<Vec<SshConnectionInfo>, String> {
    Ok(manager.list_connections().await)
}
