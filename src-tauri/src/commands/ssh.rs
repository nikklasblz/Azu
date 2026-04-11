// Azu — SSH Tauri Commands
// Async commands exposing SSH host management, session control, and SFTP operations.

use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::ssh::forwarding::{ForwardConfig, ForwardStatus};
use crate::ssh::manager::SshManager;
use crate::ssh::sftp::{self, FileEntry};
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

// ---------------------------------------------------------------------------
// SFTP commands
// ---------------------------------------------------------------------------

/// List a remote directory, returning sorted file entries.
#[tauri::command]
pub async fn sftp_list_dir(
    connection_id: String,
    path: String,
    manager: State<'_, SshManager>,
) -> Result<Vec<FileEntry>, String> {
    let sftp = manager.open_sftp(&connection_id).await?;
    sftp::list_dir(&sftp, &path).await
}

/// Download a remote file to a local path.
/// Returns the transfer_id used for `sftp-progress-{transfer_id}` events.
#[tauri::command]
pub async fn sftp_download(
    connection_id: String,
    remote_path: String,
    local_path: String,
    app: AppHandle,
    manager: State<'_, SshManager>,
) -> Result<String, String> {
    let sftp = manager.open_sftp(&connection_id).await?;
    let transfer_id = Uuid::new_v4().to_string();
    sftp::download(&sftp, &remote_path, &local_path, &app, &transfer_id).await?;
    Ok(transfer_id)
}

/// Upload a local file to a remote path.
/// Returns the transfer_id used for `sftp-progress-{transfer_id}` events.
#[tauri::command]
pub async fn sftp_upload(
    connection_id: String,
    local_path: String,
    remote_path: String,
    app: AppHandle,
    manager: State<'_, SshManager>,
) -> Result<String, String> {
    let sftp = manager.open_sftp(&connection_id).await?;
    let transfer_id = Uuid::new_v4().to_string();
    sftp::upload(&sftp, &local_path, &remote_path, &app, &transfer_id).await?;
    Ok(transfer_id)
}

/// Create a remote directory.
#[tauri::command]
pub async fn sftp_mkdir(
    connection_id: String,
    path: String,
    manager: State<'_, SshManager>,
) -> Result<(), String> {
    let sftp = manager.open_sftp(&connection_id).await?;
    sftp::mkdir(&sftp, &path).await
}

/// Remove a remote file or directory.
#[tauri::command]
pub async fn sftp_remove(
    connection_id: String,
    path: String,
    manager: State<'_, SshManager>,
) -> Result<(), String> {
    let sftp = manager.open_sftp(&connection_id).await?;
    sftp::remove(&sftp, &path).await
}

/// Rename or move a remote file or directory.
#[tauri::command]
pub async fn sftp_rename(
    connection_id: String,
    old_path: String,
    new_path: String,
    manager: State<'_, SshManager>,
) -> Result<(), String> {
    let sftp = manager.open_sftp(&connection_id).await?;
    sftp::rename(&sftp, &old_path, &new_path).await
}

// ---------------------------------------------------------------------------
// Port forwarding commands
// ---------------------------------------------------------------------------

/// Start a port-forward rule on an active SSH connection.
///
/// `config.forward_type` must be `"local"` or `"remote"`.
#[tauri::command]
pub async fn ssh_add_forward(
    connection_id: String,
    config: ForwardConfig,
    manager: State<'_, SshManager>,
) -> Result<(), String> {
    manager.add_forward(&connection_id, config).await
}

/// Stop and remove a port-forward rule by its `forward_id`.
#[tauri::command]
pub async fn ssh_remove_forward(
    connection_id: String,
    forward_id: String,
    manager: State<'_, SshManager>,
) -> Result<(), String> {
    manager.remove_forward(&connection_id, &forward_id).await
}

/// List all registered port-forward rules with their current status.
#[tauri::command]
pub async fn ssh_list_forwards(
    manager: State<'_, SshManager>,
) -> Result<Vec<ForwardStatus>, String> {
    Ok(manager.list_forwards().await)
}

// ---------------------------------------------------------------------------
// AWS cloud discovery
// ---------------------------------------------------------------------------

/// Discover running AWS Lightsail instances using ambient AWS credentials.
#[tauri::command]
pub async fn aws_lightsail_discover() -> Result<Vec<SshHostConfig>, String> {
    crate::ssh::cloud_aws::discover_lightsail_instances().await
}
