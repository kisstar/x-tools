use serde::{Deserialize, Serialize};
use std::process::Stdio;
use tokio::process::Command;

#[derive(Deserialize)]
pub struct ShellExecArgs {
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    pub cwd: Option<String>,
    #[serde(default)]
    pub elevated: bool,
}

#[derive(Serialize)]
pub struct ShellExecResult {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

/// Runs a single subprocess and captures its stdout/stderr.
///
/// Privilege elevation (`elevated == true`) is intentionally NOT implemented
/// here yet — the Switch-Host module must declare a Tauri capability and use
/// `tauri-plugin-shell`'s sidecar / scoped command list before we trust this
/// path with sudo. The flag is accepted now so the renderer contract is
/// stable when that work lands.
#[tauri::command]
pub async fn shell_exec(args: ShellExecArgs) -> Result<ShellExecResult, String> {
    let mut cmd = Command::new(&args.command);
    cmd.args(&args.args);
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    if let Some(cwd) = &args.cwd {
        cmd.current_dir(cwd);
    }
    let output = cmd.output().await.map_err(|e| e.to_string())?;
    Ok(ShellExecResult {
        code: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

#[tauri::command]
pub async fn shell_env(name: String) -> Result<Option<String>, String> {
    Ok(std::env::var(&name).ok())
}
