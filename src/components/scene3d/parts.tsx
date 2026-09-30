import { useFrame, useLoader } from '@react-three/fiber'
import { Suspense, useRef, type Ref } from 'react'
import { SRGBColorSpace, TextureLoader, type Group, type Mesh, type MeshBasicMaterial, type Texture } from 'three'
import { signUrl } from '../../data/signs'
import type { LightState } from '../../domain/questions'
import { carPose, easeOut, type Building, type Car3D, type Layout3D, type Light3D, type Ped3D, type Rect, type SignPost3D } from './layout'

/** A közeledés 0..1 állása és az eltelt idő a kérdés megjelenése óta */
export interface Clock {
  progress(): number
  sinceStop(): number
}

const ASPHALT = '#4b5563'
const SIDEWALK = '#c7ccd3'
const GRASS = '#98b98a'
const WHITE = '#f3f4f6'

// ---------------------------------------------------------------- talaj, utak

function Flat({ r, y, color }: { r: Rect; y: number; color: string }) {
  return (
    <mesh position={[r.x, y, r.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[r.w, r.d]} />
      <meshStandardMaterial color={color} />
    </mesh>
  )
}

export function Ground({ layout }: { layout: Layout3D }) {
  return (
    <group>
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color={GRASS} />
      </mesh>
      {layout.asphalt.map((r, i) => (
        <Flat key={`a${i}`} r={r} y={0} color={ASPHALT} />
      ))}
      {layout.ring && (
        <>
          <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[layout.ring.inner, layout.ring.outer, 72]} />
            <meshStandardMaterial color={ASPHALT} />
          </mesh>
          <mesh position={[0, 0.2, 0]}>
            <cylinderGeometry args={[layout.ring.inner, layout.ring.inner, 0.4, 64]} />
            <meshStandardMaterial color="#6fa45a" />
          </mesh>
          <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[layout.ring.inner, layout.ring.inner + 0.25, 72]} />
            <meshBasicMaterial color={WHITE} />
          </mesh>
        </>
      )}
      {layout.sidewalks.map((r, i) => (
        <mesh key={`s${i}`} position={[r.x, 0.075, r.z]}>
          <boxGeometry args={[r.w, 0.15, r.d]} />
          <meshStandardMaterial color={SIDEWALK} />
        </mesh>
      ))}
      {layout.markings.map((r, i) => (
        <mesh key={`m${i}`} position={[r.x, 0.012, r.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[r.w, r.d]} />
          <meshBasicMaterial color={WHITE} />
        </mesh>
      ))}
    </group>
  )
}

export function Buildings({ list }: { list: Building[] }) {
  return (
    <group>
      {list.map((b, i) => (
        <mesh key={i} position={[b.x, b.h / 2, b.z]}>
          <boxGeometry args={[b.w, b.h, b.d]} />
          <meshStandardMaterial color={b.color} />
        </mesh>
      ))}
    </group>
  )
}

// ---------------------------------------------------------------- táblák

/** A táblák sRGB színtérben, élesen (anizotróp szűrés) töltődnek be */
class SignTextureLoader extends TextureLoader {
  load(url: string, onLoad?: (t: Texture<HTMLImageElement>) => void, onProgress?: (e: ProgressEvent) => void, onError?: (e: unknown) => void): Texture<HTMLImageElement> {
    return super.load(
      url,
      (t) => {
        t.colorSpace = SRGBColorSpace
        t.anisotropy = 8
        onLoad?.(t)
      },
      onProgress,
      onError,
    )
  }
}

