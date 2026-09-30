import type { Attempt, Outcome, Situation } from './types'

/** Egy válasz értéke a felkészültséghez: helyes-időben 1, rossz vagy lejárt 0 */
const VALUE: Record<Outcome, number> = { ok: 1, late: 0.7, slow: 0.4, wrong: 0, timeout: 0 }
/** Ennyi legutóbbi válasz számít egy helyzetnél */
const RECENT = 3

export type Health = 'new' | 'bad' | 'meh' | 'good'

export interface SituationHealth {
  status: Health
  /** 0..1, a legutóbbi válaszok átlaga (új helyzetnél 0) */
  score: number
  attempts: number
}

export const HEALTH_COLOR: Record<Health, string> = { new: '#6b7280', bad: '#dc2626', meh: '#d97706', good: '#16a34a' }
export const HEALTH_LABEL: Record<Health, string> = { new: 'még nem gyakorolt', bad: 'gyenge', meh: 'bizonytalan', good: 'jól megy' }

/** Egy helyzet állapota a legutóbbi válaszok alapján (a lista sorrendje mindegy) */
export function situationHealth(attempts: Attempt[]): SituationHealth {
  if (attempts.length === 0) return { status: 'new', score: 0, attempts: 0 }
  const recent = [...attempts].sort((a, b) => b.at - a.at).slice(0, RECENT)
  const score = recent.reduce((sum, a) => sum + VALUE[a.outcome], 0) / recent.length
  return { status: score >= 0.85 ? 'good' : score >= 0.5 ? 'meh' : 'bad', score, attempts: attempts.length }
}

/** Válaszok helyzetenként csoportosítva */
export function attemptsBySituation(attempts: Attempt[]): Map<string, Attempt[]> {
  const map = new Map<string, Attempt[]>()
  for (const a of attempts) {
    const list = map.get(a.situationId)
    if (list) list.push(a)
    else map.set(a.situationId, [a])
  }
  return map
}

export interface Readiness {
  /** 0..100 */
  percent: number
  counts: Record<Health, number>
}

/** Vizsga-felkészültség egy útvonalon: a helyzetek pontszámának átlaga (a még nem gyakorolt 0-nak számít) */
export function routeReadiness(situations: Pick<Situation, 'id'>[], by: Map<string, Attempt[]>): Readiness {
  const counts: Record<Health, number> = { new: 0, bad: 0, meh: 0, good: 0 }
  if (situations.length === 0) return { percent: 0, counts }
  let total = 0
  for (const s of situations) {
    const h = situationHealth(by.get(s.id) ?? [])
    counts[h.status]++
    total += h.score
  }
  return { percent: Math.round((total / situations.length) * 100), counts }
}

const ORDER: Record<Health, number> = { bad: 0, meh: 1, new: 2, good: 3 }

/** A leggyengébb helyzetek: előbb a hibásak, aztán a bizonytalanok, végül a még nem gyakoroltak */
export function weakest<T extends Pick<Situation, 'id' | 'd'>>(situations: T[], by: Map<string, Attempt[]>, n: number): T[] {
  return situations
    .map((s) => ({ s, h: situationHealth(by.get(s.id) ?? []) }))
    .filter(({ h }) => h.status !== 'good')
    .sort((a, b) => ORDER[a.h.status] - ORDER[b.h.status] || a.h.score - b.h.score || a.s.d - b.s.d)
    .slice(0, n)
    .map(({ s }) => s)
    .sort((a, b) => a.d - b.d)
}
