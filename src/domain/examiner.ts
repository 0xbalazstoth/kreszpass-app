import type { Situation } from './types'

/**
 * A vizsgabiztos szóbeli utasításai a teljes útvonal végigvezetésekor.
 * A vizsgán a biztos csak az irányt mondja meg; a táblákat, lámpákat a vizsgázónak kell felismernie,
 * ezért ezek nem hangzanak el.
 */
export function examinerLine(s: Pick<Situation, 'kind' | 'turn'>, first = false): string | null {
  const start = first ? 'Kérem, induljon el, ha biztonságos. ' : ''
  let line: string | null = null
  if (s.kind === 'roundabout') line = 'A következő körforgalomba hajtson be.'
  else if (s.turn === 'left' || s.turn === 'right') {
    const dir = s.turn === 'left' ? 'balra' : 'jobbra'
    line = s.kind === 'signals' ? `A jelzőlámpás kereszteződésnél forduljon ${dir}.` : `A következő kereszteződésnél forduljon ${dir}.`
  } else if (s.kind === 'signals' || s.kind === 'stop' || s.kind === 'give_way') line = 'A kereszteződésben haladjon tovább egyenesen.'
  if (!line) return first ? start.trim() : null
  return start + line
}

/** Ennyivel a helyzet előtt hangzik el az utasítás (m), mint a valódi vizsgán */
export const EXAMINER_LEAD_M = 120
