import { describe, expect, it } from 'vitest'
import type { Scene } from '../../domain/questions'
import { buildLayout, carPose, HALF, propPose, RING_INNER, RING_OUTER, ringLaneRadius } from './layout'

const junction = (extra: Partial<Scene>): Scene => ({ layout: 'junction', turn: 'straight', cars: [], ...extra })

/** A −Z felé néző modell iránya θ forgatás után */
const facing = (rotY: number) => [-Math.sin(rotY), -Math.cos(rotY)]
/** A tábla előlapjának normálisa θ forgatás után (alapból +Z, felénk) */
const signNormal = (rotY: number) => [Math.sin(rotY), Math.cos(rotY)]

describe('3D elrendezés – kereszteződés', () => {
  it('a saját táblánk jobb oldalt, a megállási pont előtt áll, és felénk néz', () => {
    const l = buildLayout(junction({ mySign: 'give_way' }))
    const mine = l.signs.find((s) => s.codes.includes('B-001'))!
    expect(mine.x).toBeGreaterThan(HALF)
    expect(mine.z).toBeGreaterThan(HALF)
    expect(mine.z).toBeLessThan(l.camera.stopZ)
    expect(signNormal(mine.rotY)[1]).toBeCloseTo(1)
  })

  it('a kamera a saját sávunkban, messziről a kereszteződés elé ér', () => {
    const l = buildLayout(junction({}))
    expect(l.camera.x).toBeGreaterThan(0)
    expect(l.camera.x).toBeLessThan(HALF)
    expect(l.camera.startZ).toBeGreaterThan(l.camera.stopZ)
    expect(l.camera.stopZ).toBeGreaterThan(HALF)
  })

  it('a jobbról érkező autó +X oldalon, a −X felé halad, a saját sávjában', () => {
    const l = buildLayout(junction({ cars: [{ from: 'right', intent: 'straight' }] }))
    const [car] = l.cars
    expect(car.from[0]).toBeGreaterThan(car.to[0])
    expect(car.to[0]).toBeGreaterThan(HALF)
    expect(car.to[1]).toBeLessThan(0)
    expect(facing(car.rotY)[0]).toBeCloseTo(-1)
  })

  it('a balról érkező autó −X oldalon, a +X felé halad, a déli sávban', () => {
    const [car] = buildLayout(junction({ cars: [{ from: 'left', intent: 'straight' }] })).cars
    expect(car.to[0]).toBeLessThan(-HALF)
    expect(car.to[1]).toBeGreaterThan(0)
    expect(facing(car.rotY)[0]).toBeCloseTo(1)
  })

  it('a szemből érkező autó a szembejövő sávban felénk halad', () => {
    const [car] = buildLayout(junction({ cars: [{ from: 'ahead', intent: 'straight' }] })).cars
    expect(car.to[0]).toBeLessThan(0)
    expect(car.to[1]).toBeLessThan(-HALF)
    expect(facing(car.rotY)[1]).toBeCloseTo(1)
  })

  it('a várakozó autó nem mozog', () => {
    const [car] = buildLayout(junction({ cars: [{ from: 'right', intent: 'straight', waiting: true }] })).cars
    expect(carPose(car, 0)).toEqual(carPose(car, 1))
  })

  it('a keresztező út táblái a partnerek felé fordulnak', () => {
    const l = buildLayout(junction({ mySign: 'priority_road', crossSign: 'give_way' }))
    const cross = l.signs.filter((s) => s.codes.includes('B-001'))
    expect(cross).toHaveLength(2)
    const westSide = cross.find((s) => s.x < 0)!
    expect(signNormal(westSide.rotY)[0]).toBeCloseTo(-1) // a balról, +X felé érkezők felé
  })

  it('jobbra kanyarodásnál a gyalogos a jobb oldali utcán halad át', () => {
    const l = buildLayout(junction({ turn: 'right', pedestrian: { where: 'target_road', state: 'crossing' } }))
    expect(l.peds[0].from[0]).toBeGreaterThan(HALF)
    expect(l.peds[0].from[1]).not.toBe(l.peds[0].to[1])
  })

  it('lámpás kereszteződésben két lámpa van, tábla nélkül', () => {
    const l = buildLayout(junction({ light: 'red_yellow', mySign: 'give_way' }))
    expect(l.lights).toHaveLength(2)
    expect(l.lights.every((x) => x.state === 'red_yellow')).toBe(true)
    expect(l.signs.some((s) => s.codes.includes('B-001'))).toBe(false)
  })

  it('ugyanarra a jelenetre mindig ugyanazt az elrendezést adja', () => {
    const s = junction({ mySign: 'stop' })
    expect(buildLayout(s)).toEqual(buildLayout(s))
  })
})

