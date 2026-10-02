import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimationMixer, Box3, type AnimationAction, type Group, type Object3D } from 'three'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { loadGltf, type LoadedModel, type PersonModel } from './models'

/**
 * Valósághű gyalogos: csontvázas, animált modell (Quaternius, CC0) járás és állás animációval.
 * A modell a −Z felé néz (mint a jelenet többi szereplője), a talpa az origóban, a magassága `height` méter.
 * A `moving()` függvény mondja meg képkockánként, hogy épp halad-e, és milyen gyorsan (m/s): ehhez igazodik a lépés.
 */

const heights = new Map<PersonModel, number>()

/** A modell eredeti magassága (alappózban), egyszer kiszámolva */
function rawHeight(name: PersonModel, src: Object3D): number {
  let h = heights.get(name)
  if (!h) {
    const c = clone(src)
    c.updateMatrixWorld(true)
    h = new Box3().setFromObject(c, true).getSize(c.position.clone()).y || 1
    heights.set(name, h)
  }
  return h
}

/** A járás animáció ekkora sebességnél (m/s) néz ki természetesen */
const NATURAL_WALK = 1.25

export function Person({ name, height = 1.72, speed, fallback }: { name: PersonModel; height?: number; speed: () => number; fallback?: React.ReactNode }) {
  const [model, setModel] = useState<LoadedModel | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    void loadGltf(name).then((m) => {
      if (!alive) return
      if (m) setModel(m)
      else setFailed(true)
    })
    return () => {
      alive = false
    }
  }, [name])

  const inst = useMemo(() => {
    if (!model) return null
    const obj = clone(model.scene)
    obj.traverse((o) => {
      o.castShadow = true
      o.frustumCulled = false
    })
    const mixer = new AnimationMixer(obj)
    const walkClip = model.animations.find((a) => a.name === 'Walk')
    const idleClip = model.animations.find((a) => a.name === 'Idle')
    const walk = walkClip ? mixer.clipAction(walkClip) : null
    const idle = idleClip ? mixer.clipAction(idleClip) : null
    idle?.play()
    walk?.play()
    if (walk) walk.weight = 0
    return { obj, mixer, walk, idle, scale: height / rawHeight(name, model.scene) }
  }, [model, name, height])

  const blend = useRef(0)
  const group = useRef<Group>(null)
  useFrame((_, dt) => {
    if (!inst) return
    const v = speed()
    // Járás és állás közti átmenet, a lépés tempója a haladási sebességhez igazodik
    const target = v > 0.05 ? 1 : 0
    blend.current += (target - blend.current) * Math.min(1, dt * 5)
    setWeights(inst.walk, inst.idle, blend.current, v)
    inst.mixer.update(Math.min(dt, 0.1))
  })

  if (!inst) return failed || !model ? <>{fallback}</> : null
  return (
    <group ref={group} rotation={[0, Math.PI, 0]} scale={inst.scale}>
      <primitive object={inst.obj} />
    </group>
  )
}

function setWeights(walk: AnimationAction | null, idle: AnimationAction | null, blend: number, v: number) {
  if (walk) {
    walk.weight = blend
    walk.timeScale = Math.max(0.4, Math.min(1.6, v / NATURAL_WALK))
  }
  if (idle) idle.weight = 1 - blend
}
