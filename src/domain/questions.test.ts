import { describe, expect, it } from 'vitest'
import { EVAL_CODES } from './evalCodes'
import { allPromptVariants, buildPrompts } from './questions'
import type { Situation, SituationKind, Turn } from './types'

const KINDS: SituationKind[] = ['stop', 'give_way', 'priority', 'equal', 'signals', 'roundabout', 'crossing', 'speed_change', 'rail_crossing', 'tram_stop', 'bus_stop', 'hazard']
const TURNS: Turn[] = ['straight', 'left', 'right']

const sit = (kind: SituationKind, turn: Turn): Situation => ({
  id: `${kind}-${turn}`,
  routeId: 'r',
  d: 100,
  lng: 19,
  lat: 47.5,
  bearing: 90,
  kind,
  turn,
  speedFrom: 50,
  speedTo: 30,
  needsReview: false,
  source: 'manual',
})

/** Determinisztikus álvéletlen generátor */
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32
    return s / 2 ** 32
  }
}

describe('kérdéssablonok', () => {
  for (const kind of KINDS)
    for (const turn of TURNS) {
      it(`${kind} / ${turn}: minden változatnak pontosan egy helyes válasza és érvényes kódjai vannak`, () => {
        const variants = allPromptVariants(sit(kind, turn))
        expect(variants.length).toBeGreaterThan(0)
        for (const p of variants) {
          expect(p.options.filter((o) => o.correct)).toHaveLength(1)
          expect(p.options.length).toBeGreaterThanOrEqual(3)
          expect(EVAL_CODES[p.timeoutCode]).toBeDefined()
          for (const o of p.options) {
            if (!o.correct) expect(EVAL_CODES[o.code!], `${p.id}: ${o.code}`).toBeDefined()
            if (!o.correct) expect(EVAL_CODES[o.code!].simulable, `${p.id}: ${o.code}`).toBe(true)
          }
          expect(new Set(p.options.map((o) => o.text)).size).toBe(p.options.length)
        }
      })
    }

  it('kanyarodáskor két kérdés jön: először a besorolás/irányjelzés', () => {
    const prompts = buildPrompts(sit('equal', 'left'), seeded(1))
    expect(prompts).toHaveLength(2)
    expect(prompts[0].id.startsWith('turn:')).toBe(true)
  })

  it('egyenesen haladva egy kérdés jön', () => {
    expect(buildPrompts(sit('stop', 'straight'), seeded(2))).toHaveLength(1)
  })

  it('körforgalomnál nincs külön kanyarodási kérdés', () => {
    expect(buildPrompts(sit('roundabout', 'left'), seeded(3)).every((p) => !p.id.startsWith('turn:'))).toBe(true)
  })

  it('körforgalomnál előbb a behajtás, majd a kihajtás jön, a valós kijáratszámmal', () => {
    const s = { ...sit('roundabout', 'straight'), roundabout: { exit: 3, exits: 4, lanes: 1, turn: 'left' as Turn } }
    for (let seed = 1; seed < 8; seed++) {
      const [entry, exit] = buildPrompts(s, seeded(seed))
      expect(entry.scene.roundabout).toMatchObject({ phase: 'entry', exit: 3, exits: 4 })
      expect(exit.scene.roundabout).toMatchObject({ phase: 'exit', exit: 3 })
    }
    expect(allPromptVariants(s).some((p) => p.text.includes('a 3. kijáraton'))).toBe(true)
  })

  it('első kijáratnál már behajtáskor jelezni kell, egyébként behajtáskor nem', () => {
    const first = allPromptVariants({ ...sit('roundabout', 'straight'), roundabout: { exit: 1, exits: 4, lanes: 1, turn: 'right' } })
    expect(first.map((p) => p.id)).toContain('roundabout:entry_signal_first')
    const second = allPromptVariants({ ...sit('roundabout', 'straight'), roundabout: { exit: 2, exits: 4, lanes: 1, turn: 'straight' } })
    const sig = second.find((p) => p.id === 'roundabout:entry_signal')!
    expect(sig.options.find((o) => o.correct)!.text).toMatch(/Behajtáskor nem jelzek/)
  })

  it('sávválasztás csak kétsávos körforgalomnál, a kijárat szerint', () => {
    const one = allPromptVariants({ ...sit('roundabout', 'straight'), roundabout: { exit: 3, exits: 4, lanes: 1, turn: 'left' } })
    expect(one.some((p) => p.id.includes('lane'))).toBe(false)
    const two = allPromptVariants({ ...sit('roundabout', 'straight'), roundabout: { exit: 3, exits: 4, lanes: 2, turn: 'left' } })
    expect(two.find((p) => p.id === 'roundabout:lane')!.options.find((o) => o.correct)!.text).toMatch(/belső/)
    expect(two.some((p) => p.id === 'roundabout:exit_lane')).toBe(true)
  })

  it('vasúti átjáró: az adatoknak megfelelő változatok', () => {
    const ids = (rail: { barrier: boolean; lights: boolean }) => allPromptVariants({ ...sit('rail_crossing', 'straight'), rail }).map((p) => p.id)
    expect(ids({ barrier: false, lights: false })).toEqual(expect.arrayContaining(['rail:no_signal', 'rail:train_visible', 'rail:queue', 'rail:no_overtake']))
    expect(ids({ barrier: true, lights: true })).toEqual(expect.arrayContaining(['rail:barrier', 'rail:after_lift', 'rail:red_flash']))
    expect(ids({ barrier: true, lights: true })).not.toContain('rail:train_visible')
  })

  it('villamosmegálló: járdasziget szerint', () => {
    const ids = (island?: boolean) => allPromptVariants({ ...sit('tram_stop', 'straight'), transit: { kind: 'tram', island } }).map((p) => p.id)
    expect(ids(false)).toEqual(['tram:doors_open', 'tram:arriving'])
    expect(ids(true)).toEqual(['tram:island'])
    expect(ids(undefined)).toHaveLength(3)
  })

  it('váratlan helyzetből minden fajta előfordul, a jelenet a fajtát mutatja', () => {
    const variants = allPromptVariants(sit('hazard', 'straight'))
    expect(new Set(variants.map((p) => p.scene.hazard)).size).toBe(7)
    for (const p of variants) expect(p.id).toBe(`hazard:${p.scene.hazard}`)
  })

  it('sebességkorlát nélkül nincs sebességkérdés', () => {
    expect(buildPrompts({ ...sit('speed_change', 'straight'), speedTo: undefined })).toHaveLength(0)
  })

  it('a sebességkérdésben a magasabb érték gyorshajtás, az alacsonyabb indokolatlan lassúság', () => {
    const [p] = buildPrompts(sit('speed_change', 'straight'), seeded(4))
    for (const o of p.options) {
      const v = parseInt(o.text, 10)
      if (v > 30) expect(o.code).toBe('8/16')
      if (v < 30) expect(o.code).toBe('5/5')
      if (v === 30) expect(o.correct).toBe(true)
    }
  })

  it('a válaszok sorrendje keveredik', () => {
    const orders = new Set<string>()
    const rng = seeded(5)
    for (let i = 0; i < 20; i++) orders.add(buildPrompts(sit('stop', 'straight'), rng)[0].options.map((o) => o.text).join('|'))
    expect(orders.size).toBeGreaterThan(1)
  })
})

describe('kanyarodási kérdés a helyzet táblájával', () => {
  it('elsőbbségadás kötelező helyzetnél a kanyarodási kérdés vázlatán is ott a tábla', () => {
    const turn = allPromptVariants(sit('give_way', 'left')).filter((p) => p.id.startsWith('turn:'))
    expect(turn.length).toBeGreaterThan(0)
    for (const p of turn) expect(p.scene.mySign).toBe('give_way')
  })
  it('lámpás helyzetnél a kanyarodási kérdésen is van lámpa', () => {
    const turn = allPromptVariants(sit('signals', 'right')).filter((p) => p.id.startsWith('turn:'))
    for (const p of turn) expect(p.scene.light).toBe('green')
  })
})
