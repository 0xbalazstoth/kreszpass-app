import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import { PerspectiveCamera, Vector3, type Group, type Mesh, type MeshBasicMaterial } from 'three'
import { easeOut, propPose, type Prop3D } from './layout'
import { PED_LOOKS } from './looks'
import { CarModel, HumanFigure, Van, type Clock } from './parts'

/**
 * További szereplők és tárgyak a 3D jelenetben: villamos, autóbusz, vonat, traktor, kerékpáros, gyerek, labda,
 * terelőkúp, munkaterület, parkoló autó nyíló ajtóval, mentőautó. A modellek a −Z felé néznek (mint a saját autónk).
 * Táblát itt nem rajzolunk: a táblák mindig a valódi képek (SignPost).
 */

export function Props({ list, clock }: { list: Prop3D[]; clock: Clock }) {
  return (
    <group>
      {list.map((p, i) => (
        <PropView key={i} prop={p} clock={clock} />
      ))}
    </group>
  )
}

function PropView({ prop, clock }: { prop: Prop3D; clock: Clock }) {
  const ref = useRef<Group>(null)
  useFrame(() => {
    if (!ref.current || !prop.move) return
    const [x, z] = propPose(prop, clock.progress(), clock.elapsed(), clock.sinceStop())
    ref.current.position.set(x, 0, z)
  })
  return (
    <group ref={ref} position={[prop.at[0], 0, prop.at[1]]} rotation={[0, prop.rotY, 0]}>
      <PropModel prop={prop} clock={clock} />
    </group>
  )
}

function PropModel({ prop, clock }: { prop: Prop3D; clock: Clock }) {
  switch (prop.kind) {
    case 'van':
      return <Van x={0} z={0} />
    case 'ambulance':
      return <Van x={0} z={0} ambulance />
    case 'car':
      return <ParkedCar color={prop.color ?? '#9ca3af'} open={!!prop.open} clock={clock} />
    case 'cone':
      return <Cone />
    case 'barrier':
      return <WorksBarrier width={prop.size?.[0] ?? 3} />
    case 'dirt':
      return <Dirt size={prop.size ?? [2, 6]} />
    case 'ball':
      return <Ball prop={prop} clock={clock} />
    case 'child':
      return <Walker prop={prop} clock={clock} scale={0.66} look={1} />
    case 'cyclist':
      return <Cyclist />
    case 'tram':
      return <Tram length={prop.size?.[1] ?? 30} open={!!prop.open} />
    case 'bus':
      return <Bus open={!!prop.open} blink={prop.blink === 'left' ? 'left' : undefined} />
    case 'train':
      return <Train />
    case 'tractor':
      return <Tractor />
    case 'island':
      return <Island size={prop.size ?? [2, 30]} />
    case 'tram_track':
      return <TramTrack length={prop.size?.[1] ?? 140} />
  }
}

// ---------------------------------------------------------------- közúti tárgyak

function Cone() {
  return (
    <group>
      <mesh position={[0, 0.03, 0]}>
        <boxGeometry args={[0.4, 0.05, 0.4]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <mesh position={[0, 0.38, 0]}>
        <coneGeometry args={[0.16, 0.7, 16]} />
        <meshStandardMaterial color="#f97316" />
      </mesh>
      <mesh position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.085, 0.11, 0.12, 16]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
    </group>
  )
}

/** Piros-fehér csíkos terelőkorlát két lábon */
function WorksBarrier({ width }: { width: number }) {
  const n = 6
  return (
    <group>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * width) / 2, 0.5, 0]}>
          <boxGeometry args={[0.08, 1.0, 0.08]} />
          <meshStandardMaterial color="#374151" />
        </mesh>
      ))}
      {Array.from({ length: n }, (_, i) => (
        <mesh key={i} position={[-width / 2 + ((i + 0.5) * width) / n, 0.85, 0]}>
          <boxGeometry args={[width / n, 0.25, 0.05]} />
          <meshStandardMaterial color={i % 2 ? '#f8fafc' : '#dc2626'} />
        </mesh>
      ))}
    </group>
  )
}

