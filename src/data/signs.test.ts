import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { SignType } from '../domain/questions'
import type { SituationKind } from '../domain/types'
import { GROUP_LABEL, parseTrafficSign, SIGN_BY_CODE, SIGNS, signCodeFor, signForSituation, signsForScene, speedSignCode } from './signs'

const PUBLIC = join(import.meta.dirname, '..', '..', 'public', 'signs')

describe('letöltött KRESZ táblák', () => {
  it('minden jegyzékbeli táblához van képfájl (PNG, vagy a kiegészítő táblás változatnál SVG)', () => {
    for (const s of SIGNS) {
      const path = join(PUBLIC, s.file)
      expect(existsSync(path), s.file).toBe(true)
      const head = readFileSync(path).subarray(0, 5).toString()
      if (s.file.endsWith('.svg')) expect(head, s.file).toBe('<svg ')
      else expect(head.slice(1, 4), s.file).toBe('PNG')
    }
  })

  it('a teljes, jelenleg érvényes KRESZ-táblakészlet: minden csoport szerepel, régi változat nincs', () => {
    expect(SIGNS.length).toBeGreaterThanOrEqual(220)
    for (const g of Object.keys(GROUP_LABEL)) expect(SIGNS.some((s) => s.group === g), g).toBe(true)
    for (const s of SIGNS) expect(`${s.code} ${s.source}`).not.toMatch(/historic|_\(old\)/i)
  })

  it('minden tábla közkincs, és van forrása', () => {
    for (const s of SIGNS) {
      expect(s.license.toLowerCase()).toContain('public domain')
      // Commons-forrás(ok), vagy a hivatalos KRESZ-szöveg ábrája ott, ahol a Commonson nincs kép
      for (const src of s.source.split(' ')) expect(src).toMatch(/^(https:\/\/commons\.wikimedia\.org\/wiki\/File:\S+|https:\/\/njt\.hu\/jogszabaly\/\S+)$/)
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

describe('OSM tábla-címkék értelmezése', () => {
  it('a különféle írásmódokat a saját kódjainkra fordítja', () => {
    expect(parseTrafficSign({ traffic_sign: 'HU:B-001' })).toEqual(['B-001'])
    expect(parseTrafficSign({ traffic_sign: 'HU:B001' })).toEqual(['B-001'])
    expect(parseTrafficSign({ traffic_sign: 'HU:C033[70]' })).toEqual(['C-033-70'])
    expect(parseTrafficSign({ traffic_sign: 'maxspeed', maxspeed: '40' })).toEqual(['C-033-40'])
    expect(parseTrafficSign({ traffic_sign: 'stop' })).toEqual(['B-002'])
    expect(parseTrafficSign({ traffic_sign: 'HU:D014;HU:E038' })).toEqual(['D-014', 'E-038'])
    expect(parseTrafficSign({ traffic_sign: 'city_limit' })).toEqual(['city_limit'])
  })

  it('az ismeretlen vagy nálunk nem szereplő táblát kihagyja', () => {
    expect(parseTrafficSign({ traffic_sign: 'DE:250' })).toEqual([])
    expect(parseTrafficSign({ traffic_sign: 'HU:A-099' })).toEqual([])
    expect(parseTrafficSign({ traffic_sign: 'Lovaskocsi' })).toEqual([])
    expect(parseTrafficSign(undefined)).toEqual([])
  })

  it('vasúti átjárónál a figyelmeztető és az előjelző tábla a közeledés elején áll', () => {
    const s = signsForScene({ layout: 'road', turn: 'straight', mySign: 'rail', cars: [], rail: { barrier: true, light: 'red_flash' } })
    expect(s.approach).toEqual(['A-038', 'A-045'])
    expect(s.mine).toEqual(['A-041'])
  })

  it('a valós további táblák a fő tábla alá kerülnek, az egyirányú tábla a célútra', () => {
    const s = signsForScene({ layout: 'junction', turn: 'left', mySign: 'give_way', cars: [], extraSigns: ['C-033-30', 'E-012', 'B-001'] })
    expect(s.mine).toEqual(['B-001', 'C-033-30'])
    expect(s.target).toEqual(['E-012'])
  })
})
