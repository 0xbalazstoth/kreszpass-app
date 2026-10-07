import { describe, expect, it } from 'vitest'
import { checkLesson } from '../faults/testing'
import { maneuverById } from '../maneuvers'
import { SITUATIONS } from './index'

describe('forgalmi helyzetek', () => {
  it('mind a 20 helyzet megvan, csoportonként', () => {
    expect(SITUATIONS).toHaveLength(20)
    expect(new Set(SITUATIONS.map((s) => s.group)).size).toBe(4)
  })

  it('egyedi azonosítók, és egyik sem ütközik egy manőver azonosítójával', () => {
    const ids = SITUATIONS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(maneuverById(id)).toBeUndefined()
  })

  for (const s of SITUATIONS) {
    describe(s.id, () => {
      it('csak semleges lépésekből áll', () => {
        for (const st of s.steps) expect(st.phase).toBe('step')
      })
      checkLesson(s, { safePhases: () => true })
    })
  }
})
