/**
 * Intelligent Driver Model: a követő jármű gyorsulása a kívánt sebesség, a távolság és a sebességkülönbség alapján.
 * Valószerű követési távolságot és fokozatos fékezést ad; a megállási vonal egy álló „előttünk haladóként” kezelhető.
 */

export interface IdmParams {
  /** Kívánt sebesség (m/s) */
  v0: number
  /** Legnagyobb gyorsulás és kényelmes lassulás (m/s²) */
  a: number
  b: number
  /** Követési időköz (s) és álló távolság (m) */
  T: number
  s0: number
}

export const IDM_DEFAULT: Omit<IdmParams, 'v0'> = { a: 1.5, b: 2.0, T: 1.3, s0: 2.5 }

/** Gyorsulás; `gap`: szabad távolság az előttünk lévőig (m), `dv`: saját sebesség − az előttünk lévő sebessége */
export function idmAccel(p: IdmParams, v: number, gap = Infinity, dv = 0): number {
  const free = 1 - Math.pow(Math.max(0, v) / Math.max(0.1, p.v0), 4)
  if (!Number.isFinite(gap)) return p.a * free
  const sStar = p.s0 + Math.max(0, v * p.T + (v * dv) / (2 * Math.sqrt(p.a * p.b)))
  const g = Math.max(0.1, gap)
  return p.a * (free - (sStar / g) ** 2)
}
