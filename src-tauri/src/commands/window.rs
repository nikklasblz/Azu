use tauri::AppHandle;
use tauri::webview::WebviewWindowBuilder;
use uuid::Uuid;

#[tauri::command]
pub async fn create_window(app: AppHandle, title: Option<String>) -> Result<String, String> {
    let label = format!("azu-{}", Uuid::new_v4().to_string().split('-').next().unwrap());
    let window_title = title.unwrap_or_else(|| "Azu".to_string());

    let url = tauri::WebviewUrl::App("index.html".into());

    WebviewWindowBuilder::new(&app, &label, url)
        .title(&window_title)
        .inner_size(900.0, 600.0)
        .min_inner_size(400.0, 300.0)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(label)
}