function SignFace({ code, size, y }: { code: string; size: number; y: number }) {
  const tex = useLoader(SignTextureLoader, signUrl(code))
  const img = tex.image as HTMLImageElement
  const aspect = img.width / img.height || 1
  const w = aspect >= 1 ? size : size * aspect
  const h = aspect >= 1 ? size / aspect : size
  return (
    <group position={[0, y, 0]}>
      {/* Az oszlop (0,04 m sugarú) mögött: különben átlátszik a tábla közepén */}
      <mesh position={[0, 0, 0.07]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={tex} transparent alphaTest={0.4} toneMapped={false} />
      </mesh>
      {/* Hátlap: sötét, a tábla körvonalával */}
      <mesh position={[0, 0, 0.06]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={tex} color="#2b2f36" transparent alphaTest={0.4} />
      </mesh>
    </group>
  )
}

export function SignPost({ post }: { post: SignPost3D }) {
  const top = 2.2 + post.codes.length * (post.size + 0.12)
  return (
    <group position={[post.x, 0, post.z]} rotation={[0, post.rotY, 0]}>
      <mesh position={[0, top / 2, 0]}>
        <cylinderGeometry args={[0.04, 0.04, top, 10]} />
        <meshStandardMaterial color="#9ca3af" metalness={0.4} roughness={0.5} />
      </mesh>
      <Suspense fallback={null}>
        {post.codes.map((code, i) => (
          <SignFace key={code} code={code} size={post.size} y={top - post.size / 2 - i * (post.size + 0.12)} />
        ))}
      </Suspense>
    </group>
  )
}

// ---------------------------------------------------------------- jelzőlámpa

function lampColors(state: LightState): { red: boolean; yellow: boolean; green: boolean } {
  return {
    red: state === 'red' || state === 'red_yellow',
    yellow: state === 'yellow' || state === 'red_yellow' || state === 'flashing_yellow',
    green: state === 'green',
  }
}

export function TrafficLight({ light }: { light: Light3D }) {
  const on = lampColors(light.state)
  const yellow = useRef<MeshBasicMaterial>(null)
  useFrame(({ clock }) => {
    if (light.state !== 'flashing_yellow' || !yellow.current) return
    yellow.current.color.set(Math.floor(clock.elapsedTime * 1.6) % 2 === 0 ? '#facc15' : '#3a3212')
  })
  const lamp = (y: number, color: string, lit: boolean, ref?: Ref<MeshBasicMaterial>) => (
    <mesh position={[0, y, 0.16]}>
      <circleGeometry args={[0.11, 24]} />
      <meshBasicMaterial ref={ref} color={lit ? color : '#262626'} toneMapped={false} />
    </mesh>
  )
  return (
    <group position={[light.x, 0, light.z]} rotation={[0, light.rotY, 0]}>
      <mesh position={[0, light.height / 2, 0]}>
        <cylinderGeometry args={[0.06, 0.06, light.height, 10]} />
        <meshStandardMaterial color="#374151" />
      </mesh>
      <group position={[0, light.height + 0.45, 0]}>
        <mesh>
          <boxGeometry args={[0.36, 0.95, 0.3]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
        {lamp(0.3, '#ef4444', on.red)}
        {lamp(0, '#facc15', on.yellow, yellow)}
        {lamp(-0.3, '#22c55e', on.green)}
      </group>
    </group>
  )
}

// ---------------------------------------------------------------- járművek, gyalogosok

function CarModel({ color, blink }: { color: string; blink?: 'left' | 'right' }) {
  const left = useRef<Mesh>(null)
  const right = useRef<Mesh>(null)
  useFrame(({ clock }) => {
    const on = Math.floor(clock.elapsedTime * 2.5) % 2 === 0
    if (left.current) left.current.visible = blink === 'left' && on
    if (right.current) right.current.visible = blink === 'right' && on
  })
  return (
    <group>
      <mesh position={[0, 0.62, 0]}>
        <boxGeometry args={[1.8, 0.7, 4.2]} />
        <meshStandardMaterial color={color} metalness={0.3} roughness={0.45} />
      </mesh>
      <mesh position={[0, 1.22, 0.3]}>
        <boxGeometry args={[1.62, 0.55, 2.1]} />
        <meshStandardMaterial color="#1f2937" metalness={0.5} roughness={0.2} />
      </mesh>
      {[
        [-0.9, -1.35],
        [0.9, -1.35],
        [-0.9, 1.35],
        [0.9, 1.35],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.33, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.33, 0.33, 0.24, 16]} />
          <meshStandardMaterial color="#111" />
        </mesh>
      ))}
      {/* Fényszórók elöl (−Z) */}
      {[-0.6, 0.6].map((x) => (
        <mesh key={x} position={[x, 0.68, -2.11]}>
          <boxGeometry args={[0.35, 0.14, 0.02]} />
          <meshBasicMaterial color="#fffbe6" />
        </mesh>
      ))}
      {/* Irányjelzők: a modell bal oldala a −X (ha −Z felé néz) */}
      <mesh ref={left} position={[-0.86, 0.72, -2.12]} visible={false}>
        <boxGeometry args={[0.18, 0.12, 0.03]} />
        <meshBasicMaterial color="#f59e0b" toneMapped={false} />
      </mesh>
      <mesh ref={right} position={[0.86, 0.72, -2.12]} visible={false}>
        <boxGeometry args={[0.18, 0.12, 0.03]} />
        <meshBasicMaterial color="#f59e0b" toneMapped={false} />
      </mesh>
    </group>
  )
}

