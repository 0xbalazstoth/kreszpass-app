import type { LineString } from 'geojson'
import { angleDiff, RouteGeom } from '../lib/geo'
import type { HazardDensity, Situation } from './types'

/**
 * Váratlan helyzetek (akadály az úton, labda, kinyíló ajtó, kerékpáros, mentőautó) az útvonal egyenes szakaszain.
 * Ezek nincsenek a térképadatokban, ezért a vezetés elején kerülnek az útvonalra. A helyük az útvonal azonosítójából
 * számolt álvéletlen, így ugyanazon az útvonalon mindig ugyanott vannak; hogy mi történik ott, azt a kérdés választja ki.
 */

/** Ennyi méterenként jut egy váratlan helyzet */
export const HAZARD_SPACING_M: Record<Exclude<HazardDensity, 'off'>, number> = { few: 700, many: 400 }
/**
 * Ennyi szabad hely kell a többi helyzettől mindkét irányban (m). A budapesti vizsgaútvonalakon 50–100 m-enként
 * van kereszteződés, zebra vagy megálló, ezért nagyobb távolságnál alig jutna hely váratlan helyzetnek.
 */
export const HAZARD_CLEAR_M = 50
/** Az útvonal eleje és vége szabadon marad (m) */
const START_M = 150
const END_M = 80
/** Egyenes szakasz: ennyi méteren belül legfeljebb ekkora irányváltozás (fok) */
const STRAIGHT_SPAN_M = 40
const STRAIGHT_MAX_DEG = 20
const STEP_M = 10

function seeded(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
}

export function isGenerated(s: Pick<Situation, 'source'>): boolean {
  return s.source === 'generated'
}

/** Egy váratlan helyzet azonosítójából a helye (m), mert ezek nincsenek eltárolva; más azonosítónál null */
export function hazardDistance(situationId: string): number | null {
  const m = /^hazard:.+:(\d+)$/.exec(situationId)
  return m ? Number(m[1]) : null
}

export function placeHazards(line: LineString, situations: Pick<Situation, 'd'>[], routeId: string, density: HazardDensity): Situation[] {
  if (density === 'off') return []
  const spacing = HAZARD_SPACING_M[density]
  const geom = new RouteGeom(line)
  const L = geom.length
  const rng = seeded(`hazard:${routeId}`)
  const taken = situations.map((s) => s.d)
  const straight = (d: number) => {
    const a = geom.bearingBetween(Math.max(0, d - STRAIGHT_SPAN_M), d)
    const b = geom.bearingBetween(d, Math.min(L, d + STRAIGHT_SPAN_M))
    return angleDiff(a, b) <= STRAIGHT_MAX_DEG
  }
  const free = (d: number) => taken.every((x) => Math.abs(x - d) >= HAZARD_CLEAR_M) && straight(d)

  const out: Situation[] = []
  let cursor = START_M
  while (cursor < L - END_M) {
    const target = cursor + spacing * (0.6 + rng() * 0.8)
    let placed: number | null = null
    for (let d = Math.max(START_M, target - spacing / 2); d <= Math.min(L - END_M, target + spacing / 2); d += STEP_M) {
      if (free(d)) {
        placed = d
        if (d >= target) break
      }
    }
    if (placed === null) {
      cursor = target
      continue
    }
    const d = Math.round(placed)
    const [lng, lat] = geom.pointAt(d)
    out.push({
      id: `hazard:${routeId}:${d}`,
      routeId,
      d,
      lng,
      lat,
      bearing: Math.round(geom.bearingBetween(Math.max(0, d - 25), d)),
      kind: 'hazard',
      turn: 'straight',
      needsReview: false,
      source: 'generated',
    })
    taken.push(d)
    cursor = d
  }
  return out
}

/** A helyzetek és a váratlan helyzetek egy listában, az útvonal mentén rendezve */
export function withHazards(situations: Situation[], line: LineString | undefined, routeId: string, density: HazardDensity): Situation[] {
  if (!line || density === 'off') return situations
  return [...situations, ...placeHazards(line, situations, routeId, density)].sort((a, b) => a.d - b.d)
}
