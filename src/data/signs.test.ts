import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { SignType } from '../domain/questions'
import type { SituationKind } from '../domain/types'
import { SIGN_BY_CODE, SIGNS, signCodeFor, signForSituation, signsForScene, speedSignCode } from './signs'

const PUBLIC = join(import.meta.dirname, '..', '..', 'public', 'signs')

describe('letöltött KRESZ táblák', () => {
  it('minden jegyzékbeli táblához van PNG fájl', () => {
    expect(SIGNS.length).toBeGreaterThanOrEqual(60)
    for (const s of SIGNS) {
      const path = join(PUBLIC, s.file)
      expect(existsSync(path), s.file).toBe(true)
      expect(readFileSync(path).subarray(1, 4).toString(), s.file).toBe('PNG')
    }
  })

  it('minden tábla közkincs, és van forrása', () => {
    for (const s of SIGNS) {
      expect(s.license.toLowerCase()).toContain('public domain')
      expect(s.source).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/)
    }
  })

  it('a táblanevek egyediek (a gyorsteszt ezekből kérdez)', () => {
    expect(new Set(SIGNS.map((s) => s.name)).size).toBe(SIGNS.length)
  })
})

describe('tábla hozzárendelések', () => {
  it('minden vázlat-táblatípus létező táblára mutat', () => {
    const types: SignType[] = ['stop', 'give_way', 'priority_road', 'speed', 'crossing', 'roundabout']
    for (const t of types) expect(SIGN_BY_CODE.has(signCodeFor(t, 30)), t).toBe(true)
  })

  it('minden helyzettípusnak van létező jelképe', () => {
    const kinds: SituationKind[] = ['stop', 'give_way', 'priority', 'equal', 'signals', 'roundabout', 'crossing', 'speed_change']
    for (const kind of kinds) expect(SIGN_BY_CODE.has(signForSituation({ kind, speedTo: 40 })), kind).toBe(true)
    expect(signForSituation({ kind: 'speed_change' })).toBe('C-043')
  })

  it('a sebességhez a legközelebbi táblát adja', () => {
    expect(speedSignCode(30)).toBe('C-033-30')
    expect(speedSignCode(130)).toBe('C-033-130')
    expect(speedSignCode(35)).toMatch(/^C-033-(30|40)$/)
    expect(speedSignCode(200)).toBe('C-033-130')
  })

  it('körforgalomnál elsőbbségadás a bejáratnál, előtte figyelmeztető tábla', () => {
    const signs = signsForScene({ layout: 'roundabout', turn: 'straight', mySign: 'roundabout', cars: [] })
    expect(signs.mine).toEqual(['B-001'])
    expect(signs.approach).toEqual(['A-056'])
  })

  it('főútvonalon a keresztező utakon elsőbbségadás kötelező', () => {
    const signs = signsForScene({ layout: 'junction', turn: 'straight', mySign: 'priority_road', crossSign: 'give_way', cars: [] })
    expect(signs.mine).toEqual(['B-003'])
    expect(signs.cross).toEqual(['B-001'])
  })
})
