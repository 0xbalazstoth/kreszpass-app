import { describe, expect, it } from 'vitest'
import { EVAL_CODES } from '../evalCodes'
import { FAULT_LESSONS, lessonByCode } from './index'
import { checkLesson } from './testing'

const PHASE_ORDER = { setup: 0, wrong: 1, right: 2, step: 0 }

describe('hibakód-leckék', () => {
  it('az 1–6. és a 8. blokk minden kódjához pontosan egy lecke tartozik', () => {
    const want = Object.values(EVAL_CODES)
      .filter((c) => c.block !== 7)
      .map((c) => c.code)
    const missing = want.filter((c) => !lessonByCode(c))
    expect(missing).toEqual([])
    expect(FAULT_LESSONS.map((l) => l.code)).toEqual(want)
  })

  for (const lesson of FAULT_LESSONS) {
    describe(lesson.code, () => {
      it('létező kód; helyzet → hibás → helyes sorrend, mindegyikből legalább egy lépés', () => {
        expect(EVAL_CODES[lesson.code]).toBeDefined()
        const phases = lesson.steps.map((s) => PHASE_ORDER[s.phase])
        expect([...phases].sort((a, b) => a - b)).toEqual(phases)
        for (const p of [0, 1, 2]) expect(phases).toContain(p)
      })
      // A hibás ágban az úttest elhagyása (pl. 8/19) maga a bemutatott hiba
      checkLesson(lesson, { safePhases: (s) => s.phase !== 'wrong' })
    })
  }
})
