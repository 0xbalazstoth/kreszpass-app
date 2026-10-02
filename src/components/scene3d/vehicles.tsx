import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ExtrudeGeometry, MeshStandardMaterial, Shape, type BufferGeometry, type Mesh, type Object3D } from 'three'
import { carPaint, windowGlass, type CarShapeKind } from './materials'
import { loadGltf } from './models'

/**
 * Valósághű arányú személyautó (kb. 4,4 × 1,78 m, tengelytáv 2,65 m): oldalnézeti profilból kihúzott, lekerekített
 * karosszéria kerékívekkel, üvegezett utastér, tetőoszlopok, kerekek felnivel, lámpák, rendszámtábla, tükrök.
 * A modell a −Z felé néz, az origó a kocsi közepe: a hátsó tengely z = +1,35, az első z = −1,30 (mint a manőverek
 * geometriájában). A geometria egyszer készül, minden autó ugyanazt használja.
 */

const LEN = 4.4
const WIDTH = 1.78
const REAR_AXLE_S = 0.85
const FRONT_AXLE_S = 3.5
const WHEEL_R = 0.32
const ARCH_R = 0.39
/** Az oldalnézeti s koordináta (hátulról előre) → modell z */
const zOf = (s: number) => LEN / 2 - s


function lowerBody(): Shape {
  const sh = new Shape()
  sh.moveTo(0.03, 0.36)
  sh.lineTo(0.0, 0.62)
  sh.quadraticCurveTo(0.02, 0.88, 0.14, 0.93)
  sh.lineTo(0.62, 0.97)
  sh.lineTo(2.98, 0.99)
  // Motorháztető lejt előre, lekerekített orr
  sh.quadraticCurveTo(3.9, 0.93, 4.28, 0.84)
  sh.quadraticCurveTo(4.42, 0.8, 4.4, 0.6)
  sh.lineTo(4.36, 0.34)
  sh.lineTo(FRONT_AXLE_S + ARCH_R + 0.05, 0.3)
  // Első kerékív (a profil alsó élébe vágva)
  sh.absarc(FRONT_AXLE_S, WHEEL_R, ARCH_R, 0, Math.PI, false)
  sh.lineTo(REAR_AXLE_S + ARCH_R + 0.02, 0.3)
  sh.absarc(REAR_AXLE_S, WHEEL_R, ARCH_R, 0, Math.PI, false)
  sh.lineTo(0.03, 0.36)
  return sh
}

function cabin(kind: CarShapeKind): Shape {
  const sh = new Shape()
  if (kind === 'sedan') {
    sh.moveTo(0.62, 0.97)
    sh.quadraticCurveTo(1.0, 1.36, 1.35, 1.43)
  } else {
    // Ferdehátú: a hátsó ablak meredekebb, a tető tovább tart
    sh.moveTo(0.16, 0.95)
    sh.quadraticCurveTo(0.3, 1.38, 0.7, 1.44)
  }
  sh.lineTo(2.55, 1.45)
  sh.quadraticCurveTo(2.75, 1.42, 2.98, 0.99)
  sh.lineTo(kind === 'sedan' ? 0.62 : 0.16, kind === 'sedan' ? 0.97 : 0.95)
  return sh
}

function extrude(shape: Shape, depth: number, bevel: number): BufferGeometry {
  const g = new ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 14 })
  // Profil: x = s (hátulról előre), y = magasság, kihúzás a z mentén → elforgatva: kihúzás az x, az s a −z mentén
  g.rotateY(Math.PI / 2)
  g.translate(-depth / 2, 0, LEN / 2)
  g.computeVertexNormals()
  return g
}

const geometry = new Map<CarShapeKind, { body: BufferGeometry; glass: BufferGeometry }>()
function geometryOf(kind: CarShapeKind) {
  let g = geometry.get(kind)
  if (!g) {
    g = { body: extrude(lowerBody(), WIDTH - 0.1, 0.05), glass: extrude(cabin(kind), WIDTH - 0.3, 0.04) }
    geometry.set(kind, g)
  }
  return g
}

