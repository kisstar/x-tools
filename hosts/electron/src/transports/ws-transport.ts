/**
 * WS 传输壳（§6.1 两条传输之一）。把一个 WebSocket 连接归约成
 * `IMessagePassingProtocol`，再交给 `attachConnection` —— channel 层之上与 ipc
 * 完全同形，唯一分叉是 `session.client:"browser"` 带来的按会话 capability 求值。
 *
 * 安全基线（§6.3）全部落在升级握手之前：只绑 127.0.0.1、一次性 token、Origin
 * 白名单；三者任一不过，连 WebSocket 升级都不给。鉴权判据是 ws-security 里的纯
 * 函数。WS server 默认关闭，由 host 显式 start（见 channel-host）。
 */

import { createServer, type IncomingMessage, type Server } from "node:http"
import type { Socket } from "node:net"

import { WebSocketServer, WebSocket, type RawData } from "ws"

import type { Disposable, IMessagePassingProtocol } from "@x-tools/protocol"
import { attachConnection, type ChannelServer, type SessionInfo } from "@x-tools/core"

import { isOriginAllowed, isSessionTokenValid, mintSessionToken, persistSessionToken } from "./ws-security"

/** 仅绑回环，杜绝局域网 / 公网直连（§6.3）。 */
const LOOPBACK_HOST = "127.0.0.1"

export interface WsHostOptions {
  readonly server: ChannelServer
  /** 只接受客户端拉起的本地页面来源；精确匹配，不通配（§6.3）。 */
  readonly allowedOrigins: readonly string[]
  /** 省略或 0 → 由 OS 分配临时端口，实际端口在 handle.port 回报。 */
  readonly port?: number
  /** token 落盘位置；省略即 §6.3 默认 `~/.xtools/session`。供测试重定向。 */
  readonly tokenFile?: string
  readonly onError?: (error: unknown) => void
}

export interface WsHostHandle {
  readonly port: number
  readonly token: string
  readonly dispose: () => void
}

/** ws 的 RawData（Buffer | ArrayBuffer | Buffer[]）归一到 Uint8Array。 */
function toBytes(data: RawData): Uint8Array {
  if (Array.isArray(data)) return Buffer.concat(data)
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  return data
}

/** 从升级请求里取出 token 查询参数；URL 畸形时当作无 token。 */
function readToken(req: IncomingMessage): string | undefined {
  const url = new URL(req.url ?? "/", `http://${LOOPBACK_HOST}`)
  return url.searchParams.get("token") ?? undefined
}

export function createWsHost(options: WsHostOptions): Promise<WsHostHandle> {
  const { server, allowedOrigins, port = 0, tokenFile, onError } = options
  const token = mintSessionToken()
  persistSessionToken(token, tokenFile)

  const httpServer: Server = createServer((_req, res) => {
    // 这是纯 WS 端点：任何非升级的 HTTP 请求都不该来，回 426 且不带任何 CORS 头。
    res.writeHead(426, { "Content-Type": "text/plain" })
    res.end("Upgrade Required")
  })

  const wss = new WebSocketServer({ noServer: true })
  const connections = new Set<Disposable>()
  let nextSessionId = 0

  if (onError) {
    httpServer.on("error", onError)
    wss.on("error", onError)
  }

  // 鉴权在升级之前：token / Origin 任一不过，直接 401 并销毁 socket，不进 ws。
  httpServer.on("upgrade", (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const origin = req.headers.origin
    if (!isOriginAllowed(origin, allowedOrigins) || !isSessionTokenValid(readToken(req), token)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n")
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws))
  })

  wss.on("connection", (ws: WebSocket) => {
    const protocol: IMessagePassingProtocol = {
      send(buffer) {
        if (ws.readyState === WebSocket.OPEN) ws.send(buffer)
      },
      onMessage(handler) {
        const listener = (data: RawData) => handler(toBytes(data))
        ws.on("message", listener)
        return { dispose: () => void ws.off("message", listener) }
      },
    }
    const session: SessionInfo = { client: "browser", sessionId: `ws-${nextSessionId++}` }
    const connection = attachConnection({ server, protocol, session, transport: "ws" })
    connections.add(connection)
    ws.on("close", () => {
      connection.dispose()
      connections.delete(connection)
    })
  })

  return new Promise<WsHostHandle>((resolve, reject) => {
    httpServer.once("error", reject)
    httpServer.listen(port, LOOPBACK_HOST, () => {
      httpServer.off("error", reject)
      const address = httpServer.address()
      if (address === null || typeof address === "string") {
        reject(new Error("ws host failed to bind a TCP port"))
        return
      }
      resolve({
        port: address.port,
        token,
        dispose() {
          for (const client of wss.clients) client.terminate()
          for (const connection of connections) connection.dispose()
          connections.clear()
          wss.close()
          httpServer.close()
        },
      })
    })
  })
}
