import { assert } from './util'

export class Point {
  readonly x: number
  readonly y: number

  constructor(x: number, y: number) {
    this.x = x
    this.y = y
  }

  translate(x: number, y: number) {
    return new Point(this.x + x, this.y + y)
  }

  scale(x: number, y: number) {
    return new Point(this.x * x, this.y * y)
  }
}

export class Rectangle {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number

  constructor(x: number, y: number, w: number, h: number) {
    assert(w > 0, 'Rectangle width has to be positive')
    assert(h > 0, 'Rectangle height has to be positive')

    this.x = x
    this.y = y
    this.w = w
    this.h = h
  }

  static fromCenter(center: Point, w: number, h: number): Rectangle {
    return new Rectangle(center.x - w / 2, center.y - h / 2, w, h)
  }

  static fromOppositeCorners(basePoint: Point, offsetPoint: Point): Rectangle {
    return new Rectangle(
      Math.min(basePoint.x, offsetPoint.x),
      Math.min(basePoint.y, offsetPoint.y),
      Math.abs(basePoint.x - offsetPoint.x),
      Math.abs(basePoint.y - offsetPoint.y),
    )
  }

  getCenter(): Point {
    return new Point(this.x + this.w / 2, this.y + this.h / 2)
  }

  getBasePoint(): Point {
    return new Point(this.x, this.y)
  }

  getOffsetPoint(): Point {
    return new Point(this.x + this.w, this.y + this.h)
  }

  scale(scaleX: number, scaleY: number): Rectangle {
    return new Rectangle(this.x, this.y, this.w * scaleX, this.h * scaleY)
  }

  intersects(other: Rectangle): boolean {
    return (
      this.x < other.x + other.w &&
      this.x + this.w > other.x &&
      this.y < other.y + other.h &&
      this.y + this.h > other.y
    )
  }

  contains(other: Rectangle): boolean {
    return (
      this.x < other.x &&
      this.y < other.y &&
      this.x + this.w > other.x + other.w &&
      this.y + this.h > other.y + other.h
    )
  }
}