describe('3D elrendezés – körforgalom és egyenes út', () => {
  it('a körben balról érkező autó óramutatóval ellentétesen, a bejáratunk felé halad', () => {
    const l = buildLayout({ layout: 'roundabout', turn: 'straight', mySign: 'roundabout', cars: [{ from: 'left', intent: 'straight' }] })
    const start = carPose(l.cars[0], 0)
    const end = carPose(l.cars[0], 1)
    expect(start.x).toBeLessThan(0) // nyugati oldalról indul
    expect(end.z).toBeGreaterThan(start.z) // dél felé, a bejáratunk felé
    const [fx, fz] = facing(end.rotY)
    expect(fx * (end.x - start.x) + fz * (end.z - start.z)).toBeGreaterThan(0) // a haladás irányába néz
  })

  it('körforgalom előtt figyelmeztető tábla, a bejáratnál elsőbbségadás kötelező', () => {
    const l = buildLayout({ layout: 'roundabout', turn: 'straight', mySign: 'roundabout', cars: [] })
    const codes = l.signs.flatMap((s) => s.codes)
    expect(codes).toContain('A-056')
    expect(codes).toContain('B-001')
    const warning = l.signs.find((s) => s.codes.includes('A-056'))!
    const yieldSign = l.signs.find((s) => s.codes.includes('B-001'))!
    expect(warning.z).toBeGreaterThan(yieldSign.z)
  })

  it('zebránál a gyalogos keresztben halad át az úttesten', () => {
    const l = buildLayout({ layout: 'road', turn: 'straight', mySign: 'crossing', cars: [], pedestrian: { where: 'my_crossing', state: 'crossing' } })
    expect(l.peds[0].from[0]).toBeLessThan(-HALF)
    expect(l.peds[0].to[0]).toBeGreaterThan(HALF)
    // A zebra csíkjai az út irányával (Z) párhuzamosak
    expect(l.markings.some((m) => m.d > m.w && Math.abs(m.z) < 0.01 && m.w === 0.5)).toBe(true)
  })

  it('takart zebránál a szomszéd sávban áll a jármű', () => {
    const l = buildLayout({ layout: 'road', turn: 'straight', mySign: 'crossing', cars: [], blocker: true })
    expect(l.blocker!.x).toBeLessThan(0)
    expect(l.blocker!.z).toBeGreaterThan(0)
  })
})

describe('mi látszik a kérdés pillanatában', () => {
  /** Vízszintes szög (fok) a nézési irányhoz képest; + = balra */
  function angleInView(l: ReturnType<typeof buildLayout>, px: number, pz: number, yaw: number) {
    const dx = px - l.camera.x
    const dz = pz - l.camera.stopZ
    const bearing = Math.atan2(-dx, -dz) // 0 = előre (−Z), + = balra
    return ((bearing - yaw) * 180) / Math.PI
  }
  // Álló (keskeny) nézetnél is látszódjon: 68°-os függőleges látószög, 0,9-es képarány → kb. ±31°
  const HALF_FOV = 30

  for (const sign of ['stop', 'give_way', 'priority_road'] as const) {
    it(`a ${sign} tábla előttünk, látótérben van`, () => {
      const l = buildLayout(junction({ mySign: sign }))
      const post = l.signs[0]
      expect(Math.abs(angleInView(l, post.x, post.z, 0))).toBeLessThan(HALF_FOV)
    })
  }

  for (const side of ['left', 'right'] as const) {
    for (const sign of ['stop', 'give_way'] as const) {
      it(`${sign}: a tábla és a ${side === 'left' ? 'balról' : 'jobbról'} érkező autó egyszerre látszik`, () => {
        const l = buildLayout(junction({ mySign: sign, cars: [{ from: side, intent: 'straight' }] }))
        const end = carPose(l.cars[0], 1)
        const post = l.signs.find((s) => s.rotY === 0)!
        expect(Math.abs(angleInView(l, end.x, end.z, l.lookYaw))).toBeLessThan(HALF_FOV)
        expect(Math.abs(angleInView(l, post.x, post.z, l.lookYaw))).toBeLessThan(HALF_FOV)
      })
    }
  }

  it('főútvonalon a mellékúton várakozó autó és a táblánk is látszik', () => {
    const l = buildLayout(junction({ mySign: 'priority_road', crossSign: 'give_way', cars: [{ from: 'right', intent: 'straight', waiting: true }] }))
    const end = carPose(l.cars[0], 1)
    expect(Math.abs(angleInView(l, end.x, end.z, l.lookYaw))).toBeLessThan(HALF_FOV)
  })

  it('szemből érkező autó látszik balra kanyarodáskor', () => {
    const l = buildLayout(junction({ turn: 'left', light: 'green', cars: [{ from: 'ahead', intent: 'straight' }] }))
    const end = carPose(l.cars[0], 1)
    expect(Math.abs(angleInView(l, end.x, end.z, l.lookYaw))).toBeLessThan(HALF_FOV)
  })

  it('bekanyarodáskor a gyalogos a fejfordítás után látszik', () => {
    const l = buildLayout(junction({ turn: 'right', pedestrian: { where: 'target_road', state: 'crossing' } }))
    const p = l.peds[0]
    const mid = [(p.from[0] + p.to[0]) / 2, (p.from[1] + p.to[1]) / 2]
    expect(Math.abs(angleInView(l, mid[0], mid[1], l.lookYaw))).toBeLessThan(HALF_FOV)
  })

  it('körforgalomnál a tábla és a körben érkező autó is látszik', () => {
    const l = buildLayout({ layout: 'roundabout', turn: 'straight', mySign: 'roundabout', cars: [{ from: 'left', intent: 'straight' }] })
    const yieldSign = l.signs.find((s) => s.codes.includes('B-001'))!
    expect(Math.abs(angleInView(l, yieldSign.x, yieldSign.z, 0))).toBeLessThan(HALF_FOV)
    const end = carPose(l.cars[0], 1)
    expect(Math.abs(angleInView(l, end.x, end.z, l.lookYaw))).toBeLessThan(HALF_FOV)
  })
})

