import { useFrame } from '@react-three/fiber'
import { useRef, useState } from 'react'
import type { Group } from 'three'
import type { TrafficSystem } from '../../sim/traffic/traffic'
import { PERSON_MODELS } from '../scene3d/models'
import { Person } from '../scene3d/people'
import { Car } from '../scene3d/vehicles'

/**
 * Az élő forgalom rajzolása: autók (a valósághű modell, saját színnel, villogó irányjelzővel) és gyalogosok
 * (járó-álló animációval). A helyzetüket minden képkockán a szimulációból veszik; a szereplők listája (ki jelent
 * meg, ki tűnt el) fél másodpercenként frissül, hogy a React ne rajzoljon újra minden képkockán.
 */

/** Ennél messzebbi autót, gyalogost nem rajzolunk (a köd úgyis elfedi): gyorsabb */
const CAR_VIEW_M = 150
const PED_VIEW_M = 70

function AiCarView({ traffic, id, color }: { traffic: TrafficSystem; id: number; color: string }) {
  const ref = useRef<Group>(null)
  const [blink, setBlink] = useState<'left' | 'right' | undefined>(undefined)
  useFrame(() => {
    const g = ref.current
    if (!g) return
    const c = traffic.cars.find((x) => x.id === id)
    const v = traffic.viewer
    g.visible = !!c && (!v || Math.hypot(c.x - v.x, c.z - v.z) < CAR_VIEW_M)
    if (!c || !g.visible) return
    g.position.set(c.x, 0, c.z)
    g.rotation.set(0, -c.heading, 0)
    const want = c.blink ?? undefined
    if (want !== blink) setBlink(want)
  })
  return (
    <group ref={ref}>
      <Car color={color} blink={blink} />
    </group>
  )
}

function PedView({ traffic, id, model }: { traffic: TrafficSystem; id: number; model: number }) {
  const ref = useRef<Group>(null)
  const speed = useRef(0)
  useFrame(() => {
    const g = ref.current
    if (!g) return
    const p = traffic.peds.find((x) => x.id === id)
    const v = traffic.viewer
    g.visible = !!p && (!v || Math.hypot(p.x - v.x, p.z - v.z) < PED_VIEW_M)
    if (!p || !g.visible) return
    // A járdán a szegély magasságában, az úttesten (zebrán) a burkolaton
    const y = traffic.index.onPavement([p.x, p.z]) ? 0.15 : 0
    g.position.set(p.x, y, p.z)
    g.rotation.set(0, -p.heading, 0)
    speed.current = p.mode === 'wait' ? 0 : p.v
  })
  return (
    <group ref={ref}>
      <Person name={PERSON_MODELS[model % PERSON_MODELS.length]} height={1.64 + (id % 4) * 0.05} speed={() => speed.current} />
    </group>
  )
}

export function TrafficView({ traffic }: { traffic: TrafficSystem }) {
  const [cast, setCast] = useState<{ cars: Array<{ id: number; color: string }>; peds: Array<{ id: number; model: number }> }>({ cars: [], peds: [] })
  const acc = useRef(1)
  useFrame((_, dt) => {
    acc.current += dt
    if (acc.current < 0.5) return
    acc.current = 0
    const cars = traffic.cars.map((c) => ({ id: c.id, color: c.color }))
    const peds = traffic.peds.map((p) => ({ id: p.id, model: p.model }))
    const same = (a: Array<{ id: number }>, b: Array<{ id: number }>) => a.length === b.length && a.every((x, i) => x.id === b[i].id)
    if (!same(cars, cast.cars) || !same(peds, cast.peds)) setCast({ cars, peds })
  })
  return (
    <>
      {cast.cars.map((c) => (
        <AiCarView key={c.id} traffic={traffic} id={c.id} color={c.color} />
      ))}
      {cast.peds.map((p) => (
        <PedView key={p.id} traffic={traffic} id={p.id} model={p.model} />
      ))}
    </>
  )
}
