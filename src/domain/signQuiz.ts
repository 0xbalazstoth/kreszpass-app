import { Rating, type Grade } from 'ts-fsrs'
import type { SignInfo } from '../data/signs'
import { shuffle } from './questions'

type Rng = () => number

export interface SignQuestion {
  target: SignInfo
  /** Jelentések (táblanevek), keverve */
  options: string[]
  correct: number
}

/**
 * Egy tábla és három zavaró jelentés. A zavarók lehetőleg ugyanabból a csoportból jönnek
 * (pl. sebességkorlátozásnál más sebességek), hogy ne a tábla alakjából lehessen kitalálni.
 */
export function buildSignQuestion(target: SignInfo, pool: SignInfo[], rng: Rng = Math.random, count = 4): SignQuestion {
  const others = pool.filter((s) => s.code !== target.code && s.name !== target.name)
  const same = shuffle(
    others.filter((s) => s.group === target.group),
    rng,
  )
  const rest = shuffle(
    others.filter((s) => s.group !== target.group),
    rng,
  )
  const names: string[] = []
  for (const s of [...same, ...rest]) {
    if (names.length >= count - 1) break
    if (!names.includes(s.name)) names.push(s.name)
  }
  const options = shuffle([target.name, ...names], rng)
  return { target, options, correct: options.indexOf(target.name) }
}

/** A gyakorlás táblái: először az esedékes ismétlések, aztán véletlenszerűen a többi */
export function pickDrillSigns(pool: SignInfo[], dueCodes: string[], count: number, rng: Rng = Math.random): SignInfo[] {
  const byCode = new Map(pool.map((s) => [s.code, s]))
  const due = dueCodes.flatMap((c) => (byCode.has(c) ? [byCode.get(c)!] : []))
  const dueSet = new Set(due.map((s) => s.code))
  const rest = shuffle(
    pool.filter((s) => !dueSet.has(s.code)),
    rng,
  )
  return [...due, ...rest].slice(0, count)
}

/** Ismétlési értékelés: rossz → újra, gyors helyes → könnyű */
export function signRating(correct: boolean, reactionMs: number | null): Grade {
  if (!correct || reactionMs === null) return Rating.Again
  if (reactionMs <= 1500) return Rating.Easy
  if (reactionMs <= 3500) return Rating.Good
  return Rating.Hard
}
