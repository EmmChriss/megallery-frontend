export class EventHandler<M extends { [key in keyof M]: (...args: Parameters<M[key]>) => void }> {
  protected listeners = new Map<keyof M, M[keyof M][]>()

  protected emitEvent<K extends keyof M>(type: K, ...args: Parameters<M[K]>) {
    this.listeners.get(type)?.forEach(cb => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cb(...(args as any[]))
    })
  }

  addEventListener<K extends keyof M>(type: K, cb: M[K]) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, [])
    }

    this.listeners.get(type)!.push(cb)
  }

  removeEventListener<K extends keyof M>(type: K, cb: M[K]) {
    const listeners = this.listeners.get(type) || []
    const idx = listeners.findIndex(v => v === cb)

    if (idx >= 0) {
      listeners.splice(idx, 1)
    }
  }

  clearEventListeners<K extends keyof M>(type?: K) {
    if (type) {
      this.listeners.set(type, [])
    } else {
      this.listeners.clear()
    }
  }
}
