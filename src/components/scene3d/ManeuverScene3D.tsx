import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { Group } from 'three'
import { carToWorld, pointOnCar, type Pose, type Segment } from '../../domain/maneuvers/geometry'
import type { Look, ManeuverStep, Site } from '../../domain/maneuvers/types'
import type { Rect } from './layout'
import { AutoShadows } from './AutoShadows'
import { DriverAndMirrors } from './DriverMirrors'
import { CENTER_F, LOOK_YAW, MIRRORS, OWN_CAR_LAYER } from './driverView'
import { CarModel, Ground } from './parts'
import { useQuality } from './quality'
import { SceneLook } from './SceneLook'

export interface ManeuverView {
  site: Site
  /** A kocsi helyzete most (minden képkockánál lekérdezve) */
  poseNow: () => { pose: Pose; segment: Segment | null }
  look: Look
  /** Az aktuális lépés referenciapontja és a lépés kezdő pózában a hozzá tartozó kocsipont */
  refLine?: { ref: NonNullable<ManeuverStep['ref']>; start: Pose }
  reversing: boolean
}

function ParkedCar({ pose, color }: { pose: Pose; color: string }) {
  const [x, z] = carToWorld(pose, CENTER_F, 0)
  return (
    <group position={[x, 0, z]} rotation={[0, -pose.heading, 0]}>
      <CarModel color={color} />
    </group>
  )
}

function OwnCar({ poseNow }: { poseNow: ManeuverView['poseNow'] }) {
  const ref = useRef<Group>(null)
  useFrame(() => {
    const { pose } = poseNow()
    const [x, z] = carToWorld(pose, CENTER_F, 0)
    ref.current?.position.set(x, 0, z)
    ref.current?.rotation.set(0, -pose.heading, 0)
    // Minden képkockán: a modell a háttérben töltődik be, az új részei is a saját rétegre kerüljenek
    ref.current?.traverse((o) => o.layers.set(OWN_CAR_LAYER))
  })
  return (
    <group ref={ref}>
      <CarModel color="#2563eb" />
    </group>
  )
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
  const quality = useQuality()
  const ground = useMemo(() => {
    const rect = (r: Site['asphalt'][number]): Rect => ({ x: r.x, z: r.z, w: r.w, d: r.d, rotY: r.rotY })
    return { asphalt: site.asphalt.map(rect), sidewalks: site.kerbs.map(rect), markings: site.markings.map(rect) }
  }, [site])
  const lookingBack = Math.abs(LOOK_YAW[look]) > 1.5
  return (
    <div className="scene3d maneuver-3d">
      <Canvas dpr={quality.dpr} shadows gl={{ antialias: true }} camera={{ fov: 72, near: 0.05, far: 250 }} aria-label="3D nézet a vezetőülésből">
        <SceneLook quality={quality} focus={[(site.bounds[0] + site.bounds[2]) / 2, 0, (site.bounds[1] + site.bounds[3]) / 2]} radius={30} />
        <AutoShadows enabled={quality.shadows > 0} />
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
