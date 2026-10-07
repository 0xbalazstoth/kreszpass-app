import { expect, it } from 'vitest'
import { EVAL_CODES } from '../evalCodes'
import { pathLength, polygonsOverlap, rectCorners, wheelRects } from '../maneuvers/geometry'
import { bodyCorners, bodyGap } from './bodies'
import { frameAt, stepMs, stepStates } from './timeline'
import type { FaultStep, Lesson, Track } from './types'

/**
 * A lejátszható jelenetek (hibakód-leckék, forgalmi helyzetek) közös ellenőrzései: tesztekből hívandó, minden
 * ellenőrzés egy-egy `it` blokk.
 */

function tracksOf(step: FaultStep): Track<unknown>[] {
  return [
    ...Object.values(step.controls ?? {}),
    ...Object.values(step.signals ?? {}),
    ...Object.values(step.blinks ?? {}),
    ...(step.look ? [step.look] : []),
    ...(step.rail ? [step.rail] : []),
    ...(step.barrier ? [step.barrier] : []),
    ...Object.values(step.moves ?? {}).flatMap((m) => (m.profile ? [m.profile] : [])),
  ] as Track<unknown>[]
}

/** Mintavétel a lépésen belül */
const TS = Array.from({ length: 51 }, (_, i) => i / 50)

/** Az úttesten van-e a pont: az aszfalt téglalapjain vagy a körforgalom körpályáján */
export function onRoad(lesson: Lesson, x: number, z: number): boolean {
  const ring = lesson.world.ring
  if (ring) {
    const r = Math.hypot(x, z)
    if (r >= ring.inner && r <= ring.outer) return true
  }
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

export function checkLesson(lesson: Lesson, opts: { safePhases: (s: FaultStep) => boolean }) {
  const ids = new Set(lesson.actors.map((a) => a.id))
  const lights = new Set((lesson.world.lights ?? []).flatMap((l) => [l.id, ...(l.arrow ? [l.arrow] : [])]))
  const own = lesson.actors.find((a) => a.kind === 'own')

  it('egy saját autó, egyedi szereplők, legalább kétmondatos magyarázatok, létező hibakódok', () => {
    expect(lesson.actors.filter((a) => a.kind === 'own')).toHaveLength(1)
    expect(ids.size).toBe(lesson.actors.length)
    for (const s of lesson.steps) {
      expect(s.how.length, s.title).toBeGreaterThanOrEqual(2)
      for (const m of s.mistakes ?? []) expect(EVAL_CODES[m.code], `${s.title}: ${m.code}`).toBeDefined()
    }
  })

  it('a szereplők egyik lépésben sem mennek át egymáson', () => {
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
    lesson.steps.forEach((s, i) => {
      const move = own && s.moves?.[own.id]
      if (!own || !move || !s.controls?.speed) return
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

  it('a helyes lépésekben a saját autó az úttesten marad, és a gyalogostól legalább 1 m-re halad', () => {
    const states = stepStates(lesson)
    if (!own) return
    lesson.steps.forEach((s, i) => {
      if (!opts.safePhases(s)) return
      for (const t of TS) {
        const f = frameAt(lesson, states[i], s, t)
        const me = f.actors[own.id].pose
        for (const w of wheelRects(me)) {
          const [cx, cz] = w.reduce(([x, z], [px, pz]) => [x + px / 4, z + pz / 4], [0, 0])
          expect(onRoad(lesson, cx, cz), `${s.title} t=${t}: kerék az úttesten kívül (${cx.toFixed(2)}, ${cz.toFixed(2)})`).toBe(true)
        }
        for (const a of lesson.actors) if (a.kind === 'ped') expect(bodyGap('own', me, 'ped', f.actors[a.id].pose).d, `${s.title} t=${t}: gyalogos`).toBeGreaterThanOrEqual(1)
      }
    })
  })
}
