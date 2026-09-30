import { describe, expect, it } from 'vitest'
import { expectedActions, scoreActions, type ActionEvent, type ActionKind } from './actions'

const ev = (...list: Array<[ActionKind, number]>): ActionEvent[] => list.map(([kind, t]) => ({ kind, t }))
const LEFT = { indicator: 'left' as const, brake: true }

describe('elvárt mozdulatok', () => {
  it('kanyarodáskor index a kanyar irányába és fékezés, egyenesen STOP-nál csak fékezés', () => {
    expect(expectedActions({ kind: 'give_way', turn: 'left' })).toEqual({ indicator: 'left', brake: true })
    expect(expectedActions({ kind: 'stop', turn: 'straight' })).toEqual({ indicator: null, brake: true })
    expect(expectedActions({ kind: 'priority', turn: 'straight' })).toEqual({ indicator: null, brake: false })
  })

  it('zebránál, sebességtáblánál nincs mozdulat-gyakorlás', () => {
    expect(expectedActions({ kind: 'crossing', turn: 'straight' })).toBeNull()
    expect(expectedActions({ kind: 'speed_change', turn: 'straight' })).toBeNull()
  })
})

describe('mozdulatok értékelése', () => {
  it('tükör → index → fék időben: hibátlan', () => {
    expect(scoreActions(LEFT, ev(['mirror', 500], ['indicator_left', 900], ['brake', 1800]), 5000)).toMatchObject({ outcome: 'ok', codes: [] })
  })

  it('index nélkül 8/6 (bukás), rossz irányba 8/30', () => {
    expect(scoreActions(LEFT, ev(['mirror', 500], ['brake', 1800]), 5000)).toMatchObject({ outcome: 'wrong', codes: ['8/6'] })
    expect(scoreActions(LEFT, ev(['mirror', 500], ['indicator_right', 900], ['brake', 1800]), 5000).codes).toEqual(['8/30'])
  })

  it('tükör nélkül vagy index után nézve 4/5, fék az index előtt 4/4', () => {
    expect(scoreActions(LEFT, ev(['indicator_left', 900], ['brake', 1800]), 5000)).toMatchObject({ outcome: 'late', codes: ['4/5'] })
    expect(scoreActions(LEFT, ev(['indicator_left', 900], ['mirror', 1000], ['brake', 1800]), 5000).codes).toEqual(['4/5'])
    expect(scoreActions(LEFT, ev(['mirror', 300], ['brake', 600], ['indicator_left', 900]), 5000).codes).toEqual(['4/4'])
  })

  it('a közeledés végén adott index késői (6/8)', () => {
    expect(scoreActions(LEFT, ev(['mirror', 300], ['indicator_left', 4200], ['brake', 4500]), 5000).codes).toEqual(['6/8'])
  })

  it('egyenesen haladva az index megtévesztő, STOP-nál a fék kötelező', () => {
    expect(scoreActions({ indicator: null, brake: false }, ev(['indicator_right', 500]), 5000).codes).toEqual(['8/30'])
    expect(scoreActions({ indicator: null, brake: true }, ev(['mirror', 500]), 5000).codes).toEqual(['8/26'])
    expect(scoreActions({ indicator: null, brake: true }, ev(['brake', 2000]), 5000).outcome).toBe('ok')
  })
})
