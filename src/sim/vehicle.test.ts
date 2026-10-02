import { describe, expect, it } from 'vitest'
import { R_MIN } from '../domain/maneuvers/geometry'
import { initialCar, NO_CONTROLS, stepCar, toggleGear, toggleIndicator, type CarState, type Controls } from './vehicle'

const DT = 1 / 60
const run = (c: CarState, ctl: Partial<Controls>, seconds: number) => {
  let s = c
  for (let t = 0; t < seconds; t += DT) s = stepCar(s, { ...NO_CONTROLS, ...ctl }, DT)
  return s
}
const go = (c: CarState) => ({ ...c, handbrake: false })

describe('a saját autó mozgása', () => {
  it('kb. 7 s alatt gyorsul fel 50 km/h-ra', () => {
    let c = go(initialCar(0, 0, 0))
    let t = 0
    while (c.speed < 50 / 3.6 && t < 20) {
      c = stepCar(c, { ...NO_CONTROLS, throttle: 1 }, DT)
      t += DT
    }
    expect(t).toBeGreaterThan(5)
    expect(t).toBeLessThan(9)
  })

  it('50 km/h-ról teljes fékezéssel kb. 12 m-en áll meg', () => {
    let c: CarState = { ...go(initialCar(0, 0, 0)), speed: 50 / 3.6 }
    while (c.speed > 0) c = stepCar(c, { ...NO_CONTROLS, brake: 1 }, DT)
    // Észak felé haladva a z csökken
    expect(-c.z).toBeGreaterThan(9)
    expect(-c.z).toBeLessThan(15)
  })

  it('teljes kormánynál a fordulókör sugara a valódi autóé', () => {
    // Lassan, teljesen jobbra kormányozva egy teljes kört megy: a hátsó tengely köre R_MIN sugarú
    let c = go(initialCar(0, 0, 0))
    c = run(c, { steer: 1 }, 2)
    const pts: [number, number][] = []
    for (let i = 0; i < 1200; i++) {
      c = stepCar(c, { ...NO_CONTROLS, steer: 1 }, DT)
      pts.push([c.x, c.z])
    }
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length
    const cz = pts.reduce((s, p) => s + p[1], 0) / pts.length
    const r = pts.reduce((s, p) => s + Math.hypot(p[0] - cx, p[1] - cz), 0) / pts.length
    expect(r).toBeGreaterThan(R_MIN - 0.4)
    expect(r).toBeLessThan(R_MIN + 0.6)
  })

  it('automata váltó: gáz nélkül kúszik, behúzott kézifékkel nem indul', () => {
    expect(run(go(initialCar(0, 0, 0)), {}, 3).speed).toBeGreaterThan(1)
    expect(run(initialCar(0, 0, 0), { throttle: 1 }, 2).speed).toBe(0)
  })

  it('hátramenetben hátrafelé megy, csak álló helyzetben lehet váltani', () => {
    const r = run(go(toggleGear(initialCar(0, 0, 0))), { throttle: 0.5 }, 2)
    expect(r.speed).toBeLessThan(0)
    expect(r.z).toBeGreaterThan(0)
    const moving: CarState = { ...go(initialCar(0, 0, 0)), speed: 5 }
    expect(toggleGear(moving).gear).toBe('D')
  })

  it('kanyarodás után az irányjelző magától kikapcsol', () => {
    let c = toggleIndicator({ ...go(initialCar(0, 0, 0)), speed: 4 }, 'right')
    c = run(c, { steer: 1, throttle: 0.2 }, 1.5)
    expect(c.indicator).toBe('right')
    c = run(c, { steer: 0, throttle: 0.2 }, 1.5)
    expect(c.indicator).toBeNull()
  })

  it('kis kormánymozdulattól (sávváltás) nem kapcsol ki', () => {
    let c = toggleIndicator({ ...go(initialCar(0, 0, 0)), speed: 12 }, 'left')
    c = run(c, { steer: -0.15 }, 0.6)
    c = run(c, { steer: 0 }, 1)
    expect(c.indicator).toBe('left')
  })
})
