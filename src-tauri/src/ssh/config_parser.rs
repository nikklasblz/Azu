use std::fs;
use std::path::{Path, PathBuf};

use crate::ssh::types::SshHostConfig;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Parse an OpenSSH-style config file from disk.
/// Returns an empty vec on I/O error (missing file, etc.).
pub fn parse_ssh_config(path: &Path) -> Vec<SshHostConfig> {
    match fs::read_to_string(path) {
        Ok(content) => parse_ssh_config_str(&content),
        Err(_) => vec![],
    }
}

/// Parse an OpenSSH-style config string.
///
/// Supported keywords: `Host`, `HostName`, `User`, `Port`, `IdentityFile`.
/// Wildcard hosts (`*`, `?`) are skipped.
/// Both whitespace-separated (`Key Value`) and `=`-separated (`Key=Value`) syntax are accepted.
pub fn parse_ssh_config_str(content: &str) -> Vec<SshHostConfig> {
    let mut hosts: Vec<SshHostConfig> = Vec::new();

    // State for the current block
    let mut current_host: Option<String> = None;
    let mut hostname: Option<String> = None;
    let mut user: Option<String> = None;
    let mut port: Option<u16> = None;
    let mut identity_file: Option<String> = None;

    let flush = |hosts: &mut Vec<SshHostConfig>,
                 current_host: &mut Option<String>,
                 hostname: &mut Option<String>,
                 user: &mut Option<String>,
                 port: &mut Option<u16>,
                 identity_file: &mut Option<String>| {
        if let Some(host_name) = current_host.take() {
            let effective_hostname = hostname.take().unwrap_or_else(|| host_name.clone());
            hosts.push(SshHostConfig {
                id: format!("ssh-config-{}", host_name),
                name: host_name.clone(),
                host: effective_hostname,
                port: port.take().unwrap_or(22),
                user: user.take().unwrap_or_else(|| "root".to_string()),
                identity_file: identity_file.take(),
                tags: None,
                source: "ssh-config".to_string(),
            });
        } else {
            // No current host yet — just clear accumulated state (pre-Host globals)
            hostname.take();
            user.take();
            port.take();
            identity_file.take();
        }
    };

    for line in content.lines() {
        let line = line.trim();

        // Skip blank lines and comments
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        // Split on first `=` or first whitespace run
        let (key, value) = if let Some(eq_pos) = line.find('=') {
            let k = line[..eq_pos].trim();
            let v = line[eq_pos + 1..].trim();
            (k, v)
        } else {
            let mut parts = line.splitn(2, char::is_whitespace);
            let k = parts.next().unwrap_or("").trim();
            let v = parts.next().unwrap_or("").trim();
            (k, v)
        };

        if key.is_empty() || value.is_empty() {
            continue;
        }

        match key.to_lowercase().as_str() {
            "host" => {
                // Flush the previous block before starting a new one
                flush(
                    &mut hosts,
                    &mut current_host,
                    &mut hostname,
                    &mut user,
                    &mut port,
                    &mut identity_file,
                );

                // Skip wildcard patterns
                if value.contains('*') || value.contains('?') {
                    current_host = None;
                } else {
                    current_host = Some(value.to_string());
                }
            }
            "hostname" => {
                if current_host.is_some() {
                    hostname = Some(value.to_string());
                }
            }
            "user" => {
                if current_host.is_some() {
                    user = Some(value.to_string());
                }
            }
            "port" => {
                if current_host.is_some() {
                    if let Ok(p) = value.parse::<u16>() {
                        port = Some(p);
                    }
                }
            }
            "identityfile" => {
                if current_host.is_some() {
                    identity_file = Some(value.to_string());
                }
            }
            _ => {}
        }
    }

    // Flush the last block
    flush(
        &mut hosts,
        &mut current_host,
        &mut hostname,
        &mut user,
        &mut port,
        &mut identity_file,
    );

    hosts
}

/// Default path to the user's OpenSSH config file: `~/.ssh/config`.
pub fn default_ssh_config_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".ssh")
        .join("config")
}

/// Default path to the Azu SSH hosts JSON file: `~/.azu/ssh-hosts.json`.
pub fn default_azu_hosts_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".azu")
        .join("ssh-hosts.json")
}

/// Load Azu-managed SSH hosts from a JSON file.
/// Returns an empty vec on any error (missing file, parse error, etc.).
pub fn load_azu_hosts(path: &Path) -> Vec<SshHostConfig> {
    match fs::read_to_string(path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => vec![],
    }
}

