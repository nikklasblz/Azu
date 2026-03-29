use crate::clipboard::RichClipboard;
use base64::Engine;
use std::io::Write;

#[tauri::command]
pub fn read_clipboard_text() -> Result<String, String> {
    RichClipboard::read_text()
}

#[tauri::command]
pub fn write_clipboard_text(text: String) -> Result<(), String> {
    RichClipboard::write_text(&text)
}

#[tauri::command]
pub fn read_clipboard_image() -> Result<Option<String>, String> {
    RichClipboard::read_image_as_base64()
}

#[tauri::command]
pub fn write_clipboard_image(base64_png: String) -> Result<(), String> {
    RichClipboard::write_image_from_base64(&base64_png)
}

/// Save clipboard image to a temp file, return the file path
#[tauri::command]
pub fn save_clipboard_image_to_file() -> Result<Option<String>, String> {
    let base64 = RichClipboard::read_image_as_base64()?;
    let Some(data) = base64 else { return Ok(None) };
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&data)
        .map_err(|e| e.to_string())?;
    let tmp = std::env::temp_dir().join(format!("azu-paste-{}.png", uuid::Uuid::new_v4()));
    let mut f = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;
    f.write_all(&bytes).map_err(|e| e.to_string())?;
    Ok(Some(tmp.to_string_lossy().to_string()))
}