/** Munkaterület: földkupac a felbontott burkolaton */
function Dirt({ size }: { size: [number, number] }) {
  return (
    <group>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[size[0], size[1]]} />
        <meshStandardMaterial color="#6b5a45" />
      </mesh>
      <mesh position={[0, 0.25, -1]} scale={[size[0] * 0.4, 0.5, size[1] * 0.25]}>
        <sphereGeometry args={[1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#7c6247" />
      </mesh>
    </group>
  )
}

function Ball({ prop, clock }: { prop: Prop3D; clock: Clock }) {
  const ref = useRef<Mesh>(null)
  useFrame(() => {
    if (!ref.current) return
    // Gördülés: a megtett út / sugár
    const [x, z] = propPose(prop, clock.progress(), clock.elapsed(), clock.sinceStop())
    const dist = Math.hypot(x - prop.at[0], z - prop.at[1])
    ref.current.rotation.z = dist / 0.12
  })
  return (
    <mesh ref={ref} position={[0, 0.12, 0]}>
      <sphereGeometry args={[0.12, 16, 12]} />
      <meshStandardMaterial color="#ef4444" />
    </mesh>
  )
}

/** Mozgó gyalogos (pl. a labda után szaladó gyerek): lépked, amíg halad */
function Walker({ prop, clock, scale, look }: { prop: Prop3D; clock: Clock; scale: number; look: number }) {
  const legL = useRef<Group>(null)
  const legR = useRef<Group>(null)
  const armL = useRef<Group>(null)
  const armR = useRef<Group>(null)
  const last = useRef<[number, number]>(prop.at)
  useFrame(({ clock: c }) => {
    const p = propPose(prop, clock.progress(), clock.elapsed(), clock.sinceStop())
    const moving = Math.hypot(p[0] - last.current[0], p[1] - last.current[1]) > 1e-4
    last.current = p
    const swing = moving ? Math.sin(c.elapsedTime * 9) : 0
    if (legL.current) legL.current.rotation.x = swing * 0.6
    if (legR.current) legR.current.rotation.x = -swing * 0.6
    if (armL.current) armL.current.rotation.x = -swing * 0.5
    if (armR.current) armR.current.rotation.x = swing * 0.5
  })
  return (
    <group scale={scale}>
      <HumanFigure look={PED_LOOKS[look % PED_LOOKS.length]} limbs={{ legL, legR, armL, armR }} />
    </group>
  )
}

/** Parkoló autó; nyitott ajtóval a vezetőoldali (bal, −X) ajtó a közeledés második felében kinyílik */
function ParkedCar({ color, open, clock }: { color: string; open: boolean; clock: Clock }) {
  const door = useRef<Group>(null)
  useFrame(() => {
    if (!door.current) return
    const f = open ? easeOut(Math.min(1, Math.max(0, (clock.progress() - 0.5) / 0.35))) : 0
    // Negatív forgatás: a zsanér körül a −X (az úttest) felé nyílik
    door.current.rotation.y = -f * 1.0
  })
  return (
    <group>
      <CarModel color={color} />
      {/* Az ajtó elöl, a szélvédő mögött zsanérozva; nyitva a −X felé (az úttest felé) fordul ki */}
      <group ref={door} position={[-0.91, 0, -0.95]}>
        <mesh position={[0, 0.75, 0.55]}>
          <boxGeometry args={[0.06, 0.9, 1.1]} />
          <meshStandardMaterial color={color} metalness={0.3} roughness={0.45} />
        </mesh>
        <mesh position={[-0.01, 1.13, 0.55]}>
          <boxGeometry args={[0.065, 0.3, 0.9]} />
          <meshStandardMaterial color="#1f2937" metalness={0.5} roughness={0.2} />
        </mesh>
      </group>
      {open && <SittingDriver />}
    </group>
  )
}

/** Kiszállni készülő vezető a nyitott ajtó mögött */
function SittingDriver() {
  const legL = useRef<Group>(null)
  const legR = useRef<Group>(null)
  const armL = useRef<Group>(null)
  const armR = useRef<Group>(null)
  return (
    <group position={[-0.5, 0.25, -0.2]} rotation={[0, -Math.PI / 2, 0]} scale={0.9}>
      <HumanFigure look={PED_LOOKS[3]} limbs={{ legL, legR, armL, armR }} />
    </group>
  )
}

function Wheel({ x, z, r = 0.34, w = 0.24 }: { x: number; z: number; r?: number; w?: number }) {
  return (
    <mesh position={[x, r, z]} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[r, r, w, 18]} />
      <meshStandardMaterial color="#111" />
    </mesh>
  )
}

// ---------------------------------------------------------------- kerékpáros

