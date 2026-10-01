import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { PerspectiveCamera, type Group } from 'three'
import { carToWorld, forward, pointOnCar, type Pose, type Segment } from '../../domain/maneuvers/geometry'
import type { Look, ManeuverStep, Site } from '../../domain/maneuvers/types'
import type { Rect } from './layout'
import { CarModel, Ground } from './parts'

export interface ManeuverView {
  site: Site
  /** A kocsi helyzete most (minden képkockánál lekérdezve) */
  poseNow: () => { pose: Pose; segment: Segment | null }
  look: Look
  /** Az aktuális lépés referenciapontja és a lépés kezdő pózában a hozzá tartozó kocsipont */
  refLine?: { ref: NonNullable<ManeuverStep['ref']>; start: Pose }
  reversing: boolean
}

/** Merre fordítja a fejét a vezető (radián, + = jobbra a menetirányhoz képest) */
const LOOK_YAW: Record<Look, number> = {
  ahead: 0,
  mirror_left: -0.6,
  mirror_right: 0.75,
  mirror_inner: 0,
  shoulder_left: -2.35,
  shoulder_right: 2.45,
  back: 2.85,
}

/** A visszapillantó tükrök: helyük a kocsin [előre, jobbra, magasság], nézési irányuk (a hátrafelé iránytól), és a képernyőn */
const MIRRORS = [
  { id: 'mirror_left', at: [1.95, -1.02, 1.05], turn: 0.18, rect: { left: 0.02, bottom: 0.05, w: 0.24, h: 0.15 } },
  { id: 'mirror_inner', at: [1.75, 0, 1.32], turn: 0, rect: { left: 0.3, bottom: 0.83, w: 0.26, h: 0.13 } },
  { id: 'mirror_right', at: [1.95, 1.02, 1.05], turn: -0.18, rect: { left: 0.74, bottom: 0.05, w: 0.24, h: 0.15 } },
] as const

/** A kocsi közepe (a modell origója) a hátsó tengelytől 1,35 m-re előre */
const CENTER_F = 1.35

function ParkedCar({ pose, color }: { pose: Pose; color: string }) {
  const [x, z] = carToWorld(pose, CENTER_F, 0)
  return (
    <group position={[x, 0, z]} rotation={[0, -pose.heading, 0]}>
      <CarModel color={color} />
    </group>
  )
}

/** A saját autó külön rétegen: a vezető szemével nem látszik (különben a teteje kitöltené a képet), a tükrökben igen */
const OWN_CAR_LAYER = 1

function OwnCar({ poseNow }: { poseNow: ManeuverView['poseNow'] }) {
  const ref = useRef<Group>(null)
  useEffect(() => {
    ref.current?.traverse((o) => o.layers.set(OWN_CAR_LAYER))
  }, [])
  useFrame(() => {
    const { pose } = poseNow()
    const [x, z] = carToWorld(pose, CENTER_F, 0)
    ref.current?.position.set(x, 0, z)
    ref.current?.rotation.set(0, -pose.heading, 0)
  })
  return (
    <group ref={ref}>
      <CarModel color="#2563eb" />
    </group>
  )
}

/**
 * A vezető szeme a bal első ülésben; a fej a lépés szerint fordul (tükör, váll fölött hátra). Ez a komponens rajzolja
 * a fő képet és a három tükör képét is (külön kamerákkal, a képernyő egy-egy kivágásába).
 */
