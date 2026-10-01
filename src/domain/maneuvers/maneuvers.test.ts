import { describe, expect, it } from 'vitest'
import { EVAL_BLOCKS, EVAL_CODES } from '../evalCodes'
import { collisions, finalPose, refError, stepStarts, targetError } from './check'
import { CAR, carCorners, deg, endOf, polygonsOverlap, R_MIN, rectCorners, steerTurns, wheelAngle, type Pose } from './geometry'
import { MANEUVERS } from './index'

const close = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps)

describe('geometria', () => {
  const start: Pose = { x: 0, z: 0, heading: 0 }

  it('negyed kör jobbra előre: északról keletre fordul, északkeletre ér', () => {
    const p = endOf(start, [{ kind: 'arc', radius: R_MIN, angle: deg(90), dir: 'right', gear: 'D' }])
    close(p.x, R_MIN)
    close(p.z, -R_MIN)
    close(p.heading, Math.PI / 2)
  })

  it('tolatva jobbra kormányozva a kocsi hátulja jobbra megy', () => {
    const p = endOf(start, [{ kind: 'arc', radius: R_MIN, angle: deg(90), dir: 'right', gear: 'R' }])
    close(p.x, R_MIN)
    close(p.z, R_MIN)
    close(p.heading, -Math.PI / 2)
  })

  it('egyenes hátramenet a menetiránnyal ellentétesen', () => {
    const p = endOf(start, [{ kind: 'straight', dist: 3, gear: 'R' }])
    close(p.z, 3)
  })

  it('a kocsi sarkai a valós méretekkel', () => {
    const [rl, , fr] = carCorners(start)
    close(fr[0] - rl[0], CAR.width)
    close(rl[1] - fr[1], CAR.length)
  })

  it('átfedés-vizsgálat', () => {
    expect(polygonsOverlap(rectCorners(0, 0, 2, 2), rectCorners(1.5, 0, 2, 2))).toBe(true)
    expect(polygonsOverlap(rectCorners(0, 0, 2, 2), rectCorners(2.5, 0, 2, 2))).toBe(false)
  })

  it('teljes kormánykitérés 1,5 fordulat, a kerék kb. 33°', () => {
    const arc = { kind: 'arc', radius: R_MIN, angle: 1, dir: 'left', gear: 'D' } as const
    expect(steerTurns(arc)).toBe(-1.5)
    expect((Math.abs(wheelAngle(arc)) * 180) / Math.PI).toBeGreaterThan(30)
  })
})

describe('a hét vizsgamanőver', () => {
  it('mind a hét megvan, a minősítő lap címével', () => {
    const titles = EVAL_BLOCKS.find((b) => b.block === 7)!.items.flatMap((i) => ('maneuver' in i ? [i] : []))
    expect(MANEUVERS.map((m) => m.id)).toEqual(titles.map((t) => t.maneuver))
    for (const m of MANEUVERS) expect(m.title).toBe(titles.find((t) => t.maneuver === m.id)!.text)
  })

  for (const m of MANEUVERS) {
    describe(m.id, () => {
      it('a kocsi a célban, a megengedett eltérésen belül áll meg', () => {
        const e = targetError(m)
        expect(e.dist).toBeLessThanOrEqual(m.site.target.posTol)
        expect(e.angle).toBeLessThanOrEqual(m.site.target.headTol)
      })

      it('sehol nem ér parkoló autóhoz, a kerék szegélyhez (5 cm-enként ellenőrizve)', () => {
        expect(collisions(m)).toEqual([])
      })

      it('a referenciapontok a lépés elején stimmelnek (±30 cm)', () => {
        const starts = stepStarts(m)
        m.steps.forEach((s, i) => {
          const err = refError(s, starts[i])
          if (err !== null) expect(err, `${m.id} ${i + 1}. lépés: ${s.title}`).toBeLessThanOrEqual(0.3)
        })
      })

      it('a hátramenetes mozgás hátramenetes lépésben van, és fordítva', () => {
        for (const s of m.steps) for (const seg of s.motion) expect(seg.gear, `${m.id}: ${s.title}`).toBe(s.gear)
      })

      it('minden lépésnek legalább két részletes utasítása van, a hibakódok valódiak', () => {
        for (const s of m.steps) {
          expect(s.how.length, s.title).toBeGreaterThanOrEqual(2)
          for (const x of s.mistakes ?? []) expect(EVAL_CODES[x.code], `${m.id}: ${x.code}`).toBeDefined()
        }
        for (const x of m.exam) expect(EVAL_CODES[x.code], `${m.id}: ${x.code}`).toBeDefined()
      })
    })
  }

  it('megfordulás után a kocsi az ellenkező irányba, a túloldali sávban halad', () => {
    for (const m of MANEUVERS.filter((x) => x.id === 'M6' || x.id === 'M7')) {
      const p = finalPose(m)
      const width = -m.site.kerbs[1].x - 0.15
      expect(Math.cos(p.heading)).toBeCloseTo(-1)
      expect(p.x).toBeLessThan(-width / 2)
      expect(p.x).toBeGreaterThan(-width + 0.9)
    }
  })
})
