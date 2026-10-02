import { headingAt } from '../world/polyline'
import { projectOnSegment, wrapAngle, type XZ } from '../world/project'
import type { RoutePath } from '../world/types'

/**
 * Hol tart a vezető az útvonalon: az útvonal mentén mért távolság (s). Csak az eddigi helyzet környékén keres
 * (visszafelé 40, előre 120 m), hogy egy önmagát keresztező útvonalon se ugorjon át egy másik szakaszra.
 */
export interface RouteProgress {
  /** Távolság az útvonal elejétől (m) */
  s: number
  /** Távolság az útvonal vonalától (m) */
  off: number
  /** Az útvonal irányában halad-e (és nem szemben) */
  along: boolean
  /** Ennyi ideje van távol az útvonaltól (s) */
  offFor: number
}

export const OFF_ROUTE_M = 18

export function trackRoute(route: RoutePath, prev: RouteProgress, p: XZ, heading: number, dt: number): RouteProgress {
  const lo = prev.s - 40
  const hi = prev.s + 120
  let best = { s: prev.s, d: Infinity }
  for (let i = 0; i < route.pts.length - 1; i++) {
    if (route.cum[i + 1] < lo || route.cum[i] > hi) continue
    const h = projectOnSegment(p, route.pts[i], route.pts[i + 1])
    if (h.dist < best.d) best = { s: route.cum[i] + h.t * (route.cum[i + 1] - route.cum[i]), d: h.dist }
  }
  // Letérés után (kerülővel) máshol is visszatérhet: az egész útvonalon keresünk, előre (a régebbi szakaszokat kerülve)
  if (prev.offFor > 2 && best.d > 15) {
    for (let i = 0; i < route.pts.length - 1; i++) {
      if (route.cum[i + 1] < prev.s - 50) continue
      const h = projectOnSegment(p, route.pts[i], route.pts[i + 1])
      if (h.dist <= 15 && h.dist < best.d) best = { s: route.cum[i] + h.t * (route.cum[i + 1] - route.cum[i]), d: h.dist }
    }
  }
  // Ha már messze van (letért), a haladás nem nő; visszatérve innen folytatódik
  const s = best.d <= OFF_ROUTE_M * 2 ? best.s : prev.s
  const along = Math.abs(wrapAngle(heading - headingAt(route.pts, route.cum, s, 6))) < Math.PI / 2
  const off = best.d
  return { s, off, along, offFor: off > OFF_ROUTE_M ? prev.offFor + dt : 0 }
}

export const startProgress = (): RouteProgress => ({ s: 0, off: 0, along: true, offFor: 0 })
