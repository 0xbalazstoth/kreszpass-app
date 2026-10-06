import { describe, expect, it } from 'vitest'
import { EVAL_CODES } from '../evalCodes'
import { pathLength, polygonsOverlap, rectCorners, wheelRects } from '../maneuvers/geometry'
import { bodyCorners, bodyGap } from './bodies'
import { FAULT_LESSONS, lessonByCode } from './index'
import { frameAt, stepMs, stepStates } from './timeline'
import type { FaultLesson, FaultStep, Track } from './types'

const PHASE_ORDER = { setup: 0, wrong: 1, right: 2 }

function tracksOf(step: FaultStep): Track<unknown>[] {
  return [
    ...Object.values(step.controls ?? {}),
    ...Object.values(step.signals ?? {}),
    ...Object.values(step.blinks ?? {}),
    ...(step.look ? [step.look] : []),
    ...Object.values(step.moves ?? {}).flatMap((m) => (m.profile ? [m.profile] : [])),
  ] as Track<unknown>[]
}

/** Mintavétel a lépésen belül */
const TS = Array.from({ length: 51 }, (_, i) => i / 50)

function onAsphalt(lesson: FaultLesson, x: number, z: number): boolean {
  return lesson.world.asphalt.some((r) => {
    const poly = rectCorners(r.x, r.z, r.w, r.d, -(r.rotY ?? 0))
    return polygonsOverlap(poly, [
      [x - 0.01, z - 0.01],
      [x + 0.01, z - 0.01],
      [x + 0.01, z + 0.01],
      [x - 0.01, z + 0.01],
    ])
  })
}

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
      it('a szereplők egyik lépésben sem mennek át egymáson (a hibás ágban sem)', () => {
        const states = stepStates(lesson)
        lesson.steps.forEach((s, i) => {
          for (const t of TS) {
            const f = frameAt(lesson, states[i], s, t)
            for (let x = 0; x < lesson.actors.length; x++)
              for (let y = x + 1; y < lesson.actors.length; y++) {
                const A = lesson.actors[x]
                const B = lesson.actors[y]
                const hit = polygonsOverlap(bodyCorners(A.kind, f.actors[A.id].pose), bodyCorners(B.kind, f.actors[B.id].pose))
                expect(hit, `${s.title} t=${t}: ${A.id} és ${B.id} átfedik egymást`).toBe(false)
              }
          }
        })
      })

      const ids = new Set(lesson.actors.map((a) => a.id))
      const lights = new Set((lesson.world.lights ?? []).map((l) => l.id))

      it('létező kód, egy saját autó, egyedi szereplők', () => {
        expect(EVAL_CODES[lesson.code]).toBeDefined()
        expect(lesson.actors.filter((a) => a.kind === 'own')).toHaveLength(1)
        expect(ids.size).toBe(lesson.actors.length)
      })

      it('helyzet → hibás → helyes sorrend, mindegyikből legalább egy lépés, a magyarázat legalább két mondat', () => {
        const phases = lesson.steps.map((s) => PHASE_ORDER[s.phase])
        expect([...phases].sort((a, b) => a - b)).toEqual(phases)
        for (const p of [0, 1, 2]) expect(phases).toContain(p)
        for (const s of lesson.steps) expect(s.how.length, s.title).toBeGreaterThanOrEqual(2)
      })

      it('a sávok időrendben vannak, 0 és 1 között', () => {
        for (const s of lesson.steps)
          for (const tr of tracksOf(s)) {
            expect(tr.length, s.title).toBeGreaterThan(0)
            tr.forEach(([t], i) => {
              expect(t, s.title).toBeGreaterThanOrEqual(0)
              expect(t, s.title).toBeLessThanOrEqual(1 + 1e-9)
              if (i) expect(t, s.title).toBeGreaterThanOrEqual(tr[i - 1][0])
            })
          }
      })

      it('a hivatkozott szereplők és lámpák léteznek', () => {
        for (const s of lesson.steps) {
          for (const id of [...Object.keys(s.moves ?? {}), ...Object.keys(s.blinks ?? {})]) expect(ids.has(id), `${s.title}: ${id}`).toBe(true)
          for (const id of Object.keys(s.signals ?? {})) expect(lights.has(id), `${s.title}: ${id}`).toBe(true)
          for (const m of s.marks ?? []) if (m.kind === 'gap') expect(ids.has(m.a) && ids.has(m.b), s.title).toBe(true)
        }
      })

      it('a sebességmérő a kocsi valódi mozgását mutatja', () => {
        const states = stepStates(lesson)
        const own = lesson.actors.find((a) => a.kind === 'own')!
        lesson.steps.forEach((s, i) => {
          const move = s.moves?.[own.id]
          if (!move || !s.controls?.speed) return
          const ms = stepMs(s)
          const len = pathLength(move.path)
          for (let t = 0.05; t < 0.95; t += 0.05) {
            const a = frameAt(lesson, states[i], s, t - 0.01).actors[own.id].pose
            const b = frameAt(lesson, states[i], s, t + 0.01).actors[own.id].pose
            const real = (Math.hypot(b.x - a.x, b.z - a.z) / ((0.02 * ms) / 1000)) * 3.6
            const shown = frameAt(lesson, states[i], s, t).controls.speed
            expect(Math.abs(real - shown), `${s.title} t=${t.toFixed(2)} (út ${len.toFixed(1)} m)`).toBeLessThan(3)
          }
        })
      })

      it('a helyzetben és a helyes megoldásban nincs ütközés, a saját autó az úttesten marad, a gyalogostól legalább 1 m-re', () => {
        const states = stepStates(lesson)
        const own = lesson.actors.find((a) => a.kind === 'own')!
        lesson.steps.forEach((s, i) => {
          if (s.phase === 'wrong') return
          for (const t of TS) {
            const f = frameAt(lesson, states[i], s, t)
            const me = f.actors[own.id].pose
            const body = bodyCorners('own', me)
            for (const w of wheelRects(me)) {
              const [cx, cz] = w.reduce(([x, z], [px, pz]) => [x + px / 4, z + pz / 4], [0, 0])
              expect(onAsphalt(lesson, cx, cz), `${s.title} t=${t}: kerék az úttesten kívül`).toBe(true)
            }
            for (const a of lesson.actors) {
              if (a.id === own.id) continue
              const p = f.actors[a.id].pose
              if (a.kind === 'ped') expect(bodyGap('own', me, 'ped', p).d, `${s.title} t=${t}: gyalogos`).toBeGreaterThanOrEqual(1)
              else expect(polygonsOverlap(body, bodyCorners(a.kind, p)), `${s.title} t=${t}: ütközés ${a.id}`).toBe(false)
            }
          }
        })
      })
    })
  }
})
