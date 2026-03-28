use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use uuid::Uuid;

pub struct PtyInstance {
    #[allow(dead_code)]
    pub id: String,
    writer: Box<dyn Write + Send>,
    pair: portable_pty::PtyPair,
}

pub struct PtyManager {
    instances: Arc<Mutex<HashMap<String, PtyInstance>>>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            instances: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn spawn(&self, rows: u16, cols: u16, cwd: Option<String>) -> Result<String, String> {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| e.to_string())?;

        let shell = Self::detect_shell();
        let mut cmd = CommandBuilder::new(&shell);
        let working_dir = cwd
            .map(std::path::PathBuf::from)
            .filter(|p| p.is_dir())
            .unwrap_or_else(|| dirs::home_dir().unwrap_or_else(|| ".".into()));
        cmd.cwd(working_dir);

        pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
        let id = Uuid::new_v4().to_string();

        let instance = PtyInstance { id: id.clone(), writer, pair };
        self.instances.lock().unwrap().insert(id.clone(), instance);

        Ok(id)
    }

    pub fn write(&self, id: &str, data: &[u8]) -> Result<(), String> {
        let mut instances = self.instances.lock().unwrap();
        let instance = instances.get_mut(id).ok_or("PTY not found")?;
        instance.writer.write_all(data).map_err(|e| e.to_string())
    }

    pub fn resize(&self, id: &str, rows: u16, cols: u16) -> Result<(), String> {
        let instances = self.instances.lock().unwrap();
        let instance = instances.get(id).ok_or("PTY not found")?;
        instance.pair.master.resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| e.to_string())
    }

    pub fn close(&self, id: &str) -> Result<(), String> {
        let mut instances = self.instances.lock().unwrap();
        instances.remove(id).ok_or("PTY not found".to_string())?;
        Ok(())
    }

    pub fn take_reader(&self, id: &str) -> Result<Box<dyn Read + Send>, String> {
        let instances = self.instances.lock().unwrap();
        let instance = instances.get(id).ok_or("PTY not found")?;
        instance.pair.master.try_clone_reader().map_err(|e| e.to_string())
    }

    fn detect_shell() -> String {
        if cfg!(windows) {
            // Prefer PowerShell (handles cd across drives, modern features)
            // Fall back to COMSPEC (cmd.exe) only if pwsh/powershell not found
            for ps in &["pwsh.exe", "powershell.exe"] {
                if std::process::Command::new(ps).arg("-Version").output().is_ok() {
                    return ps.to_string();
                }
            }
            std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string())
        } else {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_spawn_and_close() {
        let mgr = PtyManager::new();
        let id = mgr.spawn(24, 80, None).expect("should spawn");
        assert!(!id.is_empty());
        mgr.close(&id).expect("should close");
    }

    #[test]
    fn test_write_to_pty() {
        let mgr = PtyManager::new();
        let id = mgr.spawn(24, 80, None).expect("should spawn");
        mgr.write(&id, b"echo hello\n").expect("should write");
        mgr.close(&id).expect("should close");
    }

    #[test]
    fn test_resize_pty() {
        let mgr = PtyManager::new();
        let id = mgr.spawn(24, 80, None).expect("should spawn");
        mgr.resize(&id, 48, 120).expect("should resize");
        mgr.close(&id).expect("should close");
    }

    #[test]
    fn test_close_nonexistent() {
        let mgr = PtyManager::new();
        let result = mgr.close("nonexistent");
        assert!(result.is_err());
    }
}
