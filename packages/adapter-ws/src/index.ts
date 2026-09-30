export interface WebSocketLike {
  readonly readyState: number
  onopen: ((event: unknown) => void) | null
  onmessage: ((event: { readonly data: unknown }) => void) | null
  onclose: ((event: unknown) => void) | null
  onerror: ((event: unknown) => void) | null
  send(data: string): void
  close(): void
}

interface RpcError {
  readonly code: string
  readonly message: string
  readonly traceId: string
  readonly details?: unknown
}

interface RpcResponse {
  readonly id?: number
  readonly result?: unknown
  readonly error?: RpcError
  readonly method?: string
  readonly params?: { readonly eventId?: string; readonly payload?: unknown }
}

interface Pending {
  readonly resolve: (value: unknown) => void
  readonly reject: (reason: ChannelError) => void
}
interface QueuedCall { readonly send: () => void; readonly reject: (reason: ChannelError) => void }

export class ChannelError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly traceId: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ChannelError'
  }
}

export class WebSocketChannel {
  private nextId = 1
  private connected = false
  private closed = false
  private readonly pending = new Map<number, Pending>()
  private readonly queued: QueuedCall[] = []
  private readonly subscribers = new Map<string, Set<(payload: unknown) => void>>()

  constructor(private readonly socket: WebSocketLike) {
    socket.onopen = () => {
      if (this.closed) return
      this.connected = true
      for (const call of this.queued.splice(0)) call.send()
    }
    socket.onmessage = event => { if (typeof event.data === 'string') this.receive(event.data) }
    socket.onclose = () => { this.failPending('WebSocket 连接已关闭') }
    socket.onerror = () => { this.failPending('WebSocket 连接失败') }
  }

  call<TIn, TOut>(capabilityId: string, input: TIn): Promise<TOut> {
    if (this.closed) {
      return Promise.reject(this.unavailable('WebSocket 尚未连接或已关闭'))
    }
    const id = this.nextId++
    return new Promise<TOut>((resolve, reject) => {
      this.pending.set(id, { resolve: value => resolve(value as TOut), reject })
      const send = (): void => this.socket.send(JSON.stringify({ jsonrpc: '2.0', id, method: capabilityId, params: input }))
      if (this.connected) send()
      else this.queued.push({ send, reject })
    })
  }

  subscribe<T>(eventId: string, handler: (payload: T) => void): () => void {
    const handlers = this.subscribers.get(eventId) ?? new Set<(payload: unknown) => void>()
    const wrapped = (payload: unknown): void => { handler(payload as T) }
    handlers.add(wrapped)
    this.subscribers.set(eventId, handlers)
    let active = true
    return () => {
      if (!active) return
      active = false
      handlers.delete(wrapped)
      if (handlers.size === 0) this.subscribers.delete(eventId)
    }
  }

  close(): void {
    this.socket.close()
  }

  private receive(data: string): void {
    let response: RpcResponse
    try {
      response = JSON.parse(data) as RpcResponse
    } catch {
      return
    }
    if (response.method === 'event' && response.params?.eventId !== undefined) {
      for (const handler of this.subscribers.get(response.params.eventId) ?? []) handler(response.params.payload)
      return
    }
    if (response.id === undefined) return
    const pending = this.pending.get(response.id)
    if (pending === undefined) return
    this.pending.delete(response.id)
    if (response.error !== undefined) {
      pending.reject(new ChannelError(response.error.code, response.error.message, response.error.traceId, response.error.details))
      return
    }
    pending.resolve(response.result)
  }

  private failPending(message: string): void {
    this.connected = false
    this.closed = true
    const error = this.unavailable(message)
    for (const pending of this.pending.values()) pending.reject(error)
    for (const call of this.queued.splice(0)) call.reject(error)
    this.pending.clear()
    this.subscribers.clear()
  }

  private unavailable(message: string): ChannelError {
    return new ChannelError('unavailable', message, 'transport')
  }
}

export interface BrowserChannelOptions {
  readonly url: string
  readonly token: string
  readonly createSocket?: (url: string, protocols: readonly string[]) => WebSocketLike
}

export function createBrowserWebSocketChannel(options: BrowserChannelOptions): WebSocketChannel {
  const createSocket: (url: string, protocols: readonly string[]) => WebSocketLike = options.createSocket
    ?? ((url, protocols) => new WebSocket(url, [...protocols]) as unknown as WebSocketLike)
  return new WebSocketChannel(createSocket(options.url, ['xtools', `xtools-token.${options.token}`]))
}

export function readSessionToken(documentValue: Pick<Document, 'querySelector'>): string {
  const token = documentValue.querySelector<HTMLMetaElement>('meta[name="xtools-session-token"]')?.content
  if (token === undefined || token === '') throw new ChannelError('unauthenticated', '页面缺少会话凭证', 'bootstrap')
  return token
}
