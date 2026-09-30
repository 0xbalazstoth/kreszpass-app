import { useFrame, useLoader } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, type Ref } from 'react'
import { CanvasTexture, RepeatWrapping, SRGBColorSpace, TextureLoader, type Group, type Mesh, type MeshBasicMaterial, type Texture } from 'three'
import { signUrl } from '../../data/signs'
import type { LightState } from '../../domain/questions'
import { carPose, easeOut, type Building, type Car3D, type Layout3D, type Light3D, type Ped3D, type Rail3D, type Rect, type SignPost3D } from './layout'

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

/** Egy ablaktengely szélessége és egy emelet magassága (m): ekkora a homlokzat-minta egy ismétlése */
const BAY_M = 3.5
const FLOOR_M = 3.2

/**
 * Homlokzat-minta (egy emelet, egy ablak), fehér alapon, így a ház színével szorozva színeződik.
 * Ablakok nélkül a közeli házfal egyetlen nagy, üres szürke téglalapnak látszott.
 */
let facadeCanvas: HTMLCanvasElement | null = null
function getFacadeCanvas(): HTMLCanvasElement {
  if (facadeCanvas) return facadeCanvas
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const g = c.getContext('2d')
  if (g) {
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, 64, 64)
    // Emeletek közti párkány
    g.fillStyle = '#d9d4cc'
    g.fillRect(0, 60, 64, 4)
    // Ablakkeret, üveg (felül világosabb tükröződés), könyöklő
    g.fillStyle = '#ece8e1'
    g.fillRect(17, 10, 30, 40)
    g.fillStyle = '#34414f'
    g.fillRect(20, 13, 24, 34)
    g.fillStyle = '#56687c'
    g.fillRect(20, 13, 24, 12)
    g.fillStyle = '#ece8e1'
    g.fillRect(31, 13, 2, 34)
    g.fillStyle = '#c9c3b9'
    g.fillRect(15, 50, 34, 3)
  }
  facadeCanvas = c
  return c
}

function facadeTexture(widthM: number, heightM: number): CanvasTexture {
  const t = new CanvasTexture(getFacadeCanvas())
  t.colorSpace = SRGBColorSpace
  t.wrapS = RepeatWrapping
  t.wrapT = RepeatWrapping
  t.anisotropy = 8
  t.repeat.set(Math.max(1, Math.round(widthM / BAY_M)), Math.max(1, Math.round(heightM / FLOOR_M)))
  return t
}

function BuildingBox({ b }: { b: Building }) {
  // Box oldalai: +X, −X, +Y, −Y, +Z, −Z. A ±X oldalak a Z irányú (d), a ±Z oldalak az X irányú (w) kiterjedésűek.
  const tex = useMemo(() => ({ alongZ: facadeTexture(b.d, b.h), alongX: facadeTexture(b.w, b.h) }), [b.d, b.w, b.h])
  useEffect(
    () => () => {
      tex.alongZ.dispose()
      tex.alongX.dispose()
    },
    [tex],
  )
  return (
    <mesh position={[b.x, b.h / 2, b.z]}>
      <boxGeometry args={[b.w, b.h, b.d]} />
      <meshStandardMaterial attach="material-0" color={b.color} map={tex.alongZ} />
      <meshStandardMaterial attach="material-1" color={b.color} map={tex.alongZ} />
      <meshStandardMaterial attach="material-2" color="#8a8f96" />
      <meshStandardMaterial attach="material-3" color={b.color} />
      <meshStandardMaterial attach="material-4" color={b.color} map={tex.alongX} />
      <meshStandardMaterial attach="material-5" color={b.color} map={tex.alongX} />
    </mesh>
  )
}

