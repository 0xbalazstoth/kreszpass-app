import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import type { Mesh } from 'three'

/** Lapos (talaj, burkolati jel, táblalap) hálók: ezek nem vetnek árnyékot, csak fogadják */
const FLAT = new Set(['PlaneGeometry', 'RingGeometry', 'CircleGeometry'])

/**
 * Minden test (járművek, emberek, villamos, oszlopok) árnyékot vet és fogad; a lapos felületek csak fogadnak.
 * Fél másodpercenként átnézi a jelenetet, mert a modellek később töltődnek be.
 */
export function AutoShadows({ enabled }: { enabled: boolean }) {
  const { scene } = useThree()
  const last = useRef(0)
  useFrame(({ clock }) => {
    if (!enabled || clock.elapsedTime - last.current < 0.5) return
    last.current = clock.elapsedTime
    scene.traverse((o) => {
      const m = o as Mesh
      if (!m.isMesh) return
      const flat = FLAT.has(m.geometry.type)
      if (!flat && !m.castShadow) m.castShadow = true
      if (!m.receiveShadow) m.receiveShadow = true
    })
  })
  return null
}
