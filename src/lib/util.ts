export function measureTime<T>(label: string, threshhold: number, f: () => T): T {
  const start_time = performance.now()

  const v = f()

  const time = performance.now() - start_time
  if (time > threshhold) console.info(`${label} took ${time} ms`)

  return v
}

export function measureTimeCallback(label: string, threshhold: number): () => void {
  const start_time = performance.now()

  return () => {
    const time = performance.now() - start_time
    if (time > threshhold) console.info(`${label} took ${time} ms`)
  }
}

export function measureTimeAsync<T>(
  label: string,
  threshhold: number,
  f: () => Promise<T>,
): Promise<T> {
  const start_time = performance.now()

  return f().finally(() => {
    const time = performance.now() - start_time
    if (time > threshhold) console.info(`${label} took ${time} ms`)
  })
}

export function assert(condition: boolean, msg?: string) {
  if (!condition) throw new Error(msg)
}

export class Throttle {
  lasttime = 0

  call(time: number, callback: () => void) {
    const now = performance.now()
  }
}

export class CustomMap<K1, K2, V> {
  private map = new Map<K2, V>()
  private keyFn: (outerKey: K1) => K2

  constructor(keyFn: (outerKey: K1) => K2) {
    this.keyFn = keyFn
  }

  set(key: K1, value: V) {
    const innerKey = this.keyFn(key)
    this.map.set(innerKey, value)
  }

  get(key: K1): V | undefined {
    const innerKey = this.keyFn(key)
    return this.map.get(innerKey)
  }
}