function Cyclist() {
  const legL = useRef<Group>(null)
  const legR = useRef<Group>(null)
  const armL = useRef<Group>(null)
  const armR = useRef<Group>(null)
  useFrame(({ clock }) => {
    // Pedálozás: a lábak ellentétesen forognak, a karok a kormányon
    const t = clock.elapsedTime * 5
    if (legL.current) legL.current.rotation.x = -0.9 + Math.sin(t) * 0.5
    if (legR.current) legR.current.rotation.x = -0.9 - Math.sin(t) * 0.5
    if (armL.current) armL.current.rotation.x = -1.0
    if (armR.current) armR.current.rotation.x = -1.0
  })
  const wheel = (z: number) => (
    <mesh position={[0, 0.34, z]} rotation={[0, Math.PI / 2, 0]}>
      <torusGeometry args={[0.32, 0.03, 8, 28]} />
      <meshStandardMaterial color="#111827" />
    </mesh>
  )
  return (
    <group>
      {wheel(-0.55)}
      {wheel(0.55)}
      {/* Váz, nyereg, kormány */}
      <mesh position={[0, 0.55, 0]} rotation={[0.35, 0, 0]}>
        <boxGeometry args={[0.05, 0.05, 1.05]} />
        <meshStandardMaterial color="#0e7490" />
      </mesh>
      <mesh position={[0, 0.7, 0.2]}>
        <boxGeometry args={[0.05, 0.4, 0.05]} />
        <meshStandardMaterial color="#0e7490" />
      </mesh>
      <mesh position={[0, 0.92, 0.22]}>
        <boxGeometry args={[0.14, 0.05, 0.26]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      <mesh position={[0, 1.02, -0.45]}>
        <boxGeometry args={[0.55, 0.04, 0.04]} />
        <meshStandardMaterial color="#374151" />
      </mesh>
      {/* Hátsó piros lámpa */}
      <mesh position={[0, 0.8, 0.5]}>
        <boxGeometry args={[0.08, 0.06, 0.02]} />
        <meshBasicMaterial color="#ef4444" toneMapped={false} />
      </mesh>
      {/* A lovas: előredőlve ül a nyergen */}
      <group position={[0, 0.05, 0.25]} rotation={[-0.35, 0, 0]}>
        <HumanFigure look={PED_LOOKS[2]} limbs={{ legL, legR, armL, armR }} />
      </group>
    </group>
  )
}

// ---------------------------------------------------------------- villamos, autóbusz

const TRAM_YELLOW = '#f5c400'

/** Budapesti sárga villamos: csuklós kocsiszekrény, ablaksor, jobb oldali ajtók, áramszedő */
function Tram({ length, open }: { length: number; open: boolean }) {
  const w = 2.4
  const segments = 4
  const seg = length / segments
  const doorZs = Array.from({ length: segments }, (_, i) => -length / 2 + (i + 0.5) * seg)
  return (
    <group>
      {Array.from({ length: segments }, (_, i) => {
        const z = -length / 2 + (i + 0.5) * seg
        return (
          <group key={i} position={[0, 0, z]}>
            <mesh position={[0, 1.85, 0]}>
              <boxGeometry args={[w, 2.9, seg - 0.35]} />
              <meshStandardMaterial color={TRAM_YELLOW} roughness={0.5} />
            </mesh>
            <mesh position={[0, 0.45, 0]}>
              <boxGeometry args={[w - 0.05, 0.5, seg - 0.35]} />
              <meshStandardMaterial color="#374151" />
            </mesh>
            {/* Ablaksor mindkét oldalon */}
            {[-1, 1].map((s) => (
              <mesh key={s} position={[(s * w) / 2 + s * 0.006, 2.25, 0]}>
                <boxGeometry args={[0.01, 1.0, seg - 1.2]} />
                <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.2} />
              </mesh>
            ))}
            {/* Csuklórész a következő kocsiszekrény felé (a hátsó végén nincs) */}
            {i < segments - 1 && (
              <mesh position={[0, 1.8, seg / 2]}>
                <boxGeometry args={[w - 0.25, 2.6, 0.36]} />
                <meshStandardMaterial color="#1f2937" />
              </mesh>
            )}
          </group>
        )
      })}
      {/* Jobb oldali (+X) ajtók: nyitva sötét nyílás */}
      {doorZs.map((z) => (
        <mesh key={z} position={[w / 2 + 0.012, 1.45, z]}>
          <boxGeometry args={[0.01, 2.1, 1.3]} />
          <meshStandardMaterial color={open ? '#0b0f14' : '#d4a900'} />
        </mesh>
      ))}
      {/* Hátfal a vezető felé: nagy ablak, lámpák */}
      <mesh position={[0, 2.3, length / 2 + 0.01]}>
        <boxGeometry args={[w - 0.4, 1.1, 0.02]} />
        <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.2} />
      </mesh>
      {[-0.85, 0.85].map((x) => (
        <mesh key={x} position={[x, 0.95, length / 2 + 0.01]}>
          <boxGeometry args={[0.25, 0.18, 0.02]} />
          <meshBasicMaterial color="#dc2626" toneMapped={false} />
        </mesh>
      ))}
      {/* Áramszedő és felsővezeték */}
      <mesh position={[0, 3.45, -seg / 2]}>
        <boxGeometry args={[1.2, 0.08, 0.6]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      <mesh position={[0, 4.1, -seg / 2]} rotation={[0.9, 0, 0]}>
        <boxGeometry args={[0.06, 1.3, 0.06]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      <mesh position={[0, 4.6, 0]}>
        <boxGeometry args={[0.03, 0.03, 160]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
    </group>
  )
}

/** A burkolatba süllyesztett villamossín (két sínpár vonal) */
function TramTrack({ length }: { length: number }) {
  return (
    <group>
      <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.1, length]} />
        <meshStandardMaterial color="#535b66" />
      </mesh>
      {[-0.72, 0.72].map((x) => (
        <mesh key={x} position={[x, 0.012, 0]}>
          <boxGeometry args={[0.08, 0.01, length]} />
          <meshStandardMaterial color="#a8adb4" metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
    </group>
  )
}

/** Járdasziget: kiemelt peron szegéllyel */
function Island({ size }: { size: [number, number] }) {
  return (
    <group>
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[size[0], 0.2, size[1]]} />
        <meshStandardMaterial color="#b8bec7" />
      </mesh>
      {/* Korlát a villamos felőli oldalon */}
      <mesh position={[-size[0] / 2 + 0.1, 0.75, 0]}>
        <boxGeometry args={[0.05, 0.05, size[1] - 2]} />
        <meshStandardMaterial color="#6b7280" />
      </mesh>
    </group>
  )
}

/** Kék BKV-autóbusz; hátulról látjuk: lámpák, bal oldali irányjelzők, jobb oldali ajtók */
function Bus({ open, blink }: { open: boolean; blink?: 'left' }) {
  const len = 12
  const w = 2.55
  const blinkers = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (blinkers.current) blinkers.current.visible = !!blink && Math.floor(clock.elapsedTime * 2.5) % 2 === 0
  })
  return (
    <group>
      <mesh position={[0, 1.75, 0]}>
        <boxGeometry args={[w, 2.8, len]} />
        <meshStandardMaterial color="#1d4ed8" roughness={0.5} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * w) / 2 + s * 0.006, 2.15, 0]}>
          <boxGeometry args={[0.01, 1.1, len - 1.4]} />
          <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.2} />
        </mesh>
      ))}
      {[-4, 0.5].map((z) => (
        <mesh key={z} position={[w / 2 + 0.012, 1.4, z]}>
          <boxGeometry args={[0.01, 2.2, 1.3]} />
          <meshStandardMaterial color={open ? '#0b0f14' : '#2f5fe0'} />
        </mesh>
      ))}
      <Wheel x={-1.05} z={-3.8} r={0.5} w={0.3} />
      <Wheel x={1.05} z={-3.8} r={0.5} w={0.3} />
      <Wheel x={-1.05} z={3.4} r={0.5} w={0.3} />
      <Wheel x={1.05} z={3.4} r={0.5} w={0.3} />
      {/* Hátfal: ablak, féklámpák */}
      <mesh position={[0, 2.4, len / 2 + 0.01]}>
        <boxGeometry args={[w - 0.5, 0.8, 0.02]} />
        <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.2} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={`r${s}`} position={[s * 1.05, 1.0, len / 2 + 0.01]}>
          <boxGeometry args={[0.22, 0.4, 0.02]} />
          <meshBasicMaterial color="#dc2626" toneMapped={false} />
        </mesh>
      ))}
      <group ref={blinkers} visible={false}>
        <mesh position={[-1.05, 1.35, len / 2 + 0.015]}>
          <boxGeometry args={[0.22, 0.2, 0.02]} />
          <meshBasicMaterial color="#f59e0b" toneMapped={false} />
        </mesh>
        <mesh position={[-w / 2 - 0.01, 1.1, -len / 2 + 0.6]}>
          <boxGeometry args={[0.02, 0.15, 0.3]} />
          <meshBasicMaterial color="#f59e0b" toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

