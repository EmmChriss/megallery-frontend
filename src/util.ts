export function measureTime<T>(label: string, threshhold: number, f: () => T): T {
  const start_time = performance.now()
  
  const v = f()

  const time = performance.now() - start_time
  if (time > threshhold)
    console.info(`${label} took ${time} ms`)

  return v
}

export function measureTimeCallback(label: string, threshhold: number): () => void {
  const start_time = performance.now()

  return () => {
    const time = performance.now() - start_time
    if (time > threshhold)
      console.info(`${label} took ${time} ms`)
  }
}
