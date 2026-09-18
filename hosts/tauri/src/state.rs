use serde_json::Value;
use std::collections::HashMap;
use std::sync::Mutex;

/// Application-wide state shared across Tauri commands.
///
/// `storage` is a flat JSON dictionary persisted to disk by the
/// `tauri-plugin-store`-backed `commands::storage` module. We keep an
/// in-memory mirror here so reads are sync and we don't hit disk on every
/// renderer round-trip.
///
/// `watchers` tracks active filesystem watchers by id so the renderer can
/// later pass that id to `fs_unwatch` to stop them.
#[derive(Default)]
pub struct AppState {
    pub storage: Mutex<HashMap<String, Value>>,
    pub watchers: Mutex<HashMap<String, std::sync::mpsc::Sender<()>>>,
}
