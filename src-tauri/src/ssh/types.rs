use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Configuration for a single SSH host entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshHostConfig {
    /// Unique identifier (e.g. "ssh-config-myserver" or a UUID for azu-managed hosts).
    pub id: String,
    /// Human-readable display name.
    pub name: String,
    /// Hostname or IP to connect to.
    pub host: String,
    /// SSH port (default 22).
    pub port: u16,
    /// Login username.
    pub user: String,
    /// Path to identity file (private key), may contain `~`.
    pub identity_file: Option<String>,
    /// Optional tags for grouping/filtering.
    pub tags: Option<Vec<String>>,
    /// Source of this entry: "ssh-config" | "azu".
    pub source: String,
}

impl SshHostConfig {
    /// Returns the identity file path with `~` expanded to the user's home directory.
    /// Returns `None` if `identity_file` is `None`.
    pub fn resolved_identity_file(&self) -> Option<PathBuf> {
        self.identity_file.as_deref().map(|path| {
            if let Some(rest) = path.strip_prefix("~/") {
                if let Some(home) = dirs::home_dir() {
                    return home.join(rest);
                }
            } else if path == "~" {
                if let Some(home) = dirs::home_dir() {
                    return home;
                }
            }
            PathBuf::from(path)
        })
    }
}

/// Live connection information for an active SSH session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshConnectionInfo {
    /// Unique connection identifier.
    pub id: String,
    /// The host config id this connection belongs to.
    pub host_id: String,
    /// Connection status: "connecting" | "connected" | "disconnected" | "error".
    pub status: String,
    /// Hostname being connected to.
    pub host: String,
    /// Login username.
    pub user: String,
    /// Unix timestamp (seconds) of when the connection was established, if connected.
    pub connected_at: Option<u64>,
}

/// Authentication request payload sent from the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshAuthRequest {
    /// The host config id to authenticate against.
    pub host_id: String,
    /// Password for password-based auth; `None` if using key-based auth.
    pub password: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_host() -> SshHostConfig {
        SshHostConfig {
            id: "ssh-config-myserver".to_string(),
            name: "My Server".to_string(),
            host: "192.168.1.10".to_string(),
            port: 22,
            user: "admin".to_string(),
            identity_file: Some("~/.ssh/id_rsa".to_string()),
            tags: Some(vec!["production".to_string()]),
            source: "ssh-config".to_string(),
        }
    }

    #[test]
    fn test_ssh_host_config_serde_roundtrip() {
        let original = sample_host();
        let json = serde_json::to_string(&original).expect("serialize");
        let decoded: SshHostConfig = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(decoded.id, original.id);
        assert_eq!(decoded.name, original.name);
        assert_eq!(decoded.host, original.host);
        assert_eq!(decoded.port, original.port);
        assert_eq!(decoded.user, original.user);
        assert_eq!(decoded.identity_file, original.identity_file);
        assert_eq!(decoded.tags, original.tags);
        assert_eq!(decoded.source, original.source);
    }

    #[test]
    fn test_ssh_connection_info_serde_roundtrip() {
        let original = SshConnectionInfo {
            id: "conn-001".to_string(),
            host_id: "ssh-config-myserver".to_string(),
            status: "connected".to_string(),
            host: "192.168.1.10".to_string(),
            user: "admin".to_string(),
            connected_at: Some(1_700_000_000),
        };
        let json = serde_json::to_string(&original).expect("serialize");
        let decoded: SshConnectionInfo = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(decoded.id, original.id);
        assert_eq!(decoded.host_id, original.host_id);
        assert_eq!(decoded.status, original.status);
        assert_eq!(decoded.connected_at, original.connected_at);
    }

    #[test]
    fn test_ssh_auth_request_serde_roundtrip() {
        let original = SshAuthRequest {
            host_id: "ssh-config-myserver".to_string(),
            password: Some("s3cr3t".to_string()),
        };
        let json = serde_json::to_string(&original).expect("serialize");
        let decoded: SshAuthRequest = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(decoded.host_id, original.host_id);
        assert_eq!(decoded.password, original.password);
    }

    #[test]
    fn test_resolved_identity_file_tilde_expansion() {
        let host = sample_host(); // identity_file = "~/.ssh/id_rsa"
        let resolved = host.resolved_identity_file().expect("should resolve");
        let home = dirs::home_dir().expect("home dir must exist");
        assert_eq!(resolved, home.join(".ssh/id_rsa"));
        // Must not literally contain "~"
        assert!(!resolved.to_string_lossy().contains('~'));
    }

    #[test]
    fn test_resolved_identity_file_absolute_path() {
        let mut host = sample_host();
        host.identity_file = Some("/etc/ssh/my_key".to_string());
        let resolved = host.resolved_identity_file().expect("should resolve");
        assert_eq!(resolved, std::path::PathBuf::from("/etc/ssh/my_key"));
    }

    #[test]
    fn test_resolved_identity_file_none() {
        let mut host = sample_host();
        host.identity_file = None;
        assert!(host.resolved_identity_file().is_none());
    }
}
