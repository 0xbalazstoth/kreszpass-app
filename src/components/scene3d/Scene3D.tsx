import { Canvas } from '@react-three/fiber'
import { useMemo, useState } from 'react'
import type { Scene } from '../../domain/questions'
import { buildLayout } from './layout'
import { Buildings, DriverCamera, Ground, PartnerCar, Pedestrian, RailBarrier, RailLights, RailTrack, SignPost, TrafficLight, Van, type Clock } from './parts'
import { AutoShadows } from './AutoShadows'
import { StreetFurniture } from './Furniture'
import { Props, RearMirror } from './props'
import { useQuality } from './quality'
import { SceneLook } from './SceneLook'
import { useSiren } from './siren'

interface Props {
  scene: Scene
  /** Közeledéssel indul-e (a helyzet első kérdésénél), vagy már a megállási ponton áll */
  animate: boolean
  approachMs: number
}

const TURN_HUD: Record<Scene['turn'], { arrow: string; text: string }> = {
  straight: { arrow: '↑', text: 'Egyenesen' },
  left: { arrow: '↰', text: 'Balra kanyarodsz' },
  right: { arrow: '↱', text: 'Jobbra kanyarodsz' },
}

/**
 * Vezetőülésből látott 3D jelenet: valódi táblák, működő lámpa, mozgó partnerek.
 * Külön csomagba kerül (React.lazy), hogy a three.js csak itt töltődjön be.
 */
export default function Scene3D({ scene, animate, approachMs }: Props) {
  const quality = useQuality()
  const layout = useMemo(() => buildLayout(scene, quality.furnitureSpacing), [scene, quality.furnitureSpacing])
  // A közeledés kezdete: a komponens létrejöttekor rögzítjük
  const [startedAt] = useState(() => performance.now() - (animate ? 0 : approachMs))
  const clock = useMemo<Clock>(
    () => ({
      progress: () => Math.min(1, (performance.now() - startedAt) / approachMs),
      sinceStop: () => Math.max(0, (performance.now() - startedAt - approachMs) / 1000),
      elapsed: () => (performance.now() - startedAt) / 1000,
    }),
    [approachMs, startedAt],
  )
  const ring = scene.roundabout
  const hud = ring ? { arrow: '↻', text: `${ring.exit}. kijárat` } : TURN_HUD[scene.turn]
  useSiren(!!layout.siren)

  return (
    <div className="scene3d">
      <Canvas
        dpr={quality.dpr}
        shadows
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: 68, near: 0.1, far: 320, position: [layout.camera.x, layout.camera.y, layout.camera.startZ] }}
        aria-label="3D nézet a vezetőülésből"
      >
        <SceneLook quality={quality} focus={[0, 0, (layout.camera.startZ + layout.camera.stopZ) / 2 - 10]} />
        <Ground layout={layout} />
        <Buildings list={layout.buildings} />
        {layout.rail && (
          <>
            <RailTrack rail={layout.rail} />
            <RailLights rail={layout.rail} />
            <RailBarrier rail={layout.rail} />
          </>
        )}
        {layout.signs.map((s, i) => (
          <SignPost key={i} post={s} />
        ))}
        {layout.lights.map((l, i) => (
          <TrafficLight key={i} light={l} />
        ))}
        {layout.cars.map((c, i) => {
          const intent = scene.cars[i]?.intent
          return <PartnerCar key={i} car={c} clock={clock} blink={intent === 'left' || intent === 'right' ? intent : undefined} />
        })}
        {layout.peds.map((p, i) => (
          <Pedestrian key={i} ped={p} clock={clock} index={i} sidewalks={layout.sidewalks} />
        ))}
        {layout.blocker && <Van x={layout.blocker.x} z={layout.blocker.z} />}
        {layout.props && <Props list={layout.props} clock={clock} sidewalks={layout.sidewalks} />}
        {layout.furniture && <StreetFurniture list={layout.furniture} />}
        <AutoShadows enabled={quality.shadows > 0} />
        <DriverCamera layout={layout} clock={clock} />
        {layout.mirror && <RearMirror />}
      </Canvas>
      {/* A saját autó a vezetőülésből: motorháztető és műszerfal */}
      <svg className="cockpit" viewBox="0 0 1000 160" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="hood" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2f5fe0" />
            <stop offset="1" stopColor="#15307a" />
          </linearGradient>
        </defs>
        <path d="M180 160 L330 38 Q500 22 670 38 L820 160 Z" fill="url(#hood)" />
        <path d="M0 160 L0 118 Q500 78 1000 118 L1000 160 Z" fill="#161a21" />
      </svg>
      {layout.mirror && <div className="rear-mirror" aria-label="Visszapillantó tükör" />}
      <div className={`hud ${scene.turn !== 'straight' || ring ? 'turning' : ''}`} aria-hidden>
        <span className="hud-arrow">{hud.arrow}</span>
        {hud.text}
      </div>
    </div>
  )
}
