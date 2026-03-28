use crate::clipboard::RichClipboard;

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