/// Persist Azu-managed SSH hosts to a JSON file (pretty-printed).
/// Creates parent directories if they don't exist.
pub fn save_azu_hosts(path: &Path, hosts: &[SshHostConfig]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create dirs: {e}"))?;
    }
    let json = serde_json::to_string_pretty(hosts).map_err(|e| format!("serialize: {e}"))?;
    fs::write(path, json).map_err(|e| format!("write: {e}"))
}

/// Merge SSH-config hosts with Azu-managed hosts.
///
/// Azu hosts take precedence: any host whose `id` matches an existing ssh-config host
/// will replace that entry. Azu hosts with new ids are appended at the end.
pub fn merge_hosts(
    ssh_config_hosts: Vec<SshHostConfig>,
    azu_hosts: Vec<SshHostConfig>,
) -> Vec<SshHostConfig> {
    let mut result: Vec<SshHostConfig> = ssh_config_hosts;

    for azu_host in azu_hosts {
        if let Some(existing) = result.iter_mut().find(|h| h.id == azu_host.id) {
            *existing = azu_host;
        } else {
            result.push(azu_host);
        }
    }

    result
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    // -----------------------------------------------------------------------
    // test_parse_basic_ssh_config
    // -----------------------------------------------------------------------
    #[test]
    fn test_parse_basic_ssh_config() {
        let config = r#"
Host myserver
    HostName 192.168.1.10
    User admin
    Port 2222
    IdentityFile ~/.ssh/id_rsa

Host devbox
    HostName dev.example.com
    User ubuntu
    Port 22
    IdentityFile ~/.ssh/dev_key
"#;
        let hosts = parse_ssh_config_str(config);
        assert_eq!(hosts.len(), 2);

        let h0 = &hosts[0];
        assert_eq!(h0.id, "ssh-config-myserver");
        assert_eq!(h0.name, "myserver");
        assert_eq!(h0.host, "192.168.1.10");
        assert_eq!(h0.user, "admin");
        assert_eq!(h0.port, 2222);
        assert_eq!(h0.identity_file.as_deref(), Some("~/.ssh/id_rsa"));
        assert_eq!(h0.source, "ssh-config");

        let h1 = &hosts[1];
        assert_eq!(h1.id, "ssh-config-devbox");
        assert_eq!(h1.host, "dev.example.com");
        assert_eq!(h1.user, "ubuntu");
        assert_eq!(h1.port, 22);
    }

    // -----------------------------------------------------------------------
    // test_parse_skips_wildcards
    // -----------------------------------------------------------------------
    #[test]
    fn test_parse_skips_wildcards() {
        let config = r#"
Host *
    ServerAliveInterval 60

Host myserver
    HostName 10.0.0.1
    User root
"#;
        let hosts = parse_ssh_config_str(config);
        assert_eq!(hosts.len(), 1);
        assert_eq!(hosts[0].name, "myserver");
    }

    // -----------------------------------------------------------------------
    // test_parse_empty_config
    // -----------------------------------------------------------------------
    #[test]
    fn test_parse_empty_config() {
        let hosts = parse_ssh_config_str("");
        assert!(hosts.is_empty());
    }

    // -----------------------------------------------------------------------
    // test_parse_comments_ignored
    // -----------------------------------------------------------------------
    #[test]
    fn test_parse_comments_ignored() {
        let config = r#"
# This is a comment
Host myserver
    # another comment
    HostName 10.0.0.1
    User alice
"#;
        let hosts = parse_ssh_config_str(config);
        assert_eq!(hosts.len(), 1);
        assert_eq!(hosts[0].user, "alice");
    }

    // -----------------------------------------------------------------------
    // test_parse_hostname_defaults_to_host
    // -----------------------------------------------------------------------
    #[test]
    fn test_parse_hostname_defaults_to_host() {
        let config = r#"
Host myalias
    User bob
"#;
        let hosts = parse_ssh_config_str(config);
        assert_eq!(hosts.len(), 1);
        // host field should default to the Host keyword value
        assert_eq!(hosts[0].host, "myalias");
        assert_eq!(hosts[0].name, "myalias");
    }

    // -----------------------------------------------------------------------
    // test_parse_equals_syntax
    // -----------------------------------------------------------------------
    #[test]
    fn test_parse_equals_syntax() {
        let config = r#"
Host=eqserver
HostName=eq.example.com
User=deploy
Port=4242
"#;
        let hosts = parse_ssh_config_str(config);
        assert_eq!(hosts.len(), 1);
        assert_eq!(hosts[0].host, "eq.example.com");
        assert_eq!(hosts[0].user, "deploy");
        assert_eq!(hosts[0].port, 4242);
    }

    // -----------------------------------------------------------------------
    // test_merge_hosts_no_overlap
    // -----------------------------------------------------------------------
    #[test]
    fn test_merge_hosts_no_overlap() {
        let ssh_hosts = vec![SshHostConfig {
            id: "ssh-config-server1".to_string(),
            name: "server1".to_string(),
            host: "1.1.1.1".to_string(),
            port: 22,
            user: "root".to_string(),
            identity_file: None,
            tags: None,
            source: "ssh-config".to_string(),
        }];
        let azu_hosts = vec![SshHostConfig {
            id: "azu-server2".to_string(),
            name: "server2".to_string(),
            host: "2.2.2.2".to_string(),
            port: 22,
            user: "admin".to_string(),
            identity_file: None,
            tags: None,
            source: "azu".to_string(),
        }];

        let merged = merge_hosts(ssh_hosts, azu_hosts);
        assert_eq!(merged.len(), 2);
        assert!(merged.iter().any(|h| h.id == "ssh-config-server1"));
        assert!(merged.iter().any(|h| h.id == "azu-server2"));
    }

    // -----------------------------------------------------------------------
    // test_merge_hosts_azu_overrides
    // -----------------------------------------------------------------------
    #[test]
    fn test_merge_hosts_azu_overrides() {
        let ssh_hosts = vec![SshHostConfig {
            id: "ssh-config-server1".to_string(),
            name: "server1".to_string(),
            host: "1.1.1.1".to_string(),
            port: 22,
            user: "root".to_string(),
            identity_file: None,
            tags: None,
            source: "ssh-config".to_string(),
        }];
        let azu_hosts = vec![SshHostConfig {
            id: "ssh-config-server1".to_string(), // same id — should override
            name: "server1-overridden".to_string(),
            host: "9.9.9.9".to_string(),
            port: 2222,
            user: "newuser".to_string(),
            identity_file: Some("~/.ssh/new_key".to_string()),
            tags: Some(vec!["overridden".to_string()]),
            source: "azu".to_string(),
        }];

        let merged = merge_hosts(ssh_hosts, azu_hosts);
        assert_eq!(merged.len(), 1);
        let h = &merged[0];
        assert_eq!(h.host, "9.9.9.9");
        assert_eq!(h.port, 2222);
        assert_eq!(h.user, "newuser");
        assert_eq!(h.source, "azu");
    }

    // -----------------------------------------------------------------------
    // test_save_and_load_azu_hosts
    // -----------------------------------------------------------------------
    #[test]
    fn test_save_and_load_azu_hosts() {
        let dir = std::env::temp_dir().join("azu_test_ssh_hosts");
        let path = dir.join("ssh-hosts.json");

        // Clean up from any previous run
        let _ = fs::remove_dir_all(&dir);

        let hosts = vec![
            SshHostConfig {
                id: "azu-alpha".to_string(),
                name: "Alpha Server".to_string(),
                host: "alpha.example.com".to_string(),
                port: 22,
                user: "alice".to_string(),
                identity_file: Some("~/.ssh/alpha_key".to_string()),
                tags: Some(vec!["staging".to_string()]),
                source: "azu".to_string(),
            },
            SshHostConfig {
                id: "azu-beta".to_string(),
                name: "Beta Server".to_string(),
                host: "beta.example.com".to_string(),
                port: 2222,
                user: "bob".to_string(),
                identity_file: None,
                tags: None,
                source: "azu".to_string(),
            },
        ];

        // Save
        save_azu_hosts(&path, &hosts).expect("save should succeed");
        assert!(path.exists(), "JSON file should be created");

        // Load back
        let loaded = load_azu_hosts(&path);
        assert_eq!(loaded.len(), 2);
        assert_eq!(loaded[0].id, "azu-alpha");
        assert_eq!(loaded[0].host, "alpha.example.com");
        assert_eq!(loaded[0].identity_file.as_deref(), Some("~/.ssh/alpha_key"));
        assert_eq!(loaded[1].id, "azu-beta");
        assert_eq!(loaded[1].port, 2222);
        assert!(loaded[1].identity_file.is_none());

        // Cleanup
        let _ = fs::remove_dir_all(&dir);
    }
}
