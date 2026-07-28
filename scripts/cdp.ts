/** Minimal Chrome DevTools Protocol client over the page websocket. */

type Handler = (params: Record<string, unknown>) => void

export class Cdp {
  private ws: WebSocket
  private nextId = 1
  private pending = new Map<number, { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void }>()
  private handlers = new Map<string, Handler[]>()

  private constructor(ws: WebSocket) {
    this.ws = ws
    ws.addEventListener("message", (event) => this.onMessage(String(event.data)))
  }

  static async connect(url: string): Promise<Cdp> {
    const ws = new WebSocket(url)
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve())
      ws.addEventListener("error", () => reject(new Error("cdp connect failed")))
    })
    return new Cdp(ws)
  }

  private onMessage(raw: string) {
    const msg = JSON.parse(raw) as { id?: number; result?: Record<string, unknown>; error?: { message: string }; method?: string; params?: Record<string, unknown> }
    if (msg.id !== undefined) {
      const entry = this.pending.get(msg.id)
      if (!entry) return
      this.pending.delete(msg.id)
      if (msg.error) entry.reject(new Error(msg.error.message))
      else entry.resolve(msg.result ?? {})
      return
    }
    if (msg.method) {
      for (const handler of this.handlers.get(msg.method) ?? []) handler(msg.params ?? {})
    }
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const id = this.nextId++
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }))
  }

  on(method: string, handler: Handler) {
    const list = this.handlers.get(method) ?? []
    list.push(handler)
    this.handlers.set(method, list)
  }

  async eval<T>(expression: string): Promise<T> {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })
    return ((result.result as { value?: T } | undefined)?.value ?? null) as T
  }

  close() {
    this.ws.close()
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
