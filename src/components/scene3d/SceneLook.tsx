import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Color, EquirectangularReflectionMapping, Fog, PCFShadowMap, type DirectionalLight, type Scene, type Texture, type WebGLRenderer } from 'three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import type { QualityProfile } from './quality'

/** Az égbolt színe HDR nélkül, és a köd színe (a horizont árnyalata) */
const SKY = '#bcd6ec'
const HAZE = '#c9d7e3'
/** Éjszakai égbolt és köd */
const NIGHT = '#05070d'

let sky: Promise<Texture | null> | null = null
function loadSky(): Promise<Texture | null> {
  sky ??= new Promise((resolve) => {
    new HDRLoader().load(
      `${import.meta.env.BASE_URL}3d/hdri/sky.hdr`,
      (t) => {
        t.mapping = EquirectangularReflectionMapping
        resolve(t)
      },
      undefined,
      () => resolve(null),
    )
  })
  return sky
}

/** A megjelenítő és a jelenet beállítása a minőség szerint; visszaadja a leállító függvényt */
function configure(gl: WebGLRenderer, scene: Scene, quality: QualityProfile, night: boolean): () => void {
  gl.shadowMap.enabled = quality.shadows > 0
  gl.shadowMap.type = PCFShadowMap
  gl.toneMappingExposure = quality.hdri && !night ? 0.95 : 1
  scene.fog = night ? new Fog(NIGHT, 20, 140) : new Fog(HAZE, 70, 220)
  scene.background = new Color(night ? NIGHT : SKY)
  let cancelled = false
  if (quality.hdri && !night) {
    void loadSky().then((t) => {
      if (cancelled || !t) return
      scene.environment = t
      scene.background = t
      scene.environmentIntensity = 0.9
    })
  } else scene.environment = null
  return () => {
    cancelled = true
  }
}

function fitShadow(light: DirectionalLight, radius: number) {
  const cam = light.shadow.camera
  cam.left = -radius
  cam.right = radius
  cam.top = radius
  cam.bottom = -radius
  cam.near = 1
  cam.far = 200
  cam.updateProjectionMatrix()
}

/**
 * A jelenet „kinézete”: HDR égbolt (háttér, fények és tükröződések), nap árnyékkal, köd.
 * Alacsony minőségen a régi, egyszerű megvilágítás marad (égszínű háttér, félgömb-fény), árnyék nélkül.
 * `focus`: a nap árnyéktérképe e pont körül, `radius` sugarú területet fed le (függvényként képkockánként lekérdezve,
 * ha a pont mozog).
 */
export function SceneLook({
  quality,
  focus = [0, 0, 15],
  radius = 45,
  night = false,
}: {
  quality: QualityProfile
  focus?: [number, number, number] | (() => [number, number, number])
  radius?: number
  /** Éjszaka: sötét égbolt és köd, gyenge holdfény */
  night?: boolean
}) {
  const { gl, scene } = useThree()
  const sun = useRef<DirectionalLight>(null)

  useEffect(() => configure(gl, scene, quality, night), [gl, scene, quality, night])
  // Az árnyék-kamera kiterjedése: a propokkal beállítva nem frissülne a vetítése (alapból csak ±5 m-t fedne le)
  useEffect(() => {
    if (sun.current) fitShadow(sun.current, radius)
  }, [radius])

  // A nap árnyék-kamerája a megadott terület fölött
  useFrame(() => {
    const s = sun.current
    if (!s) return
    const f = typeof focus === 'function' ? focus() : focus
    s.position.set(f[0] + 35, 60, f[2] + 28)
    s.target.position.set(f[0], 0, f[2])
    s.target.updateMatrixWorld()
  })

  return (
    <>
      <hemisphereLight args={night ? ['#3b4a6b', '#0b0f18', 0.25] : ['#ffffff', '#6b7d5c', quality.hdri ? 0.35 : 1.15]} />
      <directionalLight
        ref={sun}
        intensity={night ? 0.08 : quality.hdri ? 2.2 : 1.5}
        color={night ? '#9fb3d9' : '#fff4e2'}
        castShadow={quality.shadows > 0}
        shadow-mapSize-width={quality.shadows || 512}
        shadow-mapSize-height={quality.shadows || 512}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
    </>
  )
}
