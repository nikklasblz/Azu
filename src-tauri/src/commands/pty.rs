use crate::pty::PtyManager;
use std::io::Read;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub fn create_pty(state: State<'_, PtyManager>, app: AppHandle, rows: u16, cols: u16) -> Result<String, String> {
    let id = state.spawn(rows, cols)?;
    let reader = state.take_reader(&id)?;
    let pty_id = id.clone();

    std::thread::spawn(move || {
        let mut reader = reader;
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app.emit(&format!("pty-output-{}", pty_id), data);
                }
                Err(_) => break,
            }
        }
        let _ = app.emit(&format!("pty-exit-{}", pty_id), ());
    });

    Ok(id)
}

#[tauri::command]
pub fn write_pty(state: State<'_, PtyManager>, id: String, data: String) -> Result<(), String> {
    state.write(&id, data.as_bytes())
}

#[tauri::command]
pub fn resize_pty(state: State<'_, PtyManager>, id: String, rows: u16, cols: u16) -> Result<(), String> {
    state.resize(&id, rows, cols)
}

#[tauri::command]
pub fn close_pty(state: State<'_, PtyManager>, id: String) -> Result<(), String> {
    state.close(&id)
}
