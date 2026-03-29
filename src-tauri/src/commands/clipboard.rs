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

/// Save clipboard image to a temp file, return the file path.
/// Cleans up previous azu-paste-*.png files first (only 1 exists at a time).
#[tauri::command]
pub fn save_clipboard_image_to_file() -> Result<Option<String>, String> {
    let base64 = RichClipboard::read_image_as_base64()?;
    let Some(data) = base64 else { return Ok(None) };

    // Clean up previous paste files
    let tmp_dir = std::env::temp_dir();
    if let Ok(entries) = std::fs::read_dir(&tmp_dir) {
        for entry in entries.flatten() {
            if let Some(name) = entry.file_name().to_str() {
                if name.starts_with("azu-paste-") && name.ends_with(".png") {
                    let _ = std::fs::remove_file(entry.path());
                }
            }
        }
    }

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&data)
        .map_err(|e| e.to_string())?;
    let tmp = tmp_dir.join(format!("azu-paste-{}.png", uuid::Uuid::new_v4()));
    let mut f = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;
    f.write_all(&bytes).map_err(|e| e.to_string())?;
    Ok(Some(tmp.to_string_lossy().to_string()))
}
