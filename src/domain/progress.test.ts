import { describe, expect, it } from 'vitest'
import { attemptsBySituation, routeReadiness, situationHealth, weakest } from './progress'
import type { Attempt, Outcome } from './types'

let t = 0
const a = (situationId: string, outcome: Outcome): Attempt => ({
  situationId,
  promptId: 'p',
  reactionMs: 1000,
  chosen: 0,
  outcome,
  codes: [],
  at: ++t,
})

describe('helyzet állapota', () => {
  it('válasz nélkül új', () => {
    expect(situationHealth([])).toEqual({ status: 'new', score: 0, attempts: 0 })
  })

  it('csak a legutóbbi 3 válasz számít: a javulás látszik', () => {
    const list = [a('s', 'wrong'), a('s', 'timeout'), a('s', 'ok'), a('s', 'ok'), a('s', 'ok')]
    expect(situationHealth(list)).toMatchObject({ status: 'good', score: 1, attempts: 5 })
  })

  it('késések és hibák szerint bizonytalan vagy gyenge', () => {
    expect(situationHealth([a('s', 'ok'), a('s', 'late'), a('s', 'slow')]).status).toBe('meh')
    expect(situationHealth([a('s', 'ok'), a('s', 'wrong'), a('s', 'timeout')]).status).toBe('bad')
  })
})

describe('útvonal felkészültsége', () => {
  const sits = [
    { id: 'a', d: 100 },
    { id: 'b', d: 200 },
    { id: 'c', d: 300 },
    { id: 'd', d: 400 },
  ]
  const by = attemptsBySituation([a('a', 'ok'), a('b', 'wrong'), a('c', 'late')])

  it('átlagolja a pontszámokat, a gyakorlatlan 0', () => {
    const r = routeReadiness(sits, by)
    expect(r.percent).toBe(Math.round(((1 + 0 + 0.7 + 0) / 4) * 100))
    expect(r.counts).toEqual({ new: 1, bad: 1, meh: 1, good: 1 })
  })

  it('a leggyengébbek: hibás, bizonytalan, új sorrendben válogat, útvonal-sorrendben adja vissza', () => {
    expect(weakest(sits, by, 2).map((s) => s.id)).toEqual(['b', 'c'])
    expect(weakest(sits, by, 10).map((s) => s.id)).toEqual(['b', 'c', 'd'])
  })
})
