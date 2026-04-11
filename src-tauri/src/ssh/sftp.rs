// Azu — SFTP Operations
// High-level SFTP functions used by Tauri commands.

use std::sync::Arc;

use russh_sftp::client::SftpSession;
use russh_sftp::protocol::OpenFlags;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// A single directory entry returned to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub size: u64,
    pub is_dir: bool,
    pub modified: Option<u64>,
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/// List the contents of a remote directory.
/// Skips `.` and `..`; sorts directories first, then alphabetically.
pub async fn list_dir(sftp: &Arc<SftpSession>, path: &str) -> Result<Vec<FileEntry>, String> {
    let read_dir = sftp
        .read_dir(path)
        .await
        .map_err(|e| format!("read_dir '{path}': {e}"))?;

    let mut entries: Vec<FileEntry> = read_dir
        .map(|entry| {
            let meta = entry.metadata();
            FileEntry {
                name: entry.file_name(),
                size: meta.size.unwrap_or(0),
                is_dir: entry.file_type().is_dir(),
                modified: meta.mtime.map(|t| t as u64),
            }
        })
        .collect();

    // Dirs first, then alphabetical within each group
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

/// Download a remote file to a local path, emitting progress events.
pub async fn download(
    sftp: &Arc<SftpSession>,
    remote_path: &str,
    local_path: &str,
    app: &AppHandle,
    transfer_id: &str,
) -> Result<(), String> {
    let mut remote_file = sftp
        .open(remote_path)
        .await
        .map_err(|e| format!("open remote '{remote_path}': {e}"))?;

    // Get file size for progress reporting
    let meta = sftp
        .metadata(remote_path)
        .await
        .map_err(|e| format!("metadata '{remote_path}': {e}"))?;
    let total = meta.size.unwrap_or(0);

    let mut local_file = tokio::fs::File::create(local_path)
        .await
        .map_err(|e| format!("create local '{local_path}': {e}"))?;

    let event_name = format!("sftp-progress-{transfer_id}");
    let mut bytes_written: u64 = 0;
    let mut buf = vec![0u8; 32 * 1024];

    loop {
        let n = remote_file
            .read(&mut buf)
            .await
            .map_err(|e| format!("read remote: {e}"))?;
        if n == 0 {
            break;
        }

        local_file
            .write_all(&buf[..n])
            .await
            .map_err(|e| format!("write local: {e}"))?;

        bytes_written += n as u64;

        let _ = app.emit(
            &event_name,
            serde_json::json!({ "bytes": bytes_written, "total": total }),
        );
    }

    Ok(())
}

/// Upload a local file to a remote path, emitting progress events.
pub async fn upload(
    sftp: &Arc<SftpSession>,
    local_path: &str,
    remote_path: &str,
    app: &AppHandle,
    transfer_id: &str,
) -> Result<(), String> {
    let mut local_file = tokio::fs::File::open(local_path)
        .await
        .map_err(|e| format!("open local '{local_path}': {e}"))?;

    let meta = local_file
        .metadata()
        .await
        .map_err(|e| format!("metadata local: {e}"))?;
    let total = meta.len();

    let mut remote_file = sftp
        .open_with_flags(
            remote_path,
            OpenFlags::CREATE | OpenFlags::TRUNCATE | OpenFlags::WRITE,
        )
        .await
        .map_err(|e| format!("open remote '{remote_path}': {e}"))?;

    let event_name = format!("sftp-progress-{transfer_id}");
    let mut bytes_written: u64 = 0;
    let mut buf = vec![0u8; 32 * 1024];

    loop {
        let n = local_file
            .read(&mut buf)
            .await
            .map_err(|e| format!("read local: {e}"))?;
        if n == 0 {
            break;
        }

        remote_file
            .write_all(&buf[..n])
            .await
            .map_err(|e| format!("write remote: {e}"))?;

        bytes_written += n as u64;

        let _ = app.emit(
            &event_name,
            serde_json::json!({ "bytes": bytes_written, "total": total }),
        );
    }

    Ok(())
}

/// Create a remote directory.
pub async fn mkdir(sftp: &Arc<SftpSession>, path: &str) -> Result<(), String> {
    sftp.create_dir(path)
        .await
        .map_err(|e| format!("create_dir '{path}': {e}"))
}

/// Remove a remote file or directory.
/// Tries `remove_file` first; falls back to `remove_dir`.
pub async fn remove(sftp: &Arc<SftpSession>, path: &str) -> Result<(), String> {
    match sftp.remove_file(path).await {
        Ok(()) => Ok(()),
        Err(_) => sftp
            .remove_dir(path)
            .await
            .map_err(|e| format!("remove '{path}': {e}")),
    }
}

/// Rename / move a remote file or directory.
pub async fn rename(sftp: &Arc<SftpSession>, old: &str, new: &str) -> Result<(), String> {
    sftp.rename(old, new)
        .await
        .map_err(|e| format!("rename '{old}' -> '{new}': {e}"))
}
