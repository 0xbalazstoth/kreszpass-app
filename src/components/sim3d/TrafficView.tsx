import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BoxGeometry, Color, InstancedMesh, Object3D, type Group } from 'three'
import type { TrafficSystem } from '../../sim/traffic/traffic'
import { PERSON_MODELS } from '../scene3d/models'
import { Person } from '../scene3d/people'
import { amberOn, INDICATOR_SPOTS, sedanParts, type SedanPart } from '../scene3d/carParts'

/**
 * Az élő forgalom rajzolása. Az autók példányosítva: a szedán minden anyaga egy-egy háló, benne az összes autó
 * (saját színnel), így sok autó is csak néhány rajzolási hívás (a tükrökben is). A gyalogosok (járó-álló
 * animációval) egyenként; a listájuk (ki jelent meg, ki tűnt el) fél másodpercenként frissül.
 */

/** Ennél messzebbi autót, gyalogost nem rajzolunk (a köd úgyis elfedi): gyorsabb */
const CAR_VIEW_M = 230
const PED_VIEW_M = 80
/** Legfeljebb ennyi autó látszik egyszerre */
const MAX_CARS = 64

const tmp = new Object3D()
const tint = new Color()

function AiCars({ traffic }: { traffic: TrafficSystem }) {
  const [parts, setParts] = useState<SedanPart[] | null>(null)
  useEffect(() => {
    let alive = true
    void sedanParts().then((p) => alive && setParts(p))
    return () => {
      alive = false
    }
  }, [])
  const meshes = useRef<InstancedMesh[]>([])
  const blinkers = useRef<InstancedMesh>(null)
  const lamp = useMemo(() => new BoxGeometry(0.14, 0.08, 0.05), [])
  useEffect(() => () => lamp.dispose(), [lamp])

  useFrame(({ clock }) => {
    const v = traffic.viewer
    const blinkOn = Math.floor(clock.elapsedTime * 2.5) % 2 === 0
    let n = 0
    let b = 0
    for (const c of traffic.cars) {
      if (n >= MAX_CARS) break
      if (v && Math.hypot(c.x - v.x, c.z - v.z) > CAR_VIEW_M) continue
      tmp.position.set(c.x, 0, c.z)
      tmp.rotation.set(0, -c.heading, 0)
      tmp.scale.set(1, 1, 1)
      tmp.updateMatrix()
      for (const m of meshes.current) {
        if (!m) continue
        m.setMatrixAt(n, tmp.matrix)
        if (m.userData.paint) m.setColorAt(n, tint.set(c.color))
      }
      const bl = blinkers.current
      if (bl && c.blink && blinkOn)
        for (const spot of INDICATOR_SPOTS) {
          if (spot.side !== c.blink) continue
          const fx = Math.sin(c.heading)
          const fz = -Math.cos(c.heading)
          const rx = Math.cos(c.heading)
          const rz = Math.sin(c.heading)
          // A modell −Z felé néz: z < 0 elöl, x > 0 jobbra
          tmp.position.set(c.x + rx * spot.x - fx * spot.z, spot.y, c.z + rz * spot.x - fz * spot.z)
          tmp.updateMatrix()
          bl.setMatrixAt(b++, tmp.matrix)
        }
      n++
    }
    for (const m of meshes.current) {
      if (!m) continue
      m.count = n
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
    if (blinkers.current) {
      blinkers.current.count = b
      blinkers.current.instanceMatrix.needsUpdate = true
    }
  })

  if (!parts) return null
  return (
    <group>
      {parts.map((p, i) => (
        <instancedMesh
          key={i}
          ref={(el) => {
            if (!el) return
            meshes.current[i] = el
            el.userData.paint = p.paint
            // Színek a fényezéshez (az első setColorAt előtt is legyen, különben a shader nem kap példányszínt)
            if (p.paint && !el.instanceColor) el.setColorAt(0, tint.set('#ffffff'))
          }}
          args={[p.geometry, p.material, MAX_CARS]}
          frustumCulled={false}
          castShadow
          receiveShadow
        />
      ))}
      <instancedMesh ref={blinkers} args={[lamp, amberOn, MAX_CARS * 2]} frustumCulled={false} />
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
  const [peds, setPeds] = useState<Array<{ id: number; model: number }>>([])
  const acc = useRef(1)
  useFrame((_, dt) => {
    acc.current += dt
    if (acc.current < 0.5) return
    acc.current = 0
    const next = traffic.peds.map((p) => ({ id: p.id, model: p.model }))
    if (next.length !== peds.length || next.some((x, i) => x.id !== peds[i].id)) setPeds(next)
  })
  return (
    <>
      <AiCars traffic={traffic} />
      {peds.map((p) => (
        <PedView key={p.id} traffic={traffic} id={p.id} model={p.model} />
      ))}
    </>
  )
}