const tyre = new MeshStandardMaterial({ color: '#16171a', roughness: 0.92 })
const rim = new MeshStandardMaterial({ color: '#c3c7cc', roughness: 0.3, metalness: 0.9 })
const trim = new MeshStandardMaterial({ color: '#1b1d21', roughness: 0.6 })
const plate = new MeshStandardMaterial({ color: '#f4f4f0', roughness: 0.5 })
const plateBlue = new MeshStandardMaterial({ color: '#1d4ed8', roughness: 0.5 })
const head = new MeshStandardMaterial({ color: '#fffaf0', emissive: '#fff4d6', emissiveIntensity: 0.6, roughness: 0.1, metalness: 0.3 })
const tail = new MeshStandardMaterial({ color: '#8b0d0d', emissive: '#b91c1c', emissiveIntensity: 0.5, roughness: 0.2 })
const amberOn = new MeshStandardMaterial({ color: '#f59e0b', emissive: '#f59e0b', emissiveIntensity: 2.5, toneMapped: false })

function Wheel({ s, side }: { s: number; side: 1 | -1 }) {
  return (
    <group position={[side * 0.77, WHEEL_R, zOf(s)]} rotation={[0, 0, Math.PI / 2]}>
      <mesh castShadow material={tyre}>
        <cylinderGeometry args={[WHEEL_R, WHEEL_R, 0.21, 24]} />
      </mesh>
      <mesh position={[0, side * 0.106, 0]} material={rim}>
        <cylinderGeometry args={[0.21, 0.21, 0.01, 20]} />
      </mesh>
    </group>
  )
}

type Blink = 'left' | 'right' | 'hazard'

/** Egy irányjelző (borostyán fény): ha `active`, villog */
function Indicator({ x, y, z, active }: { x: number; y: number; z: number; active: boolean }) {
  const ref = useRef<Mesh>(null)
  useFrame(({ clock }) => {
    if (ref.current) ref.current.visible = active && Math.floor(clock.elapsedTime * 2.5) % 2 === 0
  })
  return (
    <mesh ref={ref} position={[x, y, z]} visible={false} material={amberOn}>
      <boxGeometry args={[0.14, 0.08, 0.05]} />
    </mesh>
  )
}

/** A Quaternius szedán (CC0) mérete és a mi kocsink hossza: a modell erre van méretezve */
const SEDAN_LENGTH = 4.22
const SEDAN_SCALE = LEN / SEDAN_LENGTH

/** A modell egy példánya: a karosszéria a kért színre fényezve, valósághű üveggel és lámpákkal */
function sedanInstance(src: Object3D, color: string): Object3D {
  const obj = src.clone(true)
  obj.traverse((o) => {
    const m = o as Mesh
    if (!m.isMesh) return
    m.castShadow = true
    m.receiveShadow = true
    const name = (Array.isArray(m.material) ? m.material[0] : m.material).name
    if (name === 'Blue') m.material = carPaint(color)
    else if (name === 'Windows') m.material = windowGlass()
    else if (name === 'Headlights') m.material = head
    else if (name === 'TailLights') m.material = tail
    else if (name === 'Grey') m.material = rim
    else if (name === 'Black') m.material = tyre
  })
  return obj
}

/**
 * Személyautó: a valósághű szedán-modell (Quaternius, CC0), a kért színre fényezve, saját villogó irányjelzőkkel.
 * Amíg a modell töltődik (vagy ha nem érhető el), a saját, egyszerűbb modell látszik.
 */
export function Car({ color, kind = 'sedan', blink }: { color: string; kind?: CarShapeKind; blink?: Blink }) {
  const [src, setSrc] = useState<Object3D | null>(null)
  useEffect(() => {
    let alive = true
    void loadGltf('car_sedan').then((m) => alive && m && setSrc(m.scene))
    return () => {
      alive = false
    }
  }, [])
  const obj = useMemo(() => (src ? sedanInstance(src, color) : null), [src, color])
  const leftOn = blink === 'left' || blink === 'hazard'
  const rightOn = blink === 'right' || blink === 'hazard'
  if (!obj) return <ProceduralCar color={color} kind={kind} blink={blink} />
  return (
    <group>
      {/* A modell a +Z felé néz: megfordítjuk, hogy a jelenet többi szereplőjéhez hasonlóan a −Z felé nézzen */}
      <group rotation={[0, Math.PI, 0]} scale={SEDAN_SCALE}>
        <primitive object={obj} />
      </group>
      <Indicator x={-0.82} y={0.55} z={-2.17} active={leftOn} />
      <Indicator x={-0.84} y={0.72} z={2.1} active={leftOn} />
      <Indicator x={0.82} y={0.55} z={-2.17} active={rightOn} />
      <Indicator x={0.84} y={0.72} z={2.1} active={rightOn} />
    </group>
  )
}

