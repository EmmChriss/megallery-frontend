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

export function measureTimeAsync<T>(label: string, threshhold: number, f: Promise<T>): Promise<T> {
  const start_time = performance.now()

  return f.finally(() => {
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

export function throttle(time: number, callback: () => void) {}
