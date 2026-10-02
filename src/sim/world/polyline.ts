import type { XZ } from './project'

/** Összegzett hosszak egy töröttvonal pontjaihoz */
export function cumulative(pts: XZ[]): number[] {
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  return cum
}

/** A szakasz sorszáma, amelyre az s távolság esik (bináris kereséssel) */
export function segmentAt(cum: number[], s: number): number {
  let lo = 0
  let hi = cum.length - 2
  if (hi < 0) return 0
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (cum[mid] <= s) lo = mid
    else hi = mid - 1
  }
  return lo
}

export function pointAt(pts: XZ[], cum: number[], s: number): XZ {
  const total = cum[cum.length - 1]
  const c = Math.max(0, Math.min(total, s))
  const i = segmentAt(cum, c)
  const len = cum[i + 1] - cum[i] || 1
  const t = (c - cum[i]) / len
  const a = pts[i]
  const b = pts[i + 1] ?? a
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

/** Haladási irány (heading) az s helyen: a környező `span` méteres szakasz iránya, hogy a töréspontokon ne ugorjon */
export function headingAt(pts: XZ[], cum: number[], s: number, span = 3): number {
  const total = cum[cum.length - 1]
  const lo = Math.max(0, Math.min(s - span, total - 2 * span))
  const hi = Math.min(total, Math.max(s + span, 2 * span))
  const a = pointAt(pts, cum, lo)
  const b = pointAt(pts, cum, hi)
  return Math.atan2(b[0] - a[0], -(b[1] - a[1]))
}

/** Jobbra mutató egységvektor a heading irányhoz képest */
export function rightOf(heading: number): XZ {
  return [Math.cos(heading), Math.sin(heading)]
}

export function forwardOf(heading: number): XZ {
  return [Math.sin(heading), -Math.cos(heading)]
}

/** Pont az s helyen, oldalra eltolva (+ = jobbra az irányhoz képest) */
export function offsetAt(pts: XZ[], cum: number[], s: number, lateral: number, heading = headingAt(pts, cum, s)): XZ {
  const p = pointAt(pts, cum, s)
  const r = rightOf(heading)
  return [p[0] + r[0] * lateral, p[1] + r[1] * lateral]
}