describe('3D elrendezés – beépítés', () => {
  it('az utca mentén a házak hézag nélkül sorakoznak, így nem látszik csupasz oldalfal a vezető előtt', () => {
    const l = buildLayout({ layout: 'road', turn: 'straight', mySign: 'crossing', cars: [] })
    for (const side of [1, -1]) {
      const row = l.buildings.filter((b) => Math.sign(b.x) === side).sort((a, b) => b.z - a.z)
      expect(row.length).toBeGreaterThan(5)
      for (let i = 1; i < row.length; i++) expect(row[i - 1].z - row[i - 1].d / 2).toBeCloseTo(row[i].z + row[i].d / 2, 6)
    }
  })
})

describe('3D elrendezés – körforgalom a valós kijáratszámmal', () => {
  const ring = (exits: number, exit: number, phase: 'entry' | 'exit', extra: Partial<Scene> = {}): Scene => ({
    layout: 'roundabout',
    turn: 'straight',
    mySign: 'roundabout',
    cars: [],
    roundabout: { exits, exit, lanes: 1, phase },
    ...extra,
  })

  it('annyi ága van, ahány kijárata (3–6), a behajtási ág délen', () => {
    for (const n of [3, 4, 5, 6]) expect(buildLayout(ring(n, 1, 'entry')).asphalt).toHaveLength(n)
    const south = buildLayout(ring(5, 2, 'entry')).asphalt[0]
    expect(south.x).toBeCloseTo(0)
    expect(south.z).toBeGreaterThan(0)
  })

  it('a körben a kamera íven, az óramutatóval ellentétesen halad, és a kijárat előtt áll meg', () => {
    const l = buildLayout(ring(4, 2, 'exit'))
    const arc = l.camera.arc!
    expect(arc.a1).toBeGreaterThan(arc.a0)
    // A 2. kijárat (4 ágnál) északon, a +π/2 szögnél van
    expect(arc.a1).toBeLessThan(Math.PI / 2)
    expect(arc.a1).toBeGreaterThan(Math.PI / 2 - 0.8)
    expect(arc.r).toBeGreaterThan(RING_INNER)
    expect(arc.r).toBeLessThan(RING_OUTER)
  })

  it('kétsávos körben távoli kijárathoz a belső sávban halad, a külső sávban mellette autó', () => {
    const l = buildLayout({ ...ring(4, 3, 'exit', { cars: [{ from: 'left', intent: 'straight' }] }), roundabout: { exits: 4, exit: 3, lanes: 2, phase: 'exit', partner: 'outer_car' } })
    expect(l.camera.arc!.r).toBeCloseTo(ringLaneRadius(2, 'inner'))
    expect(l.cars[0].arc!.r).toBeCloseTo(ringLaneRadius(2, 'outer'))
  })

  it('a kijárati zebrán a gyalogos a kijárati ágon kel át', () => {
    const l = buildLayout(ring(4, 1, 'exit', { pedestrian: { where: 'exit_crossing', state: 'crossing' } }))
    const p = l.peds[0]
    // Az 1. kijárat keleten: a zebra a +X oldalon, a gyalogos észak–dél irányban halad
    expect((p.from[0] + p.to[0]) / 2).toBeGreaterThan(RING_OUTER)
    expect(Math.abs(p.from[1] - p.to[1])).toBeGreaterThan(2 * HALF)
  })

  it('a várakozó autó a kijáratunk előtti bejáratnál áll, a kör felé nézve', () => {
    const l = buildLayout({ ...ring(4, 3, 'exit'), roundabout: { exits: 4, exit: 3, lanes: 1, phase: 'exit', partner: 'entry_waiting' } })
    const car = l.cars[0]
    expect(car.waiting).toBe(true)
    // A 2. ág északon: az autó a kör északi oldalán, dél felé (a kör felé) néz
    expect(car.to[1]).toBeLessThan(-RING_OUTER)
    expect(facing(car.rotY)[1]).toBeCloseTo(1)
  })
})

