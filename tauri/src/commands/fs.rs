use serde::{Deserialize, Serialize};
use std::path::Path;
use tokio::fs as tfs;
use uuid::Uuid;

#[derive(Serialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub isDirectory: bool,
    pub isFile: bool,
    pub isSymlink: bool,
}

#[derive(Deserialize)]
pub struct ReadFileArgs {
    pub path: String,
    #[serde(default)]
    pub binary: bool,
}

/// Returns the file contents either as UTF-8 string (`binary == false`) or as
/// a `Vec<u8>` serialised as a number array (`binary == true`). The two
/// shapes match what the renderer's `FileSystemPort` expects.
#[tauri::command]
pub async fn fs_read_file(args: ReadFileArgs) -> Result<serde_json::Value, String> {
    if args.binary {
        let bytes = tfs::read(&args.path).await.map_err(|e| e.to_string())?;
        Ok(serde_json::Value::Array(
            bytes
                .into_iter()
                .map(|b| serde_json::Value::from(b))
                .collect(),
        ))
    } else {
        let s = tfs::read_to_string(&args.path).await.map_err(|e| e.to_string())?;
        Ok(serde_json::Value::String(s))
    }
}

#[derive(Deserialize)]
#[serde(untagged)]
pub enum WriteFileData {
    Text(String),
    Bytes(Vec<u8>),
}

#[derive(Deserialize)]
pub struct WriteFileArgs {
    pub path: String,
    pub data: WriteFileData,
}

#[tauri::command]
pub async fn fs_write_file(args: WriteFileArgs) -> Result<(), String> {
    match args.data {
        WriteFileData::Text(s) => tfs::write(&args.path, s).await.map_err(|e| e.to_string()),
        WriteFileData::Bytes(b) => tfs::write(&args.path, b).await.map_err(|e| e.to_string()),
    }
}

#[tauri::command]
pub async fn fs_read_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let mut out = Vec::new();
    let mut rd = tfs::read_dir(&path).await.map_err(|e| e.to_string())?;
    while let Some(entry) = rd.next_entry().await.map_err(|e| e.to_string())? {
        let ft = entry.file_type().await.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        let p = entry.path().to_string_lossy().to_string();
        out.push(DirEntry {
            name,
            path: p,
            isDirectory: ft.is_dir(),
            isFile: ft.is_file(),
            isSymlink: ft.is_symlink(),
        });
    }
    Ok(out)
}

#[tauri::command]
pub async fn fs_exists(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists())
}

#[derive(Deserialize)]
pub struct MkdirArgs {
    pub path: String,
    #[serde(default)]
    pub recursive: bool,
}

#[tauri::command]
pub async fn fs_mkdir(args: MkdirArgs) -> Result<(), String> {
    if args.recursive {
        tfs::create_dir_all(&args.path).await.map_err(|e| e.to_string())
    } else {
        tfs::create_dir(&args.path).await.map_err(|e| e.to_string())
    }
}

#[derive(Deserialize)]
pub struct RemoveArgs {
    pub path: String,
    #[serde(default)]
    pub recursive: bool,
}

#[tauri::command]
pub async fn fs_remove(args: RemoveArgs) -> Result<(), String> {
    let p = Path::new(&args.path);
    if p.is_dir() {
        if args.recursive {
            tfs::remove_dir_all(p).await.map_err(|e| e.to_string())
        } else {
            tfs::remove_dir(p).await.map_err(|e| e.to_string())
        }
    } else {
        tfs::remove_file(p).await.map_err(|e| e.to_string())
    }
}

/// Placeholder watcher: returns a fresh id but does not actually emit events
/// yet. Real implementation should spawn a `notify::RecommendedWatcher` and
/// forward events to the renderer via `tauri::Window::emit` on the
/// `event:file-change:{id}` channel. Tracking that follow-up in
/// docs/ARCHITECTURE.md §11.
#[tauri::command]
pub async fn fs_watch(_path: String) -> Result<String, String> {
    Ok(Uuid::new_v4().to_string())
}

#[tauri::command]
pub async fn fs_unwatch(_id: String) -> Result<(), String> {
    Ok(())
}
