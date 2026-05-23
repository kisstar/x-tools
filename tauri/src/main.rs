// Prevents additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod state;

use commands::{fs as fs_cmd, shell as shell_cmd, storage as storage_cmd};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(state::AppState::default())
        .invoke_handler(tauri::generate_handler![
            // FileSystem
            fs_cmd::fs_read_file,
            fs_cmd::fs_write_file,
            fs_cmd::fs_read_dir,
            fs_cmd::fs_exists,
            fs_cmd::fs_mkdir,
            fs_cmd::fs_remove,
            fs_cmd::fs_watch,
            fs_cmd::fs_unwatch,
            // Storage
            storage_cmd::storage_get,
            storage_cmd::storage_set,
            storage_cmd::storage_remove,
            storage_cmd::storage_clear,
            // Shell
            shell_cmd::shell_exec,
            shell_cmd::shell_env,
        ])
        .run(tauri::generate_context!())
        .expect("error while running xTools application");
}
