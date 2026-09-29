import { Rating, type Grade } from 'ts-fsrs'
import { EVAL_CODES, MAX_FAULT_LINES } from './evalCodes'
import type { Prompt } from './questions'
import type { Attempt, Outcome, Settings } from './types'

export type Thresholds = Pick<Settings, 'okMs' | 'lateMs' | 'timeoutMs'>

export interface Classified {
  outcome: Outcome
  codes: string[]
}

/**
 * Egy válasz lefordítása a minősítő lap kódjaira.
 * - helyes, időben → nincs hiba
 * - helyes, kissé késve → 6/4
 * - helyes, lassan → 6/2
 * - rossz válasz → az opcióhoz rendelt kód (általában 8. blokk)
 * - nincs válasz → 8/25 (a közlekedési helyzetet nem ismeri fel)
 */
export function classifyAnswer(
  prompt: Prompt,
  chosen: number | null,
  reactionMs: number | null,
  t: Thresholds,
): Classified {
  if (chosen === null || reactionMs === null || reactionMs > t.timeoutMs) {
    return { outcome: 'timeout', codes: [prompt.timeoutCode] }
  }
  const option = prompt.options[chosen]
  if (!option) throw new Error(`Nincs ilyen válaszlehetőség: ${chosen}`)
  if (!option.correct) {
    return { outcome: 'wrong', codes: [option.code ?? prompt.timeoutCode] }
  }
  if (reactionMs <= t.okMs) return { outcome: 'ok', codes: [] }
  if (reactionMs <= t.lateMs) return { outcome: 'late', codes: ['6/4'] }
  return { outcome: 'slow', codes: ['6/2'] }
}

export interface SessionResult {
  /** kód → hányszor jelölték */
  marks: Record<string, number>
  /** Az 1–7. blokk jelöléseinek száma */
  faultLines: number
  /** A 8. blokk jelölt kódjai */
  fatal: string[]
  passed: boolean
  answered: number
  correct: number
  avgReactionMs: number | null
}

export function evaluateSession(attempts: Attempt[], maxFaultLines = MAX_FAULT_LINES): SessionResult {
  const marks: Record<string, number> = {}
  for (const a of attempts) {
    for (const code of a.codes) marks[code] = (marks[code] ?? 0) + 1
  }
  let faultLines = 0
  const fatal: string[] = []
  for (const [code, count] of Object.entries(marks)) {
    const def = EVAL_CODES[code]
    if (!def) throw new Error(`Ismeretlen lapkód: ${code}`)
    if (def.fatal) fatal.push(code)
    else faultLines += count
  }
  fatal.sort(compareCodes)
  const correctOnes = attempts.filter((a) => a.outcome === 'ok' || a.outcome === 'late' || a.outcome === 'slow')
  const times = correctOnes.map((a) => a.reactionMs).filter((x): x is number => x !== null)
  return {
    marks,
    faultLines,
    fatal,
    passed: fatal.length === 0 && faultLines <= maxFaultLines,
    answered: attempts.length,
    correct: correctOnes.length,
    avgReactionMs: times.length ? Math.round(times.reduce((s, x) => s + x, 0) / times.length) : null,
  }
}

/** Ismétlési (FSRS) értékelés egy válasz alapján */
export function ratingFor(outcome: Outcome, reactionMs: number | null, t: Thresholds): Grade {
  switch (outcome) {
    case 'wrong':
    case 'timeout':
      return Rating.Again
    case 'slow':
    case 'late':
      return Rating.Hard
    case 'ok':
      return reactionMs !== null && reactionMs <= t.okMs / 2 ? Rating.Easy : Rating.Good
  }
}

export function compareCodes(a: string, b: string): number {
  const [ab, an] = a.split('/').map(Number)
  const [bb, bn] = b.split('/').map(Number)
  return ab - bb || an - bn
}