/** Saját, egyszerűbb személyautó-modell (a valósághű modell betöltéséig) */
function ProceduralCar({ color, kind = 'sedan', blink }: { color: string; kind?: CarShapeKind; blink?: Blink }) {
  const g = geometryOf(kind)
  const left = useRef<Mesh[]>([])
  const right = useRef<Mesh[]>([])
  useFrame(({ clock }) => {
    const on = Math.floor(clock.elapsedTime * 2.5) % 2 === 0
    for (const m of left.current) if (m) m.visible = (blink === 'left' || blink === 'hazard') && on
    for (const m of right.current) if (m) m.visible = (blink === 'right' || blink === 'hazard') && on
  })
  const paint = carPaint(color)
  const indicator = (x: number, s: number, list: typeof left, i: number) => (
    <mesh
      ref={(el) => {
        if (el) list.current[i] = el
      }}
      position={[x, 0.76, zOf(s)]}
      visible={false}
      material={amberOn}
    >
      <boxGeometry args={[0.14, 0.07, 0.05]} />
    </mesh>
  )
  return (
    <group>
      <mesh geometry={g.body} material={paint} castShadow receiveShadow />
      <mesh geometry={g.glass} material={windowGlass()} castShadow />
      {/* Tető és tetőoszlopok a karosszéria színében */}
      <mesh position={[0, 1.455, zOf(kind === 'sedan' ? 1.95 : 1.62)]} material={paint} castShadow>
        <boxGeometry args={[WIDTH - 0.32, 0.03, kind === 'sedan' ? 1.15 : 1.8]} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={`b${side}`} position={[side * (WIDTH / 2 - 0.16), 1.2, zOf(2.0)]} material={paint}>
          <boxGeometry args={[0.04, 0.48, 0.1]} />
        </mesh>
      ))}
      {/* Lökhárítók, küszöb */}
      <mesh position={[0, 0.42, zOf(4.39)]} material={trim}>
        <boxGeometry args={[WIDTH - 0.12, 0.12, 0.06]} />
      </mesh>
      <mesh position={[0, 0.42, zOf(0.02)]} material={trim}>
        <boxGeometry args={[WIDTH - 0.12, 0.12, 0.06]} />
      </mesh>
      {/* Lámpák */}
      {[-1, 1].map((side) => (
        <group key={`l${side}`}>
          <mesh position={[side * 0.6, 0.7, zOf(4.37)]} material={head}>
            <boxGeometry args={[0.36, 0.11, 0.05]} />
          </mesh>
          <mesh position={[side * 0.62, 0.82, zOf(0.04)]} material={tail}>
            <boxGeometry args={[0.32, 0.13, 0.04]} />
          </mesh>
          {/* Visszapillantó tükrök */}
          <mesh position={[side * (WIDTH / 2 + 0.07), 1.0, zOf(2.92)]} material={paint}>
            <boxGeometry args={[0.14, 0.11, 0.07]} />
          </mesh>
        </group>
      ))}
      {/* Rendszámtábla elöl és hátul (EU-csíkkal) */}
      {[4.41, -0.01].map((s) => (
        <group key={`p${s}`} position={[0, 0.5, zOf(s)]}>
          <mesh material={plate}>
            <boxGeometry args={[0.52, 0.11, 0.015]} />
          </mesh>
          <mesh position={[-0.235, 0, 0]} material={plateBlue}>
            <boxGeometry args={[0.05, 0.11, 0.02]} />
          </mesh>
        </group>
      ))}
      {indicator(-0.84, 4.3, left, 0)}
      {indicator(-0.84, 0.1, left, 1)}
      {indicator(0.84, 4.3, right, 0)}
      {indicator(0.84, 0.1, right, 1)}
      <Wheel s={REAR_AXLE_S} side={-1} />
      <Wheel s={REAR_AXLE_S} side={1} />
      <Wheel s={FRONT_AXLE_S} side={-1} />
      <Wheel s={FRONT_AXLE_S} side={1} />
    </group>
  )
}
