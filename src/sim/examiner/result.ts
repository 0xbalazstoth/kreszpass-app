import { EVAL_CODES } from '../../domain/evalCodes'
import { KIND_LABEL } from '../../domain/questions'
import type { Attempt, Situation } from '../../domain/types'
import type { Fault } from './examiner'

/** A helyzet előtt ennyi, utána ennyi méteren belüli hibák tartoznak hozzá */
const BEFORE_M = 60
const AFTER_M = 25

/** A helyzethez nem köthető hiba azonosítója: „drive@<méter>” (a minősítő lap ebből írja ki a helyét) */
export const driveSpotId = (s: number) => `drive@${Math.round(s)}`

export function driveSpotDistance(id: string): number | null {
  return id.startsWith('drive@') ? Number(id.slice(6)) : null
}

/**
 * A vezetés eredménye a meglévő vizsgalap-formában: minden útba eső (eltárolt) helyzet egy sor, a környékén
 * elkövetett hibákkal; a helyzetekhez nem köthető hibák külön sorokba kerülnek. Így a minősítő lap, a statisztika
 * és a gyenge pontok ugyanúgy működnek, mint a kérdéses gyakorlásnál.
 */
export function driveAttempts(situations: Situation[], faults: Fault[], reachedS: number, at: number): Attempt[] {
  const used = new Set<Fault>()
  const out: Attempt[] = []
  const sorted = [...situations].filter((s) => s.source !== 'generated').sort((a, b) => a.d - b.d)
  for (const s of sorted) {
    if (s.d > reachedS) break
    const mine = faults.filter((f) => !used.has(f) && f.s >= s.d - BEFORE_M && f.s <= s.d + AFTER_M)
    mine.forEach((f) => used.add(f))
    const codes = [...new Set(mine.map((f) => f.code))]
    out.push({
      situationId: s.id,
      promptId: 'drive',
      promptTitle: mine.length ? mine.map((f) => f.note).join(' ') : `${KIND_LABEL[s.kind]}: rendben`,
      reactionMs: null,
      chosen: null,
      outcome: codes.some((c) => EVAL_CODES[c]?.fatal) ? 'wrong' : codes.length ? 'late' : 'ok',
      codes,
      at,
    })
  }
  for (const f of faults) {
    if (used.has(f)) continue
    out.push({
      situationId: driveSpotId(f.s),
      promptId: 'drive',
      promptTitle: f.note,
      reactionMs: null,
      chosen: null,
      outcome: EVAL_CODES[f.code]?.fatal ? 'wrong' : 'late',
      codes: [f.code],
      at,
    })
  }
  return out
}