function DriverAndMirrors({ poseNow, look, mirrorsOn }: { poseNow: ManeuverView['poseNow']; look: Look; mirrorsOn: boolean }) {
  const { gl, scene, camera, size } = useThree()
  const yaw = useRef(LOOK_YAW[look])
  const cams = useRef<PerspectiveCamera[] | null>(null)
  useFrame((_, dt) => {
    cams.current ??= MIRRORS.map(() => {
      const cam = new PerspectiveCamera(38, 1.6, 0.05, 200)
      // A tükrökben a saját autó oldala is látszik
      cam.layers.enable(OWN_CAR_LAYER)
      return cam
    })
    const { pose } = poseNow()
    // A fej fordulása simán, kb. fél másodperc alatt
    const want = LOOK_YAW[look]
    yaw.current += (want - yaw.current) * Math.min(1, dt * 6)
    const [ex, ez] = carToWorld(pose, 1.45, -0.37)
    camera.position.set(ex, 1.22, ez)
    const [fx, fz] = forward(pose.heading + yaw.current)
    camera.lookAt(ex + fx * 30, look === 'mirror_inner' ? 1.6 : 1.05, ez + fz * 30)

    gl.setScissorTest(false)
    gl.setViewport(0, 0, size.width, size.height)
    gl.render(scene, camera)
    if (!mirrorsOn) return
    MIRRORS.forEach((m, i) => {
      const cam = cams.current![i]
      const [mx, mz] = carToWorld(pose, m.at[0], m.at[1])
      cam.position.set(mx, m.at[2], mz)
      // Hátrafelé néz, a külső tükrök kissé kifelé
      const [bx, bz] = forward(pose.heading + Math.PI + m.turn)
      cam.lookAt(mx + bx * 20, 0.9, mz + bz * 20)
      const w = Math.round(size.width * m.rect.w)
      const h = Math.round(size.height * m.rect.h)
      cam.aspect = w / h
      cam.updateProjectionMatrix()
      const x = Math.round(size.width * m.rect.left)
      const y = Math.round(size.height * m.rect.bottom)
      gl.setScissorTest(true)
      gl.setScissor(x, y, w, h)
      gl.setViewport(x, y, w, h)
      gl.render(scene, cam)
    })
    gl.setScissorTest(false)
    gl.setViewport(0, 0, size.width, size.height)
  }, 1)
  return null
}

/** A lépés referenciavonala a földön (narancssárga): ehhez kell igazítani a kocsi megjelölt pontját */
function RefLine({ refLine }: { refLine: NonNullable<ManeuverView['refLine']> }) {
  const { ref, start } = refLine
  const [px, pz] = pointOnCar(start, ref.car)
  const along = ref.axis === 'z'
  return (
    <mesh position={[along ? px : ref.at[0], 0.02, along ? ref.at[1] : pz]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={along ? [6, 0.14] : [0.14, 6]} />
      <meshBasicMaterial color="#f59e0b" />
    </mesh>
  )
}

export default function ManeuverScene3D({ site, poseNow, look, refLine, reversing }: ManeuverView) {
  const ground = useMemo(() => {
    const rect = (r: Site['asphalt'][number]): Rect => ({ x: r.x, z: r.z, w: r.w, d: r.d, rotY: r.rotY })
    return { asphalt: site.asphalt.map(rect), sidewalks: site.kerbs.map(rect), markings: site.markings.map(rect) }
  }, [site])
  const lookingBack = Math.abs(LOOK_YAW[look]) > 1.5
  return (
    <div className="scene3d maneuver-3d">
      <Canvas dpr={[1, 2]} gl={{ antialias: true }} camera={{ fov: 72, near: 0.05, far: 250 }} aria-label="3D nézet a vezetőülésből">
        <color attach="background" args={['#bcd6ec']} />
        <fog attach="fog" args={['#bcd6ec', 60, 180]} />
        <hemisphereLight args={['#ffffff', '#6b7d5c', 1.15]} />
        <directionalLight position={[30, 60, 25]} intensity={1.5} />
        <Ground layout={ground} />
        {site.cars.map((c, i) => (
          <ParkedCar key={i} pose={c.pose} color={c.color} />
        ))}
        <OwnCar poseNow={poseNow} />
        {refLine && <RefLine refLine={refLine} />}
        <DriverAndMirrors poseNow={poseNow} look={look} mirrorsOn={!lookingBack} />
      </Canvas>
      {!lookingBack && (
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
      {reversing && <div className="gear-badge">R</div>}
    </div>
  )
}
