/**
 * The single Electron ipc channel both ends use to carry channel-RPC frames
 * (raw Uint8Array). Shared by preload (ipcRenderer) and the main transport
 * (ipcMain) so the string is defined exactly once.
 */

export const IPC_CHANNEL_NAME = "x-tools:channel"
