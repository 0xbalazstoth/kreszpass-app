import type { AnimationClip, Object3D } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

/**
 * A letöltött glTF modellek (public/3d/models) közös, gyorsítótárazott betöltése. Ha egy modell nem érhető el,
 * az eredmény null: a hívó ilyenkor a saját, egyszerűbb modelljét mutatja.
 */

export interface LoadedModel {
  scene: Object3D
  animations: AnimationClip[]
}

const loader = new GLTFLoader()
const cache = new Map<string, Promise<LoadedModel | null>>()

export function loadGltf(name: string, ext: 'glb' | 'gltf' = 'glb'): Promise<LoadedModel | null> {
  const key = `${name}.${ext}`
  let p = cache.get(key)
  if (!p) {
    p = new Promise((resolve) => {
      loader.load(
        `${import.meta.env.BASE_URL}3d/models/${name}/${name}.${ext}`,
        (g) => resolve({ scene: g.scene, animations: g.animations }),
        undefined,
        () => resolve(null),
      )
    })
    cache.set(key, p)
  }
  return p
}

/** A gyalogos-modellek (Quaternius, CC0): járás és állás animációval */
export const PERSON_MODELS = ['woman', 'man', 'woman_casual', 'man_suit', 'man_casual'] as const
export type PersonModel = (typeof PERSON_MODELS)[number] | 'worker'
