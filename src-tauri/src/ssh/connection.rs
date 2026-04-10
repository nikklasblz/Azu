// Azu — SSH Connection Module
// Handles connecting to SSH servers and authenticating.

use std::sync::Arc;
use std::time::Duration;

use russh::client;
use russh::keys::{load_secret_key, PrivateKeyWithHashAlg};
use russh::Disconnect;

use crate::ssh::types::SshHostConfig;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/// russh client handler for Azu SSH sessions.
/// Accepts all server keys unconditionally (first-connect-trust model).
pub struct AzuSshHandler;

impl client::Handler for AzuSshHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh::keys::PublicKey,
    ) -> Result<bool, Self::Error> {
        // Accept all server keys. TODO: implement known_hosts verification.
        Ok(true)
    }
}

// ---------------------------------------------------------------------------
// Authentication helpers
// ---------------------------------------------------------------------------

/// Try to authenticate using a private key file. Returns `true` on success.
async fn try_key_auth(
    handle: &mut client::Handle<AzuSshHandler>,
    user: &str,
    key_path: &std::path::Path,
) -> bool {
    // Try without passphrase first, then silently fail.
    let Ok(key) = load_secret_key(key_path, None) else {
        return false;
    };
    let key = Arc::new(key);
    let Ok(result) = handle
        .authenticate_publickey(user, PrivateKeyWithHashAlg::new(key, None))
        .await
    else {
        return false;
    };
    result.success()
}

/// Authenticate against `host` using the following order:
/// 1. Identity file from `host.identity_file` (if set)
/// 2. Default keys: `~/.ssh/id_ed25519`, `~/.ssh/id_rsa`
/// 3. Password (if `password` is `Some`)
///
/// Returns `Ok(())` on success, `Err(String)` if all methods fail.
pub async fn authenticate(
    handle: &mut client::Handle<AzuSshHandler>,
    host: &SshHostConfig,
    password: Option<&str>,
) -> Result<(), String> {
    let user = host.user.as_str();

    // 1. Identity file from config
    if let Some(key_path) = host.resolved_identity_file() {
        if key_path.exists() && try_key_auth(handle, user, &key_path).await {
            return Ok(());
        }
    }

    // 2. Default keys
    if let Some(home) = dirs::home_dir() {
        for name in &["id_ed25519", "id_rsa"] {
            let key_path = home.join(".ssh").join(name);
            if key_path.exists() && try_key_auth(handle, user, &key_path).await {
                return Ok(());
            }
        }
    }

    // 3. Password
    if let Some(pw) = password {
        let result = handle
            .authenticate_password(user, pw)
            .await
            .map_err(|e| e.to_string())?;
        if result.success() {
            return Ok(());
        }
        return Err("Password authentication failed".to_string());
    }

    Err("All authentication methods failed".to_string())
}

// ---------------------------------------------------------------------------
// connect
// ---------------------------------------------------------------------------

/// Connect to an SSH server described by `host` and authenticate.
/// Returns the live `client::Handle` ready for opening channels.
pub async fn connect(
    host: &SshHostConfig,
    password: Option<&str>,
) -> Result<client::Handle<AzuSshHandler>, String> {
    let config = Arc::new(client::Config {
        keepalive_interval: Some(Duration::from_secs(30)),
        keepalive_max: 3,
        ..Default::default()
    });

    let addr = format!("{}:{}", host.host, host.port);
    let mut handle = client::connect(config, addr.as_str(), AzuSshHandler)
        .await
        .map_err(|e| format!("SSH connect failed: {e}"))?;

    authenticate(&mut handle, host, password).await?;

    Ok(handle)
}

/// Gracefully disconnect a handle.
pub async fn disconnect(handle: client::Handle<AzuSshHandler>) {
    let _ = handle
        .disconnect(Disconnect::ByApplication, "Azu session closed", "en")
        .await;
}
