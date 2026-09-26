use std::path::PathBuf;
use tauri::Manager;

pub fn get_db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())
        .map(|dir| dir.join("plurivex.db"))
}
