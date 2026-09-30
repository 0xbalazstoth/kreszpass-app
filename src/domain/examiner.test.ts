import { describe, expect, it } from 'vitest'
import { examinerLine } from './examiner'

describe('vizsgabiztos utasításai', () => {
  it('kanyarodáskor az irányt mondja, a lámpát megnevezi', () => {
    expect(examinerLine({ kind: 'give_way', turn: 'left' })).toBe('A következő kereszteződésnél forduljon balra.')
    expect(examinerLine({ kind: 'signals', turn: 'right' })).toBe('A jelzőlámpás kereszteződésnél forduljon jobbra.')
  })

  it('a táblát nem árulja el: egyenesen csak annyit, hogy tovább', () => {
    expect(examinerLine({ kind: 'stop', turn: 'straight' })).toBe('A kereszteződésben haladjon tovább egyenesen.')
    expect(examinerLine({ kind: 'stop', turn: 'straight' })).not.toMatch(/STOP|Állj/i)
  })

  it('zebránál, sebességtáblánál, vasúti átjárónál nem szól', () => {
    expect(examinerLine({ kind: 'crossing', turn: 'straight' })).toBeNull()
    expect(examinerLine({ kind: 'speed_change', turn: 'straight' })).toBeNull()
    expect(examinerLine({ kind: 'rail_crossing', turn: 'straight' })).toBeNull()
    expect(examinerLine({ kind: 'priority', turn: 'straight' })).toBeNull()
  })

  it('az első helyzetnél az indulásra is felszólít', () => {
    expect(examinerLine({ kind: 'crossing', turn: 'straight' }, true)).toBe('Kérem, induljon el, ha biztonságos.')
    expect(examinerLine({ kind: 'roundabout', turn: 'straight' }, true)).toBe('Kérem, induljon el, ha biztonságos. A következő körforgalomba hajtson be.')
  })

  it('ismert kijáratnál megmondja, hányadikon kell kihajtani', () => {
    expect(examinerLine({ kind: 'roundabout', turn: 'straight', roundabout: { exit: 2, exits: 4, lanes: 1, turn: 'straight' } })).toBe(
      'A körforgalomban a második kijáraton hajtson ki.',
    )
    expect(examinerLine({ kind: 'roundabout', turn: 'straight', roundabout: { exit: 7, exits: 8, lanes: 1, turn: 'left' } })).toMatch(/a 7\. kijáraton/)
  })

  it('megállónál, váratlan helyzetnél nem szól', () => {
    for (const kind of ['tram_stop', 'bus_stop', 'hazard'] as const) expect(examinerLine({ kind, turn: 'straight' })).toBeNull()
  })
})
