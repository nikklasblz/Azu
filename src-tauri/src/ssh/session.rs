// Azu — SSH Shell Channel (Session) Module
// Opens a PTY-backed interactive shell channel over an SSH connection.

use russh::client::{self, Msg};
use russh::{ChannelMsg, ChannelWriteHalf};
use russh::ChannelId;
use tauri::{AppHandle, Emitter};

use crate::ssh::connection::AzuSshHandler;

// ---------------------------------------------------------------------------
// SshShellChannel
// ---------------------------------------------------------------------------

/// A live shell channel within an SSH connection.
/// The write half is stored here to allow sending data and resize events.
pub struct SshShellChannel {
    /// Azu-level identifier (UUID string) shared with the frontend.
    pub channel_id: String,
    /// The russh `ChannelId` needed to identify the channel.
    pub russh_channel_id: ChannelId,
    /// Write half of the channel — used for data and window-change messages.
    pub write_half: ChannelWriteHalf<Msg>,
}

// ---------------------------------------------------------------------------
// open
// ---------------------------------------------------------------------------

/// Open an interactive PTY shell channel on `handle` and spawn a reader task
/// that forwards channel output to the Tauri frontend via events.
///
/// * `handle`     — live SSH client handle (obtained from `connection::connect`)
/// * `app`        — Tauri `AppHandle` used to emit events
/// * `channel_id` — Azu UUID string that identifies this session on the frontend
/// * `rows`/`cols`— initial terminal dimensions
///
/// Emitted events:
/// - `ssh-output-{channel_id}` — payload: `Vec<u8>` containing raw terminal bytes
/// - `ssh-exit-{channel_id}`   — payload: exit status `u32` (0 if not available)
pub async fn open(
    handle: &client::Handle<AzuSshHandler>,
    app: AppHandle,
    channel_id: String,
    rows: u16,
    cols: u16,
) -> Result<SshShellChannel, String> {
    // Open a session channel
    let channel = handle
        .channel_open_session()
        .await
        .map_err(|e| format!("channel_open_session: {e}"))?;

    let russh_channel_id = channel.id();

    // Request a PTY (before split so we have &Channel)
    channel
        .request_pty(
            true,
            "xterm-256color",
            cols as u32,
            rows as u32,
            0, // pixel width
            0, // pixel height
            &[],
        )
        .await
        .map_err(|e| format!("request_pty: {e}"))?;

    // Request a shell
    channel
        .request_shell(true)
        .await
        .map_err(|e| format!("request_shell: {e}"))?;

    // Split into read and write halves
    let (mut read_half, write_half) = channel.split();

    // Spawn reader task
    let output_event = format!("ssh-output-{}", channel_id);
    let exit_event = format!("ssh-exit-{}", channel_id);

    tokio::spawn(async move {
        loop {
            match read_half.wait().await {
                Some(ChannelMsg::Data { data }) => {
                    let bytes: Vec<u8> = data.to_vec();
                    let _ = app.emit(&output_event, bytes);
                }
                Some(ChannelMsg::ExtendedData { data, .. }) => {
                    // stderr — forward to the same output stream so the user sees it
                    let bytes: Vec<u8> = data.to_vec();
                    let _ = app.emit(&output_event, bytes);
                }
                Some(ChannelMsg::ExitStatus { exit_status }) => {
                    let _ = app.emit(&exit_event, exit_status);
                    break;
                }
                Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => {
                    let _ = app.emit(&exit_event, 0u32);
                    break;
                }
                // Ignore other message types (WindowAdjusted, Success, etc.)
                _ => {}
            }
        }
    });

    Ok(SshShellChannel {
        channel_id,
        russh_channel_id,
        write_half,
    })
}
