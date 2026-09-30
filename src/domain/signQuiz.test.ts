import { Rating } from 'ts-fsrs'
import { describe, expect, it } from 'vitest'
import { SIGNS, SIGN_BY_CODE } from '../data/signs'
import { buildSignQuestion, pickDrillSigns, signRating } from './signQuiz'

function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32
    return s / 2 ** 32
  }
}

describe('táblafelismerő kérdés', () => {
  it('minden táblára 4 egyedi válasz, pontosan egy helyes', () => {
    const rng = seeded(1)
    for (const target of SIGNS) {
      const q = buildSignQuestion(target, SIGNS, rng)
      expect(q.options).toHaveLength(4)
      expect(new Set(q.options).size).toBe(4)
      expect(q.options[q.correct]).toBe(target.name)
    }
  })

  it('a zavaró válaszok lehetőleg ugyanabból a csoportból jönnek', () => {
    const target = SIGN_BY_CODE.get('C-033-50')!
    const q = buildSignQuestion(target, SIGNS, seeded(2))
    const groups = q.options.map((name) => SIGNS.find((s) => s.name === name)!.group)
    expect(groups.every((g) => g === 'tilalmi')).toBe(true)
  })

  it('kis készletből is kitölti a lehetőségeket más csoportokból', () => {
    const pool = ['B-001', 'B-002', 'A-020', 'E-038'].map((c) => SIGN_BY_CODE.get(c)!)
    const q = buildSignQuestion(pool[0], pool, seeded(3))
    expect(q.options).toHaveLength(4)
  })
})

describe('táblák kiválasztása', () => {
  it('az esedékes táblák jönnek előbb, ismétlés nélkül', () => {
    const list = pickDrillSigns(SIGNS, ['E-038', 'B-002', 'nincs-ilyen'], 10, seeded(4))
    expect(list.slice(0, 2).map((s) => s.code)).toEqual(['E-038', 'B-002'])
    expect(new Set(list.map((s) => s.code)).size).toBe(10)
  })
})

describe('ismétlési értékelés', () => {
  it('rossz vagy lejárt → újra, gyors → könnyű, lassú → nehéz', () => {
    expect(signRating(false, 500)).toBe(Rating.Again)
    expect(signRating(true, null)).toBe(Rating.Again)
    expect(signRating(true, 900)).toBe(Rating.Easy)
    expect(signRating(true, 2500)).toBe(Rating.Good)
    expect(signRating(true, 5000)).toBe(Rating.Hard)
  })
})
