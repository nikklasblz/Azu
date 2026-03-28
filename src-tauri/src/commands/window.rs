use tauri::AppHandle;
use tauri::Manager;
use tauri::webview::WebviewWindowBuilder;
use uuid::Uuid;

#[tauri::command]
pub async fn create_window(app: AppHandle, title: Option<String>, always_on_top: Option<bool>) -> Result<String, String> {
    let label = format!("azu-{}", Uuid::new_v4().to_string().split('-').next().unwrap());
    let window_title = title.unwrap_or_else(|| "Azu".to_string());
    let on_top = always_on_top.unwrap_or(false);

    let url = tauri::WebviewUrl::App("index.html".into());

    let builder = WebviewWindowBuilder::new(&app, &label, url)
        .title(&window_title)
        .inner_size(900.0, 600.0)
        .min_inner_size(400.0, 300.0)
        .decorations(false)
        .always_on_top(on_top);

    builder.build().map_err(|e| e.to_string())?;

    Ok(label)
}

#[tauri::command]
pub async fn minimize_window(app: AppHandle, label: Option<String>) -> Result<(), String> {
    let win = match label {
        Some(l) => app.get_webview_window(&l).ok_or("Window not found")?,
        None => app.get_webview_window("main").ok_or("Main window not found")?,
    };
    win.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn maximize_window(app: AppHandle, label: Option<String>) -> Result<(), String> {
    let win = match label {
        Some(l) => app.get_webview_window(&l).ok_or("Window not found")?,
        None => app.get_webview_window("main").ok_or("Main window not found")?,
    };
    if win.is_maximized().unwrap_or(false) {
        win.unmaximize().map_err(|e| e.to_string())
    } else {
        win.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn close_window(app: AppHandle, label: Option<String>) -> Result<(), String> {
    let win = match label {
        Some(l) => app.get_webview_window(&l).ok_or("Window not found")?,
        None => app.get_webview_window("main").ok_or("Main window not found")?,
    };
    win.close().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_always_on_top(app: AppHandle, label: Option<String>, on_top: bool) -> Result<(), String> {
    let win = match label {
        Some(l) => app.get_webview_window(&l).ok_or("Window not found")?,
        None => app.get_webview_window("main").ok_or("Main window not found")?,
    };
    win.set_always_on_top(on_top).map_err(|e| e.to_string())
}

