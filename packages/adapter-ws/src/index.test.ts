import type { WebSocketLike } from './index.ts'
import { describe, expect, it } from 'vitest'
import { ChannelError, createBrowserWebSocketChannel, readSessionToken, WebSocketChannel } from './index.ts'

class FakeWebSocket implements WebSocketLike {
  readonly sent: string[] = []
  readyState = 0
  onopen: ((event: unknown) => void) | null = null
  onmessage: ((event: { readonly data: unknown }) => void) | null = null
  onclose: ((event: unknown) => void) | null = null
  onerror: ((event: unknown) => void) | null = null

  open(): void {
    this.readyState = 1
    this.onopen?.({})
  }

  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) })
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.readyState = 3
    this.onclose?.({})
  }
}

describe('webSocketChannel', () => {
  it('连接打开前发起的调用会等待连接而不是立即失败', async () => {
    const socket = new FakeWebSocket()
    const channel = new WebSocketChannel(socket)
    const pending = channel.call<{ value: number }, { result: number }>('math.double@1', { value: 2 })
    expect(socket.sent).toHaveLength(0)
    socket.open()
    const request = JSON.parse(socket.sent[0] ?? '{}') as { id: number }
    socket.receive({ jsonrpc: '2.0', id: request.id, result: { result: 4 } })
    await expect(pending).resolves.toEqual({ result: 4 })
  })

  it('只从服务端注入的 meta 读取 token，并作为子协议发送', () => {
    let protocols: readonly string[] = []
    const token = readSessionToken({ querySelector: () => ({ content: 'secret' }) as HTMLMetaElement })
    createBrowserWebSocketChannel({
      url: 'ws://localhost/rpc',
      token,
      createSocket(_url, values) {
        protocols = values
        return new FakeWebSocket()
      },
    })
    expect(protocols).toEqual(['xtools', 'xtools-token.secret'])
  })

  it('为并发调用分配不同 ID，并按 ID 匹配乱序响应', async () => {
    const socket = new FakeWebSocket()
    const channel = new WebSocketChannel(socket)
    socket.open()

    const first = channel.call<{ value: number }, { result: number }>('math.double@1', { value: 2 })
    const second = channel.call<{ value: number }, { result: number }>('math.double@1', { value: 3 })
    const [firstRequest, secondRequest] = socket.sent.map(value => JSON.parse(value) as { id: number })

    expect(firstRequest.id).not.toBe(secondRequest.id)
    socket.receive({ jsonrpc: '2.0', id: secondRequest.id, result: { result: 6 } })
    socket.receive({ jsonrpc: '2.0', id: firstRequest.id, result: { result: 4 } })
    await expect(first).resolves.toEqual({ result: 4 })
    await expect(second).resolves.toEqual({ result: 6 })
  })

  it('保留服务端稳定错误的 code、message、traceId 与 details', async () => {
    const socket = new FakeWebSocket()
    const channel = new WebSocketChannel(socket)
    socket.open()

    const result = channel.call('workbench.preferences.update@1', {})
    const request = JSON.parse(socket.sent[0] ?? '{}') as { id: number }
    socket.receive({
      jsonrpc: '2.0',
      id: request.id,
      error: { code: 'conflict', message: '偏好已被更新', traceId: 'trace-1', details: { revision: '2' } },
    })

    await expect(result).rejects.toEqual(new ChannelError('conflict', '偏好已被更新', 'trace-1', { revision: '2' }))
  })

  it('连接关闭时拒绝全部 pending，之后的新调用立即失败', async () => {
    const socket = new FakeWebSocket()
    const channel = new WebSocketChannel(socket)
    socket.open()

    const first = channel.call('one@1', {})
    const second = channel.call('two@1', {})
    socket.close()

    await expect(first).rejects.toMatchObject({ code: 'unavailable' })
    await expect(second).rejects.toMatchObject({ code: 'unavailable' })
    await expect(channel.call('three@1', {})).rejects.toMatchObject({ code: 'unavailable' })
  })

  it('按 eventId 分发通知，取消函数幂等且停止后续分发', () => {
    const socket = new FakeWebSocket()
    const channel = new WebSocketChannel(socket)
    socket.open()
    const values: number[] = []
    const unsubscribe = channel.subscribe<{ value: number }>('counter.changed@1', payload => values.push(payload.value))

    socket.receive({ jsonrpc: '2.0', method: 'event', params: { eventId: 'counter.changed@1', payload: { value: 1 } } })
    unsubscribe()
    unsubscribe()
    socket.receive({ jsonrpc: '2.0', method: 'event', params: { eventId: 'counter.changed@1', payload: { value: 2 } } })

    expect(values).toEqual([1])
  })
})
