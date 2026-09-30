import { describe, expect, it } from 'vitest'
import { expectedActions, scoreActions, type ActionEvent, type ActionKind } from './actions'

const ev = (...list: Array<[ActionKind, number]>): ActionEvent[] => list.map(([kind, t]) => ({ kind, t }))
const LEFT = { indicator: 'left' as const, brake: true, turning: true }

describe('elvárt mozdulatok', () => {
  it('kanyarodáskor index a kanyar irányába és fékezés, egyenesen STOP-nál csak fékezés', () => {
    expect(expectedActions({ kind: 'give_way', turn: 'left' })).toEqual({ indicator: 'left', brake: true, turning: true })
    expect(expectedActions({ kind: 'stop', turn: 'straight' })).toMatchObject({ indicator: null, brake: true, brakeCode: '8/26' })
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
    const stop = expectedActions({ kind: 'stop', turn: 'straight' })!
    expect(scoreActions(stop, ev(['mirror', 500]), 5000).codes).toEqual(['8/26'])
    expect(scoreActions(stop, ev(['brake', 2000]), 5000).outcome).toBe('ok')
  })
})

describe('körforgalom, vasúti átjáró, megálló, akadály', () => {
  it('körforgalom első kijáratánál már behajtás előtt jobbra kell jelezni', () => {
    const exp = expectedActions({ kind: 'roundabout', turn: 'straight', roundabout: { exit: 1, exits: 4, lanes: 1, turn: 'right' } })!
    expect(exp).toMatchObject({ indicator: 'right', turning: true })
    expect(scoreActions(exp, ev(['mirror', 300], ['indicator_right', 800], ['brake', 1500]), 5000).outcome).toBe('ok')
    expect(scoreActions(exp, ev(['mirror', 300], ['brake', 1500]), 5000).codes).toEqual(['8/6'])
  })

  it('körforgalom többi kijáratánál behajtáskor az index megtévesztő', () => {
    const exp = expectedActions({ kind: 'roundabout', turn: 'straight', roundabout: { exit: 2, exits: 4, lanes: 1, turn: 'straight' } })!
    expect(scoreActions(exp, ev(['brake', 1500]), 5000).outcome).toBe('ok')
    expect(scoreActions(exp, ev(['indicator_left', 800], ['brake', 1500]), 5000).codes).toEqual(['8/30'])
    expect(scoreActions(exp, ev(), 5000).codes).toEqual(['5/4'])
  })

  it('vasúti átjárónál lassítás nélkül 8/28', () => {
    const exp = expectedActions({ kind: 'rail_crossing', turn: 'straight' })!
    expect(scoreActions(exp, ev(), 5000)).toMatchObject({ outcome: 'wrong', codes: ['8/28'] })
  })

  it('villamos mögött megállás, induló busz elengedése', () => {
    const tram = expectedActions({ kind: 'tram_stop', turn: 'straight' }, { layout: 'road', turn: 'straight', cars: [], transit: { kind: 'tram', island: false, state: 'doors_open' } })!
    expect(scoreActions(tram, ev(), 5000).codes).toEqual(['8/26'])
    const bus = expectedActions({ kind: 'bus_stop', turn: 'straight' }, { layout: 'road', turn: 'straight', cars: [], transit: { kind: 'bus', island: false, state: 'departing' } })!
    expect(scoreActions(bus, ev(), 5000).codes).toEqual(['8/24'])
  })

  it('akadály kikerülésekor tükör és balra index kell, fékezés nem kötelező', () => {
    const exp = expectedActions({ kind: 'hazard', turn: 'straight' }, { layout: 'road', turn: 'straight', cars: [], hazard: 'parked_clear' })!
    expect(scoreActions(exp, ev(['mirror', 300], ['indicator_left', 800]), 5000).outcome).toBe('ok')
    expect(scoreActions(exp, ev(['indicator_left', 800]), 5000).codes).toEqual(['4/5'])
    expect(scoreActions(exp, ev(['mirror', 300]), 5000).codes).toEqual(['8/6'])
  })

  it('akadály mögött várakozva az index nem számít, a lassítás igen', () => {
    const exp = expectedActions({ kind: 'hazard', turn: 'straight' }, { layout: 'road', turn: 'straight', cars: [], hazard: 'parked_oncoming' })!
    expect(scoreActions(exp, ev(['indicator_left', 500], ['brake', 900]), 5000).outcome).toBe('ok')
    expect(scoreActions(exp, ev(), 5000).codes).toEqual(['8/24'])
  })

  it('mentőautónál nincs mozdulat-gyakorlás (a kérdés kéri számon)', () => {
    expect(expectedActions({ kind: 'hazard', turn: 'straight' }, { layout: 'road', turn: 'straight', cars: [], hazard: 'emergency' })).toBeNull()
  })
})
