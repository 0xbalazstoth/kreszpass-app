import type { Junction, Road } from './types'

/**
 * Egy csomópont útágai és a főút kiválasztása. A táblázás és a forgalom szabályai ugyanezt használják, így a vezető
 * azt látja a táblákon, ami szerint a többi jármű is közlekedik.
 */

export interface Arm {
  road: Road
  /** A csomópont helye az úton (m) */
  s: number
  /** A csomópont felé haladás iránya az úton (1: a rajzolás irányában) */
  dir: 1 | -1
  /** Lehet-e a csomópont felé haladni (és onnan elhaladni) ezen az ágon */
  canApproach: boolean
  canLeave: boolean
}

export const allowed = (r: Road, dir: 1 | -1) => r.oneway === 0 || r.oneway === dir

export function armsAt(nodeOn: Map<number, Array<{ road: Road; i: number }>>, node: number): Arm[] {
  const out: Arm[] = []
  for (const { road, i } of nodeOn.get(node) ?? []) {
    const s = road.cum[i]
    if (i > 0) out.push({ road, s, dir: 1, canApproach: allowed(road, 1), canLeave: allowed(road, -1) })
    if (i < road.nodes.length - 1) out.push({ road, s, dir: -1, canApproach: allowed(road, -1), canLeave: allowed(road, 1) })
  }
  return out
}

/**
 * A főút ágai: a kitáblázott főútvonal, különben a legmagasabb rangú utak, ha legalább kettő van belőlük és van
 * alacsonyabb rangú ág is. Üres: egyenrangú kereszteződés (jobbkéz-szabály).
 */
export function mainArms(arms: Arm[]): Arm[] {
  const prio = arms.filter((a) => a.road.priority)
  if (prio.length >= 2) return prio
  const top = Math.max(...arms.map((a) => a.road.rank))
  const best = arms.filter((a) => a.road.rank === top)
  return best.length >= 2 && best.length < arms.length ? best : []
}

export function nodeIndex(roads: Road[]): Map<number, Array<{ road: Road; i: number }>> {
  const m = new Map<number, Array<{ road: Road; i: number }>>()
  for (const r of roads)
    r.nodes.forEach((n, i) => {
      if (n < 0) return
      const list = m.get(n)
      if (list) list.push({ road: r, i })
      else m.set(n, [{ road: r, i }])
    })
  return m
}

/**
 * A megállási vonal távolsága a csomóponttól az adott ágon (m): a kereszteződés széle előtt kicsivel (az osm2streets
 * szerinti levágásnál), különben a legszélesebb befutó út félszélessége + 2 m
 */
export function stopBack(j: Junction, road: Road, dir: 1 | -1): number {
  const t = j.trims?.[`${road.id}:${dir}`]
  return t !== undefined ? t + 0.6 : j.core + 2
}
