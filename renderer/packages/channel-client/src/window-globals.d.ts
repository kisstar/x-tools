/**
 * Ambient shapes the host injects into the page. `window.xtools.channel` is the
 * byte bridge the Electron preload exposes (§6.1); `window.__XTOOLS_WS__` is the
 * loopback url + one-time token that switch-host injects into the local browser
 * page (§6.3). Both live at the untyped DOM boundary; this is the only place we
 * name them.
 */

export interface WsBootstrap {
  /** loopback ws url the host is listening on, e.g. `ws://127.0.0.1:51734/`. */
  readonly url: string
  /** one-time session token minted by the host (§6.3); sent as `?token=`. */
  readonly token: string
}

declare global {
  interface Window {
    readonly xtools?: {
      readonly channel: {
        readonly post: (bytes: Uint8Array) => void
        readonly on: (handler: (bytes: Uint8Array) => void) => () => void
      }
    }
    readonly __XTOOLS_WS__?: WsBootstrap
  }
}
