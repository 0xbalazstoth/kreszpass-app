import { describe, expect, it } from 'vitest'
import { applyAction, stepSim, type SimState } from '../sim'
import { initialCar } from '../vehicle'
import { KeyboardInput } from './keyboard'

/** Egy billentyűesemény (a böngésző nélkül): a rajta lévő betű (`key`) és a fizikai helye (`code`) */
const ev = (key: string, code: string, extra: Partial<KeyboardEvent> = {}) => ({ key, code, repeat: false, metaKey: false, ctrlKey: false, target: null, preventDefault: () => {}, ...extra }) as unknown as KeyboardEvent

describe('billentyűzet', () => {
  it('magyar (QWERTZ) billentyűzeten a Z betűs gomb a bal vállon át nézés (a helye az angol Y)', () => {
    const k = new KeyboardInput()
    k.onKeyDown(ev('z', 'KeyY'))
    expect(k.look()).toBe('shoulder_left')
    k.onKeyUp(ev('z', 'KeyY'))
    expect(k.look()).toBe('ahead')
  })

  it('angol (QWERTY) billentyűzeten is a Z', () => {
    const k = new KeyboardInput()
    k.onKeyDown(ev('z', 'KeyZ'))
    expect(k.look()).toBe('shoulder_left')
  })

  it('ha közben a Shiftet lenyomja, a felengedett gomb akkor sem ragad be', () => {
    const k = new KeyboardInput()
    k.onKeyDown(ev('w', 'KeyW'))
    expect(k.sample(0.5).throttle).toBeGreaterThan(0)
    k.onKeyUp(ev('W', 'KeyW'))
    expect(k.sample(1).throttle).toBe(0)
  })

  it('a betűtől független gombok (nyilak, Szóköz) a helyük szerint működnek', () => {
    const k = new KeyboardInput()
    k.onKeyDown(ev(' ', 'Space'))
    k.onKeyDown(ev('ArrowUp', 'ArrowUp'))
    expect(k.takeActions()).toEqual(['handbrake'])
    expect(k.sample(0.5).throttle).toBeGreaterThan(0)
  })

  it('a Cmd/Ctrl + betű a böngészőé (pl. Cmd+R nem vált hátramenetbe)', () => {
    const k = new KeyboardInput()
    k.onKeyDown(ev('r', 'KeyR', { metaKey: true }))
    expect(k.takeActions()).toEqual([])
  })
})

describe('kezelési tanácsok', () => {
  const state = (speed: number, handbrake: boolean): SimState => ({ t: 1, car: { ...initialCar(0, 0, 0), speed, handbrake }, look: 'ahead', onKerb: false, offRoad: false, events: [] })

  it('kúszó autóval nem vált hátramenetbe, és megmondja, mit tegyen', () => {
    const s = applyAction(state(1, false), 'gear')
    expect(s.car.gear).toBe('D')
    expect(s.notice?.text).toMatch(/fék/)
    // Fékkel megállva vált, és a tanács eltűnik
    const r = applyAction({ ...s, car: { ...s.car, speed: 0 } }, 'gear')
    expect(r.car.gear).toBe('R')
    expect(r.notice).toBeUndefined()
  })

  it('behúzott kéziféknél a gázadásra szól, hogy engedje ki', () => {
    const index = { buildingAt: () => false, onPavement: () => false, onAsphalt: () => true }
    const s = stepSim({ index } as never, state(0, true), { throttle: 1, brake: 0, steer: 0, handbrake: false })
    expect(s.notice?.text).toMatch(/kézifék/)
  })
})