describe('3D elrendezés – megállók és váratlan helyzetek', () => {
  const road = (extra: Partial<Scene>): Scene => ({ layout: 'road', turn: 'straight', cars: [], ...extra })
  const hazards = ['parked_oncoming', 'parked_clear', 'roadworks', 'ball_child', 'door_open', 'cyclist', 'emergency'] as const

  for (const hazard of hazards) {
    it(`${hazard}: a jelenet felépül, a házak nem lógnak az úttestre`, () => {
      const l = buildLayout(road({ hazard }))
      expect(l.props!.length).toBeGreaterThan(0)
      const minX = Math.min(...l.asphalt.map((a) => a.x - a.w / 2))
      const maxX = Math.max(...l.asphalt.map((a) => a.x + a.w / 2))
      for (const b of l.buildings) expect(b.x - b.w / 2 >= maxX || b.x + b.w / 2 <= minX).toBe(true)
    })
  }

  it('az akadály a sávunkban, előttünk áll', () => {
    const l = buildLayout(road({ hazard: 'parked_clear' }))
    const van = l.props!.find((p) => p.kind === 'van')!
    expect(van.at[0]).toBeGreaterThan(0)
    expect(van.at[1]).toBeLessThan(l.camera.stopZ)
  })

  it('a mentőautó mögöttünk érkezik, a tükör és a sziréna bekapcsol', () => {
    const l = buildLayout(road({ hazard: 'emergency' }))
    const amb = l.props!.find((p) => p.kind === 'ambulance')!
    expect(propPose(amb, 1, 0, 0)[1]).toBeGreaterThan(l.camera.stopZ)
    expect(l.mirror).toBe(true)
    expect(l.siren).toBe(true)
  })

  it('a kerékpáros a kérdés pillanatában előttünk halad', () => {
    const l = buildLayout(road({ hazard: 'cyclist' }))
    const bike = l.props!.find((p) => p.kind === 'cyclist')!
    const [, z] = propPose(bike, 1, 2.5, 0)
    expect(z).toBeLessThan(l.camera.stopZ - 5)
  })

  it('járdasziget nélküli villamosmegállóban a villamos a sávunkban áll, az utasok az úttesten kelnek át', () => {
    const l = buildLayout(road({ mySign: 'tram', transit: { kind: 'tram', island: false, state: 'doors_open' } }))
    const tram = l.props!.find((p) => p.kind === 'tram')!
    expect(tram.at[0]).toBeGreaterThan(0)
    expect(tram.at[1] + 15).toBeLessThan(l.camera.stopZ)
    expect(l.peds.length).toBeGreaterThan(0)
    expect(l.signs.flatMap((s) => s.codes)).toEqual(expect.arrayContaining(['E-041', 'A-053+H-023']))
  })

  it('járdaszigetes megállóban a villamos középen, a sziget köztünk és a villamos között', () => {
    const l = buildLayout(road({ mySign: 'tram', transit: { kind: 'tram', island: true, state: 'standing' } }))
    const tram = l.props!.find((p) => p.kind === 'tram')!
    const island = l.props!.find((p) => p.kind === 'island')!
    expect(tram.at[0]).toBeLessThan(island.at[0])
    expect(island.at[0]).toBeLessThan(0)
  })

  it('az induló busz a buszöbölből a sávunkba húzódik ki', () => {
    const l = buildLayout(road({ mySign: 'bus', transit: { kind: 'bus', island: false, state: 'departing' } }))
    const bus = l.props!.find((p) => p.kind === 'bus')!
    expect(bus.blink).toBe('left')
    expect(bus.at[0]).toBeGreaterThan(HALF)
    expect(bus.move!.to[0]).toBeLessThan(HALF)
  })

  it('vasúti átjárónál a torlódás a sínek mögött, a vonat balról érkezik', () => {
    const queue = buildLayout(road({ mySign: 'rail', rail: { barrier: false, light: 'white_flash', queue: true } }))
    expect(queue.cars.every((c) => c.waiting && c.to[1] < 0)).toBe(true)
    const train = buildLayout(road({ mySign: 'rail', rail: { barrier: false, light: 'none', train: true } })).props!.find((p) => p.kind === 'train')!
    expect(train.at[0]).toBeLessThan(0)
    expect(train.move!.to[0]).toBeGreaterThan(0)
  })
})