// ---------------------------------------------------------------- vasút, mezőgazdasági jármű

function Train() {
  const car = (z: number, len: number, loco: boolean) => (
    <group key={z} position={[0, 0, z]}>
      <mesh position={[0, 2.1, 0]}>
        <boxGeometry args={[2.9, 3.2, len]} />
        <meshStandardMaterial color={loco ? '#1e3a8a' : '#2f4f8f'} roughness={0.5} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 1.455, 2.5, 0]}>
          <boxGeometry args={[0.01, 0.9, len - 2]} />
          <meshStandardMaterial color={loco ? '#dbeafe' : '#1e293b'} metalness={0.4} roughness={0.3} />
        </mesh>
      ))}
      <mesh position={[0, 0.45, 0]}>
        <boxGeometry args={[2.4, 0.5, len - 1]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
    </group>
  )
  return (
    <group>
      {car(0, 17, true)}
      {car(18.5, 19, false)}
      {car(38.5, 19, false)}
      {/* A mozdony eleje: szélvédő, fényszórók */}
      <mesh position={[0, 2.8, -8.51]}>
        <boxGeometry args={[2.3, 0.9, 0.02]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
      {[-0.9, 0.9, 0].map((x, i) => (
        <mesh key={x} position={[x, i === 2 ? 3.5 : 1.3, -8.52]}>
          <circleGeometry args={[0.14, 16]} />
          <meshBasicMaterial color="#fffbe6" toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

function Tractor() {
  const beacon = useRef<MeshBasicMaterial>(null)
  useFrame(({ clock }) => beacon.current?.color.set(Math.floor(clock.elapsedTime * 3) % 2 ? '#f59e0b' : '#5a3a06'))
  return (
    <group>
      <mesh position={[0, 1.0, -0.6]}>
        <boxGeometry args={[1.2, 0.9, 2.2]} />
        <meshStandardMaterial color="#15803d" />
      </mesh>
      <mesh position={[0, 2.0, 0.6]}>
        <boxGeometry args={[1.5, 1.3, 1.3]} />
        <meshStandardMaterial color="#1e293b" metalness={0.4} roughness={0.25} transparent opacity={0.85} />
      </mesh>
      <mesh position={[0, 2.7, 0.6]}>
        <boxGeometry args={[1.6, 0.1, 1.4]} />
        <meshStandardMaterial color="#15803d" />
      </mesh>
      <mesh position={[0, 2.85, 0.6]}>
        <cylinderGeometry args={[0.1, 0.1, 0.2, 12]} />
        <meshBasicMaterial ref={beacon} color="#f59e0b" toneMapped={false} />
      </mesh>
      <Wheel x={-0.95} z={0.8} r={0.78} w={0.45} />
      <Wheel x={0.95} z={0.8} r={0.78} w={0.45} />
      <Wheel x={-0.75} z={-1.4} r={0.42} w={0.3} />
      <Wheel x={0.75} z={-1.4} r={0.42} w={0.3} />
    </group>
  )
}

// ---------------------------------------------------------------- visszapillantó tükör, sziréna

/**
 * Belső visszapillantó tükör: a jelenet hátrafelé nézve, a kép felső közepén.
 * A saját renderelés miatt a fő képet is ez rajzolja ki (useFrame 1-es prioritással).
 * A képet nem tükrözzük: a vetítés megfordítása a lapok körüljárását is megfordítaná (kifordult modellek).
 */
const SCRATCH = new Vector3()

export function RearMirror() {
  const { gl, scene, camera, size } = useThree()
  const mirrorRef = useRef<PerspectiveCamera | null>(null)
  useFrame(() => {
    mirrorRef.current ??= new PerspectiveCamera(42, 3.4, 0.1, 250)
    const mirrorCam = mirrorRef.current
    gl.setScissorTest(false)
    gl.setViewport(0, 0, size.width, size.height)
    gl.render(scene, camera)
    const w = Math.round(size.width * 0.3)
    const h = Math.round(w / 3.4)
    const x = Math.round((size.width - w) / 2)
    const y = size.height - h - 10
    const dir = camera.getWorldDirection(SCRATCH)
    mirrorCam.position.copy(camera.position)
    mirrorCam.position.y += 0.1
    mirrorCam.lookAt(camera.position.x - dir.x * 30, 1.2, camera.position.z - dir.z * 30)
    mirrorCam.aspect = w / h
    mirrorCam.updateProjectionMatrix()
    // A kivágáson belül a render törli a képet (égbolt) és a mélységet
    gl.setScissorTest(true)
    gl.setScissor(x, y, w, h)
    gl.setViewport(x, y, w, h)
    gl.render(scene, mirrorCam)
    gl.setScissorTest(false)
    gl.setViewport(0, 0, size.width, size.height)
  }, 1)
  return null
}
