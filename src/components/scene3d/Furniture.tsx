import { useEffect, useMemo, useState } from 'react'
import { CanvasTexture, IcosahedronGeometry, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, type BufferGeometry, type Object3D } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Furniture3D } from './layout'

/**
 * Utcabútorok: a Poly Haven közvilágítási lámpája és beton útelzáró eleme (CC0 glTF modellek, public/3d/models),
 * valamint egyszerű, de természetes hatású fák. A modellek a háttérben töltődnek; ha nem érhetők el, egyszerűen
 * kimaradnak (a jelenet enélkül is teljes).
 */

export type ModelName = 'street_lamp' | 'road_barrier'

const loader = new GLTFLoader()
const models = new Map<ModelName, Promise<Object3D | null>>()

function loadModel(name: ModelName): Promise<Object3D | null> {
  let p = models.get(name)
  if (!p) {
    p = new Promise((resolve) => {
      loader.load(
        `${import.meta.env.BASE_URL}3d/models/${name}/${name}.gltf`,
        (g) => {
          g.scene.traverse((o) => {
            o.castShadow = true
            o.receiveShadow = true
          })
          resolve(g.scene)
        },
        undefined,
        () => resolve(null),
      )
    })
    models.set(name, p)
  }
  return p
}

/** Egy betöltött modell példánya (a geometria és az anyagok közösek) */
export function Model({ name, scale = 1 }: { name: ModelName; scale?: number }) {
  const [src, setSrc] = useState<Object3D | null>(null)
  useEffect(() => {
    let alive = true
    void loadModel(name).then((m) => alive && setSrc(m))
    return () => {
      alive = false
    }
  }, [name])
  const clone = useMemo(() => src?.clone(true) ?? null, [src])
  if (!clone) return null
  return <primitive object={clone} scale={scale} />
}

// ---------------------------------------------------------------- fa

const bark = new MeshStandardMaterial({ color: '#5a4636', roughness: 0.95 })

/** Lombozat-minta: sok apró, különböző árnyalatú levélfolt, hogy a korona ne legyen egyszínű felület */
function foliageTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const g = c.getContext('2d')
  if (!g) return null
  g.fillStyle = '#5d7f43'
  g.fillRect(0, 0, 256, 256)
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 2600; i++) {
    const l = 22 + rnd() * 30
    g.fillStyle = `hsl(${88 + rnd() * 30}, ${38 + rnd() * 25}%, ${l}%)`
    g.beginPath()
    g.ellipse(rnd() * 256, rnd() * 256, 2 + rnd() * 4, 1.5 + rnd() * 3, rnd() * Math.PI, 0, Math.PI * 2)
    g.fill()
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.wrapS = RepeatWrapping
  t.wrapT = RepeatWrapping
  t.repeat.set(3, 3)
  return t
}
const foliage = foliageTexture()
const leaves = ['#ffffff', '#e6f0d6', '#d4e3c2'].map((c) => new MeshStandardMaterial({ color: c, map: foliage, roughness: 0.95 }))

/** Lombkorona: szabálytalanná tett, simított gömb (a csúcsokat zajjal kifelé-befelé mozgatjuk) */
function canopyGeometry(seed: number): BufferGeometry {
  // Az összevont csúcsok miatt a normálok simák lesznek (nem látszanak a háromszögek)
  const g = mergeVertices(new IcosahedronGeometry(1, 4))
  const pos = g.getAttribute('position')
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const n = 0.82 + 0.18 * Math.sin(x * 5.1 + seed) * Math.cos(y * 4.3 + seed * 1.7) + 0.08 * Math.sin(z * 7.9 + seed * 2.3)
    pos.setXYZ(i, x * n, y * n, z * n)
  }
  g.computeVertexNormals()
  return g
}
const canopies = [0, 1, 2, 3].map((s) => canopyGeometry(s * 1.37))

function Tree({ seed }: { seed: number }) {
  const h = 2.6 + (seed % 3) * 0.4
  const leaf = leaves[seed % leaves.length]
  return (
    <group>
      <mesh position={[0, h / 2, 0]} material={bark} castShadow>
        <cylinderGeometry args={[0.1, 0.16, h, 8]} />
      </mesh>
      <mesh position={[0, h + 1.1, 0]} scale={[1.9, 1.6, 1.9]} geometry={canopies[seed % 4]} material={leaf} castShadow receiveShadow />
      <mesh position={[0.7, h + 0.5, 0.3]} scale={[1.2, 1.0, 1.2]} geometry={canopies[(seed + 1) % 4]} material={leaf} castShadow />
      <mesh position={[-0.6, h + 0.7, -0.4]} scale={[1.1, 1.0, 1.1]} geometry={canopies[(seed + 2) % 4]} material={leaf} castShadow />
      {/* Fa körüli rács a járdában */}
      <mesh position={[0, 0.155, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.2, 1.2]} />
        <meshStandardMaterial color="#3d3a35" roughness={0.9} />
      </mesh>
    </group>
  )
}

/** A járdák lámpái és fái */
export function StreetFurniture({ list }: { list: Furniture3D[] }) {
  return (
    <group>
      {list.map((f, i) => (
        <group key={i} position={[f.x, 0.15, f.z]} rotation={[0, f.rotY, 0]}>
          {f.kind === 'lamp' ? <Model name="street_lamp" scale={1.25} /> : <Tree seed={i * 7 + Math.round(f.z)} />}
        </group>
      ))}
    </group>
  )
}
