use serde::Serialize;
use std::process::Command;

#[derive(Debug, Serialize)]
pub struct ToolStatus {
    pub name: String,
    pub installed: bool,
    pub version: Option<String>,
}

fn check_tool(name: &str, cmd: &str, args: &[&str]) -> ToolStatus {
    match Command::new(cmd).args(args).output() {
        Ok(output) => {
            let ver = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let ver = if ver.is_empty() {
                String::from_utf8_lossy(&output.stderr).trim().lines().next().unwrap_or("").to_string()
            } else {
                ver.lines().next().unwrap_or("").to_string()
            };
            ToolStatus {
                name: name.into(),
                installed: output.status.success(),
                version: if ver.is_empty() { None } else { Some(ver) },
            }
        }
        Err(_) => ToolStatus { name: name.into(), installed: false, version: None },
    }
}

#[tauri::command]
pub fn detect_environment() -> Vec<ToolStatus> {
    vec![
        check_tool("Python", "python", &["--version"]),
        check_tool("Node.js", "node", &["--version"]),
        check_tool("Claude Code", "claude", &["--version"]),
        check_tool("Codex", "codex", &["--version"]),
        check_tool("Git", "git", &["--version"]),
        check_tool("PowerShell", "pwsh", &["--version"]),
        check_tool("pip", "pip", &["--version"]),
        check_tool("npm", "npm", &["--version"]),
        check_tool("uv", "uv", &["--version"]),
        check_tool("cargo", "cargo", &["--version"]),
    ]
}
