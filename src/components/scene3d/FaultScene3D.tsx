import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import type { Group, Light, MeshBasicMaterial, Object3D, SpotLight } from 'three'
import type { Frame } from '../../domain/faults/timeline'
import type { RailLight } from '../../domain/questions'
import type { Actor, Blink, Lesson, WorldLight } from '../../domain/faults/types'
import { carToWorld } from '../../domain/maneuvers/geometry'
import type { Look } from '../../domain/maneuvers/types'
import { AutoShadows } from './AutoShadows'
import { DriverAndMirrors } from './DriverMirrors'
import { CENTER_F, LOOK_YAW, MIRRORS, OWN_CAR_LAYER } from './driverView'
import type { Rect } from './layout'
import { PED_LOOKS } from './looks'
import { PERSON_MODELS } from './models'
import { Buildings, CarModel, Ground, HumanFigure, RailBarrier, RailLights, RailTrack, SignPost, Van, type Clock } from './parts'
import { Person } from './people'
import { Props } from './props'
import { useQuality, type QualityProfile } from './quality'
import { SceneLook } from './SceneLook'

export interface FaultView {
  lesson: Lesson
  /** A jelenet most (minden képkockánál lekérdezve) */
  frameNow: () => Frame
  /** Kívülről, a kocsi mögül (a saját autó is látszik) */
  chase: boolean
}

/** Álló óra a Props elemeinek (a mozgást itt a lecke adja) */
const STILL: Clock = { progress: () => 0, sinceStop: () => 0, elapsed: () => 0 }

const blinkOf = (b: Blink): 'left' | 'right' | undefined => (b === 'left' || b === 'right' ? b : b === 'hazard' ? 'left' : undefined)

/** A szereplő a lecke szerint mozog; az irányjelzője csak váltáskor rajzolódik újra */
function ActorView({ a, index, frameNow, night }: { a: Actor; index: number; frameNow: () => Frame; night: boolean }) {
  const ref = useRef<Group>(null)
  const [blink, setBlink] = useState<Blink>('off')
  const isCar = a.kind === 'own' || a.kind === 'car'
  // Gyalogos: a lépés a haladási sebességhez igazodik
  const speed = useRef(0)
  const last = useRef<[number, number] | null>(null)
  const legL = useRef<Group>(null)
  const legR = useRef<Group>(null)
  const armL = useRef<Group>(null)
  const armR = useRef<Group>(null)
  useFrame(({ clock }, dt) => {
    const f = frameNow().actors[a.id]
    if (!f || !ref.current) return
    const [x, z] = isCar ? carToWorld(f.pose, CENTER_F, 0) : [f.pose.x, f.pose.z]
    ref.current.position.set(x, 0, z)
    ref.current.rotation.set(0, -f.pose.heading, 0)
    // A saját autó a vezető szeméből rejtett rétegen (a tükrökben látszik); a fényszóró fénye maradjon a közös rétegen
    if (a.kind === 'own') ref.current.traverse((o) => !(o as Light).isLight && o.layers.set(OWN_CAR_LAYER))
    if (f.blink !== blink) setBlink(f.blink)
    if (a.kind === 'ped') {
      if (last.current && dt > 0) speed.current = Math.hypot(x - last.current[0], z - last.current[1]) / dt
      last.current = [x, z]
      const swing = f.moving ? Math.sin(clock.elapsedTime * 6.5) : 0
      if (legL.current) legL.current.rotation.x = swing * 0.5
      if (legR.current) legR.current.rotation.x = -swing * 0.5
      if (armL.current) armL.current.rotation.x = -swing * 0.45
      if (armR.current) armR.current.rotation.x = swing * 0.45
    }
  })
  let body
  switch (a.kind) {
    case 'own':
    case 'car':
      body = <CarModel color={a.color ?? '#9ca3af'} blink={blinkOf(blink)} />
      break
    case 'bus':
      body = <Props list={[{ kind: 'bus', at: [0, 0], rotY: 0, blink: blink === 'left' ? 'left' : undefined }]} clock={STILL} />
      break
    case 'bike':
      body = <Props list={[{ kind: 'cyclist', at: [0, 0], rotY: 0 }]} clock={STILL} />
      break
    case 'ambulance':
      body = <Van x={0} z={0} ambulance />
      break
    case 'train':
      // A modell origója a mozdony közepén van: a szerelvény közepe legyen a szereplő helye
      body = <Props list={[{ kind: 'train', at: [0, -19.75], rotY: 0 }]} clock={STILL} />
      break
    case 'tram':
      body = <Props list={[{ kind: 'tram', at: [0, 0], rotY: 0, size: [2.4, 27] }]} clock={STILL} />
      break
    case 'ped':
      body = (
        <Person
          name={PERSON_MODELS[index % PERSON_MODELS.length]}
          height={1.66 + (index % 3) * 0.06}
          speed={() => speed.current}
          fallback={<HumanFigure look={PED_LOOKS[index % PED_LOOKS.length]} limbs={{ legL, legR, armL, armR }} />}
        />
      )
  }
  return (
    <group ref={ref}>
      {body}
      {night && (a.kind === 'own' || a.kind === 'car') && <Headlights frameNow={frameNow} own={a.kind === 'own'} />}
    </group>
  )
}

