import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { memo, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { InstancedMesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, type Group } from 'three'
import type { Look } from '../../domain/maneuvers/types'
import type { LightState } from '../../domain/questions'
import { advance, applyAction, type Sim, type SimAction } from '../../sim/sim'
import { CENTER_F, type Controls } from '../../sim/vehicle'
import { chunkOf } from '../../sim/world/build'
import { lightState } from '../../sim/world/lights'
import type { FurnitureSite, LightSite, SignSite } from '../../sim/world/types'
import { DriverAndMirrors } from '../scene3d/DriverMirrors'
import { OWN_CAR_LAYER } from '../scene3d/driverView'
import { StreetFurniture } from '../scene3d/Furniture'
import { groundPlane, roadPaint, surface, TILE_M, windowGlass } from '../scene3d/materials'
import { SignPost } from '../scene3d/parts'
import { useQuality } from '../scene3d/quality'
import { SceneLook } from '../scene3d/SceneLook'
import { Car } from '../scene3d/vehicles'
import { buildChunks, disposeChunks, type ChunkMeshes, type WindowSlot } from './meshes'
import { TrafficView } from './TrafficView'

/** A bemenet (billentyűzet, érintés, kontroller) közös felülete a jelenet felé */
export interface SimInput {
  sample(dt: number): Controls
  look(): Look
  takeActions(): SimAction[]
}

export interface SimSceneProps {
  sim: Sim
  input: SimInput
  paused: RefObject<boolean>
  chase: RefObject<boolean>
  /** Minden képkocka után (ha nincs szünet): a vizsgabiztos itt figyeli a szabályokat */
  onFrame?: () => void
}

/** Ennyire a kocsitól rajzoljuk a világ darabjait (m); a köd ennél közelebb már elfedi */
const VIEW_M = { low: 200, medium: 260, high: 320 } as const

const roofMat = new MeshStandardMaterial({ color: '#5b5f66', roughness: 0.95 })
const frameMat = new MeshStandardMaterial({ color: '#f1efe9', roughness: 0.6 })
const sillMat = new MeshStandardMaterial({ color: '#e7e2d8', roughness: 0.8 })
const shopMat = new MeshStandardMaterial({ color: '#2b2f35', roughness: 0.4, metalness: 0.3 })

function Instances({ slots, material, size, out, dy = 0, box }: { slots: WindowSlot[]; material: MeshStandardMaterial | ReturnType<typeof windowGlass>; size: [number, number]; out: number; dy?: number; box?: number }) {
  const ref = useRef<InstancedMesh>(null)
  useEffect(() => {
    const m = ref.current
    if (!m) return
    const o = new Object3D()
    slots.forEach((s, i) => {
      // A homlokzat síkja előtt néhány centivel (a forgatás +Z irányába)
      o.position.set(s.x + Math.sin(s.rotY) * out, s.y + dy, s.z + Math.cos(s.rotY) * out)
      o.rotation.set(0, s.rotY, 0)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    })
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
  }, [slots, out, dy])
  if (!slots.length) return null
  return (
    <instancedMesh ref={ref} args={[undefined, material, slots.length]}>
      {box ? <boxGeometry args={[size[0], size[1], box]} /> : <planeGeometry args={size} />}
    </instancedMesh>
  )
}

function ChunkView({ c, normalMaps }: { c: ChunkMeshes; normalMaps: boolean }) {
  return (
    <>
      {c.asphalt && <mesh geometry={c.asphalt} material={surface('asphalt', { normalMaps })} receiveShadow />}
      {c.pavement && <mesh geometry={c.pavement} material={surface('pavement', { normalMaps })} receiveShadow />}
      {c.kerb && <mesh geometry={c.kerb} material={surface('kerb', { normalMaps })} receiveShadow />}
      {c.paint && <mesh geometry={c.paint} material={roadPaint()} receiveShadow />}
      {c.walls.map((w) => (
        <mesh key={`${w.facade.name}${w.facade.tint ?? ''}`} geometry={w.geometry} material={surface(w.facade.name, { tint: w.facade.tint, normalMaps })} castShadow receiveShadow />
      ))}
      {c.roofs && <mesh geometry={c.roofs} material={roofMat} castShadow />}
      <Instances slots={c.windows} material={frameMat} size={[1.32, 1.72]} out={0.02} />
      <Instances slots={c.windows} material={windowGlass()} size={[1.12, 1.52]} out={0.045} />
      <Instances slots={c.windows} material={sillMat} size={[1.45, 0.07]} out={0.08} dy={-0.86} box={0.14} />
      <Instances slots={c.shops} material={shopMat} size={[2.4, 2.3]} out={0.03} />
    </>
  )
}

// ---------------------------------------------------------------- jelzőlámpa (élő állapottal)

const LAMP_ON: Record<'red' | 'yellow' | 'green', string> = { red: '#ef4444', yellow: '#facc15', green: '#22c55e' }
const LAMP_OFF = '#262626'

function lit(state: LightState) {
  return {
    red: state === 'red' || state === 'red_yellow',
    yellow: state === 'yellow' || state === 'red_yellow',
    green: state === 'green',
  }
}

function SimLight({ site, sim }: { site: LightSite; sim: Sim }) {
  const mats = useMemo(() => ({ red: new MeshBasicMaterial({ toneMapped: false }), yellow: new MeshBasicMaterial({ toneMapped: false }), green: new MeshBasicMaterial({ toneMapped: false }) }), [])
  useFrame(() => {
    const on = lit(lightState(sim.world, site, sim.state.t))
    for (const k of ['red', 'yellow', 'green'] as const) mats[k].color.set(on[k] ? LAMP_ON[k] : LAMP_OFF)
  })
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])
  return (
    <group position={[site.at[0], 0.15, site.at[1]]} rotation={[0, site.rotY, 0]}>
      <mesh position={[0, 1.5, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 3, 10]} />
        <meshStandardMaterial color="#374151" />
      </mesh>
      <group position={[0, 3.45, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.36, 0.95, 0.3]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
        {(['red', 'yellow', 'green'] as const).map((k, i) => (
          <mesh key={k} position={[0, 0.3 - i * 0.3, 0.16]} material={mats[k]}>
            <circleGeometry args={[0.11, 24]} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

// ---------------------------------------------------------------- a saját autó

function PlayerCar({ sim }: { sim: Sim }) {
  const ref = useRef<Group>(null)
  const [blink, setBlink] = useState<'left' | 'right' | 'hazard' | undefined>(undefined)
  useFrame(() => {
    const c = sim.state.car
    const g = ref.current
    if (!g) return
    g.position.set(c.x + Math.sin(c.heading) * CENTER_F, 0, c.z - Math.cos(c.heading) * CENTER_F)
    g.rotation.set(0, -c.heading, 0)
    g.traverse((o) => o.layers.set(OWN_CAR_LAYER))
    const want = c.hazard ? 'hazard' : (c.indicator ?? undefined)
    if (want !== blink) setBlink(want)
  })
  return (
    <group ref={ref}>
      <Car color="#2563eb" blink={blink} />
    </group>
  )
}

// ---------------------------------------------------------------- a szimuláció futtatása

/** Egy képkocka: bemenet, egyszeri mozdulatok, szimulációs lépések, és a napfény árnyékának követése */
function runFrame(sim: Sim, input: SimInput, paused: boolean, dt: number, focus: [number, number, number], onFrame?: () => void) {
  const ctl = input.sample(dt)
  // Szünetben a gombnyomások nem hatnak (a szünet utáni első pillanatban sem)
  for (const a of input.takeActions()) if (!paused) sim.state = applyAction(sim.state, a)
  sim.state = { ...sim.state, look: input.look() }
  if (!paused) {
    advance(sim, ctl, Math.min(dt, 0.1))
    onFrame?.()
  }
  focus[0] = sim.state.car.x
  focus[2] = sim.state.car.z
}

function SimLoop({ sim, input, paused, focus, onFrame }: { sim: Sim; input: SimInput; paused: RefObject<boolean>; focus: [number, number, number]; onFrame?: () => void }) {
  useFrame((_, dt) => runFrame(sim, input, paused.current ?? true, dt, focus, onFrame))
  return null
}

/** A világ darabjai, táblái, lámpái és fái: csak a kocsi közelében láthatók */
/**
 * A jelenet mátrixai képkockánként egyszer (a mozgó elemek, az autók és a gyalogosok helyének frissítése után), nem
 * minden rajzolásnál: a tükrökkel együtt képkockánként négyszer rajzolunk, és a világ sok ezer elemét mindannyiszor
 * végigjárni drága
 */
function setAutoMatrices(scene: Object3D, on: boolean) {
  scene.matrixWorldAutoUpdate = on
}

function WorldMatrices() {
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    setAutoMatrices(scene, false)
    return () => setAutoMatrices(scene, true)
  }, [scene])
  useFrame(() => scene.updateMatrixWorld())
  return null
}

/** (Memoizálva: a műszerfal 10 Hz-es frissítése ne építse újra a több ezer elemes világot) */
const WorldView = memo(function WorldView({ sim }: { sim: Sim }) {
  const q = useQuality()
  const quality = q.shadows === 0 ? 'low' : q.shadows === 1024 ? 'medium' : 'high'
  const chunks = useMemo(() => buildChunks(sim.world), [sim.world])
  useEffect(() => () => disposeChunks(chunks), [chunks])
  const decor = useMemo(() => {
    const by = new Map<string, { signs: SignSite[]; lights: LightSite[]; furniture: FurnitureSite[] }>()
    const get = (k: string) => {
      let d = by.get(k)
      if (!d) {
        d = { signs: [], lights: [], furniture: [] }
        by.set(k, d)
      }
      return d
    }
    for (const s of sim.world.signs) get(chunkOf(s.at)).signs.push(s)
    for (const l of sim.world.lights) get(chunkOf(l.at)).lights.push(l)
    for (const f of sim.world.furniture) get(chunkOf([f.x, f.z])).furniture.push(f)
    return by
  }, [sim.world])
  const groups = useRef(new Map<string, Group>())
  const centres = useMemo(() => {
    // Középpont és sugár (a darab legtávolabbi pontja): a darab látható, ha bármely része a látótávon belül van
    const m = new Map<string, [number, number, number]>()
    for (const c of chunks) m.set(c.key, [c.centre[0], c.centre[1], Math.max(c.radius, 110)])
    for (const k of decor.keys()) if (!m.has(k)) {
      const [cx, cz] = k.split(',').map(Number)
      m.set(k, [(cx + 0.5) * 150, (cz + 0.5) * 150, 110])
    }
    return m
  }, [chunks, decor])
  const grass = useMemo(() => {
    const [x0, z0, x1, z1] = sim.world.bounds
    return { geo: groundPlane(x1 - x0, z1 - z0, TILE_M.grass), x: (x0 + x1) / 2, z: (z0 + z1) / 2 }
  }, [sim.world])
  useFrame(() => {
    const { x, z } = sim.state.car
    const view = VIEW_M[quality]
    for (const [k, g] of groups.current) {
      const c = centres.get(k)
      if (c) g.visible = Math.hypot(c[0] - x, c[1] - z) - c[2] < view - 110
    }
  })
  // A világ elemei (burkolat, házak, táblák, fák, lámpák) nem mozognak: a mátrixaikat egyszer kiszámítjuk, és nem
  // számoljuk újra minden képkockán (a tükrökkel együtt képkockánként négyszer) – ez a legnagyobb megtakarítás.
  // A később betöltődő modellek (pl. a lámpaoszlop) miatt pár másodperc múlva újra „befagyasztjuk”.
  useEffect(() => {
    const freeze = () => {
      for (const g of groups.current.values())
        g.traverse((o) => {
          if (o === g) return
          o.updateMatrix()
          o.matrixAutoUpdate = false
          o.matrixWorldNeedsUpdate = true
        })
    }
    const ids = [window.setTimeout(freeze, 500), window.setTimeout(freeze, 3000), window.setTimeout(freeze, 8000)]
    return () => ids.forEach((id) => window.clearTimeout(id))
  }, [chunks, decor])
  const keys = [...centres.keys()]
  const chunkBy = new Map(chunks.map((c) => [c.key, c]))
  return (
    <>
      <mesh position={[grass.x, -0.03, grass.z]} rotation={[-Math.PI / 2, 0, 0]} geometry={grass.geo} material={surface('grass', { normalMaps: q.normalMaps })} receiveShadow />
      {keys.map((k) => {
        const c = chunkBy.get(k)
        const d = decor.get(k)
        return (
          <group
            key={k}
            ref={(g) => {
              if (g) groups.current.set(k, g)
              else groups.current.delete(k)
            }}
          >
            {c && <ChunkView c={c} normalMaps={q.normalMaps} />}
            {d?.signs.map((s, i) => (
              <group key={`s${i}`} position={[0, 0.15, 0]}>
                <SignPost post={{ codes: s.codes, x: s.at[0], z: s.at[1], rotY: s.rotY, size: 0.9 }} />
              </group>
            ))}
            {d?.lights.map((l, i) => (
              <SimLight key={`l${i}`} site={l} sim={sim} />
            ))}
            {d && d.furniture.length > 0 && <StreetFurniture list={d.furniture} />}
          </group>
        )
      })}
    </>
  )
})

function SimSceneImpl({ sim, input, paused, chase, onFrame }: SimSceneProps) {
  const quality = useQuality()
  const focus = useMemo<[number, number, number]>(() => [sim.state.car.x, 0, sim.state.car.z], [sim])
  // A burkolati jelek a burkolat fölött, a mélységi pontatlanság (villódzás) ellen eltolva
  useEffect(() => {
    const m = roadPaint()
    m.polygonOffset = true
    m.polygonOffsetFactor = -2
    m.polygonOffsetUnits = -2
  }, [])
  return (
    <div className="scene3d sim-3d">
      <Canvas dpr={quality.dpr} shadows gl={{ antialias: true }} camera={{ fov: 70, near: 0.05, far: 450 }} aria-label="Vezetés a vezetőülésből">
        <SceneLook quality={quality} focus={focus} radius={55} />
        <SimLoop sim={sim} input={input} paused={paused} focus={focus} onFrame={onFrame} />
        <WorldView sim={sim} />
        <PlayerCar sim={sim} />
        {sim.traffic && <TrafficView traffic={sim.traffic} />}
        <WorldMatrices />
        <DriverAndMirrors
          poseNow={() => ({ pose: sim.state.car })}
          look={() => sim.state.look}
          mirrorsOn={() => !sim.state.look.startsWith('shoulder') && sim.state.look !== 'back'}
          chase={() => chase.current ?? false}
        />
      </Canvas>
    </div>
  )
}

/** (Memoizálva: csak akkor rajzolódik újra, ha a szimuláció vagy a bemenet változik) */
const SimScene = memo(SimSceneImpl)
export default SimScene