export function Buildings({ list }: { list: Building[] }) {
  return (
    <group>
      {list.map((b, i) => (
        <BuildingBox key={i} b={b} />
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

/** A magas, keskeny vasúti előjelző tábla (kb. 0,5 × 1,5 m) nagyobb méretet kap, hogy a csíkjai olvashatók legyenek */
const SIZE_SCALE: Record<string, number> = { 'A-045': 1.5 }

export function SignPost({ post }: { post: SignPost3D }) {
  const sizes = post.codes.map((c) => post.size * (SIZE_SCALE[c] ?? 1))
  const top = 2.2 + sizes.reduce((sum, h) => sum + h + 0.12, 0)
  // Felülről lefelé egymás alatt: a tábla középpontja a fölötte lévők magassága alatt
  const faces = post.codes.map((code, i) => ({
    code,
    size: sizes[i],
    y: top - sizes.slice(0, i).reduce((sum, h) => sum + h + 0.12, 0) - sizes[i] / 2,
  }))
  return (
    <group position={[post.x, 0, post.z]} rotation={[0, post.rotY, 0]}>
      <mesh position={[0, top / 2, 0]}>
        <cylinderGeometry args={[0.04, 0.04, top, 10]} />
        <meshStandardMaterial color="#9ca3af" metalness={0.4} roughness={0.5} />
      </mesh>
      <Suspense fallback={null}>
        {faces.map((f) => (
          <SignFace key={f.code} code={f.code} size={f.size} y={f.y} />
        ))}
      </Suspense>
    </group>
  )
}

// ---------------------------------------------------------------- vasúti átjáró

/** Sínpár talpfákkal, az úton keresztben */
export function RailTrack({ rail }: { rail: Rail3D }) {
  const sleepers = Array.from({ length: 40 }, (_, i) => -39 + i * 2)
  return (
    <group position={[0, 0, rail.z]}>
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[90, 3.2]} />
        <meshStandardMaterial color="#6b6358" />
      </mesh>
      {sleepers.map((x) => (
        <mesh key={x} position={[x, 0.03, 0]}>
          <boxGeometry args={[0.25, 0.05, 2.6]} />
          <meshStandardMaterial color="#4a3b2c" />
        </mesh>
      ))}
      {[-0.72, 0.72].map((z) => (
        <mesh key={z} position={[0, 0.09, z]}>
          <boxGeometry args={[90, 0.1, 0.08]} />
          <meshStandardMaterial color="#b8bcc2" metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
    </group>
  )
}

/** Fénysorompó: két váltakozva villogó piros és egy lassan villogó fehér lámpa */
export function RailLights({ rail }: { rail: Rail3D }) {
  const left = useRef<MeshBasicMaterial>(null)
  const right = useRef<MeshBasicMaterial>(null)
  const white = useRef<MeshBasicMaterial>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const alt = Math.floor(t * 1.8) % 2 === 0
    const slow = Math.floor(t * 0.9) % 2 === 0
    left.current?.color.set(rail.light === 'red_flash' && alt ? '#ef4444' : '#2a1414')
    right.current?.color.set(rail.light === 'red_flash' && !alt ? '#ef4444' : '#2a1414')
    white.current?.color.set(rail.light === 'white_flash' && slow ? '#f8fafc' : '#262626')
  })
  if (!rail.lightAt) return null
  const lamp = (x: number, y: number, ref: Ref<MeshBasicMaterial>) => (
    <mesh position={[x, y, 0.14]}>
      <circleGeometry args={[0.12, 24]} />
      <meshBasicMaterial ref={ref} color="#262626" toneMapped={false} />
    </mesh>
  )
  return (
    <group position={[rail.lightAt.x, 1.55, rail.lightAt.z + 0.1]}>
      <mesh>
        <boxGeometry args={[0.8, 0.34, 0.2]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      {lamp(-0.22, 0, left)}
      {lamp(0.22, 0, right)}
      <mesh position={[0, -0.34, 0]}>
        <boxGeometry args={[0.34, 0.34, 0.2]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      {lamp(0, -0.34, white)}
    </group>
  )
}

/** Félsorompó: piros-fehér csíkos rúd, lezárva vízszintesen a sávunk előtt */
export function RailBarrier({ rail }: { rail: Rail3D }) {
  const b = rail.barrier
  if (!b) return null
  const stripes = 6
  const seg = b.length / stripes
  return (
    <group position={[b.x, 1.0, b.z]}>
      <mesh position={[0.25, -0.5, 0]}>
        <boxGeometry args={[0.4, 1.0, 0.4]} />
        <meshStandardMaterial color="#e5e7eb" />
      </mesh>
      {/* Lezárva a −X felé, nyitva függőlegesen áll */}
      <group rotation={[0, 0, b.down ? 0 : -Math.PI / 2 + 0.08]}>
        {Array.from({ length: stripes }, (_, i) => (
          <mesh key={i} position={[-(i + 0.5) * seg, 0, 0]}>
            <boxGeometry args={[seg, 0.1, 0.1]} />
            <meshStandardMaterial color={i % 2 === 0 ? '#dc2626' : '#f9fafb'} />
          </mesh>
        ))}
      </group>
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

const VAN_BODY = '#f3f4f6'
const VAN_GLASS = '#1e293b'
const VAN_TRIM = '#1f2937'

/**
 * A zebra előtt a szomszéd sávban megállt, kilátást takaró furgon (kb. 2 × 2,5 × 5,6 m), a −Z felé néz.
 * A vezető hátulról látja: hátsó ajtók, ablakok, lámpák, rendszám, villogó vészjelző. Egyszerű dobozként
 * hátulról egyetlen üres szürke téglalapnak látszott.
 */
export function Van({ x, z }: { x: number; z: number }) {
  const hazards = useRef<Group>(null)
  useFrame(({ clock }) => {
    // Álló jármű: mindkét irányjelző egyszerre villog
    if (hazards.current) hazards.current.visible = Math.floor(clock.elapsedTime * 2.5) % 2 === 0
  })
  const rearZ = 2.8
  return (
    <group position={[x, 0, z]}>
      {/* Raktér és vezetőfülke, alul sötét alváz */}
      <mesh position={[0, 1.5, 0.8]}>
        <boxGeometry args={[2.0, 2.1, 4.0]} />
        <meshStandardMaterial color={VAN_BODY} roughness={0.5} metalness={0.2} />
      </mesh>
      <mesh position={[0, 1.22, -2.0]}>
        <boxGeometry args={[1.94, 1.55, 1.6]} />
        <meshStandardMaterial color={VAN_BODY} roughness={0.5} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[1.9, 0.3, 5.5]} />
        <meshStandardMaterial color={VAN_TRIM} />
      </mesh>
      {/* Kék csík az oldalakon */}
      {[-1, 1].map((s) => (
        <mesh key={`stripe${s}`} position={[s * 1.005, 1.25, 0.8]}>
          <boxGeometry args={[0.01, 0.28, 4.0]} />
          <meshStandardMaterial color="#1d4ed8" />
        </mesh>
      ))}
      {/* Fülke: szélvédő, oldalablakok, tükrök, fényszórók */}
      <mesh position={[0, 1.62, -2.805]}>
        <boxGeometry args={[1.75, 0.62, 0.02]} />
        <meshStandardMaterial color={VAN_GLASS} metalness={0.5} roughness={0.2} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={`cab${s}`}>
          <mesh position={[s * 0.975, 1.6, -2.05]}>
            <boxGeometry args={[0.01, 0.5, 1.1]} />
            <meshStandardMaterial color={VAN_GLASS} metalness={0.5} roughness={0.2} />
          </mesh>
          <mesh position={[s * 1.12, 1.55, -1.6]}>
            <boxGeometry args={[0.2, 0.28, 0.08]} />
            <meshStandardMaterial color={VAN_TRIM} />
          </mesh>
          <mesh position={[s * 0.7, 0.85, -2.81]}>
            <boxGeometry args={[0.32, 0.16, 0.02]} />
            <meshBasicMaterial color="#fffbe6" />
          </mesh>
        </group>
      ))}
      {/* Kerekek: gumi, világos felni a külső oldalon */}
      {[-1.9, 1.9].flatMap((wz) =>
        [-1, 1].map((s) => (
          <group key={`w${wz}${s}`} position={[s * 0.9, 0.36, wz]}>
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.36, 0.36, 0.26, 20]} />
              <meshStandardMaterial color="#111" />
            </mesh>
            <mesh position={[s * 0.135, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.2, 0.2, 0.01, 16]} />
              <meshStandardMaterial color="#9ca3af" metalness={0.6} roughness={0.3} />
            </mesh>
          </group>
        )),
      )}
      {/* Hátulja (a vezető felé): kétszárnyú ajtó, ablakok, kilincsek, lámpák, lökhárító, rendszám */}
      <mesh position={[0, 1.5, rearZ + 0.006]}>
        <boxGeometry args={[0.025, 1.9, 0.01]} />
        <meshStandardMaterial color={VAN_TRIM} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={`rear${s}`}>
          <mesh position={[s * 0.48, 2.1, rearZ + 0.006]}>
            <boxGeometry args={[0.7, 0.45, 0.01]} />
            <meshStandardMaterial color={VAN_GLASS} metalness={0.5} roughness={0.2} />
          </mesh>
          <mesh position={[s * 0.09, 1.35, rearZ + 0.02]}>
            <boxGeometry args={[0.05, 0.2, 0.04]} />
            <meshStandardMaterial color={VAN_TRIM} />
          </mesh>
          <mesh position={[s * 0.93, 1.05, rearZ + 0.01]}>
            <boxGeometry args={[0.13, 0.62, 0.02]} />
            <meshBasicMaterial color="#dc2626" toneMapped={false} />
          </mesh>
        </group>
      ))}
      <group ref={hazards}>
        {[-1, 1].map((s) => (
          <mesh key={`hz${s}`} position={[s * 0.93, 1.47, rearZ + 0.012]}>
            <boxGeometry args={[0.13, 0.16, 0.02]} />
            <meshBasicMaterial color="#f59e0b" toneMapped={false} />
          </mesh>
        ))}
      </group>
      <mesh position={[0, 0.45, rearZ + 0.08]}>
        <boxGeometry args={[2.04, 0.22, 0.16]} />
        <meshStandardMaterial color={VAN_TRIM} />
      </mesh>
      <mesh position={[0, 0.74, rearZ + 0.012]}>
        <boxGeometry args={[0.52, 0.12, 0.02]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      <mesh position={[-0.235, 0.74, rearZ + 0.024]}>
        <boxGeometry args={[0.05, 0.12, 0.01]} />
        <meshStandardMaterial color="#1d4ed8" />
      </mesh>
    </group>
  )
}

/** Gyalogosok megjelenése: felső ruha, nadrág, haj, bőrszín (sorszám szerint váltakozik) */
const PED_LOOKS = [
  { top: '#2563eb', legs: '#1f2937', hair: '#3b2a1e', skin: '#f1c7a4', shoes: '#111827' },
  { top: '#db2777', legs: '#334155', hair: '#a16207', skin: '#e8b48f', shoes: '#f5f5f4' },
  { top: '#059669', legs: '#44403c', hair: '#18181b', skin: '#c68a64', shoes: '#292524' },
  { top: '#ea580c', legs: '#1e3a8a', hair: '#57534e', skin: '#f3d2b5', shoes: '#111827' },
]

/**
 * Egyszerű, de emberi arányú gyalogos (kb. 1,72 m): fej hajjal, nyak, törzs, csípő, karok kézzel, lábak cipővel.
 * A modell a −Z felé néz (mint az autók); járás közben a karok és lábak ellentétesen lengenek.
 */
function HumanFigure({ look, limbs }: { look: (typeof PED_LOOKS)[number]; limbs: { legL: Ref<Group>; legR: Ref<Group>; armL: Ref<Group>; armR: Ref<Group> } }) {
  const leg = (x: number, ref: Ref<Group>) => (
    // Csípőből forgó láb: comb-lábszár egyben, alul cipő
    <group ref={ref} position={[x, 0.9, 0]}>
      <mesh position={[0, -0.42, 0]}>
        <capsuleGeometry args={[0.068, 0.7, 4, 10]} />
        <meshStandardMaterial color={look.legs} />
      </mesh>
      <mesh position={[0, -0.86, -0.05]}>
        <boxGeometry args={[0.11, 0.08, 0.26]} />
        <meshStandardMaterial color={look.shoes} />
      </mesh>
    </group>
  )
  const arm = (x: number, ref: Ref<Group>) => (
    // Vállból forgó kar, a végén kéz
    <group ref={ref} position={[x, 1.43, 0]}>
      <mesh position={[0, -0.27, 0]} rotation={[0, 0, x > 0 ? 0.06 : -0.06]}>
        <capsuleGeometry args={[0.05, 0.46, 4, 8]} />
        <meshStandardMaterial color={look.top} />
      </mesh>
      <mesh position={[x > 0 ? 0.02 : -0.02, -0.57, 0]}>
        <sphereGeometry args={[0.048, 10, 8]} />
        <meshStandardMaterial color={look.skin} />
      </mesh>
    </group>
  )
  return (
    <group>
      {leg(-0.1, limbs.legL)}
      {leg(0.1, limbs.legR)}
      {/* Csípő és törzs (a mellkas kissé lapos, nem henger) */}
      <mesh position={[0, 0.95, 0]}>
        <boxGeometry args={[0.32, 0.16, 0.2]} />
        <meshStandardMaterial color={look.legs} />
      </mesh>
      <mesh position={[0, 1.22, 0]} scale={[1, 1, 0.68]}>
        <capsuleGeometry args={[0.165, 0.34, 4, 12]} />
        <meshStandardMaterial color={look.top} />
      </mesh>
      {arm(-0.22, limbs.armL)}
      {arm(0.22, limbs.armR)}
      <mesh position={[0, 1.52, 0]}>
        <cylinderGeometry args={[0.045, 0.05, 0.1, 10]} />
        <meshStandardMaterial color={look.skin} />
      </mesh>
      {/* Fej: kissé tojásdad, orral előre (−Z), a haj felül és hátul */}
      <mesh position={[0, 1.64, 0]} scale={[0.88, 1.05, 0.95]}>
        <sphereGeometry args={[0.105, 18, 14]} />
        <meshStandardMaterial color={look.skin} />
      </mesh>
      <mesh position={[0, 1.63, -0.1]}>
        <sphereGeometry args={[0.018, 8, 6]} />
        <meshStandardMaterial color={look.skin} />
      </mesh>
      <mesh position={[0, 1.665, 0.012]} scale={[0.93, 1, 1]}>
        <sphereGeometry args={[0.112, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={look.hair} />
      </mesh>
      <mesh position={[0, 1.62, 0.035]} scale={[0.92, 0.75, 0.8]}>
        <sphereGeometry args={[0.105, 14, 10]} />
        <meshStandardMaterial color={look.hair} />
      </mesh>
    </group>
  )
}

export function Pedestrian({ ped, clock, index }: { ped: Ped3D; clock: Clock; index: number }) {
  const ref = useRef<Group>(null)
  const legL = useRef<Group>(null)
  const legR = useRef<Group>(null)
  const armL = useRef<Group>(null)
  const armR = useRef<Group>(null)
  const look = PED_LOOKS[index % PED_LOOKS.length]
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
    const t = c.elapsedTime
    // Lépésenként kétszer emelkedik a test; álló helyzetben alig észrevehetően mozog
    const swing = walking ? Math.sin(t * 6.5) : Math.sin(t * 1.3) * 0.04
    const bob = walking ? Math.abs(Math.cos(t * 6.5)) * 0.035 : 0
    ref.current.position.set(x, bob + (ped.state === 'waiting' ? 0.15 : 0), z)
    if (legL.current) legL.current.rotation.x = swing * 0.5
    if (legR.current) legR.current.rotation.x = -swing * 0.5
    if (armL.current) armL.current.rotation.x = -swing * 0.45
    if (armR.current) armR.current.rotation.x = swing * 0.45
  })
  return (
    <group ref={ref} position={[ped.from[0], 0, ped.from[1]]} rotation={[0, ped.rotY, 0]}>
      <HumanFigure look={look} limbs={{ legL, legR, armL, armR }} />
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