export function PartnerCar({ car, clock, blink }: { car: Car3D; clock: Clock; blink?: 'left' | 'right' }) {
  const ref = useRef<Group>(null)
  useFrame(() => {
    if (!ref.current) return
    const p = carPose(car, clock.progress())
    ref.current.position.set(p.x, 0, p.z)
    ref.current.rotation.set(0, p.rotY, 0)
  })
  const start = carPose(car, 0)
  return (
    <group ref={ref} position={[start.x, 0, start.z]} rotation={[0, start.rotY, 0]}>
      <CarModel color={car.color} blink={blink} />
    </group>
  )
}

export function Van({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.3, 0]}>
        <boxGeometry args={[2.1, 2.3, 5.6]} />
        <meshStandardMaterial color="#e5e7eb" />
      </mesh>
      <mesh position={[0, 1.75, -2.81]}>
        <boxGeometry args={[1.8, 0.8, 0.02]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
    </group>
  )
}

const PED_COLORS = ['#2563eb', '#db2777', '#059669', '#ea580c']

export function Pedestrian({ ped, clock, index }: { ped: Ped3D; clock: Clock; index: number }) {
  const ref = useRef<Group>(null)
  const color = PED_COLORS[index % PED_COLORS.length]
  useFrame(({ clock: c }) => {
    if (!ref.current) return
    let f = 0
    if (ped.state === 'crossing') {
      // Közeledés alatt az út 40%-áig jut, utána lassan halad tovább
      f = Math.min(1, 0.4 * easeOut(clock.progress()) + clock.sinceStop() * 0.06)
    }
    const x = ped.from[0] + (ped.to[0] - ped.from[0]) * f
    const z = ped.from[1] + (ped.to[1] - ped.from[1]) * f
    const walking = ped.state === 'crossing' && f < 1
    const bob = walking ? Math.abs(Math.sin(c.elapsedTime * 6)) * 0.05 : Math.sin(c.elapsedTime * 1.5) * 0.01
    ref.current.position.set(x, bob + (ped.state === 'waiting' ? 0.15 : 0), z)
  })
  return (
    <group ref={ref} position={[ped.from[0], 0, ped.from[1]]} rotation={[0, ped.rotY, 0]}>
      <mesh position={[0, 0.95, 0]}>
        <capsuleGeometry args={[0.22, 0.85, 4, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 1.62, 0]}>
        <sphereGeometry args={[0.14, 16, 12]} />
        <meshStandardMaterial color="#f1c7a4" />
      </mesh>
    </group>
  )
}

// ---------------------------------------------------------------- saját autó és kamera

export function DriverCamera({ layout, clock }: { layout: Layout3D; clock: Clock }) {
  const { x, y, startZ, stopZ } = layout.camera
  useFrame(({ camera }) => {
    const t = clock.progress()
    const z = startZ + (stopZ - startZ) * easeOut(t)
    camera.position.set(x, y, z)
    // Megállás után a vezető a partner (vagy a kanyarodás) irányába fordítja a fejét
    const yaw = layout.lookYaw * easeOut(clock.sinceStop() / 0.9)
    camera.lookAt(x - Math.sin(yaw) * 30, 1.05, z - Math.cos(yaw) * 30)
  })
  return null
}
