use crate::state::AppState;
use serde_json::Value;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};
use tokio::fs as tfs;

fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    Ok(dir.join("preferences.json"))
}

async fn ensure_loaded(app: &AppHandle, state: &State<'_, AppState>) -> Result<(), String> {
    let mut guard = state.storage.lock().map_err(|e| e.to_string())?;
    if !guard.is_empty() {
        return Ok(());
    }
    let path = store_path(app)?;
    if path.exists() {
        let raw = tfs::read_to_string(&path).await.map_err(|e| e.to_string())?;
        if let Ok(map) = serde_json::from_str::<std::collections::HashMap<String, Value>>(&raw) {
            *guard = map;
        }
    }
    Ok(())
}

async fn flush(app: &AppHandle, state: &State<'_, AppState>) -> Result<(), String> {
    let map = {
        let guard = state.storage.lock().map_err(|e| e.to_string())?;
        guard.clone()
    };
    let path = store_path(app)?;
    if let Some(parent) = path.parent() {
        tfs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&map).map_err(|e| e.to_string())?;
    tfs::write(path, json).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn storage_get(
    app: AppHandle,
    state: State<'_, AppState>,
    key: String,
) -> Result<Option<Value>, String> {
    ensure_loaded(&app, &state).await?;
    let guard = state.storage.lock().map_err(|e| e.to_string())?;
    Ok(guard.get(&key).cloned())
}

#[tauri::command]
pub async fn storage_set(
    app: AppHandle,
    state: State<'_, AppState>,
    key: String,
    value: Value,
) -> Result<(), String> {
    ensure_loaded(&app, &state).await?;
    {
        let mut guard = state.storage.lock().map_err(|e| e.to_string())?;
        // Renderer ships the value as a JSON-encoded string so we re-parse it
        // here when applicable to keep the on-disk shape readable.
        let stored = if let Value::String(s) = &value {
            serde_json::from_str::<Value>(s).unwrap_or_else(|_| value.clone())
        } else {
            value
        };
        guard.insert(key, stored);
    }
    flush(&app, &state).await
}

#[tauri::command]
pub async fn storage_remove(
    app: AppHandle,
    state: State<'_, AppState>,
    key: String,
) -> Result<(), String> {
    ensure_loaded(&app, &state).await?;
    {
        let mut guard = state.storage.lock().map_err(|e| e.to_string())?;
        guard.remove(&key);
    }
    flush(&app, &state).await
}

#[tauri::command]
pub async fn storage_clear(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    {
        let mut guard = state.storage.lock().map_err(|e| e.to_string())?;
        guard.clear();
    }
    flush(&app, &state).await
}
