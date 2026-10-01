import { Component, lazy, Suspense, type ReactNode } from 'react'
import type { Scene } from '../../domain/questions'
import { SceneView } from '../SceneView'
import { loadManeuverScene3D, loadScene3D } from './load'
import { webglAvailable } from './webgl'

const Scene3D = lazy(loadScene3D)
export const ManeuverScene3D = lazy(loadManeuverScene3D)

/** Ha a 3D nézet hibát dob (pl. elveszett WebGL-környezet), a megadott tartalék jelenik meg */
export class Fallback extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

interface Props {
  scene: Scene
  animate: boolean
  approachMs: number
  enabled: boolean
}

/** 3D jelenet, ha lehet; különben (vagy hiba esetén) a felülnézeti vázlat */
export function DriveScene({ scene, animate, approachMs, enabled }: Props) {
  const flat = <SceneView scene={scene} approachMs={animate ? approachMs : 0} className="drive-flat" />
  if (!enabled || !webglAvailable()) return flat
  return (
    <Fallback fallback={flat}>
      <Suspense fallback={flat}>
        <Scene3D scene={scene} animate={animate} approachMs={approachMs} />
      </Suspense>
    </Fallback>
  )
}
