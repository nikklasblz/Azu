// Azu — SSH Port Forwarding
// Local and remote TCP port forwarding over an established SSH connection.

use std::sync::Arc;

use russh::client;
use serde::{Deserialize, Serialize};
use tokio::net::TcpListener;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

use crate::ssh::connection::AzuSshHandler;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// Configuration for a single port-forward rule.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForwardConfig {
    /// Unique identifier for this forward rule.
    pub id: String,
    /// "local" or "remote".
    pub forward_type: String,
    /// Local bind address (e.g. "127.0.0.1").
    pub local_host: String,
    /// Local port number.
    pub local_port: u16,
    /// Remote destination host.
    pub remote_host: String,
    /// Remote destination port.
    pub remote_port: u16,
}

/// Runtime status of a port-forward rule.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForwardStatus {
    pub config: ForwardConfig,
    pub active: bool,
    pub error: Option<String>,
}

// Type alias for the shared handle used across forwarding tasks.
type SharedHandle = Arc<Mutex<client::Handle<AzuSshHandler>>>;

// ---------------------------------------------------------------------------
// Local forward  (client-side TCP  →  SSH direct-tcpip  →  remote host:port)
// ---------------------------------------------------------------------------

/// Bind a TCP listener on `config.local_host:config.local_port`.
///
/// For every accepted connection a sub-task is spawned that opens a
/// `direct-tcpip` SSH channel and runs a bidirectional copy until either
/// side closes.
///
/// Returns a `CancellationToken`; drop it (or call `.cancel()`) to stop
/// accepting new connections.  Existing sub-tasks run to completion on their
/// own.
pub async fn start_local_forward(
    handle: SharedHandle,
    config: ForwardConfig,
) -> Result<CancellationToken, String> {
    let bind_addr = format!("{}:{}", config.local_host, config.local_port);
    let listener = TcpListener::bind(&bind_addr)
        .await
        .map_err(|e| format!("Local forward bind {bind_addr}: {e}"))?;

    let token = CancellationToken::new();
    let token_clone = token.clone();
    let remote_host = config.remote_host.clone();
    let remote_port = config.remote_port;

    tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = token_clone.cancelled() => break,

                accept_result = listener.accept() => {
                    match accept_result {
                        Err(e) => {
                            eprintln!("[forward] accept error: {e}");
                            break;
                        }
                        Ok((tcp_stream, peer_addr)) => {
                            let h = handle.clone();
                            let rhost = remote_host.clone();
                            let rport = remote_port as u32;
                            let orig_addr = peer_addr.ip().to_string();
                            let orig_port = peer_addr.port() as u32;

                            tokio::spawn(async move {
                                let channel_result = h
                                    .lock()
                                    .await
                                    .channel_open_direct_tcpip(
                                        rhost.clone(),
                                        rport,
                                        orig_addr,
                                        orig_port,
                                    )
                                    .await;

                                match channel_result {
                                    Err(e) => {
                                        eprintln!(
                                            "[forward] direct-tcpip open to {rhost}:{rport} failed: {e}"
                                        );
                                    }
                                    Ok(channel) => {
                                        let mut ssh_stream = channel.into_stream();
                                        let (mut tcp_r, mut tcp_w) =
                                            tokio::io::split(tcp_stream);
                                        let (mut ssh_r, mut ssh_w) =
                                            tokio::io::split(&mut ssh_stream);

                                        let r2s = tokio::io::copy(&mut tcp_r, &mut ssh_w);
                                        let s2r = tokio::io::copy(&mut ssh_r, &mut tcp_w);

                                        if let Err(e) = tokio::try_join!(r2s, s2r) {
                                            eprintln!("[forward] copy error: {e}");
                                        }
                                    }
                                }
                            });
                        }
                    }
                }
            }
        }
    });

    Ok(token)
}

// ---------------------------------------------------------------------------
// Remote forward  (server-side TCP  →  SSH tcpip-forward  →  local)
// ---------------------------------------------------------------------------

/// Ask the SSH server to start listening on `config.remote_host:config.remote_port`
/// and forward incoming connections back to us.
///
/// Returns `Ok(())` on success.  The actual data handling for remote-forwarded
/// connections is driven by the session handler (`AzuSshHandler`), which must
/// implement `tcpip_forward` / `forwarded_tcpip` callbacks to accept the
/// incoming channels.  This function only sends the `tcpip-forward` request.
pub async fn start_remote_forward(
    handle: SharedHandle,
    config: &ForwardConfig,
) -> Result<(), String> {
    handle
        .lock()
        .await
        .tcpip_forward(config.remote_host.clone(), config.remote_port as u32)
        .await
        .map(|_actual_port| ())
        .map_err(|e| format!("tcpip_forward {}:{} — {e}", config.remote_host, config.remote_port))
}

/// Ask the SSH server to stop the remote listener on
/// `config.remote_host:config.remote_port`.
pub async fn stop_remote_forward(
    handle: SharedHandle,
    config: &ForwardConfig,
) -> Result<(), String> {
    handle
        .lock()
        .await
        .cancel_tcpip_forward(config.remote_host.clone(), config.remote_port as u32)
        .await
        .map_err(|e| {
            format!(
                "cancel_tcpip_forward {}:{} — {e}",
                config.remote_host, config.remote_port
            )
        })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn make_config(forward_type: &str) -> ForwardConfig {
        ForwardConfig {
            id: "fwd-test-1".to_string(),
            forward_type: forward_type.to_string(),
            local_host: "127.0.0.1".to_string(),
            local_port: 19876,
            remote_host: "example.com".to_string(),
            remote_port: 80,
        }
    }

    #[test]
    fn test_forward_config_serde_roundtrip() {
        let cfg = make_config("local");
        let json = serde_json::to_string(&cfg).expect("serialize");
        let decoded: ForwardConfig = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(decoded.id, cfg.id);
        assert_eq!(decoded.forward_type, "local");
        assert_eq!(decoded.local_host, "127.0.0.1");
        assert_eq!(decoded.local_port, 19876);
        assert_eq!(decoded.remote_host, "example.com");
        assert_eq!(decoded.remote_port, 80);
    }

    #[test]
    fn test_forward_status_serde_roundtrip() {
        let status = ForwardStatus {
            config: make_config("remote"),
            active: true,
            error: None,
        };
        let json = serde_json::to_string(&status).expect("serialize");
        let decoded: ForwardStatus = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(decoded.config.id, "fwd-test-1");
        assert_eq!(decoded.config.forward_type, "remote");
        assert!(decoded.active);
        assert!(decoded.error.is_none());
    }

    #[test]
    fn test_forward_status_with_error_serde() {
        let status = ForwardStatus {
            config: make_config("local"),
            active: false,
            error: Some("bind failed".to_string()),
        };
        let json = serde_json::to_string(&status).expect("serialize");
        let decoded: ForwardStatus = serde_json::from_str(&json).expect("deserialize");
        assert!(!decoded.active);
        assert_eq!(decoded.error.as_deref(), Some("bind failed"));
    }

    #[tokio::test]
    async fn test_cancellation_token_cancels() {
        let token = CancellationToken::new();
        assert!(!token.is_cancelled());
        token.cancel();
        assert!(token.is_cancelled());
        // child inherits cancellation
        let child = token.child_token();
        assert!(child.is_cancelled());
    }
}
