export class Clock {

  private label: string | undefined
  private start_time: number
  private end_time: number | undefined
  
  constructor(label?: string) {
    this.label = label
    this.start_time = performance.now()
  }

  public start() {
    this.start_time = performance.now()
  }

  public stop() {
    this.end_time = performance.now()
  }

  public reset() {
    this.end_time = undefined
  }

  public get_time() {
    return (this.end_time ?? performance.now()) - this.start_time
  }

  public print_time(label?: string) {
    console.log(`${label ?? this.label ?? "unlabeled measurement"} took ${this.get_time()} ms`)
  }
}
