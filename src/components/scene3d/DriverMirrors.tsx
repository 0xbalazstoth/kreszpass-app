import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import { PerspectiveCamera } from 'three'
import { carToWorld, forward, type Pose } from '../../domain/maneuvers/geometry'
import type { Look } from '../../domain/maneuvers/types'
import { LOOK_YAW, MIRRORS, OWN_CAR_LAYER } from './driverView'

/**
 * A vezető szeme a bal első ülésben; a fej a nézés szerint fordul (tükör, váll fölött hátra). Ez a komponens rajzolja
 * a fő képet és a három tükör képét is (külön kamerákkal, a képernyő egy-egy kivágásába).
 * `chase`: a kocsi mögül, kívülről (a saját autó látszik, tükrök nélkül).
 */
export function DriverAndMirrors({
  poseNow,
  look,
  mirrorsOn,
  chase = false,
}: {
  poseNow: () => { pose: Pose }
  look: Look | (() => Look)
  mirrorsOn: boolean | (() => boolean)
  chase?: boolean | (() => boolean)
}) {
  const { gl, scene, camera, size } = useThree()
  const yaw = useRef(0)
  const cams = useRef<PerspectiveCamera[] | null>(null)
  useFrame((_, dt) => {
    cams.current ??= MIRRORS.map(() => {
      const cam = new PerspectiveCamera(38, 1.6, 0.05, 200)
      // A tükrökben a saját autó oldala is látszik
      cam.layers.enable(OWN_CAR_LAYER)
      return cam
    })
    const { pose } = poseNow()
    const lookNow = typeof look === 'function' ? look() : look
    const chaseNow = typeof chase === 'function' ? chase() : chase
    const mirrorsNow = typeof mirrorsOn === 'function' ? mirrorsOn() : mirrorsOn
    // A fej fordulása simán, kb. fél másodperc alatt
    const want = LOOK_YAW[lookNow]
    yaw.current += (want - yaw.current) * Math.min(1, dt * 6)
    if (chaseNow) {
      camera.layers.enable(OWN_CAR_LAYER)
      const [cx, cz] = carToWorld(pose, -5.2, 0)
      camera.position.set(cx, 2.9, cz)
      const [tx, tz] = carToWorld(pose, 6, 0)
      camera.lookAt(tx, 1.1, tz)
    } else {
      camera.layers.disable(OWN_CAR_LAYER)
      const [ex, ez] = carToWorld(pose, 1.45, -0.37)
      camera.position.set(ex, 1.22, ez)
      const [fx, fz] = forward(pose.heading + yaw.current)
      camera.lookAt(ex + fx * 30, lookNow === 'mirror_inner' ? 1.6 : 1.05, ez + fz * 30)
    }

    gl.setScissorTest(false)
    gl.setViewport(0, 0, size.width, size.height)
    gl.render(scene, camera)
    if (!mirrorsNow || chaseNow) return
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