/** A fényszóró hatótávja (m) a világítás állása szerint */
const BEAM_RANGE: Record<string, number> = { off: 0, low: 40, fog: 18, high: 110 }

/** Éjszaka a jármű fényszórója: a saját autóé a műszerfal szerinti állásban, a többieké tompítva */
function Headlights({ frameNow, own }: { frameNow: () => Frame; own: boolean }) {
  const light = useRef<SpotLight>(null)
  const target = useRef<Object3D>(null)
  useFrame(() => {
    if (!light.current || !target.current) return
    const range = own ? BEAM_RANGE[frameNow().controls.lights] : BEAM_RANGE.low
    light.current.distance = range
    light.current.intensity = range ? (range > 60 ? 260 : 120) : 0
    light.current.angle = range > 60 ? 0.42 : 0.6
    light.current.target = target.current
  })
  return (
    <>
      <spotLight ref={light} position={[0, 0.75, -2.3]} penumbra={0.5} decay={1.4} color="#fff3d6" />
      <object3D ref={target} position={[0, 0, -30]} />
    </>
  )
}

/** Jelzőlámpa, amelynek a jelzése a lecke szerint változik (a villogó sárgát is) */
function LiveLight({ light, frameNow }: { light: WorldLight; frameNow: () => Frame }) {
  const red = useRef<MeshBasicMaterial>(null)
  const yellow = useRef<MeshBasicMaterial>(null)
  const green = useRef<MeshBasicMaterial>(null)
  const arrow = useRef<MeshBasicMaterial>(null)
  useFrame(({ clock }) => {
    if (light.arrow) arrow.current?.color.set(frameNow().signals[light.arrow] === 'green' ? '#22c55e' : '#262626')
    const s = frameNow().signals[light.id] ?? 'red'
    const flashOn = Math.floor(clock.elapsedTime * 1.6) % 2 === 0
    red.current?.color.set(s === 'red' || s === 'red_yellow' ? '#ef4444' : '#262626')
    yellow.current?.color.set(s === 'yellow' || s === 'red_yellow' || (s === 'flashing_yellow' && flashOn) ? '#facc15' : '#262626')
    green.current?.color.set(s === 'green' ? '#22c55e' : '#262626')
  })
  const lamp = (y: number, ref: React.Ref<MeshBasicMaterial>) => (
    <mesh position={[0, y, 0.16]}>
      <circleGeometry args={[0.11, 24]} />
      <meshBasicMaterial ref={ref} color="#262626" toneMapped={false} />
    </mesh>
  )
  const height = 3
  return (
    <group position={[light.x, 0, light.z]} rotation={[0, light.facing, 0]}>
      <mesh position={[0, height / 2, 0]}>
        <cylinderGeometry args={[0.06, 0.06, height, 10]} />
        <meshStandardMaterial color="#374151" />
      </mesh>
      <group position={[0, height + 0.45, 0]}>
        <mesh>
          <boxGeometry args={[0.36, 0.95, 0.3]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
        {lamp(0.3, red)}
        {lamp(0, yellow)}
        {lamp(-0.3, green)}
      </group>
      {light.arrow && (
        // Kiegészítő lámpa a fő lámpa mellett, jobbra mutató nyíllal
        <group position={[0.38, height + 0.15, 0]}>
          <mesh>
            <boxGeometry args={[0.3, 0.32, 0.26]} />
            <meshStandardMaterial color="#111827" />
          </mesh>
          <mesh position={[0, 0, 0.14]} rotation={[0, 0, -Math.PI / 2]}>
            <circleGeometry args={[0.1, 3]} />
            <meshBasicMaterial ref={arrow} color="#262626" toneMapped={false} />
          </mesh>
        </group>
      )}
    </group>
  )
}

/** A nap árnyéka a kocsi körül, és a nézési irány váltása (csak váltáskor rajzol újra) */
function Follow({ frameNow, ownId, look, onLook, quality, night }: { frameNow: () => Frame; ownId?: string; look: Look; onLook: (l: Look) => void; quality: QualityProfile; night: boolean }) {
  useFrame(() => {
    const l = frameNow().look
    if (l !== look) onLook(l)
  })
  const focus = (): [number, number, number] => {
    const p = ownId ? frameNow().actors[ownId].pose : { x: 0, z: 0 }
    return [p.x, 0, p.z - 10]
  }
  return <SceneLook quality={quality} focus={focus} radius={40} night={night} />
}

/** Vasúti átjáró: sínek, fénysorompó és félsorompó; a jelzés és a sorompó a lecke szerint vált */
function LiveRail({ rail, frameNow }: { rail: NonNullable<Lesson['world']['rail']>; frameNow: () => Frame }) {
  const [state, setState] = useState<{ light: RailLight; down: boolean }>(() => ({ light: frameNow().rail, down: frameNow().barrier }))
  useFrame(() => {
    const f = frameNow()
    if (f.rail !== state.light || f.barrier !== state.down) setState({ light: f.rail, down: f.barrier })
  })
  const r3 = { z: rail.z, light: state.light, lightAt: rail.lightAt, barrier: rail.barrier ? { ...rail.barrier, down: state.down } : undefined }
  return (
    <>
      <RailTrack rail={r3} />
      <RailLights rail={r3} />
      <RailBarrier rail={r3} />
    </>
  )
}

/** Tócsa: sötét, fényes folt az úttesten */
function Puddle({ r }: { r: Rect }) {
  return (
    <mesh position={[r.x, 0.025, r.z]} rotation={[-Math.PI / 2, 0, 0]} scale={[r.w / 2, r.d / 2, 1]}>
      <circleGeometry args={[1, 32]} />
      <meshStandardMaterial color="#3b4f6b" roughness={0.05} metalness={0.3} transparent opacity={0.8} />
    </mesh>
  )
}

/**
 * Egy hibakód-lecke 3D-ben, a vezetőülésből (tükrökkel), vagy kívülről a kocsi mögül. A szereplők, a lámpák és a
 * nézési irány minden képkockánál a lecke órájából jönnek.
 */
export default function FaultScene3D({ lesson, frameNow, chase }: FaultView) {
  const quality = useQuality()
  const { world } = lesson
  const own = lesson.actors.find((a) => a.kind === 'own')
  const ground = useMemo(() => ({ asphalt: world.asphalt as Rect[], sidewalks: world.sidewalks as Rect[], markings: world.markings as Rect[], ring: world.ring }), [world])
  const signs = useMemo(() => (world.signs ?? []).map((s) => ({ codes: [s.code], x: s.x, z: s.z, rotY: s.facing, size: 0.9 })), [world])
  const [look, setLook] = useState(frameNow().look)
  const lookingBack = !chase && Math.abs(LOOK_YAW[look]) > 1.5
  const poseNow = () => ({ pose: own ? frameNow().actors[own.id].pose : { x: 0, z: 0, heading: 0 } })
  return (
    <div className="scene3d maneuver-3d">
      <Canvas dpr={quality.dpr} shadows gl={{ antialias: true }} camera={{ fov: 72, near: 0.05, far: 300 }} aria-label="3D nézet">
        <AutoShadows enabled={quality.shadows > 0} />
        <Follow frameNow={frameNow} ownId={own?.id} look={look} onLook={setLook} quality={quality} night={!!world.night} />
        <Ground layout={ground} />
        <Buildings list={world.buildings ?? []} />
        {signs.map((s, i) => (
          <SignPost key={i} post={s} />
        ))}
        {(world.lights ?? []).map((l, i) => (
          <LiveLight key={i} light={l} frameNow={frameNow} />
        ))}
        {world.rail && <LiveRail rail={world.rail} frameNow={frameNow} />}
        {(world.extras ?? []).length > 0 && (
          <Props
            list={(world.extras ?? []).map((x) => ({ kind: x.kind, at: [x.x, x.z] as [number, number], rotY: x.rotY ?? 0, size: [x.w, x.d] as [number, number] }))}
            clock={STILL}
          />
        )}
        {(world.puddles ?? []).map((r, i) => (
          <Puddle key={i} r={r as Rect} />
        ))}
        {lesson.actors.map((a, i) => (
          <ActorView key={a.id} a={a} index={i} frameNow={frameNow} night={!!world.night} />
        ))}
        <DriverAndMirrors poseNow={poseNow} look={() => frameNow().look} mirrorsOn={!lookingBack} chase={chase} />
      </Canvas>
      {!chase && !lookingBack && (
        <>
          <svg className="cockpit" viewBox="0 0 1000 160" preserveAspectRatio="none" aria-hidden>
            <path d="M0 160 L0 112 Q500 70 1000 112 L1000 160 Z" fill="#161a21" />
          </svg>
          {MIRRORS.map((m) => (
            <div
              key={m.id}
              className={`mirror-frame ${look === m.id ? 'active' : ''}`}
              style={{ left: `${m.rect.left * 100}%`, bottom: `${m.rect.bottom * 100}%`, width: `${m.rect.w * 100}%`, height: `${m.rect.h * 100}%` }}
              aria-hidden
            />
          ))}
        </>
      )}
      {lookingBack && <div className="look-back">Hátrafelé nézel, a {LOOK_YAW[look] > 0 ? 'jobb' : 'bal'} vállad fölött</div>}
    </div>
  )
}
